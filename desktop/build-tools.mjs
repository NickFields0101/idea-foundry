import { spawn } from "node:child_process";
import { constants as fsConstants, promises as fs } from "node:fs";
import path from "node:path";

const MCP_PROTOCOL_VERSION = "2025-06-18";
const PROCESS_TIMEOUT_MS = 45_000;
const MAX_ARGUMENT_BYTES = 384 * 1024;
const MAX_PROCESS_OUTPUT_BYTES = 1024 * 1024;
const MAX_RENDERER_OUTPUT_BYTES = 512 * 1024;
const MAX_DIAGNOSTIC_BYTES = 64 * 1024;
const MAX_VALUE_DEPTH = 10;
const MAX_ARRAY_ITEMS = 512;
const MAX_OBJECT_KEYS = 256;
const MAX_STRING_CHARS = 300_000;

const EVERNODE_CAPABILITIES = Object.freeze([
  "list_templates",
  "generate_contract",
  "check_determinism",
  "check_contract_api",
  "recommend_pattern",
  "check_hook_compat",
  "generate_settlement",
  "estimate_lease_cost",
  "recommend_hosts",
  "host_diagnostics",
  "generate_deploy_commands",
  "explain_error",
]);

// Keep the first Xahau integration intentionally narrow. These operations
// create or inspect Hook source/WASM; none signs or submits a transaction.
const XAHAU_CAPABILITIES = Object.freeze([
  "scaffold_hook",
  "analyze_hook",
  "hook_report",
]);

const XAHC_CAPABILITIES = Object.freeze(["doctor"]);
const EMPTY_CAPABILITIES = Object.freeze([]);

const CAPABILITIES_BY_TOOL = Object.freeze({
  "evernode-mcp": EVERNODE_CAPABILITIES,
  "xahau-mcp": XAHAU_CAPABILITIES,
  xahc: XAHC_CAPABILITIES,
  "xahc-prover": EMPTY_CAPABILITIES,
});

const TOOL_DEFINITIONS = Object.freeze({
  "evernode-mcp": Object.freeze({
    id: "evernode-mcp",
    label: "Evernode MCP",
    summary: "Advisory HotPocket contract scaffolding, checks, host diagnostics, and deployment guidance.",
    kind: "mcp",
    repositoryUrl: "https://github.com/Hugegreencandle/evernode-mcp",
    installUrl: "https://github.com/Hugegreencandle/evernode-mcp#install",
    capabilities: EVERNODE_CAPABILITIES,
    safety: "Runs a fixed, read-only/advisory MCP server locally. SIFT never signs, submits, leases, or deploys.",
    commandName: "evernode-mcp",
    packageName: "evernode-mcp",
  }),
  "xahau-mcp": Object.freeze({
    id: "xahau-mcp",
    label: "Xahau MCP",
    summary: "Local Hook scaffolding and bounded static/WASM analysis.",
    kind: "mcp",
    repositoryUrl: "https://github.com/Hugegreencandle/xahau-mcp",
    installUrl: "https://github.com/Hugegreencandle/xahau-mcp#install",
    capabilities: XAHAU_CAPABILITIES,
    safety: "Only three offline authoring/analysis tools are exposed. Signing and submission are not available.",
    commandName: "xahau-mcp",
    packageName: "xahau-mcp",
  }),
  xahc: Object.freeze({
    id: "xahc",
    label: "XAHC",
    summary: "Checked Xahau Hooks toolchain diagnostics.",
    kind: "cli",
    repositoryUrl: "https://github.com/Hugegreencandle/xahc",
    installUrl: "https://github.com/Hugegreencandle/xahc#install",
    capabilities: XAHC_CAPABILITIES,
    safety: "This release exposes only `xahc doctor`; project authoring, keys, signing, and submission are unavailable.",
    platformNote: "Official releases currently target macOS arm64 and Linux x86_64. Windows requires a custom source build.",
    commandName: "xahc",
  }),
  "xahc-prover": Object.freeze({
    id: "xahc-prover",
    label: "XAHC Prover",
    summary: "Optional symbolic proof companion detected through a local XAHC prover checkout.",
    kind: "companion",
    repositoryUrl: "https://github.com/Hugegreencandle/xahc-prover",
    installUrl: "https://github.com/Hugegreencandle/xahc-prover#run",
    capabilities: EMPTY_CAPABILITIES,
    safety: "Status-only in this release. SIFT does not invoke proof scripts or accept paths to user files.",
    platformNote: "The prover is a custom Python/Z3 checkout used through XAHC; no standalone Windows release is published.",
  }),
});

