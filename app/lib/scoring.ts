import rubricData from "./rubric.json" with { type: "json" };
import type { PersonalityProfileResult } from "./personality";

export const ENGINE_VERSION = "v3-powershell-parity/1.0.2";
export const FRAMEWORK_VERSION = "v3";
export const RUBRIC_MANIFEST_SHA256 =
  "fa940feea694ee4df4aa064d2fc418e68a879f318c11e72cfbc4bf5a9d1c1d67";

export const ARCHETYPES = [
  "application",
  "enterprise",
  "protocolInfrastructure",
  "marketplaceDepin",
] as const;

export const STAGES = [
  "thesis",
  "discovery",
  "architecture",
  "pilot",
  "production",
] as const;

export const EVIDENCE_GRADES = ["E0", "E1", "E2", "E3", "E4"] as const;

export const EVIDENCE_TYPES = [
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

export const GATE_IDS = ["G1", "G2", "G3", "G4", "G5", "G6", "G7", "G8"] as const;
const GATE_STATUSES = ["pass", "conditional", "fail", "unresolved", "not_due"] as const;
const PROTOCOL_ROUTES: ProtocolRoute[] = [
  "unresolved",
  "conventional",
  "xahau_app_specific",
  "evernode_baseline",
  "hybrid",
];

export type Archetype = (typeof ARCHETYPES)[number];
export type Stage = (typeof STAGES)[number];
export type EvidenceGrade = (typeof EVIDENCE_GRADES)[number];
export type EvidenceType = (typeof EVIDENCE_TYPES)[number];
export type GateId = (typeof GATE_IDS)[number];
export type GateStatus = "pass" | "conditional" | "fail" | "unresolved" | "not_due";
export type ProtocolRoute =
  | "unresolved"
  | "conventional"
  | "xahau_app_specific"
  | "evernode_baseline"
  | "hybrid";

export interface RubricRow {
  categoryId: string;
  category: string;
  claimId: string;
  atomicClaim: string;
  weights: Record<Archetype, number>;
}

export interface ClaimAssessment {
  claimId: string;
  merit: number | null;
  grade: EvidenceGrade;
  evidenceClaimIds: string[];
  evidenceArtifactIds: string[];
  acknowledgedCounterEvidenceIds: string[];
  note?: string;
}

export interface EvidenceArtifact {
  artifactId: string;
  evidenceClaimId: string;
  title: string;
  rubricClaimIds: string[];
  sourceFamilyId: string;
  observationId: string;
  duplicateOf: string;
  reviewerVerified: boolean;
  reviewer: string;
  relationshipOrConflict: string;
  evidenceType: EvidenceType;
  evidenceDate: string;
  expiryDate: string;
  grade: EvidenceGrade;
  direction: "supports" | "contradicts";
  sourceLocation?: string;
  /** Exact excerpt approved by the reviewer from the supplied source. */
  sourceExcerpt?: string;
  /** SHA-256 of the canonicalized supplied source content. */
  sourceContentSha256?: string;
  /** Provenance for artifacts staged through the optional AI organizer. */
  ingestionOrigin?: {
    kind: "ai-assisted";
    provider: string;
    model: string;
  };
}

export interface GateAssessment {
  id: GateId;
  status: GateStatus;
  rationale: string;
  owner: string;
  deadline: string;
  expectedArtifact: string;
  passThreshold: string;
  killThreshold: string;
}

export interface ReviewInput {
  archetype: Archetype;
  stage: Stage;
  cutoffDate: string;
  protocolRoute: ProtocolRoute;
  claims: ClaimAssessment[];
  artifacts: EvidenceArtifact[];
  gates: GateAssessment[];
}

export interface ClaimResult {
  categoryId: string;
  category: string;
  claimId: string;
  atomicClaim: string;
  weight: number;
  rawMerit: number;
  evidence: EvidenceGrade;
  evidenceRank: number;
  evidenceTypes: EvidenceType[];
  rawPoints: number;
  validatedPoints: number;
  confidencePoints: number;
  verifiedWeight: number;
  eligibleArtifactIds: string[];
  contradictions: string[];
}

export interface CategorySummary {
  id: string;
  category: string;
  weight: number;
  rawMerit: number;
  minimumAtomicMerit: number;
  rawPoints: number;
  validatedPoints: number;
  verifiedCoverage: number;
  assessedClaims: number;
  totalClaims: number;
}

export interface GateResult {
  eligible: boolean;
  blockers: string[];
  validationErrors: string[];
}

export interface ScoreOutput {
  engineVersion: string;
  frameworkVersion: string;
  rubricManifestSha256: string;
  inputFingerprint: string;
  archetype: Archetype;
  stage: Stage;
  lockedWeightTotal: number;
  rawThesisScore: number;
  validatedScore: number;
  policyAdjustedValidatedScore: number;
  evidenceConfidenceIndex: number;
  verifiedEvidenceCoverage: number;
  policyCap: number;
  stageThresholdPassed: boolean;
  numericEligible: boolean;
  gateEligible: boolean;
  /** Numeric and gate readiness only; financing, team, role design, and independent review remain separate. */
  numericAndGateEligible: boolean;
  official: boolean;
  assessedClaims: number;
  totalClaims: number;
  validationErrors: string[];
  warnings: string[];
  numericBlockers: string[];
  gateBlockers: string[];
  categorySummaries: CategorySummary[];
  claimResults: ClaimResult[];
}

export interface WeightedDimension {
  id: string;
  label: string;
  weight: number;
}

export interface GenerationProfile {
  mode: "neutral" | "private";
  locked: boolean;
  searchThemes: WeightedDimension[];
  fitDimensions: WeightedDimension[];
  /** Optional, derived IPIP-NEO-120 result. Raw questionnaire answers are never stored here. */
  personalityAssessment?: PersonalityProfileResult;
  /** Exact domain/facet positions stay out of LLM prompts unless the user explicitly enables this. */
  sharePersonalityScoresWithAi?: boolean;
  generationWeights: {
    personalFit: number;
    opportunitySignal: number;
    protocolAffordance: number;
    experimentability: number;
  };
}

export interface GenerationComponentScores {
  personalFit: number;
  opportunitySignal: number;
  protocolAffordance: number;
  experimentability: number;
}

export const RUBRIC = rubricData as RubricRow[];

export const EVIDENCE_RANK: Record<EvidenceGrade, number> = {
  E0: 0,
  E1: 1,
  E2: 2,
  E3: 3,
  E4: 4,
};

export const EVIDENCE_MULTIPLIER: Record<EvidenceGrade, number> = {
  E0: 0,
  E1: 0.25,
  E2: 0.5,
  E3: 0.75,
  E4: 1,
};

export const EVIDENCE_TYPE_MAX_RANK: Record<EvidenceType, number> = {
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

const DIRECT_CUSTOMER_TYPES: EvidenceType[] = [
  "CustomerObservation",
  "CustomerCommitment",
  "Payment",
  "ProductionBehavior",
];

const COMMITTED_DEMAND_TYPES: EvidenceType[] = [
  "CustomerCommitment",
  "Payment",
  "ProductionBehavior",
];

const GATE_LABELS: Record<GateId, string> = {
  G1: "Evidence integrity, legality, and harm",
  G2: "Specific problem and actor",
  G3: "Reach and coordination",
  G4: "Technical and trust feasibility",
  G5: "Protocol routing counterfactual",
  G6: "Actor and economic sustainability",
  G7: "Funding and execution path",
  G8: "Stage safety",
};

const GATE_DUE_STAGE: Record<GateId, number> = {
  G1: 0,
  G2: 0,
  G3: 1,
  G4: 2,
  G5: 2,
  G6: 3,
  G7: 0,
  G8: 2,
};

const MANIFEST_ARCHETYPE_ORDER: Archetype[] = [
  "application",
  "enterprise",
  "protocolInfrastructure",
  "marketplaceDepin",
];

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

function isArchetype(value: unknown): value is Archetype {
  return typeof value === "string" && (ARCHETYPES as readonly string[]).includes(value);
}

function isStage(value: unknown): value is Stage {
  return typeof value === "string" && (STAGES as readonly string[]).includes(value);
}

function isEvidenceGrade(value: unknown): value is EvidenceGrade {
  return typeof value === "string" && (EVIDENCE_GRADES as readonly string[]).includes(value);
}

function isEvidenceType(value: unknown): value is EvidenceType {
  return typeof value === "string" && (EVIDENCE_TYPES as readonly string[]).includes(value);
}

function isGateStatus(value: unknown): value is GateStatus {
  return typeof value === "string" && (GATE_STATUSES as readonly string[]).includes(value);
}

function isProtocolRoute(value: unknown): value is ProtocolRoute {
  return typeof value === "string" && (PROTOCOL_ROUTES as readonly string[]).includes(value);
}

function normalizedId(value: string) {
  return value.trim().toUpperCase();
}

function includesId(values: string[], target: string) {
  const normalizedTarget = normalizedId(target);
  return values.some((value) => normalizedId(value) === normalizedTarget);
}

function rotateRight(value: number, amount: number) {
  return (value >>> amount) | (value << (32 - amount));
}

function sha256Hex(value: string) {
  const bytes = new TextEncoder().encode(value);
  const bitLength = bytes.length * 8;
  const paddedLength = Math.ceil((bytes.length + 9) / 64) * 64;
  const padded = new Uint8Array(paddedLength);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(paddedLength - 8, Math.floor(bitLength / 0x100000000), false);
  view.setUint32(paddedLength - 4, bitLength >>> 0, false);

  const state = [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ];
  const words = new Uint32Array(64);

  for (let offset = 0; offset < paddedLength; offset += 64) {
    for (let index = 0; index < 16; index += 1) {
      words[index] = view.getUint32(offset + index * 4, false);
    }
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
      h = g;
      g = f;
      f = e;
      e = (d + temporary1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temporary1 + temporary2) >>> 0;
    }

    state[0] = (state[0] + a) >>> 0;
    state[1] = (state[1] + b) >>> 0;
    state[2] = (state[2] + c) >>> 0;
    state[3] = (state[3] + d) >>> 0;
    state[4] = (state[4] + e) >>> 0;
    state[5] = (state[5] + f) >>> 0;
    state[6] = (state[6] + g) >>> 0;
    state[7] = (state[7] + h) >>> 0;
  }

  return state.map((word) => word.toString(16).padStart(8, "0")).join("");
}

function formatManifestWeight(value: number) {
  if (!Number.isFinite(value)) return "invalid-weight";
  return value.toFixed(3).replace(/(?:\.0+|(?:(\.\d*?[1-9]))0+)$/, "$1");
}

function calculateRubricManifestHash(rows: RubricRow[]) {
  const canonical = rows
    .map((row) =>
      [
        String(row.categoryId).trim(),
        String(row.category).trim(),
        String(row.claimId).trim(),
        String(row.atomicClaim).trim(),
        ...MANIFEST_ARCHETYPE_ORDER.map((archetype) => formatManifestWeight(row.weights[archetype])),
      ].join("|"),
    )
    .join("\n");
  return sha256Hex(canonical);
}

function rankStage(stage: Stage) {
  return STAGES.indexOf(stage);
}

function isValidDate(value: string) {
  if (typeof value !== "string") return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}

function dayNumber(value: string) {
  return Date.parse(`${value}T00:00:00Z`);
}

function isUnexpired(expiryDate: string, cutoffDate: string) {
  return isValidDate(expiryDate) && isValidDate(cutoffDate) && dayNumber(expiryDate) >= dayNumber(cutoffDate);
}

function isObservedByCutoff(evidenceDate: string, cutoffDate: string) {
  return isValidDate(evidenceDate) && isValidDate(cutoffDate) && dayNumber(evidenceDate) <= dayNumber(cutoffDate);
}

function isEligibleSupportArtifact(artifact: EvidenceArtifact, cutoffDate: string) {
  if (artifact.direction !== "supports" || !isEvidenceGrade(artifact.grade) || !isEvidenceType(artifact.evidenceType)) {
    return false;
  }
  const rank = EVIDENCE_RANK[artifact.grade];
  if (
    rank === 0 ||
    rank > EVIDENCE_TYPE_MAX_RANK[artifact.evidenceType] ||
    String(artifact.duplicateOf ?? "").trim() ||
    !isObservedByCutoff(artifact.evidenceDate, cutoffDate) ||
    !isUnexpired(artifact.expiryDate, cutoffDate)
  ) {
    return false;
  }
  return rank < 2 || (
    artifact.reviewerVerified &&
    Boolean(String(artifact.reviewer ?? "").trim()) &&
    Boolean(String(artifact.relationshipOrConflict ?? "").trim())
  );
}

function roundHalfEven(value: number, decimals: number) {
  const factor = 10 ** decimals;
  const scaled = value * factor;
  const floor = Math.floor(scaled);
  const fraction = scaled - floor;
  const epsilon = 1e-10;
  if (Math.abs(fraction - 0.5) <= epsilon) {
    return (floor % 2 === 0 ? floor : floor + 1) / factor;
  }
  return Math.round(scaled) / factor;
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(object[key])}`)
    .join(",")}}`;
}

