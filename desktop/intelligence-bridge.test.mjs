import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { EventEmitter } from "node:events";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { PassThrough, Writable } from "node:stream";
import test from "node:test";

import {
  buildWorkerParams,
  IntelligenceSupervisor,
  INTELLIGENCE_PROTOCOL,
  resolveWorkerLaunchCandidates,
  validateStartInput,
} from "./intelligence-bridge.mjs";

function checksum(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function requestInput(content = "A supplied public excerpt") {
  return {
    task: "competitor_red_team",
    context: {
      idea: {
        title: "Healthy food guide",
        concept: "Help shoppers understand ingredients.",
        user: "Everyday shoppers",
        buyer: "Consumers",
        currentAlternative: "Nutrition labels",
        criticalAssumption: "People want a simpler explanation",
        experiment: "Test a prototype with ten shoppers",
        route: "application",
      },
      projectBoundary: "Public-context discovery only",
      publicSources: [{
        sourceId: "source-1",
        title: "Public report",
        url: "https://example.org/report",
        content,
        contentSha256: checksum(content),
      }],
    },
    limits: { timeoutMs: 60_000, maxSources: 8 },
  };
}

function forgeInput() {
  return {
    task: "idea_forge",
    context: {
      opportunityBoundary: "Healthy food decisions for everyday shoppers",
      requestedCount: 4,
      profile: {
        mode: "private",
        searchThemes: [
          { label: "Healthy habits", weight: 60 },
          { label: "Connecting people with experts", weight: 40 },
        ],
        fitDimensions: [
          { label: "Research and analysis", weight: 50 },
          { label: "Bridge building", weight: 50 },
        ],
        workStylePreferences: [
          { label: "Autonomy", orientation: "Prefers independent work" },
          { label: "Uncertainty", orientation: "Enjoys open exploration" },
        ],
      },
    },
    limits: { timeoutMs: 180_000 },
  };
}

const connector = {
  provider: "openrouter",
  baseUrl: "https://openrouter.ai/api/v1",
  model: "example/model",
  apiKey: "test-secret-that-must-not-escape",
};

test("renderer input is strict and source checksums are verified", () => {
  assert.equal(validateStartInput(requestInput()).task, "competitor_red_team");
  const changed = requestInput();
  changed.context.publicSources[0].content = "changed";
  assert.throws(() => validateStartInput(changed), /changed after its checksum/i);
  assert.throws(() => validateStartInput({ ...requestInput(), apiKey: "renderer-secret" }), /unsupported field/i);
});

test("worker translation stays inside the Python v1 budget and normalizes Ollama", () => {
  const built = buildWorkerParams(requestInput(), connector);
  assert.equal(built.params.task, "competitor_red_team");
  assert.equal(built.params.budget.maxModelCalls, 2);
  assert.equal(built.params.budget.maxInputChars, 60_000);
  assert.equal(built.params.budget.maxOutputChars, 30_000);
  assert.equal(built.params.model.apiKey, connector.apiKey);
  assert.deepEqual(built.secretValues, [connector.apiKey]);

  const ollama = buildWorkerParams(requestInput(), {
    provider: "ollama",
    baseUrl: "http://127.0.0.1:11434",
    model: "llama3.2",
    apiKey: "",
  });
  assert.equal(ollama.params.model.baseUrl, "http://127.0.0.1:11434/v1");
});

test("Idea Forge input is exact, bounded, and excludes raw personality scores", () => {
  const validated = validateStartInput(forgeInput());
  assert.equal(validated.task, "idea_forge");
  assert.equal(validated.context.requestedCount, 4);
  assert.equal(validated.limits.timeoutMs, 180_000);

  const rawScores = forgeInput();
  rawScores.context.profile.personalityScores = { openness: 99 };
  assert.throws(() => validateStartInput(rawScores), /unsupported field/i);

  const tooMany = forgeInput();
  tooMany.context.requestedCount = 13;
  assert.throws(() => validateStartInput(tooMany), /between 1 and 12/i);

  const missingCount = forgeInput();
  delete missingCount.context.requestedCount;
  assert.throws(() => validateStartInput(missingCount), /missing a required field/i);

  const negativeWeight = forgeInput();
  negativeWeight.context.profile.searchThemes[0].weight = -1;
  assert.throws(() => validateStartInput(negativeWeight), /non-negative whole numbers/i);

  const extraPreferenceField = forgeInput();
  extraPreferenceField.context.profile.workStylePreferences[0].score = 80;
  assert.throws(() => validateStartInput(extraPreferenceField), /unsupported field/i);

  const excessiveTimeout = forgeInput();
  excessiveTimeout.limits.timeoutMs = 180_001;
  assert.throws(() => validateStartInput(excessiveTimeout), /between 10000 and 180000/i);
});

test("Idea Forge translation preserves the profile structure and uses its bounded model budget", () => {
  const built = buildWorkerParams(forgeInput(), connector);
  assert.equal(built.task, "idea_forge");
  assert.equal(built.params.task, "idea_forge");
  assert.deepEqual(built.params.input, forgeInput().context);
  assert.equal(built.params.model.temperature, 0.65);
  assert.equal(built.params.model.apiKey, connector.apiKey);
  assert.equal(built.params.budget.timeoutMs, 180_000);
  assert.equal(built.params.budget.maxSteps, 12);
  assert.equal(built.params.budget.maxModelCalls, 3);
  assert.equal(built.params.budget.maxOutputChars, 60_000);
  assert.equal(JSON.stringify(built.params).includes("personalityScores"), false);
});

test("worker path resolution never falls back to system Python when packaged", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "sift-intelligence-path-"));
  try {
    const resources = path.join(root, "resources");
    const directory = path.join(resources, "intelligence");
    await mkdir(directory, { recursive: true });
    const executable = path.join(directory, "sift-intelligence-worker.exe");
    await writeFile(executable, "placeholder");
    const packaged = await resolveWorkerLaunchCandidates({
      isPackaged: true,
      resourcesPath: resources,
      moduleDirectory: path.join(root, "desktop"),
      platform: "win32",
    });
    assert.deepEqual(packaged, [{ command: executable, args: [], kind: "bundled" }]);

    await rm(executable);
    assert.deepEqual(await resolveWorkerLaunchCandidates({
      isPackaged: true,
      resourcesPath: resources,
      moduleDirectory: path.join(root, "desktop"),
      platform: "win32",
    }), []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

function fakeWorker(onSpawn) {
  const child = new EventEmitter();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.killed = false;
  let incoming = "";
  child.stdin = new Writable({
    write(chunk, _encoding, callback) {
      incoming += chunk.toString("utf8");
      let newline;
      while ((newline = incoming.indexOf("\n")) >= 0) {
        const line = incoming.slice(0, newline);
        incoming = incoming.slice(newline + 1);
        if (!line) continue;
        const message = JSON.parse(line);
        onSpawn.messages.push(message);
        if (message.type === "request" && message.method === "run") {
          setImmediate(() => {
            child.stdout.write(`${JSON.stringify({
              protocol: INTELLIGENCE_PROTOCOL,
              type: "progress",
              id: message.id,
              seq: 1,
              stage: "validating",
              percent: 10,
              message: "Validated without echoing credentials.",
            })}\n`);
            child.stdout.write(`${JSON.stringify({
              protocol: INTELLIGENCE_PROTOCOL,
              type: "result",
              id: message.id,
              result: {
                task: "competitor_red_team",
                provisional: true,
                evidenceKind: "public_context",
                customerValidation: false,
                analysis: { summary: "Bounded result", competitors: [], redTeam: {}, confidence: "low", limitations: [] },
                usage: { modelCalls: 1, elapsedMs: 5 },
              },
            })}\n`);
          });
        }
      }
      callback();
    },
  });
  child.kill = () => {
    if (child.killed) return false;
    child.killed = true;
    setImmediate(() => child.emit("exit", 0, null));
    return true;
  };
  setImmediate(() => child.stdout.write(`${JSON.stringify({
    protocol: INTELLIGENCE_PROTOCOL,
    type: "ready",
    workerVersion: "test-1",
    capabilities: ["ping", "health", "competitor_red_team", "cancel"],
  })}\n`));
  return child;
}

function fakeIdeaForgeWorker(onSpawn, { validEnvelope = true } = {}) {
  const child = new EventEmitter();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.killed = false;
  let incoming = "";
  child.stdin = new Writable({
    write(chunk, _encoding, callback) {
      incoming += chunk.toString("utf8");
      let newline;
      while ((newline = incoming.indexOf("\n")) >= 0) {
        const line = incoming.slice(0, newline);
        incoming = incoming.slice(newline + 1);
        if (!line) continue;
        const message = JSON.parse(line);
        onSpawn.messages.push(message);
        if (message.type !== "request" || message.method !== "run") continue;
        setImmediate(() => {
          const stages = [
            ["framing", 10],
            ["diverging", 25],
            ["critiquing", 45],
            ["revising", 60],
            ["validating_output", 75],
            ["diversifying", 90],
            ["complete", 100],
          ];
          stages.forEach(([stage, percent], index) => child.stdout.write(`${JSON.stringify({
            protocol: INTELLIGENCE_PROTOCOL,
            type: "progress",
            id: message.id,
            seq: index + 1,
            stage,
            percent,
            message: `Idea Forge ${stage}`,
          })}\n`));
          child.stdout.write(`${JSON.stringify({
            protocol: INTELLIGENCE_PROTOCOL,
            type: "result",
            id: message.id,
            result: {
              task: "idea_forge",
              provisional: true,
              evidenceKind: validEnvelope ? "hypothesis" : "public_context",
              customerValidation: false,
              pipelineVersion: "idea-forge/1.0.0",
              ideas: [],
              diagnostics: {
                framesGenerated: 4,
                rawCandidatesGenerated: 12,
                candidatesReturned: 0,
                method: "frame-diverge-critique",
              },
            },
          })}\n`);
        });
      }
      callback();
    },
  });
  child.kill = () => {
    if (child.killed) return false;
    child.killed = true;
    setImmediate(() => child.emit("exit", 0, null));
    return true;
  };
  setImmediate(() => child.stdout.write(`${JSON.stringify({
    protocol: INTELLIGENCE_PROTOCOL,
    type: "ready",
    workerVersion: "forge-test-1",
    capabilities: ["ping", "health", "run", "competitor_red_team", "idea_forge", "cancel"],
  })}\n`));
  return child;
}

test("supervisor streams bounded events while secrets stay off argv, env, and renderer output", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "sift-intelligence-supervisor-"));
  const workerDirectory = path.join(root, "intelligence_worker");
  await mkdir(workerDirectory, { recursive: true });
  await writeFile(path.join(workerDirectory, "worker.py"), "# path sentinel\n");
  const captured = { messages: [], launch: null };
  const supervisor = new IntelligenceSupervisor({
    isPackaged: false,
    resourcesPath: root,
    moduleDirectory: root,
    platform: "win32",
    spawnProcess(command, args, options) {
      captured.launch = { command, args, options };
      return fakeWorker(captured);
    },
  });
  try {
    assert.deepEqual(await supervisor.getStatus(), {
      available: true,
      engine: "python",
      version: "test-1",
      message: "The local Python intelligence engine is ready.",
    });
    const { runId } = await supervisor.start(requestInput(), connector);
    const batch = await supervisor.getEvents({ runId, afterSeq: 0, waitMs: 1_000 });
    if (batch.status === "running") {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    const complete = await supervisor.getEvents({ runId, afterSeq: 0, waitMs: 1_000 });
    assert.equal(complete.status, "completed");
    assert.equal(complete.result.provisional, true);
    assert.equal(complete.result.customerValidation, false);
    assert.deepEqual(complete.events.map((event) => event.seq), [1, 2, 3]);
    assert.equal(complete.events[0].phase, "starting");
    assert.equal(complete.events[1].phase, "starting");
    assert.equal(complete.events[2].type, "result");
    assert.ok(complete.events.every((event) => !JSON.stringify(event).includes(connector.apiKey)));
    assert.ok(!captured.launch.args.join(" ").includes(connector.apiKey));
    assert.ok(!JSON.stringify(captured.launch.options.env).includes(connector.apiKey));
    assert.equal(captured.messages[0].params.model.apiKey, connector.apiKey);
  } finally {
    supervisor.stop();
    await rm(root, { recursive: true, force: true });
  }
});

