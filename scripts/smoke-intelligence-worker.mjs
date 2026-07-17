import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const platform = process.platform === "win32" ? "win" : process.platform === "darwin" ? "mac" : "";
const architecture = process.arch === "x64" ? "x64" : process.arch === "arm64" ? "arm64" : "";
if (!platform || !architecture) throw new Error("The packaged SIFT worker smoke test supports Windows and macOS x64/arm64 only.");

const executable = path.join(
  projectRoot,
  "desktop",
  "intelligence-runtime",
  `${platform}-${architecture}`,
  `sift-intelligence-worker${process.platform === "win32" ? ".exe" : ""}`,
);
const child = spawn(executable, [], {
  cwd: projectRoot,
  env: { PATH: process.env.PATH ?? "" },
  stdio: ["pipe", "pipe", "pipe"],
  windowsHide: true,
});

let stdoutBuffer = "";
let stderrBuffer = "";
let sawReady = false;
let settled = false;

const timeout = setTimeout(() => finish(new Error("The packaged intelligence worker did not answer its health check.")), 15_000);

function finish(error) {
  if (settled) return;
  settled = true;
  clearTimeout(timeout);
  child.kill();
  if (error) {
    process.stderr.write(`${error.message}${stderrBuffer ? `\n${stderrBuffer.slice(0, 2_000)}` : ""}\n`);
    process.exitCode = 1;
    return;
  }
  process.stdout.write(`${executable}\n`);
}

function acceptLine(line) {
  if (!line.trim()) return;
  let message;
  try {
    message = JSON.parse(line);
  } catch {
    finish(new Error("The packaged intelligence worker wrote non-JSON output."));
    return;
  }
  if (message.protocol !== "sift-intelligence/1") {
    finish(new Error("The packaged intelligence worker reported an incompatible protocol."));
    return;
  }
  if (message.type === "ready" && !sawReady) {
    sawReady = true;
    child.stdin.write(`${JSON.stringify({
      protocol: "sift-intelligence/1",
      type: "request",
      id: "package-smoke",
      method: "ping",
      params: {},
    })}\n`);
    return;
  }
  if (message.type === "result" && message.id === "package-smoke") finish();
  if (message.type === "error" && message.id === "package-smoke") {
    finish(new Error(`The packaged intelligence worker rejected its health check: ${message.error?.message ?? "unknown error"}`));
  }
}

child.stdout.setEncoding("utf8");
child.stdout.on("data", (chunk) => {
  stdoutBuffer += chunk;
  const lines = stdoutBuffer.split("\n");
  stdoutBuffer = lines.pop() ?? "";
  lines.forEach(acceptLine);
});
child.stderr.setEncoding("utf8");
child.stderr.on("data", (chunk) => { stderrBuffer += chunk; });
child.on("error", (error) => finish(error));
child.on("exit", (code) => {
  if (!settled) finish(new Error(`The packaged intelligence worker exited early (${code ?? "unknown"}).`));
});
