const PROVIDERS = new Set(["ollama", "lmstudio", "openrouter", "openaiCompatible"]);
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);
const MAX_RESPONSE_BYTES = 2_000_000;
const MAX_PROMPT_CHARS = 60_000;
const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

export const PROVIDER_DEFAULTS = Object.freeze({
  ollama: "http://127.0.0.1:11434",
  lmstudio: "http://127.0.0.1:1234/v1",
  openrouter: OPENROUTER_BASE_URL,
  openaiCompatible: "https://api.openai.com/v1",
});

export class ConnectorError extends Error {
  constructor(code, publicMessage) {
    super(publicMessage);
    this.name = "ConnectorError";
    this.code = code;
    this.publicMessage = publicMessage;
  }
}

function cleanString(value, maxLength, required = true) {
  if (typeof value !== "string") {
    if (required) throw new ConnectorError("invalid_output", "The model returned an invalid idea structure.");
    return "";
  }
  const cleaned = value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, " ").trim();
  if (required && !cleaned) throw new ConnectorError("invalid_output", "The model returned an incomplete idea.");
  return cleaned.slice(0, maxLength);
}

function pick(record, ...keys) {
  for (const key of keys) {
    if (record && record[key] !== undefined) return record[key];
  }
  return undefined;
}

function clampScore(value, fallback = 50) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.round(Math.max(0, Math.min(100, number)) * 10) / 10;
}

function normalizeRoute(value) {
  const compact = String(value ?? "").trim().toLowerCase().replaceAll(/[_-]+/g, " ");
  if (compact.includes("both") || compact.includes("hybrid") || (compact.includes("xahau") && compact.includes("evernode"))) return "Both";
  if (compact.includes("xahau")) return "Xahau";
  if (compact.includes("evernode")) return "Evernode";
  return "Neither yet";
}

export function normalizeConfig(input = {}, fallback = {}) {
  if (input.provider !== undefined && !PROVIDERS.has(input.provider)) {
    throw new ConnectorError("invalid_provider", "Choose a supported model provider.");
  }
  const provider = PROVIDERS.has(input.provider)
    ? input.provider
    : PROVIDERS.has(fallback.provider)
      ? fallback.provider
      : "ollama";
  const rawBaseUrl = String(input.baseUrl ?? fallback.baseUrl ?? PROVIDER_DEFAULTS[provider]).trim();
  if (!rawBaseUrl || rawBaseUrl.length > 2_048 || /[\u0000-\u001F\u007F]/.test(rawBaseUrl)) {
    throw new ConnectorError("invalid_endpoint", "Enter a valid model endpoint URL.");
  }
  let url;
  try {
    url = new URL(rawBaseUrl);
  } catch {
    throw new ConnectorError("invalid_endpoint", "Enter a valid model endpoint URL.");
  }
  if (!new Set(["http:", "https:"]).has(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new ConnectorError("invalid_endpoint", "The model endpoint must be a plain HTTP or HTTPS base URL.");
  }
  if ((provider === "ollama" || provider === "lmstudio") && !LOCAL_HOSTS.has(url.hostname)) {
    throw new ConnectorError("non_local_endpoint", `${provider === "ollama" ? "Ollama" : "LM Studio"} must use localhost. Choose OpenAI-compatible for a remote endpoint.`);
  }
  url.pathname = url.pathname.replace(/\/+$/, "") || "";
  if (
    provider === "openrouter" &&
    (url.protocol !== "https:" || url.hostname !== "openrouter.ai" || url.port || url.pathname !== "/api/v1")
  ) {
    throw new ConnectorError("invalid_endpoint", `OpenRouter is locked to ${OPENROUTER_BASE_URL} so its API key cannot be sent elsewhere.`);
  }
  const explicitApiKey = String(input.apiKey ?? "").trim();
  const sameProvider = fallback.provider === undefined || fallback.provider === provider;
  const apiKey = input.clearApiKey === true
    ? ""
    : explicitApiKey || (sameProvider ? String(fallback.apiKey ?? "").trim() : "");
  if (apiKey.length > 4096) throw new ConnectorError("invalid_api_key", "The API key is too long.");
  return {
    provider,
    baseUrl: url.toString().replace(/\/$/, ""),
    model: String(input.model ?? fallback.model ?? "").trim().slice(0, 300),
    apiKey,
  };
}

export function assertProviderReady(config) {
  if (config.provider === "openrouter" && !config.apiKey) {
    throw new ConnectorError("missing_api_key", "Enter an OpenRouter API key before connecting.");
  }
  return config;
}

function endpoint(config, path) {
  const normalizedPath = path.replace(/^\/+/, "");
  if (config.provider === "ollama" && /\/api$/i.test(config.baseUrl) && normalizedPath.startsWith("api/")) {
    return `${config.baseUrl}/${normalizedPath.slice(4)}`;
  }
  return `${config.baseUrl}/${normalizedPath}`;
}

function headersFor(config, json = false) {
  assertProviderReady(config);
  const headers = { Accept: "application/json" };
  if (json) headers["Content-Type"] = "application/json";
  if (config.apiKey) headers.Authorization = `Bearer ${config.apiKey}`;
  if (config.provider === "openrouter") headers["X-OpenRouter-Title"] = "Idea Foundry";
  return headers;
}

function endpointErrorMessage(status) {
  if (status === 401 || status === 403) return `The model endpoint returned HTTP ${status}. Check the API key.`;
  if (status === 402) return "OpenRouter returned HTTP 402. Add credits or check the key's spending limit.";
  if (status === 429) return "The model endpoint is rate-limited. Wait briefly and try again.";
  if (status === 503) return "The model endpoint has no available provider for this request. Try another model or try again later.";
  return `The model endpoint returned HTTP ${status}.`;
}

async function responseText(response) {
  const advertised = Number(response.headers?.get?.("content-length") ?? 0);
  if (advertised > MAX_RESPONSE_BYTES) throw new ConnectorError("response_too_large", "The model response was too large.");
  let text;
  if (response.body?.getReader) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let bytes = 0;
    const parts = [];
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > MAX_RESPONSE_BYTES) {
          await reader.cancel();
          throw new ConnectorError("response_too_large", "The model response was too large.");
        }
        parts.push(decoder.decode(value, { stream: true }));
      }
      parts.push(decoder.decode());
      text = parts.join("");
    } finally {
      reader.releaseLock();
    }
  } else {
    text = await response.text();
    if (new TextEncoder().encode(text).byteLength > MAX_RESPONSE_BYTES) {
      throw new ConnectorError("response_too_large", "The model response was too large.");
    }
  }
  if (!response.ok) {
    throw new ConnectorError("endpoint_error", endpointErrorMessage(response.status));
  }
  return text;
}

