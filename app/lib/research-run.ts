import type {
  EvidenceProposal,
  ExtractEvidenceResult,
  ResearchEvidenceResult,
} from "../desktop-bridge";
import {
  AiAssistanceError,
  applyEvidenceProposals,
  sourceContentSha256,
} from "./ai-assistance.ts";
import type { EvidenceArtifact, ReviewInput, ScoreOutput } from "./scoring";
import type { QuickRunPreview, QuickRunScoreCalculator } from "./quick-run";

export interface ApplyResearchEvidenceBatchInput {
  review: ReviewInput;
  result: ResearchEvidenceResult;
  /** One consolidated approval may include every grounded proposal or a strict subset. */
  selectedProposalIndexes: number[];
  expectedContextFingerprint: string;
  currentContextFingerprint: string;
}

export interface ApplyResearchEvidenceBatchResult {
  review: ReviewInput;
  previousReview: ReviewInput;
  artifacts: EvidenceArtifact[];
  linkedClaimIds: string[];
  appliedProposalIndexes: number[];
}

function cloneReview(review: ReviewInput): ReviewInput {
  return {
    ...review,
    claims: review.claims.map((claim) => ({
      ...claim,
      evidenceClaimIds: [...claim.evidenceClaimIds],
      evidenceArtifactIds: [...claim.evidenceArtifactIds],
      acknowledgedCounterEvidenceIds: [...claim.acknowledgedCounterEvidenceIds],
    })),
    artifacts: review.artifacts.map((artifact) => ({
      ...artifact,
      rubricClaimIds: [...artifact.rubricClaimIds],
      ...(artifact.ingestionOrigin ? { ingestionOrigin: { ...artifact.ingestionOrigin } } : {}),
    })),
    gates: review.gates.map((gate) => ({ ...gate })),
  };
}

function normalizedId(value: string) {
  return String(value ?? "").trim().toUpperCase();
}

function isIsoDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const parsed = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return parsed.getUTCFullYear() === Number(match[1])
    && parsed.getUTCMonth() === Number(match[2]) - 1
    && parsed.getUTCDate() === Number(match[3]);
}

function oneYearAfter(value: string) {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCFullYear(date.getUTCFullYear() + 1);
  return date.toISOString().slice(0, 10);
}

function safePublicCitationUrl(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || !url.hostname || value.length > 2_048) return false;
    const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
    if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) return false;
    if (/^(?:10\.|127\.|169\.254\.|192\.168\.)/.test(host)) return false;
    const private172 = /^172\.(\d{1,2})\./.exec(host);
    if (private172 && Number(private172[1]) >= 16 && Number(private172[1]) <= 31) return false;
    if (host === "::1" || host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe80:")) return false;
    return true;
  } catch {
    return false;
  }
}

function researchSemanticKey(
  sourceUrl: string,
  sourceExcerpt: string,
  direction: "supports" | "contradicts",
  claimIds: string[],
) {
  return [sourceUrl.trim(), sourceExcerpt.trim(), direction, [...claimIds].sort().join(",")].join("\n");
}

function assertSelection(indexes: number[], proposalCount: number) {
  if (!Array.isArray(indexes) || indexes.length === 0) {
    throw new AiAssistanceError("invalid_selection", "Select at least one grounded public finding.");
  }
  if (indexes.some((index) => !Number.isInteger(index) || index < 0 || index >= proposalCount)) {
    throw new AiAssistanceError("invalid_selection", "A selected public finding is no longer in this research packet.");
  }
  if (new Set(indexes).size !== indexes.length) {
    throw new AiAssistanceError("invalid_selection", "The public research selection contains duplicate findings.");
  }
}

/**
 * Atomically validates and applies provider-attributed public excerpts. The provider/model may
 * classify a finding, but this boundary forces every accepted record to DeskResearch/E1 and
 * never marks it human verified.
 */
