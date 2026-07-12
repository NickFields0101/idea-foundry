import type { DraftEvaluationResult } from "../desktop-bridge";
import type {
  EvidenceArtifact,
  GateStatus,
  ProtocolRoute,
  ReviewInput,
  ScoreOutput,
} from "./scoring";

export type QuickRunIdeaRoute = "Xahau" | "Evernode" | "Both" | "Neither yet";
export type QuickRunSelectionSource = "existing-user-choice" | "automated-priority";
export type QuickRunPreviewStatus = "preview_ready" | "preview_not_ready" | "preview_incomplete";

export interface BuildQuickRunPreviewInput {
  baseReview: ReviewInput;
  draft: DraftEvaluationResult;
  selectedIdeaId: string;
  selectedBy: QuickRunSelectionSource;
  selectionPriority: number;
  ideaRoute: QuickRunIdeaRoute;
  sourceInputFingerprint: string;
  createdAt: string;
}

export interface QuickRunPreview {
  provenance: "ai-proposed-inputs";
  provisional: true;
  status: QuickRunPreviewStatus;
  selectedIdeaId: string;
  selectedBy: QuickRunSelectionSource;
  selectionPriority: number;
  provider: DraftEvaluationResult["provider"];
  model: string;
  createdAt: string;
  sourceInputFingerprint: string;
  protocolRouteFilled: boolean;
  filledClaimIds: string[];
  filledGateIds: ReviewInput["gates"][number]["id"][];
  missingClaimIds: string[];
  previewReview: ReviewInput;
  previewScore: ScoreOutput;
  proposals: DraftEvaluationResult;
}

export type QuickRunScoreCalculator = (review: ReviewInput) => ScoreOutput;

const PREVIEW_GATE_DECISIONS = new Set<GateStatus>([
  "pass",
  "fail",
]);

function cloneArtifact(artifact: EvidenceArtifact): EvidenceArtifact {
  return {
    ...artifact,
    rubricClaimIds: [...artifact.rubricClaimIds],
    ...(artifact.ingestionOrigin
      ? { ingestionOrigin: { ...artifact.ingestionOrigin } }
      : {}),
  };
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
    artifacts: review.artifacts.map(cloneArtifact),
    gates: review.gates.map((gate) => ({ ...gate })),
  };
}

function cloneDraft(draft: DraftEvaluationResult): DraftEvaluationResult {
  return {
    ...draft,
    claims: draft.claims.map((proposal) => ({ ...proposal })),
    gates: draft.gates.map((proposal) => ({ ...proposal })),
    provisional: true,
  };
}

function validSuggestedMerit(value: unknown): value is number {
  return typeof value === "number"
    && Number.isFinite(value)
    && value >= 0
    && value <= 5
    && Number.isInteger(value * 2);
}

function provisionalRoute(route: QuickRunIdeaRoute): ProtocolRoute {
  if (route === "Xahau") return "xahau_app_specific";
  if (route === "Evernode") return "evernode_baseline";
  if (route === "Both") return "hybrid";
  return "unresolved";
}

function previewStatus(score: ScoreOutput): QuickRunPreviewStatus {
  if (!score.official) return "preview_incomplete";
  return score.numericAndGateEligible ? "preview_ready" : "preview_not_ready";
}

/**
 * Materializes AI proposals into an isolated review used only for a deterministic preview.
 * The caller's live review and AI draft are never mutated. Existing human decisions always win,
 * and evidence/provenance fields are copied without being inferred, upgraded, or manufactured.
 */
export function buildQuickRunPreview(
  input: BuildQuickRunPreviewInput,
  calculateScore: QuickRunScoreCalculator,
): QuickRunPreview {
  const previewReview = cloneReview(input.baseReview);
  const knownClaimIds = new Set(previewReview.claims.map((claim) => claim.claimId));
  const knownGateIds = new Set(previewReview.gates.map((gate) => gate.id));
  const claimProposals = new Map<string, DraftEvaluationResult["claims"][number]>();
  const gateProposals = new Map<string, DraftEvaluationResult["gates"][number]>();

  for (const proposal of input.draft.claims) {
    if (!knownClaimIds.has(proposal.claimId) || claimProposals.has(proposal.claimId)) continue;
    claimProposals.set(proposal.claimId, proposal);
  }
  for (const proposal of input.draft.gates) {
    if (!knownGateIds.has(proposal.gateId) || gateProposals.has(proposal.gateId)) continue;
    gateProposals.set(proposal.gateId, proposal);
  }

  const filledClaimIds: string[] = [];
  previewReview.claims = previewReview.claims.map((claim) => {
    if (claim.merit !== null) return claim;
    const proposal = claimProposals.get(claim.claimId);
    if (!proposal || !validSuggestedMerit(proposal.suggestedMerit)) return claim;
    filledClaimIds.push(claim.claimId);
    const uncertainty = proposal.uncertainty.trim();
    const provenance = `AI-assisted input (${input.draft.provider}/${input.draft.model}; ${proposal.confidence} confidence): ${proposal.reasoning.trim() || "No reasoning supplied."}${uncertainty ? ` Uncertainty: ${uncertainty}` : ""}`;
    return {
      ...claim,
      merit: proposal.suggestedMerit,
      note: claim.note?.trim() ? `${claim.note.trim()}\n\n${provenance}` : provenance,
    };
  });

  const filledGateIds: QuickRunPreview["filledGateIds"] = [];
  previewReview.gates = previewReview.gates.map((gate) => {
    if (gate.status !== "unresolved") return gate;
    const proposal = gateProposals.get(gate.id);
    if (!proposal || !PREVIEW_GATE_DECISIONS.has(proposal.suggestedStatus)) return gate;
    filledGateIds.push(gate.id);
    return {
      ...gate,
      status: proposal.suggestedStatus,
      rationale: proposal.reasoning.trim()
        ? `[AI preview | ${input.draft.provider}/${input.draft.model}] ${proposal.reasoning.trim()}`
        : gate.rationale,
    };
  });

  const suggestedRoute = provisionalRoute(input.ideaRoute);
  const protocolRouteFilled = previewReview.protocolRoute === "unresolved" && suggestedRoute !== "unresolved";
  if (protocolRouteFilled) previewReview.protocolRoute = suggestedRoute;

  const previewScore = calculateScore(cloneReview(previewReview));
  const proposals = cloneDraft(input.draft);

  return {
    provenance: "ai-proposed-inputs",
    provisional: true,
    status: previewStatus(previewScore),
    selectedIdeaId: input.selectedIdeaId,
    selectedBy: input.selectedBy,
    selectionPriority: input.selectionPriority,
    provider: input.draft.provider,
    model: input.draft.model,
    createdAt: input.createdAt,
    sourceInputFingerprint: input.sourceInputFingerprint,
    protocolRouteFilled,
    filledClaimIds,
    filledGateIds,
    missingClaimIds: previewReview.claims
      .filter((claim) => claim.merit === null)
      .map((claim) => claim.claimId),
    previewReview,
    previewScore,
    proposals,
  };
}
