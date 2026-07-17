import { spawn as nodeSpawn } from "node:child_process";
import { constants as fsConstants, promises as fs } from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";

export const INTELLIGENCE_PROTOCOL = "sift-intelligence/1";

const STARTUP_TIMEOUT_MS = 8_000;
const DEFAULT_RUN_TIMEOUT_MS = 120_000;
const MIN_RUN_TIMEOUT_MS = 10_000;
const MAX_RUN_TIMEOUT_MS = 120_000;
const DEFAULT_FORGE_TIMEOUT_MS = 180_000;
const MAX_FORGE_TIMEOUT_MS = 180_000;
const CANCEL_GRACE_MS = 2_000;
const MAX_LINE_BYTES = 2 * 1024 * 1024;
const MAX_BUFFER_BYTES = MAX_LINE_BYTES * 2;
const MAX_EVENTS_PER_RUN = 512;
const MAX_EVENT_MESSAGE_CHARS = 2_000;
const MAX_RESULT_BYTES = 2 * 1024 * 1024;
const MAX_SOURCE_INPUT_CHARS = 48_000;
const MAX_WORKER_INPUT_CHARS = 60_000;
const TERMINAL_RETENTION_MS = 10 * 60 * 1_000;
const UNAVAILABLE_RETRY_MS = 5_000;
const RUN_ID_PATTERN = /^[a-zA-Z0-9_-]{1,128}$/;
const SENSITIVE_KEY = /(?:api.?key|authorization|credential|mnemonic|password|passphrase|private.?key|secret|seed|token)/i;
const UNSAFE_KEY = /^(?:__proto__|constructor|prototype)$/;
const COMPETITOR_WORKER_PHASES = Object.freeze({
  validating: "starting",
  preparing: "competitors",
  model: "red_team",
  validating_output: "synthesizing",
  complete: "synthesizing",
  cancelling: "synthesizing",
});
const IDEA_FORGE_WORKER_PHASES = Object.freeze({
  validating: "briefing",
  framing: "briefing",
  briefing: "briefing",
  diverging: "diverging",
  critiquing: "critiquing",
  revising: "revising",
  verifying: "verifying",
  validating_output: "verifying",
  diversifying: "diversifying",
  complete: "complete",
  cancelling: "complete",
});
const SUPPORTED_TASKS = new Set(["competitor_red_team", "idea_forge"]);
const TERMINAL_STATUS = new Set(["completed", "failed", "cancelled"]);

export class IntelligenceBridgeError extends Error {
  constructor(code, publicMessage) {
    super(publicMessage);
    this.name = "IntelligenceBridgeError";
    this.code = code;
    this.publicMessage = publicMessage;
  }
}

function invalid(message = "That intelligence request is not supported.") {
  throw new IntelligenceBridgeError("invalid_request", message);
}

function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function exactKeys(value, allowed, label) {
  if (!isPlainObject(value)) invalid(`${label} must be an object.`);
  for (const key of Object.keys(value)) {
    if (UNSAFE_KEY.test(key) || !allowed.has(key)) invalid(`${label} contains an unsupported field.`);
  }
}

function exactRequiredKeys(value, allowed, label) {
  exactKeys(value, allowed, label);
  for (const key of allowed) {
    if (!Object.hasOwn(value, key)) invalid(`${label} is missing a required field.`);
  }
}

function boundedString(value, label, maximum, { required = false } = {}) {
  if (value === undefined || value === null) {
    if (required) invalid(`${label} is required.`);
    return "";
  }
  if (typeof value !== "string") invalid(`${label} must be text.`);
  const normalized = value.trim();
  if (required && !normalized) invalid(`${label} is required.`);
  if (normalized.length > maximum) invalid(`${label} is too long.`);
  return normalized;
}

function optionalInteger(value, label, minimum, maximum, fallback) {
  if (value === undefined || value === null) return fallback;
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    invalid(`${label} must be between ${minimum} and ${maximum}.`);
  }
  return value;
}

function safePublicUrl(value) {
  const text = boundedString(value, "Source URL", 2_048, { required: true });
  let url;
  try {
    url = new URL(text);
  } catch {
    invalid("Every public source must have a valid HTTPS URL.");
  }
  if (url.protocol !== "https:" || url.username || url.password) {
    invalid("Every public source must have a valid HTTPS URL.");
  }
  return url.href;
}

