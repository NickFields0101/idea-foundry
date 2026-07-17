import assert from "node:assert/strict";
import test from "node:test";

const moduleUrl = new URL("../app/lib/intelligence-client.ts", import.meta.url).href;
const {
  intelligenceContextSummary,
  runCompetitorRedTeamIntelligence,
  runIdeaForgeIntelligence,
} = await import(moduleUrl) as typeof import("../app/lib/intelligence-client");

function inputFixture() {
  return {
    task: "competitor_red_team" as const,
    context: {
      idea: {
        title: "Proof Market",
        concept: "A verifiable service marketplace.",
        user: "Independent operators",
        buyer: "Service buyers",
        currentAlternative: "Manual referrals",
        criticalAssumption: "Buyers value verifiable completion.",
        experiment: "Run five concierge transactions.",
        route: "Both" as const,
      },
      projectBoundary: "Coordination failures in service marketplaces",
      publicSources: [],
    },
    limits: { timeoutMs: 5_000, maxSources: 8 },
  };
}

function installBridge(intelligence: Record<string, unknown>) {
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { sift: { intelligence } },
  });
}

function ideaForgeInputFixture() {
  return {
    task: "idea_forge" as const,
    context: {
      opportunityBoundary: "  Healthy food decisions for everyday consumers  ",
      requestedCount: 1,
      profile: {
        mode: "private" as const,
        searchThemes: [
          { label: "Healthy habits", weight: 60 },
          { label: "Expert access", weight: 40 },
        ],
        fitDimensions: [
          { label: "Research", weight: 50 },
          { label: "Bridge building", weight: 50 },
        ],
        workStylePreferences: [{ label: "Autonomy", orientation: "Prefers independent work" }],
      },
    },
    limits: { timeoutMs: 180_000 },
  };
}

function forgedIdea() {
  return {
    title: "Food Claim Translator",
    concept: "Translate package claims into comparable, source-linked consumer explanations.",
    user: "Health-conscious grocery shoppers",
    buyer: "Independent grocers",
    triggeringSituation: "A shopper compares two products with unfamiliar claims.",
    currentAlternative: "Search engines and inconsistent package labels",
    materialConsequence: "Shoppers make decisions without understanding the claimed tradeoffs.",
    whyNow: "More consumers use AI while product claims continue to proliferate.",
    distributionWedge: "Partner with one independent grocer and its nutrition educators.",
    adoptionFriction: "Retailers may not want comparisons that disadvantage stocked products.",
    protocolNeed: "Independent experts need a shared history of signed claim interpretations.",
    protocolCounterfactual: "Use a conventional signed database unless cross-organization portability is required.",
    failureReason: "Consumers may prefer faster, simpler nutrition scores.",
    criticalAssumption: "Shoppers will scan a claim before choosing between close substitutes.",
    experiment: "Run a two-week concierge comparison test with 12 shoppers.",
    experimentPlan: {
      durationDays: 14,
      method: "concierge",
      target: "Shoppers comparing two packaged foods",
      sampleSize: 12,
      artifact: "Annotated comparison cards",
      metric: "Percentage who scan and change or confirm a choice",
      passThreshold: "At least 6 of 12 use a card and 4 report improved confidence.",
      killThreshold: "Fewer than 3 of 12 use a card when offered.",
    },
    route: "Neither yet",
    scores: {
      personalFit: 88,
      opportunitySignal: 72,
      protocolAffordance: 35,
      experimentability: 91,
    },
  };
}

function ideaForgeResult() {
  return {
    task: "idea_forge",
    provisional: true,
    evidenceKind: "hypothesis",
    customerValidation: false,
    pipelineVersion: "idea-forge/1.0.0",
    ideas: [forgedIdea()],
    diagnostics: {
      framesGenerated: 4,
      rawCandidatesGenerated: 6,
      candidatesReturned: 1,
      method: "frame-diverge-critique",
    },
  };
}

