import assert from "node:assert/strict";
import test from "node:test";

import {
  ConnectorError,
  generateIdeas,
  listModels,
  normalizeConfig,
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

test("rejects malformed, incomplete, and oversized model output", async () => {
  const config = { provider: "ollama", baseUrl: "http://localhost:11434", model: "local" };
  await assert.rejects(
    generateIdeas(config, "prompt", 1, { fetchImpl: async () => jsonResponse({ message: { content: "not json" } }) }),
    /valid idea JSON/,
  );
  assert.throws(() => normalizeGeneratedIdea({ title: "Only a title" }), /invalid idea|incomplete idea/);
  await assert.rejects(
    listModels(config, { fetchImpl: async () => new Response("{}", { status: 200, headers: { "content-length": "3000000" } }) }),
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