test("supervisor accepts the Idea Forge envelope and maps every forge progress phase", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "sift-idea-forge-supervisor-"));
  const workerDirectory = path.join(root, "intelligence_worker");
  await mkdir(workerDirectory, { recursive: true });
  await writeFile(path.join(workerDirectory, "worker.py"), "# path sentinel\n");
  const captured = { messages: [], launch: null };
  const supervisor = new IntelligenceSupervisor({
    isPackaged: false,
    resourcesPath: root,
    moduleDirectory: root,
    platform: "win32",
    spawnProcess(command, args, options) {
      captured.launch = { command, args, options };
      return fakeIdeaForgeWorker(captured);
    },
  });
  try {
    const { runId } = await supervisor.start(forgeInput(), connector);
    let complete = await supervisor.getEvents({ runId, afterSeq: 0, waitMs: 1_000 });
    if (complete.status === "running") {
      await new Promise((resolve) => setTimeout(resolve, 10));
      complete = await supervisor.getEvents({ runId, afterSeq: 0, waitMs: 1_000 });
    }
    assert.equal(complete.status, "completed");
    assert.equal(complete.result.task, "idea_forge");
    assert.equal(complete.result.evidenceKind, "hypothesis");
    assert.equal(complete.result.customerValidation, false);
    assert.deepEqual(
      complete.events.filter((event) => event.type === "progress").map((event) => event.phase),
      ["briefing", "briefing", "diverging", "critiquing", "revising", "verifying", "diversifying", "complete"],
    );
    assert.equal(complete.events.at(-1).message, "The provisional Idea Forge slate is ready.");
    assert.ok(!JSON.stringify(complete).includes(connector.apiKey));
    assert.equal(captured.messages[0].params.task, "idea_forge");
  } finally {
    supervisor.stop();
    await rm(root, { recursive: true, force: true });
  }
});

