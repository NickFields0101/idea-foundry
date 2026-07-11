import assert from "node:assert/strict";
import test from "node:test";

import type { DraftEvaluationResult } from "../app/desktop-bridge";
import type { EvidenceArtifact, GateAssessment, ReviewInput } from "../app/lib/scoring";

const scoringModuleUrl = new URL("../app/lib/scoring.ts", import.meta.url).href;
const quickRunModuleUrl = new URL("../app/lib/quick-run.ts", import.meta.url).href;
const { createDefaultGates, createEmptyClaims, scoreReview } = await import(scoringModuleUrl) as typeof import("../app/lib/scoring");
const { buildQuickRunPreview } = await import(quickRunModuleUrl) as typeof import("../app/lib/quick-run");

function evidenceFixture(): EvidenceArtifact {
  return {
    artifactId: "A-001",
    evidenceClaimId: "EC-001",
    title: "Reviewed customer observation",
    rubricClaimIds: ["1A"],
    sourceFamilyId: "SF-001",
    observationId: "OBS-001",
    duplicateOf: "",
    reviewerVerified: true,
    reviewer: "Human Reviewer",
    relationshipOrConflict: "None",
    evidenceType: "CustomerObservation",
    evidenceDate: "2026-07-09",
    expiryDate: "2027-07-09",
    grade: "E2",
    direction: "supports",
    sourceLocation: "Interview notes",
    sourceExcerpt: "The buyer completed the test twice.",
    sourceContentSha256: "abc123",
    ingestionOrigin: {
      kind: "ai-assisted",
      provider: "openrouter",
      model: "test/model",
    },
  };
}

function reviewFixture(withEvidence = true): ReviewInput {
  const claims = createEmptyClaims();
  const artifacts = withEvidence ? [evidenceFixture()] : [];
  if (withEvidence) {
    const first = claims.find((claim) => claim.claimId === "1A");
    assert.ok(first);
    first.grade = "E2";
    first.evidenceClaimIds = ["EC-001"];
    first.evidenceArtifactIds = ["A-001"];
    first.note = "Human note must survive.";
  }
  const gates = createDefaultGates();
  const humanGate = gates.find((gate) => gate.id === "G2");
  const conditionalGate = gates.find((gate) => gate.id === "G3");
  assert.ok(humanGate && conditionalGate);
  humanGate.status = "fail";
  humanGate.rationale = "Human rejection must win.";
  conditionalGate.status = "unresolved";

  return {
    archetype: "application",
    stage: "thesis",
    cutoffDate: "2026-07-10",
    protocolRoute: "unresolved",
    claims,
    artifacts,
    gates,
  };
}

function draftFixture(): DraftEvaluationResult {
  return {
    claims: [
      {
        claimId: "1A",
        suggestedMerit: 4,
        reasoning: "The problem is specific.",
        confidence: "medium",
        uncertainty: "Demand remains unverified.",
      },
      {
        claimId: "1B",
        suggestedMerit: null,
        reasoning: "There is not enough context.",
        confidence: "low",
        uncertainty: "The consequence is unknown.",
      },
      {
        claimId: "2A",
        suggestedMerit: 3.5,
        reasoning: "The actors are identified.",
        confidence: "medium",
        uncertainty: "Authority is untested.",
      },
    ],
    gates: [
      {
        gateId: "G1",
        suggestedStatus: "pass",
        reasoning: "The draft names a user and problem.",
        confidence: "medium",
        uncertainty: "No independent check exists.",
      },
      {
        gateId: "G2",
        suggestedStatus: "pass",
        reasoning: "AI must not override a human gate.",
        confidence: "high",
        uncertainty: "",
      },
      {
        gateId: "G3",
        suggestedStatus: "conditional",
        reasoning: "A condition still needs a human owner and deadline.",
        confidence: "medium",
        uncertainty: "Owner and thresholds are missing.",
      },
    ],
    provider: "openrouter",
    model: "test/model",
    provisional: true,
  };
}