function validateCompetitorInput(input) {
  exactKeys(input.context, new Set(["idea", "projectBoundary", "publicSources"]), "Intelligence context");
  exactKeys(
    input.context.idea,
    new Set([
      "title",
      "concept",
      "user",
      "buyer",
      "currentAlternative",
      "criticalAssumption",
      "experiment",
      "route",
    ]),
    "Idea",
  );

  const idea = {
    title: boundedString(input.context.idea.title, "Idea title", 300, { required: true }),
    concept: boundedString(input.context.idea.concept, "Idea concept", 8_000, { required: true }),
    user: boundedString(input.context.idea.user, "Target user", 1_000),
    buyer: boundedString(input.context.idea.buyer, "Buyer", 2_000),
    currentAlternative: boundedString(input.context.idea.currentAlternative, "Current alternative", 4_000),
    criticalAssumption: boundedString(input.context.idea.criticalAssumption, "Critical assumption", 4_000),
    experiment: boundedString(input.context.idea.experiment, "Experiment", 4_000),
    route: boundedString(input.context.idea.route, "Protocol route", 100),
  };
  const projectBoundary = boundedString(input.context.projectBoundary, "Project boundary", 10_000);
  const sourceInput = input.context.publicSources ?? [];
  if (!Array.isArray(sourceInput) || sourceInput.length > 12) invalid("Public sources must contain at most 12 items.");
  let sourceCharacters = 0;
  const seenSourceIds = new Set();
  const publicSources = sourceInput.map((source) => {
    exactKeys(source, new Set(["sourceId", "url", "title", "content", "contentSha256"]), "Public source");
    const content = boundedString(source.content, "Source content", 4_000, { required: true });
    sourceCharacters += content.length;
    const contentSha256 = boundedString(source.contentSha256, "Source checksum", 64, { required: true }).toLowerCase();
    if (!/^[a-f0-9]{64}$/.test(contentSha256)) invalid("Every public source must include a SHA-256 checksum.");
    const actualChecksum = createHash("sha256").update(content, "utf8").digest("hex");
    if (actualChecksum !== contentSha256) invalid("A public source changed after its checksum was created.");
    const sourceId = boundedString(source.sourceId, "Source ID", 80, { required: true });
    if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/.test(sourceId) || seenSourceIds.has(sourceId)) {
      invalid("Source IDs must be unique opaque identifiers.");
    }
    seenSourceIds.add(sourceId);
    return {
      sourceId,
      url: safePublicUrl(source.url),
      title: boundedString(source.title, "Source title", 300, { required: true }),
      content,
      contentSha256,
    };
  });
  if (sourceCharacters > MAX_SOURCE_INPUT_CHARS) invalid("The combined public source material is too large.");

  const limitsInput = input.limits ?? {};
  exactKeys(limitsInput, new Set(["timeoutMs", "maxSources"]), "Intelligence limits");
  const limits = {
    timeoutMs: optionalInteger(limitsInput.timeoutMs, "Timeout", MIN_RUN_TIMEOUT_MS, MAX_RUN_TIMEOUT_MS, DEFAULT_RUN_TIMEOUT_MS),
    maxSources: optionalInteger(limitsInput.maxSources, "Source limit", 1, 12, 8),
  };
  if (publicSources.length > limits.maxSources) invalid("The public source list exceeds the selected source limit.");
  return { task: "competitor_red_team", context: { idea, projectBoundary, publicSources }, limits };
}

function weightedProfileItems(value, label, maximum) {
  if (!Array.isArray(value) || value.length > maximum) invalid(`${label} must contain at most ${maximum} items.`);
  const seenLabels = new Set();
  return value.map((item) => {
    exactKeys(item, new Set(["label", "weight"]), label.slice(0, -1));
    const itemLabel = boundedString(item.label, `${label} label`, 120, { required: true });
    const normalizedLabel = itemLabel.toLocaleLowerCase("en-US");
    if (seenLabels.has(normalizedLabel)) invalid(`${label} labels must be unique.`);
    seenLabels.add(normalizedLabel);
    if (!Number.isInteger(item.weight) || item.weight < 0 || item.weight > 100) {
      invalid(`${label} weights must be non-negative whole numbers no greater than 100.`);
    }
    return { label: itemLabel, weight: item.weight };
  });
}

function workStyleItems(value) {
  if (!Array.isArray(value) || value.length > 8) invalid("Work-style preferences must contain at most 8 items.");
  const seenLabels = new Set();
  return value.map((item) => {
    exactKeys(item, new Set(["label", "orientation"]), "Work-style preference");
    const label = boundedString(item.label, "Work-style label", 120, { required: true });
    const normalizedLabel = label.toLocaleLowerCase("en-US");
    if (seenLabels.has(normalizedLabel)) invalid("Work-style labels must be unique.");
    seenLabels.add(normalizedLabel);
    return {
      label,
      orientation: boundedString(item.orientation, "Work-style orientation", 240, { required: true }),
    };
  });
}