const BUILD_TOOL_IDS = Object.freeze(Object.keys(TOOL_DEFINITIONS));
const SENSITIVE_ARGUMENT_KEY = /(?:api.?key|authorization|credential|mnemonic|password|passphrase|private.?key|secret|seed)/i;
const UNSAFE_OBJECT_KEY = /^(?:__proto__|constructor|prototype)$/;
const EXECUTION_CONTROL_KEY = /^(?:command|cmd|cwd|directory|executable|file|filename|path|shell|timeout|workingDirectory)$/i;
const SCAFFOLD_ARCHETYPES = new Set([
  "accept_all",
  "firewall",
  "payment_limit",
  "require_dest_tag",
  "state_counter",
  "notary",
]);
const FIREWALL_TRANSACTION_TYPES = new Set([
  "Payment",
  "SetHook",
  "TrustSet",
  "OfferCreate",
  "AccountSet",
  "URITokenMint",
  "Import",
  "Invoke",
]);
const MAX_HOOK_DROPS = 0x3FFFFFFFFFFFFFFFn;

export class BuildToolError extends Error {
  constructor(code, publicMessage) {
    super(publicMessage);
    this.name = "BuildToolError";
    this.code = code;
    this.publicMessage = publicMessage;
  }
}

function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function invalidInput(message = "That build-tool request is not supported.") {
  throw new BuildToolError("invalid_input", message);
}

function cloneJsonValue(value, depth = 0, seen = new Set()) {
  if (depth > MAX_VALUE_DEPTH) invalidInput("Build-tool arguments are nested too deeply.");
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) invalidInput("Build-tool arguments must contain finite JSON numbers.");
    return value;
  }
  if (typeof value === "string") {
    if (value.length > MAX_STRING_CHARS) invalidInput("A build-tool argument is too large.");
    return value;
  }
  if (Array.isArray(value)) {
    if (value.length > MAX_ARRAY_ITEMS) invalidInput("A build-tool argument contains too many items.");
    if (seen.has(value)) invalidInput("Build-tool arguments must not contain circular data.");
    seen.add(value);
    const cloned = value.map((item) => cloneJsonValue(item, depth + 1, seen));
    seen.delete(value);
    return cloned;
  }
  if (!isPlainObject(value)) invalidInput("Build-tool arguments must be plain JSON data.");
  if (seen.has(value)) invalidInput("Build-tool arguments must not contain circular data.");
  const entries = Object.entries(value);
  if (entries.length > MAX_OBJECT_KEYS) invalidInput("A build-tool argument contains too many fields.");
  seen.add(value);
  const cloned = {};
  for (const [key, item] of entries) {
    if (UNSAFE_OBJECT_KEY.test(key)) invalidInput("A build-tool argument contains an unsafe field name.");
    if (EXECUTION_CONTROL_KEY.test(key)) {
      invalidInput("Build tools do not accept commands, file paths, working directories, shells, or timeouts from the app.");
    }
    if (SENSITIVE_ARGUMENT_KEY.test(key)) {
      invalidInput("Build tools do not accept credentials, private keys, seeds, or passwords.");
    }
    if (item === undefined || typeof item === "function" || typeof item === "symbol" || typeof item === "bigint") {
      invalidInput("Build-tool arguments must be valid JSON data.");
    }
    cloned[key] = cloneJsonValue(item, depth + 1, seen);
  }
  seen.delete(value);
  return cloned;
}