function preview(review = reviewFixture(), draft = draftFixture()) {
  return buildQuickRunPreview({
    baseReview: review,
    draft,
    selectedIdeaId: "idea-001",
    selectedBy: "automated-priority",
    selectionPriority: 82.5,
    ideaRoute: "Both",
    sourceInputFingerprint: "source-fingerprint",
    createdAt: "2026-07-10T12:00:00.000Z",
  }, scoreReview);
}

test("one-click preview is isolated and preserves every evidence and human-owned field", () => {
  const review = reviewFixture();
  const draft = draftFixture();
  const reviewBefore = structuredClone(review);
  const draftBefore = structuredClone(draft);

  const result = preview(review, draft);

  assert.deepEqual(review, reviewBefore, "the live review must remain unchanged");
  assert.deepEqual(draft, draftBefore, "the model draft must remain unchanged");
  assert.notEqual(result.previewReview, review);
  assert.deepEqual(result.previewReview.artifacts, review.artifacts);
  assert.notEqual(result.previewReview.artifacts, review.artifacts);
  assert.notEqual(result.previewReview.artifacts[0], review.artifacts[0]);
  assert.equal(result.previewReview.artifacts[0].reviewerVerified, true);
  assert.equal(result.previewReview.artifacts[0].sourceExcerpt, review.artifacts[0].sourceExcerpt);

  const firstClaim = result.previewReview.claims.find((claim) => claim.claimId === "1A");
  assert.ok(firstClaim);
  assert.equal(firstClaim.merit, 4);
  assert.equal(firstClaim.grade, "E2");
  assert.deepEqual(firstClaim.evidenceClaimIds, ["EC-001"]);
  assert.deepEqual(firstClaim.evidenceArtifactIds, ["A-001"]);
  assert.equal(firstClaim.note, "Human note must survive.");

  const humanGate = result.previewReview.gates.find((gate) => gate.id === "G2");
  assert.ok(humanGate);
  assert.equal(humanGate.status, "fail");
  assert.equal(humanGate.rationale, "Human rejection must win.");
  assert.equal(result.previewReview.protocolRoute, "hybrid");
  assert.equal(result.protocolRouteFilled, true);
  assert.deepEqual(result.filledClaimIds, ["1A", "2A"]);
  assert.deepEqual(result.filledGateIds, ["G1", "G3"]);
});

test("missing, duplicate, unknown, and invalid proposals cannot silently complete a preview", () => {
  const draft = draftFixture();
  draft.claims = [
    { ...draft.claims[0], claimId: "99Z" },
    { ...draft.claims[0], claimId: "2A", suggestedMerit: 3 },
    { ...draft.claims[0], claimId: "2A", suggestedMerit: 5 },
    { ...draft.claims[0], claimId: "2B", suggestedMerit: 4.2 },
  ] as DraftEvaluationResult["claims"];
  draft.gates = [
    { ...draft.gates[0], gateId: "G1", suggestedStatus: "pass" },
    { ...draft.gates[0], gateId: "G1", suggestedStatus: "fail" },
    { ...draft.gates[0], gateId: "G9" },
    { ...draft.gates[0], gateId: "G3", suggestedStatus: "approved" },
  ] as DraftEvaluationResult["gates"];

  const result = preview(reviewFixture(false), draft);
  const claim2A = result.previewReview.claims.find((claim) => claim.claimId === "2A");
  const claim2B = result.previewReview.claims.find((claim) => claim.claimId === "2B");
  const gate1 = result.previewReview.gates.find((gate) => gate.id === "G1");
  const gate3 = result.previewReview.gates.find((gate) => gate.id === "G3");

  assert.equal(claim2A?.merit, 3, "the first valid proposal wins deterministically");
  assert.equal(claim2B?.merit, null, "off-anchor merit is ignored");
  assert.equal(gate1?.status, "pass", "the first valid gate proposal wins deterministically");
  assert.equal(gate3?.status, "unresolved", "unknown statuses are ignored");
  assert.ok(result.missingClaimIds.includes("2B"));
  assert.equal(result.previewReview.artifacts.length, 0, "the helper must never manufacture an evidence row");
  assert.equal(result.previewScore.official, false);
  assert.equal(result.status, "preview_incomplete");
});

