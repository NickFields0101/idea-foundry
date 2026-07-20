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
  assert.match(html, /worker-src 'self'/);
  assert.doesNotMatch(html, /worker-src[^;]*blob:/);
  assert.match(html, /frame-ancestors 'none'/);
  assert.match(preload, /contextBridge\.exposeInMainWorld\("sift"/);
  assert.doesNotMatch(preload, /idea-foundry:/);
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
  assert.match(main, /app\.setName\("SIFT"\)/);
  assert.match(main, /const stableUserDataPath = path\.join\(app\.getPath\("appData"\), "Idea Foundry"\)/);
  assert.match(main, /mkdirSync\(stableUserDataPath, \{ recursive: true \}\)[^]*app\.setPath\("userData", stableUserDataPath\)/);
  assert.doesNotMatch(main, /idea-foundry:/);
  assert.doesNotMatch(main, /localStorage|sessionStorage/);
});

test("AI generation cannot write deterministic review inputs", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const generationStart = page.indexOf("async function generateWithConnectedLlm");
  const generationEnd = page.indexOf("async function startQuickRun", generationStart);
  assert.ok(generationStart >= 0 && generationEnd > generationStart);
  const generationFunction = page.slice(generationStart, generationEnd);
  assert.match(generationFunction, /const requestedCount = normalizeIdeaCount\(ideaCount\)/);
  assert.match(generationFunction, /if \(candidates\.length !== requestedCount\)/);
  assert.match(generationFunction, /const nextState = \{ \.\.\.stateAtCommit, ideas: \[\.\.\.stateAtCommit\.ideas, \.\.\.candidates\] \}/);
  assert.match(generationFunction, /localStorage\.setItem\(STORAGE_KEY, JSON\.stringify\(nextState\)\)/);
  assert.ok(
    generationFunction.indexOf("if (candidates.length !== requestedCount)")
      < generationFunction.indexOf("localStorage.setItem(STORAGE_KEY, JSON.stringify(nextState))"),
    "an incomplete slate must fail before anything is persisted",
  );
  assert.ok(
    generationFunction.indexOf("localStorage.setItem(STORAGE_KEY, JSON.stringify(nextState))")
      < generationFunction.indexOf("setState(nextState)"),
    "generated ideas must be durably saved before success reaches the live UI",
  );
  assert.match(generationFunction, /ideaIds:\s*candidates\.map\(\(candidate\) => candidate\.id\)/);
  assert.match(generationFunction, /setSection\("ideas"\)/);
  assert.match(generationFunction, /status: "error"/);
  assert.match(generationFunction, /No ideas were added/);
  assert.match(page, /Latest generation/);
  assert.match(page, /No new ideas were added/);
  assert.doesNotMatch(generationFunction, /updateReview|updateClaim|updateGate|artifacts|gates|claims/);
});

test("Idea Forge failures recover through a bounded exact-count generation path", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const start = page.indexOf("async function generateQualitySlate");
  const end = page.indexOf("async function generateWithConnectedLlm", start);
  assert.ok(start >= 0 && end > start);
  const generation = page.slice(start, end);

  assert.match(generation, /const runDesktopFallback = async/);
  assert.match(generation, /let desktopRequestCount = 0/);
  assert.match(generation, /if \(desktopRequestCount >= 2\)/);
  assert.match(generation, /retryableInvalidOutput && desktopRequestCount < 2/);
  assert.match(generation, /profileMode: snapshot\.profile\.mode/);
  assert.match(generation, /createStandardGenerationFailure\("request", error\)/);
  assert.match(generation, /createStandardGenerationFailure\("quality_gate", error\)/);
  assert.match(generation, /classifyAiRunFailure\(forge, connection\.saved\.provider\)/);
  assert.match(generation, /if \(!recovery\.allowIdeaForgeFallback\) throw new Error\(recovery\.userMessage\)/);
  assert.match(generation, /SIFT is trying its standard idea generator now/);
  assert.match(generation, /count: boundedCount/);
  assert.match(generation, /compact \? Math\.min\(2, count\) : count/);
  assert.match(generation, /\{ compact: true \}/);
  assert.match(generation, /finishing a smaller slate with one lighter request/);
  assert.match(generation, /const makeUpCount = Math\.min\(12, Math\.max\(deficit \+ 2, deficit \* 2\)\)/);
  assert.doesNotMatch(generation, /exclusionBrief|JSON\.stringify\(exclusionBrief\)/);
  assert.match(generation, /snapshot\.ideas/);
  assert.match(generation, /selected\.length < requestedCount && desktopRequestCount < 2/);
  assert.match(generation, /No ideas were added/);
  assert.match(generation, /partial: false/);
  assert.doesNotMatch(generation, /Continuing automatically/);
  assert.match(generation, /if \(options\.isCancelled\?\.\(\)\) return;[^]*options\.onProgress\?\.\(progress\.message, progress\.percent\)/);
  assert.match(generation, /sourceDetails = \{ engine: "desktop_single_pass", pipelineVersion: "idea-fallback\/1\.3\.0" \}/);
  assert.equal((generation.match(/connection\.bridge\.llm\.generateIdeas\(/g) ?? []).length, 1, "all recovery branches share one bounded fallback helper");
});