function assertOnlyKeys(value, allowed, capability) {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) invalidInput(`The ${capability} operation does not accept the field "${key}".`);
  }
}

function validateScaffoldArguments(args) {
  assertOnlyKeys(args, new Set(["archetype", "blockTxType", "maxDrops"]), "scaffold_hook");
  if (typeof args.archetype !== "string" || !SCAFFOLD_ARCHETYPES.has(args.archetype)) {
    invalidInput("Choose a supported Hook archetype before scaffolding.");
  }
  if (args.archetype === "firewall") {
    if (args.blockTxType !== undefined && !FIREWALL_TRANSACTION_TYPES.has(args.blockTxType)) {
      invalidInput("Choose a supported Xahau transaction type for the firewall.");
    }
  } else if (args.blockTxType !== undefined) {
    invalidInput("blockTxType is only available for the firewall archetype.");
  }
  if (args.archetype === "payment_limit") {
    if (typeof args.maxDrops !== "string" || !/^(?:0|[1-9][0-9]*)$/.test(args.maxDrops)) {
      invalidInput("maxDrops must be a canonical non-negative integer string.");
    }
    if (BigInt(args.maxDrops) > MAX_HOOK_DROPS) {
      invalidInput("maxDrops exceeds the safe signed Hook integer range.");
    }
  } else if (args.maxDrops !== undefined) {
    invalidInput("maxDrops is only available for the payment_limit archetype.");
  }
}

function isCanonicalBase64(value) {
  if (typeof value !== "string" || value.length === 0 || value.length % 4 !== 0) return false;
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) return false;
  try {
    return Buffer.from(value, "base64").toString("base64") === value;
  } catch {
    return false;
  }
}

function validateWasmArguments(args, capability) {
  assertOnlyKeys(args, new Set(["wasmHex", "wasmBase64"]), capability);
  const hasHex = Object.hasOwn(args, "wasmHex");
  const hasBase64 = Object.hasOwn(args, "wasmBase64");
  if (hasHex === hasBase64) invalidInput(`${capability} requires exactly one of wasmHex or wasmBase64.`);
  if (hasHex) {
    if (
      typeof args.wasmHex !== "string"
      || args.wasmHex.length === 0
      || args.wasmHex.length > 262_144
      || !/^(?:[0-9a-fA-F]{2})+$/.test(args.wasmHex)
    ) {
      invalidInput("wasmHex must be even-length hexadecimal no longer than 262144 characters.");
    }
  }
  if (
    hasBase64
    && (
      typeof args.wasmBase64 !== "string"
      || args.wasmBase64.length > 180_000
      || !isCanonicalBase64(args.wasmBase64)
    )
  ) {
    invalidInput("wasmBase64 must be canonical base64 no longer than 180000 characters.");
  }
}

function validateCapabilityArguments(toolId, capability, args) {
  if (toolId === "xahau-mcp" && capability === "scaffold_hook") validateScaffoldArguments(args);
  if (toolId === "xahau-mcp" && (capability === "analyze_hook" || capability === "hook_report")) {
    validateWasmArguments(args, capability);
  }
  if (toolId === "xahc" && Object.keys(args).length > 0) {
    invalidInput("xahc doctor does not accept arguments from the app.");
  }
}

export function normalizeBuildRunInput(input) {
  if (!isPlainObject(input)) invalidInput();
  assertOnlyKeys(input, new Set(["toolId", "capability", "arguments"]), "build runner");
  if (typeof input.toolId !== "string" || !BUILD_TOOL_IDS.includes(input.toolId)) invalidInput();
  const capabilities = CAPABILITIES_BY_TOOL[input.toolId];
  if (typeof input.capability !== "string" || !capabilities.includes(input.capability)) invalidInput();
  const args = input.arguments === undefined ? {} : cloneJsonValue(input.arguments);
  if (!isPlainObject(args)) invalidInput("Build-tool arguments must be a JSON object.");
  validateCapabilityArguments(input.toolId, input.capability, args);
  if (Buffer.byteLength(JSON.stringify(args), "utf8") > MAX_ARGUMENT_BYTES) {
    invalidInput("Build-tool arguments are too large.");
  }
  return { toolId: input.toolId, capability: input.capability, arguments: args };
}

