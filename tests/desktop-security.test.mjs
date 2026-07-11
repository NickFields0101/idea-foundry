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
  assert.match(main, /app\.setName\("Idea Foundry"\)/);
  assert.match(main, /app\.setPath\("userData", path\.join\(app\.getPath\("appData"\), "Idea Foundry"\)\)/);
  assert.doesNotMatch(main, /localStorage|sessionStorage/);
});

test("AI generation cannot write deterministic review inputs", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const generationStart = page.indexOf("async function generateWithConnectedLlm");
  const generationEnd = page.indexOf("async function startQuickRun", generationStart);
  assert.ok(generationStart >= 0 && generationEnd > generationStart);
  const generationFunction = page.slice(generationStart, generationEnd);
  assert.match(generationFunction, /ideas:\s*\[\.\.\.current\.ideas, \.\.\.candidates\]/);
  assert.doesNotMatch(generationFunction, /updateReview|updateClaim|updateGate|artifacts|gates|claims/);
});

test("AI one-click Quick Run calculates only an isolated preview", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const quickStart = page.indexOf("async function startQuickRun");
  const quickEnd = page.indexOf("async function startResearchRun", quickStart);
  assert.ok(quickStart >= 0 && quickEnd > quickStart);
  const quickFunction = page.slice(quickStart, quickEnd);
  assert.match(quickFunction, /setQuickRunMode\("auto-preview"\)/);
  assert.match(quickFunction, /const runId = \+\+quickRunRequestRef\.current/);
  assert.match(quickFunction, /confirmRemoteQuickRunSend/);
  assert.match(quickFunction, /const selectedBy = selectedAtStart \? "existing-user-choice"[^]*: "automated-priority"/);
  assert.match(quickFunction, /calculateGenerationPriority\(state\.profile, chosenIdea\.scores\)/);
  assert.match(quickFunction, /const previewReview = selectedAtStart \? state\.review : freshQuickPreviewReview\(state\.review\)/);
  assert.match(quickFunction, /buildQuickRunPreview\([^]*scoreReview\)/);
  assert.match(quickFunction, /setQuickRunOutcome\(\{ preview, idea: chosenIdea \}\)/);
  assert.match(quickFunction, /setState\(\(current\) => \(\{ \.\.\.current, ideas: \[\.\.\.current\.ideas, \.\.\.candidates\] \}\)\)/);
  assert.equal((quickFunction.match(/\bsetState\(/g) ?? []).length, 1);
  assert.doesNotMatch(quickFunction, /applyEvaluationProposals|applyEvidenceProposals|applyGateProposal|updateReview|updateClaim|updateGate|setSelectedEvaluationClaims|reviewerVerified\s*:\s*true/);
  assert.doesNotMatch(quickFunction, /extractEvidence|artifacts\s*:/);
  assert.match(page, /Local profile priority selected the idea when needed; AI proposed missing merits and gates;[^<]*locked local formula calculated the preview/);
  assert.match(page, /No evidence was created, upgraded, or verified\. Your live review[^<]*not changed/);
  assert.match(page, /Derived from idea route:/);
  assert.match(page, /Existing route preserved or still unresolved/);
});