test("project state is synchronously mirrored and idea counts are whole numbers", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(page, /const \[state, setReactState\] = useState<AppState>\(defaultState\)/);
  const mirrorStart = page.indexOf("const setState = useCallback");
  const mirrorEnd = page.indexOf("}, []);", mirrorStart);
  assert.ok(mirrorStart >= 0 && mirrorEnd > mirrorStart);
  const mirror = page.slice(mirrorStart, mirrorEnd);
  assert.match(mirror, /update\(stateRef\.current\)/);
  assert.ok(mirror.indexOf("stateRef.current = nextState") < mirror.indexOf("setReactState(nextState)"));
  assert.doesNotMatch(page, /useEffect\(\(\) => \{\s*stateRef\.current = state;\s*\}, \[state\]\)/);
  assert.match(page, /Math\.trunc\(Number\.isFinite\(value\) \? value : 1\)/);
  assert.match(page, /type="number" min="1" max="12" step=\{1\}/);
  assert.match(page, /setIdeaCount\(normalizeIdeaCount\(Number\(event\.currentTarget\.value\)\)\)/);
});

test("selecting a different idea cannot inherit the prior idea's review or evidence", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const freshStart = page.indexOf("function freshIdeaScreenReview");
  const freshEnd = page.indexOf("function reviewHasMaterialWork", freshStart);
  const beginStart = page.indexOf("function beginReview");
  const beginEnd = page.indexOf("function currentLlmInput", beginStart);
  assert.ok(freshStart >= 0 && freshEnd > freshStart && beginStart >= 0 && beginEnd > beginStart);

  const freshReview = page.slice(freshStart, freshEnd);
  const beginReview = page.slice(beginStart, beginEnd);
  assert.match(freshReview, /\.\.\.defaultReview\(\)/);
  assert.doesNotMatch(freshReview, /current\.archetype/);
  assert.match(freshReview, /stage: "thesis"/);
  assert.match(beginReview, /const selectingDifferentIdea = state\.project\.selectedIdeaId !== idea\.id/);
  assert.match(beginReview, /reviewHasMaterialWork\(state\.review\)[^]*window\.confirm/);
  assert.match(beginReview, /const review = selectingDifferentIdea \? freshIdeaScreenReview\(\) : state\.review/);
  assert.match(beginReview, /review,\s*\}\)\)/);
  assert.match(beginReview, /draftQuickRunEvaluation\([^]*review,[^]*selectingDifferentIdea \? "" : evaluationNotes/);
  assert.doesNotMatch(freshReview, /artifacts:\s*current\.artifacts|claims:\s*current\.claims|gates:\s*current\.gates/);
});

