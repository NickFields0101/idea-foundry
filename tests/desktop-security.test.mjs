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
  const generationEnd = page.indexOf("async function saveAiConnectionOrOpenSettings", generationStart);
  assert.ok(generationStart >= 0 && generationEnd > generationStart);
  const generationFunction = page.slice(generationStart, generationEnd);
  assert.match(generationFunction, /ideas:\s*\[\.\.\.current\.ideas, \.\.\.candidates\]/);
  assert.doesNotMatch(generationFunction, /updateReview|updateClaim|updateGate|artifacts|gates|claims/);
});

test("AI review calls create staged UI drafts without mutating review input", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const draftStart = page.indexOf("async function draftEvaluationWithAi");
  const draftEnd = page.indexOf("function updateEvaluationProposal", draftStart);
  assert.ok(draftStart >= 0 && draftEnd > draftStart);
  const draftFunctions = page.slice(draftStart, draftEnd);
  assert.match(draftFunctions, /setEvaluationDraft/);
  assert.match(draftFunctions, /setEvidenceAnalysis/);
  assert.doesNotMatch(draftFunctions, /setState|updateReview|updateClaim|updateGate/);
});

test("evaluation context excludes private profile and deterministic scoring data", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const contextStart = page.indexOf("function evaluationContextFor");
  const contextEnd = page.indexOf("function emptyProfile", contextStart);
  assert.ok(contextStart >= 0 && contextEnd > contextStart);
  const contextBuilder = page.slice(contextStart, contextEnd);
  assert.doesNotMatch(contextBuilder, /profile|generationWeights|weights\[|validatedScore|rawThesisScore|numericEligible/);
  assert.match(contextBuilder, /USER-AUTHORED HYPOTHESIS, NOT PROOF/);
});

test("workspace reset and import purge ephemeral AI source material", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const resetStart = page.indexOf("function resetAiWorkspace");
  const resetEnd = page.indexOf("function updateClaim", resetStart);
  assert.ok(resetStart >= 0 && resetEnd > resetStart);
  const resetFunction = page.slice(resetStart, resetEnd);
  assert.match(resetFunction, /setEvaluationNotes\(""\)/);
  assert.match(resetFunction, /setEvaluationDraft\(null\)/);
  assert.match(resetFunction, /setEvidenceSource\(emptyEvidenceSourceDraft\(\)\)/);
  assert.match(resetFunction, /setEvidenceAnalysis\(null\)/);
  assert.match(resetFunction, /setAiUndo\(null\)/);
  assert.match(resetFunction, /generationRequestRef\.current \+= 1/);
  assert.match(resetFunction, /setGeneratingIdeas\(false\)/);
  const importStart = page.indexOf("function importPacket");
  const importEnd = page.indexOf("async function copyText", importStart);
  assert.match(page.slice(importStart, importEnd), /resetAiWorkspace\(\)/);
  assert.match(page, /localStorage\.removeItem\(STORAGE_KEY\);[^]*resetAiWorkspace\(\)/);
  assert.match(page, /currentEvidenceVerificationFingerprint/);
  assert.match(page, /reviewerVerified: evidenceHumanVerificationCurrent/);
});

test("AI evaluation and evidence IPC exposes proposal-only operations", async () => {
  const [bridge, preload, main, core] = await Promise.all([
    readFile(new URL("../app/desktop-bridge.d.ts", import.meta.url), "utf8"),
    readFile(new URL("../desktop/preload.cjs", import.meta.url), "utf8"),
    readFile(new URL("../desktop/main.mjs", import.meta.url), "utf8"),
    readFile(new URL("../desktop/llm-core.mjs", import.meta.url), "utf8"),
  ]);
  assert.match(preload, /draftEvaluation: \(input\) => ipcRenderer\.invoke\(CHANNELS\.draftEvaluation, input\)/);
  assert.match(preload, /extractEvidence: \(input\) => ipcRenderer\.invoke\(CHANNELS\.extractEvidence, input\)/);
  assert.doesNotMatch(preload, /updateReview|updateClaim|updateGate|verifyEvidence|writeArtifact/);
  assert.match(main, /draftEvaluation\(config, \{/);
  assert.match(main, /extractEvidence\(config, \{/);
  assert.match(bridge, /reviewerVerified: false/);
  assert.match(core, /reviewerVerified: false/);
  assert.match(core, /sourceText\.includes\(excerpt\)/);
  assert.doesNotMatch(core, /scoreReview|calculateGenerationPriority|EVIDENCE_MULTIPLIER/);
});

test("OpenRouter keys stay encrypted, provider-bound, and pinned to OpenRouter", async () => {
  const [core, main, page] = await Promise.all([
    readFile(new URL("../desktop/llm-core.mjs", import.meta.url), "utf8"),
    readFile(new URL("../desktop/main.mjs", import.meta.url), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(core, /openrouter:\s*OPENROUTER_BASE_URL/);
  assert.match(core, /url\.hostname !== "openrouter\.ai"/);
  assert.match(core, /sameCredentialBoundary = fallback\.provider === provider && fallbackBaseUrl === normalizedBaseUrl/);
  assert.match(core, /Enter an OpenRouter API key before connecting/);
  assert.match(main, /providerChanged[^]*encryptedApiKey/);
  assert.match(main, /endpointChanged[^]*encryptedApiKey/);
  assert.match(page, /keyRequired:\s*true/);
  assert.match(page, /never written to projects, exports, or browser storage/);
  assert.doesNotMatch(page, /sk-or-v1-[A-Za-z0-9]/);
});

test("tag builds cannot publish before the release workflow validates every platform", async () => {
  const packager = await readFile(new URL("../scripts/package-desktop.mjs", import.meta.url), "utf8");
  assert.match(packager, /publish:\s*["']never["']/);
});