test("supervisor fails closed when Idea Forge returns a non-hypothesis envelope", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "sift-invalid-forge-supervisor-"));
  const workerDirectory = path.join(root, "intelligence_worker");
  await mkdir(workerDirectory, { recursive: true });
  await writeFile(path.join(workerDirectory, "worker.py"), "# path sentinel\n");
  const captured = { messages: [], launch: null };
  const supervisor = new IntelligenceSupervisor({
    isPackaged: false,
    resourcesPath: root,
    moduleDirectory: root,
    platform: "win32",
    spawnProcess() {
      return fakeIdeaForgeWorker(captured, { validEnvelope: false });
    },
  });
  try {
    const { runId } = await supervisor.start(forgeInput(), connector);
    let complete = await supervisor.getEvents({ runId, afterSeq: 0, waitMs: 1_000 });
    if (complete.status === "running") {
      await new Promise((resolve) => setTimeout(resolve, 10));
      complete = await supervisor.getEvents({ runId, afterSeq: 0, waitMs: 1_000 });
    }
    assert.equal(complete.status, "failed");
    assert.equal(complete.error.code, "worker_protocol");
    assert.equal(complete.result, undefined);
  } finally {
    supervisor.stop();
    await rm(root, { recursive: true, force: true });
  }
});

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve(server.address());
    });
  });
}