function validateIdeaForgeInput(input) {
  exactRequiredKeys(input.context, new Set(["opportunityBoundary", "requestedCount", "profile"]), "Idea Forge context");
  exactRequiredKeys(
    input.context.profile,
    new Set(["mode", "searchThemes", "fitDimensions", "workStylePreferences"]),
    "Idea Forge profile",
  );
  const mode = input.context.profile.mode;
  if (mode !== "neutral" && mode !== "private") invalid("Idea Forge profile mode must be neutral or private.");
  const context = {
    opportunityBoundary: boundedString(
      input.context.opportunityBoundary,
      "Opportunity boundary",
      10_000,
      { required: true },
    ),
    requestedCount: optionalInteger(input.context.requestedCount, "Requested idea count", 1, 12, 4),
    profile: {
      mode,
      searchThemes: weightedProfileItems(input.context.profile.searchThemes, "Search themes", 6),
      fitDimensions: weightedProfileItems(input.context.profile.fitDimensions, "Fit dimensions", 8),
      workStylePreferences: workStyleItems(input.context.profile.workStylePreferences),
    },
  };
  const limitsInput = input.limits ?? {};
  exactRequiredKeys(limitsInput, new Set(["timeoutMs"]), "Idea Forge limits");
  const limits = {
    timeoutMs: optionalInteger(
      limitsInput.timeoutMs,
      "Timeout",
      MIN_RUN_TIMEOUT_MS,
      MAX_FORGE_TIMEOUT_MS,
      DEFAULT_FORGE_TIMEOUT_MS,
    ),
  };
  return { task: "idea_forge", context, limits };
}

/** Validate the deliberately small renderer-to-main intelligence surface. */
export function validateStartInput(input) {
  exactKeys(input, new Set(["task", "context", "limits"]), "Intelligence request");
  if (input.task === "competitor_red_team") return validateCompetitorInput(input);
  if (input.task === "idea_forge") return validateIdeaForgeInput(input);
  invalid("That intelligence task is not available.");
}

function validateConnector(connector) {
  exactKeys(connector, new Set(["provider", "baseUrl", "model", "apiKey"]), "Model connector");
  const provider = boundedString(connector.provider, "Model provider", 64, { required: true });
  const baseUrl = boundedString(connector.baseUrl, "Model endpoint", 2_048, { required: true });
  let url;
  try {
    url = new URL(baseUrl);
  } catch {
    invalid("The saved model endpoint is invalid.");
  }
  if (!new Set(["https:", "http:"]).has(url.protocol) || url.username || url.password) {
    invalid("The saved model endpoint is invalid.");
  }
  if (url.protocol === "http:" && !new Set(["localhost", "127.0.0.1", "[::1]", "::1"]).has(url.hostname.toLowerCase())) {
    invalid("Remote model endpoints must use HTTPS.");
  }
  const apiKey = boundedString(connector.apiKey, "API key", 16_384);
  return {
    provider,
    baseUrl: url.href.replace(/\/$/, ""),
    model: boundedString(connector.model, "Model", 512, { required: true }),
    apiKey,
  };
}