export function applyResearchEvidenceBatch(
  input: ApplyResearchEvidenceBatchInput,
): ApplyResearchEvidenceBatchResult {
  if (input.expectedContextFingerprint !== input.currentContextFingerprint
    || !input.expectedContextFingerprint.trim()) {
    throw new AiAssistanceError(
      "stale_context",
      "This research packet is stale because the project changed. Run the research again.",
    );
  }
  if (!input.result || input.result.provider !== "openrouter" || input.result.researchEngine !== "exa"
    || input.result.provisional !== true) {
    throw new AiAssistanceError("invalid_proposal", "The public research packet has invalid provenance.");
  }
  if (!Array.isArray(input.result.citations) || input.result.citations.length === 0
    || input.result.citations.length > 20 || !Array.isArray(input.result.evidence)
    || input.result.evidence.length > 40) {
    throw new AiAssistanceError("invalid_proposal", "The public research packet is empty or exceeds its safety limits.");
  }
  assertSelection(input.selectedProposalIndexes, input.result.evidence.length);

  const researchedDate = String(input.result.researchedAt ?? "").slice(0, 10);
  if (!isIsoDate(researchedDate)) {
    throw new AiAssistanceError("invalid_proposal", "The public research packet has no valid retrieval date.");
  }
  const expiryDate = oneYearAfter(researchedDate);
  const citationById = new Map<string, ResearchEvidenceResult["citations"][number]>();
  for (const citation of input.result.citations) {
    const sourceId = normalizedId(citation.sourceId);
    if (!sourceId || citationById.has(sourceId)) {
      throw new AiAssistanceError("invalid_proposal", "The public research packet contains duplicate source IDs.");
    }
    if (!safePublicCitationUrl(citation.url) || !citation.content || citation.content.length > 100_000
      || sourceContentSha256(citation.content) !== citation.contentSha256) {
      throw new AiAssistanceError("invalid_source", `Public source ${citation.sourceId || "unknown"} failed provenance validation.`);
    }
    citationById.set(sourceId, citation);
  }

  const existingFindings = new Set(input.review.artifacts.flatMap((artifact) => {
    const sourceUrl = artifact.ingestionOrigin?.sourceUrl;
    const excerpt = artifact.sourceExcerpt;
    return sourceUrl && excerpt
      ? [researchSemanticKey(sourceUrl, excerpt, artifact.direction, artifact.rubricClaimIds)]
      : [];
  }));
  const appliedProposalIndexes: number[] = [];
  const selectedBySource = new Map<string, Array<{ proposalIndex: number; proposal: ResearchEvidenceResult["evidence"][number] }>>();
  for (const proposalIndex of input.selectedProposalIndexes) {
    const proposal = input.result.evidence[proposalIndex];
    const sourceId = normalizedId(proposal.sourceId);
    const citation = citationById.get(sourceId);
    if (!citation
      || proposal.sourceUrl !== citation.url
      || proposal.verificationStatus !== "provider_excerpt"
      || proposal.suggestedType !== "DeskResearch"
      || proposal.suggestedGrade !== "E1"
      || proposal.reviewerVerified !== false
      || !proposal.sourceExcerpt
      || !citation.content.includes(proposal.sourceExcerpt)) {
      throw new AiAssistanceError(
        "invalid_source",
        `Public finding ${proposalIndex + 1} is not grounded in its provider-returned citation excerpt.`,
      );
    }
    const semanticKey = researchSemanticKey(
      proposal.sourceUrl,
      proposal.sourceExcerpt,
      proposal.direction,
      proposal.claimIds,
    );
    if (existingFindings.has(semanticKey)) continue;
    appliedProposalIndexes.push(proposalIndex);
    const group = selectedBySource.get(sourceId) ?? [];
    group.push({ proposalIndex, proposal });
    selectedBySource.set(sourceId, group);
  }

  const previousReview = cloneReview(input.review);
  let review = cloneReview(input.review);
  const artifacts: EvidenceArtifact[] = [];
  const linkedClaimIds = new Set<string>();

  for (const [sourceId, selected] of selectedBySource) {
    const citation = citationById.get(sourceId)!;
    const evidence: EvidenceProposal[] = selected.map(({ proposal }) => ({
      title: proposal.title,
      sourceExcerpt: proposal.sourceExcerpt,
      claimIds: [...proposal.claimIds],
      suggestedType: "DeskResearch",
      suggestedGrade: "E1",
      direction: proposal.direction,
      verificationStatus: "source_supported",
      unverifiable: false,
      unverifiableReason: "",
      reasoning: proposal.reasoning,
      confidence: proposal.confidence,
      uncertainty: proposal.uncertainty,
      reviewerVerified: false,
    }));
    const draft: ExtractEvidenceResult = {
      evidence,
      sourceLabel: citation.url,
      provider: "openrouter",
      model: input.result.model,
      provisional: true,
    };
    const linkSupportingProposalIndexes = evidence.flatMap((proposal, index) =>
      proposal.direction === "supports" ? [index] : []);
    const applied = applyEvidenceProposals({
      review,
      draft,
      selectedProposalIndexes: evidence.map((_, index) => index),
      linkSupportingProposalIndexes,
      sourceText: citation.content,
      sourceLabel: citation.url,
      humanApproval: {
        reviewerVerified: false,
        reviewer: "",
        relationshipOrConflict: "",
        evidenceDate: researchedDate,
        expiryDate,
      },
      expectedContextFingerprint: input.expectedContextFingerprint,
      currentContextFingerprint: input.currentContextFingerprint,
    });
    for (const artifact of applied.artifacts) {
      artifact.ingestionOrigin = {
        kind: "ai-assisted",
        mode: "researched",
        provider: "openrouter",
        model: input.result.model,
        sourceUrl: citation.url,
        sourceTitle: citation.title,
        retrievedAt: input.result.researchedAt,
        searchProvider: "openrouter-exa",
      };
      artifacts.push(artifact);
    }
    for (const claimId of applied.linkedClaimIds) linkedClaimIds.add(claimId);
    review = applied.review;
  }

  return {
    review,
    previousReview,
    artifacts,
    linkedClaimIds: [...linkedClaimIds],
    appliedProposalIndexes,
  };
}