function fnv1a(value: string) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function unique<T>(values: T[]) {
  return [...new Set(values)];
}

export function createEmptyClaims(): ClaimAssessment[] {
  return RUBRIC.map((row) => ({
    claimId: row.claimId,
    merit: null,
    grade: "E0",
    evidenceClaimIds: [],
    evidenceArtifactIds: [],
    acknowledgedCounterEvidenceIds: [],
  }));
}

export function createDefaultGates(): GateAssessment[] {
  return GATE_IDS.map((id) => ({
    id,
    status: GATE_DUE_STAGE[id] === 0 ? "unresolved" : "not_due",
    rationale: "",
    owner: "",
    deadline: "",
    expectedArtifact: "",
    passThreshold: "",
    killThreshold: "",
  }));
}

export function validateGenerationProfile(profile: GenerationProfile) {
  const errors: string[] = [];
  if (profile.mode === "neutral") return errors;

  const themeTotal = profile.searchThemes.reduce((sum, item) => sum + item.weight, 0);
  const fitTotal = profile.fitDimensions.reduce((sum, item) => sum + item.weight, 0);
  const outer = profile.generationWeights;
  const outerTotal =
    outer.personalFit + outer.opportunitySignal + outer.protocolAffordance + outer.experimentability;

  if (profile.searchThemes.length < 3 || profile.searchThemes.length > 6) {
    errors.push("Private profiles require 3–6 search themes.");
  }
  if (profile.fitDimensions.length < 4 || profile.fitDimensions.length > 8) {
    errors.push("Private profiles require 4–8 personal-fit dimensions.");
  }
  if (themeTotal !== 100) errors.push(`Search-theme weights total ${themeTotal}, not 100.`);
  if (fitTotal !== 100) errors.push(`Personal-fit weights total ${fitTotal}, not 100.`);
  if (outerTotal !== 100) errors.push(`Generation Priority weights total ${outerTotal}, not 100.`);
  if (outer.personalFit < 25 || outer.personalFit > 45) errors.push("Personal Search Fit must be 25–45%.");
  if (outer.opportunitySignal < 25 || outer.opportunitySignal > 40) errors.push("Opportunity Signal must be 25–40%.");
  if (outer.protocolAffordance < 10 || outer.protocolAffordance > 25) errors.push("Protocol Affordance must be 10–25%.");
  if (outer.experimentability < 15 || outer.experimentability > 25) errors.push("Experimentability must be 15–25%.");
  if (profile.searchThemes.some((item) => !item.label.trim() || !Number.isInteger(item.weight) || item.weight < 0)) {
    errors.push("Every search theme needs a label and non-negative whole-number weight.");
  }
  if (profile.fitDimensions.some((item) => !item.label.trim() || !Number.isInteger(item.weight) || item.weight < 0)) {
    errors.push("Every personal-fit dimension needs a label and non-negative whole-number weight.");
  }
  if (profile.sharePersonalityScoresWithAi && !profile.personalityAssessment) {
    errors.push("Exact personality scores cannot be shared without a completed assessment.");
  }
  if (profile.personalityAssessment) {
    const assessment = profile.personalityAssessment;
    const validDomainCodes = new Set(["N", "E", "O", "A", "C"]);
    const domainCodes = assessment.domains.map((domain) => domain.code);
    const workStyleWeight = assessment.workStyleFit.reduce((sum, dimension) => sum + dimension.weight, 0);
    if (
      assessment.instrument !== "IPIP-NEO-120"
      || assessment.scoringVersion !== "ipip-neo-120-scale-position/1.0.0"
      || assessment.completedItems !== 120
      || assessment.domains.length !== 5
      || new Set(domainCodes).size !== 5
      || domainCodes.some((code) => !validDomainCodes.has(code))
      || assessment.domains.some((domain) => !Number.isFinite(domain.score) || domain.score < 0 || domain.score > 100)
      || assessment.facets.length !== 30
      || assessment.facets.some((facet) => !Number.isFinite(facet.score) || facet.score < 0 || facet.score > 100)
      || assessment.workStyleFit.length !== 5
      || workStyleWeight !== 100
    ) {
      errors.push("The saved IPIP-NEO-120 result is incomplete or invalid.");
    }
  }
  if (profile.locked && errors.length > 0) errors.push("A profile with invalid weights cannot be locked.");
  return errors;
}