/** Translate the product contract into the worker's narrower v1 contract. */
export function buildWorkerParams(input, connector) {
  const request = validateStartInput(input);
  const model = validateConnector(connector);
  const workerBaseUrl = model.provider === "ollama" && !/\/v1$/i.test(model.baseUrl)
    ? `${model.baseUrl}/v1`
    : model.baseUrl;
  if (request.task === "idea_forge") {
    const translated = {
      task: request.task,
      timeoutMs: request.limits.timeoutMs,
      secretValues: model.apiKey ? [model.apiKey] : [],
      params: {
        task: request.task,
        input: request.context,
        model: {
          provider: "openai_compatible",
          approvedByUser: true,
          baseUrl: workerBaseUrl,
          model: model.model,
          ...(model.apiKey ? { apiKey: model.apiKey } : {}),
          temperature: 0.65,
          maxTokens: 8_000,
        },
        budget: {
          timeoutMs: request.limits.timeoutMs,
          maxSteps: 12,
          maxModelCalls: 3,
          maxInputChars: MAX_WORKER_INPUT_CHARS,
          maxOutputChars: 60_000,
        },
      },
    };
    if (JSON.stringify(translated.params.input).length > MAX_WORKER_INPUT_CHARS) {
      invalid("The Idea Forge context exceeds the worker input limit.");
    }
    return translated;
  }
  const { idea, projectBoundary, publicSources } = request.context;
  const context = [
    projectBoundary && `Project boundary: ${projectBoundary}`,
    idea.buyer && `Buyer: ${idea.buyer}`,
    idea.currentAlternative && `Current alternative: ${idea.currentAlternative}`,
    idea.criticalAssumption && `Critical assumption: ${idea.criticalAssumption}`,
    idea.experiment && `Initial experiment: ${idea.experiment}`,
  ].filter(Boolean).join("\n");
  const translated = {
    task: request.task,
    timeoutMs: request.limits.timeoutMs,
    secretValues: model.apiKey ? [model.apiKey] : [],
    params: {
      task: request.task,
      input: {
        title: idea.title,
        description: idea.concept,
        ...(idea.user ? { targetCustomer: idea.user } : {}),
        ...(idea.route ? { protocolRoute: idea.route } : {}),
        ...(context ? { context } : {}),
        sources: publicSources.map((source) => ({
          id: source.sourceId,
          title: source.title,
          url: source.url,
          excerpt: source.content,
        })),
      },
      model: {
        provider: "openai_compatible",
        approvedByUser: true,
        baseUrl: workerBaseUrl,
        model: model.model,
        ...(model.apiKey ? { apiKey: model.apiKey } : {}),
        temperature: 0.2,
        maxTokens: 8_000,
      },
      budget: {
        timeoutMs: request.limits.timeoutMs,
        maxSteps: 8,
        maxModelCalls: 2,
        maxInputChars: MAX_WORKER_INPUT_CHARS,
        maxOutputChars: 30_000,
      },
    },
  };
  if (JSON.stringify(translated.params.input).length > MAX_WORKER_INPUT_CHARS) {
    invalid("The intelligence context exceeds the worker input limit.");
  }
  return translated;
}

function minimalWorkerEnvironment(platform = process.platform) {
  const allow = platform === "win32"
    ? ["PATH", "Path", "PATHEXT", "SYSTEMROOT", "SystemRoot", "WINDIR", "TEMP", "TMP", "USERPROFILE"]
    : ["PATH", "HOME", "TMPDIR", "LANG", "LC_ALL", "SSL_CERT_FILE", "SSL_CERT_DIR"];
  const environment = {};
  for (const key of allow) {
    if (typeof process.env[key] === "string") environment[key] = process.env[key];
  }
  environment.PYTHONUNBUFFERED = "1";
  environment.PYTHONDONTWRITEBYTECODE = "1";
  return environment;
}

async function readableFile(file) {
  try {
    await fs.access(file, fsConstants.R_OK);
    return true;
  } catch {
    return false;
  }
}

async function installedWindowsPythonCandidates() {
  const localAppData = process.env.LOCALAPPDATA;
  if (!localAppData) return [];
  const root = path.join(localAppData, "Programs", "Python");
  let entries;
  try {
    entries = await fs.readdir(root, { withFileTypes: true });
  } catch {
    return [];
  }
  const candidates = [];
  for (const entry of entries
    .filter((item) => item.isDirectory() && /^Python3\d+$/i.test(item.name))
    .sort((left, right) => right.name.localeCompare(left.name))) {
    const executable = path.join(root, entry.name, "python.exe");
    if (await readableFile(executable)) candidates.push(executable);
  }
  return candidates;
}

/** Resolve only app-owned packaged binaries; packaged apps never run a system Python. */
export async function resolveWorkerLaunchCandidates({
  isPackaged,
  resourcesPath,
  moduleDirectory,
  platform = process.platform,
} = {}) {
  if (isPackaged) {
    const executable = path.join(
      resourcesPath,
      "intelligence",
      platform === "win32" ? "sift-intelligence-worker.exe" : "sift-intelligence-worker",
    );
    return await readableFile(executable)
      ? [{ command: executable, args: [], kind: "bundled" }]
      : [];
  }
  const worker = path.join(moduleDirectory, "intelligence_worker", "worker.py");
  if (!await readableFile(worker)) return [];
  const moduleArguments = ["-m", "intelligence_worker"];
  const cwd = moduleDirectory;
  if (platform === "win32") {
    const installed = await installedWindowsPythonCandidates();
    return [
      ...installed.map((command) => ({ command, args: moduleArguments, cwd, kind: "development" })),
      { command: "py", args: ["-3", ...moduleArguments], cwd, kind: "development" },
      { command: "python", args: moduleArguments, cwd, kind: "development" },
      { command: "python3", args: moduleArguments, cwd, kind: "development" },
    ];
  }
  return [
    { command: "python3", args: moduleArguments, cwd, kind: "development" },
    { command: "python", args: moduleArguments, cwd, kind: "development" },
  ];
}

