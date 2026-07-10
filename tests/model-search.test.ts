import assert from "node:assert/strict";
import test from "node:test";

import { searchLlmModels } from "../app/lib/model-search.ts";

const models = [
  { id: "openai/gpt-4.8-mini", name: "GPT 4.8 Mini" },
  { id: "anthropic/claude-opus-4-8", name: "Anthropic: Claude Opus 4-8" },
  { id: "meta-llama/llama-4", name: "Meta: Llama 4" },
];

test("finds friendly model names from a version-only search", () => {
  assert.deepEqual(
    searchLlmModels(models, "4.8", ["OpenRouter", "openrouter"]).map((model) => model.name),
    ["GPT 4.8 Mini", "Anthropic: Claude Opus 4-8"],
  );
});

test("searches name and model ID with order-independent terms", () => {
  assert.deepEqual(
    searchLlmModels(models, "4.8 opus").map((model) => model.id),
    ["anthropic/claude-opus-4-8"],
  );
  assert.deepEqual(
    searchLlmModels(models, "anthropic 4.8").map((model) => model.id),
    ["anthropic/claude-opus-4-8"],
  );
});

test("treats punctuation-separated partial queries as equivalent", () => {
  assert.deepEqual(
    searchLlmModels(models, "opus.4.8").map((model) => model.id),
    ["anthropic/claude-opus-4-8"],
  );
  assert.deepEqual(
    searchLlmModels(models, "opus/4_8").map((model) => model.id),
    ["anthropic/claude-opus-4-8"],
  );
});

test("preserves exact-name, name-prefix, exact-ID, and ID-prefix ranking tiers", () => {
  const rankedModels = [
    { id: "vendor/general", name: "Claude Opus 4-8 general match" },
    { id: "vendor/name-prefix", name: "Opus 4-8 Extended" },
    { id: "vendor/name-exact", name: "Opus-4.8" },
    { id: "opus-4-8", name: "Exact ID" },
    { id: "opus-4-8-preview", name: "ID prefix" },
  ];

  assert.deepEqual(
    searchLlmModels(rankedModels, "opus.4.8").map((model) => model.id),
    [
      "vendor/name-exact",
      "vendor/name-prefix",
      "opus-4-8",
      "opus-4-8-preview",
      "vendor/general",
    ],
  );
});

test("can match the current provider and preserves catalog order without a query", () => {
  assert.equal(searchLlmModels(models, "openrouter", ["OpenRouter"]).length, 3);
  assert.strictEqual(searchLlmModels(models, ""), models);
});