function publicDefinition(definition) {
  return {
    id: definition.id,
    label: definition.label,
    summary: definition.summary,
    kind: definition.kind,
    repositoryUrl: definition.repositoryUrl,
    installUrl: definition.installUrl,
    capabilities: [...definition.capabilities],
    safety: definition.safety,
    ...(definition.platformNote ? { platformNote: definition.platformNote } : {}),
  };
}

export function getBuildCatalog() {
  return BUILD_TOOL_IDS.map((id) => publicDefinition(TOOL_DEFINITIONS[id]));
}

function pathEntries(env, platform) {
  const pathKey = Object.keys(env).find((key) => key.toLowerCase() === "path");
  const value = pathKey ? env[pathKey] : "";
  const delimiter = platform === "win32" ? ";" : ":";
  const seen = new Set();
  const entries = [];
  for (const rawEntry of String(value ?? "").split(delimiter)) {
    const unquoted = rawEntry.trim().replace(/^"|"$/g, "");
    if (!unquoted || !path.isAbsolute(unquoted)) continue;
    const resolved = path.resolve(unquoted);
    const key = platform === "win32" ? resolved.toLowerCase() : resolved;
    if (seen.has(key)) continue;
    seen.add(key);
    entries.push(resolved);
  }
  return entries;
}

async function accessibleFile(target, platform) {
  try {
    await fs.access(target, platform === "win32" ? fsConstants.F_OK : fsConstants.X_OK);
    const details = await fs.stat(target);
    return details.isFile();
  } catch {
    return false;
  }
}

async function findNativeExecutable(commandName, dependencies) {
  const suffix = dependencies.platform === "win32" ? ".exe" : "";
  for (const directory of pathEntries(dependencies.env, dependencies.platform)) {
    const candidate = path.join(directory, `${commandName}${suffix}`);
    if (await accessibleFile(candidate, dependencies.platform)) {
      return { executable: candidate, args: [], version: undefined };
    }
  }
  return null;
}