function redactText(value, secrets) {
  let text = String(value ?? "");
  for (const secret of secrets) {
    if (secret.length >= 4) text = text.split(secret).join("[redacted]");
  }
  return text;
}

function safeInboundValue(value, secrets, depth = 0, budget = { bytes: 0 }) {
  if (depth > 12) throw new IntelligenceBridgeError("worker_protocol", "The intelligence worker returned invalid data.");
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new IntelligenceBridgeError("worker_protocol", "The intelligence worker returned invalid data.");
    return value;
  }
  if (typeof value === "string") {
    const safe = redactText(value, secrets);
    budget.bytes += Buffer.byteLength(safe);
    if (budget.bytes > MAX_RESULT_BYTES) throw new IntelligenceBridgeError("worker_protocol", "The intelligence worker returned too much data.");
    return safe;
  }
  if (Array.isArray(value)) {
    if (value.length > 1_000) throw new IntelligenceBridgeError("worker_protocol", "The intelligence worker returned invalid data.");
    return value.map((item) => safeInboundValue(item, secrets, depth + 1, budget));
  }
  if (!isPlainObject(value)) throw new IntelligenceBridgeError("worker_protocol", "The intelligence worker returned invalid data.");
  const entries = Object.entries(value);
  if (entries.length > 512) throw new IntelligenceBridgeError("worker_protocol", "The intelligence worker returned invalid data.");
  const clone = {};
  for (const [key, item] of entries) {
    if (UNSAFE_KEY.test(key) || SENSITIVE_KEY.test(key)) {
      throw new IntelligenceBridgeError("worker_protocol", "The intelligence worker returned a sensitive or unsafe field.");
    }
    clone[key] = safeInboundValue(item, secrets, depth + 1, budget);
  }
  return clone;
}

function workerError(code, message, secrets) {
  const safeCode = typeof code === "string" && /^[a-z0-9_-]{1,64}$/i.test(code) ? code : "worker_error";
  const safeMessage = redactText(typeof message === "string" ? message : "The intelligence worker could not finish this run.", secrets)
    .slice(0, MAX_EVENT_MESSAGE_CHARS);
  return { code: safeCode, message: safeMessage || "The intelligence worker could not finish this run." };
}

function publicStatus(available, version = "", message = "") {
  return {
    available: Boolean(available),
    engine: "python",
    ...(version ? { version } : {}),
    message: message || (available ? "The local Python intelligence engine is ready." : "The Python intelligence engine is unavailable; SIFT can continue without it."),
  };
}

export class IntelligenceSupervisor {
  constructor({
    isPackaged,
    resourcesPath,
    moduleDirectory,
    platform = process.platform,
    spawnProcess = nodeSpawn,
    now = () => Date.now(),
  }) {
    this.runtime = { isPackaged, resourcesPath, moduleDirectory, platform };
    this.spawnProcess = spawnProcess;
    this.now = now;
    this.child = null;
    this.ready = false;
    this.workerVersion = "";
    this.workerCapabilities = new Set();
    this.stdoutBuffer = "";
    this.stderrBytes = 0;
    this.startPromise = null;
    this.readyWaiter = null;
    this.runs = new Map();
    this.unavailableAt = 0;
    this.stopping = false;
  }

  async getStatus() {
    if (this.ready && this.child) return publicStatus(true, this.workerVersion);
    if (this.unavailableAt && this.now() - this.unavailableAt < UNAVAILABLE_RETRY_MS) return publicStatus(false);
    try {
      await this.ensureWorker();
      return publicStatus(true, this.workerVersion);
    } catch {
      return publicStatus(false);
    }
  }

  async ensureWorker() {
    if (this.ready && this.child) return;
    if (this.startPromise) return this.startPromise;
    this.startPromise = this.#startWorker().finally(() => { this.startPromise = null; });
    return this.startPromise;
  }

