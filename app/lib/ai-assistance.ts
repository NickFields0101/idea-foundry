import type {
  DraftEvaluationResult,
  EvidenceProposal,
  ExtractEvidenceResult,
} from "../desktop-bridge";
import type {
  EvidenceArtifact,
  EvidenceGrade,
  EvidenceType,
  ReviewInput,
} from "./scoring";

const EVIDENCE_GRADES = ["E0", "E1", "E2", "E3", "E4"] as const;
const EVIDENCE_TYPES = [
  "FounderAssertion",
  "DeskResearch",
  "ExpertOpinion",
  "CustomerObservation",
  "CustomerCommitment",
  "Payment",
  "PrototypeTest",
  "Benchmark",
  "Audit",
  "ProductionBehavior",
  "ReferenceCheck",
  "RoleSimulation",
  "Other",
] as const;

const EVIDENCE_TYPE_MAX_RANK: Record<EvidenceType, number> = {
  FounderAssertion: 0,
  DeskResearch: 1,
  ExpertOpinion: 1,
  CustomerObservation: 3,
  CustomerCommitment: 3,
  Payment: 4,
  PrototypeTest: 3,
  Benchmark: 3,
  Audit: 4,
  ProductionBehavior: 4,
  ReferenceCheck: 2,
  RoleSimulation: 3,
  Other: 1,
};

export type AiAssistanceErrorCode =
  | "stale_context"
  | "invalid_selection"
  | "invalid_proposal"
  | "invalid_source"
  | "verification_required"
  | "invalid_review";

export class AiAssistanceError extends Error {
  readonly code: AiAssistanceErrorCode;

  constructor(code: AiAssistanceErrorCode, message: string) {
    super(message);
    this.name = "AiAssistanceError";
    this.code = code;
  }
}

export interface ApplyEvaluationProposalsInput {
  review: ReviewInput;
  draft: DraftEvaluationResult;
  /** Claim IDs the reviewer explicitly approved in the staged draft. */
  selectedClaimIds: string[];
  /** Fingerprint captured when the draft was created. */
  expectedContextFingerprint: string;
  /** Fingerprint for the review visible at the moment of approval. */
  currentContextFingerprint: string;
}

export interface ApplyEvaluationProposalsResult {
  review: ReviewInput;
  /** Deterministic, independent snapshot suitable for a one-step undo. */
  previousReview: ReviewInput;
  appliedClaimIds: string[];
  skippedClaimIds: string[];
}

export interface HumanEvidenceApproval {
  /** This value must come from an explicit human action; AI output is ignored. */
  reviewerVerified: boolean;
  reviewer: string;
  relationshipOrConflict: string;
  evidenceDate: string;
  expiryDate: string;
}

export interface ApplyEvidenceProposalsInput {
  review: ReviewInput;
  draft: ExtractEvidenceResult;
  /** Zero-based proposal indexes the reviewer explicitly approved. */
  selectedProposalIndexes: number[];
  /** Selected supporting proposals whose evidence links should update their claims. */
  linkSupportingProposalIndexes?: number[];
  sourceText: string;
  sourceLabel?: string;
  humanApproval: HumanEvidenceApproval;
  expectedContextFingerprint: string;
  currentContextFingerprint: string;
}

export interface EvidenceGradeAdjustment {
  proposalIndex: number;
  requestedGrade: EvidenceGrade;
  appliedGrade: EvidenceGrade;
  evidenceType: EvidenceType;
}

export interface ApplyEvidenceProposalsResult {
  review: ReviewInput;
  previousReview: ReviewInput;
  artifacts: EvidenceArtifact[];
  appliedProposalIndexes: number[];
  linkedClaimIds: string[];
  gradeAdjustments: EvidenceGradeAdjustment[];
  sourceFamilyId: string;
  sourceContentSha256: string;
}

function normalizedId(value: string) {
  return String(value ?? "").trim().toUpperCase();
}