export function calculateGenerationPriority(
  profile: GenerationProfile,
  scores: GenerationComponentScores,
) {
  const weights =
    profile.mode === "private"
      ? profile.generationWeights
      : { personalFit: 0, opportunitySignal: 40, protocolAffordance: 30, experimentability: 30 };
  const bounded = Object.fromEntries(
    Object.entries(scores).map(([key, value]) => [key, Math.max(0, Math.min(100, Number(value) || 0))]),
  ) as unknown as GenerationComponentScores;
  const total =
    bounded.personalFit * weights.personalFit +
    bounded.opportunitySignal * weights.opportunitySignal +
    bounded.protocolAffordance * weights.protocolAffordance +
    bounded.experimentability * weights.experimentability;
  return roundHalfEven(total / 100, 1);
}

function evaluateGates(input: ReviewInput): GateResult {
  const blockers: string[] = [];
  const validationErrors: string[] = [];
  const gatesById = new Map(input.gates.map((gate) => [gate.id, gate]));
  const stageRank = rankStage(input.stage);

  if (!isProtocolRoute(input.protocolRoute)) validationErrors.push("Protocol route is invalid.");

  if (input.gates.length !== GATE_IDS.length || new Set(input.gates.map((gate) => gate.id)).size !== GATE_IDS.length) {
    validationErrors.push("The review must contain G1–G8 exactly once.");
  }

  for (const gate of input.gates) {
    if (!(GATE_IDS as readonly string[]).includes(gate.id)) {
      validationErrors.push(`Unknown gate ${String(gate.id)}.`);
    }
  }

  for (const id of GATE_IDS) {
    const gate = gatesById.get(id);
    if (!gate) {
      validationErrors.push(`${id} is missing.`);
      continue;
    }
    const due = stageRank >= GATE_DUE_STAGE[id];
    if (!isGateStatus(gate.status)) {
      validationErrors.push(`${id} has an invalid status.`);
      continue;
    }

    if (
      (gate.status === "pass" || gate.status === "conditional" || gate.status === "fail") &&
      !String(gate.rationale ?? "").trim()
    ) {
      validationErrors.push(`${id} ${gate.status} requires a rationale.`);
    }

    if (gate.status === "conditional") {
      const missing = [
        ["owner", gate.owner],
        ["deadline", gate.deadline],
        ["expected artifact", gate.expectedArtifact],
        ["pass threshold", gate.passThreshold],
        ["kill threshold", gate.killThreshold],
      ].filter(([, value]) => !String(value).trim());
      if (missing.length > 0) {
        validationErrors.push(`${id} conditional is missing ${missing.map(([label]) => label).join(", ")}.`);
      }
      if (!isValidDate(gate.deadline)) {
        validationErrors.push(`${id} conditional deadline is invalid.`);
      } else if (isValidDate(input.cutoffDate) && dayNumber(gate.deadline) < dayNumber(input.cutoffDate)) {
        blockers.push(`${id} ${GATE_LABELS[id]} has an overdue condition.`);
      }
      if (
        String(gate.passThreshold ?? "").trim() &&
        String(gate.passThreshold ?? "").trim() === String(gate.killThreshold ?? "").trim()
      ) {
        validationErrors.push(`${id} pass and kill thresholds cannot be identical.`);
      }
    }

    if (gate.status === "fail") {
      if (id === "G5" && input.protocolRoute === "conventional") continue;
      blockers.push(`${id} ${GATE_LABELS[id]} failed.`);
      continue;
    }

    if (!due) {
      if (gate.status !== "not_due" && gate.status !== "unresolved") {
        validationErrors.push(`${id} is not due at ${input.stage} and should remain Not Due or Unresolved.`);
      }
      continue;
    }

    if (gate.status === "unresolved" || gate.status === "not_due") {
      blockers.push(`${id} ${GATE_LABELS[id]} is unresolved at its due stage.`);
      continue;
    }

    const conditionalAllowed =
      (id === "G3" && stageRank <= 2) ||
      (id === "G7" && stageRank <= 2) ||
      (id === "G8" && stageRank === 2);
    if (gate.status === "conditional" && !conditionalAllowed) {
      blockers.push(`${id} ${GATE_LABELS[id]} must Pass at ${input.stage}.`);
    }
  }

  if (stageRank >= 2 && input.protocolRoute === "unresolved") {
    blockers.push("Protocol route must be resolved by Architecture.");
  }

  return { eligible: blockers.length === 0 && validationErrors.length === 0, blockers, validationErrors };
}

