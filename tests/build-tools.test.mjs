import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  BuildToolError,
  detectBuildTools,
  getBuildCatalog,
  normalizeBuildRunInput,
  publicBuildError,
  runBuildTool,
} from "../desktop/build-tools.mjs";

test("publishes a fixed four-tool catalog without execution details", () => {
  const catalog = getBuildCatalog();
  assert.deepEqual(catalog.map(({ id }) => id), ["evernode-mcp", "xahau-mcp", "xahc", "xahc-prover"]);
  assert.deepEqual(
    catalog.find(({ id }) => id === "xahau-mcp").capabilities,
    ["scaffold_hook", "analyze_hook", "hook_report"],
  );
  assert.deepEqual(catalog.find(({ id }) => id === "xahc").capabilities, ["doctor"]);
  assert.deepEqual(catalog.find(({ id }) => id === "xahc-prover").capabilities, []);
  for (const entry of catalog) {
    assert.match(entry.repositoryUrl, /^https:\/\/github\.com\/Hugegreencandle\//);
    assert.equal("command" in entry, false);
    assert.equal("path" in entry, false);
    assert.equal("cwd" in entry, false);
  }
});

test("preload exposes enumerated build calls while the main process owns execution", async () => {
  const [preload, main, buildTools] = await Promise.all([
    readFile(new URL("../desktop/preload.cjs", import.meta.url), "utf8"),
    readFile(new URL("../desktop/main.mjs", import.meta.url), "utf8"),
    readFile(new URL("../desktop/build-tools.mjs", import.meta.url), "utf8"),
  ]);
  assert.match(preload, /build:\s*Object\.freeze\(\{[^]*getCatalog:[^]*detect:[^]*run:/);
  assert.doesNotMatch(preload, /spawn|execFile|ipcRenderer\.send|shell\.openExternal/);
  assert.match(main, /EXTERNAL_REPOSITORIES = new Set\(\[/);
  assert.match(main, /shell\.openExternal\(trustedExternalUrl\(value\)\)/);
  assert.match(buildTools, /shell:\s*false/);
  assert.doesNotMatch(buildTools, /\bexec(?:File)?\s*\(/);
});

test("rejects arbitrary tools, operations, process controls, and credentials", () => {
  for (const input of [
    { toolId: "other", capability: "doctor" },
    { toolId: "xahc", capability: "build" },
    { toolId: "xahc-prover", capability: "prove" },
    { toolId: "evernode-mcp", capability: "recommend_pattern", command: "whoami" },
    { toolId: "evernode-mcp", capability: "recommend_pattern", arguments: { command: "whoami" } },
    { toolId: "evernode-mcp", capability: "recommend_pattern", arguments: { cwd: "/tmp" } },
    { toolId: "evernode-mcp", capability: "recommend_pattern", arguments: { apiKey: "do-not-forward" } },
    { toolId: "evernode-mcp", capability: "recommend_pattern", arguments: { brief: "x".repeat(300_001) } },
    { toolId: "xahc", capability: "doctor", arguments: { verbose: true } },
  ]) {
    assert.throws(() => normalizeBuildRunInput(input), BuildToolError);
  }
  assert.equal(publicBuildError(new Error("C:\\private\\secret")), "The local build-tool connector encountered an unexpected error.");
});

test("validates scaffold_hook archetypes and archetype-specific fields", () => {
  assert.deepEqual(
    normalizeBuildRunInput({
      toolId: "xahau-mcp",
      capability: "scaffold_hook",
      arguments: { archetype: "firewall", blockTxType: "Payment" },
    }).arguments,
    { archetype: "firewall", blockTxType: "Payment" },
  );
  assert.deepEqual(
    normalizeBuildRunInput({
      toolId: "xahau-mcp",
      capability: "scaffold_hook",
      arguments: { archetype: "payment_limit", maxDrops: "4611686018427387903" },
    }).arguments,
    { archetype: "payment_limit", maxDrops: "4611686018427387903" },
  );
  for (const argumentsValue of [
    {},
    { archetype: "unknown" },
    { archetype: "firewall", blockTxType: "AccountDelete" },
    { archetype: "accept_all", blockTxType: "Payment" },
    { archetype: "payment_limit", maxDrops: "01" },
    { archetype: "payment_limit", maxDrops: "4611686018427387904" },
    { archetype: "accept_all", maxDrops: "10" },
    { archetype: "notary", extra: true },
  ]) {
    assert.throws(() => normalizeBuildRunInput({
      toolId: "xahau-mcp",
      capability: "scaffold_hook",
      arguments: argumentsValue,
    }), BuildToolError);
  }
});

test("requires one bounded, strictly encoded WASM representation", () => {
  assert.deepEqual(
    normalizeBuildRunInput({
      toolId: "xahau-mcp",
      capability: "analyze_hook",
      arguments: { wasmHex: "0061736d" },
    }).arguments,
    { wasmHex: "0061736d" },
  );
  assert.deepEqual(
    normalizeBuildRunInput({
      toolId: "xahau-mcp",
      capability: "hook_report",
      arguments: { wasmBase64: "AGFzbQ==" },
    }).arguments,
    { wasmBase64: "AGFzbQ==" },
  );
  for (const argumentsValue of [
    {},
    { wasmHex: "00", wasmBase64: "AA==" },
    { wasmHex: "0" },
    { wasmHex: "zz" },
    { wasmBase64: "not canonical" },
    { wasmBase64: null },
    { wasmHex: "00".repeat(131_073) },
  ]) {
    assert.throws(() => normalizeBuildRunInput({
      toolId: "xahau-mcp",
      capability: "analyze_hook",
      arguments: argumentsValue,
    }), BuildToolError);
  }
});

async function fakeMcpEnvironment() {
  const root = await mkdtemp(path.join(os.tmpdir(), "sift-build-tools-"));
  const packageRoot = path.join(root, "node_modules", "evernode-mcp");
  const entry = path.join(packageRoot, "dist", "index.js");
  await mkdir(path.dirname(entry), { recursive: true });
  await writeFile(path.join(packageRoot, "package.json"), JSON.stringify({
    name: "evernode-mcp",
    version: "9.8.7-test",
    type: "module",
    bin: { "evernode-mcp": "dist/index.js" },
  }), "utf8");
  await writeFile(entry, `
    import readline from "node:readline";
    const lines = readline.createInterface({ input: process.stdin });
    lines.on("line", (line) => {
      const message = JSON.parse(line);
      if (message.method === "initialize") {
        process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: message.id, result: {
          protocolVersion: message.params.protocolVersion,
          capabilities: { tools: {} },
          serverInfo: { name: "fake-evernode", version: "1" }
        } }) + "\\n");
      }
      if (message.method === "tools/call") {
        process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: message.id, result: {
          content: [{ type: "text", text: "safe result" }],
          structuredContent: { operation: message.params.name, received: message.params.arguments, privateKey: "never-render" }
        } }) + "\\n");
      }
    });
  `, "utf8");
  const env = {
    ...process.env,
    PATH: [root, path.dirname(process.execPath)].join(path.delimiter),
  };
  return { root, env };
}

test("detects fixed Node MCP packages cross-platform without exposing paths", async (context) => {
  const fixture = await fakeMcpEnvironment();
  context.after(() => rm(fixture.root, { recursive: true, force: true }));
  const statuses = await detectBuildTools({ env: fixture.env });
  assert.equal(statuses.length, 4);
  const evernode = statuses.find(({ id }) => id === "evernode-mcp");
  assert.deepEqual(evernode, {
    id: "evernode-mcp",
    available: true,
    runnable: true,
    support: "supported",
    version: "9.8.7-test",
    message: "Local tool detected and ready.",
  });
  assert.equal(JSON.stringify(statuses).includes(fixture.root), false);
  assert.equal(statuses.find(({ id }) => id === "xahc-prover").runnable, false);
});

test("detects a prover only from stable custom-checkout markers and keeps it status-only", async (context) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "sift-prover-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, "src"), { recursive: true });
  await Promise.all([
    writeFile(path.join(root, "src", "prove_limit.py"), "# marker\n", "utf8"),
    writeFile(path.join(root, "requirements.txt"), "z3-solver\n", "utf8"),
  ]);
  const statuses = await detectBuildTools({ env: { ...process.env, XAHC_PROVER_DIR: root } });
  const prover = statuses.find(({ id }) => id === "xahc-prover");
  assert.equal(prover.available, true);
  assert.equal(prover.runnable, false);
  assert.equal(prover.support, "custom");
  assert.equal(JSON.stringify(prover).includes(root), false);
});

test("performs a real bounded MCP stdio handshake and sanitizes the result", async (context) => {
  const fixture = await fakeMcpEnvironment();
  context.after(() => rm(fixture.root, { recursive: true, force: true }));
  const result = await runBuildTool({
    toolId: "evernode-mcp",
    capability: "recommend_pattern",
    arguments: { goal: "deterministic coordination" },
  }, { env: fixture.env });
  assert.equal(result.toolId, "evernode-mcp");
  assert.equal(result.capability, "recommend_pattern");
  assert.equal(result.advisory, true);
  assert.equal(result.truncated, false);
  assert.equal(result.output.structuredContent.operation, "recommend_pattern");
  assert.deepEqual(result.output.structuredContent.received, { goal: "deterministic coordination" });
  assert.equal(result.output.structuredContent.privateKey, "[redacted]");
});