function previewStatus(score: ScoreOutput): QuickRunPreview["status"] {
  if (!score.official) return "preview_incomplete";
  return score.numericAndGateEligible ? "preview_ready" : "preview_not_ready";
}

export function addResearchToQuickRunPreview(
  preview: QuickRunPreview,
  result: ResearchEvidenceResult,
  selectedProposalIndexes: number[],
  calculateScore: QuickRunScoreCalculator,
) {
  const applied = applyResearchEvidenceBatch({
    review: preview.previewReview,
    result,
    selectedProposalIndexes,
    expectedContextFingerprint: preview.sourceInputFingerprint,
    currentContextFingerprint: preview.sourceInputFingerprint,
  });
  const previewScore = calculateScore(cloneReview(applied.review));
  return {
    preview: {
      ...preview,
      previewReview: applied.review,
      previewScore,
      status: previewStatus(previewScore),
    } satisfies QuickRunPreview,
    applied,
  };
}

/**
 * Completes the evidence and decision portion of an automated run without weakening
 * the evidence boundary. Every provider-grounded finding is attached atomically,
 * remains unverified DeskResearch/E1, and is then passed through the locked scorer.
 */
export function completeAutomatedResearchRun(
  preview: QuickRunPreview,
  result: ResearchEvidenceResult,
  calculateScore: QuickRunScoreCalculator,
) {
  const selectedProposalIndexes = result.evidence.map((_, index) => index);
  const completed = addResearchToQuickRunPreview(
    preview,
    result,
    selectedProposalIndexes,
    calculateScore,
  );
  return {
    ...completed,
    selectedProposalIndexes: completed.applied.appliedProposalIndexes,
  };
}