export function scoreReview(input: ReviewInput): ScoreOutput {
  const validationErrors: string[] = [];
  const warnings: string[] = [];
  const numericBlockers: string[] = [];
  const scoringArchetype = isArchetype(input.archetype) ? input.archetype : "application";
  const scoringStage = isStage(input.stage) ? input.stage : "thesis";
  const knownClaimIds = new Set(RUBRIC.map((row) => row.claimId));
  const claimIds = input.claims.map((claim) => claim.claimId);
  const claimById = new Map(input.claims.map((claim) => [claim.claimId, claim]));
  const artifactIds = new Set(input.artifacts.map((artifact) => normalizedId(artifact.artifactId)));

  if (!isArchetype(input.archetype)) validationErrors.push("Archetype is invalid.");
  if (!isStage(input.stage)) validationErrors.push("Stage is invalid.");
  if (!isValidDate(input.cutoffDate)) validationErrors.push("Evidence cutoff date is invalid.");
  const actualRubricManifestSha256 = calculateRubricManifestHash(RUBRIC);
  if (actualRubricManifestSha256 !== RUBRIC_MANIFEST_SHA256) {
    validationErrors.push(
      `Canonical rubric manifest mismatch: expected ${RUBRIC_MANIFEST_SHA256}, got ${actualRubricManifestSha256}.`,
    );
  }
  if (input.claims.length !== RUBRIC.length || new Set(claimIds).size !== RUBRIC.length) {
    validationErrors.push(`The review must contain all ${RUBRIC.length} canonical claims exactly once.`);
  }
  for (const row of RUBRIC) if (!claimById.has(row.claimId)) validationErrors.push(`Claim ${row.claimId} is missing.`);
  for (const claim of input.claims) if (!knownClaimIds.has(claim.claimId)) validationErrors.push(`Unknown claim ${claim.claimId}.`);

  if (input.artifacts.length === 0) validationErrors.push("The evidence ledger must contain at least one row.");
  const evidencePairs = input.artifacts.map(
    (artifact) => `${normalizedId(artifact.evidenceClaimId)}|${normalizedId(artifact.artifactId)}`,
  );
  if (new Set(evidencePairs).size !== evidencePairs.length) {
    validationErrors.push("Evidence claim/artifact pairs must be unique.");
  }

  for (const artifact of input.artifacts) {
    const label = `${artifact.evidenceClaimId || "unknown"}/${artifact.artifactId || "unknown"}`;
    if (!artifact.artifactId.trim() || !artifact.evidenceClaimId.trim()) {
      validationErrors.push(`Evidence ${label} requires artifact and evidence-claim IDs.`);
    }
    if (!artifact.sourceFamilyId.trim() || !artifact.observationId.trim()) {
      validationErrors.push(`Evidence ${label} requires source-family and observation IDs.`);
    }
    if (artifact.rubricClaimIds.length === 0 || artifact.rubricClaimIds.some((id) => !knownClaimIds.has(id))) {
      validationErrors.push(`Evidence ${label} must link only to known rubric claims.`);
    }
    const validGrade = isEvidenceGrade(artifact.grade);
    const validType = isEvidenceType(artifact.evidenceType);
    if (!validGrade) validationErrors.push(`${label}: evidence grade is invalid.`);
    if (!validType) validationErrors.push(`${label}: evidence type is invalid.`);
    if (artifact.direction !== "supports" && artifact.direction !== "contradicts") {
      validationErrors.push(`${label}: evidence direction is invalid.`);
    }
    if (
      validGrade &&
      validType &&
      EVIDENCE_RANK[artifact.grade] > EVIDENCE_TYPE_MAX_RANK[artifact.evidenceType]
    ) {
      validationErrors.push(`${label}: ${artifact.evidenceType} cannot support ${artifact.grade}.`);
    }
    if (validGrade && artifact.grade !== "E0") {
      const validEvidenceDate = isValidDate(artifact.evidenceDate);
      const validExpiryDate = isValidDate(artifact.expiryDate);
      if (!validEvidenceDate) validationErrors.push(`${label}: evidence date is required.`);
      if (!validExpiryDate) validationErrors.push(`${label}: expiry date is required.`);
      if (validEvidenceDate && isValidDate(input.cutoffDate) && dayNumber(artifact.evidenceDate) > dayNumber(input.cutoffDate)) {
        validationErrors.push(`${label}: evidence date cannot be after the review cutoff.`);
      }
      if (validEvidenceDate && validExpiryDate && dayNumber(artifact.expiryDate) < dayNumber(artifact.evidenceDate)) {
        validationErrors.push(`${label}: expiry date cannot be earlier than the evidence date.`);
      }
    }
    if (validGrade && EVIDENCE_RANK[artifact.grade] >= 2) {
      if (!artifact.reviewerVerified) validationErrors.push(`${label}: E2+ evidence must be reviewer verified.`);
      if (!artifact.reviewer.trim()) validationErrors.push(`${label}: E2+ evidence requires a reviewer.`);
      if (!artifact.relationshipOrConflict.trim()) {
        validationErrors.push(`${label}: E2+ evidence requires a relationship/conflict disclosure.`);
      }
    }
    const duplicateOf = String(artifact.duplicateOf ?? "").trim();
    if (duplicateOf) {
      if (normalizedId(duplicateOf) === normalizedId(artifact.artifactId)) {
        validationErrors.push(`${label}: duplicate_of cannot reference itself.`);
      }
      if (!artifactIds.has(normalizedId(duplicateOf))) {
        validationErrors.push(`${label}: duplicate_of is a dangling reference.`);
      }
    }
  }

  const claimResults: ClaimResult[] = [];
  const eligibleSupportsByClaim = new Map<string, EvidenceArtifact[]>();
  let lockedWeightTotal = 0;
  let rawTotal = 0;
  let validatedTotal = 0;
  let confidenceTotal = 0;
  let verifiedTotal = 0;

  for (const row of RUBRIC) {
    const assessment = claimById.get(row.claimId) ?? {
      claimId: row.claimId,
      merit: null,
      grade: "E0" as EvidenceGrade,
      evidenceClaimIds: [],
      evidenceArtifactIds: [],
      acknowledgedCounterEvidenceIds: [],
    };
    const configuredWeight = row.weights[scoringArchetype];
    const weight = Number.isFinite(configuredWeight) && configuredWeight > 0 ? configuredWeight : 0;
    if (weight === 0) validationErrors.push(`Claim ${row.claimId}: locked weight is invalid.`);
    const validMerit =
      typeof assessment.merit === "number" &&
      Number.isFinite(assessment.merit) &&
      assessment.merit >= 0 &&
      assessment.merit <= 5;
    const rawMerit = validMerit ? Number(assessment.merit) : 0;
    if (assessment.merit === null) validationErrors.push(`Claim ${row.claimId} is unassessed.`);
    if (assessment.merit !== null && !validMerit) {
      validationErrors.push(`Claim ${row.claimId} merit must be between 0 and 5.`);
    }

    const declaredGrade = isEvidenceGrade(assessment.grade) ? assessment.grade : "E0";
    if (!isEvidenceGrade(assessment.grade)) {
      validationErrors.push(`Claim ${row.claimId}: evidence grade is invalid.`);
    }
    const selectedEvidenceClaimIds = unique(
      (Array.isArray(assessment.evidenceClaimIds) ? assessment.evidenceClaimIds : [])
        .map(normalizedId)
        .filter(Boolean),
    );
    const selectedArtifactIds = unique(
      (Array.isArray(assessment.evidenceArtifactIds) ? assessment.evidenceArtifactIds : [])
        .map(normalizedId)
        .filter(Boolean),
    );
    const allRubricLinked = input.artifacts.filter((artifact) => includesId(artifact.rubricClaimIds, row.claimId));
    const linked =
      declaredGrade === "E0"
        ? []
        : allRubricLinked.filter(
            (artifact) =>
              includesId(selectedEvidenceClaimIds, artifact.evidenceClaimId) &&
              includesId(selectedArtifactIds, artifact.artifactId),
          );

    if (declaredGrade !== "E0") {
      if (selectedEvidenceClaimIds.length === 0 || selectedArtifactIds.length === 0) {
        validationErrors.push(
          `Claim ${row.claimId}: ${declaredGrade} requires evidence-claim and artifact IDs.`,
        );
      }
      for (const evidenceClaimId of selectedEvidenceClaimIds) {
        if (!linked.some((artifact) => normalizedId(artifact.evidenceClaimId) === evidenceClaimId)) {
          validationErrors.push(
            `Claim ${row.claimId}: evidence claim ${evidenceClaimId} is missing or not linked to this rubric claim.`,
          );
        }
      }
      for (const artifactId of selectedArtifactIds) {
        if (!linked.some((artifact) => normalizedId(artifact.artifactId) === artifactId)) {
          validationErrors.push(
            `Claim ${row.claimId}: artifact ${artifactId} is missing or not linked to this rubric claim.`,
          );
        }
      }
    }

    const supports = linked.filter((artifact) => isEligibleSupportArtifact(artifact, input.cutoffDate));
    eligibleSupportsByClaim.set(row.claimId, supports);
    const contradictions = allRubricLinked.filter(
      (artifact) =>
        artifact.direction === "contradicts" &&
        isObservedByCutoff(artifact.evidenceDate, input.cutoffDate) &&
        isUnexpired(artifact.expiryDate, input.cutoffDate),
    );
    const declaredEvidenceRank = EVIDENCE_RANK[declaredGrade];
    const maximumEligibleRank = supports.length === 0
      ? 0
      : Math.max(...supports.map((artifact) => EVIDENCE_RANK[artifact.grade]));
    const evidenceRank = Math.min(declaredEvidenceRank, maximumEligibleRank);
    const appliedGrade = EVIDENCE_GRADES[evidenceRank];
    if (declaredEvidenceRank > 0) {
      if (supports.length === 0) {
        validationErrors.push(`Claim ${row.claimId}: ${declaredGrade} has no eligible supporting evidence.`);
      } else if (declaredEvidenceRank > maximumEligibleRank) {
        validationErrors.push(`Claim ${row.claimId}: ${declaredGrade} exceeds linked eligible evidence.`);
      }
    }
    for (const contradiction of contradictions) {
      if (!includesId(assessment.acknowledgedCounterEvidenceIds, contradiction.evidenceClaimId)) {
        validationErrors.push(
          `Claim ${row.claimId}: counterevidence ${contradiction.evidenceClaimId} is not acknowledged.`,
        );
      }
    }

    const multiplier = EVIDENCE_MULTIPLIER[appliedGrade];
    const rawPoints = weight * rawMerit / 5;
    const validatedPoints = rawPoints * multiplier;
    const confidencePoints = weight * multiplier;
    const verifiedWeight = evidenceRank >= 2 ? weight : 0;
    lockedWeightTotal += weight;
    rawTotal += rawPoints;
    validatedTotal += validatedPoints;
    confidenceTotal += confidencePoints;
    verifiedTotal += verifiedWeight;

    claimResults.push({
      categoryId: row.categoryId,
      category: row.category,
      claimId: row.claimId,
      atomicClaim: row.atomicClaim,
      weight,
      rawMerit,
      evidence: appliedGrade,
      evidenceRank,
      evidenceTypes: unique(supports.map((artifact) => artifact.evidenceType)),
      rawPoints,
      validatedPoints,
      confidencePoints,
      verifiedWeight,
      eligibleArtifactIds: unique(supports.map((artifact) => artifact.artifactId)),
      contradictions: unique(contradictions.map((artifact) => artifact.evidenceClaimId)),
    });
  }

  if (Math.abs(lockedWeightTotal - 100) > 0.001) {
    validationErrors.push(`Locked ${scoringArchetype} weights total ${lockedWeightTotal}, not 100.`);
  }

  const categorySummaries: CategorySummary[] = unique(RUBRIC.map((row) => row.categoryId)).map((id) => {
    const rows = claimResults.filter((claim) => claim.categoryId === id);
    const weight = rows.reduce((sum, row) => sum + row.weight, 0);
    const rawPoints = rows.reduce((sum, row) => sum + row.rawPoints, 0);
    const validatedPoints = rows.reduce((sum, row) => sum + row.validatedPoints, 0);
    const verifiedWeight = rows.reduce((sum, row) => sum + row.verifiedWeight, 0);
    return {
      id,
      category: rows[0]?.category ?? id,
      weight: roundHalfEven(weight, 3),
      rawMerit: roundHalfEven(5 * rawPoints / weight, 2),
      minimumAtomicMerit: roundHalfEven(Math.min(...rows.map((row) => row.rawMerit)), 2),
      rawPoints: roundHalfEven(rawPoints, 2),
      validatedPoints: roundHalfEven(validatedPoints, 2),
      verifiedCoverage: roundHalfEven(100 * verifiedWeight / weight, 1),
      assessedClaims: rows.filter((row) => {
        const assessment = claimById.get(row.claimId);
        return assessment !== undefined && assessment.merit !== null;
      }).length,
      totalClaims: rows.length,
    };
  });

  const getClaim = (claimId: string) => claimResults.find((claim) => claim.claimId === claimId)!;
  const getCategory = (categoryId: string) => categorySummaries.find((category) => category.id === categoryId)!;
  const claimPasses = (claimId: string, minimumRank: number, allowedTypes: EvidenceType[] = []) => {
    const claim = getClaim(claimId);
    const supports = eligibleSupportsByClaim.get(claimId) ?? [];
    return Boolean(
      claim &&
        claim.evidenceRank >= minimumRank &&
        supports.some(
          (artifact) =>
            EVIDENCE_RANK[artifact.grade] >= minimumRank &&
            (allowedTypes.length === 0 || allowedTypes.includes(artifact.evidenceType)),
        ),
    );
  };

  let policyCap = 100;
  const problemDirect =
    claimPasses("1A", 2, DIRECT_CUSTOMER_TYPES) || claimPasses("1B", 2, DIRECT_CUSTOMER_TYPES);
  const demandDirect = claimPasses("2B", 2, DIRECT_CUSTOMER_TYPES);
  if (!problemDirect || !demandDirect) {
    policyCap = Math.min(policyCap, 55);
    warnings.push("Direct Problem/Demand evidence is missing: Validated Score is capped at 55.");
  }
  const committedDemand = claimPasses("2B", 3, COMMITTED_DEMAND_TYPES);
  if (!committedDemand) {
    policyCap = Math.min(policyCap, 70);
    warnings.push("Committed or paid Demand evidence is missing: Validated Score is capped at 70.");
  }
  const policyAdjusted = Math.min(validatedTotal, policyCap);
  const stageRank = rankStage(scoringStage);

  if (stageRank >= 1) {
    for (const id of ["1", "2"]) {
      if (getCategory(id).rawMerit < 3) numericBlockers.push(`Discovery floor: category ${id} raw merit is below 3.`);
    }
    if (!claimPasses("1A", 2)) numericBlockers.push("Discovery floor: 1A lacks required evidence.");
    if (!claimPasses("1B", 2)) numericBlockers.push("Discovery floor: 1B lacks required evidence.");
    if (!claimPasses("2B", 2, DIRECT_CUSTOMER_TYPES)) {
      numericBlockers.push("Discovery floor: 2B lacks required direct-customer evidence.");
    }
  }

  if (stageRank >= 2) {
    for (const categoryId of ["7", "8", "9"]) {
      for (const claim of claimResults.filter((row) => row.categoryId === categoryId)) {
        if (claim.rawMerit < 3) numericBlockers.push(`Architecture floor: ${claim.claimId} raw merit is below 3.`);
        if (claim.evidenceRank < 2) numericBlockers.push(`Architecture floor: ${claim.claimId} evidence is below E2.`);
      }
    }
  }

  if (stageRank >= 3) {
    for (const id of ["2", "5", "6"]) {
      if (getCategory(id).rawMerit < 3) numericBlockers.push(`Pilot floor: category ${id} raw merit is below 3.`);
    }
    if (!claimPasses("2B", 3, COMMITTED_DEMAND_TYPES)) {
      numericBlockers.push("Pilot demand floor: 2B lacks committed or paid evidence.");
    }
    if (scoringArchetype !== "protocolInfrastructure" && !claimPasses("2C", 3, COMMITTED_DEMAND_TYPES)) {
      numericBlockers.push("Commercial pilot floor: 2C lacks committed or paid evidence.");
    }
    for (const id of [
      "7A", "7B", "7C", "8A1", "8A2", "8C1", "8C2", "8E1", "8E2", "9B", "9C", "9D",
    ]) {
      if (!claimPasses(id, 3)) numericBlockers.push(`Pilot technical/assurance floor: ${id} lacks E3 evidence.`);
    }
    if (scoringArchetype === "enterprise" && getCategory("10").rawMerit < 3) {
      numericBlockers.push("Enterprise pilot floor: Ecosystem/Integration is below 3.");
    }
    if (scoringArchetype === "protocolInfrastructure" || scoringArchetype === "marketplaceDepin") {
      for (const id of ["11A", "11B1", "11B2", "11D1", "11D2"]) {
        if (getClaim(id).rawMerit < 3) numericBlockers.push(`Protocol/DePIN pilot floor: ${id} raw merit is below 3.`);
        if (!claimPasses(id, 2)) numericBlockers.push(`Protocol/DePIN mechanism floor: ${id} lacks E2 evidence.`);
      }
      for (const id of ["11A", "11B1", "11B2"]) {
        if (!claimPasses(id, 3)) numericBlockers.push(`Protocol/DePIN adversarial floor: ${id} lacks E3 evidence.`);
      }
    }
  }

  if (stageRank >= 4) {
    for (const claim of claimResults.filter((row) => row.categoryId === "8")) {
      if (claim.rawMerit < 4) numericBlockers.push(`Production Assurance floor: ${claim.claimId} raw merit is below 4.`);
      if (claim.evidenceRank < 3) numericBlockers.push(`Production Assurance floor: ${claim.claimId} evidence is below E3.`);
    }
    for (const id of ["8A1", "8A2", "8C1", "8C2", "8E1", "8E2"]) {
      if (!claimPasses(id, 4)) numericBlockers.push(`Production critical-control floor: ${id} lacks E4 evidence.`);
    }
    if (
      !claimPasses("5D", 4, ["Payment", "ProductionBehavior"]) &&
      !claimPasses("2D", 4, ["Payment", "ProductionBehavior"])
    ) {
      numericBlockers.push("Production floor: neither 5D nor 2D has E4 retained production/payment behavior.");
    }
  }

  let stageThresholdPassed = false;
  if (scoringStage === "thesis") {
    stageThresholdPassed = rawTotal >= 60;
    if (rawTotal < 60) numericBlockers.push("Thesis threshold: Raw Thesis Score is below 60.");
  } else if (scoringStage === "discovery") {
    stageThresholdPassed = rawTotal >= 65 && verifiedTotal >= 35;
    if (rawTotal < 65) numericBlockers.push("Discovery threshold: Raw Thesis Score is below 65.");
    if (verifiedTotal < 35) numericBlockers.push("Discovery threshold: Verified Coverage is below 35.");
  } else if (scoringStage === "architecture") {
    stageThresholdPassed = policyAdjusted >= 50 && verifiedTotal >= 50;
    if (policyAdjusted < 50) numericBlockers.push("Architecture threshold: Adjusted Validated Score is below 50.");
    if (verifiedTotal < 50) numericBlockers.push("Architecture threshold: Verified Coverage is below 50.");
  } else if (scoringStage === "pilot") {
    stageThresholdPassed = policyAdjusted >= 65 && verifiedTotal >= 65;
    if (policyAdjusted < 65) numericBlockers.push("Pilot threshold: Adjusted Validated Score is below 65.");
    if (verifiedTotal < 65) numericBlockers.push("Pilot threshold: Verified Coverage is below 65.");
  } else {
    stageThresholdPassed = policyAdjusted >= 78 && verifiedTotal >= 85;
    if (policyAdjusted < 78) numericBlockers.push("Production threshold: Adjusted Validated Score is below 78.");
    if (verifiedTotal < 85) numericBlockers.push("Production threshold: Verified Coverage is below 85.");
  }

  const numericValidationPassed = validationErrors.length === 0;
  const numericEligible = numericValidationPassed && stageThresholdPassed && numericBlockers.length === 0;
  const gateResult = evaluateGates(input);
  validationErrors.push(...gateResult.validationErrors);
  const official = validationErrors.length === 0;
  const numericAndGateEligible = official && numericEligible && gateResult.eligible;
  const fingerprint = fnv1a(stableStringify(input));

  return {
    engineVersion: ENGINE_VERSION,
    frameworkVersion: FRAMEWORK_VERSION,
    rubricManifestSha256: RUBRIC_MANIFEST_SHA256,
    inputFingerprint: fingerprint,
    archetype: input.archetype,
    stage: input.stage,
    lockedWeightTotal: roundHalfEven(lockedWeightTotal, 3),
    rawThesisScore: roundHalfEven(rawTotal, 1),
    validatedScore: roundHalfEven(validatedTotal, 1),
    policyAdjustedValidatedScore: roundHalfEven(policyAdjusted, 1),
    evidenceConfidenceIndex: roundHalfEven(confidenceTotal, 1),
    verifiedEvidenceCoverage: roundHalfEven(verifiedTotal, 1),
    policyCap,
    stageThresholdPassed,
    numericEligible,
    gateEligible: gateResult.eligible,
    numericAndGateEligible,
    official,
    assessedClaims: RUBRIC.filter((row) => {
      const assessment = claimById.get(row.claimId);
      return assessment !== undefined && assessment.merit !== null;
    }).length,
    totalClaims: RUBRIC.length,
    validationErrors: unique(validationErrors),
    warnings: unique(warnings),
    numericBlockers: unique(numericBlockers),
    gateBlockers: unique(gateResult.blockers),
    categorySummaries,
    claimResults,
  };
}
