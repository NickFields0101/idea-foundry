import assert from "node:assert/strict";
import test from "node:test";

import {
  ConnectorError,
  draftEvaluation,
  extractEvidence,
  generateIdeas,
  listModels,
  normalizeConfig,
  normalizeEvaluationProposals,
  normalizeEvidenceProposals,
  normalizeGeneratedIdea,
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
    protocolNeed: "Shared verifiability",
    failureReason: "Networks may not change workflow",
    criticalAssumption: "Buyers value portable proof",
    experiment: "Test signed receipts with three operators for 14 days",
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
  assert.equal(request.headers["X-OpenRouter-Title"], "Idea Foundry");
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

test("generates ideas through OpenRouter without exposing its key in output", async () => {
  let request = {};
  const result = await generateIdeas(
    { provider: "openrouter", apiKey: "openrouter-test-key", model: "openai/gpt-4.1-mini" },
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
  assert.equal(request.body.model, "openai/gpt-4.1-mini");
  assert.equal(request.body.stream, false);
  assert.equal(result.provider, "openrouter");
  assert.equal(result.ideas[0].title, "Portable service proof");
  assert.doesNotMatch(JSON.stringify(result), /openrouter-test-key/);
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

test("rejects malformed, incomplete, and oversized model output", async () => {
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
  await assert.rejects(
    generateIdeas(config, "prompt", 2, { fetchImpl: async () => jsonResponse({ message: { content: JSON.stringify({ ideas: [completeIdea()] }) } }) }),
    /2 were requested/,
  );
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