async function request(config, path, options, fetchImpl, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(endpoint(config, path), {
      ...options,
      redirect: "error",
      signal: controller.signal,
    });
    return await responseText(response);
  } catch (error) {
    if (error instanceof ConnectorError) throw error;
    if (error?.name === "AbortError") throw new ConnectorError("timeout", "The model endpoint timed out.");
    throw new ConnectorError("unreachable", "The model endpoint could not be reached. Check that it is running and the URL is correct.");
  } finally {
    clearTimeout(timeout);
  }
}

function parseJson(text, errorMessage = "The model endpoint returned invalid JSON.") {
  try {
    return JSON.parse(text);
  } catch {
    throw new ConnectorError("invalid_json", errorMessage);
  }
}

export async function listModels(configInput, { fetchImpl = fetch, timeoutMs = 15_000 } = {}) {
  const config = normalizeConfig(configInput);
  if (config.provider === "ollama") {
    const payload = parseJson(await request(config, "api/tags", { method: "GET", headers: headersFor(config) }, fetchImpl, timeoutMs));
    const models = Array.isArray(payload?.models) ? payload.models : [];
    return models
      .map((model) => ({ id: String(model?.name ?? model?.model ?? "").trim(), name: String(model?.name ?? model?.model ?? "").trim() }))
      .filter((model) => model.id)
      .slice(0, 500);
  }
  const payload = parseJson(await request(config, "models", { method: "GET", headers: headersFor(config) }, fetchImpl, timeoutMs));
  const models = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload?.models) ? payload.models : [];
  return models
    .map((model) => {
      const id = String(typeof model === "string" ? model : model?.id ?? model?.name ?? "").trim();
      return { id, name: String(typeof model === "string" ? model : model?.name ?? id).trim() || id };
    })
    .filter((model) => model.id)
    .slice(0, 500);
}

export async function testConnection(configInput, options = {}) {
  const started = Date.now();
  const config = normalizeConfig(configInput);
  const models = await listModels(config, options);
  return {
    ok: true,
    message: models.length ? `Connected. ${models.length} model${models.length === 1 ? " is" : "s are"} available.` : "Connected, but the endpoint exposed no models.",
    provider: config.provider,
    baseUrl: config.baseUrl,
    model: config.model || models[0]?.id || "",
    latencyMs: Date.now() - started,
  };
}

function extractModelContent(config, payload) {
  if (config.provider === "ollama") return payload?.message?.content ?? payload?.response;
  const content = payload?.choices?.[0]?.message?.content ?? payload?.output_text;
  if (Array.isArray(content)) {
    return content.map((part) => typeof part === "string" ? part : part?.text ?? "").join("");
  }
  return content;
}

function extractIdeaArray(content) {
  if (typeof content !== "string") throw new ConnectorError("invalid_output", "The model returned no usable text.");
  const unfenced = content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  let parsed;
  try {
    parsed = JSON.parse(unfenced);
  } catch {
    const objectStart = unfenced.indexOf("{");
    const objectEnd = unfenced.lastIndexOf("}");
    const arrayStart = unfenced.indexOf("[");
    const arrayEnd = unfenced.lastIndexOf("]");
    const candidate = objectStart >= 0 && objectEnd > objectStart
      ? unfenced.slice(objectStart, objectEnd + 1)
      : arrayStart >= 0 && arrayEnd > arrayStart
        ? unfenced.slice(arrayStart, arrayEnd + 1)
        : "";
    parsed = parseJson(candidate, "The model did not return valid idea JSON.");
  }
  const ideas = Array.isArray(parsed) ? parsed : parsed?.ideas;
  if (!Array.isArray(ideas) || ideas.length === 0) throw new ConnectorError("invalid_output", "The model returned no ideas in the required JSON format.");
  return ideas;
}