function assertFresh(expected: string, current: string) {
  const normalizedExpected = String(expected ?? "").trim();
  const normalizedCurrent = String(current ?? "").trim();
  if (!normalizedExpected || !normalizedCurrent || normalizedExpected !== normalizedCurrent) {
    throw new AiAssistanceError(
      "stale_context",
      "This AI draft is stale because the review changed. Generate a fresh draft before applying it.",
    );
  }
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

function uniqueNormalized(values: string[], label: string) {
  const normalized = values.map(normalizedId);
  if (normalized.some((value) => !value)) {
    throw new AiAssistanceError("invalid_selection", `${label} contains an empty identifier.`);
  }
  if (new Set(normalized).size !== normalized.length) {
    throw new AiAssistanceError("invalid_selection", `${label} contains duplicate identifiers.`);
  }
  return normalized;
}

function claimMapFor(review: ReviewInput) {
  const ids = review.claims.map((claim) => normalizedId(claim.claimId));
  if (ids.some((id) => !id) || new Set(ids).size !== ids.length) {
    throw new AiAssistanceError("invalid_review", "The review contains empty or duplicate claim IDs.");
  }
  return new Map(ids.map((id, index) => [id, index]));
}

function proposalProvenance(draft: DraftEvaluationResult, proposalIndex: number) {
  const proposal = draft.claims[proposalIndex];
  const reasoning = proposal.reasoning.trim() || "No reasoning supplied.";
  const uncertainty = proposal.uncertainty.trim();
  const uncertaintyText = uncertainty ? ` Uncertainty: ${uncertainty}` : "";
  return `AI draft (${draft.provider}/${draft.model}; ${proposal.confidence} confidence): ${reasoning}${uncertaintyText}`;
}

export function applyEvaluationProposals(
  input: ApplyEvaluationProposalsInput,
): ApplyEvaluationProposalsResult {
  assertFresh(input.expectedContextFingerprint, input.currentContextFingerprint);
  const claimById = claimMapFor(input.review);
  const selectedIds = uniqueNormalized(input.selectedClaimIds, "Selected claims");
  const proposalIds = input.draft.claims.map((proposal) => normalizedId(proposal.claimId));
  if (proposalIds.some((id) => !id) || new Set(proposalIds).size !== proposalIds.length) {
    throw new AiAssistanceError("invalid_proposal", "The AI draft contains empty or duplicate claim IDs.");
  }
  for (const id of proposalIds) {
    if (!claimById.has(id)) {
      throw new AiAssistanceError("invalid_proposal", `The AI draft references unknown claim ${id}.`);
    }
  }

  const proposalById = new Map(proposalIds.map((id, index) => [id, index]));
  for (const id of selectedIds) {
    if (!claimById.has(id) || !proposalById.has(id)) {
      throw new AiAssistanceError("invalid_selection", `Selected claim ${id} is not in this draft and review.`);
    }
  }

  const previousReview = cloneReview(input.review);
  const review = cloneReview(input.review);
  const appliedClaimIds: string[] = [];
  const skippedClaimIds: string[] = [];

  for (const id of selectedIds) {
    const claimIndex = claimById.get(id)!;
    const proposalIndex = proposalById.get(id)!;
    const claim = review.claims[claimIndex];
    const merit = input.draft.claims[proposalIndex].suggestedMerit;
    if (claim.merit !== null || merit === null) {
      skippedClaimIds.push(claim.claimId);
      continue;
    }
    if (!Number.isInteger(merit * 2) || merit < 0 || merit > 5) {
      throw new AiAssistanceError(
        "invalid_proposal",
        `AI merit for claim ${claim.claimId} must be in 0.5-point steps from 0 to 5 or null.`,
      );
    }
    const provenance = proposalProvenance(input.draft, proposalIndex);
    claim.merit = merit;
    claim.note = claim.note?.trim() ? `${claim.note.trim()}\n\n${provenance}` : provenance;
    appliedClaimIds.push(claim.claimId);
  }

  return { review, previousReview, appliedClaimIds, skippedClaimIds };
}

/** Normalize only for source matching; the approved exact excerpt remains stored verbatim. */
export function normalizeEvidenceText(value: string) {
  return String(value ?? "").normalize("NFKC").replace(/\s+/gu, " ").trim();
}

function canonicalSourceContent(value: string) {
  return String(value ?? "").normalize("NFKC").replace(/\r\n?/gu, "\n");
}

function rotateRight(value: number, amount: number) {
  return (value >>> amount) | (value << (32 - amount));
}

const SHA256_ROUND_CONSTANTS = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4,
  0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe,
  0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f,
  0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7,
  0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc,
  0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
  0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116,
  0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7,
  0xc67178f2,
] as const;