test("Research & Run keeps cited evidence transient until one consolidated approval", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const researchStart = page.indexOf("async function startResearchRun");
  const approvalStart = page.indexOf("function approveResearchRun", researchStart);
  const previewOnlyStart = page.indexOf("function finishResearchRunWithoutEvidence", approvalStart);
  assert.ok(researchStart >= 0 && approvalStart > researchStart && previewOnlyStart > approvalStart);

  const researchFunction = page.slice(researchStart, approvalStart);
  assert.match(researchFunction, /setQuickRunMode\("research"\)/);
  assert.match(researchFunction, /connection\.bridge\.llm\.researchEvidence\(/);
  assert.match(researchFunction, /projectContext: publicResearchContextFor\(chosenIdea, projectSnapshot\)/);
  assert.match(researchFunction, /addResearchToQuickRunPreview\(/);
  assert.match(researchFunction, /applyResearchEvidenceBatch\(/);
  assert.match(researchFunction, /setResearchRunDraft\(/);
  assert.doesNotMatch(researchFunction, /\bsetState\(/, "research must remain transient before approval");
  assert.doesNotMatch(researchFunction, /reviewerVerified\s*:\s*true|fetch\(/);

  const approvalFunction = page.slice(approvalStart, previewOnlyStart);
  assert.match(approvalFunction, /researchApproval/);
  assert.equal((approvalFunction.match(/\bsetState\(/g) ?? []).length, 1, "approval commits the packet atomically");
  assert.match(approvalFunction, /review: researchRunDraft\.liveReviewWithResearch/);
  assert.match(page, /I confirm these are the cited public sources I want attached/);
  assert.match(page, /DeskResearch · E1/);
  assert.match(page, /Contradictions are never auto-acknowledged/);
});

test("Guided Quick Run stages AI suggestions and preserves human approval", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const quickStart = page.indexOf("async function startGuidedQuickRun");
  const quickEnd = page.indexOf("async function saveAiConnectionOrOpenSettings", quickStart);
  assert.ok(quickStart >= 0 && quickEnd > quickStart);
  const quickFunctions = page.slice(quickStart, quickEnd);
  assert.match(quickFunctions, /setQuickRunMode\("guided"\)/);
  assert.match(quickFunctions, /setQuickRunPhase\("choose-idea"\)/);
  assert.match(quickFunctions, /setSelectedEvaluationClaims\(\[\]\)/);
  assert.match(quickFunctions, /scope: "gates_only"/);
  assert.match(quickFunctions, /confirmRemoteQuickRunSend/);
  assert.match(quickFunctions, /const runId = \+\+quickRunRequestRef\.current/);
  assert.match(quickFunctions, /Review and explicitly apply only the merit drafts you agree with/);
  assert.match(quickFunctions, /Apply each gate separately, or leave it unresolved/);
  assert.doesNotMatch(quickFunctions, /applyEvaluationProposals|applyEvidenceProposals|applyGateProposal|reviewerVerified\s*:\s*true/);
  assert.match(page, /Quick does not mean automatic approval/);
  assert.match(page, /Continue evidence-free/);
  assert.match(page, /Send & refresh gates/);
  assert.match(page, /Cloud model: each AI step confirms before project or evidence context is sent/);
});

test("Quick Run progress keeps connector geometry separate from accessible labels", async () => {
  const [page, css] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  const guideStart = page.indexOf("function QuickRunGuide");
  const guideEnd = page.indexOf("function Overview", guideStart);
  assert.ok(guideStart >= 0 && guideEnd > guideStart);
  const guide = page.slice(guideStart, guideEnd);
  assert.match(guide, /aria-label="Quick Run progress"/);
  assert.match(guide, /aria-live="polite"/);
  assert.match(guide, /aria-current=\{active \? "step" : undefined\}/);
  assert.match(guide, /className="quick-run-step-marker" aria-hidden="true"/);
  assert.match(guide, /className="quick-run-step-label"/);
  assert.match(guide, /className="sr-only"> completed/);
  assert.match(css, /\.quick-run-guide ol\s*\{[^}]*grid-template-columns:\s*repeat\(5,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(css, /\.quick-run-guide li\s*\{[^}]*grid-template-rows:\s*20px auto/);
  assert.match(css, /\.quick-run-guide li::after\s*\{[^}]*top:\s*10px[^}]*z-index:\s*0/);
  assert.match(css, /\.quick-run-step-marker\s*\{[^}]*background:[^}]*z-index:\s*1/);
  assert.doesNotMatch(css, /\.quick-run-step-label\s*\{[^}]*display:\s*none/);
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

test("raw personality responses are session-only and excluded from projects and exports", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const appStateStart = page.indexOf("interface AppState");
  const appStateEnd = page.indexOf("const STORAGE_KEY", appStateStart);
  assert.ok(appStateStart >= 0 && appStateEnd > appStateStart);
  const appState = page.slice(appStateStart, appStateEnd);
  assert.doesNotMatch(appState, /personalityAnswers|PERSONALITY_DRAFT_KEY/);

  assert.match(page, /const \[personalityAnswers, setPersonalityAnswers\] = useState<Record<number,\s*IpipNeo120Response>>\(\{\}\)/);
  assert.match(page, /sessionStorage\.setItem\(PERSONALITY_DRAFT_KEY, JSON\.stringify\(personalityAnswers\)\)/);
  assert.match(page, /localStorage\.setItem\(STORAGE_KEY, JSON\.stringify\(state\)\)/);
  assert.doesNotMatch(page, /localStorage\.setItem\([^)]*personalityAnswers/);

  const exportStart = page.indexOf("function exportPacket");
  const exportEnd = page.indexOf("function exportScorecard", exportStart);
  assert.ok(exportStart >= 0 && exportEnd > exportStart);
  const exportPacket = page.slice(exportStart, exportEnd);
  assert.match(exportPacket, /\.\.\.\(includeProfile \? \{ profile: state\.profile \} : \{\}\)/);
  assert.doesNotMatch(exportPacket, /personalityAnswers|PERSONALITY_DRAFT_KEY|sessionStorage/);

  const promptStart = page.indexOf("const prompt = useMemo");
  const promptEnd = page.indexOf("const visibleModels", promptStart);
  assert.ok(promptStart >= 0 && promptEnd > promptStart);
  const promptBuilder = page.slice(promptStart, promptEnd);
  assert.match(promptBuilder, /sharePersonalityScoresWithAi/);
  assert.match(promptBuilder, /Exact domain and facet scores are intentionally excluded/);
  assert.doesNotMatch(promptBuilder, /personalityAnswers|PERSONALITY_DRAFT_KEY/);

  const clearStart = page.indexOf("function clearPersonalityDraft");
  const clearEnd = page.indexOf("function chooseProfileMode", clearStart);
  assert.match(page.slice(clearStart, clearEnd), /sessionStorage\.removeItem\(PERSONALITY_DRAFT_KEY\)/);
  const applyStart = page.indexOf("function applyPersonalityAssessment");
  const applyEnd = page.indexOf("function removePersonalityAssessment", applyStart);
  assert.match(page.slice(applyStart, applyEnd), /clearPersonalityDraft\(\)/);
  const projectClearStart = page.indexOf("function clearProjectData");
  const projectClearEnd = page.indexOf("async function clearAllLocalData", projectClearStart);
  assert.match(page.slice(projectClearStart, projectClearEnd), /clearPersonalityDraft\(\)/);
});

test("hydration and import project personality data onto a derived-only schema", async () => {
  const [page, personality] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/lib/personality.ts", import.meta.url), "utf8"),
  ]);
  assert.match(personality, /function sanitizePersonalityProfileResult/);
  assert.match(personality, /Unknown keys \(including any raw responses\)[^]*are discarded/);
  assert.match(personality, /promptSummary: buildPersonalityPromptSummary/);

  const hydrationStart = page.indexOf("const saved = localStorage.getItem(STORAGE_KEY)");
  const hydrationEnd = page.indexOf("const saved = sessionStorage.getItem(PERSONALITY_DRAFT_KEY)", hydrationStart);
  const hydration = page.slice(hydrationStart, hydrationEnd);
  assert.match(hydration, /sanitizeGenerationProfile\(parsed\.profile, true\)/);
  assert.match(hydration, /sanitizeReviewInput\(parsed\?\.review\)/);
  assert.doesNotMatch(hydration, /setState\(\{\s*\.\.\.parsed/);

  const importStart = page.indexOf("function importPacket");
  const importEnd = page.indexOf("async function copyText", importStart);
  const imported = page.slice(importStart, importEnd);
  assert.match(imported, /sanitizeGenerationProfile\(parsed\.profile, false\)/);
  assert.match(imported, /sanitizeReviewInput\(parsed\?\.review\)/);
  assert.match(imported, /clearPersonalityDraft\(\)/);
  assert.doesNotMatch(imported, /profile:\s*parsed\.profile\s*(?:\?\?|,)/);
});

test("Big Five questionnaire uses complete, accessible native controls", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const assessmentStart = page.indexOf("function PersonalityAssessmentCard");
  const assessmentEnd = page.indexOf("function WeightEditor", assessmentStart);
  assert.ok(assessmentStart >= 0 && assessmentEnd > assessmentStart);
  const assessment = page.slice(assessmentStart, assessmentEnd);

  assert.match(assessment, /<details className="personality-assessment"/);
  assert.match(assessment, /<summary>/);
  assert.match(assessment, /<label htmlFor="personality-progress"/);
  assert.match(assessment, /<progress id="personality-progress" max=\{IPIP_NEO_120_ITEMS\.length\} value=\{answeredCount\}/);
  assert.match(assessment, /pageItems\.map\(\(item\) => \([^]*<fieldset key=\{item\.id\} className="personality-item">/);
  assert.match(assessment, /<legend className="sr-only">\{String\(item\.id\)\.padStart\(3, "0"\)\} \{item\.text\}<\/legend>/);
  assert.match(assessment, /<div className="personality-question-copy" aria-hidden="true"><span>\{String\(item\.id\)\.padStart\(3, "0"\)\}<\/span><strong>\{item\.text\}<\/strong><\/div>/);
  assert.match(assessment, /type="radio"[^]*name=\{`personality-item-\$\{item\.id\}`\}[^]*checked=\{answers\[item\.id\] === option\.value\}/);
  assert.match(assessment, /aria-label=\{`\$\{option\.value\}: \$\{option\.label\}`\}/);
  assert.match(assessment, /disabled=\{answeredCount !== IPIP_NEO_120_ITEMS\.length\}[^>]*>Calculate my profile/);
  assert.match(assessment, /not population percentiles/);
  assert.match(assessment, /not diagnosis, hiring, credit, or other consequential decisions/);
  assert.match(assessment, /Raw answers stay in session storage/);
  assert.match(assessment, /Include exact domain and facet positions in AI prompts/);
  assert.match(assessment, /Use this for idea personalization/);
  assert.match(assessment, />Retake<|Resume retake/);
  assert.match(assessment, />Delete result</);
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
  assert.match(resetFunction, /setResearchRunDraft\(null\)/);
  assert.match(resetFunction, /setResearchApproval\(false\)/);
  assert.match(resetFunction, /generationRequestRef\.current \+= 1/);
  assert.match(resetFunction, /quickRunRequestRef\.current \+= 1/);
  assert.match(resetFunction, /setGeneratingIdeas\(false\)/);
  const importStart = page.indexOf("function importPacket");
  const importEnd = page.indexOf("async function copyText", importStart);
  assert.match(page.slice(importStart, importEnd), /resetAiWorkspace\(\)/);
  assert.match(page, /localStorage\.removeItem\(STORAGE_KEY\);[^]*resetAiWorkspace\(\)/);
  assert.match(page, /currentEvidenceVerificationFingerprint/);
  assert.match(page, /reviewerVerified: evidenceHumanVerificationCurrent/);
});

test("clear all local data resets the UI and the protected desktop connector", async () => {
  const [page, bridge, preload, main] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/desktop-bridge.d.ts", import.meta.url), "utf8"),
    readFile(new URL("../desktop/preload.cjs", import.meta.url), "utf8"),
    readFile(new URL("../desktop/main.mjs", import.meta.url), "utf8"),
  ]);
  assert.match(bridge, /clearConfig\(\): Promise<LlmConfig>/);
  assert.match(preload, /clearConfig: \(\) => ipcRenderer\.invoke\(CHANNELS\.clearConfig\)/);
  assert.match(main, /fs\.rm\(target, \{ force: true \}\)/);
  assert.match(main, /fs\.rm\(`\$\{target\}\.tmp`, \{ force: true \}\)/);
  assert.match(main, /configMutationQueue/);
  const clearStart = page.indexOf("async function clearAllLocalData");
  const clearEnd = page.indexOf("function updateClaim", clearStart);
  const clearFunction = page.slice(clearStart, clearEnd);
  assert.match(clearFunction, /bridge\.llm\.clearConfig\(\)/);
  assert.match(clearFunction, /clearingLocalDataRef\.current = true[^]*await bridge\.llm\.clearConfig\(\)/);
  assert.match(clearFunction, /setClearingLocalData\(true\)/);
  assert.match(clearFunction, /setAiAssistBusy\(null\)[^]*setGeneratingIdeas\(false\)[^]*setModelSearchBusy\(false\)[^]*setLlmBusy\(null\)/);
  assert.match(clearFunction, /quickRunRequestRef\.current \+= 1/);
  assert.match(clearFunction, /resetModelEditor\(DEFAULT_LLM_CONFIG\)/);
  assert.match(page, /editorConfigForProvider\(provider, persistedLlmConfig\)/);
  assert.match(page, /sameCredentialBoundary\(llmConfig, persistedLlmConfig\)/);
  assert.match(page, /async function saveAiConnectionOrOpenSettings\(\) \{[^]*if \(clearingLocalDataRef\.current\) return null/);
  assert.match(page, /setModelSearch\(nextConfig\.model\)/);
});

test("model editor changes beat late config responses and keep raw keys on their chosen boundary", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const editorChangeStart = page.indexOf("function beginModelEditorChange");
  const editorChangeEnd = page.indexOf("function clearProjectData", editorChangeStart);
  const editorChange = page.slice(editorChangeStart, editorChangeEnd);
  assert.match(editorChange, /modelConfigRequestRef\.current \+= 1/);
  assert.match(editorChange, /modelSearchRequestRef\.current \+= 1/);
  assert.match(editorChange, /setModelSearchBusy\(false\)/);
  assert.match(editorChange, /clearRawKey[^]*setLlmApiKey\(""\)/);
  assert.match(editorChange, /clearCatalog[^]*setLlmModels\(\[\]\)/);
  assert.match(page, /beginModelEditorChange\(\{ clearRawKey: true, clearCatalog: true \}\)[^]*editorConfigForProvider/);
  assert.match(page, /Base URL[^]*beginModelEditorChange\(\{ clearRawKey: true, clearCatalog: true \}\)/);
  assert.match(page, /onChange=\{\(event\) => \{\s*beginModelEditorChange\(\);\s*const nextKey/);
  assert.match(page, /requestId !== modelConfigRequestRef\.current/);
  assert.match(page, /const modelEditorLocked = clearingLocalData[^]*llmBusy !== null/);
  assert.match(page, /const modelEditorLocked = clearingLocalData[^]*generatingIdeas[^]*aiAssistBusy !== null[^]*quickRunBusy/);
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
  assert.match(preload, /researchEvidence: \(input\) => ipcRenderer\.invoke\(CHANNELS\.researchEvidence, input\)/);
  assert.doesNotMatch(preload, /updateReview|updateClaim|updateGate|verifyEvidence|writeArtifact/);
  assert.match(main, /draftEvaluation\(config, \{/);
  assert.match(main, /extractEvidence\(config, \{/);
  assert.match(main, /researchEvidence\(config, \{/);
  assert.match(bridge, /reviewerVerified: false/);
  assert.match(core, /reviewerVerified: false/);
  assert.match(core, /sourceText\.includes\(excerpt\)/);
  assert.match(core, /type: "openrouter:web_search"/);
  assert.match(core, /tool_choice: "required"/);
  assert.match(core, /data_collection: "deny", zdr: true/);
  assert.doesNotMatch(core, /fetch\(citation|fetch\(sourceUrl|fetch\(item\.sourceUrl/);
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
