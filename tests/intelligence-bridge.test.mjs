import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { IntelligenceSupervisor } from "../desktop/intelligence-bridge.mjs";

const projectDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const desktopDirectory = path.join(projectDirectory, "desktop");

function input() {
  const content = "The supplied report describes a current nutrition-label alternative.";
  return {
    task: "competitor_red_team",
    context: {
      idea: {
        title: "Healthy food guide",
        concept: "Explain food ingredients to everyday shoppers.",
        user: "Everyday shoppers",
        buyer: "Consumers",
        currentAlternative: "Nutrition labels",
        criticalAssumption: "Shoppers want simpler explanations",
        experiment: "Test a prototype with ten shoppers",
        route: "application",
      },
      projectBoundary: "Public-context discovery only",
      publicSources: [{
        sourceId: "source-1",
        title: "Public nutrition report",
        url: "https://example.org/nutrition-report",
        content,
        contentSha256: createHash("sha256").update(content, "utf8").digest("hex"),
      }],
    },
    limits: { timeoutMs: 30_000, maxSources: 8 },
  };
}

function modelAnalysis() {
  return {
    summary: "The concept competes with labels and nutrition applications, but it still needs customer validation.",
    competitors: [{
      name: "Nutrition labels",
      category: "substitute",
      overlap: "Both explain packaged food.",
      competitorAdvantage: "Already present at purchase.",
      ideaAdvantage: "Can provide simpler language.",
      evidenceBasis: "provided_source",
      sourceIds: ["source-1"],
      confidence: "medium",
    }],
    redTeam: {
      fatalAssumptions: [{
        assumption: "People will use another tool while shopping.",
        failureMode: "The workflow is too slow.",
        severity: "critical",
        rationale: "Convenience determines whether the explanation is used.",
      }],
      counterarguments: ["Existing labels may already be sufficient."],
      disconfirmingTests: [{
        test: "Observe ten shopping sessions.",
        signal: "At least five users request an explanation.",
        stopCondition: "Fewer than two users engage without prompting.",
      }],
      goForwardConditions: ["Users repeatedly consult the prototype."],
    },
    confidence: "low",
    limitations: ["No customer interviews or behavioral evidence are present."],
  };
}

async function terminalBatch(supervisor, runId) {
  let afterSeq = 0;
  const events = [];
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const batch = await supervisor.getEvents({ runId, afterSeq, waitMs: 1_000 });
    events.push(...batch.events);
    if (batch.events.length) afterSeq = batch.events.at(-1).seq;
    if (batch.status !== "running") return { ...batch, events };
  }
  throw new Error("The test intelligence run did not reach a terminal state.");
}

test("real Python sidecar completes and cancels over supervised JSONL", async (t) => {
  let requestCount = 0;
  let secondRequestReceived;
  const secondRequest = new Promise((resolve) => { secondRequestReceived = resolve; });
  const observedPaths = [];
  const server = http.createServer((request, response) => {
    requestCount += 1;
    observedPaths.push(request.url);
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => {
      const payload = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      assert.equal(payload.model, "local-test-model");
      if (requestCount === 2) {
        secondRequestReceived();
        // The supervisor must kill the worker if its blocking provider call does
        // not honor cancellation within the bounded grace period.
        return;
      }
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(modelAnalysis()) } }] }));
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const supervisor = new IntelligenceSupervisor({
    isPackaged: false,
    resourcesPath: projectDirectory,
    moduleDirectory: desktopDirectory,
    platform: process.platform,
  });
  t.after(async () => {
    supervisor.stop();
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
  });

  const status = await supervisor.getStatus();
  if (!status.available) {
    t.skip("A Python 3.11+ development runtime is not available on this test host.");
    return;
  }
  const connector = {
    provider: "ollama",
    baseUrl: `http://127.0.0.1:${address.port}`,
    model: "local-test-model",
    apiKey: "local-test-secret",
  };
  const first = await supervisor.start(input(), connector);
  const completed = await terminalBatch(supervisor, first.runId);
  assert.equal(completed.status, "completed");
  assert.equal(completed.result.provisional, true);
  assert.equal(completed.result.evidenceKind, "public_context");
  assert.equal(completed.result.customerValidation, false);
  assert.equal(completed.result.analysis.competitors[0].sourceIds[0], "source-1");
  assert.ok(completed.events.every((event) => !JSON.stringify(event).includes(connector.apiKey)));
  assert.equal(observedPaths[0], "/v1/chat/completions");

  const second = await supervisor.start(input(), connector);
  await secondRequest;
  assert.deepEqual(await supervisor.cancel({ runId: second.runId }), { cancelled: true });
  const cancelled = await terminalBatch(supervisor, second.runId);
  assert.equal(cancelled.status, "cancelled");
  assert.equal(cancelled.error.code, "cancelled");
});

test("packaged mode reports a clean fallback instead of running system Python", async () => {
  const resourcesPath = await mkdtemp(path.join(os.tmpdir(), "sift-no-worker-"));
  const supervisor = new IntelligenceSupervisor({
    isPackaged: true,
    resourcesPath,
    moduleDirectory: desktopDirectory,
    platform: process.platform,
  });
  try {
    const status = await supervisor.getStatus();
    assert.deepEqual(status, {
      available: false,
      engine: "python",
      message: "The Python intelligence engine is unavailable; SIFT can continue without it.",
    });
    await assert.rejects(
      supervisor.start(input(), {
        provider: "ollama",
        baseUrl: "http://127.0.0.1:11434",
        model: "local-test-model",
        apiKey: "",
      }),
      /not installed/i,
    );
  } finally {
    supervisor.stop();
    await rm(resourcesPath, { recursive: true, force: true });
  }
});