test("Python intelligence progress is streamed and only a schema-valid provisional result completes", async () => {
  const progress: string[] = [];
  let poll = 0;
  installBridge({
    getStatus: async () => ({ available: true, engine: "python", version: "0.1.0" }),
    start: async () => ({ runId: "run-001" }),
    cancel: async () => ({ cancelled: true }),
    getEvents: async () => {
      poll += 1;
      if (poll === 1) {
        return {
          status: "running",
          events: [{
            seq: 1,
            runId: "run-001",
            type: "progress",
            phase: "competitors",
            message: "Mapping alternatives",
            percent: 130,
          }],
        };
      }
      return {
        status: "completed",
        events: [{ seq: 2, runId: "run-001", type: "progress", message: "Complete" }],
        result: {
          provisional: true,
          evidenceKind: "public_context",
          customerValidation: false,
          analysis: {
            summary: "The market is fragmented.",
            competitors: [{
              name: "Manual referrals",
              category: "Offline alternative",
              overlap: "Trusted introductions",
              competitorAdvantage: "Existing relationships",
              ideaAdvantage: "Portable proof",
              evidenceBasis: "Public market context",
              sourceIds: [],
              confidence: "high",
            }],
            redTeam: {
              fatalAssumptions: [{
                assumption: "Two-sided liquidity appears",
                failureMode: "Cold start",
                severity: "HIGH",
                rationale: "Both sides need liquidity.",
              }],
              counterarguments: ["A centralized service may be sufficient."],
              disconfirmingTests: [{
                test: "Compare a conventional signed database.",
                signal: "Users accept the centralized version.",
                stopCondition: "No measurable value from the protocol.",
              }],
              goForwardConditions: ["Five users require portable proof."],
            },
            confidence: "medium",
            limitations: ["No customer interviews exist yet."],
          },
        },
      };
    },
  });

  const outcome = await runCompetitorRedTeamIntelligence(inputFixture(), {
    onProgress: (event) => progress.push(`${event.message}:${event.percent ?? ""}`),
  });

  assert.equal(outcome.kind, "completed");
  assert.deepEqual(progress, ["Mapping alternatives:100", "Complete:"]);
  if (outcome.kind !== "completed") return;
  assert.equal(outcome.result.analysis.redTeam.fatalAssumptions[0]?.severity, "high");
  assert.equal(outcome.result.customerValidation, false);
  assert.match(intelligenceContextSummary(outcome.result), /NOT CUSTOMER EVIDENCE/);
  assert.match(intelligenceContextSummary(outcome.result), /Compare a conventional signed database/);
});

test("Idea Forge streams progress and returns only an exact hypothesis-only idea slate", async () => {
  const progress: string[] = [];
  let startedWith: unknown;
  let poll = 0;
  installBridge({
    getStatus: async () => ({ available: true, engine: "python", version: "0.2.0" }),
    start: async (input: unknown) => {
      startedWith = input;
      return { runId: "forge-001" };
    },
    cancel: async () => ({ cancelled: true }),
    getEvents: async () => {
      poll += 1;
      if (poll === 1) {
        return {
          status: "running",
          events: [{
            seq: 1,
            runId: "forge-001",
            type: "progress",
            phase: "diverging",
            message: "Generating distinct candidates",
            percent: 45,
          }],
        };
      }
      return {
        status: "completed",
        events: [{ seq: 2, runId: "forge-001", type: "progress", phase: "complete", message: "Idea slate ready", percent: 100 }],
        result: ideaForgeResult(),
      };
    },
  });

  const input = ideaForgeInputFixture();
  const original = structuredClone(input);
  const outcome = await runIdeaForgeIntelligence(input, {
    onProgress: (event) => progress.push(`${event.phase}:${event.message}:${event.percent}`),
  });

  assert.equal(outcome.kind, "completed");
  assert.deepEqual(input, original, "renderer preflight must not mutate the caller's generation brief");
  assert.deepEqual(progress, [
    "diverging:Generating distinct candidates:45",
    "complete:Idea slate ready:100",
  ]);
  assert.equal((startedWith as typeof input).context.opportunityBoundary, "Healthy food decisions for everyday consumers");
  if (outcome.kind !== "completed") return;
  assert.equal(outcome.result.task, "idea_forge");
  assert.equal(outcome.result.evidenceKind, "hypothesis");
  assert.equal(outcome.result.customerValidation, false);
  assert.equal(outcome.result.pipelineVersion, "idea-forge/1.0.0");
  assert.equal(outcome.result.ideas[0]?.experimentPlan.method, "concierge");
  assert.equal(outcome.result.ideas[0]?.scores.protocolAffordance, 35);
  assert.equal(outcome.result.diagnostics.candidatesReturned, outcome.result.ideas.length);
});

