import assert from "node:assert/strict";
import test from "node:test";

import type { ResearchEvidenceResult } from "../app/desktop-bridge";
import type { ClaimAssessment, ReviewInput } from "../app/lib/scoring";

const researchModuleUrl = new URL("../app/lib/research-run.ts", import.meta.url).href;
const assistanceModuleUrl = new URL("../app/lib/ai-assistance.ts", import.meta.url).href;
const { applyResearchEvidenceBatch } = await import(researchModuleUrl) as typeof import("../app/lib/research-run");
const { AiAssistanceError, sourceContentSha256 } = await import(assistanceModuleUrl) as typeof import("../app/lib/ai-assistance");

const claim = (claimId: string): ClaimAssessment => ({
  claimId,
  merit: 3,
  grade: "E0",
  evidenceClaimIds: [],
  evidenceArtifactIds: [],
  acknowledgedCounterEvidenceIds: [],
});

function reviewFixture(): ReviewInput {
  return {
    archetype: "application",
    stage: "thesis",
    cutoffDate: "2026-07-10",
    protocolRoute: "unresolved",
    claims: [claim("1A"), claim("1B")],
    artifacts: [],
    gates: [],
  };
}

function researchFixture(): ResearchEvidenceResult {
  const first = "A 2026 industry survey reports that 61% of sampled operators still reconcile service receipts manually.";
  const second = "A separate field report found no measurable reduction in disputes after a shared receipt pilot.";
  return {
    citations: [
      {
        sourceId: "SRC-001",
        url: "https://example.org/operator-survey",
        title: "Operator survey",
        content: first,
        contentSha256: sourceContentSha256(first),
      },
      {
        sourceId: "SRC-002",
        url: "https://research.example.net/receipt-pilot",
        title: "Receipt pilot field report",
        content: second,
        contentSha256: sourceContentSha256(second),
      },
    ],
    evidence: [
      {
        title: "Manual reconciliation remains common",
        sourceId: "SRC-001",
        sourceUrl: "https://example.org/operator-survey",
        sourceTitle: "Operator survey",
        sourceExcerpt: first,
        claimIds: ["1A"],
        suggestedType: "DeskResearch",
        suggestedGrade: "E1",
        direction: "supports",
        verificationStatus: "provider_excerpt",
        reasoning: "The excerpt describes the current workflow.",
        confidence: "medium",
        uncertainty: "Sampling details still require review.",
        reviewerVerified: false,
      },
      {
        title: "Pilot did not reduce disputes",
        sourceId: "SRC-002",
        sourceUrl: "https://research.example.net/receipt-pilot",
        sourceTitle: "Receipt pilot field report",
        sourceExcerpt: second,
        claimIds: ["1B"],
        suggestedType: "DeskResearch",
        suggestedGrade: "E1",
        direction: "contradicts",
        verificationStatus: "provider_excerpt",
        reasoning: "The result challenges the expected consequence.",
        confidence: "high",
        uncertainty: "One pilot may not generalize.",
        reviewerVerified: false,
      },
    ],
    provider: "openrouter",
    model: "anthropic/claude-sonnet-4",
    researchEngine: "exa",
    researchedAt: "2026-07-10T12:00:00.000Z",
    webSearchRequests: 2,
    provisional: true,
  };
}

function code(error: unknown) {
  assert.ok(error instanceof AiAssistanceError);
  return error.code;
}

test("one consolidated research approval atomically adds capped E1 records with citation provenance", () => {
  const review = reviewFixture();
  const result = researchFixture();
  const reviewBefore = JSON.stringify(review);
  const researchBefore = JSON.stringify(result);

  const applied = applyResearchEvidenceBatch({
    review,
    result,
    selectedProposalIndexes: [0, 1],
    expectedContextFingerprint: "research-context-1",
    currentContextFingerprint: "research-context-1",
  });

  assert.equal(JSON.stringify(review), reviewBefore, "the live review is untouched until the caller commits once");
  assert.equal(JSON.stringify(result), researchBefore, "the provider packet is never mutated");
  assert.equal(applied.artifacts.length, 2);
  assert.ok(applied.artifacts.every((artifact) => artifact.evidenceType === "DeskResearch"));
  assert.ok(applied.artifacts.every((artifact) => artifact.grade === "E1"));
  assert.ok(applied.artifacts.every((artifact) => artifact.reviewerVerified === false));
  assert.ok(applied.artifacts.every((artifact) => artifact.ingestionOrigin?.mode === "researched"));
  assert.ok(applied.artifacts.every((artifact) => artifact.ingestionOrigin?.searchProvider === "openrouter-exa"));
  assert.equal(applied.review.claims[0].grade, "E1");
  assert.equal(applied.review.claims[0].evidenceArtifactIds.length, 1, "supporting evidence is linked");
  assert.equal(applied.review.claims[1].grade, "E0", "contradicting evidence never raises a grade");
  assert.deepEqual(applied.review.claims[1].acknowledgedCounterEvidenceIds, [], "counterevidence is never auto-acknowledged");
});

test("research application fails closed for stale, tampered, upgraded, or private-network findings", async (t) => {
  const base = {
    review: reviewFixture(),
    selectedProposalIndexes: [0],
    expectedContextFingerprint: "before",
    currentContextFingerprint: "before",
  };

  await t.test("stale packet", () => {
    assert.throws(
      () => applyResearchEvidenceBatch({ ...base, result: researchFixture(), currentContextFingerprint: "after" }),
      (error) => code(error) === "stale_context",
    );
  });
  await t.test("tampered citation corpus", () => {
    const result = researchFixture();
    result.citations[0].content += " changed";
    assert.throws(
      () => applyResearchEvidenceBatch({ ...base, result }),
      (error) => code(error) === "invalid_source",
    );
  });
  await t.test("attempted evidence upgrade", () => {
    const result = researchFixture();
    Object.assign(result.evidence[0], { suggestedGrade: "E4" });
    assert.throws(
      () => applyResearchEvidenceBatch({ ...base, result }),
      (error) => code(error) === "invalid_source",
    );
  });
  await t.test("non-public citation URL", () => {
    const result = researchFixture();
    result.citations[0].url = "https://127.0.0.1/private";
    result.evidence[0].sourceUrl = "https://127.0.0.1/private";
    assert.throws(
      () => applyResearchEvidenceBatch({ ...base, result }),
      (error) => code(error) === "invalid_source",
    );
  });
});

test("a bad second source cannot partially alter the caller's review", () => {
  const review = reviewFixture();
  const result = researchFixture();
  result.evidence[1].sourceExcerpt = "This sentence was invented by the model.";
  const before = JSON.stringify(review);
  assert.throws(
    () => applyResearchEvidenceBatch({
      review,
      result,
      selectedProposalIndexes: [0, 1],
      expectedContextFingerprint: "same",
      currentContextFingerprint: "same",
    }),
    (error) => code(error) === "invalid_source",
  );
  assert.equal(JSON.stringify(review), before);
});