test("thesis screens do not expose validation-only controls", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const evidenceStart = page.indexOf('section === "evidence"');
  const evidenceEnd = page.indexOf('section === "results"', evidenceStart);
  const overviewStart = page.indexOf("function Overview");
  assert.ok(evidenceStart >= 0 && evidenceEnd > evidenceStart && overviewStart >= 0);

  const evidenceSection = page.slice(evidenceStart, evidenceEnd);
  const overview = page.slice(overviewStart);
  assert.match(evidenceSection, /state\.review\.stage === "thesis"[^]*Start testing/);
  assert.match(evidenceSection, /state\.review\.stage !== "thesis" && <>[^]*Research public sources[^]*Turn your notes into evidence[^]*Add evidence manually/);
  assert.match(page, /STAGES\.filter\(\(item\) => item !== "thesis"\)/);
  assert.match(page, /state\.review\.gates\.filter\(\(gate\) => state\.review\.stage !== "thesis" \|\| gate\.id === "G1" \|\| gate\.id === "G2" \|\| gate\.id === "G7"\)/);
  assert.match(page, /state\.review\.stage !== "thesis" && <label className="compact-field"><span>Evidence<\/span>/);
  assert.match(overview, /state\.review\.stage !== "thesis" && selectedIdea && <>[^]*Preview validation state/);
});

test("AI one-click Quick Run calculates only an isolated preview", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const quickStart = page.indexOf("async function startQuickRun");
  const quickEnd = page.indexOf("async function startOneShotRun", quickStart);
  assert.ok(quickStart >= 0 && quickEnd > quickStart);
  const quickFunction = page.slice(quickStart, quickEnd);
  assert.match(quickFunction, /setQuickRunMode\("auto-preview"\)/);
  assert.match(quickFunction, /const runId = \+\+quickRunRequestRef\.current/);
  assert.match(quickFunction, /confirmRemoteQuickRunSend/);
  assert.match(quickFunction, /const selectedBy = selectedAtStart \? "existing-user-choice"[^]*: "automated-priority"/);
  assert.match(quickFunction, /calculateGenerationPriority\(state\.profile, chosenIdea\.scores\)/);
  assert.match(quickFunction, /const previewReview = selectedAtStart \? state\.review : freshQuickPreviewReview\(state\.review\)/);
  assert.match(quickFunction, /buildQuickRunPreview\([^]*scoreReview\)/);
  assert.match(quickFunction, /setQuickRunOutcome\(\{ kind: "preview", preview, idea: chosenIdea \}\)/);
  assert.match(quickFunction, /setState\(\(current\) => \(\{ \.\.\.current, ideas: \[\.\.\.current\.ideas, \.\.\.candidates\] \}\)\)/);
  assert.equal((quickFunction.match(/\bsetState\(/g) ?? []).length, 1);
  assert.doesNotMatch(quickFunction, /applyEvaluationProposals|applyEvidenceProposals|applyGateProposal|updateReview|updateClaim|updateGate|setSelectedEvaluationClaims|reviewerVerified\s*:\s*true/);
  assert.doesNotMatch(quickFunction, /extractEvidence|artifacts\s*:/);
  assert.match(page, /AI prepared a separate preview\. Your saved decision stays unchanged until you choose what to keep/);
  assert.match(page, /Nothing was treated as verified evidence automatically/);
  assert.match(page, /Technology fit/);
  assert.match(page, /Saved evidence/);
});