test("Idea Forge rejects fabricated envelopes, malformed ideas, and invalid local briefs", async () => {
  let started = 0;
  installBridge({
    getStatus: async () => ({ available: true }),
    start: async () => {
      started += 1;
      return { runId: "forge-invalid" };
    },
    cancel: async () => ({ cancelled: true }),
    getEvents: async () => ({
      status: "completed",
      events: [],
      result: {
        ...ideaForgeResult(),
        evidenceKind: "customer_validation",
        customerValidation: true,
        diagnostics: { ...ideaForgeResult().diagnostics, candidatesReturned: 99 },
      },
    }),
  });
  const fabricated = await runIdeaForgeIntelligence(ideaForgeInputFixture());
  assert.equal(fabricated.kind, "failed");
  assert.match(fabricated.message, /schema validation/i);
  assert.equal(started, 1);

  const invalidInput = ideaForgeInputFixture();
  invalidInput.context.profile.searchThemes = [
    { label: "Duplicate", weight: 50 },
    { label: "duplicate", weight: 50 },
  ];
  const rejectedBeforeIpc = await runIdeaForgeIntelligence(invalidInput);
  assert.equal(rejectedBeforeIpc.kind, "failed");
  assert.match(rejectedBeforeIpc.message, /request failed.*schema validation/i);
  assert.equal(started, 1, "invalid renderer input must never reach the desktop bridge");
});

test("Idea Forge is optional and returns an unavailable fallback without starting a run", async () => {
  let started = false;
  installBridge({
    getStatus: async () => ({ available: false, message: "Idea Forge runtime is not bundled" }),
    start: async () => { started = true; return { runId: "never" }; },
    cancel: async () => ({ cancelled: false }),
    getEvents: async () => ({ status: "running", events: [] }),
  });
  const outcome = await runIdeaForgeIntelligence(ideaForgeInputFixture());
  assert.deepEqual(outcome, { kind: "unavailable", message: "Idea Forge runtime is not bundled" });
  assert.equal(started, false);
});

test("missing Python bridge returns unavailable instead of breaking the existing workflow", async () => {
  Object.defineProperty(globalThis, "window", { configurable: true, value: { sift: {} } });
  const outcome = await runCompetitorRedTeamIntelligence(inputFixture());
  assert.equal(outcome.kind, "unavailable");
  assert.match(outcome.message, /optional Python intelligence engine/i);
});

test("unavailable worker status and invalid worker output fail closed", async () => {
  installBridge({
    getStatus: async () => ({ available: false, message: "Worker not bundled" }),
    start: async () => ({ runId: "never" }),
    cancel: async () => ({ cancelled: false }),
    getEvents: async () => ({ status: "running", events: [] }),
  });
  const unavailable = await runCompetitorRedTeamIntelligence(inputFixture());
  assert.deepEqual(unavailable, { kind: "unavailable", message: "Worker not bundled" });

  installBridge({
    getStatus: async () => ({ available: true }),
    start: async () => ({ runId: "run-invalid" }),
    cancel: async () => ({ cancelled: true }),
    getEvents: async () => ({
      status: "completed",
      events: [],
      result: { provisional: false, summary: "Pretend this is authoritative." },
    }),
  });
  const invalid = await runCompetitorRedTeamIntelligence(inputFixture());
  assert.equal(invalid.kind, "failed");
  assert.match(invalid.message, /schema validation/i);
});

test("renderer cancellation is forwarded to the isolated worker", async () => {
  let cancelledRun = "";
  installBridge({
    getStatus: async () => ({ available: true }),
    start: async () => ({ runId: "run-cancel" }),
    cancel: async ({ runId }: { runId: string }) => {
      cancelledRun = runId;
      return { cancelled: true };
    },
    getEvents: async () => ({ status: "running", events: [] }),
  });
  const outcome = await runCompetitorRedTeamIntelligence(inputFixture(), { isCancelled: () => true });
  assert.equal(outcome.kind, "failed");
  assert.equal(cancelledRun, "run-cancel");
});