function withinDirectory(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

async function readNodePackageLaunch(definition, dependencies) {
  const nodeLaunch = await findNativeExecutable("node", dependencies);
  if (!nodeLaunch) return null;
  const roots = [];
  const seen = new Set();
  for (const directory of pathEntries(dependencies.env, dependencies.platform)) {
    for (const candidate of [
      path.join(directory, "node_modules", definition.packageName),
      path.resolve(directory, "..", "lib", "node_modules", definition.packageName),
      path.resolve(directory, "..", "node_modules", definition.packageName),
    ]) {
      const key = dependencies.platform === "win32" ? candidate.toLowerCase() : candidate;
      if (!seen.has(key)) {
        seen.add(key);
        roots.push(candidate);
      }
    }
  }
  for (const packageRoot of roots) {
    try {
      const packageText = await fs.readFile(path.join(packageRoot, "package.json"), "utf8");
      if (packageText.length > 128 * 1024) continue;
      const packageJson = JSON.parse(packageText);
      if (packageJson?.name !== definition.packageName) continue;
      const bin = typeof packageJson.bin === "string"
        ? packageJson.bin
        : packageJson?.bin?.[definition.commandName];
      if (typeof bin !== "string" || !bin || bin.length > 500 || path.isAbsolute(bin)) continue;
      const [realRoot, realEntry] = await Promise.all([
        fs.realpath(packageRoot),
        fs.realpath(path.resolve(packageRoot, bin)),
      ]);
      if (!withinDirectory(realRoot, realEntry) || !(await accessibleFile(realEntry, "win32"))) continue;
      const version = typeof packageJson.version === "string" && packageJson.version.length <= 50
        ? packageJson.version
        : undefined;
      return { executable: nodeLaunch.executable, args: [realEntry], version };
    } catch {
      // Continue looking. Malformed/untrusted package metadata is never run.
    }
  }
  return null;
}

async function resolveToolLaunch(toolId, dependencies) {
  const definition = TOOL_DEFINITIONS[toolId];
  if (!definition?.commandName) return null;
  if (definition.packageName) {
    const packageLaunch = await readNodePackageLaunch(definition, dependencies);
    if (packageLaunch) return packageLaunch;
  }
  return findNativeExecutable(definition.commandName, dependencies);
}

function normalizedDependencies(options = {}) {
  return {
    env: isPlainObject(options.env) ? options.env : process.env,
    platform: typeof options.platform === "string" ? options.platform : process.platform,
    spawnImpl: typeof options.spawnImpl === "function" ? options.spawnImpl : spawn,
  };
}

async function validProverCheckout(env) {
  const candidate = typeof env.XAHC_PROVER_DIR === "string" ? env.XAHC_PROVER_DIR.trim() : "";
  if (!candidate || !path.isAbsolute(candidate)) return false;
  try {
    const [directory, prover, requirements] = await Promise.all([
      fs.stat(candidate),
      fs.stat(path.join(candidate, "src", "prove_limit.py")),
      fs.stat(path.join(candidate, "requirements.txt")),
    ]);
    return directory.isDirectory() && prover.isFile() && requirements.isFile();
  } catch {
    return false;
  }
}

export async function detectBuildTools(options = {}) {
  const dependencies = normalizedDependencies(options);
  const launchPairs = await Promise.all(
    ["evernode-mcp", "xahau-mcp", "xahc"].map(async (id) => [id, await resolveToolLaunch(id, dependencies)]),
  );
  const launches = Object.fromEntries(launchPairs);
  const statuses = ["evernode-mcp", "xahau-mcp", "xahc"].map((id) => {
    const launch = launches[id];
    const customWindowsToolchain = id === "xahc" && dependencies.platform === "win32";
    return {
      id,
      available: Boolean(launch),
      runnable: Boolean(launch),
      support: customWindowsToolchain ? "custom" : "supported",
      ...(launch?.version ? { version: launch.version } : {}),
      message: launch
        ? (customWindowsToolchain ? "Custom Windows XAHC executable detected." : "Local tool detected and ready.")
        : (customWindowsToolchain
          ? "No official Windows XAHC binary is published; a custom source build is required."
          : "Local tool not detected. Install it separately, then refresh."),
    };
  });
  const proverAvailable = await validProverCheckout(dependencies.env);
  statuses.push({
    id: "xahc-prover",
    available: proverAvailable,
    runnable: false,
    support: "custom",
    message: proverAvailable
      ? "Custom prover checkout detected. Proof execution remains status-only in this SIFT release."
      : (dependencies.platform === "win32"
        ? "No standalone Windows prover is published. Configure a custom XAHC_PROVER_DIR checkout; SIFT reports status only."
        : "Configure an XAHC_PROVER_DIR checkout to detect the prover; SIFT reports status only."),
  });
  return statuses;
}

function sanitizedChildEnvironment(env) {
  const permitted = new Set([
    "appdata",
    "home",
    "homedrive",
    "homepath",
    "lang",
    "lc_all",
    "localappdata",
    "path",
    "pathext",
    "systemdrive",
    "systemroot",
    "temp",
    "tmp",
    "tmpdir",
    "userprofile",
    "windir",
  ]);
  const result = { NO_COLOR: "1" };
  for (const [key, value] of Object.entries(env)) {
    if (permitted.has(key.toLowerCase()) && typeof value === "string") result[key] = value;
  }
  return result;
}

function sanitizeText(value, limit = 80_000) {
  let text = String(value ?? "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");
  const privateRoots = [process.cwd(), process.env.HOME, process.env.USERPROFILE]
    .filter((item) => typeof item === "string" && item.length > 2)
    .sort((left, right) => right.length - left.length);
  for (const root of privateRoots) text = text.split(root).join("[local path]");
  return text.length > limit ? `${text.slice(0, limit)}\n… output truncated …` : text;
}

function sanitizeOutputValue(value, depth = 0) {
  if (depth > MAX_VALUE_DEPTH) return "[nested output omitted]";
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") return sanitizeText(value, 120_000);
  if (Array.isArray(value)) {
    return value.slice(0, MAX_ARRAY_ITEMS).map((item) => sanitizeOutputValue(item, depth + 1));
  }
  if (value && typeof value === "object") {
    const result = {};
    for (const [key, item] of Object.entries(value).slice(0, MAX_OBJECT_KEYS)) {
      if (UNSAFE_OBJECT_KEY.test(key)) continue;
      result[key] = SENSITIVE_ARGUMENT_KEY.test(key) ? "[redacted]" : sanitizeOutputValue(item, depth + 1);
    }
    return result;
  }
  return null;
}

function rendererOutput(value) {
  const sanitized = sanitizeOutputValue(value);
  const encoded = JSON.stringify(sanitized);
  if (Buffer.byteLength(encoded, "utf8") <= MAX_RENDERER_OUTPUT_BYTES) {
    return { output: sanitized, truncated: false };
  }
  return {
    output: {
      preview: sanitizeText(encoded, MAX_RENDERER_OUTPUT_BYTES - 2048),
      notice: "The local tool returned more data than SIFT can display safely.",
    },
    truncated: true,
  };
}

function spawnFixed(launch, args, dependencies) {
  return dependencies.spawnImpl(
    launch.executable,
    [...launch.args, ...args],
    {
      shell: false,
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
      env: sanitizedChildEnvironment(dependencies.env),
    },
  );
}

async function callMcp(launch, capability, args, dependencies) {
  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawnFixed(launch, [], dependencies);
    } catch {
      reject(new BuildToolError("launch_failed", "The local MCP tool could not be started."));
      return;
    }
    let settled = false;
    let stdoutBuffer = "";
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let initialized = false;
    const initializeId = 1;
    const callId = 2;

    const stop = () => {
      clearTimeout(timer);
      try { child.stdin.end(); } catch { /* already closed */ }
      try { child.kill(); } catch { /* already closed */ }
    };
    const fail = (error) => {
      if (settled) return;
      settled = true;
      stop();
      reject(error instanceof BuildToolError
        ? error
        : new BuildToolError("tool_failed", "The local MCP tool could not complete that operation."));
    };
    const succeed = (value) => {
      if (settled) return;
      settled = true;
      stop();
      resolve(value);
    };
    const writeMessage = (message) => {
      try {
        child.stdin.write(`${JSON.stringify(message)}\n`);
      } catch {
        fail(new BuildToolError("transport_failed", "The local MCP tool closed its input unexpectedly."));
      }
    };
    const handleMessage = (message) => {
      if (!message || message.jsonrpc !== "2.0") return;
      if (message.id === initializeId && !initialized) {
        if (message.error || !message.result) {
          fail(new BuildToolError("initialize_failed", "The local MCP tool rejected the secure SIFT connection."));
          return;
        }
        initialized = true;
        writeMessage({ jsonrpc: "2.0", method: "notifications/initialized" });
        writeMessage({
          jsonrpc: "2.0",
          id: callId,
          method: "tools/call",
          params: { name: capability, arguments: args },
        });
        return;
      }
      if (message.id === callId) {
        if (message.error) {
          fail(new BuildToolError("tool_failed", "The local MCP tool could not complete that operation."));
          return;
        }
        succeed(message.result ?? null);
      }
    };
    const timer = setTimeout(() => {
      fail(new BuildToolError("timeout", "The local build tool did not respond in time."));
    }, PROCESS_TIMEOUT_MS);

    child.on("error", () => fail(new BuildToolError("launch_failed", "The local MCP tool could not be started.")));
    child.on("close", () => {
      if (!settled) fail(new BuildToolError("closed", "The local MCP tool closed before returning a result."));
    });
    child.stdin.on("error", () => {
      if (!settled) fail(new BuildToolError("transport_failed", "The local MCP tool closed its input unexpectedly."));
    });
    child.stderr.on("data", (chunk) => {
      stderrBytes += Buffer.byteLength(chunk);
      if (stderrBytes > MAX_DIAGNOSTIC_BYTES) {
        fail(new BuildToolError("output_limit", "The local MCP tool produced too much diagnostic output."));
      }
    });
    child.stdout.on("data", (chunk) => {
      if (settled) return;
      stdoutBytes += Buffer.byteLength(chunk);
      if (stdoutBytes > MAX_PROCESS_OUTPUT_BYTES) {
        fail(new BuildToolError("output_limit", "The local MCP tool returned too much data."));
        return;
      }
      stdoutBuffer += chunk.toString("utf8");
      let newline = stdoutBuffer.indexOf("\n");
      while (newline >= 0) {
        const line = stdoutBuffer.slice(0, newline).trim();
        stdoutBuffer = stdoutBuffer.slice(newline + 1);
        if (line) {
          try {
            handleMessage(JSON.parse(line));
          } catch {
            fail(new BuildToolError("protocol", "The local MCP tool returned an invalid protocol message."));
            return;
          }
        }
        newline = stdoutBuffer.indexOf("\n");
      }
    });

    writeMessage({
      jsonrpc: "2.0",
      id: initializeId,
      method: "initialize",
      params: {
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: { name: "sift-desktop", version: "1" },
      },
    });
  });
}