test("Create to Build separates a fresh thesis decision from venture validation and requires build consent", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const start = page.indexOf("async function startOneShotRun");
  const end = page.indexOf("async function startResearchRun", start);
  assert.ok(start >= 0 && end > start);
  const oneShot = page.slice(start, end);

  assert.match(oneShot, /setQuickRunMode\("one-shot"\)/);
  assert.match(oneShot, /if \(!connection \|\| runId !== quickRunRequestRef\.current\) \{[^]*setQuickRunPhase\("idle"\)[^]*setQuickRunMode\(null\)[^]*setQuickRunMessage\(""\)/);
  assert.match(oneShot, /generateQualitySlate\(connection, stateAtStart, 4/);
  assert.match(oneShot, /onProgress: \(message, percent\) => \{[^]*if \(runId !== quickRunRequestRef\.current\) return;[^]*setQuickRunMessage/);
  assert.match(oneShot, /setQuickRunMessage\("Ideas generated\. Comparing the strongest candidates\."\)/);
  assert.match(page, /runIdeaForgeIntelligence\(/);
  assert.match(page, /selectQualitySlate\(/);
  assert.match(page, /engine: "python_multistage"/);
  assert.match(oneShot, /bridge\.llm\.draftEvaluation\(/);
  assert.match(oneShot, /bridge\.llm\.researchEvidence\(/);
  assert.match(oneShot, /freshIdeaScreenReview\(\)/);
  assert.match(oneShot, /scope: "thesis_screen"/);
  assert.match(oneShot, /screenThesis\(finalPreview\.previewReview\)/);
  assert.match(oneShot, /createBuildHandoff\(\{ route: chosenIdea\.route, decision: thesisScreen\.decision \}\)/);
  assert.match(oneShot, /contextResult \? publicContextSummaryFor\(contextResult\) : ""/);
  assert.match(oneShot, /const finalPreview = await draftEvaluationFor/);
  assert.match(oneShot, /review: finalReview/);
  assert.match(oneShot, /localStorage\.setItem\(STORAGE_KEY, JSON\.stringify\(nextState\)\)/);
  assert.match(oneShot, /setState\(nextState\)/);
  assert.ok(
    oneShot.indexOf("localStorage.setItem(STORAGE_KEY, JSON.stringify(nextState))")
      < oneShot.indexOf("setState(nextState)"),
    "durable local persistence is checked before the live React state is committed",
  );
  assert.equal((oneShot.match(/\bsetState\(/g) ?? []).length, 1, "the live project is committed once after the screen finishes");
  assert.match(oneShot, /project: stateAtCommit\.project/);
  assert.match(oneShot, /ideas: stateAtCommit\.ideas/);
  assert.doesNotMatch(oneShot, /selectedAtStart|completeAutomatedResearchRun|applyResearchEvidenceBatch|committed: true/);
  assert.doesNotMatch(oneShot, /window\.confirm|reviewerVerified\s*:\s*true|acknowledgedCounterEvidenceIds/);
  assert.match(page, /Idea → Research → Check → Decide → Build-ready/);
  assert.match(page, /Start building/);
  const inspectStart = page.indexOf("function inspectQuickRunOutcome");
  const inspectEnd = page.indexOf("async function saveAiConnectionOrOpenSettings", inspectStart);
  const inspect = page.slice(inspectStart, inspectEnd);
  assert.match(inspect, /quickRunOutcome\.kind === "one-shot"[^]*setSection\("build"\)/);
  assert.doesNotMatch(oneShot, /\.build\.run|runBuildAction/);
  assert.match(page, /New ideas start with no customer evidence/);
  assert.match(page, /Validation has not started/);
  assert.match(page, /WORTH TESTING/);
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
  assert.match(page, /Public research · E1/);
  assert.match(page, /Challenges are never dismissed automatically/);
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
  assert.match(quickFunctions, /Review and apply only the score drafts you agree with/);
  assert.match(quickFunctions, /Apply each required check separately, or leave it unresolved/);
  assert.doesNotMatch(quickFunctions, /applyEvaluationProposals|applyEvidenceProposals|applyGateProposal|reviewerVerified\s*:\s*true/);
  assert.match(page, /You stay in control/);
  assert.match(page, /Continue without evidence/);
  assert.match(page, /Send & refresh checks/);
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
  assert.match(guide, /aria-label="Guided flow progress"/);
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

  const promptStart = page.indexOf("function generationPromptFor");
  const promptEnd = page.indexOf("function recordFrom", promptStart);
  assert.ok(promptStart >= 0 && promptEnd > promptStart);
  const promptBuilder = page.slice(promptStart, promptEnd);
  assert.match(promptBuilder, /sharePersonalityScoresWithAi/);
  assert.match(promptBuilder, /Exact domain and facet scores are intentionally excluded/);
  assert.doesNotMatch(promptBuilder, /personalityAnswers|PERSONALITY_DRAFT_KEY/);

  const clearStart = page.indexOf("function clearPersonalityDraft");
  const clearEnd = page.indexOf("function chooseProfileMode", clearStart);
  assert.match(page.slice(clearStart, clearEnd), /removeCurrentAndLegacyStorageValues\([^]*sessionStorage[^]*PERSONALITY_DRAFT_KEY[^]*PRE_SIFT_PERSONALITY_DRAFT_KEY/);
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

  const hydrationStart = page.indexOf("const candidate = readStorageValueCandidate(");
  const hydrationEnd = page.indexOf("const candidate = readStorageValueCandidate(", hydrationStart + 1);
  assert.ok(hydrationStart >= 0 && hydrationEnd > hydrationStart);
  const hydration = page.slice(hydrationStart, hydrationEnd);
  assert.match(hydration, /sanitizeGenerationProfile\(parsed\.profile, true\)/);
  assert.match(hydration, /sanitizeReviewInput\(parsed\?\.review\)/);
  assert.match(hydration, /commitStorageMigration\([^]*PRE_SIFT_PROJECT_STORAGE_KEY/);
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
  assert.match(resetFunction, /setIdeaImportWorkspace\(null\)/);
  assert.match(resetFunction, /ideaImportRequestRef\.current \+= 1/);
  const importStart = page.indexOf("function importPacket");
  const importEnd = page.indexOf("async function copyText", importStart);
  assert.match(page.slice(importStart, importEnd), /resetAiWorkspace\(\)/);
  assert.match(page, /removeCurrentAndLegacyStorageValues\([^]*localStorage[^]*STORAGE_KEY[^]*PRE_SIFT_PROJECT_STORAGE_KEY[^]*resetAiWorkspace\(\)/);
  assert.match(page, /currentEvidenceVerificationFingerprint/);
  assert.match(page, /reviewerVerified: evidenceHumanVerificationCurrent/);
});

test("idea document import stays transient and saves one candidate atomically", async () => {
  const [page, importer] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/lib/idea-file-import.ts", import.meta.url), "utf8"),
  ]);
  assert.match(page, /type="file"[^]*accept=\{IDEA_FILE_ACCEPT\}/);
  assert.match(page, /Upload your idea/);
  assert.match(page, /Read locally/);
  const structureStart = page.indexOf("async function structureImportedIdeaWithAi");
  const structureEnd = page.indexOf("function importedCandidateForSave", structureStart);
  const structure = page.slice(structureStart, structureEnd);
  assert.match(structure, /saveAiConnectionOrOpenSettings\(\)/);
  assert.match(structure, /window\.confirm\(/);
  assert.match(structure, /connection\.bridge\.llm\.generateIdeas\(\{/);
  assert.match(structure, /count: 1/);
  assert.match(structure, /profileMode: "neutral"/);
  assert.match(structure, /candidates\.length !== 1/);
  assert.match(structure, /if \(runFullCheck\) saveImportedIdea\(true, structuredWorkspace\)/);
  const saveStart = page.indexOf("function saveImportedIdea");
  const saveEnd = page.indexOf("function updateIdea", saveStart);
  const save = page.slice(saveStart, saveEnd);
  assert.match(save, /const stateAtCommit = stateRef\.current/);
  assert.match(save, /localStorage\.setItem\(STORAGE_KEY, JSON\.stringify\(nextState\)\)/);
  assert.ok(save.indexOf("localStorage.setItem(STORAGE_KEY, JSON.stringify(nextState))") < save.indexOf("setState(nextState)"));
  const persistedShape = save.slice(save.indexOf("const nextState"), save.indexOf("localStorage.setItem"));
  assert.doesNotMatch(persistedShape, /sourceText|fileName|arrayBuffer/);
  assert.match(save, /startOneShotRun\(\{ stateOverride: nextState, ideaOverride: candidate \}\)/);
  assert.match(page, /ideaFileInputRef\.current\.value = ""/);
  assert.match(page, /ideaImportAbortRef\.current\?\.abort\(\)/);
  const sourceUpdate = page.slice(page.indexOf("function updateImportedSourceText"), page.indexOf("function closeIdeaImport"));
  assert.match(sourceUpdate, /current\.aiStructured[^]*emptyIdeaCandidate[^]*aiStructured: false/);
  assert.match(page, /Structure & check to build-ready/);
  assert.match(page, /disabled=\{ideaImportBusy !== null\}[^]*value=\{ideaImportWorkspace\.sourceText\}/);
  assert.match(importer, /streamTextContent\(\)\.getReader\(\)/);
  assert.match(importer, /MAX_IMPORTED_TEXT_CHARS - extractedCharacters/);
  assert.match(importer, /reader\.cancel\(\)/);
  assert.match(importer, /signal\?\.addEventListener\("abort"/);
  const oneShot = page.slice(page.indexOf("async function startOneShotRun"), page.indexOf("async function startResearchRun"));
  assert.ok(oneShot.indexOf("else if (providedIdea)") < oneShot.indexOf("generateQualitySlate"));
  assert.match(oneShot, /generatedCandidates = \[providedIdea\]/);
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
  assert.match(page, /setLlmConnectionVerified\(result\.ok\)/);
  assert.match(page, /pendingOneShot && !llmConnectionVerified/);
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

test("Python intelligence is a supervised proposal-only sidecar", async () => {
  const [preload, main, bridge, worker, page, packageJson] = await Promise.all([
    readFile(new URL("../desktop/preload.cjs", import.meta.url), "utf8"),
    readFile(new URL("../desktop/main.mjs", import.meta.url), "utf8"),
    readFile(new URL("../desktop/intelligence-bridge.mjs", import.meta.url), "utf8"),
    Promise.all([
      readFile(new URL("../desktop/intelligence_worker/worker.py", import.meta.url), "utf8"),
      readFile(new URL("../desktop/intelligence_worker/tasks.py", import.meta.url), "utf8"),
    ]).then((parts) => parts.join("\n")),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);
  assert.match(preload, /intelligence:[^]*getStatus:[^]*start:[^]*getEvents:[^]*cancel:/);
  assert.doesNotMatch(preload, /ipcRenderer\.on|ipcRenderer\.send/);
  assert.match(main, /const config = await resolvedConfig\(\)[^]*intelligence\.start\(input, config\)/);
  assert.match(bridge, /packaged apps never run a system Python/i);
  assert.match(bridge, /minimalWorkerEnvironment/);
  assert.match(bridge, /secretValues:[^]*model\.apiKey/);
  assert.doesNotMatch(bridge, /shell:\s*true/);
  assert.match(worker, /"provisional": True/);
  assert.match(worker, /"customerValidation": False/);
  assert.doesNotMatch(worker, /scoreReview|screenThesis|localStorage|safeStorage/);
  assert.match(page, /intelligenceResult \? intelligenceContextSummary\(intelligenceResult\) : ""/);
  assert.match(page, /screenThesis\(finalPreview\.previewReview\)/);
  assert.match(packageJson, /desktop\/intelligence-runtime\/\$\{os\}-\$\{arch\}/);
  assert.match(packageJson, /desktop\/intelligence-bridge\.mjs/);
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
  const [packager, workflow, packageText] = await Promise.all([
    readFile(new URL("../scripts/package-desktop.mjs", import.meta.url), "utf8"),
    readFile(new URL("../.github/workflows/desktop-release.yml", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);
  const packageJson = JSON.parse(packageText);
  assert.match(packager, /publish:\s*["']never["']/);
  assert.match(packager, /name\.toLowerCase\(\) === "sift\.exe"/);
  assert.equal(packageJson.build.portable.artifactName, "SIFT.${ext}");
  assert.match(workflow, /name: Lint source[^]*run: npm run lint/);
  assert.match(workflow, /name: Launch packaged app with a clean profile[^]*release\/SIFT\.exe[^]*Get-Process -Name SIFT[^]*SIFT exited during the clean-profile launch check[^]*Stop-Process/);
  assert.match(workflow, /release\/SIFT\.exe[^]*sha256sum SIFT\.exe SIFT-Setup-\*\.exe/);
  assert.match(workflow, /publish:[^]*needs:[^]*- windows[^]*- macos/);
});