export function normalizeGeneratedIdea(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ConnectorError("invalid_output", "The model returned an invalid idea.");
  const scores = pick(value, "scores", "explorationScores", "exploration_scores") ?? {};
  const score = (camel, snake, fallback = 50) => clampScore(pick(scores, camel, snake), fallback);
  const personalRaw = pick(scores, "personalFit", "personal_fit");
  return {
    title: cleanString(pick(value, "title", "name"), 180),
    concept: cleanString(pick(value, "concept", "summary", "oneSentenceConcept", "one_sentence_concept"), 4_000),
    user: cleanString(pick(value, "user", "targetUser", "target_user"), 500),
    buyer: cleanString(pick(value, "buyer", "customer", "economicBuyer", "economic_buyer"), 500),
    triggeringSituation: cleanString(pick(value, "triggeringSituation", "trigger", "triggering_situation"), 2_000, false),
    currentAlternative: cleanString(pick(value, "currentAlternative", "currentSubstitute", "current_alternative"), 3_000),
    materialConsequence: cleanString(pick(value, "materialConsequence", "consequence", "material_consequence"), 2_000, false),
    protocolNeed: cleanString(pick(value, "protocolNeed", "whyProtocol", "why_xahau_evernode", "protocol_need"), 3_000, false),
    failureReason: cleanString(pick(value, "failureReason", "largestFailureReason", "failure_reason"), 3_000, false),
    criticalAssumption: cleanString(pick(value, "criticalAssumption", "critical_assumption"), 3_000),
    experiment: cleanString(pick(value, "experiment", "fourteenDayExperiment", "14DayExperiment", "fourteen_day_experiment"), 4_000),
    route: normalizeRoute(pick(value, "route", "likelyRoute", "likely_route")),
    scores: {
      personalFit: personalRaw === undefined || personalRaw === null ? null : clampScore(personalRaw),
      opportunitySignal: score("opportunitySignal", "opportunity_signal"),
      protocolAffordance: score("protocolAffordance", "protocol_affordance"),
      experimentability: score("experimentability", "experimentability"),
    },
  };
}

function systemPrompt(count) {
  return `Return only valid JSON with one top-level key named "ideas" containing exactly ${count} objects. Each object must contain title, concept, user, buyer, triggeringSituation, currentAlternative, materialConsequence, protocolNeed, failureReason, criticalAssumption, experiment, route, and scores. route must be Xahau, Evernode, Both, or Neither yet. scores must contain personalFit (or null), opportunitySignal, protocolAffordance, and experimentability from 0 to 100. These are exploration hypotheses, never evidence or validated scores. Do not invent interviews, commitments, payments, benchmarks, audits, or protocol facts.`;
}

export async function generateIdeas(configInput, prompt, count = 8, { fetchImpl = fetch, timeoutMs = 180_000 } = {}) {
  const config = normalizeConfig(configInput);
  if (!config.model) throw new ConnectorError("missing_model", "Choose a model before generating ideas.");
  const cleanPrompt = String(prompt ?? "").trim();
  if (!cleanPrompt || cleanPrompt.length > MAX_PROMPT_CHARS) throw new ConnectorError("invalid_prompt", "The generation prompt is empty or too large.");
  const requestedCount = Math.max(1, Math.min(12, Number.isFinite(Number(count)) ? Math.floor(Number(count)) : 8));
  const messages = [
    { role: "system", content: systemPrompt(requestedCount) },
    { role: "user", content: cleanPrompt },
  ];
  const path = config.provider === "ollama" ? "api/chat" : "chat/completions";
  const body = config.provider === "ollama"
    ? { model: config.model, messages, stream: false, format: "json", options: { temperature: 0.7 } }
    : { model: config.model, messages, stream: false, temperature: 0.7 };
  const raw = await request(config, path, { method: "POST", headers: headersFor(config, true), body: JSON.stringify(body) }, fetchImpl, timeoutMs);
  const payload = parseJson(raw);
  const ideas = extractIdeaArray(extractModelContent(config, payload))
    .slice(0, requestedCount)
    .map(normalizeGeneratedIdea);
  if (ideas.length !== requestedCount) {
    throw new ConnectorError("invalid_output", `The model returned ${ideas.length} usable idea${ideas.length === 1 ? "" : "s"}; ${requestedCount} were requested.`);
  }
  return { ideas, provider: config.provider, model: config.model };
}

export function publicError(error) {
  return error instanceof ConnectorError ? error.publicMessage : "The local model connector encountered an unexpected error.";
}