function close(server) {
  return new Promise((resolve) => server.close(resolve));
}

test("real Python worker completes all three Idea Forge passes", async () => {
  const frames = {
    frames: Array.from({ length: 8 }, (_value, index) => ({
      label: `Frame ${index + 1}`,
      user: `Shopper segment ${index + 1}`,
      triggeringSituation: `A shopper compares packaged foods in situation ${index + 1}.`,
      problemMechanism: `Ingredient terminology obscures tradeoffs in context ${index + 1}.`,
      materialConsequence: `The shopper cannot confidently compare option ${index + 1}.`,
      currentAlternative: `Read the package label and search the web for term ${index + 1}.`,
      protocolPossibility: "Test a conventional product first; no protocol need is assumed.",
    })),
  };
  const candidates = {
    candidates: Array.from({ length: 5 }, (_value, index) => ({
      title: `Raw food guide ${index + 1}`,
      frameLabel: `Frame ${(index % 8) + 1}`,
      concept: `Explain one bounded ingredient decision for shopper group ${index + 1}.`,
      user: `Shopper group ${index + 1}`,
      buyer: `Consumer in group ${index + 1}`,
      triggeringSituation: `Comparing two packaged products in context ${index + 1}.`,
      currentAlternative: `Read labels and manually search ingredient ${index + 1}.`,
      materialConsequence: `Extra time and unresolved uncertainty for comparison ${index + 1}.`,
      protocolHypothesis: "No protocol is assumed before a multi-party trust problem is observed.",
      conventionalAlternative: "A conventional local web application backed by a standard database.",
    })),
  };
  const finalIdea = {
    title: "Ingredient decision card",
    concept: "A bounded comparison card explains one ingredient tradeoff while a shopper chooses between two products.",
    user: "Shoppers comparing packaged foods",
    buyer: "The shopper using the comparison",
    triggeringSituation: "The shopper sees unfamiliar ingredients while choosing between two products.",
    currentAlternative: "Read two labels and search unfamiliar ingredient names manually.",
    materialConsequence: "The comparison takes longer and the shopper may abandon the decision without confidence.",
    whyNow: "The hypothesis is that a narrow explanation could reduce comparison effort; demand remains unknown.",
    distributionWedge: "Offer the card during one existing guided grocery-planning session.",
    adoptionFriction: "Opening another tool during a purchase may add more effort than it removes.",
    protocolNeed: "No protocol is justified; test the conventional workflow before adding shared infrastructure.",
    protocolCounterfactual: "A conventional web app with an ordinary centralized database is sufficient for this first test.",
    failureReason: "Shoppers may prefer the existing package label and search workflow.",
    criticalAssumption: "Shoppers will consult a comparison card before choosing between two unfamiliar products.",
    experiment: "Run a seven-day prototype comparison with ten shoppers and record completed card consultations.",
    experimentPlan: {
      durationDays: 7,
      method: "prototype",
      target: "Shoppers comparing two packaged foods",
      sampleSize: 10,
      artifact: "Clickable ingredient comparison card",
      metric: "Unprompted completed card consultations",
      passThreshold: "At least five shoppers complete the card before choosing.",
      killThreshold: "Fewer than two shoppers open the card without prompting.",
    },
    route: "Neither yet",
    scores: {
      personalFit: null,
      opportunitySignal: 55,
      protocolAffordance: 10,
      experimentability: 85,
    },
  };
  const responses = [frames, candidates, { ideas: [finalIdea] }];
  let requestIndex = 0;
  const server = http.createServer((request, response) => {
    assert.equal(request.url, "/v1/chat/completions");
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => { body += chunk; });
    request.on("end", () => {
      const parsed = JSON.parse(body);
      assert.equal(parsed.model, "local-forge-model");
      assert.equal(parsed.temperature, 0.65);
      const stageResponse = responses[requestIndex];
      requestIndex += 1;
      assert.ok(stageResponse, "Idea Forge must make exactly three bounded model calls");
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(stageResponse) } }] }));
    });
  });
  const address = await listen(server);
  assert.ok(address && typeof address === "object");
  const supervisor = new IntelligenceSupervisor({
    isPackaged: false,
    resourcesPath: path.resolve("desktop"),
    moduleDirectory: path.resolve("desktop"),
    platform: process.platform,
  });
  try {
    const realInput = forgeInput();
    realInput.context.requestedCount = 1;
    realInput.context.profile = {
      mode: "neutral",
      searchThemes: [],
      fitDimensions: [],
      workStylePreferences: [],
    };
    const started = await supervisor.start(realInput, {
      provider: "openaiCompatible",
      baseUrl: `http://127.0.0.1:${address.port}/v1`,
      model: "local-forge-model",
      apiKey: "",
    });
    let terminal;
    let cursor = 0;
    const deadline = Date.now() + 15_000;
    while (Date.now() < deadline) {
      const batch = await supervisor.getEvents({ runId: started.runId, afterSeq: cursor, waitMs: 1_000 });
      for (const event of batch.events) cursor = Math.max(cursor, event.seq);
      if (batch.status !== "running") {
        terminal = batch;
        break;
      }
    }
    assert.ok(terminal, "the real Idea Forge worker should reach a terminal state");
    assert.equal(terminal.status, "completed");
    assert.equal(terminal.result.task, "idea_forge");
    assert.equal(terminal.result.evidenceKind, "hypothesis");
    assert.equal(terminal.result.customerValidation, false);
    assert.equal(terminal.result.ideas.length, 1);
    assert.equal(terminal.result.ideas[0].title, finalIdea.title);
    assert.equal(terminal.result.diagnostics.rawCandidatesGenerated, 5);
    assert.equal(requestIndex, 3);
  } finally {
    supervisor.stop();
    await close(server);
  }
});

