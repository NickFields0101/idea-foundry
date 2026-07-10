import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("desktop renderer has no direct network authority", async () => {
  const [html, preload] = await Promise.all([
    readFile(new URL("../desktop/renderer/index.html", import.meta.url), "utf8"),
    readFile(new URL("../desktop/preload.cjs", import.meta.url), "utf8"),
  ]);
  assert.match(html, /connect-src 'none'/);
  assert.match(html, /object-src 'none'/);
  assert.match(html, /frame-ancestors 'none'/);
  assert.match(preload, /contextBridge\.exposeInMainWorld\("ideaFoundry"/);
  assert.match(preload, /desktop:\s*true/);
  assert.doesNotMatch(preload, /ipcRenderer\.on|ipcRenderer\.send|exposeInMainWorld\([^)]*ipcRenderer/);
});

test("desktop main process isolates the UI and protects credentials", async () => {
  const main = await readFile(new URL("../desktop/main.mjs", import.meta.url), "utf8");
  assert.match(main, /contextIsolation:\s*true/);
  assert.match(main, /nodeIntegration:\s*false/);
  assert.match(main, /sandbox:\s*true/);
  assert.match(main, /setPermissionRequestHandler\([^]*callback\(false\)/);
  assert.match(main, /setWindowOpenHandler\(\(\) => \(\{ action: "deny" \}\)\)/);
  assert.match(main, /safeStorage\.encryptString/);
  assert.match(main, /encryptedApiKey/);
  assert.doesNotMatch(main, /localStorage|sessionStorage/);
});

test("AI generation cannot write deterministic review inputs", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const generationStart = page.indexOf("async function generateWithConnectedLlm");
  const generationEnd = page.indexOf("function addEvidence", generationStart);
  assert.ok(generationStart >= 0 && generationEnd > generationStart);
  const generationFunction = page.slice(generationStart, generationEnd);
  assert.match(generationFunction, /ideas:\s*\[\.\.\.current\.ideas, \.\.\.candidates\]/);
  assert.doesNotMatch(generationFunction, /updateReview|updateClaim|updateGate|artifacts|gates|claims/);
});

test("OpenRouter keys stay encrypted, provider-bound, and pinned to OpenRouter", async () => {
  const [core, main, page] = await Promise.all([
    readFile(new URL("../desktop/llm-core.mjs", import.meta.url), "utf8"),
    readFile(new URL("../desktop/main.mjs", import.meta.url), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(core, /openrouter:\s*OPENROUTER_BASE_URL/);
  assert.match(core, /url\.hostname !== "openrouter\.ai"/);
  assert.match(core, /fallback\.provider === undefined \|\| fallback\.provider === provider/);
  assert.match(core, /Enter an OpenRouter API key before connecting/);
  assert.match(main, /providerChanged[^]*encryptedApiKey/);
  assert.match(page, /keyRequired:\s*true/);
  assert.match(page, /never written to projects, exports, or browser storage/);
  assert.doesNotMatch(page, /sk-or-v1-[A-Za-z0-9]/);
});
