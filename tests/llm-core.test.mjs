import assert from "node:assert/strict";
import test from "node:test";

import {
  ConnectorError,
  draftEvaluation,
  extractUrlCitations,
  extractEvidence,
  generateIdeas,
  listModels,
  normalizeConfig,
  normalizeEvaluationProposals,
  normalizeEvidenceProposals,
  normalizeGeneratedIdea,
  normalizeResearchEvidenceProposals,
  researchEvidence,
  testConnection,
} from "../desktop/llm-core.mjs";

function jsonResponse(payload, status = 200, headers = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

function completeIdea(overrides = {}) {
  return {
    title: "Portable service proof",
    concept: "Create portable completion receipts for independent work.",
    user: "Independent operators",
    buyer: "Service networks",
    triggeringSituation: "A buyer disputes completion",
    currentAlternative: "Screenshots and private logs",
    materialConsequence: "Slow disputes",
    whyNow: "Service networks are adding independent operators faster than manual dispute teams can review their records.",
    distributionWedge: "Start with one regional network that already coordinates at least twenty independent operators.",
    adoptionFriction: "Operators may reject another capture step unless it replaces their existing photo and invoice uploads.",
    protocolNeed: "Xahau settles account-level receipt rules while Evernode runs independent receipt reconciliation across operators.",
    protocolCounterfactual: "A centralized database is cheaper but leaves one service network able to alter history or withdraw access.",
    failureReason: "Networks may not change workflow",
    criticalAssumption: "Buyers value portable proof",
    experiment: "Within 14 days test ten signed receipts; continue at six completed without prompting and stop below three.",
    experimentPlan: {
      durationDays: 14,
      method: "concierge",
      target: "Ten recently completed independent service jobs",
      sampleSize: 10,
      artifact: "A signed receipt and review log for every attempted job",
      metric: "Receipts completed without prompting and review minutes saved",
      passThreshold: "At least 6 of 10 receipts are completed without prompting",
      killThreshold: "Fewer than 3 of 10 receipts are completed without prompting",
    },
    route: "both",
    scores: {
      personalFit: 130,
      opportunitySignal: 68,
      protocolAffordance: 82,
      experimentability: -12,
    },
    ...overrides,
  };
}

test("normalizes endpoints and keeps named local providers on loopback", () => {
  const config = normalizeConfig({ provider: "ollama", baseUrl: "http://localhost:11434/", model: "qwen" });
  assert.equal(config.baseUrl, "http://localhost:11434");
  assert.equal(config.model, "qwen");
  assert.throws(
    () => normalizeConfig({ provider: "ollama", baseUrl: "http://192.168.1.8:11434" }),
    (error) => error instanceof ConnectorError && error.code === "non_local_endpoint",
  );
  assert.throws(() => normalizeConfig({ provider: "openaiCompatible", baseUrl: "file:///tmp/model" }), /HTTP or HTTPS/);
  assert.throws(
    () => normalizeConfig({ provider: "openaiCompatible", baseUrl: "http://models.example/v1", apiKey: "secret" }),
    (error) => error instanceof ConnectorError && error.code === "insecure_endpoint",
  );
  assert.equal(
    normalizeConfig({ provider: "openaiCompatible", baseUrl: "http://127.0.0.1:8080/v1" }).baseUrl,
    "http://127.0.0.1:8080/v1",
  );
  assert.throws(() => normalizeConfig({ provider: "unknown", baseUrl: "https://models.example/v1" }), /supported model provider/);

  const openRouter = normalizeConfig({ provider: "openrouter", model: "anthropic/claude-sonnet-4" });
  assert.equal(openRouter.baseUrl, "https://openrouter.ai/api/v1");
  assert.throws(
    () => normalizeConfig({ provider: "openrouter", baseUrl: "https://proxy.example/api/v1" }),
    /locked to https:\/\/openrouter\.ai\/api\/v1/,
  );
  const switchedProvider = normalizeConfig(
    { provider: "openrouter" },
    { provider: "openaiCompatible", apiKey: "must-not-cross-providers" },
  );
  assert.equal(switchedProvider.apiKey, "");
  const sameEndpoint = normalizeConfig(
    { provider: "openaiCompatible", baseUrl: "https://models.example/v1/" },
    { provider: "openaiCompatible", baseUrl: "https://models.example/v1", apiKey: "endpoint-bound" },
  );
  assert.equal(sameEndpoint.apiKey, "endpoint-bound");
  const changedEndpoint = normalizeConfig(
    { provider: "openaiCompatible", baseUrl: "https://other.example/v1" },
    { provider: "openaiCompatible", baseUrl: "https://models.example/v1", apiKey: "must-not-move" },
  );
  assert.equal(changedEndpoint.apiKey, "");
});

test("lists Ollama models from the native local endpoint", async () => {
  let requestedUrl = "";
  const models = await listModels(
    { provider: "ollama", baseUrl: "http://127.0.0.1:11434" },
    { fetchImpl: async (url) => { requestedUrl = String(url); return jsonResponse({ models: [{ name: "qwen3:8b" }, { model: "gemma3:4b" }] }); } },
  );
  assert.equal(requestedUrl, "http://127.0.0.1:11434/api/tags");
  assert.deepEqual(models.map((model) => model.id), ["qwen3:8b", "gemma3:4b"]);
});

test("lists OpenAI-compatible models with a bearer credential", async () => {
  let authorization = "";
  const models = await listModels(
    { provider: "openaiCompatible", baseUrl: "https://models.example/v1", apiKey: "secret" },
    { fetchImpl: async (_url, options) => { authorization = options.headers.Authorization; return jsonResponse({ data: [{ id: "reasoner-small" }] }); } },
  );
  assert.equal(authorization, "Bearer secret");
  assert.deepEqual(models, [{ id: "reasoner-small", name: "reasoner-small" }]);
});

test("lists OpenRouter models through the pinned endpoint with required authentication", async () => {
  let request = {};
  const models = await listModels(
    { provider: "openrouter", apiKey: "openrouter-test-key" },
    {
      fetchImpl: async (url, options) => {
        request = { url: String(url), headers: options.headers };
        return jsonResponse({ data: [{ id: "anthropic/claude-sonnet-4", name: "Claude Sonnet 4" }] });
      },
    },
  );
  assert.equal(request.url, "https://openrouter.ai/api/v1/models");
  assert.equal(request.headers.Authorization, "Bearer openrouter-test-key");
  assert.equal(request.headers["X-OpenRouter-Title"], "SIFT");
  assert.deepEqual(models, [{ id: "anthropic/claude-sonnet-4", name: "Claude Sonnet 4" }]);
  await assert.rejects(
    listModels({ provider: "openrouter" }, { fetchImpl: async () => jsonResponse({ data: [] }) }),
    /Enter an OpenRouter API key/,
  );
});

test("searches OpenRouter models by an encoded typeahead query", async () => {
  const secret = "openrouter-secret-that-must-stay-in-the-header";
  let request = {};
  const models = await listModels(
    { provider: "openrouter", apiKey: secret },
    {
      query: "4.8",
      fetchImpl: async (url, options) => {
        request = { url: String(url), options };
        return jsonResponse({
          data: [
            { id: "anthropic/claude-opus-4.8", name: "Anthropic: Claude Opus 4.8" },
          ],
        });
      },
    },
  );

  assert.equal(request.url, "https://openrouter.ai/api/v1/models?q=4.8");
  assert.equal(request.options.redirect, "error");
  assert.equal(request.options.headers.Authorization, `Bearer ${secret}`);
  assert.doesNotMatch(request.url, new RegExp(secret));
  assert.deepEqual(models, [{
    id: "anthropic/claude-opus-4.8",
    name: "Anthropic: Claude Opus 4.8",
  }]);
  assert.doesNotMatch(JSON.stringify(models), /openrouter-secret|\"4\.8\"/);
});

test("URL-encodes OpenRouter search text without changing the pinned origin", async () => {
  const query = "Claude Opus / 4.8 & beta?";
  let requestedUrl = "";
  await listModels(
    { provider: "openrouter", apiKey: "search-key" },
    {
      query,
      fetchImpl: async (url) => {
        requestedUrl = String(url);
        return jsonResponse({ data: [] });
      },
    },
  );

  const parsed = new URL(requestedUrl);
  assert.equal(parsed.origin, "https://openrouter.ai");
  assert.equal(parsed.pathname, "/api/v1/models");
  assert.equal(parsed.searchParams.get("q"), query);
  assert.match(requestedUrl, /q=Claude\+Opus\+%2F\+4\.8\+%26\+beta%3F$/);
});

test("does not leak OpenRouter keys or model queries through sanitized failures", async () => {
  const apiKey = "private-openrouter-key";
  const query = "private model search";
  await assert.rejects(
    listModels(
      { provider: "openrouter", apiKey },
      {
        query,
        fetchImpl: async (url, options) => {
          throw new Error(`network detail ${url} ${options.headers.Authorization}`);
        },
      },
    ),
    (error) => {
      assert.match(error.message, /could not be reached/);
      assert.doesNotMatch(error.message, new RegExp(apiKey));
      assert.doesNotMatch(error.message, new RegExp(query));
      return true;
    },
  );
});

test("keeps non-OpenRouter model catalogs and queryless calls backward-compatible", async () => {
  const requests = [];
  const fetchImpl = async (url) => {
    requests.push(String(url));
    return jsonResponse({ data: [{ id: "local/model", name: "Local model" }] });
  };

  const withIgnoredQuery = await listModels(
    { provider: "lmstudio", baseUrl: "http://localhost:1234/v1" },
    { query: "4.8", fetchImpl },
  );
  const withoutQuery = await listModels(
    { provider: "openrouter", apiKey: "openrouter-test-key" },
    { fetchImpl },
  );

  assert.deepEqual(requests, [
    "http://localhost:1234/v1/models",
    "https://openrouter.ai/api/v1/models",
  ]);
  assert.deepEqual(withIgnoredQuery, [{ id: "local/model", name: "Local model" }]);
  assert.deepEqual(withoutQuery, [{ id: "local/model", name: "Local model" }]);
});

test("rejects unsafe model search values before making a request", async () => {
  let called = false;
  const fetchImpl = async () => {
    called = true;
    return jsonResponse({ data: [] });
  };
  await assert.rejects(
    listModels(
      { provider: "openrouter", apiKey: "openrouter-test-key" },
      { query: `model\nsearch`, fetchImpl },
    ),
    /unsupported characters/,
  );
  assert.equal(called, false);
});

test("keeps large provider catalogs searchable beyond the first 500 entries", async () => {
  const catalog = Array.from({ length: 650 }, (_, index) => ({
    id: `provider/model-${index}`,
    name: `Model ${index}`,
  }));
  catalog.push({ id: "anthropic/claude-opus-4.8", name: "Anthropic: Claude Opus 4.8" });
  catalog.push({ id: "anthropic/claude-opus-4.8", name: "Duplicate should be ignored" });
  catalog.push({ id: "provider/no-friendly-name" });

  const models = await listModels(
    { provider: "openrouter", apiKey: "openrouter-test-key" },
    { fetchImpl: async () => jsonResponse({ data: catalog }) },
  );

  assert.equal(models.length, 652);
  assert.deepEqual(models.at(-2), {
    id: "anthropic/claude-opus-4.8",
    name: "Anthropic: Claude Opus 4.8",
  });
  assert.deepEqual(models.at(-1), { id: "provider/no-friendly-name", name: "provider/no-friendly-name" });
});

test("connection tests do not send project content", async () => {
  let method = "";
  const result = await testConnection(
    { provider: "lmstudio", baseUrl: "http://localhost:1234/v1" },
    { fetchImpl: async (_url, options) => { method = options.method; return jsonResponse({ data: [{ id: "local-model" }] }); } },
  );
  assert.equal(method, "GET");
  assert.equal(result.ok, true);
  assert.equal(result.model, "local-model");
});

test("generates and normalizes an Ollama idea slate", async () => {
  let requestBody;
  const result = await generateIdeas(
    { provider: "ollama", baseUrl: "http://localhost:11434", model: "qwen3:8b" },
    "Generate falsifiable Xahau ideas.",
    1,
    {
      fetchImpl: async (_url, options) => {
        requestBody = JSON.parse(options.body);
        return jsonResponse({ message: { content: JSON.stringify({ ideas: [completeIdea()] }) } });
      },
    },
  );
  assert.equal(requestBody.stream, false);
  assert.equal(requestBody.format, "json");
  assert.equal(result.ideas.length, 1);
  assert.equal(result.ideas[0].route, "Both");
  assert.equal(result.ideas[0].scores.personalFit, 100);
  assert.equal(result.ideas[0].scores.experimentability, 0);
});

test("accepts fenced OpenAI-compatible JSON while keeping it provisional", async () => {
  const result = await generateIdeas(
    { provider: "openaiCompatible", baseUrl: "https://models.example/v1", model: "model-a" },
    "Generate one idea.",
    1,
    { fetchImpl: async () => jsonResponse({ choices: [{ message: { content: `\`\`\`json\n${JSON.stringify({ ideas: [completeIdea()] })}\n\`\`\`` } }] }) },
  );
  assert.equal(result.provider, "openaiCompatible");
  assert.equal(result.ideas[0].title, "Portable service proof");
});

test("generates ideas through OpenRouter with bounded Opus 4.6 reasoning and no key exposure", async () => {
  let request = {};
  const result = await generateIdeas(
    { provider: "openrouter", apiKey: "openrouter-test-key", model: "anthropic/claude-opus-4.6" },
    "Generate one idea.",
    1,
    {
      fetchImpl: async (url, options) => {
        request = { url: String(url), headers: options.headers, body: JSON.parse(options.body) };
        return jsonResponse({ choices: [{ message: { content: JSON.stringify({ ideas: [completeIdea()] }) } }] });
      },
    },
  );
  assert.equal(request.url, "https://openrouter.ai/api/v1/chat/completions");
  assert.equal(request.headers.Authorization, "Bearer openrouter-test-key");
  assert.equal(request.body.model, "anthropic/claude-opus-4.6");
  assert.equal(request.body.stream, false);
  assert.equal(request.body.max_tokens, 8_000);
  assert.deepEqual(request.body.reasoning, { effort: "low", exclude: true });
  assert.deepEqual(request.body.provider, { data_collection: "deny", zdr: true });
  assert.equal(result.provider, "openrouter");
  assert.equal(result.ideas[0].title, "Portable service proof");
  assert.doesNotMatch(JSON.stringify(result), /openrouter-test-key/);
});

test("does not send Claude-specific controls to other OpenRouter models", async () => {
  let requestBody;
  const result = await generateIdeas(
    { provider: "openrouter", apiKey: "openrouter-test-key", model: "openai/gpt-4.1-mini" },
    "Generate one idea.",
    1,
    {
      fetchImpl: async (_url, options) => {
        requestBody = JSON.parse(options.body);
        return jsonResponse({ choices: [{ message: { content: JSON.stringify({ ideas: [completeIdea()] }) } }] });
      },
    },
  );
  assert.equal(requestBody.max_tokens, undefined);
  assert.equal(requestBody.reasoning, undefined);
  assert.deepEqual(requestBody.provider, { data_collection: "deny", zdr: true });
  assert.equal(result.ideas.length, 1);
});

test("idea generation aborts one slow model request at its configured deadline", async () => {
  let requests = 0;
  let observedAbort = false;
  const fetchImpl = async (_url, options) => {
    requests += 1;
    return await new Promise((_resolve, reject) => {
      const onAbort = () => {
        observedAbort = true;
        const error = new Error("aborted by deadline");
        error.name = "AbortError";
        reject(error);
      };
      if (options.signal.aborted) onAbort();
      else options.signal.addEventListener("abort", onAbort, { once: true });
    });
  };

  await assert.rejects(
    generateIdeas(
      { provider: "openrouter", apiKey: "timeout-test-key", model: "anthropic/claude-opus-4.6" },
      "Generate one idea.",
      1,
      { fetchImpl, timeoutMs: 5 },
    ),
    (error) => {
      assert.equal(error.code, "timeout");
      assert.match(error.message, /timed out/i);
      return true;
    },
  );
  assert.equal(requests, 1);
  assert.equal(observedAbort, true);
});

test("drafts evaluation proposals without mutating review inputs or accepting hallucinated IDs", async () => {
  const input = {
    projectContext: "Selected idea: portable service receipts. No interviews or tests have been run.",
    claimIds: ["1A", "2B"],
  };
  const before = structuredClone(input);
  let requestBody;
  const result = await draftEvaluation(
    { provider: "openaiCompatible", baseUrl: "https://models.example/v1", model: "review-model", apiKey: "evaluation-secret" },
    input,
    {
      fetchImpl: async (_url, options) => {
        requestBody = JSON.parse(options.body);
        return jsonResponse({
          choices: [{
            message: {
              content: JSON.stringify({
                claims: [
                  { claimId: "1a", suggestedMerit: 4.74, reasoning: "The actor and trigger are named.", confidence: "medium", uncertainty: "Workflow detail is thin." },
                  { claimId: "2B", suggestedMerit: "high", reasoning: "No behavior is supplied.", confidence: "unknown", uncertainty: "No interviews or commitments." },
                  { claimId: "99Z", suggestedMerit: 5, reasoning: "Hallucinated claim", confidence: "high", uncertainty: "None" },
                  { claimId: "1B", suggestedMerit: 5, reasoning: "Not requested", confidence: "high", uncertainty: "None" },
                ],
                gates: [
                  { gateId: "g1", suggestedStatus: "PASS", reasoning: "No illegal method is described.", confidence: "low", uncertainty: "No legal review." },
                  { gateId: "G2", suggestedStatus: "definitely", reasoning: "Malformed status", confidence: "high", uncertainty: "Missing proof." },
                  { gateId: "G99", suggestedStatus: "pass", reasoning: "Hallucinated gate", confidence: "high", uncertainty: "None" },
                ],
              }),
            },
          }],
        });
      },
    },
  );

  assert.deepEqual(input, before);
  assert.equal(requestBody.temperature, 0.1);
  assert.equal(requestBody.max_tokens, undefined);
  assert.equal(requestBody.reasoning, undefined);
  assert.equal(requestBody.messages[0].role, "system");
  assert.equal(requestBody.messages[1].role, "user");
  assert.doesNotMatch(requestBody.messages[0].content, /portable service receipts/);
  assert.match(requestBody.messages[1].content, /portable service receipts/);
  assert.deepEqual(result.claims.map(({ claimId }) => claimId), ["1A", "2B"]);
  assert.equal(result.claims[0].suggestedMerit, 4.5);
  assert.equal(result.claims[1].suggestedMerit, null);
  assert.equal(result.claims[1].confidence, "low");
  assert.deepEqual(result.gates.map(({ gateId }) => gateId), ["G1", "G2"]);
  assert.equal(result.gates[1].suggestedStatus, "unresolved");
  assert.equal(result.provisional, true);
  assert.doesNotMatch(JSON.stringify(result), /evaluation-secret|99Z|G99|evidenceGrade|weighted|reviewerVerified/);
});

test("idea fallback prompt uses a contract-first protocol counterfactual and structured kill test", async () => {
  let requestBody;
  await generateIdeas(
    { provider: "openaiCompatible", baseUrl: "https://models.example/v1", model: "model-a" },
    "Generate one idea.",
    1,
    {
      fetchImpl: async (_url, options) => {
        requestBody = JSON.parse(options.body);
        return jsonResponse({ choices: [{ message: { content: JSON.stringify({ ideas: [completeIdea()] }) } }] });
      },
    },
  );
  const system = requestBody.messages[0].content;
  assert.match(system, /contract-first opportunity generator/i);
  assert.match(system, /protocolCounterfactual/);
  assert.match(system, /killThreshold/);
  assert.match(system, /Xahau Hooks are small deterministic WebAssembly/i);
  assert.match(system, /Evernode is a decentralized marketplace/i);
  assert.match(system, /Use Neither yet when a conventional system is the honest answer/i);
});

test("idea fallback enforces profile-mode personal fit and keeps a valid partial slate", async () => {
  let requestBody;
  const validPrivate = completeIdea({
    title: "Private fit candidate",
    scores: {
      personalFit: 72,
      opportunitySignal: 68,
      protocolAffordance: 82,
      experimentability: 88,
    },
  });
  const missingPrivateFit = completeIdea({
    title: "Missing private fit",
    scores: {
      personalFit: null,
      opportunitySignal: 68,
      protocolAffordance: 82,
      experimentability: 88,
    },
  });
  const result = await generateIdeas(
    { provider: "openaiCompatible", baseUrl: "https://models.example/v1", model: "model-a" },
    "Generate two ideas from a private preference profile.",
    2,
    {
      profileMode: "private",
      fetchImpl: async (_url, options) => {
        requestBody = JSON.parse(options.body);
        return jsonResponse({ choices: [{ message: { content: JSON.stringify({ ideas: [validPrivate, missingPrivateFit] }) } }] });
      },
    },
  );
  assert.equal(result.ideas.length, 1);
  assert.equal(result.ideas[0].title, "Private fit candidate");
  assert.match(requestBody.messages[0].content, /personalFit must be a numeric 0-100 estimate/i);

  await assert.rejects(
    generateIdeas(
      { provider: "openaiCompatible", baseUrl: "https://models.example/v1", model: "model-a" },
      "Generate one neutral idea.",
      1,
      {
        profileMode: "neutral",
        fetchImpl: async () => jsonResponse({ choices: [{ message: { content: JSON.stringify({ ideas: [validPrivate] }) } }] }),
      },
    ),
    /did not return any complete ideas/i,
  );
});

test("idea normalization fails closed when exploration estimates or the experiment contract are missing", () => {
  assert.throws(
    () => normalizeGeneratedIdea(completeIdea({ scores: { personalFit: null } })),
    /omitted the opportunity-signal/i,
  );
  assert.throws(
    () => normalizeGeneratedIdea(completeIdea({ experimentPlan: undefined })),
    /structured 14-day experiment plan/i,
  );
});

test("thesis-screen mode rates testable hypotheses without fabricating validation outcomes", async () => {
  const input = {
    projectContext: "A newly generated receipt idea. Proposed test: ask ten operators to rank the current reconciliation problem. No interviews, payments, production usage, tests, or audits exist yet.",
    claimIds: ["1A", "2B", "5D"],
    scope: "thesis_screen",
  };
  const before = structuredClone(input);
  let requestBody;
  const result = await draftEvaluation(
    { provider: "openrouter", baseUrl: "https://openrouter.ai/api/v1", model: "anthropic/claude-opus-4.6", apiKey: "thesis-secret" },
    input,
    {
      fetchImpl: async (_url, options) => {
        requestBody = JSON.parse(options.body);
        return jsonResponse({
          choices: [{
            message: {
              content: JSON.stringify({
                claims: [
                  { claimId: "1A", suggestedMerit: 4.2, reasoning: "The actor and proposed problem measurement are specific.", confidence: "medium", uncertainty: "The trigger needs a measurable boundary." },
                  { claimId: "2B", suggestedMerit: null, reasoning: "The idea has no commitment hypothesis.", confidence: "low", uncertainty: "Define what observable commitment would falsify demand." },
                  { claimId: "5D", suggestedMerit: 2.8, reasoning: "A retention measurement is named but the interval is vague.", confidence: "low", uncertainty: "Define the repeat-use window." },
                ],
                gates: [
                  { gateId: "G1", suggestedStatus: "pass", reasoning: "No harmful or illegal method is proposed.", confidence: "low", uncertainty: "No legal review exists." },
                  { gateId: "G2", suggestedStatus: "unresolved", reasoning: "The actor is named but the trigger is incomplete.", confidence: "medium", uncertainty: "Specify the triggering workflow." },
                  { gateId: "G7", suggestedStatus: "conditional", reasoning: "A small discovery test is proposed.", confidence: "low", uncertainty: "Execution resources are unknown." },
                  { gateId: "G4", suggestedStatus: "pass", reasoning: "A production benchmark already passed.", confidence: "high", uncertainty: "None." },
                  { gateId: "G6", suggestedStatus: "conditional", reasoning: "Customers already paid enough to sustain it.", confidence: "high", uncertainty: "None." },
                  { gateId: "G8", suggestedStatus: "fail", reasoning: "An independent audit failed.", confidence: "high", uncertainty: "None." },
                ],
              }),
            },
          }],
        });
      },
    },
  );

  assert.deepEqual(input, before);
  assert.deepEqual(requestBody.provider, { data_collection: "deny", zdr: true });
  assert.equal(requestBody.max_tokens, 12_000);
  assert.deepEqual(requestBody.reasoning, { effort: "low", exclude: true });
  const systemPrompt = requestBody.messages[0].content;
  assert.match(systemPrompt, /THESIS SCREEN/i);
  assert.match(systemPrompt, /specificity, internal coherence, falsifiability/i);
  assert.match(systemPrompt, /proposed measurement plan/i);
  assert.match(systemPrompt, /Use 0 when the relevant hypothesis or measurement plan is absent/i);
  assert.match(systemPrompt, /Never imply that an interview occurred, a customer committed, a payment happened, production usage exists/i);
  assert.match(systemPrompt, /Only G1, G2, and G7 are meaningful thesis-screen gates/i);
  assert.doesNotMatch(systemPrompt, /missing basis requires suggestedMerit null/i);
  const userMessage = JSON.parse(requestBody.messages[1].content);
  assert.equal(userMessage.scope, "thesis_screen");
  assert.match(userMessage.task, /newly generated business hypothesis/i);
  assert.match(userMessage.task, /without claiming that direct validation already exists/i);
  assert.deepEqual(userMessage.requestedClaimIds, ["1A", "2B", "5D"]);

  assert.deepEqual(result.claims.map(({ suggestedMerit }) => suggestedMerit), [4, 0, 3]);
  assert.deepEqual(result.gates.map(({ gateId, suggestedStatus }) => [gateId, suggestedStatus]), [
    ["G1", "pass"],
    ["G2", "unresolved"],
    ["G7", "conditional"],
    ["G4", "not_due"],
    ["G6", "not_due"],
    ["G8", "not_due"],
  ]);
  for (const gate of result.gates.filter(({ gateId }) => !["G1", "G2", "G7"].includes(gateId))) {
    assert.equal(gate.reasoning, "This gate is not decisionable during thesis screening.");
    assert.equal(gate.confidence, "low");
    assert.equal(gate.uncertainty, "Direct validation has not started.");
  }
  assert.doesNotMatch(JSON.stringify(result), /production benchmark already passed|customers already paid|independent audit failed|thesis-secret/i);
});

test("gate-only refresh returns no claim proposals after evidence changes", async () => {
  let requestBody;
  const result = await draftEvaluation(
    { provider: "ollama", baseUrl: "http://127.0.0.1:11434", model: "local-reviewer" },
    { projectContext: "Current evidence excerpt: one operator completed the test.", claimIds: [], scope: "gates_only" },
    {
      fetchImpl: async (_url, options) => {
        requestBody = JSON.parse(options.body);
        return jsonResponse({
          message: {
            content: JSON.stringify({
              claims: [{ claimId: "1A", suggestedMerit: 5, reasoning: "Must be ignored", confidence: "high", uncertainty: "" }],
              gates: [{ gateId: "G4", suggestedStatus: "conditional", reasoning: "A prototype result exists, but architecture evidence is incomplete.", confidence: "medium", uncertainty: "Threat testing is missing." }],
            }),
          },
        });
      },
    },
  );

  assert.deepEqual(result.claims, []);
  assert.deepEqual(result.gates.map(({ gateId }) => gateId), ["G4"]);
  assert.match(requestBody.messages[0].content, /refreshes gates only/i);
  assert.doesNotMatch(requestBody.messages[0].content, /"id":"1A"/);
  const userMessage = JSON.parse(requestBody.messages[1].content);
  assert.deepEqual(userMessage.requestedClaimIds, []);
  assert.match(userMessage.task, /Return no claim proposals/);
});

test("normalizes proposal merit to half points and rejects noncanonical requested claim IDs before a request", async () => {
  const normalized = normalizeEvaluationProposals({
    claims: [
      { claimId: "1A", suggestedMerit: -3, reasoning: "low", confidence: "HIGH", uncertainty: "some" },
      { claimId: "1B", suggestedMerit: 8, reasoning: "high", confidence: "medium", uncertainty: "some" },
    ],
  }, ["1A", "1B"]);
  assert.deepEqual(normalized.claims.map(({ suggestedMerit }) => suggestedMerit), [0, 5]);

  let called = false;
  await assert.rejects(
    draftEvaluation(
      { provider: "ollama", baseUrl: "http://127.0.0.1:11434", model: "local" },
      { projectContext: "An idea", claimIds: ["1A", "NOT-A-CLAIM"] },
      { fetchImpl: async () => { called = true; return jsonResponse({}); } },
    ),
    /canonical rubric claim IDs/,
  );
  assert.equal(called, false);
});

test("extracts bounded evidence proposals only when excerpts occur verbatim in user source text", async () => {
  const sourceText = "Three operators completed the prototype test. Two buyers explicitly refused to switch.";
  let requestBody;
  const result = await extractEvidence(
    { provider: "ollama", baseUrl: "http://127.0.0.1:11434", model: "local-reviewer" },
    { sourceText, sourceLabel: "Interview notes" },
    {
      fetchImpl: async (_url, options) => {
        requestBody = JSON.parse(options.body);
        return jsonResponse({
          message: {
            content: JSON.stringify({
              evidence: [
                {
                  title: "Prototype completion",
                  sourceExcerpt: "Three operators completed the prototype test.",
                  claimIds: ["7B"],
                  suggestedType: "PrototypeTest",
                  suggestedGrade: "E4",
                  direction: "supports",
                  reviewerVerified: true,
                  reasoning: "The source describes a direct test.",
                  confidence: "high",
                  uncertainty: "Test conditions are absent.",
                },
                {
                  title: "Buyer rejection",
                  sourceExcerpt: "Two buyers explicitly refused to switch.",
                  claimIds: ["2D", "MADE-UP"],
                  suggestedType: "MagicProof",
                  suggestedGrade: "E9",
                  direction: "contradicts",
                  reviewerVerified: true,
                  reasoning: "The source contains negative-case evidence.",
                  confidence: "medium",
                  uncertainty: "Buyer identities are not supplied.",
                },
                {
                  title: "Fabricated payment",
                  sourceExcerpt: "A buyer paid $10,000.",
                  claimIds: ["2B"],
                  suggestedType: "Payment",
                  suggestedGrade: "E4",
                  direction: "supports",
                  reviewerVerified: true,
                  reasoning: "Payment would indicate commitment.",
                  confidence: "high",
                  uncertainty: "None",
                },
                {
                  title: "Unknown claim only",
                  sourceExcerpt: "Three operators completed the prototype test.",
                  claimIds: ["99Z"],
                  suggestedType: "PrototypeTest",
                  suggestedGrade: "E2",
                  direction: "supports",
                },
              ],
            }),
          },
        });
      },
    },
  );

  assert.equal(requestBody.options.temperature, 0.1);
  assert.doesNotMatch(requestBody.messages[0].content, /Three operators completed/);
  assert.match(requestBody.messages[0].content, /untrusted source document/);
  assert.match(requestBody.messages[1].content, /Three operators completed/);
  assert.equal(result.evidence.length, 3);
  assert.equal(result.evidence[0].suggestedType, "PrototypeTest");
  assert.equal(result.evidence[0].suggestedGrade, "E3");
  assert.equal(result.evidence[0].verificationStatus, "source_supported");
  assert.equal(result.evidence[0].reviewerVerified, false);
  assert.deepEqual(result.evidence[1].claimIds, ["2D"]);
  assert.equal(result.evidence[1].suggestedType, "Other");
  assert.equal(result.evidence[1].suggestedGrade, "E0");
  assert.equal(result.evidence[1].unverifiable, true);
  assert.equal(result.evidence[2].sourceExcerpt, "");
  assert.equal(result.evidence[2].suggestedGrade, "E0");
  assert.match(result.evidence[2].unverifiableReason, /exact verbatim excerpt/);
  assert.equal(JSON.stringify(result).includes("99Z"), false);
  assert.equal(JSON.stringify(result).includes("A buyer paid $10,000"), false);
});

test("evidence normalization never allows AI reviewer verification and preserves caller data", () => {
  const source = "Observed behavior occurred.";
  const output = {
    evidence: [{
      title: "Observation",
      sourceExcerpt: source,
      claimIds: ["1A"],
      suggestedType: "CustomerObservation",
      suggestedGrade: "E2",
      direction: "supports",
      reviewerVerified: true,
      reasoning: "Direct observation.",
      confidence: "high",
      uncertainty: "Small sample.",
    }],
  };
  const before = structuredClone(output);
  const proposals = normalizeEvidenceProposals(output, source);
  assert.deepEqual(output, before);
  assert.equal(proposals[0].reviewerVerified, false);
});

test("normalizes only bounded HTTPS provider citation annotations", () => {
  const oversized = "x".repeat(10_001);
  const citations = extractUrlCitations({
    choices: [{
      message: {
        annotations: [
          {
            type: "url_citation",
            url_citation: {
              url: "https://example.org/report?year=2026",
              title: "Primary report",
              content: "The published dataset covers 412 participating organizations.",
            },
          },
          {
            type: "url_citation",
            url: "https://standards.example/specification",
            title: "Public specification",
            content: "The specification defines a signed receipt format.",
          },
          {
            type: "url_citation",
            url_citation: { url: "http://insecure.example/result", title: "Insecure", content: "Must be ignored." },
          },
          {
            type: "url_citation",
            url_citation: { url: "https://empty.example/result", title: "Empty", content: "" },
          },
          {
            type: "url_citation",
            url_citation: { url: "https://oversized.example/result", title: "Oversized", content: oversized },
          },
          {
            type: "model_authored_link",
            url: "https://invented.example/result",
            title: "Wrong annotation type",
            content: "Must be ignored.",
          },
        ],
      },
    }],
  });

  assert.equal(citations.length, 2);
  assert.deepEqual(citations.map(({ sourceId }) => sourceId), ["SRC-001", "SRC-002"]);
  assert.equal(citations[0].url, "https://example.org/report?year=2026");
  assert.equal(citations[0].contentSha256.length, 64);
  assert.doesNotMatch(JSON.stringify(citations), /insecure|empty|oversized|invented/);
});

test("researches through OpenRouter web search, then maps exact provider excerpts conservatively", async () => {
  const apiKey = "private-research-key";
  const projectContext = "A portable service-receipt product for independent operators.";
  const providerExcerpt = "The published dataset covers 412 participating organizations in 2025.";
  const contradictoryExcerpt = "The survey found no measurable switching intent among respondents.";
  const requests = [];
  const responses = [
    {
      choices: [{
        message: {
          content: "I found sources, plus https://model-invented.example/not-an-annotation",
          annotations: [
            {
              type: "url_citation",
              url_citation: {
                url: "https://data.example.org/annual-report",
                title: "Annual report",
                content: providerExcerpt,
              },
            },
            {
              type: "url_citation",
              url_citation: {
                url: "https://research.example.net/switching-survey",
                title: "Switching survey",
                content: contradictoryExcerpt,
              },
            },
            {
              type: "url_citation",
              url_citation: {
                url: "https://no-excerpt.example.org/page",
                title: "No excerpt",
                content: "",
              },
            },
          ],
        },
      }],
      usage: { server_tool_use: { web_search_requests: 2 } },
    },
    {
      choices: [{
        message: {
          content: JSON.stringify({
            evidence: [
              {
                title: "Published participation base",
                sourceId: "SRC-001",
                sourceUrl: "https://model-invented.example/forged",
                sourceExcerpt: providerExcerpt,
                claimIds: ["1C", "NOT-A-CLAIM"],
                suggestedType: "Payment",
                suggestedGrade: "E4",
                direction: "supports",
                reviewerVerified: true,
                reasoning: "The public dataset bears on prevalence.",
                confidence: "high",
                uncertainty: "Population fit still needs validation.",
              },
              {
                title: "Negative switching signal",
                sourceId: "SRC-002",
                sourceExcerpt: contradictoryExcerpt,
                claimIds: ["2C"],
                direction: "contradicts",
                reasoning: "The public survey is a negative signal.",
                confidence: "medium",
                uncertainty: "The respondent segment may differ.",
              },
              {
                title: "Invented source",
                sourceId: "SRC-999",
                sourceExcerpt: "Fabricated evidence text.",
                claimIds: ["1A"],
                direction: "supports",
              },
              {
                title: "Paraphrase instead of excerpt",
                sourceId: "SRC-001",
                sourceExcerpt: "About four hundred organizations participated.",
                claimIds: ["1C"],
                direction: "supports",
              },
            ],
          }),
        },
      }],
    },
  ];

  const result = await researchEvidence(
    { provider: "openrouter", apiKey, model: "anthropic/claude-opus-4.6" },
    { projectContext, claimIds: ["1C", "2C"], maxSources: 50 },
    {
      now: () => new Date("2026-07-10T12:34:56.000Z"),
      fetchImpl: async (url, options) => {
        requests.push({ url: String(url), headers: options.headers, body: JSON.parse(options.body) });
        return jsonResponse(responses.shift());
      },
    },
  );

  assert.equal(requests.length, 2);
  assert.deepEqual(requests.map(({ url }) => url), [
    "https://openrouter.ai/api/v1/chat/completions",
    "https://openrouter.ai/api/v1/chat/completions",
  ]);
  assert.equal(requests[0].headers.Authorization, `Bearer ${apiKey}`);
  assert.equal(requests[0].body.tool_choice, "required");
  assert.equal(requests[0].body.max_tokens, 6_000);
  assert.deepEqual(requests[0].body.reasoning, { effort: "low", exclude: true });
  assert.deepEqual(requests[0].body.provider, { data_collection: "deny", zdr: true });
  assert.deepEqual(requests[0].body.tools, [{
    type: "openrouter:web_search",
    parameters: { engine: "exa", max_results: 10, max_total_results: 10, max_characters: 4000 },
  }]);
  assert.deepEqual(requests[1].body.provider, { data_collection: "deny", zdr: true });
  assert.equal(requests[1].body.max_tokens, 8_000);
  assert.deepEqual(requests[1].body.reasoning, { effort: "low", exclude: true });
  assert.equal("tools" in requests[1].body, false);
  assert.match(requests[0].body.messages[1].content, new RegExp(projectContext));
  assert.doesNotMatch(requests[0].body.messages[0].content, new RegExp(projectContext));

  assert.equal(result.evidence.length, 2);
  assert.equal(result.evidence[0].sourceUrl, "https://data.example.org/annual-report");
  assert.equal(result.evidence[0].suggestedType, "DeskResearch");
  assert.equal(result.evidence[0].suggestedGrade, "E1");
  assert.equal(result.evidence[0].verificationStatus, "provider_excerpt");
  assert.equal(result.evidence[0].reviewerVerified, false);
  assert.deepEqual(result.evidence[0].claimIds, ["1C"]);
  assert.equal(result.evidence[1].direction, "contradicts");
  assert.equal(result.provider, "openrouter");
  assert.equal(result.researchEngine, "exa");
  assert.equal(result.researchedAt, "2026-07-10T12:34:56.000Z");
  assert.equal(result.webSearchRequests, 2);
  assert.equal(result.provisional, true);
  assert.doesNotMatch(JSON.stringify(result), /private-research-key|model-invented|SRC-999|Fabricated evidence/);
});

test("cited-evidence normalization accepts only exact excerpts from known source IDs", () => {
  const citations = [{
    sourceId: "SRC-001",
    url: "https://example.org/source",
    title: "Source",
    content: "A sufficiently long exact public-source excerpt.",
    contentSha256: "unused-by-normalizer",
  }];
  const normalized = normalizeResearchEvidenceProposals({
    evidence: [{
      title: "Cited finding",
      sourceId: "SRC-001",
      sourceExcerpt: "A sufficiently long exact public-source excerpt.",
      claimIds: ["1A"],
      direction: "supports",
      reasoning: "Maps to the actor claim.",
      confidence: "high",
      uncertainty: "Public evidence is indirect.",
    }, {
      title: "Same excerpt, second claim",
      sourceId: "SRC-001",
      sourceExcerpt: "A sufficiently long exact public-source excerpt.",
      claimIds: ["1B"],
      direction: "supports",
      reasoning: "The same attributable observation also maps to consequence.",
      confidence: "medium",
      uncertainty: "Public evidence is indirect.",
    }],
  }, citations, ["1A", "1B"]);
  assert.equal(normalized.length, 1, "one exact excerpt becomes one evidence artifact");
  assert.deepEqual(normalized[0].claimIds, ["1A", "1B"]);
  assert.equal(normalized[0].sourceExcerpt, citations[0].content);
  assert.equal(normalized[0].sourceUrl, citations[0].url);
  assert.equal(normalized[0].suggestedGrade, "E1");
});

test("public research requires OpenRouter and sanitizes research failures", async () => {
  let called = false;
  await assert.rejects(
    researchEvidence(
      { provider: "ollama", baseUrl: "http://127.0.0.1:11434", model: "local" },
      { projectContext: "Private project context." },
      { fetchImpl: async () => { called = true; return jsonResponse({}); } },
    ),
    /requires OpenRouter/,
  );
  assert.equal(called, false);

  const key = "research-key-that-must-not-leak";
  const context = "sensitive research context";
  await assert.rejects(
    researchEvidence(
      { provider: "openrouter", apiKey: key, model: "provider/model" },
      { projectContext: context },
      {
        fetchImpl: async (url, options) => {
          throw new Error(`${url} ${options.headers.Authorization} ${options.body}`);
        },
      },
    ),
    (error) => {
      assert.match(error.message, /could not be reached/);
      assert.doesNotMatch(error.message, new RegExp(key));
      assert.doesNotMatch(error.message, new RegExp(context));
      return true;
    },
  );
});

test("AI proposal failures do not leak API keys or private context", async () => {
  const key = "private-proposal-key";
  const context = "private project context";
  await assert.rejects(
    draftEvaluation(
      { provider: "openrouter", apiKey: key, model: "provider/reviewer" },
      { projectContext: context, claimIds: ["1A"] },
      {
        fetchImpl: async (url, options) => {
          assert.equal(options.headers.Authorization, `Bearer ${key}`);
          assert.deepEqual(JSON.parse(options.body).provider, { data_collection: "deny", zdr: true });
          assert.doesNotMatch(options.body, new RegExp(key));
          throw new Error(`${url} ${options.headers.Authorization} ${context}`);
        },
      },
    ),
    (error) => {
      assert.match(error.message, /could not be reached/);
      assert.doesNotMatch(error.message, new RegExp(key));
      assert.doesNotMatch(error.message, new RegExp(context));
      return true;
    },
  );
});

test("rejects malformed and incomplete output but keeps valid partial slates", async () => {
  const config = { provider: "ollama", baseUrl: "http://localhost:11434", model: "local" };
  await assert.rejects(
    generateIdeas(config, "prompt", 1, { fetchImpl: async () => jsonResponse({ message: { content: "not json" } }) }),
    /valid idea JSON/,
  );
  assert.throws(() => normalizeGeneratedIdea({ title: "Only a title" }), /invalid idea|incomplete idea/);
  await assert.rejects(
    listModels(config, { fetchImpl: async () => new Response("{}", { status: 200, headers: { "content-length": "9000000" } }) }),
    /too large/,
  );
  const partial = await generateIdeas(
    config,
    "prompt",
    2,
    { fetchImpl: async () => jsonResponse({ message: { content: JSON.stringify({ ideas: [completeIdea()] }) } }) },
  );
  assert.equal(partial.ideas.length, 1);

  const salvaged = await generateIdeas(
    config,
    "prompt",
    2,
    {
      fetchImpl: async () => jsonResponse({
        message: {
          content: JSON.stringify({
            ideas: [
              { title: "Incomplete" },
              completeIdea(),
              completeIdea({ title: "Second complete idea" }),
            ],
          }),
        },
      }),
    },
  );
  assert.equal(salvaged.ideas.length, 2);
});

test("sanitizes HTTP and network failures", async () => {
  await assert.rejects(
    listModels(
      { provider: "openaiCompatible", baseUrl: "https://models.example/v1", apiKey: "bad" },
      { fetchImpl: async () => jsonResponse({ error: "private upstream details" }, 401) },
    ),
    /HTTP 401\. Check the API key/,
  );
  await assert.rejects(
    listModels(
      { provider: "ollama", baseUrl: "http://localhost:11434" },
      { fetchImpl: async () => { throw new Error("ECONNREFUSED with local path"); } },
    ),
    /could not be reached/,
  );
  await assert.rejects(
    listModels(
      { provider: "openrouter", apiKey: "limited-key" },
      { fetchImpl: async () => jsonResponse({ error: { message: "private billing detail" } }, 402) },
    ),
    /Add credits or check the key's spending limit/,
  );
});
