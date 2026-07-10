import assert from "node:assert/strict";
import test from "node:test";

import type {
  Archetype,
  ClaimAssessment,
  EvidenceArtifact,
  EvidenceGrade,
  EvidenceType,
  GateAssessment,
  GenerationProfile,
  ReviewInput,
  RubricRow,
  Stage,
} from "../app/lib/scoring";

const scoringModuleUrl = new URL("../app/lib/scoring.ts", import.meta.url).href;
const {
  ARCHETYPES,
  EVIDENCE_GRADES,
  EVIDENCE_TYPE_MAX_RANK,
  GATE_IDS,
  RUBRIC,
  RUBRIC_MANIFEST_SHA256,
  STAGES,
  calculateGenerationPriority,
  scoreReview,
} = await import(scoringModuleUrl) as typeof import("../app/lib/scoring");

const CUTOFF_DATE = "2026-07-10";
const EVIDENCE_DATE = "2026-07-01";
const EXPIRY_DATE = "2099-12-31";

const CANONICAL_CLAIM_IDS = [
  "1A", "1B", "1C",
  "2A", "2B", "2C", "2D",
  "3A", "3B", "3C",
  "4A", "4B", "4C",
  "5A", "5B", "5C", "5D",
  "6A", "6B", "6C", "6D",
  "7A", "7B", "7C", "7D",
  "8A1", "8A2", "8B", "8C1", "8C2", "8D", "8E1", "8E2",
  "9A", "9B", "9C", "9D",
  "10A", "10B", "10C", "10D",
  "11A", "11B1", "11B2", "11C", "11D1", "11D2", "11E",
  "12A", "12B", "12C",
] as const;

const GATE_DUE_STAGE: Record<(typeof GATE_IDS)[number], number> = {
  G1: 0,
  G2: 0,
  G3: 1,
  G4: 2,
  G5: 2,
  G6: 3,
  G7: 0,
  G8: 2,
};

interface ClaimFixture {
  merit: number;
  grade: EvidenceGrade;
  evidenceType: EvidenceType;
}

interface ReviewFixtureOptions {
  archetype?: Archetype;
  stage?: Stage;
  claim?: (row: RubricRow) => ClaimFixture;
}

function artifactFor(
  claimId: string,
  grade: EvidenceGrade,
  evidenceType: EvidenceType,
  options: {
    direction?: EvidenceArtifact["direction"];
    suffix?: string;
  } = {},
): EvidenceArtifact {
  const suffix = options.suffix ?? claimId;
  const rank = EVIDENCE_GRADES.indexOf(grade);
  return {
    artifactId: `A-${suffix}`,
    evidenceClaimId: `C-${suffix}`,
    title: `Synthetic fixture for ${claimId}`,
    rubricClaimIds: [claimId],
    sourceFamilyId: `SF-${suffix}`,
    observationId: `O-${suffix}`,
    duplicateOf: "",
    reviewerVerified: rank >= 2,
    reviewer: rank >= 2 ? "REVIEWER-FIXTURE" : "",
    relationshipOrConflict: rank >= 2 ? "None" : "",
    evidenceType,
    evidenceDate: EVIDENCE_DATE,
    expiryDate: EXPIRY_DATE,
    grade,
    direction: options.direction ?? "supports",
    sourceLocation: `synthetic://${suffix}`,
  };
}

function gatesFor(stage: Stage): GateAssessment[] {
  const stageRank = STAGES.indexOf(stage);
  return GATE_IDS.map((id) => ({
    id,
    status: stageRank >= GATE_DUE_STAGE[id] ? "pass" : "not_due",
    rationale: `Synthetic ${id} fixture`,
    owner: "",
    deadline: "",
    expectedArtifact: "",
    passThreshold: "",
    killThreshold: "",
  }));
}

