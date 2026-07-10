import assert from "node:assert/strict";
import test from "node:test";

import type {
  DraftEvaluationResult,
  EvidenceProposal,
  ExtractEvidenceResult,
} from "../app/desktop-bridge";
import type {
  ClaimAssessment,
  EvidenceArtifact,
  GateAssessment,
  ReviewInput,
} from "../app/lib/scoring";

const helperModuleUrl = new URL("../app/lib/ai-assistance.ts", import.meta.url).href;
const {
  AiAssistanceError,
  applyEvaluationProposals,
  applyEvidenceProposals,
  normalizeEvidenceText,
  sourceContentSha256,
} = await import(helperModuleUrl) as typeof import("../app/lib/ai-assistance");

const baseClaim = (claimId: string, merit: number | null = null): ClaimAssessment => ({
  claimId,
  merit,
  grade: "E0",
  evidenceClaimIds: [],
  evidenceArtifactIds: [],
  acknowledgedCounterEvidenceIds: [],
});

const baseGate = (id: GateAssessment["id"] = "G1"): GateAssessment => ({
  id,
  status: "unresolved",
  rationale: "Human gate state",
  owner: "",
  deadline: "",
  expectedArtifact: "",
  passThreshold: "",
  killThreshold: "",
});

function reviewFixture(): ReviewInput {
  return {
    archetype: "application",
    stage: "thesis",
    cutoffDate: "2026-07-10",
    protocolRoute: "unresolved",
    claims: [baseClaim("1A"), baseClaim("1B", 4), baseClaim("2A")],
    artifacts: [],
    gates: [baseGate()],
  };
}

function evaluationDraft(
  claims: DraftEvaluationResult["claims"] = [
    {
      claimId: "1A",
      suggestedMerit: 3.5,
      reasoning: "The problem statement is specific.",
      confidence: "medium",
      uncertainty: "No interview evidence yet.",
    },
    {
      claimId: "1B",
      suggestedMerit: 5,
      reasoning: "Strong consequence.",
      confidence: "low",
      uncertainty: "Unverified.",
    },
    {
      claimId: "2A",
      suggestedMerit: null,
      reasoning: "Insufficient context.",
      confidence: "low",
      uncertainty: "The actor is unknown.",
    },
  ],
): DraftEvaluationResult {
  return {
    claims,
    gates: [{
      gateId: "G1",
      suggestedStatus: "fail",
      reasoning: "AI gate suggestion must not be applied.",
      confidence: "high",
      uncertainty: "",
    }],
    provider: "openrouter",
    model: "anthropic/claude-opus-4.1",
    provisional: true,
  };
}

function evidenceProposal(overrides: Partial<EvidenceProposal> = {}): EvidenceProposal {
  return {
    title: "Interview signal",
    sourceExcerpt: "Three of five buyers asked for a paid pilot.",
    claimIds: ["1A"],
    suggestedType: "CustomerCommitment",
    suggestedGrade: "E3",
    direction: "supports",
    verificationStatus: "source_supported",
    unverifiable: false,
    unverifiableReason: "",
    reasoning: "The statement records buyer intent.",
    confidence: "high",
    uncertainty: "Payment has not happened.",
    reviewerVerified: false,
    ...overrides,
  };
}

function evidenceDraft(evidence: EvidenceProposal[] = [evidenceProposal()]): ExtractEvidenceResult {
  return {
    evidence,
    sourceLabel: "Interview notes, July 10",
    provider: "openrouter",
    model: "anthropic/claude-opus-4.1",
    provisional: true,
  };
}

const humanApproval = {
  reviewerVerified: true,
  reviewer: "Nick",
  relationshipOrConflict: "No conflict",
  evidenceDate: "2026-07-10",
  expiryDate: "2027-07-10",
};

function errorCode(error: unknown) {
  assert.ok(error instanceof AiAssistanceError);
  return error.code;
}