test("real Python worker completes a supervised run against an approved local model endpoint", async () => {
  const secret = "real-subprocess-test-secret";
  const analysis = {
    summary: "The newborn idea has a testable wedge and unvalidated demand.",
    competitors: [{
      name: "Nutrition labels",
      category: "do_nothing",
      overlap: "Both help shoppers interpret food information.",
      competitorAdvantage: "Already present at the decision point.",
      ideaAdvantage: "Could explain tradeoffs in plain language.",
      evidenceBasis: "model_hypothesis",
      sourceIds: [],
      confidence: "low",
    }],
    redTeam: {
      fatalAssumptions: [{
        assumption: "Shoppers want another decision aid.",
        failureMode: "The product adds effort without changing a purchase.",
        severity: "critical",
        rationale: "No customer behavior has been observed yet.",
      }],
      counterarguments: ["A clearer static label could solve enough of the problem."],
      disconfirmingTests: [{
        test: "Compare purchase decisions with and without the explanation.",
        signal: "A repeated, material decision change.",
        stopCondition: "Fewer than two of ten shoppers change or gain confidence.",
      }],
      goForwardConditions: ["Observe repeated use at a real purchase decision."],
    },
    confidence: "low",
    limitations: ["This run contains no customer evidence."],
  };
  const server = http.createServer((request, response) => {
    assert.equal(request.url, "/v1/chat/completions");
    assert.equal(request.headers.authorization, `Bearer ${secret}`);
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => { body += chunk; });
    request.on("end", () => {
      const parsed = JSON.parse(body);
      assert.equal(parsed.model, "local-test-model");
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(analysis) } }] }));
    });
  });
  const address = await listen(server);
  assert.ok(address && typeof address === "object");
  const supervisor = new IntelligenceSupervisor({
    isPackaged: false,
    resourcesPath: path.resolve("desktop"),
    moduleDirectory: path.resolve("desktop"),
    platform: process.platform,
  });
  try {
    const status = await supervisor.getStatus();
    assert.equal(status.available, true);
    const started = await supervisor.start(requestInput(), {
      provider: "openaiCompatible",
      baseUrl: `http://127.0.0.1:${address.port}/v1`,
      model: "local-test-model",
      apiKey: secret,
    });
    let cursor = 0;
    let terminal;
    const deadline = Date.now() + 15_000;
    while (Date.now() < deadline) {
      const batch = await supervisor.getEvents({ runId: started.runId, afterSeq: cursor, waitMs: 1_000 });
      for (const event of batch.events) cursor = Math.max(cursor, event.seq);
      if (batch.status !== "running") {
        terminal = batch;
        break;
      }
    }
    assert.ok(terminal, "the real worker should reach a terminal state");
    assert.equal(terminal.status, "completed");
    assert.equal(terminal.result.customerValidation, false);
    assert.equal(terminal.result.analysis.competitors[0].evidenceBasis, "model_hypothesis");
    assert.ok(!JSON.stringify(terminal).includes(secret));
  } finally {
    supervisor.stop();
    await close(server);
  }
});