function buildReview(options: ReviewFixtureOptions = {}): ReviewInput {
  const archetype = options.archetype ?? "application";
  const stage = options.stage ?? "thesis";
  const artifacts: EvidenceArtifact[] = [];
  const claims: ClaimAssessment[] = RUBRIC.map((row) => {
    const fixture = options.claim?.(row) ?? {
      merit: 5,
      grade: "E0" as const,
      evidenceType: "FounderAssertion" as const,
    };
    const artifact =
      fixture.grade === "E0"
        ? undefined
        : artifactFor(row.claimId, fixture.grade, fixture.evidenceType);
    if (artifact) artifacts.push(artifact);
    return {
      claimId: row.claimId,
      merit: fixture.merit,
      grade: fixture.grade,
      evidenceClaimIds: artifact ? [artifact.evidenceClaimId] : [],
      evidenceArtifactIds: artifact ? [artifact.artifactId] : [],
      acknowledgedCounterEvidenceIds: [],
    };
  });

  // The canonical calculator requires a non-empty evidence ledger, even when all claims are E0.
  if (artifacts.length === 0) {
    artifacts.push(artifactFor("1A", "E0", "FounderAssertion", { suffix: "LEDGER-E0" }));
  }

  return {
    archetype,
    stage,
    cutoffDate: CUTOFF_DATE,
    protocolRoute: stage === "architecture" || stage === "pilot" || stage === "production"
      ? "conventional"
      : "unresolved",
    claims,
    artifacts,
    gates: gatesFor(stage),
  };
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function objectiveProjection(result: ReturnType<typeof scoreReview>) {
  return {
    archetype: result.archetype,
    stage: result.stage,
    lockedWeightTotal: result.lockedWeightTotal,
    rawThesisScore: result.rawThesisScore,
    validatedScore: result.validatedScore,
    policyAdjustedValidatedScore: result.policyAdjustedValidatedScore,
    evidenceConfidenceIndex: result.evidenceConfidenceIndex,
    verifiedEvidenceCoverage: result.verifiedEvidenceCoverage,
    policyCap: result.policyCap,
    stageThresholdPassed: result.stageThresholdPassed,
    numericEligible: result.numericEligible,
    gateEligible: result.gateEligible,
    official: result.official,
    validationErrors: result.validationErrors,
    warnings: result.warnings,
    numericBlockers: result.numericBlockers,
    gateBlockers: result.gateBlockers,
    categorySummaries: result.categorySummaries,
    claimResults: result.claimResults,
  };
}

test("locks the canonical 51-claim manifest and 100-point archetype totals", () => {
  assert.equal(
    RUBRIC_MANIFEST_SHA256,
    "fa940feea694ee4df4aa064d2fc418e68a879f318c11e72cfbc4bf5a9d1c1d67",
  );
  assert.equal(RUBRIC.length, 51);
  assert.deepEqual(RUBRIC.map((row) => row.claimId), CANONICAL_CLAIM_IDS);
  assert.equal(new Set(RUBRIC.map((row) => row.claimId)).size, 51);
  assert.equal(new Set(RUBRIC.map((row) => row.categoryId)).size, 12);

  for (const archetype of ARCHETYPES) {
    const total = RUBRIC.reduce((sum, row) => sum + row.weights[archetype], 0);
    assert.ok(Math.abs(total - 100) < 1e-9, `${archetype} weights total ${total}`);
  }
});

test("all-E0 evidence preserves thesis merit but contributes no validation or confidence", () => {
  const result = scoreReview(buildReview());

  assert.equal(result.official, true, result.validationErrors.join("\n"));
  assert.equal(result.assessedClaims, 51);
  assert.equal(result.totalClaims, 51);
  assert.equal(result.lockedWeightTotal, 100);
  assert.equal(result.rawThesisScore, 100);
  assert.equal(result.validatedScore, 0);
  assert.equal(result.policyAdjustedValidatedScore, 0);
  assert.equal(result.evidenceConfidenceIndex, 0);
  assert.equal(result.verifiedEvidenceCoverage, 0);
  assert.equal(result.policyCap, 55);
  assert.equal(result.stageThresholdPassed, true);
  assert.equal(result.numericEligible, true);
  assert.equal(result.gateEligible, true);
});

test("an all-5/E4 production packet scores 100 and clears every numeric floor", () => {
  const input = buildReview({
    stage: "production",
    claim: () => ({ merit: 5, grade: "E4", evidenceType: "ProductionBehavior" }),
  });
  const result = scoreReview(input);

  assert.equal(result.official, true, result.validationErrors.join("\n"));
  assert.equal(result.rawThesisScore, 100);
  assert.equal(result.validatedScore, 100);
  assert.equal(result.policyAdjustedValidatedScore, 100);
  assert.equal(result.evidenceConfidenceIndex, 100);
  assert.equal(result.verifiedEvidenceCoverage, 100);
  assert.equal(result.policyCap, 100);
  assert.equal(result.stageThresholdPassed, true);
  assert.equal(result.numericEligible, true, result.numericBlockers.join("\n"));
  assert.equal(result.gateEligible, true, result.gateBlockers.join("\n"));
  assert.deepEqual(result.numericBlockers, []);
  assert.deepEqual(result.gateBlockers, []);
});

test("Enterprise Discovery merit 4/E1 reproduces the rejected PowerShell calibration", () => {
  const input = buildReview({
    archetype: "enterprise",
    stage: "discovery",
    claim: () => ({ merit: 4, grade: "E1", evidenceType: "DeskResearch" }),
  });
  const result = scoreReview(input);

  assert.equal(result.official, true, result.validationErrors.join("\n"));
  assert.equal(result.rawThesisScore, 80);
  assert.equal(result.validatedScore, 20);
  assert.equal(result.policyAdjustedValidatedScore, 20);
  assert.equal(result.evidenceConfidenceIndex, 25);
  assert.equal(result.verifiedEvidenceCoverage, 0);
  assert.equal(result.policyCap, 55);
  assert.equal(result.stageThresholdPassed, false);
  assert.equal(result.numericEligible, false);
  assert.equal(result.numericBlockers.length, 4);
  assert.ok(result.numericBlockers.some((blocker) => blocker.includes("1A lacks required evidence")));
  assert.ok(result.numericBlockers.some((blocker) => blocker.includes("1B lacks required evidence")));
  assert.ok(result.numericBlockers.some((blocker) => blocker.includes("2B lacks required direct-customer evidence")));
  assert.ok(result.numericBlockers.some((blocker) => blocker.includes("Verified Coverage is below 35")));
});

test("policy caps distinguish missing direct evidence from direct but uncommitted demand", async (t) => {
  await t.test("missing direct Problem/Demand evidence caps an otherwise 100 score at 55", () => {
    const result = scoreReview(buildReview({
      claim: () => ({ merit: 5, grade: "E4", evidenceType: "Audit" }),
    }));

    assert.equal(result.official, true, result.validationErrors.join("\n"));
    assert.equal(result.validatedScore, 100);
    assert.equal(result.policyCap, 55);
    assert.equal(result.policyAdjustedValidatedScore, 55);
    assert.ok(result.warnings.some((warning) => warning.includes("capped at 55")));
  });

  await t.test("direct observations without commitment cap the score at 70", () => {
    const result = scoreReview(buildReview({
      claim: (row) => row.claimId === "1A" || row.claimId === "2B"
        ? { merit: 5, grade: "E3", evidenceType: "CustomerObservation" }
        : { merit: 5, grade: "E4", evidenceType: "Audit" },
    }));

    assert.equal(result.official, true, result.validationErrors.join("\n"));
    assert.equal(result.validatedScore, 98.1);
    assert.equal(result.policyCap, 70);
    assert.equal(result.policyAdjustedValidatedScore, 70);
    assert.ok(result.warnings.some((warning) => warning.includes("capped at 70")));
    assert.ok(result.warnings.every((warning) => !warning.includes("capped at 55")));
  });
});

test("evidence types enforce their canonical maximum grades", () => {
  assert.deepEqual(EVIDENCE_TYPE_MAX_RANK, {
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
  });

  for (const [evidenceType, maximumRank] of Object.entries(EVIDENCE_TYPE_MAX_RANK) as [EvidenceType, number][]) {
    if (maximumRank === 4) continue;
    const invalidGrade = EVIDENCE_GRADES[maximumRank + 1];
    const input = buildReview();
    input.artifacts.push(artifactFor("1A", invalidGrade, evidenceType, {
      suffix: `CEILING-${evidenceType}`,
    }));
    const result = scoreReview(input);
    assert.equal(result.official, false, `${evidenceType}/${invalidGrade} should be rejected`);
    assert.ok(
      result.validationErrors.some((error) => error.includes(`${evidenceType} cannot support ${invalidGrade}`)),
      `${evidenceType}/${invalidGrade}: ${result.validationErrors.join(" | ")}`,
    );
  }
});

test("unresolved live counterevidence invalidates a packet until it is acknowledged", () => {
  const input = buildReview();
  const counterevidence = artifactFor("1A", "E1", "DeskResearch", {
    direction: "contradicts",
    suffix: "COUNTER-1A",
  });
  input.artifacts.push(counterevidence);

  const unresolved = scoreReview(input);
  assert.equal(unresolved.official, false);
  assert.ok(
    unresolved.validationErrors.includes("Claim 1A: counterevidence C-COUNTER-1A is not acknowledged."),
  );

  const acknowledgedInput = clone(input);
  const claim = acknowledgedInput.claims.find((item) => item.claimId === "1A");
  assert.ok(claim);
  claim.acknowledgedCounterEvidenceIds.push(counterevidence.evidenceClaimId);
  const acknowledged = scoreReview(acknowledgedInput);
  assert.equal(acknowledged.official, true, acknowledged.validationErrors.join("\n"));
  assert.ok(acknowledged.claimResults.find((item) => item.claimId === "1A")?.contradictions.includes(
    counterevidence.evidenceClaimId,
  ));
});

test("generation profiles cannot influence objective opportunity scoring", () => {
  const neutralProfile: GenerationProfile = {
    mode: "neutral",
    locked: true,
    searchThemes: [],
    fitDimensions: [],
    generationWeights: {
      personalFit: 0,
      opportunitySignal: 40,
      protocolAffordance: 30,
      experimentability: 30,
    },
  };
  const privateProfile: GenerationProfile = {
    mode: "private",
    locked: true,
    searchThemes: [
      { id: "T1", label: "Food", weight: 34 },
      { id: "T2", label: "Outdoors", weight: 33 },
      { id: "T3", label: "Experts", weight: 33 },
    ],
    fitDimensions: [
      { id: "F1", label: "Research", weight: 25 },
      { id: "F2", label: "Bridge building", weight: 25 },
      { id: "F3", label: "Speaking", weight: 25 },
      { id: "F4", label: "Independent work", weight: 25 },
    ],
    generationWeights: {
      personalFit: 35,
      opportunitySignal: 30,
      protocolAffordance: 15,
      experimentability: 20,
    },
  };
  const componentScores = {
    personalFit: 100,
    opportunitySignal: 0,
    protocolAffordance: 0,
    experimentability: 0,
  };
  assert.equal(calculateGenerationPriority(neutralProfile, componentScores), 0);
  assert.equal(calculateGenerationPriority(privateProfile, componentScores), 35);

  const review = buildReview({
    claim: () => ({ merit: 5, grade: "E4", evidenceType: "Audit" }),
  });
  const neutralContext = { ...clone(review), generationProfile: neutralProfile } as ReviewInput;
  const privateContext = { ...clone(review), generationProfile: privateProfile } as ReviewInput;

  assert.deepEqual(
    objectiveProjection(scoreReview(neutralContext)),
    objectiveProjection(scoreReview(privateContext)),
  );
});

test("identical inputs produce byte-for-byte identical outputs without mutation", () => {
  const input = buildReview({
    stage: "production",
    claim: () => ({ merit: 5, grade: "E4", evidenceType: "ProductionBehavior" }),
  });
  const before = JSON.stringify(input);
  const first = scoreReview(clone(input));
  const second = scoreReview(clone(input));
  const third = scoreReview(clone(input));

  assert.deepEqual(second, first);
  assert.deepEqual(third, first);
  assert.equal(second.inputFingerprint, first.inputFingerprint);
  assert.equal(third.inputFingerprint, first.inputFingerprint);
  assert.equal(JSON.stringify(input), before);
});