test("evaluation approval changes only selected unanswered merits and a provenance note", () => {
  const review = reviewFixture();
  const draft = evaluationDraft();
  const reviewBefore = JSON.stringify(review);
  const draftBefore = JSON.stringify(draft);

  const result = applyEvaluationProposals({
    review,
    draft,
    selectedClaimIds: ["1A", "1B", "2A"],
    expectedContextFingerprint: "review-fp-1",
    currentContextFingerprint: "review-fp-1",
  });

  assert.equal(JSON.stringify(review), reviewBefore, "the live review must not be mutated");
  assert.equal(JSON.stringify(draft), draftBefore, "the AI draft must not be mutated");
  assert.deepEqual(result.previousReview, review);
  assert.notEqual(result.previousReview, review);
  assert.deepEqual(result.appliedClaimIds, ["1A"]);
  assert.deepEqual(result.skippedClaimIds, ["1B", "2A"]);
  assert.equal(result.review.claims[0].merit, 3.5);
  assert.match(result.review.claims[0].note ?? "", /AI draft \(openrouter\/anthropic\/claude-opus-4\.1/);
  assert.equal(result.review.claims[0].grade, "E0");
  assert.deepEqual(result.review.claims[0].evidenceArtifactIds, []);
  assert.equal(result.review.claims[1].merit, 4, "answered claims are never overwritten");
  assert.equal(result.review.claims[2].merit, null, "a null suggestion remains unanswered");
  assert.deepEqual(result.review.gates, review.gates, "gate proposals are never bulk-applied");
  assert.deepEqual(result.review.artifacts, review.artifacts);
});

test("evaluation approval rejects stale, duplicate, unknown, and invalid merit proposals", async (t) => {
  const common = {
    review: reviewFixture(),
    selectedClaimIds: ["1A"],
    expectedContextFingerprint: "before",
    currentContextFingerprint: "before",
  };

  await t.test("stale context", () => {
    assert.throws(
      () => applyEvaluationProposals({ ...common, draft: evaluationDraft(), currentContextFingerprint: "after" }),
      (error) => errorCode(error) === "stale_context",
    );
  });
  await t.test("duplicate proposal IDs", () => {
    const duplicate = evaluationDraft([
      evaluationDraft().claims[0],
      { ...evaluationDraft().claims[0], suggestedMerit: 2 },
    ]);
    assert.throws(
      () => applyEvaluationProposals({ ...common, draft: duplicate }),
      (error) => errorCode(error) === "invalid_proposal",
    );
  });
  await t.test("unknown proposal ID", () => {
    const unknown = evaluationDraft([{ ...evaluationDraft().claims[0], claimId: "99Z" }]);
    assert.throws(
      () => applyEvaluationProposals({ ...common, draft: unknown, selectedClaimIds: ["99Z"] }),
      (error) => errorCode(error) === "invalid_proposal",
    );
  });
  await t.test("duplicate selection", () => {
    assert.throws(
      () => applyEvaluationProposals({ ...common, draft: evaluationDraft(), selectedClaimIds: ["1A", "1a"] }),
      (error) => errorCode(error) === "invalid_selection",
    );
  });
  await t.test("merit outside the half-point scale", () => {
    const invalid = evaluationDraft([{ ...evaluationDraft().claims[0], suggestedMerit: 3.2 }]);
    assert.throws(
      () => applyEvaluationProposals({ ...common, draft: invalid }),
      (error) => errorCode(error) === "invalid_proposal",
    );
  });
});

test("evidence approval requires exact normalized excerpts and creates traceable, collision-free artifacts", () => {
  const review = reviewFixture();
  review.artifacts.push({
    artifactId: "A-001",
    evidenceClaimId: "EC-001",
    title: "Existing",
    rubricClaimIds: ["1A"],
    sourceFamilyId: "SF-001",
    observationId: "OBS-001",
    duplicateOf: "",
    reviewerVerified: false,
    reviewer: "",
    relationshipOrConflict: "",
    evidenceType: "FounderAssertion",
    evidenceDate: "",
    expiryDate: "",
    grade: "E0",
    direction: "supports",
  });
  const sourceText = "Interview notes:\r\nThree of five buyers asked for a paid pilot.\nOne buyer declined.";
  const draft = evidenceDraft([
    evidenceProposal(),
    evidenceProposal({
      title: "Declined buyer",
      sourceExcerpt: "One buyer declined.",
      claimIds: ["1B"],
      suggestedType: "CustomerObservation",
      suggestedGrade: "E2",
      direction: "contradicts",
    }),
  ]);
  const beforeReview = JSON.stringify(review);
  const beforeDraft = JSON.stringify(draft);

  const result = applyEvidenceProposals({
    review,
    draft,
    selectedProposalIndexes: [0, 1],
    linkSupportingProposalIndexes: [0],
    sourceText,
    sourceLabel: "Buyer interviews",
    humanApproval,
    expectedContextFingerprint: "fp",
    currentContextFingerprint: "fp",
  });

  assert.equal(JSON.stringify(review), beforeReview);
  assert.equal(JSON.stringify(draft), beforeDraft);
  assert.deepEqual(result.previousReview, review, "undo snapshot preserves optional-field absence exactly");
  assert.equal(result.artifacts.length, 2);
  assert.equal(new Set(result.artifacts.map((artifact) => artifact.sourceFamilyId)).size, 1);
  assert.equal(result.sourceFamilyId, "SF-002");
  assert.deepEqual(result.artifacts.map((artifact) => artifact.artifactId), ["A-002", "A-003"]);
  assert.deepEqual(result.artifacts.map((artifact) => artifact.evidenceClaimId), ["EC-002", "EC-003"]);
  assert.deepEqual(result.artifacts.map((artifact) => artifact.observationId), ["OBS-002", "OBS-003"]);
  assert.ok(result.artifacts.every((artifact) => artifact.sourceContentSha256 === result.sourceContentSha256));
  assert.ok(result.artifacts.every((artifact) => artifact.ingestionOrigin?.kind === "ai-assisted"));
  assert.equal(result.artifacts[0].sourceExcerpt, draft.evidence[0].sourceExcerpt);
  assert.equal(result.review.claims[0].grade, "E3");
  assert.deepEqual(result.review.claims[0].evidenceArtifactIds, ["A-002"]);
  assert.deepEqual(result.review.claims[0].evidenceClaimIds, ["EC-002"]);
  assert.deepEqual(result.review.claims[1].acknowledgedCounterEvidenceIds, [], "AI cannot acknowledge contradictions");
  assert.deepEqual(result.linkedClaimIds, ["1A"]);
});

test("repeat processing reuses a source family and rejects duplicate excerpts", () => {
  const sourceText = "Earlier observation. Three of five buyers asked for a paid pilot.";
  const review = reviewFixture();
  review.artifacts.push({
    artifactId: "A-009",
    evidenceClaimId: "EC-009",
    title: "Earlier observation",
    rubricClaimIds: ["1A"],
    sourceFamilyId: "SF-009",
    observationId: "OBS-009",
    duplicateOf: "",
    reviewerVerified: false,
    reviewer: "",
    relationshipOrConflict: "",
    evidenceType: "FounderAssertion",
    evidenceDate: "",
    expiryDate: "",
    grade: "E0",
    direction: "supports",
    sourceExcerpt: "Earlier observation.",
    sourceContentSha256: sourceContentSha256(sourceText),
  });
  const draft = evidenceDraft();
  const common = {
    draft,
    selectedProposalIndexes: [0],
    sourceText,
    sourceLabel: "Buyer interviews",
    humanApproval,
    expectedContextFingerprint: "fp",
    currentContextFingerprint: "fp",
  };

  const result = applyEvidenceProposals({ ...common, review });
  assert.equal(result.sourceFamilyId, "SF-009");
  assert.equal(result.artifacts[0].sourceFamilyId, "SF-009");
  assert.throws(
    () => applyEvidenceProposals({ ...common, review: result.review }),
    (error) => errorCode(error) === "invalid_selection",
  );
});

test("evidence approval independently enforces source matching, verification, ceilings, and stale context", async (t) => {
  const base = {
    review: reviewFixture(),
    selectedProposalIndexes: [0],
    sourceText: "Three of five buyers asked for a paid pilot.",
    humanApproval,
    expectedContextFingerprint: "fp",
    currentContextFingerprint: "fp",
  };

  await t.test("normalization is display-only and non-verbatim or fabricated excerpts are rejected", () => {
    assert.equal(normalizeEvidenceText(" Three\n of  five "), "Three of five");
    const nonVerbatim = evidenceDraft([evidenceProposal({ sourceExcerpt: "Three  of five buyers asked for a paid pilot." })]);
    assert.throws(
      () => applyEvidenceProposals({ ...base, draft: nonVerbatim }),
      (error) => errorCode(error) === "invalid_source",
    );
    const fabricated = evidenceDraft([evidenceProposal({ sourceExcerpt: "All buyers prepaid." })]);
    assert.throws(
      () => applyEvidenceProposals({ ...base, draft: fabricated }),
      (error) => errorCode(error) === "invalid_source",
    );
  });
  await t.test("AI reviewerVerified output cannot bypass explicit human verification", () => {
    const malicious = evidenceDraft([
      { ...evidenceProposal(), reviewerVerified: true } as unknown as EvidenceProposal,
    ]);
    assert.throws(
      () => applyEvidenceProposals({
        ...base,
        draft: malicious,
        humanApproval: { ...humanApproval, reviewerVerified: false },
      }),
      (error) => errorCode(error) === "verification_required",
    );
  });
  await t.test("E2+ also requires reviewer and conflict disclosure", () => {
    const draft = evidenceDraft([evidenceProposal()]);
    assert.throws(
      () => applyEvidenceProposals({ ...base, draft, humanApproval: { ...humanApproval, reviewer: "" } }),
      (error) => errorCode(error) === "verification_required",
    );
    assert.throws(
      () => applyEvidenceProposals({
        ...base,
        draft,
        humanApproval: { ...humanApproval, relationshipOrConflict: "" },
      }),
      (error) => errorCode(error) === "verification_required",
    );
  });
  await t.test("expiry cannot predate the evidence", () => {
    const draft = evidenceDraft([evidenceProposal()]);
    assert.throws(
      () => applyEvidenceProposals({
        ...base,
        draft,
        humanApproval: { ...humanApproval, expiryDate: "2026-07-09" },
      }),
      (error) => errorCode(error) === "verification_required",
    );
  });
  await t.test("evidence cannot postdate the review cutoff", () => {
    const draft = evidenceDraft([evidenceProposal()]);
    assert.throws(
      () => applyEvidenceProposals({
        ...base,
        draft,
        humanApproval: { ...humanApproval, evidenceDate: "2026-07-11", expiryDate: "2027-07-11" },
      }),
      (error) => errorCode(error) === "verification_required",
    );
  });
  await t.test("type ceilings lower an unsupported grade", () => {
    const draft = evidenceDraft([evidenceProposal({ suggestedType: "DeskResearch", suggestedGrade: "E4" })]);
    const result = applyEvidenceProposals({
      ...base,
      draft,
      humanApproval: { ...humanApproval, reviewerVerified: false, reviewer: "", relationshipOrConflict: "" },
    });
    assert.equal(result.artifacts[0].grade, "E1");
    assert.deepEqual(result.gradeAdjustments, [{
      proposalIndex: 0,
      requestedGrade: "E4",
      appliedGrade: "E1",
      evidenceType: "DeskResearch",
    }]);
  });
  await t.test("stale context", () => {
    assert.throws(
      () => applyEvidenceProposals({ ...base, draft: evidenceDraft([evidenceProposal()]), currentContextFingerprint: "changed" }),
      (error) => errorCode(error) === "stale_context",
    );
  });
});

test("evidence selection rejects unknown and duplicate IDs and never auto-links or acknowledges contradictions", async (t) => {
  const base = {
    review: reviewFixture(),
    sourceText: "Three of five buyers asked for a paid pilot.",
    humanApproval,
    expectedContextFingerprint: "fp",
    currentContextFingerprint: "fp",
  };

  await t.test("unknown claim", () => {
    const draft = evidenceDraft([evidenceProposal({ claimIds: ["99Z"] })]);
    assert.throws(
      () => applyEvidenceProposals({ ...base, draft, selectedProposalIndexes: [0] }),
      (error) => errorCode(error) === "invalid_proposal",
    );
  });
  await t.test("duplicate claim ID", () => {
    const draft = evidenceDraft([evidenceProposal({ claimIds: ["1A", "1a"] })]);
    assert.throws(
      () => applyEvidenceProposals({ ...base, draft, selectedProposalIndexes: [0] }),
      (error) => errorCode(error) === "invalid_selection",
    );
  });
  await t.test("duplicate selected index", () => {
    const draft = evidenceDraft([evidenceProposal()]);
    assert.throws(
      () => applyEvidenceProposals({ ...base, draft, selectedProposalIndexes: [0, 0] }),
      (error) => errorCode(error) === "invalid_selection",
    );
  });
  await t.test("supporting evidence remains staged unless linking is explicitly selected", () => {
    const result = applyEvidenceProposals({
      ...base,
      draft: evidenceDraft([evidenceProposal()]),
      selectedProposalIndexes: [0],
    });
    assert.equal(result.review.claims[0].grade, "E0");
    assert.deepEqual(result.review.claims[0].evidenceArtifactIds, []);
  });
  await t.test("contradiction cannot be linked or self-acknowledged", () => {
    const draft = evidenceDraft([evidenceProposal({ direction: "contradicts" })]);
    assert.throws(
      () => applyEvidenceProposals({
        ...base,
        draft,
        selectedProposalIndexes: [0],
        linkSupportingProposalIndexes: [0],
      }),
      (error) => errorCode(error) === "invalid_selection",
    );
    const staged = applyEvidenceProposals({ ...base, draft, selectedProposalIndexes: [0] });
    assert.deepEqual(staged.review.claims[0].acknowledgedCounterEvidenceIds, []);
  });
});

test("source hashes are standards-compliant and provenance metadata does not affect scoring rules", async () => {
  assert.equal(
    sourceContentSha256("abc"),
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
  );
  assert.equal(sourceContentSha256("a\r\nb"), sourceContentSha256("a\nb"));

  const scoringUrl = new URL("../app/lib/scoring.ts", import.meta.url).href;
  const { createDefaultGates, createEmptyClaims, scoreReview } = await import(scoringUrl) as typeof import("../app/lib/scoring");
  const artifact: EvidenceArtifact = {
    artifactId: "A-001",
    evidenceClaimId: "EC-001",
    title: "Ledger placeholder",
    rubricClaimIds: ["1A"],
    sourceFamilyId: "SF-001",
    observationId: "OBS-001",
    duplicateOf: "",
    reviewerVerified: false,
    reviewer: "",
    relationshipOrConflict: "",
    evidenceType: "FounderAssertion",
    evidenceDate: "",
    expiryDate: "",
    grade: "E0",
    direction: "supports",
  };
  const review: ReviewInput = {
    archetype: "application",
    stage: "thesis",
    cutoffDate: "2026-07-10",
    protocolRoute: "unresolved",
    claims: createEmptyClaims().map((claim) => ({ ...claim, merit: 5 })),
    artifacts: [artifact],
    gates: createDefaultGates(),
  };
  const withMetadata: ReviewInput = {
    ...review,
    artifacts: [{
      ...artifact,
      sourceExcerpt: "Ledger placeholder",
      sourceContentSha256: sourceContentSha256("Ledger placeholder"),
      ingestionOrigin: { kind: "ai-assisted", provider: "openrouter", model: "model" },
    }],
  };
  const plainResult = scoreReview(review);
  const metadataResult = scoreReview(withMetadata);
  assert.notEqual(plainResult.inputFingerprint, metadataResult.inputFingerprint, "provenance is audit-fingerprinted");
  assert.deepEqual(
    { ...plainResult, inputFingerprint: "ignored" },
    { ...metadataResult, inputFingerprint: "ignored" },
    "optional provenance must not alter deterministic scoring or validation",
  );
});