test("unresolved and not-due AI gate suggestions do not count as decisions", () => {
  const draft = draftFixture();
  draft.gates = [
    { ...draft.gates[0], gateId: "G1", suggestedStatus: "unresolved" },
    { ...draft.gates[0], gateId: "G3", suggestedStatus: "not_due" },
  ];

  const result = preview(reviewFixture(false), draft);

  assert.deepEqual(result.filledGateIds, []);
  assert.equal(result.previewReview.gates.find((gate) => gate.id === "G1")?.status, "unresolved");
  assert.equal(result.previewReview.gates.find((gate) => gate.id === "G3")?.status, "unresolved");
});

test("the locked calculator receives an independent clone and its structural official flag never removes provisional provenance", () => {
  const review = reviewFixture();
  for (const claim of review.claims) claim.merit = 0;
  const reviewBefore = structuredClone(review);
  let calculatorInput: ReviewInput | null = null;

  const result = buildQuickRunPreview({
    baseReview: review,
    draft: { ...draftFixture(), claims: [], gates: [] },
    selectedIdeaId: "idea-human",
    selectedBy: "existing-user-choice",
    selectionPriority: 77,
    ideaRoute: "Xahau",
    sourceInputFingerprint: "source-fingerprint",
    createdAt: "2026-07-10T12:00:00.000Z",
  }, (scoreInput) => {
    calculatorInput = scoreInput;
    return scoreReview(scoreInput);
  });

  assert.deepEqual(review, reviewBefore);
  assert.ok(calculatorInput);
  assert.notEqual(calculatorInput, result.previewReview);
  assert.equal(result.previewScore.official, true, "all structural review fields are valid");
  assert.equal(result.provisional, true, "AI-selected inputs remain unapproved even when structurally valid");
  assert.equal(result.provenance, "ai-proposed-inputs");
  assert.equal(result.status, "preview_not_ready");
  assert.equal(result.selectedBy, "existing-user-choice");
});

test("existing human merits, gates, and protocol route always beat AI proposals", () => {
  const review = reviewFixture();
  const humanClaim = review.claims.find((claim) => claim.claimId === "1A");
  const humanGate = review.gates.find((gate) => gate.id === "G1");
  assert.ok(humanClaim && humanGate);
  humanClaim.merit = 1.5;
  humanGate.status = "fail";
  humanGate.rationale = "Human rationale";
  review.protocolRoute = "conventional";

  const result = preview(review);
  assert.equal(result.previewReview.claims.find((claim) => claim.claimId === "1A")?.merit, 1.5);
  assert.equal(result.previewReview.gates.find((gate) => gate.id === "G1")?.status, "fail");
  assert.equal(result.previewReview.gates.find((gate) => gate.id === "G1")?.rationale, "Human rationale");
  assert.equal(result.previewReview.protocolRoute, "conventional");
  assert.equal(result.protocolRouteFilled, false);
  assert.ok(!result.filledClaimIds.includes("1A"));
  assert.ok(!result.filledGateIds.includes("G1"));
});

test("conditional AI gates remain visibly incomplete instead of receiving fabricated human conditions", () => {
  const result = preview();
  const conditional = result.previewReview.gates.find((gate) => gate.id === "G3") as GateAssessment;

  assert.equal(conditional.status, "conditional");
  assert.equal(conditional.owner, "");
  assert.equal(conditional.deadline, "");
  assert.equal(conditional.expectedArtifact, "");
  assert.equal(conditional.passThreshold, "");
  assert.equal(conditional.killThreshold, "");
  assert.ok(result.previewScore.validationErrors.some((error) => error.includes("G3 conditional is missing")));
  assert.equal(result.status, "preview_incomplete");
});
