import assert from "node:assert/strict";
import test from "node:test";

const moduleUrl = new URL("../app/lib/idea-quality.ts", import.meta.url).href;
const { assessIdeaQuality, ideaSimilarity, selectQualitySlate } = await import(moduleUrl) as typeof import("../app/lib/idea-quality");

function strongIdea(overrides: Record<string, unknown> = {}) {
  return {
    title: "Independent repair receipts",
    concept: "A repair coordinator issues portable completion receipts after a buyer and an independent technician agree on the same job outcome.",
    user: "Independent appliance repair technicians",
    buyer: "Regional appliance warranty administrators",
    triggeringSituation: "A technician finishes a warranty repair but the administrator cannot verify the parts, timing, and customer sign-off.",
    currentAlternative: "Administrators reconcile emailed photos, invoices, and technician notes in a shared spreadsheet before releasing payment.",
    materialConsequence: "Disputed jobs delay technician payment and force warranty teams to spend hours rebuilding an incomplete service history.",
    whyNow: "Warranty networks are adding independent technicians faster than their manual review teams can reconcile completion records.",
    distributionWedge: "Start with one regional warranty administrator that already coordinates at least twenty independent repair shops.",
    adoptionFriction: "Technicians may refuse another capture step unless the receipt replaces existing photo and invoice uploads.",
    protocolNeed: "Xahau applies an account-level settlement rule while Evernode runs the independently hosted receipt reconciliation service across operators.",
    protocolCounterfactual: "A centralized database is cheaper, but it leaves the warranty administrator as the sole operator able to alter receipt history or service availability.",
    failureReason: "The new receipt step may create more work than the payment delay it removes.",
    criticalAssumption: "Technicians will capture the required receipt fields when doing so releases payment sooner than the current review queue.",
    experiment: "Within 14 days run ten concierge repair receipts; continue if six are completed without prompting and stop if fewer than three are completed.",
    experimentPlan: {
      durationDays: 14,
      method: "concierge" as const,
      target: "Ten live or recently completed warranty repair jobs",
      sampleSize: 10,
      artifact: "A timestamped completion receipt and operator review log for each job",
      metric: "Jobs completed without coordinator prompting and minutes saved per review",
      passThreshold: "At least 6 of 10 technicians complete the receipt and median review time falls by 20%",
      killThreshold: "Fewer than 3 of 10 technicians complete the receipt without repeated prompting",
    },
    route: "Both" as const,
    ...overrides,
  };
}

test("a specific, falsifiable protocol thesis passes the deterministic construction gate", () => {
  const report = assessIdeaQuality(strongIdea());
  assert.equal(report.disposition, "accept");
  assert.ok(report.thesisQuality >= 90);
  assert.equal(report.protocolAssessment.status, "required");
  assert.deepEqual(report.blockers, []);
});

test("generic AI and blockchain language cannot compensate for a missing thesis", () => {
  const report = assessIdeaQuality(strongIdea({
    title: "Revolutionary AI-powered decentralized ecosystem",
    concept: "A seamless web3 platform for everyone.",
    user: "Everyone",
    buyer: "Businesses",
    triggeringSituation: "When users need it",
    currentAlternative: "Manual methods",
    materialConsequence: "Things are inefficient",
    whyNow: "AI is growing",
    distributionWedge: "Go viral",
    adoptionFriction: "None",
    protocolNeed: "Decentralization",
    protocolCounterfactual: "Blockchain is better",
    criticalAssumption: "People want trust",
    experiment: "Ask users",
    experimentPlan: undefined,
    route: "Both",
  }));
  assert.equal(report.disposition, "reject");
  assert.ok(report.thesisQuality < 55);
  assert.ok(report.blockers.some(({ code }) => code === "protocol.both_incomplete"));
  assert.ok(report.warnings.some(({ code }) => code === "clarity.marketing_language"));
});

test("fabricated traction is rejected even when the rest of the idea is strong", () => {
  const report = assessIdeaQuality(strongIdea({
    materialConsequence: "Customers already paid for this workflow and users love it in production.",
  }));
  assert.equal(report.disposition, "reject");
  assert.ok(report.blockers.some(({ code }) => code === "integrity.unsupported_validation_claim"));
});

test("a strong conventional idea can pass without laundering a protocol route", () => {
  const report = assessIdeaQuality(strongIdea({
    title: "Trail meal planner",
    protocolNeed: "No protocol is required for a single-user meal planning workflow.",
    protocolCounterfactual: "A conventional local database keeps the plan private and is simpler than shared consensus.",
    route: "Neither yet",
  }));
  assert.equal(report.disposition, "accept");
  assert.deepEqual(report.protocolAssessment, { status: "none", quality: null });
});

test("a Both route without separate Xahau and Evernode jobs fails closed", () => {
  const report = assessIdeaQuality(strongIdea({
    protocolNeed: "Xahau stores the settlement rule for the receipt.",
    protocolCounterfactual: "A centralized database leaves one warranty operator in control.",
  }));
  assert.equal(report.disposition, "reject");
  assert.ok(report.blockers.some(({ code }) => code === "protocol.both_incomplete"));
});

test("slate selection removes near duplicates before applying the requested count", () => {
  const first = strongIdea();
  const duplicate = strongIdea({ title: "Portable independent repair records" });
  const different = strongIdea({
    title: "Equipment deposit guard",
    user: "Small construction equipment rental operators",
    buyer: "Independent equipment rental owners",
    triggeringSituation: "A renter returns equipment after hours and the owner must decide whether damage existed before the rental.",
    currentAlternative: "The owner compares phone photos and a paper checkout form before manually returning the deposit.",
    concept: "An account-level deposit rule releases or holds a rental deposit against a jointly signed condition record.",
    criticalAssumption: "Renters will complete a condition record to receive the deposit immediately.",
  });
  assert.ok(ideaSimilarity(first, duplicate) >= 0.72);
  const slate = selectQualitySlate([first, duplicate, different], 3, (candidate) => candidate === duplicate ? 99 : 80);
  assert.equal(slate.selected.length, 2);
  assert.equal(slate.partial, true);
});

test("quality is stable under whitespace, punctuation, and repeated evaluation", () => {
  const idea = strongIdea();
  const spaced = strongIdea({
    concept: `  ${idea.concept.replaceAll(" ", "   ")}  `,
    title: `${idea.title}!!!`,
  });
  assert.deepEqual(assessIdeaQuality(idea), assessIdeaQuality(idea));
  assert.equal(assessIdeaQuality(spaced).thesisQuality, assessIdeaQuality(idea).thesisQuality);
});