/** Synchronous SHA-256 for identical browser and desktop provenance records. */
export function sourceContentSha256(value: string) {
  const bytes = new TextEncoder().encode(canonicalSourceContent(value));
  const bitLength = bytes.length * 8;
  const paddedLength = Math.ceil((bytes.length + 9) / 64) * 64;
  const padded = new Uint8Array(paddedLength);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(paddedLength - 8, Math.floor(bitLength / 0x100000000), false);
  view.setUint32(paddedLength - 4, bitLength >>> 0, false);
  const state = [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab,
    0x5be0cd19,
  ];
  const words = new Uint32Array(64);
  for (let offset = 0; offset < paddedLength; offset += 64) {
    for (let index = 0; index < 16; index += 1) words[index] = view.getUint32(offset + index * 4, false);
    for (let index = 16; index < 64; index += 1) {
      const before15 = words[index - 15];
      const before2 = words[index - 2];
      const sigma0 = rotateRight(before15, 7) ^ rotateRight(before15, 18) ^ (before15 >>> 3);
      const sigma1 = rotateRight(before2, 17) ^ rotateRight(before2, 19) ^ (before2 >>> 10);
      words[index] = (words[index - 16] + sigma0 + words[index - 7] + sigma1) >>> 0;
    }
    let [a, b, c, d, e, f, g, h] = state;
    for (let index = 0; index < 64; index += 1) {
      const sum1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25);
      const choice = (e & f) ^ (~e & g);
      const temporary1 = (h + sum1 + choice + SHA256_ROUND_CONSTANTS[index] + words[index]) >>> 0;
      const sum0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22);
      const majority = (a & b) ^ (a & c) ^ (b & c);
      const temporary2 = (sum0 + majority) >>> 0;
      h = g; g = f; f = e; e = (d + temporary1) >>> 0; d = c; c = b; b = a; a = (temporary1 + temporary2) >>> 0;
    }
    state[0] = (state[0] + a) >>> 0; state[1] = (state[1] + b) >>> 0;
    state[2] = (state[2] + c) >>> 0; state[3] = (state[3] + d) >>> 0;
    state[4] = (state[4] + e) >>> 0; state[5] = (state[5] + f) >>> 0;
    state[6] = (state[6] + g) >>> 0; state[7] = (state[7] + h) >>> 0;
  }
  return state.map((word) => word.toString(16).padStart(8, "0")).join("");
}

function isIsoDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return date.getUTCFullYear() === Number(match[1])
    && date.getUTCMonth() === Number(match[2]) - 1
    && date.getUTCDate() === Number(match[3]);
}

function allocateId(prefix: string, used: Set<string>) {
  for (let index = 1; ; index += 1) {
    const candidate = `${prefix}-${String(index).padStart(3, "0")}`;
    if (!used.has(normalizedId(candidate))) {
      used.add(normalizedId(candidate));
      return candidate;
    }
  }
}

function assertUniqueIndexes(values: number[], label: string) {
  if (values.some((value) => !Number.isInteger(value) || value < 0)) {
    throw new AiAssistanceError("invalid_selection", `${label} contains an invalid proposal index.`);
  }
  if (new Set(values).size !== values.length) {
    throw new AiAssistanceError("invalid_selection", `${label} contains duplicate proposal indexes.`);
  }
}

function validEvidenceType(value: string): value is EvidenceType {
  return (EVIDENCE_TYPES as readonly string[]).includes(value);
}

function validEvidenceGrade(value: string): value is EvidenceGrade {
  return (EVIDENCE_GRADES as readonly string[]).includes(value);
}

function validateExistingArtifactIds(review: ReviewInput) {
  for (const [label, ids] of [
    ["artifact", review.artifacts.map((artifact) => artifact.artifactId)],
    ["evidence-claim", review.artifacts.map((artifact) => artifact.evidenceClaimId)],
    ["observation", review.artifacts.map((artifact) => artifact.observationId)],
  ] as const) {
    const normalized = ids.map(normalizedId);
    if (normalized.some((id) => !id) || new Set(normalized).size !== normalized.length) {
      throw new AiAssistanceError("invalid_review", `The review contains empty or duplicate ${label} IDs.`);
    }
  }
}