async function runDoctor(launch, dependencies) {
  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawnFixed(launch, ["doctor"], dependencies);
    } catch {
      reject(new BuildToolError("launch_failed", "XAHC doctor could not be started."));
      return;
    }
    let settled = false;
    let stdout = "";
    let stderr = "";
    let bytes = 0;
    const stop = () => {
      clearTimeout(timer);
      try { child.kill(); } catch { /* already closed */ }
    };
    const fail = (error) => {
      if (settled) return;
      settled = true;
      stop();
      reject(error);
    };
    const append = (target, chunk) => {
      bytes += Buffer.byteLength(chunk);
      if (bytes > MAX_PROCESS_OUTPUT_BYTES) {
        fail(new BuildToolError("output_limit", "XAHC doctor produced too much output."));
        return target;
      }
      return target + chunk.toString("utf8");
    };
    const timer = setTimeout(() => fail(new BuildToolError("timeout", "XAHC doctor did not finish in time.")), PROCESS_TIMEOUT_MS);
    child.on("error", () => fail(new BuildToolError("launch_failed", "XAHC doctor could not be started.")));
    child.stdout.on("data", (chunk) => { stdout = append(stdout, chunk); });
    child.stderr.on("data", (chunk) => { stderr = append(stderr, chunk); });
    child.on("close", (exitCode) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        exitCode: Number.isInteger(exitCode) ? exitCode : null,
        stdout: sanitizeText(stdout),
        stderr: sanitizeText(stderr),
      });
    });
  });
}

export async function runBuildTool(input, options = {}) {
  const normalized = normalizeBuildRunInput(input);
  const dependencies = normalizedDependencies(options);
  const launch = await resolveToolLaunch(normalized.toolId, dependencies);
  if (!launch) {
    throw new BuildToolError("not_installed", "That local build tool was not detected. Install it separately, then refresh.");
  }
  const startedAt = Date.now();
  const rawOutput = normalized.toolId === "xahc"
    ? await runDoctor(launch, dependencies)
    : await callMcp(launch, normalized.capability, normalized.arguments, dependencies);
  const safe = rendererOutput(rawOutput);
  return {
    toolId: normalized.toolId,
    capability: normalized.capability,
    output: safe.output,
    durationMs: Math.max(0, Date.now() - startedAt),
    truncated: safe.truncated,
    advisory: true,
  };
}

export function publicBuildError(error) {
  return error instanceof BuildToolError
    ? error.publicMessage
    : "The local build-tool connector encountered an unexpected error.";
}