  async #startWorker() {
    const candidates = await resolveWorkerLaunchCandidates(this.runtime);
    if (!candidates.length) {
      this.unavailableAt = this.now();
      throw new IntelligenceBridgeError("worker_unavailable", "The Python intelligence engine is not installed. SIFT can continue with its standard workflow.");
    }
    let lastError;
    for (const candidate of candidates) {
      try {
        await this.#launchCandidate(candidate);
        this.unavailableAt = 0;
        return;
      } catch (error) {
        lastError = error;
        this.#terminateChild();
      }
    }
    this.unavailableAt = this.now();
    throw lastError instanceof IntelligenceBridgeError
      ? lastError
      : new IntelligenceBridgeError("worker_unavailable", "The Python intelligence engine could not be started. SIFT can continue with its standard workflow.");
  }

  #launchCandidate(candidate) {
    return new Promise((resolve, reject) => {
      let settled = false;
      const settle = (operation, value) => {
        if (settled) return;
        settled = true;
        clearTimeout(startupTimer);
        this.readyWaiter = null;
        operation(value);
      };
      const startupTimer = setTimeout(() => {
        settle(reject, new IntelligenceBridgeError("worker_unavailable", "The Python intelligence engine did not become ready."));
      }, STARTUP_TIMEOUT_MS);
      startupTimer.unref?.();

      let child;
      try {
        child = this.spawnProcess(candidate.command, candidate.args, {
          cwd: candidate.cwd ?? (this.runtime.isPackaged ? this.runtime.resourcesPath : this.runtime.moduleDirectory),
          env: minimalWorkerEnvironment(this.runtime.platform),
          shell: false,
          windowsHide: true,
          stdio: ["pipe", "pipe", "pipe"],
        });
      } catch {
        settle(reject, new IntelligenceBridgeError("worker_unavailable", "The Python intelligence engine could not be started."));
        return;
      }
      this.child = child;
      this.ready = false;
      this.stdoutBuffer = "";
      this.stderrBytes = 0;
      this.readyWaiter = {
        resolve: () => settle(resolve),
        reject: () => settle(reject, new IntelligenceBridgeError("worker_unavailable", "The Python intelligence engine could not be started.")),
      };
      child.stdout?.on("data", (chunk) => this.#handleStdout(chunk));
      child.stdin?.on("error", () => this.#handleExit(child));
      child.stderr?.on("data", (chunk) => {
        // Deliberately discard worker stderr. It can contain provider diagnostics;
        // neither credentials nor arbitrary diagnostics cross into renderer logs.
        this.stderrBytes = Math.min(MAX_BUFFER_BYTES, this.stderrBytes + Buffer.byteLength(chunk));
      });
      child.on("error", () => this.#handleExit(child));
      child.on("exit", () => this.#handleExit(child));
    });
  }

  async start(input, connector) {
    this.#pruneRuns();
    if ([...this.runs.values()].some((run) => run.status === "running")) {
      throw new IntelligenceBridgeError("worker_busy", "Another intelligence run is already in progress.");
    }
    const built = buildWorkerParams(input, connector);
    await this.ensureWorker();
    if (!this.workerCapabilities.has(built.task)) {
      throw new IntelligenceBridgeError(
        "capability_unavailable",
        built.task === "idea_forge"
          ? "This Python intelligence engine does not include Idea Forge. SIFT can continue with standard generation."
          : "This Python intelligence engine does not include competitor analysis.",
      );
    }
    const runId = `run_${randomUUID().replaceAll("-", "")}`;
    const run = {
      runId,
      task: built.task,
      status: "running",
      events: [],
      nextSeq: 0,
      workerSeq: -1,
      waiters: new Set(),
      timeout: null,
      cancellationTimer: null,
      result: undefined,
      error: undefined,
      secretValues: built.secretValues,
      expiresAt: 0,
    };
    this.runs.set(runId, run);
    this.#appendEvent(run, {
      type: "progress",
      phase: run.task === "idea_forge" ? "briefing" : "starting",
      message: run.task === "idea_forge"
        ? "Preparing the Idea Forge brief."
        : "Starting the local intelligence engine.",
      percent: 0,
    });
    run.timeout = setTimeout(() => this.#timeoutRun(run), built.timeoutMs);
    run.timeout.unref?.();
    try {
      this.#send({ protocol: INTELLIGENCE_PROTOCOL, type: "request", id: runId, method: "run", params: built.params });
    } catch {
      this.#finishRun(run, "failed", undefined, { code: "worker_write", message: "The intelligence engine could not accept this run." });
    }
    return { runId };
  }

  async cancel(input) {
    exactKeys(input, new Set(["runId"]), "Cancellation request");
    const runId = boundedString(input.runId, "Run ID", 128, { required: true });
    if (!RUN_ID_PATTERN.test(runId)) invalid("The run ID is invalid.");
    const run = this.runs.get(runId);
    if (!run || run.status !== "running") return { cancelled: false };
    try {
      this.#send({ protocol: INTELLIGENCE_PROTOCOL, type: "cancel", id: runId });
    } catch {
      // Cleanup below still guarantees a terminal cancellation state.
    }
    run.cancellationTimer = setTimeout(() => {
      if (run.status !== "running") return;
      this.#finishRun(run, "cancelled", undefined, { code: "cancelled", message: "The intelligence run was cancelled." });
      this.#terminateChild();
    }, CANCEL_GRACE_MS);
    run.cancellationTimer.unref?.();
    return { cancelled: true };
  }

  async getEvents(input) {
    exactKeys(input, new Set(["runId", "afterSeq", "waitMs"]), "Event request");
    const runId = boundedString(input.runId, "Run ID", 128, { required: true });
    if (!RUN_ID_PATTERN.test(runId)) invalid("The run ID is invalid.");
    const afterSeq = optionalInteger(input.afterSeq, "Event cursor", 0, Number.MAX_SAFE_INTEGER, 0);
    const waitMs = optionalInteger(input.waitMs, "Event wait", 0, 25_000, 0);
    const run = this.runs.get(runId);
    if (!run) throw new IntelligenceBridgeError("run_not_found", "That intelligence run is no longer available.");
    if (!run.events.some((event) => event.seq > afterSeq) && run.status === "running" && waitMs > 0) {
      await new Promise((resolve) => {
        const timer = setTimeout(() => {
          run.waiters.delete(waiter);
          resolve();
        }, waitMs);
        const waiter = () => {
          clearTimeout(timer);
          resolve();
        };
        run.waiters.add(waiter);
      });
    }
    this.#pruneRuns();
    return {
      events: run.events.filter((event) => event.seq > afterSeq),
      status: run.status,
      ...(run.result !== undefined ? { result: run.result } : {}),
      ...(run.error !== undefined ? { error: run.error } : {}),
    };
  }

  stop() {
    this.stopping = true;
    for (const run of this.runs.values()) {
      if (run.status === "running") {
        this.#finishRun(run, "cancelled", undefined, { code: "app_closing", message: "SIFT closed before this intelligence run finished." });
      }
    }
    this.#terminateChild();
  }

  #send(message) {
    if (!this.child?.stdin?.writable || !this.ready) {
      throw new IntelligenceBridgeError("worker_unavailable", "The Python intelligence engine is unavailable.");
    }
    this.child.stdin.write(`${JSON.stringify(message)}\n`, "utf8");
  }

  #handleStdout(chunk) {
    this.stdoutBuffer += chunk.toString("utf8");
    if (Buffer.byteLength(this.stdoutBuffer) > MAX_BUFFER_BYTES) return this.#protocolViolation();
    let newline;
    while ((newline = this.stdoutBuffer.indexOf("\n")) >= 0) {
      const line = this.stdoutBuffer.slice(0, newline).replace(/\r$/, "");
      this.stdoutBuffer = this.stdoutBuffer.slice(newline + 1);
      if (!line.trim()) continue;
      if (Buffer.byteLength(line) > MAX_LINE_BYTES) return this.#protocolViolation();
      let message;
      try {
        message = JSON.parse(line);
      } catch {
        return this.#protocolViolation();
      }
      try {
        this.#handleMessage(message);
      } catch {
        return this.#protocolViolation();
      }
    }
  }

  #handleMessage(message) {
    if (!isPlainObject(message) || message.protocol !== INTELLIGENCE_PROTOCOL || typeof message.type !== "string") {
      throw new Error("protocol");
    }
    if (message.type === "ready") {
      if (this.ready || typeof message.workerVersion !== "string" || message.workerVersion.length > 64 || !Array.isArray(message.capabilities)) {
        throw new Error("protocol");
      }
      if (message.capabilities.length > 32
        || message.capabilities.some((capability) => typeof capability !== "string" || !/^[a-z0-9_-]{1,64}$/i.test(capability))
        || !message.capabilities.includes("cancel")
        || !message.capabilities.some((capability) => SUPPORTED_TASKS.has(capability))) {
        throw new Error("protocol");
      }
      this.workerVersion = message.workerVersion;
      this.workerCapabilities = new Set(message.capabilities);
      this.ready = true;
      this.readyWaiter?.resolve();
      return;
    }
    if (!this.ready || typeof message.id !== "string" || !RUN_ID_PATTERN.test(message.id)) throw new Error("protocol");
    const run = this.runs.get(message.id);
    if (!run || run.status !== "running") return;
    if (message.type === "progress") {
      if (!Number.isInteger(message.seq) || message.seq <= run.workerSeq) throw new Error("protocol");
      run.workerSeq = message.seq;
      const rawPhase = typeof message.phase === "string" ? message.phase : message.stage;
      const phaseMap = run.task === "idea_forge" ? IDEA_FORGE_WORKER_PHASES : COMPETITOR_WORKER_PHASES;
      const phase = phaseMap[rawPhase] ?? rawPhase;
      if (!new Set(Object.values(phaseMap)).has(phase)) throw new Error("protocol");
      if (typeof message.message !== "string" || message.message.length > MAX_EVENT_MESSAGE_CHARS) throw new Error("protocol");
      if (message.percent !== undefined && (!Number.isFinite(message.percent) || message.percent < 0 || message.percent > 100)) throw new Error("protocol");
      this.#appendEvent(run, {
        type: "progress",
        phase,
        message: redactText(message.message, run.secretValues),
        ...(message.percent !== undefined ? { percent: message.percent } : {}),
      });
      return;
    }
    if (message.type === "result") {
      const result = safeInboundValue(message.result, run.secretValues);
      const expectedEvidenceKind = run.task === "idea_forge" ? "hypothesis" : "public_context";
      if (!isPlainObject(result)
        || result.task !== run.task
        || result.provisional !== true
        || result.evidenceKind !== expectedEvidenceKind
        || result.customerValidation !== false) {
        throw new Error("protocol");
      }
      this.#finishRun(run, "completed", result);
      return;
    }
    if (message.type === "error") {
      if (!isPlainObject(message.error)) throw new Error("protocol");
      const error = workerError(message.error.code, message.error.message, run.secretValues);
      this.#finishRun(run, error.code === "cancelled" ? "cancelled" : "failed", undefined, error);
      return;
    }
    throw new Error("protocol");
  }

  #appendEvent(run, event) {
    const complete = { seq: ++run.nextSeq, runId: run.runId, ...event };
    run.events.push(complete);
    if (run.events.length > MAX_EVENTS_PER_RUN) run.events.splice(0, run.events.length - MAX_EVENTS_PER_RUN);
    for (const waiter of run.waiters) waiter();
    run.waiters.clear();
  }

  #finishRun(run, status, result, error) {
    if (run.status !== "running") return;
    clearTimeout(run.timeout);
    clearTimeout(run.cancellationTimer);
    run.status = status;
    run.result = result;
    run.error = error;
    run.expiresAt = this.now() + TERMINAL_RETENTION_MS;
    run.secretValues = [];
    this.#appendEvent(run, {
      type: status === "completed" ? "result" : status === "cancelled" ? "cancelled" : "error",
      message: status === "completed"
        ? run.task === "idea_forge"
          ? "The provisional Idea Forge slate is ready."
          : "Provisional public-context analysis is ready."
        : error?.message ?? "The intelligence run stopped.",
      ...(status === "completed" ? { percent: 100 } : {}),
    });
  }

  #timeoutRun(run) {
    if (run.status !== "running") return;
    try {
      this.#send({ protocol: INTELLIGENCE_PROTOCOL, type: "cancel", id: run.runId });
    } catch {
      // The public terminal state below is authoritative.
    }
    this.#finishRun(run, "failed", undefined, { code: "timeout", message: "The intelligence run reached its time limit." });
    this.#terminateChild();
  }

  #protocolViolation() {
    this.readyWaiter?.reject();
    for (const run of this.runs.values()) {
      if (run.status === "running") {
        this.#finishRun(run, "failed", undefined, { code: "worker_protocol", message: "The intelligence engine returned invalid data." });
      }
    }
    this.#terminateChild();
  }

  #handleExit(exitedChild) {
    // A timed-out or cancelled child can emit `exit` after its replacement is
    // already ready. Never let a stale process clear the replacement.
    if (this.child !== exitedChild) return;
    const wasReady = this.ready;
    this.ready = false;
    this.child = null;
    this.workerCapabilities = new Set();
    this.readyWaiter?.reject();
    if (wasReady && !this.stopping) {
      for (const run of this.runs.values()) {
        if (run.status === "running") {
          this.#finishRun(run, "failed", undefined, { code: "worker_stopped", message: "The intelligence engine stopped unexpectedly." });
        }
      }
    }
  }

  #terminateChild() {
    const child = this.child;
    this.child = null;
    this.ready = false;
    this.workerCapabilities = new Set();
    this.stdoutBuffer = "";
    if (!child) return;
    try { child.stdin?.end(); } catch { /* no-op */ }
    try { child.kill(); } catch { /* no-op */ }
  }

  #pruneRuns() {
    const time = this.now();
    for (const [runId, run] of this.runs) {
      if (TERMINAL_STATUS.has(run.status) && run.expiresAt <= time) this.runs.delete(runId);
    }
  }
}

export function publicIntelligenceError(error) {
  return error instanceof IntelligenceBridgeError
    ? error.publicMessage
    : "The local intelligence engine could not complete that request.";
}