function validateEvidenceProposal(
  proposal: EvidenceProposal,
  proposalIndex: number,
  sourceText: string,
  claimById: Map<string, number>,
) {
  if (proposal.verificationStatus !== "source_supported" || proposal.unverifiable !== false) {
    throw new AiAssistanceError("invalid_proposal", `Evidence proposal ${proposalIndex + 1} is not source-supported.`);
  }
  const excerpt = String(proposal.sourceExcerpt ?? "");
  if (!excerpt || !sourceText.includes(excerpt)) {
    throw new AiAssistanceError(
      "invalid_source",
      `Evidence proposal ${proposalIndex + 1} does not contain a verbatim excerpt from the supplied source.`,
    );
  }
  const claimIds = uniqueNormalized(proposal.claimIds, `Evidence proposal ${proposalIndex + 1} claim IDs`);
  if (claimIds.length === 0 || claimIds.some((id) => !claimById.has(id))) {
    throw new AiAssistanceError("invalid_proposal", `Evidence proposal ${proposalIndex + 1} references an unknown claim.`);
  }
  if (!validEvidenceType(proposal.suggestedType) || !validEvidenceGrade(proposal.suggestedGrade)) {
    throw new AiAssistanceError("invalid_proposal", `Evidence proposal ${proposalIndex + 1} has an invalid type or grade.`);
  }
  if (proposal.direction !== "supports" && proposal.direction !== "contradicts") {
    throw new AiAssistanceError("invalid_proposal", `Evidence proposal ${proposalIndex + 1} has an invalid direction.`);
  }
  return claimIds;
}

export function applyEvidenceProposals(
  input: ApplyEvidenceProposalsInput,
): ApplyEvidenceProposalsResult {
  assertFresh(input.expectedContextFingerprint, input.currentContextFingerprint);
  const claimById = claimMapFor(input.review);
  validateExistingArtifactIds(input.review);
  if (!input.draft || !Array.isArray(input.draft.evidence)) {
    throw new AiAssistanceError("invalid_proposal", "The AI evidence draft is malformed. Generate a fresh draft.");
  }
  assertUniqueIndexes(input.selectedProposalIndexes, "Selected evidence");
  const linkIndexes = input.linkSupportingProposalIndexes ?? [];
  assertUniqueIndexes(linkIndexes, "Evidence links");
  const selectedSet = new Set(input.selectedProposalIndexes);
  if (linkIndexes.some((index) => !selectedSet.has(index))) {
    throw new AiAssistanceError("invalid_selection", "Only selected evidence proposals may update claims.");
  }
  if (input.selectedProposalIndexes.some((index) => index >= input.draft.evidence.length)) {
    throw new AiAssistanceError("invalid_selection", "A selected evidence proposal is no longer in this draft.");
  }

  if (!normalizeEvidenceText(input.sourceText)) {
    throw new AiAssistanceError("invalid_source", "Paste source material before applying evidence.");
  }
  const sourceHash = sourceContentSha256(input.sourceText);
  const approval = input.humanApproval;
  const previousReview = cloneReview(input.review);
  const review = cloneReview(input.review);
  const artifactIds = new Set(review.artifacts.map((artifact) => normalizedId(artifact.artifactId)));
  const evidenceClaimIds = new Set(review.artifacts.map((artifact) => normalizedId(artifact.evidenceClaimId)));
  const observationIds = new Set(review.artifacts.map((artifact) => normalizedId(artifact.observationId)));
  const sourceFamilyIds = new Set(review.artifacts.map((artifact) => normalizedId(artifact.sourceFamilyId)));
  const sameSourceArtifacts = review.artifacts.filter(
    (artifact) => artifact.sourceContentSha256 === sourceHash,
  );
  if (sameSourceArtifacts.some((artifact) => !String(artifact.sourceFamilyId ?? "").trim())) {
    throw new AiAssistanceError("invalid_review", "Existing evidence for this source is missing its source-family ID.");
  }
  const sameSourceFamilyIds = new Set(sameSourceArtifacts.map((artifact) => normalizedId(artifact.sourceFamilyId)));
  if (sameSourceFamilyIds.size > 1) {
    throw new AiAssistanceError("invalid_review", "The same source is assigned to multiple source families.");
  }
  const existingFamilyId = String(sameSourceArtifacts[0]?.sourceFamilyId ?? "").trim();
  const sourceFamilyId = existingFamilyId || allocateId("SF", sourceFamilyIds);
  const existingSourceExcerpts = new Set(
    sameSourceArtifacts
      .map((artifact) => artifact.sourceExcerpt)
      .filter((excerpt): excerpt is string => Boolean(excerpt))
      .map(canonicalSourceContent),
  );
  const selectedSourceExcerpts = new Set<string>();
  const linkedClaimIds = new Set<string>();
  const artifacts: EvidenceArtifact[] = [];
  const gradeAdjustments: EvidenceGradeAdjustment[] = [];

  for (const proposalIndex of input.selectedProposalIndexes) {
    const proposal = input.draft.evidence[proposalIndex];
    const rubricClaimIds = validateEvidenceProposal(proposal, proposalIndex, input.sourceText, claimById);
    const excerptIdentity = canonicalSourceContent(proposal.sourceExcerpt);
    if (existingSourceExcerpts.has(excerptIdentity) || selectedSourceExcerpts.has(excerptIdentity)) {
      throw new AiAssistanceError(
        "invalid_selection",
        `Evidence proposal ${proposalIndex + 1} repeats an excerpt already recorded from this source.`,
      );
    }
    selectedSourceExcerpts.add(excerptIdentity);
    const requestedRank = EVIDENCE_GRADES.indexOf(proposal.suggestedGrade);
    const appliedRank = Math.min(requestedRank, EVIDENCE_TYPE_MAX_RANK[proposal.suggestedType]);
    const appliedGrade = EVIDENCE_GRADES[appliedRank];
    if (appliedGrade !== proposal.suggestedGrade) {
      gradeAdjustments.push({
        proposalIndex,
        requestedGrade: proposal.suggestedGrade,
        appliedGrade,
        evidenceType: proposal.suggestedType,
      });
    }
    if (appliedRank > 0 && (!isIsoDate(approval.evidenceDate) || !isIsoDate(approval.expiryDate))) {
      throw new AiAssistanceError("verification_required", "E1+ evidence requires valid evidence and expiry dates.");
    }
    if (appliedRank > 0 && approval.expiryDate < approval.evidenceDate) {
      throw new AiAssistanceError(
        "verification_required",
        "Evidence expiry date cannot be earlier than its evidence date.",
      );
    }
    if (appliedRank > 0 && isIsoDate(review.cutoffDate) && approval.evidenceDate > review.cutoffDate) {
      throw new AiAssistanceError(
        "verification_required",
        "Evidence date cannot be after the review cutoff date.",
      );
    }
    if (
      appliedRank >= 2
      && (!approval.reviewerVerified || !approval.reviewer.trim() || !approval.relationshipOrConflict.trim())
    ) {
      throw new AiAssistanceError(
        "verification_required",
        "E2+ evidence requires explicit human verification, a reviewer, and a conflict disclosure.",
      );
    }
    if (linkIndexes.includes(proposalIndex) && proposal.direction !== "supports") {
      throw new AiAssistanceError("invalid_selection", "Contradicting evidence cannot update or acknowledge a claim.");
    }

    const artifact: EvidenceArtifact = {
      artifactId: allocateId("A", artifactIds),
      evidenceClaimId: allocateId("EC", evidenceClaimIds),
      title: proposal.title.trim() || `Evidence from ${input.sourceLabel?.trim() || input.draft.sourceLabel || "provided source"}`,
      rubricClaimIds,
      sourceFamilyId,
      observationId: allocateId("OBS", observationIds),
      duplicateOf: "",
      reviewerVerified: Boolean(approval.reviewerVerified),
      reviewer: approval.reviewer.trim(),
      relationshipOrConflict: approval.relationshipOrConflict.trim(),
      evidenceType: proposal.suggestedType,
      evidenceDate: approval.evidenceDate,
      expiryDate: approval.expiryDate,
      grade: appliedGrade,
      direction: proposal.direction,
      sourceLocation: input.sourceLabel?.trim() || input.draft.sourceLabel.trim() || "Provided source",
      sourceExcerpt: proposal.sourceExcerpt,
      sourceContentSha256: sourceHash,
      ingestionOrigin: {
        kind: "ai-assisted",
        provider: input.draft.provider,
        model: input.draft.model,
      },
    };
    artifacts.push(artifact);
    review.artifacts.push(artifact);

    if (linkIndexes.includes(proposalIndex)) {
      for (const claimId of rubricClaimIds) {
        const claim = review.claims[claimById.get(claimId)!];
        if (!claim.evidenceClaimIds.some((id) => normalizedId(id) === normalizedId(artifact.evidenceClaimId))) {
          claim.evidenceClaimIds.push(artifact.evidenceClaimId);
        }
        if (!claim.evidenceArtifactIds.some((id) => normalizedId(id) === normalizedId(artifact.artifactId))) {
          claim.evidenceArtifactIds.push(artifact.artifactId);
        }
        const currentRank = validEvidenceGrade(claim.grade) ? EVIDENCE_GRADES.indexOf(claim.grade) : 0;
        if (appliedRank > currentRank) claim.grade = appliedGrade;
        linkedClaimIds.add(claim.claimId);
      }
    }
  }

  return {
    review,
    previousReview,
    artifacts,
    appliedProposalIndexes: [...input.selectedProposalIndexes],
    linkedClaimIds: [...linkedClaimIds],
    gradeAdjustments,
    sourceFamilyId,
    sourceContentSha256: sourceHash,
  };
}
