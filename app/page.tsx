"use client";

/* Brand images use native img elements so the same component bundles under Next.js and Electron's Vite renderer. */
/* eslint-disable @next/next/no-img-element */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ARCHETYPES,
  ENGINE_VERSION,
  EVIDENCE_GRADES,
  EVIDENCE_RANK,
  EVIDENCE_TYPES,
  EVIDENCE_TYPE_MAX_RANK,
  FRAMEWORK_VERSION,
  GATE_IDS,
  RUBRIC,
  STAGES,
  calculateGenerationPriority,
  createDefaultGates,
  createEmptyClaims,
  scoreReview,
  validateGenerationProfile,
  type Archetype,
  type EvidenceArtifact,
  type EvidenceGrade,
  type EvidenceType,
  type GateAssessment,
  type GenerationComponentScores,
  type GenerationProfile,
  type ProtocolRoute,
  type ReviewInput,
  type Stage,
} from "./lib/scoring";
import { searchLlmModels } from "./lib/model-search";
import { applyEvaluationProposals, applyEvidenceProposals, sourceContentSha256 } from "./lib/ai-assistance";
import type {
  DraftEvaluationResult,
  EvidenceProposal,
  ExtractEvidenceResult,
  GeneratedIdeasResult,
  ListModelsInput,
  LlmConfig,
  LlmConnectionOptions,
  LlmProvider,
  NormalizedGeneratedIdea,
  SaveLlmConfigInput,
} from "./desktop-bridge";

function brandAssetUrl(filename: string) {
  return typeof window !== "undefined" && window.ideaFoundry?.desktop
    ? `./${filename}`
    : `/brand/${filename}`;
}

const BRAND_ICON_URL = brandAssetUrl("idea-foundry-icon.png");
const BRAND_LOGO_URL = brandAssetUrl("idea-foundry-logo.png");
const BRAND_MARK_URL = brandAssetUrl("idea-foundry-mark-transparent.png");

type Section = "overview" | "quick" | "ideas" | "profile" | "model" | "review" | "evidence" | "results" | "export";

type QuickRunPhase =
  | "idle"
  | "generating"
  | "choose-idea"
  | "drafting-evaluation"
  | "approve-evaluation"
  | "evidence"
  | "refreshing-gates"
  | "approve-gates"
  | "decision";

interface IdeaCandidate {
  id: string;
  title: string;
  concept: string;
  user: string;
  buyer: string;
  currentAlternative: string;
  criticalAssumption: string;
  experiment: string;
  route: "Xahau" | "Evernode" | "Both" | "Neither yet";
  scores: GenerationComponentScores;
  source?: {
    kind: "llm";
    provider: string;
    model: string;
    generatedAt: string;
  };
}

interface ProjectDetails {
  title: string;
  domain: string;
  selectedIdeaId: string;
}

interface EvaluationDraftState {
  result: DraftEvaluationResult;
  contextFingerprint: string;
  gateFingerprints: Record<GateAssessment["id"], string>;
  createdAt: string;
}

interface EvidenceAnalysisState {
  result: ExtractEvidenceResult;
  sourceFingerprint: string;
  createdAt: string;
}

interface AiUndoState {
  label: string;
  review: ReviewInput;
  appliedInputFingerprint: string;
}

interface EvidenceSourceDraft {
  label: string;
  text: string;
  evidenceDate: string;
  expiryDate: string;
  reviewer: string;
  relationshipOrConflict: string;
  reviewerVerified: boolean;
  verificationFingerprint: string;
  updateClaimGrades: boolean;
}

interface AppState {
  started: boolean;
  project: ProjectDetails;
  profile: GenerationProfile;
  ideas: IdeaCandidate[];
  review: ReviewInput;
}

const STORAGE_KEY = "idea-foundry-v1";

const LLM_PROVIDERS: Record<LlmProvider, {
  label: string;
  defaultUrl: string;
  boundary: string;
  location: string;
  remote: boolean;
  keyRequired: boolean;
  lockedEndpoint: boolean;
}> = {
  ollama: {
    label: "Ollama",
    defaultUrl: "http://127.0.0.1:11434",
    boundary: "Local by default. Prompts stay on this computer when Ollama is running locally.",
    location: "Localhost",
    remote: false,
    keyRequired: false,
    lockedEndpoint: false,
  },
  lmstudio: {
    label: "LM Studio",
    defaultUrl: "http://127.0.0.1:1234/v1",
    boundary: "Local by default. Prompts stay on this computer when LM Studio is running locally.",
    location: "Localhost",
    remote: false,
    keyRequired: false,
    lockedEndpoint: false,
  },
  openrouter: {
    label: "OpenRouter",
    defaultUrl: "https://openrouter.ai/api/v1",
    boundary: "Cloud endpoint. The displayed prompt is sent to OpenRouter and the selected model provider. An OpenRouter API key is required.",
    location: "Cloud · easiest setup",
    remote: true,
    keyRequired: true,
    lockedEndpoint: true,
  },
  openaiCompatible: {
    label: "OpenAI-compatible",
    defaultUrl: "https://api.openai.com/v1",
    boundary: "Loopback HTTP is allowed for a model on this computer; every remote endpoint must use HTTPS.",
    location: "Local or cloud",
    remote: true,
    keyRequired: false,
    lockedEndpoint: false,
  },
};

const DEFAULT_LLM_CONFIG: LlmConfig = {
  provider: "ollama",
  baseUrl: LLM_PROVIDERS.ollama.defaultUrl,
  model: "",
  hasApiKey: false,
};

function editorConfigForProvider(provider: LlmProvider, persisted: LlmConfig) {
  if (persisted.provider === provider) return { ...persisted };
  return {
    provider,
    baseUrl: LLM_PROVIDERS[provider].defaultUrl,
    model: "",
    hasApiKey: false,
  };
}

function sameCredentialBoundary(left: LlmConfig, right: LlmConfig) {
  if (left.provider !== right.provider) return false;
  try {
    const normalizeEndpoint = (value: string) => {
      const url = new URL(value.trim());
      url.pathname = url.pathname.replace(/\/+$/, "") || "";
      return url.toString().replace(/\/$/, "");
    };
    return normalizeEndpoint(left.baseUrl) === normalizeEndpoint(right.baseUrl);
  } catch {
    return false;
  }
}

function confirmRemoteQuickRunSend(config: LlmConfig, description: string) {
  if (isLoopbackEndpoint(config.baseUrl)) return true;
  return window.confirm(
    `Quick Run will send ${description} to ${LLM_PROVIDERS[config.provider].label} and the selected model provider. Continue?`,
  );
}

const archetypeLabels: Record<Archetype, string> = {
  application: "Application",
  enterprise: "Enterprise",
  protocolInfrastructure: "Protocol / Infrastructure",
  marketplaceDepin: "Marketplace / DePIN",
};

const stageLabels: Record<Stage, string> = {
  thesis: "Thesis",
  discovery: "Discovery",
  architecture: "Architecture",
  pilot: "Pilot",
  production: "Production",
};

const routeLabels: Record<ProtocolRoute, string> = {
  unresolved: "Unresolved",
  conventional: "Conventional architecture",
  xahau_app_specific: "Xahau app-specific",
  evernode_baseline: "Evernode baseline",
  hybrid: "Xahau + Evernode hybrid",
};

const gateLabels: Record<(typeof GATE_IDS)[number], string> = {
  G1: "Integrity, legality & harm",
  G2: "Specific problem & actor",
  G3: "Reach & coordination",
  G4: "Technical & trust feasibility",
  G5: "Protocol counterfactual",
  G6: "Economic sustainability",
  G7: "Funding & execution path",
  G8: "Stage safety",
};

function today() {
  return new Date().toISOString().slice(0, 10);
}

function oneYearFromToday() {
  const date = new Date();
  date.setUTCFullYear(date.getUTCFullYear() + 1);
  return date.toISOString().slice(0, 10);
}

function emptyEvidenceSourceDraft(): EvidenceSourceDraft {
  return {
    label: "",
    text: "",
    evidenceDate: "",
    expiryDate: "",
    reviewer: "",
    relationshipOrConflict: "",
    reviewerVerified: false,
    verificationFingerprint: "",
    updateClaimGrades: false,
  };
}

function emptyManualEvidenceDraft() {
  return {
    title: "",
    claimId: "1A",
    evidenceType: "CustomerObservation" as EvidenceType,
    grade: "E2" as EvidenceGrade,
    direction: "supports" as "supports" | "contradicts",
    evidenceDate: today(),
    expiryDate: oneYearFromToday(),
    reviewerVerified: false,
    reviewer: "",
    relationshipOrConflict: "",
  };
}

function nextEvidenceSuffix(artifacts: EvidenceArtifact[]) {
  const used = new Set(artifacts.flatMap((artifact) => [
    artifact.artifactId.toUpperCase(),
    artifact.evidenceClaimId.toUpperCase(),
    artifact.sourceFamilyId.toUpperCase(),
    artifact.observationId.toUpperCase(),
  ]));
  for (let index = 1; ; index += 1) {
    const suffix = String(index).padStart(3, "0");
    if ([`A-${suffix}`, `EC-${suffix}`, `SF-${suffix}`, `OBS-${suffix}`].every((id) => !used.has(id))) return suffix;
  }
}

function secureFingerprint(value: string) {
  return sourceContentSha256(value);
}

function gateStateFingerprint(gate: GateAssessment) {
  return secureFingerprint(JSON.stringify(gate));
}

function modelSafeSourceLabel(value: string) {
  const cleaned = value.trim().replaceAll("\\", "/");
  return cleaned.split("/").filter(Boolean).at(-1) ?? "Provided source";
}

function isLoopbackEndpoint(value: string) {
  try {
    return new Set(["localhost", "127.0.0.1", "[::1]", "::1"]).has(new URL(value).hostname);
  } catch {
    return false;
  }
}

function evaluationContextFor(
  idea: IdeaCandidate | undefined,
  project: ProjectDetails,
  review: ReviewInput,
  additionalNotes: string,
) {
  if (!idea) return "";
  const groundedArtifacts = review.artifacts
    .filter((artifact) => artifact.sourceExcerpt?.trim())
    .slice(0, 12)
    .map((artifact) => [
      `Artifact ${artifact.artifactId} (claims ${artifact.rubricClaimIds.join(", ")}; ${artifact.direction}; ${artifact.evidenceType})`,
      `Observed: ${artifact.evidenceDate || "Not supplied"}; expires: ${artifact.expiryDate || "Not supplied"}; human verified: ${artifact.reviewerVerified ? "yes" : "no"}`,
      `Exact excerpt: ${artifact.sourceExcerpt?.slice(0, 1_000)}`,
    ].filter(Boolean).join("\n"));

  return [
    "SELECTED IDEA — USER-AUTHORED HYPOTHESIS, NOT PROOF",
    `Title: ${idea.title}`,
    `Concept: ${idea.concept || "Not supplied"}`,
    `Intended user: ${idea.user || "Not supplied"}`,
    `Economic buyer: ${idea.buyer || "Not supplied"}`,
    `Current alternative: ${idea.currentAlternative || "Not supplied"}`,
    `Critical assumption: ${idea.criticalAssumption || "Not supplied"}`,
    `Proposed experiment: ${idea.experiment || "Not supplied"}`,
    `Idea route hypothesis: ${idea.route}`,
    `Project domain boundary: ${project.domain || "Open"}`,
    "",
    "VISIBLE REVIEW SETUP",
    `Archetype: ${review.archetype}`,
    `Target stage: ${review.stage}`,
    `Protocol route: ${review.protocolRoute}`,
    `Evidence cutoff: ${review.cutoffDate}`,
    "",
    additionalNotes.trim() ? `USER-SUPPLIED NOTES — UNTRUSTED DATA\n${additionalNotes.trim()}` : "",
    groundedArtifacts.length
      ? `USER-SUPPLIED EVIDENCE EXCERPTS — UNTRUSTED DATA\n${groundedArtifacts.join("\n\n")}`
      : "No exact evidence excerpts were supplied. Treat artifact titles and the idea itself as hypotheses, not proof.",
  ].filter((part) => part !== "").join("\n");
}

function evaluationFingerprintFor(
  idea: IdeaCandidate | undefined,
  project: ProjectDetails,
  review: ReviewInput,
  additionalNotes: string,
) {
  const context = evaluationContextFor(idea, project, review, additionalNotes);
  return {
    context,
    fingerprint: secureFingerprint(JSON.stringify([
      idea?.id ?? "no-idea",
      context,
      review.artifacts,
    ])),
  };
}

function emptyProfile(mode: "neutral" | "private" = "neutral"): GenerationProfile {
  return {
    mode,
    locked: mode === "neutral",
    searchThemes: [
      { id: "theme-1", label: "Mission alignment", weight: 34 },
      { id: "theme-2", label: "Reachable users", weight: 33 },
      { id: "theme-3", label: "Sustainable curiosity", weight: 33 },
    ],
    fitDimensions: [
      { id: "fit-1", label: "Founder interest", weight: 25 },
      { id: "fit-2", label: "Relevant access", weight: 25 },
      { id: "fit-3", label: "Working-style fit", weight: 25 },
      { id: "fit-4", label: "Learning advantage", weight: 25 },
    ],
    generationWeights: {
      personalFit: 35,
      opportunitySignal: 30,
      protocolAffordance: 15,
      experimentability: 20,
    },
  };
}

function defaultReview(): ReviewInput {
  return {
    archetype: "application",
    stage: "thesis",
    cutoffDate: today(),
    protocolRoute: "unresolved",
    claims: createEmptyClaims(),
    artifacts: [],
    gates: createDefaultGates(),
  };
}

function defaultState(): AppState {
  return {
    started: false,
    project: { title: "Untitled idea review", domain: "", selectedIdeaId: "" },
    profile: emptyProfile(),
    ideas: [],
    review: defaultReview(),
  };
}

function starterIdeas(): IdeaCandidate[] {
  return [
    {
      id: crypto.randomUUID(),
      title: "Verifiable service receipts",
      concept: "Independent Evernode services issue portable proof that a real-world or digital job was completed, with Xahau coordinating settlement and disputes.",
      user: "Service buyers and independent operators",
      buyer: "Platforms or communities that need auditable fulfillment",
      currentAlternative: "Screenshots, private platform logs, and manual reconciliation",
      criticalAssumption: "Multiple parties value shared receipts enough to change their workflow.",
      experiment: "Interview 12 buyers and test a signed-receipt prototype with three operators.",
      route: "Both",
      scores: { personalFit: 55, opportunitySignal: 62, protocolAffordance: 88, experimentability: 72 },
    },
    {
      id: crypto.randomUUID(),
      title: "Agent accountability registry",
      concept: "Autonomous agents publish scoped commitments, execution receipts, and recovery hooks so counterparties can verify what an agent was authorized to do.",
      user: "Teams deploying autonomous agents",
      buyer: "Agent platforms and regulated operators",
      currentAlternative: "Centralized audit logs controlled by the deploying vendor",
      criticalAssumption: "Cross-organization agent accountability is a current buying problem, not a future concern.",
      experiment: "Map five recent agent failures and ask ten operators to rank the value of portable execution receipts.",
      route: "Both",
      scores: { personalFit: 60, opportunitySignal: 58, protocolAffordance: 92, experimentability: 63 },
    },
    {
      id: crypto.randomUUID(),
      title: "Portable consent exchange",
      concept: "People grant, revoke, and audit narrow data permissions while independent services enforce policy without one platform owning the consent record.",
      user: "Consumers sharing sensitive data",
      buyer: "Organizations that need defensible consent and revocation",
      currentAlternative: "Static consent forms and organization-specific databases",
      criticalAssumption: "A shared permission state reduces enough compliance or coordination cost to justify adoption.",
      experiment: "Prototype one revocation workflow and measure the current reconciliation cost with five organizations.",
      route: "Both",
      scores: { personalFit: 50, opportunitySignal: 67, protocolAffordance: 76, experimentability: 57 },
    },
    {
      id: crypto.randomUUID(),
      title: "Shared equipment assurance",
      concept: "Communities coordinate deposits, maintenance history, and condition attestations for shared high-value equipment without a single custodian controlling the record.",
      user: "Clubs, cooperatives, and equipment owners",
      buyer: "Equipment networks and insurers",
      currentAlternative: "Spreadsheets, deposits, and trust between members",
      criticalAssumption: "Loss, disputes, or maintenance uncertainty materially limits sharing today.",
      experiment: "Observe two lending workflows and preregister a deposit-plus-condition test with one group.",
      route: "Xahau",
      scores: { personalFit: 64, opportunitySignal: 54, protocolAffordance: 71, experimentability: 82 },
    },
  ];
}

function csvCell(value: unknown) {
  let text = String(value ?? "");
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

function downloadFile(name: string, body: string, type: string) {
  const blob = new Blob([body], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function requiredGeneratedText(record: Record<string, unknown>, key: string, maxLength = 4000) {
  const value = record[key];
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= maxLength ? trimmed : null;
}

function generatedScore(record: Record<string, unknown>, key: keyof GenerationComponentScores) {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100
    ? value
    : null;
}

function validateGeneratedIdea(
  value: unknown,
  requirePersonalFit: boolean,
): Omit<IdeaCandidate, "id" | "source"> | null {
  const record = recordValue(value);
  if (!record) return null;
  const scores = recordValue(record.scores);
  if (!scores) return null;

  const title = requiredGeneratedText(record, "title", 180);
  const concept = requiredGeneratedText(record, "concept");
  const user = requiredGeneratedText(record, "user", 500);
  const buyer = requiredGeneratedText(record, "buyer", 500);
  const currentAlternative = requiredGeneratedText(record, "currentAlternative");
  const criticalAssumption = requiredGeneratedText(record, "criticalAssumption");
  const experiment = requiredGeneratedText(record, "experiment");
  const route = record.route;
  const allowedRoutes = ["Xahau", "Evernode", "Both", "Neither yet"] as const;
  const opportunitySignal = generatedScore(scores, "opportunitySignal");
  const protocolAffordance = generatedScore(scores, "protocolAffordance");
  const experimentability = generatedScore(scores, "experimentability");
  const suppliedPersonalFit = generatedScore(scores, "personalFit");

  if (
    !title ||
    !concept ||
    !user ||
    !buyer ||
    !currentAlternative ||
    !criticalAssumption ||
    !experiment ||
    typeof route !== "string" ||
    !allowedRoutes.includes(route as (typeof allowedRoutes)[number]) ||
    opportunitySignal === null ||
    protocolAffordance === null ||
    experimentability === null ||
    (requirePersonalFit && suppliedPersonalFit === null)
  ) {
    return null;
  }

  return {
    title,
    concept,
    user,
    buyer,
    currentAlternative,
    criticalAssumption,
    experiment,
    route: route as IdeaCandidate["route"],
    scores: {
      personalFit: suppliedPersonalFit ?? 50,
      opportunitySignal,
      protocolAffordance,
      experimentability,
    },
  };
}

function generatedCandidatesFromResult(result: GeneratedIdeasResult, requirePersonalFit: boolean) {
  const generatedAt = new Date().toISOString();
  return result.ideas
    .map((idea: NormalizedGeneratedIdea) => validateGeneratedIdea(idea, requirePersonalFit))
    .filter((idea): idea is Omit<IdeaCandidate, "id" | "source"> => idea !== null)
    .map((idea) => ({
      ...idea,
      id: crypto.randomUUID(),
      source: { kind: "llm" as const, provider: result.provider, model: result.model, generatedAt },
    }));
}

function normalizeLlmConfig(value: unknown): LlmConfig {
  const record = recordValue(value);
  const provider =
    record?.provider === "ollama" || record?.provider === "lmstudio" || record?.provider === "openrouter" || record?.provider === "openaiCompatible"
      ? record.provider
      : DEFAULT_LLM_CONFIG.provider;
  return {
    provider,
    baseUrl:
      typeof record?.baseUrl === "string" && record.baseUrl.trim()
        ? record.baseUrl.trim()
        : LLM_PROVIDERS[provider].defaultUrl,
    model: typeof record?.model === "string" ? record.model : "",
    hasApiKey: record?.hasApiKey === true,
  };
}

export default function Home() {
  const [section, setSection] = useState<Section>("overview");
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false);
  const [state, setState] = useState<AppState>(defaultState);
  const [hydrated, setHydrated] = useState(false);
  const [toast, setToast] = useState("");
  const [includeProfile, setIncludeProfile] = useState(false);
  const [importText, setImportText] = useState("");
  const [desktopVersion, setDesktopVersion] = useState("");
  const [llmConfig, setLlmConfig] = useState<LlmConfig>(DEFAULT_LLM_CONFIG);
  const [persistedLlmConfig, setPersistedLlmConfig] = useState<LlmConfig>(DEFAULT_LLM_CONFIG);
  const [llmApiKey, setLlmApiKey] = useState("");
  const [clearLlmApiKey, setClearLlmApiKey] = useState(false);
  const [llmModels, setLlmModels] = useState<Array<{ id: string; name: string }>>([]);
  const [modelSearch, setModelSearch] = useState("");
  const [modelListError, setModelListError] = useState("");
  const [modelPickerOpen, setModelPickerOpen] = useState(false);
  const [modelActiveIndex, setModelActiveIndex] = useState(0);
  const [modelSearchBusy, setModelSearchBusy] = useState(false);
  const [llmBusy, setLlmBusy] = useState<"loading" | "saving" | "testing" | "models" | null>(null);
  const [llmMessage, setLlmMessage] = useState("");
  const [llmMessageTone, setLlmMessageTone] = useState<"neutral" | "success" | "error">("neutral");
  const [ideaCount, setIdeaCount] = useState(8);
  const [generatingIdeas, setGeneratingIdeas] = useState(false);
  const [lastGeneration, setLastGeneration] = useState<{ provider: string; model: string; count: number } | null>(null);
  const [aiAssistBusy, setAiAssistBusy] = useState<"evaluation" | "evidence" | null>(null);
  const [evaluationNotes, setEvaluationNotes] = useState("");
  const [evaluationDraft, setEvaluationDraft] = useState<EvaluationDraftState | null>(null);
  const [selectedEvaluationClaims, setSelectedEvaluationClaims] = useState<string[]>([]);
  const [evidenceSource, setEvidenceSource] = useState<EvidenceSourceDraft>(emptyEvidenceSourceDraft);
  const [evidenceAnalysis, setEvidenceAnalysis] = useState<EvidenceAnalysisState | null>(null);
  const [selectedEvidenceProposals, setSelectedEvidenceProposals] = useState<number[]>([]);
  const [aiUndo, setAiUndo] = useState<AiUndoState | null>(null);
  const [quickRunPhase, setQuickRunPhase] = useState<QuickRunPhase>("idle");
  const [quickRunMessage, setQuickRunMessage] = useState("");
  const [clearingLocalData, setClearingLocalData] = useState(false);
  const aiAssistRequestRef = useRef(0);
  const generationRequestRef = useRef(0);
  const quickRunRequestRef = useRef(0);
  const modelSearchTimerRef = useRef<number | null>(null);
  const modelSearchRequestRef = useRef(0);
  const modelConfigRequestRef = useRef(0);
  const clearingLocalDataRef = useRef(false);
  const [evidenceDraft, setEvidenceDraft] = useState(emptyManualEvidenceDraft);
  const desktopAvailable = typeof window === "undefined" ? null : window.ideaFoundry?.desktop === true;
  const selectedLlmProvider = LLM_PROVIDERS[llmConfig.provider];
  const llmUsesRemoteEndpoint = !isLoopbackEndpoint(llmConfig.baseUrl);
  const llmSavedKeyAvailable = Boolean(
    persistedLlmConfig.hasApiKey
    && sameCredentialBoundary(llmConfig, persistedLlmConfig)
    && !clearLlmApiKey,
  );
  const llmHasUsableApiKey = Boolean(llmApiKey.trim() || llmSavedKeyAvailable);
  const llmReady = Boolean(llmConfig.model.trim() && (!selectedLlmProvider.keyRequired || llmHasUsableApiKey));
  const quickRunBusy = quickRunPhase === "generating"
    || quickRunPhase === "drafting-evaluation"
    || quickRunPhase === "refreshing-gates"
    || clearingLocalData;
  const modelEditorLocked = clearingLocalData
    || llmBusy !== null
    || generatingIdeas
    || aiAssistBusy !== null
    || quickRunBusy;

  useEffect(() => {
    const bridge = window.ideaFoundry;
    if (!bridge?.desktop) return;

    let cancelled = false;
    const requestId = ++modelConfigRequestRef.current;
    Promise.all([bridge.app.getVersion(), bridge.llm.getConfig()])
      .then(([version, config]) => {
        if (cancelled || requestId !== modelConfigRequestRef.current) return;
        const normalized = normalizeLlmConfig(config);
        setDesktopVersion(version);
        setLlmConfig(normalized);
        setPersistedLlmConfig(normalized);
        setModelSearch(normalized.model);
        setLlmMessage("Connector settings loaded from this computer.");
        setLlmMessageTone("neutral");
      })
      .catch((error: unknown) => {
        if (cancelled || requestId !== modelConfigRequestRef.current) return;
        setLlmMessage(error instanceof Error ? error.message : "Could not load the local connector settings.");
        setLlmMessageTone("error");
      })
      .finally(() => {
        if (!cancelled && requestId === modelConfigRequestRef.current) setLlmBusy(null);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as AppState;
        if (parsed.review?.claims?.length === RUBRIC.length) {
          // Browser storage is an external system; hydration intentionally happens after mount.
          // eslint-disable-next-line react-hooks/set-state-in-effect
          setState({
            ...parsed,
            review: {
              ...parsed.review,
              claims: parsed.review.claims.map((claim) => ({
                ...claim,
                evidenceClaimIds: claim.evidenceClaimIds ?? [],
                evidenceArtifactIds: claim.evidenceArtifactIds ?? [],
                acknowledgedCounterEvidenceIds: claim.acknowledgedCounterEvidenceIds ?? [],
              })),
            },
          });
        }
      } catch {
        localStorage.removeItem(STORAGE_KEY);
      }
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [hydrated, state]);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(""), 2400);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  useEffect(() => () => {
    if (modelSearchTimerRef.current !== null) window.clearTimeout(modelSearchTimerRef.current);
    modelSearchRequestRef.current += 1;
  }, []);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [section, state.started]);

  const score = useMemo(() => scoreReview(state.review), [state.review]);
  const aiUndoAvailable = aiUndo !== null && aiUndo.appliedInputFingerprint === score.inputFingerprint;
  const profileErrors = useMemo(() => validateGenerationProfile(state.profile), [state.profile]);
  const selectedIdea = state.ideas.find((idea) => idea.id === state.project.selectedIdeaId);
  const evaluationSnapshot = useMemo(
    () => evaluationFingerprintFor(selectedIdea, state.project, state.review, evaluationNotes),
    [evaluationNotes, selectedIdea, state.project, state.review],
  );
  const evaluationContext = evaluationSnapshot.context;
  const evaluationContextFingerprint = evaluationSnapshot.fingerprint;
  const evidenceSourceFingerprint = useMemo(
    () => secureFingerprint(JSON.stringify([
      evidenceSource.label.trim(),
      evidenceSource.text,
      score.inputFingerprint,
      state.project.selectedIdeaId,
    ])),
    [evidenceSource.label, evidenceSource.text, score.inputFingerprint, state.project.selectedIdeaId],
  );
  const currentEvidenceVerificationFingerprint = useMemo(() => secureFingerprint(JSON.stringify([
    evidenceSourceFingerprint,
    [...selectedEvidenceProposals].sort((left, right) => left - right),
    selectedEvidenceProposals
      .map((index) => evidenceAnalysis?.result.evidence[index])
      .filter(Boolean),
    evidenceSource.evidenceDate,
    evidenceSource.expiryDate,
    evidenceSource.reviewer.trim(),
    evidenceSource.relationshipOrConflict.trim(),
  ])), [
    evidenceAnalysis,
    evidenceSource.evidenceDate,
    evidenceSource.expiryDate,
    evidenceSource.relationshipOrConflict,
    evidenceSource.reviewer,
    evidenceSourceFingerprint,
    selectedEvidenceProposals,
  ]);
  const evidenceHumanVerificationCurrent = evidenceSource.reviewerVerified
    && evidenceSource.verificationFingerprint === currentEvidenceVerificationFingerprint;
  const selectedEvidenceNeedsVerification = useMemo(() => {
    if (!evidenceAnalysis) return false;
    return selectedEvidenceProposals.some((index) => {
      const proposal = evidenceAnalysis.result.evidence[index];
      return proposal && Math.min(
        EVIDENCE_RANK[proposal.suggestedGrade],
        EVIDENCE_TYPE_MAX_RANK[proposal.suggestedType],
      ) >= EVIDENCE_RANK.E2;
    });
  }, [evidenceAnalysis, selectedEvidenceProposals]);
  const categories = useMemo(
    () => [...new Map(RUBRIC.map((row) => [row.categoryId, row.category])).entries()],
    [],
  );
  const sortedIdeas = useMemo(
    () =>
      [...state.ideas].sort(
        (a, b) =>
          calculateGenerationPriority(state.profile, b.scores) -
          calculateGenerationPriority(state.profile, a.scores),
      ),
    [state.ideas, state.profile],
  );

  const prompt = useMemo(() => {
    const profileContext =
      state.profile.mode === "private"
        ? `PRIVATE SEARCH PROFILE (ranking only; never treat this as market evidence):\nThemes: ${state.profile.searchThemes
            .map((item) => `${item.label} ${item.weight}%`)
            .join(", ")}\nFit dimensions: ${state.profile.fitDimensions
            .map((item) => `${item.label} ${item.weight}%`)
            .join(", ")}`
        : "PROFILE MODE: neutral. Do not infer a founder personality or personal preferences.";
    return `You are generating falsifiable startup/protocol hypotheses for Xahau and Evernode.\n\n${profileContext}\n\nDomain boundary: ${state.project.domain || "Open"}\n\nGenerate 8 diverse candidates. For each return: title, user, buyer, triggering situation, current alternative, material consequence, why Xahau/Evernode is necessary, largest reason it may fail, critical assumption, and a 14-day experiment. Separate observed facts from hypotheses. Do not invent interviews, commitments, payments, benchmarks, or protocol facts. Do not calculate a validated score. Finish by assigning 0-100 exploration estimates for opportunity signal, protocol affordance, experimentability, and${
      state.profile.mode === "private" ? " personal fit" : " omit personal fit"
    }. Output compact JSON suitable for manual entry into Idea Foundry.`;
  }, [state.profile, state.project.domain]);

  const visibleModels = useMemo(() => {
    return searchLlmModels(llmModels, modelSearch, [LLM_PROVIDERS[llmConfig.provider].label, llmConfig.provider]);
  }, [llmConfig.provider, llmModels, modelSearch]);
  const displayedModels = useMemo(() => visibleModels.slice(0, 10), [visibleModels]);

  function updateReview(patch: Partial<ReviewInput>) {
    setState((current) => ({ ...current, review: { ...current.review, ...patch } }));
  }

  function resetAiWorkspace() {
    aiAssistRequestRef.current += 1;
    generationRequestRef.current += 1;
    quickRunRequestRef.current += 1;
    setAiAssistBusy(null);
    setEvaluationNotes("");
    setEvaluationDraft(null);
    setSelectedEvaluationClaims([]);
    setEvidenceSource(emptyEvidenceSourceDraft());
    setEvidenceAnalysis(null);
    setSelectedEvidenceProposals([]);
    setEvidenceDraft(emptyManualEvidenceDraft());
    setAiUndo(null);
    setGeneratingIdeas(false);
    setLastGeneration(null);
    setQuickRunPhase("idle");
    setQuickRunMessage("");
    setLlmApiKey("");
    setClearLlmApiKey(false);
    setMobileMoreOpen(false);
  }

  function resetModelEditor(config: LlmConfig = DEFAULT_LLM_CONFIG) {
    if (modelSearchTimerRef.current !== null) {
      window.clearTimeout(modelSearchTimerRef.current);
      modelSearchTimerRef.current = null;
    }
    modelSearchRequestRef.current += 1;
    modelConfigRequestRef.current += 1;
    setLlmConfig({ ...config });
    setPersistedLlmConfig({ ...config });
    setLlmApiKey("");
    setClearLlmApiKey(false);
    setLlmModels([]);
    setModelSearch(config.model);
    setModelListError("");
    setModelPickerOpen(false);
    setModelActiveIndex(0);
    setModelSearchBusy(false);
    setLlmBusy(null);
    setLlmMessage("");
    setLlmMessageTone("neutral");
  }

  function beginModelEditorChange({ clearRawKey = false, clearCatalog = false }: { clearRawKey?: boolean; clearCatalog?: boolean } = {}) {
    modelConfigRequestRef.current += 1;
    modelSearchRequestRef.current += 1;
    if (modelSearchTimerRef.current !== null) {
      window.clearTimeout(modelSearchTimerRef.current);
      modelSearchTimerRef.current = null;
    }
    setModelSearchBusy(false);
    if (clearCatalog) {
      setLlmModels([]);
      setModelListError("");
      setModelPickerOpen(false);
      setModelSearchBusy(false);
    }
    if (clearRawKey) {
      setLlmApiKey("");
      setClearLlmApiKey(false);
    }
  }

  function clearProjectData() {
    localStorage.removeItem(STORAGE_KEY);
    resetAiWorkspace();
    setImportText("");
    setIncludeProfile(false);
    setState(defaultState());
    setSection("overview");
  }

  async function clearAllLocalData() {
    if (clearingLocalDataRef.current) return;
    if (!window.confirm("Clear this project and forget the saved AI connection and protected API key on this computer?")) return;
    const bridge = window.ideaFoundry;
    clearingLocalDataRef.current = true;
    setClearingLocalData(true);
    try {
      if (modelSearchTimerRef.current !== null) {
        window.clearTimeout(modelSearchTimerRef.current);
        modelSearchTimerRef.current = null;
      }
      aiAssistRequestRef.current += 1;
      generationRequestRef.current += 1;
      quickRunRequestRef.current += 1;
      modelSearchRequestRef.current += 1;
      modelConfigRequestRef.current += 1;
      setAiAssistBusy(null);
      setGeneratingIdeas(false);
      setModelSearchBusy(false);
      setLlmBusy(null);
      setQuickRunPhase("idle");
      setQuickRunMessage("");
      if (bridge?.desktop) await bridge.llm.clearConfig();
    } catch (error) {
      setToast(error instanceof Error ? error.message : "The saved AI connection could not be cleared.");
      clearingLocalDataRef.current = false;
      setClearingLocalData(false);
      return;
    }
    resetModelEditor(DEFAULT_LLM_CONFIG);
    clearProjectData();
    clearingLocalDataRef.current = false;
    setClearingLocalData(false);
  }

  function updateClaim(claimId: string, patch: Partial<ReviewInput["claims"][number]>) {
    updateReview({
      claims: state.review.claims.map((claim) =>
        claim.claimId === claimId ? { ...claim, ...patch } : claim,
      ),
    });
  }

  function updateGate(id: GateAssessment["id"], patch: Partial<GateAssessment>) {
    updateReview({
      gates: state.review.gates.map((gate) => (gate.id === id ? { ...gate, ...patch } : gate)),
    });
  }

  function start(mode: "neutral" | "private") {
    setState((current) => ({ ...current, started: true, profile: emptyProfile(mode) }));
    setSection(mode === "private" ? "profile" : "overview");
  }

  function startWithIdea() {
    start("neutral");
    addIdea();
    setSection("ideas");
  }

  function startQuickFromWelcome() {
    setState((current) => ({ ...current, started: true, profile: emptyProfile("neutral") }));
    void startQuickRun();
  }

  function addIdea() {
    const idea: IdeaCandidate = {
      id: crypto.randomUUID(),
      title: "New candidate",
      concept: "",
      user: "",
      buyer: "",
      currentAlternative: "",
      criticalAssumption: "",
      experiment: "",
      route: "Neither yet",
      scores: { personalFit: 50, opportunitySignal: 50, protocolAffordance: 50, experimentability: 50 },
    };
    setState((current) => ({ ...current, ideas: [...current.ideas, idea] }));
  }

  function updateIdea(id: string, patch: Partial<IdeaCandidate>) {
    setState((current) => ({
      ...current,
      ideas: current.ideas.map((idea) => (idea.id === id ? { ...idea, ...patch } : idea)),
    }));
  }

  function loadStarterSlate() {
    setState((current) => ({ ...current, ideas: starterIdeas() }));
    setToast("Four editable hypotheses added");
  }

  function beginReview(idea: IdeaCandidate) {
    const project = { ...state.project, title: idea.title, selectedIdeaId: idea.id };
    setState((current) => ({
      ...current,
      project,
    }));
    if (quickRunPhase === "choose-idea") {
      void draftQuickRunEvaluation(idea, project, ++quickRunRequestRef.current);
    } else {
      setSection("review");
    }
  }

  function currentLlmInput(): SaveLlmConfigInput {
    return {
      provider: llmConfig.provider,
      baseUrl: llmConfig.baseUrl.trim(),
      model: llmConfig.model.trim(),
      ...(llmApiKey.trim() ? { apiKey: llmApiKey.trim() } : {}),
      ...(clearLlmApiKey ? { clearApiKey: true } : {}),
    };
  }

  async function connectLlm() {
    if (clearingLocalDataRef.current) return;
    const bridge = window.ideaFoundry;
    if (!bridge?.desktop) throw new Error("The model connector is available in the desktop app.");
    const requestId = ++modelConfigRequestRef.current;
    setLlmBusy("saving");
    setLlmMessage("Saving and checking this connection…");
    setLlmMessageTone("neutral");
    try {
      const saved = await bridge.llm.saveConfig(currentLlmInput());
      if (requestId !== modelConfigRequestRef.current) return;
      const normalized = normalizeLlmConfig(saved);
      setLlmConfig(normalized);
      setPersistedLlmConfig(normalized);
      setLlmApiKey("");
      setClearLlmApiKey(false);
      const result = await bridge.llm.testConnection(normalized as LlmConnectionOptions);
      if (requestId !== modelConfigRequestRef.current) return;
      setLlmMessage(result.ok ? `${result.message || "Connection succeeded."} Settings were saved on this computer.` : result.message || "The settings were saved, but the connection failed.");
      setLlmMessageTone(result.ok ? "success" : "error");
    } catch (error) {
      if (requestId !== modelConfigRequestRef.current) return;
      const message = error instanceof Error ? error.message : "Could not connect to this model.";
      setLlmMessage(message);
      setLlmMessageTone("error");
    } finally {
      if (requestId === modelConfigRequestRef.current) setLlmBusy(null);
    }
  }

  async function loadLlmModels({ query = "", background = false, apiKeyOverride }: { query?: string; background?: boolean; apiKeyOverride?: string } = {}) {
    if (clearingLocalDataRef.current) return;
    const bridge = window.ideaFoundry;
    if (!bridge?.desktop) return;
    const requestId = ++modelSearchRequestRef.current;
    if (background) setModelSearchBusy(true);
    else setLlmBusy("models");
    setModelListError("");
    if (!background) {
      setLlmMessage("Reading the models exposed by this endpoint…");
      setLlmMessageTone("neutral");
    }
    try {
      const baseInput = currentLlmInput();
      const input: ListModelsInput = {
        ...baseInput,
        ...(apiKeyOverride?.trim() ? { apiKey: apiKeyOverride.trim(), clearApiKey: false } : {}),
        ...(query.trim() ? { query: query.trim() } : {}),
      };
      const models = await bridge.llm.listModels(input);
      if (requestId !== modelSearchRequestRef.current) return;
      setLlmModels(models);
      setModelActiveIndex(0);
      setModelPickerOpen(true);
      if (!llmConfig.model && models.length === 1) {
        setLlmConfig((current) => ({ ...current, model: models[0].id }));
      }
      if (!background) {
        setLlmMessage(models.length ? `${models.length} model${models.length === 1 ? "" : "s"} available.` : "The endpoint returned no models.");
        setLlmMessageTone(models.length ? "success" : "error");
      }
    } catch (error) {
      if (requestId !== modelSearchRequestRef.current) return;
      setLlmModels([]);
      const message = error instanceof Error ? error.message : "Could not list models.";
      setModelListError(message);
      if (!background) {
        setLlmMessage(message);
        setLlmMessageTone("error");
      }
    } finally {
      if (requestId === modelSearchRequestRef.current) {
        if (background) setModelSearchBusy(false);
        else setLlmBusy(null);
      }
    }
  }

  function refreshLlmModels() {
    void loadLlmModels();
  }

  function queueModelSearch(value: string, apiKeyOverride = llmApiKey) {
    setModelSearch(value);
    setModelPickerOpen(true);
    setModelActiveIndex(0);
    setModelListError("");
    if (modelSearchTimerRef.current !== null) window.clearTimeout(modelSearchTimerRef.current);
    modelSearchRequestRef.current += 1;

    if (llmConfig.provider !== "openrouter") {
      if (llmModels.length === 0) void loadLlmModels({ background: true });
      return;
    }

    if (!value.trim()) {
      setLlmModels([]);
      setModelSearchBusy(false);
      return;
    }
    if (!(apiKeyOverride.trim() || llmSavedKeyAvailable)) {
      setLlmModels([]);
      setModelSearchBusy(false);
      setModelListError("Enter your OpenRouter API key first, then type a model name or version.");
      return;
    }

    setLlmModels([]);
    setModelSearchBusy(true);
    modelSearchTimerRef.current = window.setTimeout(() => {
      void loadLlmModels({ query: value, background: true, apiKeyOverride });
    }, 250);
  }

  function openModelPicker() {
    setModelPickerOpen(true);
    if (llmConfig.provider === "openrouter") {
      if (modelSearch.trim()) queueModelSearch(modelSearch);
      return;
    }
    if (llmModels.length === 0 && !modelSearchBusy) void loadLlmModels({ background: true });
  }

  function selectLlmModel(model: { id: string; name: string }) {
    if (modelSearchTimerRef.current !== null) window.clearTimeout(modelSearchTimerRef.current);
    modelSearchRequestRef.current += 1;
    beginModelEditorChange();
    setLlmConfig((current) => ({ ...current, model: model.id }));
    setModelSearch(model.name || model.id);
    setModelSearchBusy(false);
    setModelPickerOpen(false);
    setModelActiveIndex(0);
  }

  async function generateWithConnectedLlm() {
    if (clearingLocalDataRef.current) return;
    const bridge = window.ideaFoundry;
    if (!bridge?.desktop) {
      setSection("model");
      return;
    }
    if (!llmConfig.model.trim()) {
      setLlmMessage("Choose or enter a model before generating ideas.");
      setLlmMessageTone("error");
      setSection("model");
      return;
    }
    if (selectedLlmProvider.keyRequired && !llmHasUsableApiKey) {
      setLlmMessage("Enter an OpenRouter API key before generating ideas.");
      setLlmMessageTone("error");
      setSection("model");
      return;
    }

    const requestId = ++generationRequestRef.current;
    setGeneratingIdeas(true);
    try {
      const saved = normalizeLlmConfig(await bridge.llm.saveConfig(currentLlmInput()));
      if (requestId !== generationRequestRef.current) return;
      setLlmConfig(saved);
      setPersistedLlmConfig(saved);
      setLlmApiKey("");
      setClearLlmApiKey(false);
      const generationPrompt = prompt.replace("Generate 8 diverse candidates", `Generate ${ideaCount} diverse candidates`);
      const result = await bridge.llm.generateIdeas({
        prompt: generationPrompt,
        count: ideaCount,
        provider: saved.provider,
        baseUrl: saved.baseUrl,
        model: saved.model,
      });
      if (requestId !== generationRequestRef.current) return;
      const candidates = generatedCandidatesFromResult(result, state.profile.mode === "private");
      if (candidates.length === 0) throw new Error("The model returned no ideas that passed the local schema.");
      setState((current) => ({ ...current, ideas: [...current.ideas, ...candidates] }));
      setLastGeneration({ provider: result.provider, model: result.model, count: candidates.length });
      setToast(`${candidates.length} AI hypotheses added`);
    } catch (error) {
      if (requestId !== generationRequestRef.current) return;
      setLlmMessage(error instanceof Error ? error.message : "Idea generation failed.");
      setLlmMessageTone("error");
      setSection("model");
    } finally {
      if (requestId === generationRequestRef.current) setGeneratingIdeas(false);
    }
  }

  async function startQuickRun() {
    if (clearingLocalDataRef.current) return;
    if (desktopAvailable !== true || !llmReady) {
      setQuickRunPhase("idle");
      setLlmMessage("Connect a model, then return Home and start Quick Run.");
      setLlmMessageTone("neutral");
      setSection("model");
      return;
    }

    const runId = ++quickRunRequestRef.current;
    setQuickRunMessage("");
    if (selectedIdea) {
      await draftQuickRunEvaluation(selectedIdea, state.project, runId);
      return;
    }
    if (state.ideas.length > 0) {
      setQuickRunPhase("choose-idea");
      setQuickRunMessage("Choose the idea you want to test. The first card is the top exploration match, not a final recommendation.");
      setSection("ideas");
      return;
    }

    setQuickRunPhase("generating");
    setQuickRunMessage("Creating four editable hypotheses. Nothing generated here counts as evidence.");
    setSection("quick");
    try {
      const connection = await saveAiConnectionOrOpenSettings();
      if (!connection || runId !== quickRunRequestRef.current) {
        if (runId === quickRunRequestRef.current) setQuickRunPhase("idle");
        return;
      }
      if (!confirmRemoteQuickRunSend(
        connection.saved,
        state.profile.mode === "private"
          ? "your project boundary and private generation profile"
          : "your project boundary and the generation prompt",
      )) {
        setQuickRunPhase("idle");
        setQuickRunMessage("");
        setSection("overview");
        return;
      }
      const generationPrompt = prompt.replace("Generate 8 diverse candidates", "Generate 4 diverse candidates");
      const result = await connection.bridge.llm.generateIdeas({
        prompt: generationPrompt,
        count: 4,
        provider: connection.saved.provider,
        baseUrl: connection.saved.baseUrl,
        model: connection.saved.model,
      });
      if (runId !== quickRunRequestRef.current) return;
      const candidates = generatedCandidatesFromResult(result, state.profile.mode === "private");
      if (candidates.length === 0) throw new Error("The model returned no ideas that passed the local schema.");
      setState((current) => ({ ...current, ideas: [...current.ideas, ...candidates] }));
      setLastGeneration({ provider: result.provider, model: result.model, count: candidates.length });
      setQuickRunPhase("choose-idea");
      setQuickRunMessage("Choose one hypothesis to continue. Idea Foundry will not choose a business direction for you.");
      setSection("ideas");
    } catch (error) {
      if (runId !== quickRunRequestRef.current) return;
      setQuickRunPhase("idle");
      setLlmMessage(error instanceof Error ? error.message : "Quick Run could not generate an idea slate.");
      setLlmMessageTone("error");
      setSection("model");
    }
  }

  async function draftQuickRunEvaluation(
    idea: IdeaCandidate,
    projectSnapshot: ProjectDetails,
    existingRunId?: number,
  ) {
    const runId = existingRunId ?? ++quickRunRequestRef.current;
    const claimIds = state.review.claims.filter((claim) => claim.merit === null).map((claim) => claim.claimId);
    if (claimIds.length === 0) {
      setQuickRunPhase("evidence");
      setQuickRunMessage(state.review.artifacts.length
        ? "Add another real source if needed, or continue with the evidence already attached."
        : "Add real source material, or continue with an evidence-free provisional baseline.");
      setSection("evidence");
      return;
    }
    setQuickRunPhase("drafting-evaluation");
    setQuickRunMessage("Drafting provisional merit and gate recommendations. No review inputs are changing.");
    setSection("quick");
    try {
      const connection = await saveAiConnectionOrOpenSettings();
      if (!connection || runId !== quickRunRequestRef.current) {
        if (runId === quickRunRequestRef.current) setQuickRunPhase("idle");
        return;
      }
      if (!confirmRemoteQuickRunSend(
        connection.saved,
        "the selected idea, current review notes, and up to 12 exact stored evidence excerpts",
      )) {
        setQuickRunPhase("choose-idea");
        setQuickRunMessage("Choose an idea when you are ready to send its review context to the cloud model.");
        setSection("ideas");
        return;
      }
      const snapshot = evaluationFingerprintFor(idea, projectSnapshot, state.review, evaluationNotes);
      const result = await connection.bridge.llm.draftEvaluation({
        provider: connection.saved.provider,
        baseUrl: connection.saved.baseUrl,
        model: connection.saved.model,
        projectContext: snapshot.context,
        claimIds,
        scope: "claims_and_gates",
      });
      if (runId !== quickRunRequestRef.current) return;
      setEvaluationDraft({
        result,
        contextFingerprint: snapshot.fingerprint,
        gateFingerprints: Object.fromEntries(
          state.review.gates.map((gate) => [gate.id, gateStateFingerprint(gate)]),
        ) as Record<GateAssessment["id"], string>,
        createdAt: new Date().toISOString(),
      });
      setSelectedEvaluationClaims([]);
      setQuickRunPhase("approve-evaluation");
      setQuickRunMessage("Review and explicitly apply only the merit drafts you agree with. Evidence remains E0.");
      setSection("review");
    } catch (error) {
      if (runId !== quickRunRequestRef.current) return;
      setQuickRunPhase("idle");
      setLlmMessage(error instanceof Error ? error.message : "Quick Run could not draft the evaluation.");
      setLlmMessageTone("error");
      setSection("model");
    }
  }

  async function refreshQuickRunGates(reviewSnapshot: ReviewInput = state.review) {
    const idea = state.ideas.find((candidate) => candidate.id === state.project.selectedIdeaId);
    if (!idea) {
      setQuickRunPhase("choose-idea");
      setSection("ideas");
      return;
    }
    const runId = ++quickRunRequestRef.current;
    setQuickRunPhase("refreshing-gates");
    setQuickRunMessage("Refreshing gate recommendations against the current evidence. Existing claim ratings will not be touched.");
    setSection("quick");
    try {
      const connection = await saveAiConnectionOrOpenSettings();
      if (!connection || runId !== quickRunRequestRef.current) {
        if (runId === quickRunRequestRef.current) setQuickRunPhase("idle");
        return;
      }
      if (!confirmRemoteQuickRunSend(
        connection.saved,
        "the selected idea, current review notes, and up to 12 exact stored evidence excerpts",
      )) {
        setQuickRunPhase("evidence");
        setQuickRunMessage("Nothing was sent. Continue when you are ready, or exit Quick Run.");
        setSection("evidence");
        return;
      }
      const snapshot = evaluationFingerprintFor(idea, state.project, reviewSnapshot, evaluationNotes);
      const result = await connection.bridge.llm.draftEvaluation({
        provider: connection.saved.provider,
        baseUrl: connection.saved.baseUrl,
        model: connection.saved.model,
        projectContext: snapshot.context,
        claimIds: [],
        scope: "gates_only",
      });
      if (runId !== quickRunRequestRef.current) return;
      setEvaluationDraft({
        result,
        contextFingerprint: snapshot.fingerprint,
        gateFingerprints: Object.fromEntries(
          reviewSnapshot.gates.map((gate) => [gate.id, gateStateFingerprint(gate)]),
        ) as Record<GateAssessment["id"], string>,
        createdAt: new Date().toISOString(),
      });
      setSelectedEvaluationClaims([]);
      setQuickRunPhase("approve-gates");
      setQuickRunMessage("Apply each gate separately, or leave it unresolved. AI cannot make a gate decision for you.");
      setSection("review");
    } catch (error) {
      if (runId !== quickRunRequestRef.current) return;
      setQuickRunPhase("idle");
      setLlmMessage(error instanceof Error ? error.message : "Quick Run could not refresh the gates.");
      setLlmMessageTone("error");
      setSection("model");
    }
  }

  function continueQuickRun() {
    if (quickRunPhase === "choose-idea") setSection("ideas");
    if (quickRunPhase === "approve-evaluation") {
      setQuickRunPhase("evidence");
      setQuickRunMessage("Add real source material, or continue with an evidence-free provisional baseline.");
      setSection("evidence");
    }
    if (quickRunPhase === "evidence") void refreshQuickRunGates();
    if (quickRunPhase === "approve-gates") {
      setQuickRunPhase("decision");
      setQuickRunMessage("The deterministic calculator produced this result. AI did not choose or calculate the outcome.");
      setSection("results");
    }
    if (quickRunPhase === "decision") setSection("results");
  }

  function exitQuickRun() {
    quickRunRequestRef.current += 1;
    setQuickRunPhase("idle");
    setQuickRunMessage("");
    if (section === "quick") setSection("overview");
  }

  async function saveAiConnectionOrOpenSettings() {
    if (clearingLocalDataRef.current) return null;
    const bridge = window.ideaFoundry;
    if (!bridge?.desktop) {
      setSection("model");
      return null;
    }
    if (!llmConfig.model.trim() || (selectedLlmProvider.keyRequired && !llmHasUsableApiKey)) {
      setLlmMessage("Connect a model before using AI assistance.");
      setLlmMessageTone("error");
      setSection("model");
      return null;
    }
    const configRequestId = modelConfigRequestRef.current;
    const saved = normalizeLlmConfig(await bridge.llm.saveConfig(currentLlmInput()));
    if (configRequestId !== modelConfigRequestRef.current) return null;
    setLlmConfig(saved);
    setPersistedLlmConfig(saved);
    setLlmApiKey("");
    setClearLlmApiKey(false);
    return { bridge, saved };
  }

  async function draftEvaluationWithAi() {
    if (!selectedIdea) {
      setToast("Choose an idea before drafting an evaluation");
      setSection("ideas");
      return;
    }
    const claimIds = state.review.claims.filter((claim) => claim.merit === null).map((claim) => claim.claimId);
    if (claimIds.length === 0) {
      setToast("Every claim already has a merit rating");
      return;
    }
    const requestId = ++aiAssistRequestRef.current;
    setAiAssistBusy("evaluation");
    try {
      const connection = await saveAiConnectionOrOpenSettings();
      if (!connection) return;
      const result = await connection.bridge.llm.draftEvaluation({
        provider: connection.saved.provider,
        baseUrl: connection.saved.baseUrl,
        model: connection.saved.model,
        projectContext: evaluationContext,
        claimIds,
      });
      if (requestId !== aiAssistRequestRef.current) return;
      setEvaluationDraft({
        result,
        contextFingerprint: evaluationContextFingerprint,
        gateFingerprints: Object.fromEntries(
          state.review.gates.map((gate) => [gate.id, gateStateFingerprint(gate)]),
        ) as Record<GateAssessment["id"], string>,
        createdAt: new Date().toISOString(),
      });
      setSelectedEvaluationClaims([]);
      setToast(`${result.claims.length} claim drafts ready for review`);
    } catch (error) {
      if (requestId !== aiAssistRequestRef.current) return;
      const message = error instanceof Error ? error.message : "The model could not draft this evaluation.";
      setLlmMessage(message);
      setLlmMessageTone("error");
      setToast("Evaluation draft failed — no review data changed");
    } finally {
      if (requestId === aiAssistRequestRef.current) setAiAssistBusy(null);
    }
  }

  async function organizeEvidenceWithAi() {
    if (!evidenceSource.label.trim()) {
      setToast("Name the source before organizing it");
      return;
    }
    if (evidenceSource.text.trim().length < 20) {
      setToast("Paste the actual source text — a URL or title is not evidence");
      return;
    }
    const requestId = ++aiAssistRequestRef.current;
    setAiAssistBusy("evidence");
    try {
      const connection = await saveAiConnectionOrOpenSettings();
      if (!connection) return;
      const result = await connection.bridge.llm.extractEvidence({
        provider: connection.saved.provider,
        baseUrl: connection.saved.baseUrl,
        model: connection.saved.model,
        sourceText: evidenceSource.text,
        sourceLabel: modelSafeSourceLabel(evidenceSource.label),
      });
      if (requestId !== aiAssistRequestRef.current) return;
      setEvidenceAnalysis({
        result,
        sourceFingerprint: evidenceSourceFingerprint,
        createdAt: new Date().toISOString(),
      });
      setSelectedEvidenceProposals([]);
      setToast(`${result.evidence.length} evidence draft${result.evidence.length === 1 ? "" : "s"} ready for review`);
    } catch (error) {
      if (requestId !== aiAssistRequestRef.current) return;
      const message = error instanceof Error ? error.message : "The model could not organize this evidence.";
      setLlmMessage(message);
      setLlmMessageTone("error");
      setToast("Evidence analysis failed — no ledger data changed");
    } finally {
      if (requestId === aiAssistRequestRef.current) setAiAssistBusy(null);
    }
  }

  function updateEvaluationProposal(claimId: string, patch: Partial<DraftEvaluationResult["claims"][number]>) {
    setEvaluationDraft((current) => current ? {
      ...current,
      result: {
        ...current.result,
        claims: current.result.claims.map((proposal) => proposal.claimId === claimId ? { ...proposal, ...patch } : proposal),
      },
    } : current);
  }

  function updateEvidenceProposal(index: number, patch: Partial<EvidenceProposal>) {
    setEvidenceAnalysis((current) => current ? {
      ...current,
      result: {
        ...current.result,
        evidence: current.result.evidence.map((proposal, proposalIndex) => proposalIndex === index ? { ...proposal, ...patch } : proposal),
      },
    } : current);
  }

  function applySelectedEvaluation() {
    if (!evaluationDraft || selectedEvaluationClaims.length === 0) {
      setToast("Select at least one claim recommendation first");
      return;
    }
    if (evaluationDraft.contextFingerprint !== evaluationContextFingerprint) {
      setToast("This draft is stale. Generate a new evaluation draft first.");
      return;
    }
    try {
      const result = applyEvaluationProposals({
        review: state.review,
        draft: evaluationDraft.result,
        selectedClaimIds: selectedEvaluationClaims,
        expectedContextFingerprint: evaluationDraft.contextFingerprint,
        currentContextFingerprint: evaluationContextFingerprint,
      });
      setState((current) => ({ ...current, review: result.review }));
      setAiUndo({
        label: "AI claim recommendations",
        review: result.previousReview,
        appliedInputFingerprint: scoreReview(result.review).inputFingerprint,
      });
      setSelectedEvaluationClaims([]);
      setToast(`${result.appliedClaimIds.length} merit recommendation${result.appliedClaimIds.length === 1 ? "" : "s"} applied; evidence grades unchanged`);
      if (quickRunPhase === "approve-evaluation") {
        setQuickRunPhase("evidence");
        setQuickRunMessage("Add real source material, or continue with an evidence-free provisional baseline.");
        setSection("evidence");
      }
    } catch (error) {
      setToast(error instanceof Error ? error.message : "The selected recommendations could not be applied.");
    }
  }

  function applySelectedEvidence() {
    if (!evidenceAnalysis || selectedEvidenceProposals.length === 0) {
      setToast("Select at least one grounded evidence draft first");
      return;
    }
    try {
      const linkSupportingProposalIndexes = evidenceSource.updateClaimGrades
        ? selectedEvidenceProposals.filter((index) => evidenceAnalysis.result.evidence[index]?.direction === "supports")
        : [];
      const result = applyEvidenceProposals({
        review: state.review,
        draft: evidenceAnalysis.result,
        selectedProposalIndexes: selectedEvidenceProposals,
        linkSupportingProposalIndexes,
        sourceText: evidenceSource.text,
        sourceLabel: evidenceSource.label,
        humanApproval: {
          reviewerVerified: evidenceHumanVerificationCurrent,
          reviewer: evidenceSource.reviewer,
          relationshipOrConflict: evidenceSource.relationshipOrConflict,
          evidenceDate: evidenceSource.evidenceDate,
          expiryDate: evidenceSource.expiryDate,
        },
        expectedContextFingerprint: evidenceAnalysis.sourceFingerprint,
        currentContextFingerprint: evidenceSourceFingerprint,
      });
      setState((current) => ({ ...current, review: result.review }));
      setAiUndo({
        label: `${result.artifacts.length} AI-organized evidence record${result.artifacts.length === 1 ? "" : "s"}`,
        review: result.previousReview,
        appliedInputFingerprint: scoreReview(result.review).inputFingerprint,
      });
      setSelectedEvidenceProposals([]);
      setEvidenceAnalysis(null);
      setEvidenceSource((current) => ({
        ...current,
        label: "",
        text: "",
        evidenceDate: "",
        expiryDate: "",
        reviewerVerified: false,
        verificationFingerprint: "",
        updateClaimGrades: false,
      }));
      const linked = result.linkedClaimIds.length ? `; ${result.linkedClaimIds.length} supporting claim${result.linkedClaimIds.length === 1 ? "" : "s"} updated` : "";
      setToast(`${result.artifacts.length} grounded record${result.artifacts.length === 1 ? "" : "s"} added${linked}`);
      if (quickRunPhase === "evidence") {
        if (llmUsesRemoteEndpoint) {
          setQuickRunMessage("Evidence added. Choose Send & refresh gates when you are ready to share the current review excerpts with the cloud model.");
          setSection("evidence");
        } else {
          void refreshQuickRunGates(result.review);
        }
      }
    } catch (error) {
      setToast(error instanceof Error ? error.message : "The selected evidence could not be added.");
    }
  }

  function applyGateProposal(gateId: GateAssessment["id"]) {
    const proposal = evaluationDraft?.result.gates.find((item) => item.gateId === gateId);
    if (!evaluationDraft || !proposal) return;
    if (evaluationDraft.contextFingerprint !== evaluationContextFingerprint) {
      setToast("This draft is stale. Generate a new evaluation draft first.");
      return;
    }
    const currentGate = state.review.gates.find((gate) => gate.id === gateId);
    if (!currentGate || evaluationDraft.gateFingerprints[gateId] !== gateStateFingerprint(currentGate)) {
      setToast(`${gateId} changed after this draft. Generate a fresh recommendation before applying it.`);
      return;
    }
    if (!window.confirm(
      `Apply the AI draft status “${proposal.suggestedStatus}” to ${gateId}? Gate decisions are non-compensable and remain your responsibility.`,
    )) return;
    const nextReview: ReviewInput = {
      ...state.review,
      gates: state.review.gates.map((gate) => gate.id === gateId ? {
        ...gate,
        status: proposal.suggestedStatus,
        rationale: `[AI draft applied by reviewer · ${evaluationDraft.result.provider}/${evaluationDraft.result.model}] ${proposal.reasoning}${proposal.uncertainty ? ` Uncertainty: ${proposal.uncertainty}` : ""}`,
      } : gate),
    };
    setAiUndo({
      label: `${gateId} gate recommendation`,
      review: structuredClone(state.review),
      appliedInputFingerprint: scoreReview(nextReview).inputFingerprint,
    });
    setState((current) => ({ ...current, review: nextReview }));
    setToast(`${gateId} recommendation applied; other gates were unchanged`);
  }

  function undoLastAiApproval() {
    if (!aiUndo || !aiUndoAvailable) {
      setAiUndo(null);
      setToast("Undo expired because the review changed afterward");
      return;
    }
    setState((current) => ({ ...current, review: structuredClone(aiUndo.review) }));
    setToast(`Undid ${aiUndo.label}`);
    setAiUndo(null);
  }

  function addEvidence() {
    if (!evidenceDraft.title.trim()) {
      setToast("Give the evidence a title first");
      return;
    }
    if (EVIDENCE_RANK[evidenceDraft.grade] > EVIDENCE_TYPE_MAX_RANK[evidenceDraft.evidenceType]) {
      setToast(`${evidenceDraft.evidenceType} cannot support ${evidenceDraft.grade}`);
      return;
    }
    setState((current) => {
      const suffix = nextEvidenceSuffix(current.review.artifacts);
      const artifact: EvidenceArtifact = {
        artifactId: `A-${suffix}`,
        evidenceClaimId: `EC-${suffix}`,
        title: evidenceDraft.title.trim(),
        rubricClaimIds: [evidenceDraft.claimId],
        sourceFamilyId: `SF-${suffix}`,
        observationId: `OBS-${suffix}`,
        duplicateOf: "",
        reviewerVerified: evidenceDraft.reviewerVerified,
        reviewer: evidenceDraft.reviewer,
        relationshipOrConflict: evidenceDraft.relationshipOrConflict,
        evidenceType: evidenceDraft.evidenceType,
        evidenceDate: evidenceDraft.evidenceDate,
        expiryDate: evidenceDraft.expiryDate,
        grade: evidenceDraft.grade,
        direction: evidenceDraft.direction,
      };
      return {
        ...current,
        review: {
          ...current.review,
          artifacts: [...current.review.artifacts, artifact],
          claims: artifact.direction === "supports"
            ? current.review.claims.map((claim) => claim.claimId === artifact.rubricClaimIds[0] ? {
              ...claim,
              grade: EVIDENCE_RANK[artifact.grade] > EVIDENCE_RANK[claim.grade] ? artifact.grade : claim.grade,
              evidenceClaimIds: [...new Set([...claim.evidenceClaimIds, artifact.evidenceClaimId])],
              evidenceArtifactIds: [...new Set([...claim.evidenceArtifactIds, artifact.artifactId])],
            } : claim)
            : current.review.claims,
        },
      };
    });
    setEvidenceDraft((current) => ({ ...current, title: "" }));
    setToast("Evidence added; deterministic validation reran");
  }

  function acknowledgeEvidence(artifact: EvidenceArtifact) {
    updateReview({
      claims: state.review.claims.map((claim) =>
        artifact.rubricClaimIds.includes(claim.claimId)
          ? {
              ...claim,
              acknowledgedCounterEvidenceIds: [
                ...new Set([...(claim.acknowledgedCounterEvidenceIds ?? []), artifact.evidenceClaimId]),
              ],
            }
          : claim,
      ),
    });
    setToast("Counterevidence acknowledged");
  }

  function removeEvidence(artifact: EvidenceArtifact) {
    updateReview({
      artifacts: state.review.artifacts.filter((item) => item.artifactId !== artifact.artifactId),
      claims: state.review.claims.map((claim) => {
        const evidenceClaimIds = (claim.evidenceClaimIds ?? []).filter((id) => id !== artifact.evidenceClaimId);
        const evidenceArtifactIds = (claim.evidenceArtifactIds ?? []).filter((id) => id !== artifact.artifactId);
        return {
          ...claim,
          evidenceClaimIds,
          evidenceArtifactIds,
          grade: claim.grade !== "E0" && evidenceClaimIds.length === 0 ? "E0" : claim.grade,
          acknowledgedCounterEvidenceIds: (claim.acknowledgedCounterEvidenceIds ?? []).filter(
            (id) => id !== artifact.evidenceClaimId,
          ),
        };
      }),
    });
  }

  function exportPacket() {
    const packet = {
      manifest: {
        product: "Idea Foundry — Xahau + Evernode",
        frameworkVersion: FRAMEWORK_VERSION,
        engineVersion: ENGINE_VERSION,
        rubricManifestSha256: score.rubricManifestSha256,
        exportedAt: new Date().toISOString(),
        privateProfileIncluded: includeProfile,
      },
      project: state.project,
      ideas: state.ideas,
      review: state.review,
      computed: score,
      ...(includeProfile ? { profile: state.profile } : {}),
    };
    downloadFile("idea-foundry-review.json", JSON.stringify(packet, null, 2), "application/json");
  }

  function exportScorecard() {
    const header = ["category_id", "claim_id", "claim", "weight", "merit", "grade", "raw_points", "validated_points"];
    const rows = score.claimResults.map((claim) =>
      [claim.categoryId, claim.claimId, claim.atomicClaim, claim.weight, claim.rawMerit, claim.evidence, claim.rawPoints, claim.validatedPoints]
        .map(csvCell)
        .join(","),
    );
    downloadFile("idea-foundry-scorecard.csv", [header.join(","), ...rows].join("\n"), "text/csv");
  }

  function importPacket() {
    try {
      const parsed = JSON.parse(importText) as Partial<AppState> & { review?: ReviewInput; profile?: GenerationProfile };
      if (!parsed.review || !Array.isArray(parsed.review.claims)) throw new Error("Missing review");
      resetAiWorkspace();
      setState((current) => ({
        ...current,
        started: true,
        project: parsed.project ?? current.project,
        ideas: parsed.ideas ?? current.ideas,
        review: parsed.review as ReviewInput,
        profile: parsed.profile ?? current.profile,
      }));
      setSection("results");
      setImportText("");
      setToast("Review imported and recalculated locally");
    } catch {
      setToast("That is not a valid Idea Foundry review packet");
    }
  }

  async function copyText(text: string, confirmation: string) {
    await navigator.clipboard.writeText(text);
    setToast(confirmation);
  }

  if (!state.started) {
    return (
      <main className="start-page">
        <header className="start-header">
          <Brand />
          <span className="privacy-pill"><span aria-hidden="true">●</span> Local-only</span>
        </header>
        <section className="hero">
          <div className="hero-copy">
            <p className="eyebrow">Xahau + Evernode idea validation</p>
            <h1>Find the idea worth disproving.</h1>
            <p className="hero-lede">Turn a blank page into useful ideas, choose one, and see what real evidence actually supports.</p>
            <div className="hero-actions">
              <button className="button primary" onClick={() => start("neutral")}>Start a project <span aria-hidden="true">→</span></button>
              <button className="button secondary" onClick={startQuickFromWelcome}>Quick Run</button>
              <button className="button secondary" onClick={() => start("private")}>Personalize my ideas</button>
              <button className="button ghost" onClick={startWithIdea}>I already have an idea</button>
            </div>
            <p className="trust-line">No account · Saved on this device · Nothing is shared automatically</p>
            <div className="method-strip" aria-label="Method">
              {[["01", "Generate candidates"], ["02", "Challenge assumptions"], ["03", "Attach evidence"], ["04", "Calculate readiness"]].map(([number, label]) => (
                <div key={number}><span>{number}</span><strong>{label}</strong></div>
              ))}
            </div>
          </div>
          <aside className="specimen" aria-label="Illustrative result specimen">
            <img className="specimen-mark" src={BRAND_MARK_URL} alt="" aria-hidden="true" />
            <div className="specimen-head"><span>Review specimen</span><span className="provisional-dot">Illustrative</span></div>
            <div className="specimen-score"><span>Evidence-adjusted</span><strong>64.5</strong><small>/ 100</small></div>
            <div className="paired-bar"><i style={{ width: "82%" }} /><b style={{ width: "64.5%" }} /></div>
            <div className="specimen-grid">
              <div><strong>51</strong><span>atomic claims</span></div>
              <div><strong>8</strong><span>non-compensable gates</span></div>
              <div><strong>4</strong><span>separate metrics</span></div>
              <div><strong>12</strong><span>review categories</span></div>
            </div>
            <div className="instrument-note"><span>Rules engine</span><code>{ENGINE_VERSION}</code></div>
          </aside>
        </section>
        <footer className="start-footer"><span>Open-source methodology</span><span>Deterministic calculation</span><span>Profile-separated scoring</span></footer>
      </main>
    );
  }

  const primaryNavigation: Array<{ id: Section; label: string; meta?: string }> = [
    { id: "overview", label: "Home" },
    { id: "ideas", label: "Ideas", meta: String(state.ideas.length) },
    { id: "review", label: "Evaluate", meta: `${score.assessedClaims}/${score.totalClaims}` },
    { id: "evidence", label: "Evidence", meta: String(state.review.artifacts.length) },
    { id: "results", label: "Decision", meta: score.numericEligible && score.gateEligible ? "✓" : "!" },
  ];
  const utilityNavigation: Array<{ id: Section; label: string; meta?: string }> = [
    { id: "profile", label: "Personalize ideas", meta: state.profile.mode === "private" ? (profileErrors.length ? "!" : "P") : "N" },
    { id: "model", label: "AI model", meta: desktopAvailable && llmReady ? "✓" : "—" },
    { id: "export", label: "Import & export" },
  ];

  return (
    <main className="app-shell">
      <header className="app-header">
        <Brand compact />
        <div className="project-heading">
          <span>Current review</span>
          <input
            aria-label="Project title"
            value={state.project.title}
            onChange={(event) => setState((current) => ({ ...current, project: { ...current.project, title: event.target.value } }))}
          />
        </div>
        <div className="header-status"><span className="saved-dot" /> Saved locally</div>
      </header>

      <aside className="side-rail">
        <nav aria-label="Workspace">
          {primaryNavigation.map((item) => (
            <button key={item.id} className={section === item.id ? "active" : ""} onClick={() => setSection(item.id)}>
              <span className="nav-mark" aria-hidden="true" />
              <span>{item.label}</span>
              {item.meta && <small>{item.meta}</small>}
            </button>
          ))}
        </nav>
        <details className="rail-tools" open={utilityNavigation.some((item) => item.id === section) || undefined}>
          <summary>Settings & data</summary>
          <nav aria-label="Settings and data">
            {utilityNavigation.map((item) => (
              <button key={item.id} className={section === item.id ? "active" : ""} onClick={() => setSection(item.id)}>
                <span className="nav-mark" aria-hidden="true" />
                <span>{item.label}</span>
                {item.meta && <small>{item.meta}</small>}
              </button>
            ))}
          </nav>
        </details>
        <div className="rail-footer">
          <div><span>Privacy</span><strong>{state.profile.mode === "private" ? "Private profile" : "Profile-neutral"}</strong></div>
          <div><span>Rubric</span><strong>v3 · 51 claims</strong></div>
          <div className="rail-clear-actions">
            <button className="text-button danger" disabled={clearingLocalData} onClick={() => {
              if (window.confirm("Clear this project? Your saved AI connection will be kept.")) clearProjectData();
            }}>Clear project</button>
            <button className="text-button danger" disabled={clearingLocalData} onClick={() => void clearAllLocalData()}>{clearingLocalData ? "Clearing…" : "Clear everything"}</button>
          </div>
        </div>
      </aside>

      <section className="workspace">
        {quickRunPhase !== "idle" && section !== "quick" && (
          <QuickRunGuide
            phase={quickRunPhase}
            message={quickRunMessage}
            hasEvidence={state.review.artifacts.length > 0}
            remoteModel={llmUsesRemoteEndpoint}
            onContinue={continueQuickRun}
            onExit={exitQuickRun}
          />
        )}
        {section === "overview" && (
          <Overview
            state={state}
            score={score}
            selectedIdea={selectedIdea}
            desktopAvailable={desktopAvailable === true}
            llmReady={llmReady}
            quickRunBusy={quickRunBusy}
            onQuickRun={() => void startQuickRun()}
            onNavigate={setSection}
            onUpdateProject={(patch) => setState((current) => ({ ...current, project: { ...current.project, ...patch } }))}
          />
        )}

        {section === "quick" && (
          <div className="page-section narrow quick-run-page">
            <PageHeading eyebrow="Quick Run" title="AI drafts the work. You approve what counts." description="Quick Run automates safe setup and pauses for idea choice, merit approval, real evidence, and every gate decision." />
            <section className="quick-run-working" aria-live="polite">
              <img src={BRAND_ICON_URL} alt="" aria-hidden="true" />
              <div><span>{quickRunBusy ? "Working" : "Ready"}</span><h2>{quickRunMessage || "Preparing the next checkpoint."}</h2><p>Idea → Evaluation → Evidence → Gates → Decision</p></div>
              {quickRunBusy && <i aria-hidden="true" />}
            </section>
            <div className="quick-run-boundary"><strong>Quick does not mean automatic approval.</strong><span>No idea, merit rating, evidence record, gate, or final decision is accepted without your action.</span></div>
            <button className="button secondary" onClick={exitQuickRun}>Exit Quick Run</button>
          </div>
        )}

        {section === "ideas" && (
          <div className="page-section">
            <PageHeading eyebrow="Ideas" title="Find a useful idea to test." description="Generate a slate, try examples, or add your own. You can edit everything before choosing one to evaluate." />
            {quickRunPhase === "choose-idea" && <div className="quick-run-checkpoint"><strong>Quick Run checkpoint · Choose the direction</strong><span>{quickRunMessage}</span><button className="text-button" onClick={exitQuickRun}>Use manual flow</button></div>}
            <div className="idea-start-card">
              <div>
                <p className="eyebrow">Choose a starting point</p>
                <h2>{desktopAvailable && llmReady ? "Generate a fresh idea slate" : "How would you like to begin?"}</h2>
                <p>{state.profile.mode === "private" ? "Your private profile shapes idea ranking only. It never changes evidence or the final score." : "Start neutral now. Personalization is optional and never changes the evidence score."}</p>
              </div>
              <div className="idea-start-actions">
                {desktopAvailable && llmReady ? (
                  <button className="button primary" disabled={generatingIdeas} onClick={generateWithConnectedLlm}>{generatingIdeas ? "Generating ideas…" : `Generate ${ideaCount} ideas`}</button>
                ) : desktopAvailable ? (
                  <button className="button primary" onClick={() => setSection("model")}>Connect an AI model</button>
                ) : (
                  <button className="button primary" onClick={() => copyText(prompt, "LLM prompt copied")}>Copy prompt for my LLM</button>
                )}
                <button className="button secondary" onClick={loadStarterSlate}>Try 4 examples</button>
                <button className="button ghost" onClick={addIdea}>Add my own idea</button>
              </div>
            </div>
            <div className="generation-status">
              <span className={desktopAvailable && llmReady ? "connected" : "disconnected"} aria-hidden="true" />
              <strong>{desktopAvailable && llmReady ? `${LLM_PROVIDERS[llmConfig.provider].label} · ${llmConfig.model}` : desktopAvailable ? "AI model is optional" : "Use any LLM with the prompt below"}</strong>
              <button className="text-button" onClick={() => setSection("model")}>{desktopAvailable && llmReady ? "Change model" : "AI model settings"} →</button>
              {lastGeneration && <small>Last slate: {lastGeneration.count} ideas from {lastGeneration.model}</small>}
            </div>
            <details className="prompt-panel">
              <summary>Use the prompt with any LLM</summary>
              <p>Copy this if you prefer another AI tool. The model only proposes editable ideas; Idea Foundry remains the calculator.</p>
              <textarea readOnly value={prompt} rows={9} aria-label="Idea generation prompt" />
              <button className="button small secondary" onClick={() => copyText(prompt, "LLM prompt copied")}>Copy prompt</button>
            </details>
            {sortedIdeas.length === 0 ? (
              <EmptyState number="00" title="No candidates yet" text="Load four falsifiable examples, add your own, or copy the profile-aware prompt into your preferred LLM." />
            ) : (
              <div className="idea-list">
                {sortedIdeas.map((idea, index) => {
                  const priority = calculateGenerationPriority(state.profile, idea.scores);
                  return (
                    <article className="idea-card" key={idea.id}>
                      <div className="idea-rank"><span>#{String(index + 1).padStart(2, "0")}</span><strong>{priority}</strong><small>{quickRunPhase === "choose-idea" && index === 0 ? "top exploration match" : "search priority"}</small></div>
                      <div className="idea-body">
                        <div className="idea-title-row">
                          <input value={idea.title} aria-label="Idea title" onChange={(event) => updateIdea(idea.id, { title: event.target.value })} />
                          <select value={idea.route} aria-label="Likely route" onChange={(event) => updateIdea(idea.id, { route: event.target.value as IdeaCandidate["route"] })}>
                            {(["Xahau", "Evernode", "Both", "Neither yet"] as const).map((route) => <option key={route}>{route}</option>)}
                          </select>
                        </div>
                        <textarea value={idea.concept} rows={2} placeholder="One-sentence concept" onChange={(event) => updateIdea(idea.id, { concept: event.target.value })} />
                        <div className="idea-facts">
                          <LabeledInput label="User" value={idea.user} onChange={(value) => updateIdea(idea.id, { user: value })} />
                          <LabeledInput label="What must be true" value={idea.criticalAssumption} onChange={(value) => updateIdea(idea.id, { criticalAssumption: value })} />
                        </div>
                        <LabeledInput label="First 14-day test" value={idea.experiment} onChange={(value) => updateIdea(idea.id, { experiment: value })} />
                        <details className="candidate-details">
                          <summary>More details & ranking</summary>
                          <div className="idea-facts">
                            <LabeledInput label="Likely buyer" value={idea.buyer} onChange={(value) => updateIdea(idea.id, { buyer: value })} />
                            <LabeledInput label="What they use today" value={idea.currentAlternative} onChange={(value) => updateIdea(idea.id, { currentAlternative: value })} />
                          </div>
                          <div className="score-sliders">
                            {(Object.keys(idea.scores) as Array<keyof GenerationComponentScores>).map((key) => (
                              <label key={key} className={key === "personalFit" && state.profile.mode === "neutral" ? "disabled" : ""}>
                                <span>{key.replace(/([A-Z])/g, " $1")} <b>{idea.scores[key]}</b></span>
                                <input type="range" min="0" max="100" value={idea.scores[key]} disabled={key === "personalFit" && state.profile.mode === "neutral"} onChange={(event) => updateIdea(idea.id, { scores: { ...idea.scores, [key]: Number(event.target.value) } })} />
                              </label>
                            ))}
                          </div>
                        </details>
                        <div className="idea-actions">
                          <span>Idea ranking only{idea.source ? ` · AI draft from ${idea.source.model}` : ""}</span>
                          <button className="button small primary" onClick={() => beginReview(idea)}>{quickRunPhase === "choose-idea" ? "Choose & continue" : "Evaluate this idea"}</button>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {section === "model" && (
          <div className="page-section narrow">
            <PageHeading eyebrow="AI model" title="Connect the model you want to use." description="OpenRouter is the quickest cloud option. Ollama and LM Studio keep prompts on your computer. No ChatGPT sign-in is required." />
            {desktopAvailable === false ? (
              <section className="desktop-required-card">
                <span className="desktop-required-mark">DESKTOP</span>
                <div>
                  <h2>The connector runs in the desktop edition</h2>
                  <p>This web edition can still copy prompts for any LLM. The desktop app adds private localhost connections plus optional cloud providers such as OpenRouter, with operating-system-protected credentials and no ChatGPT account requirement.</p>
                </div>
              </section>
            ) : (
              <>
                <div className="model-safety-strip">
                  <img src={BRAND_ICON_URL} alt="" aria-hidden="true" />
                  <div><strong>Your model suggests. You decide.</strong><span>AI output stays editable and never becomes evidence or a score automatically.</span></div>
                </div>

                <section className="form-card model-config-card">
                  <div className="form-card-head">
                    <div><h3>Connection</h3><p>{desktopVersion ? `Desktop ${desktopVersion} · ` : ""}Settings stay on this computer</p></div>
                    <span className={`connector-state ${llmReady ? "ready" : "idle"}`}>{llmReady ? "Configured" : "Not configured"}</span>
                  </div>
                  <div className="provider-picker" role="group" aria-label="LLM provider">
                    {(["openrouter", "ollama", "lmstudio", "openaiCompatible"] as LlmProvider[]).map((provider) => (
                      <button
                        key={provider}
                        className={llmConfig.provider === provider ? "active" : ""}
                        disabled={modelEditorLocked}
                        onClick={() => {
                          if (modelSearchTimerRef.current !== null) window.clearTimeout(modelSearchTimerRef.current);
                          modelSearchRequestRef.current += 1;
                          beginModelEditorChange({ clearRawKey: true, clearCatalog: true });
                          const nextConfig = editorConfigForProvider(provider, persistedLlmConfig);
                          setLlmConfig(nextConfig);
                          setLlmModels([]);
                          setModelSearch(nextConfig.model);
                          setModelSearchBusy(false);
                          setModelPickerOpen(false);
                          setModelListError("");
                          setLlmMessage("");
                        }}
                      >
                        <strong>{LLM_PROVIDERS[provider].label}</strong>
                        <span>{LLM_PROVIDERS[provider].location}</span>
                      </button>
                    ))}
                  </div>
                  <div className={`endpoint-boundary ${llmUsesRemoteEndpoint ? "remote-warning" : "local"}`}>
                    <strong>{llmUsesRemoteEndpoint ? "Cloud" : "Local"}</strong>
                    <span>{selectedLlmProvider.boundary}</span>
                  </div>
                  <div className="model-simple-fields">
                    <label className="full-field model-key-field">
                      <span>API key {selectedLlmProvider.keyRequired ? "(required)" : "(optional)"}</span>
                      <input
                        type="password"
                        autoComplete="off"
                        required={selectedLlmProvider.keyRequired}
                        aria-required={selectedLlmProvider.keyRequired}
                        disabled={modelEditorLocked}
                        value={llmApiKey}
                        placeholder={llmSavedKeyAvailable ? "A protected key is already saved" : selectedLlmProvider.keyRequired ? "Paste your OpenRouter API key" : "Leave blank if this endpoint needs no key"}
                        onChange={(event) => {
                          beginModelEditorChange();
                          const nextKey = event.target.value;
                          setLlmApiKey(nextKey);
                          setClearLlmApiKey(false);
                          if (llmConfig.provider === "openrouter" && modelSearch.trim()) queueModelSearch(modelSearch, nextKey);
                        }}
                      />
                      <small>{llmConfig.provider === "openrouter" ? "Protected by your operating system; never written to projects, exports, or browser storage." : "Never written to project files or browser storage."}</small>
                    </label>
                    <div className="model-picker-field">
                      <label className="full-field">
                        <span>Find a model</span>
                        <input
                          role="combobox"
                          aria-controls="available-llm-models"
                          aria-expanded={modelPickerOpen}
                          aria-autocomplete="list"
                          aria-activedescendant={modelPickerOpen && displayedModels[modelActiveIndex] ? `model-option-${modelActiveIndex}` : undefined}
                          disabled={modelEditorLocked}
                          value={modelSearch}
                          placeholder={llmConfig.provider === "openrouter" ? "Type 4.8, Opus, Sonnet, Llama…" : "Type a name, version, or model ID"}
                          onFocus={openModelPicker}
                          onChange={(event) => {
                            beginModelEditorChange();
                            setLlmConfig((current) => ({ ...current, model: "" }));
                            queueModelSearch(event.target.value);
                          }}
                          onKeyDown={(event) => {
                            if (event.key === "ArrowDown" && displayedModels.length > 0) {
                              event.preventDefault();
                              setModelPickerOpen(true);
                              setModelActiveIndex((current) => Math.min(current + 1, displayedModels.length - 1));
                            }
                            if (event.key === "ArrowUp" && displayedModels.length > 0) {
                              event.preventDefault();
                              setModelActiveIndex((current) => Math.max(current - 1, 0));
                            }
                            if (event.key === "Enter" && displayedModels[modelActiveIndex]) {
                              event.preventDefault();
                              selectLlmModel(displayedModels[modelActiveIndex]);
                            }
                            if (event.key === "Escape") {
                              event.preventDefault();
                              setModelPickerOpen(false);
                            }
                          }}
                        />
                      </label>
                      {modelPickerOpen && (
                        <div className="model-popover" id="available-llm-models" role="listbox" aria-label="Available models" aria-busy={modelSearchBusy || llmBusy === "models"}>
                          {modelSearchBusy || llmBusy === "models" ? (
                            <div className="model-list-state" role="status">Searching {selectedLlmProvider.label}…</div>
                          ) : modelListError ? (
                            <div className="model-list-state error" role="status">{modelListError}</div>
                          ) : llmConfig.provider === "openrouter" && !modelSearch.trim() ? (
                            <div className="model-list-state">Start typing a model name or version. For example: <strong>4.8</strong>, <strong>Opus</strong>, or <strong>Llama</strong>.</div>
                          ) : displayedModels.length === 0 ? (
                            <div className="model-list-state">No model matches “{modelSearch}”. Try another name, version, or exact ID.</div>
                          ) : (
                            <div className="model-options">
                              {displayedModels.map((model, index) => (
                                <button
                                  id={`model-option-${index}`}
                                  role="option"
                                  tabIndex={-1}
                                  aria-selected={llmConfig.model === model.id}
                                  className={`${llmConfig.model === model.id ? "selected" : ""} ${modelActiveIndex === index ? "active" : ""}`}
                                  key={model.id}
                                  onMouseDown={(event) => event.preventDefault()}
                                  onMouseEnter={() => setModelActiveIndex(index)}
                                  onClick={() => selectLlmModel(model)}
                                >
                                  <span><strong>{model.name || model.id}</strong><small>{model.id}</small></span>
                                  {llmConfig.model === model.id && <b>Selected</b>}
                                </button>
                              ))}
                            </div>
                          )}
                          {visibleModels.length > displayedModels.length && <div className="model-result-limit">Showing the best {displayedModels.length} matches. Keep typing to narrow the list.</div>}
                        </div>
                      )}
                      {llmConfig.model && <div className="selected-model"><span>Selected</span><strong>{llmConfig.model}</strong><button aria-label="Clear selected model" disabled={modelEditorLocked} onClick={() => { beginModelEditorChange(); setLlmConfig((current) => ({ ...current, model: "" })); setModelSearch(""); setModelPickerOpen(true); }}>×</button></div>}
                    </div>
                    <label className="idea-count-field">
                      <span>Ideas to generate</span>
                      <input type="number" min="1" max="12" value={ideaCount} onChange={(event) => setIdeaCount(Math.max(1, Math.min(12, Number(event.target.value) || 1)))} />
                    </label>
                  </div>
                  <details className="model-advanced">
                    <summary>Advanced settings</summary>
                    <div className="model-field-grid">
                      <label className="full-field">
                        <span>Base URL</span>
                        <input value={llmConfig.baseUrl} spellCheck={false} disabled={modelEditorLocked} readOnly={selectedLlmProvider.lockedEndpoint} aria-readonly={selectedLlmProvider.lockedEndpoint} onChange={(event) => { beginModelEditorChange({ clearRawKey: true, clearCatalog: true }); setLlmConfig((current) => ({ ...current, baseUrl: event.target.value, hasApiKey: false })); }} />
                      </label>
                      <label className="full-field manual-model-field">
                        <span>Exact model ID</span>
                        <input value={llmConfig.model} disabled={modelEditorLocked} placeholder="Choose above or enter an ID manually" onChange={(event) => { beginModelEditorChange(); setLlmConfig((current) => ({ ...current, model: event.target.value })); setModelSearch(event.target.value); }} />
                        <small>Use this when an endpoint cannot list its models.</small>
                      </label>
                    </div>
                    {llmSavedKeyAvailable && (selectedLlmProvider.keyRequired ? (
                      <p className="required-key-note">Paste a new key above to replace the protected key already saved on this computer.</p>
                    ) : (
                      <label className="check-field clear-key-field"><input type="checkbox" disabled={modelEditorLocked} checked={clearLlmApiKey} onChange={(event) => { beginModelEditorChange(); setClearLlmApiKey(event.target.checked); }} /><span>Remove the saved API key</span></label>
                    ))}
                  </details>
                  <div className="model-actions">
                    <button className="button secondary" disabled={modelEditorLocked || llmBusy !== null || modelSearchBusy} onClick={refreshLlmModels}>{llmBusy === "models" ? "Reading models…" : "Browse all models"}</button>
                    <button className="button primary" disabled={modelEditorLocked || llmBusy !== null || !llmReady} onClick={() => void connectLlm()}>{llmBusy === "saving" ? "Connecting…" : "Save & connect"}</button>
                  </div>
                  {llmMessage && <div className={`connector-message ${llmMessageTone}`} role="status">{llmMessage}</div>}
                </section>

                <section className="model-generation-card">
                  <div><p className="eyebrow">Next step</p><h2>Generate an editable idea slate</h2><p>Your project boundary and optional profile are included. Cloud providers receive that selected context.</p></div>
                  <button className="button primary" disabled={clearingLocalData || generatingIdeas || !llmReady} onClick={generateWithConnectedLlm}>{generatingIdeas ? "Generating…" : `Generate ${ideaCount} ideas`}</button>
                </section>
              </>
            )}
          </div>
        )}

        {section === "profile" && (
          <div className="page-section narrow">
            <PageHeading eyebrow="Personalize ideas" title="Make generated ideas feel more like you." description="Choose the themes and working style you care about. This changes idea ranking only—never evidence or the final decision score." />
            <div className="mode-switch" role="group" aria-label="Profile mode">
              <button className={state.profile.mode === "neutral" ? "active" : ""} onClick={() => setState((current) => ({ ...current, profile: emptyProfile("neutral") }))}><strong>Keep it neutral</strong><span>Rank ideas without personal preferences</span></button>
              <button className={state.profile.mode === "private" ? "active" : ""} onClick={() => setState((current) => ({ ...current, profile: emptyProfile("private") }))}><strong>Personalize my ideas</strong><span>Use my interests and working style</span></button>
            </div>
            {state.profile.mode === "neutral" ? (
              <div className="profile-neutral-card">
                <span className="large-check">N</span>
                <div><h3>Neutral exploration is active</h3><p>Candidate priority uses Opportunity Signal 40%, Protocol Affordance 30%, and Experimentability 30%. Personal fit contributes 0%.</p></div>
              </div>
            ) : (
              <>
                <WeightEditor title="Search themes" subtitle="3–6 themes; weights must total 100" items={state.profile.searchThemes} onChange={(items) => setState((current) => ({ ...current, profile: { ...current.profile, searchThemes: items, locked: false } }))} />
                <WeightEditor title="Personal-fit dimensions" subtitle="4–8 dimensions; weights must total 100" items={state.profile.fitDimensions} onChange={(items) => setState((current) => ({ ...current, profile: { ...current.profile, fitDimensions: items, locked: false } }))} />
                <details className="profile-advanced">
                  <summary>Advanced weighting</summary>
                  <section className="form-card">
                    <div className="form-card-head"><div><h3>Idea ranking weights</h3><p>Personal 25–45 · Opportunity 25–40 · Protocol 10–25 · Experiment 15–25</p></div><WeightTotal value={Object.values(state.profile.generationWeights).reduce((sum, weight) => sum + weight, 0)} /></div>
                    <div className="outer-weights">
                      {(Object.keys(state.profile.generationWeights) as Array<keyof GenerationProfile["generationWeights"]>).map((key) => (
                        <label key={key}><span>{key.replace(/([A-Z])/g, " $1")}</span><div><input type="number" min="0" max="100" value={state.profile.generationWeights[key]} onChange={(event) => setState((current) => ({ ...current, profile: { ...current.profile, locked: false, generationWeights: { ...current.profile.generationWeights, [key]: Number(event.target.value) } } }))} /><b>%</b></div></label>
                      ))}
                    </div>
                  </section>
                </details>
                {profileErrors.length > 0 && <IssueList title="Fix before saving" items={profileErrors} tone="warning" />}
                <div className="profile-lock-row"><span>Only these themes and weights are saved on this computer.</span><button className="button primary" disabled={profileErrors.length > 0} onClick={() => { setState((current) => ({ ...current, profile: { ...current.profile, locked: true } })); setToast("Personalization saved locally"); }}>{state.profile.locked ? "Personalization saved" : "Save personalization"}</button></div>
              </>
            )}
          </div>
        )}

        {section === "review" && (
          <div className="page-section">
            <PageHeading eyebrow="Evaluate" title="Answer what must be true." description="Work through the claims one category at a time. Unanswered items stay unassessed, and the calculator never fills gaps optimistically." />
            <section className="ai-assist-card" aria-labelledby="evaluation-ai-title">
              <div className="ai-assist-head">
                <div className="ai-assist-symbol" aria-hidden="true">AI</div>
                <div>
                  <p className="eyebrow">Optional assistant</p>
                  <h2 id="evaluation-ai-title">Draft an evaluation with AI</h2>
                  <p>AI can recommend merit ratings and explain uncertainty. Nothing changes until you select and apply a draft. Evidence grades and the deterministic calculator stay under local rules.</p>
                </div>
                <span className="provisional-pill">Draft only</span>
              </div>

              {desktopAvailable !== true ? (
                <div className="ai-assist-empty"><span>Desktop feature</span><p>AI assistance uses the model connected in the local desktop app. Manual evaluation remains fully available here.</p><button className="button secondary" onClick={() => setSection("model")}>Model options</button></div>
              ) : !selectedIdea ? (
                <div className="ai-assist-empty"><span>Idea required</span><p>Choose the hypothesis the model should assess before creating a draft.</p><button className="button secondary" onClick={() => setSection("ideas")}>Choose an idea</button></div>
              ) : !llmReady ? (
                <div className="ai-assist-empty"><span>Model required</span><p>Connect Ollama, LM Studio, OpenRouter, or another compatible model first.</p><button className="button secondary" onClick={() => setSection("model")}>Connect a model</button></div>
              ) : (
                <div className="ai-assist-controls">
                  <div className="ai-model-line"><span className={llmUsesRemoteEndpoint ? "cloud" : "local"}>{llmUsesRemoteEndpoint ? "Cloud" : "Local"}</span><strong>{llmConfig.model}</strong><small>{llmUsesRemoteEndpoint ? "The selected idea, these notes, and exact evidence excerpts are sent to the provider when you click Draft." : "The selected context stays on this computer when the endpoint is local."}</small></div>
                  <label className="ai-notes-field"><span>Additional facts or notes <small>optional · up to 8,000 characters</small></span><textarea rows={3} maxLength={8_000} value={evaluationNotes} placeholder="Paste facts the model may use. Do not paste private profile data unless you intend to send it." onChange={(event) => setEvaluationNotes(event.target.value)} /></label>
                  <div className="ai-action-row"><span>{state.review.claims.filter((claim) => claim.merit === null).length} unanswered claims will be requested. Existing answers will not be overwritten.</span><button className="button primary" disabled={aiAssistBusy !== null} onClick={() => void draftEvaluationWithAi()}>{aiAssistBusy === "evaluation" ? "Drafting…" : llmUsesRemoteEndpoint ? "Send & draft unanswered" : "Draft unanswered claims"}</button></div>
                </div>
              )}

              {aiUndoAvailable && aiUndo && <div className="ai-undo-bar" role="status"><span>Last AI-assisted approval: {aiUndo.label}</span><button className="text-button" onClick={undoLastAiApproval}>Undo</button></div>}

              {evaluationDraft && (
                <div className="ai-draft-panel">
                  <div className="ai-draft-summary">
                    <div><strong>Provisional draft</strong><span>{evaluationDraft.result.provider} · {evaluationDraft.result.model} · {new Date(evaluationDraft.createdAt).toLocaleString()}</span></div>
                    <span>{evaluationDraft.result.claims.length > 0
                      ? `${evaluationDraft.result.claims.filter((proposal) => proposal.suggestedMerit !== null).length} rated · ${evaluationDraft.result.claims.filter((proposal) => proposal.suggestedMerit === null).length} left unknown`
                      : `${evaluationDraft.result.gates.length} gate drafts refreshed`}</span>
                  </div>
                  {evaluationDraft.contextFingerprint !== evaluationContextFingerprint && <div className="ai-stale-warning" role="status"><strong>Draft out of date.</strong><span>The idea, review setup, notes, or supplied excerpts changed. Generate a fresh draft before applying anything.</span></div>}
                  {evaluationDraft.result.claims.length > 0 && <details className="ai-review-queue" open>
                    <summary>Review claim recommendations</summary>
                    <div className="ai-queue-toolbar"><span>No recommendations are selected automatically.</span><div><button className="text-button" disabled={evaluationDraft.contextFingerprint !== evaluationContextFingerprint} onClick={() => setSelectedEvaluationClaims(evaluationDraft.result.claims.filter((proposal) => proposal.suggestedMerit !== null && state.review.claims.find((claim) => claim.claimId === proposal.claimId)?.merit === null).map((proposal) => proposal.claimId))}>Select rated drafts</button><button className="text-button" onClick={() => setSelectedEvaluationClaims([])}>Clear</button></div></div>
                    <div className="ai-proposal-list">
                      {evaluationDraft.result.claims.map((proposal) => {
                        const rubricRow = RUBRIC.find((row) => row.claimId === proposal.claimId);
                        const currentClaim = state.review.claims.find((claim) => claim.claimId === proposal.claimId);
                        const selectable = proposal.suggestedMerit !== null && currentClaim?.merit === null && evaluationDraft.contextFingerprint === evaluationContextFingerprint;
                        return (
                          <article className={`ai-proposal ${selectedEvaluationClaims.includes(proposal.claimId) ? "selected" : ""}`} key={proposal.claimId}>
                            <label className="ai-proposal-check"><input type="checkbox" checked={selectedEvaluationClaims.includes(proposal.claimId)} disabled={!selectable} onChange={(event) => setSelectedEvaluationClaims((current) => event.target.checked ? [...new Set([...current, proposal.claimId])] : current.filter((claimId) => claimId !== proposal.claimId))} /><span className="sr-only">Select {proposal.claimId}</span></label>
                            <div className="ai-proposal-copy"><div><code>{proposal.claimId}</code><strong>{rubricRow?.atomicClaim ?? "Canonical claim"}</strong></div><p>{proposal.reasoning}</p>{proposal.uncertainty && <small>Uncertainty: {proposal.uncertainty}</small>}</div>
                            <div className="ai-proposal-rating"><label><span>Draft merit</span><input type="number" min="0" max="5" step="0.5" placeholder="Unknown" value={proposal.suggestedMerit ?? ""} disabled={currentClaim?.merit !== null} onChange={(event) => updateEvaluationProposal(proposal.claimId, { suggestedMerit: event.target.value === "" ? null : Math.max(0, Math.min(5, Math.round(Number(event.target.value) * 2) / 2)) })} /></label><span className={`confidence confidence-${proposal.confidence}`}>{proposal.confidence}</span>{currentClaim?.merit !== null && <small>Already answered: {currentClaim?.merit}</small>}</div>
                          </article>
                        );
                      })}
                    </div>
                    <div className="ai-apply-row"><span>Only merit and an audit note will change. Grades, evidence links, weights, and gates remain untouched.</span><button className="button primary" disabled={selectedEvaluationClaims.length === 0 || evaluationDraft.contextFingerprint !== evaluationContextFingerprint} onClick={applySelectedEvaluation}>Apply {selectedEvaluationClaims.length || "selected"}</button></div>
                  </details>}

                  <details className="ai-review-queue gate-drafts">
                    <summary>Review gate recommendations one at a time</summary>
                    <p className="ai-queue-note">Gate decisions are non-compensable. There is no bulk apply; each recommendation needs a separate human action.</p>
                    <div className="ai-gate-list">
                      {evaluationDraft.result.gates.map((proposal) => {
                        const currentGate = state.review.gates.find((gate) => gate.id === proposal.gateId);
                        const gateChanged = !currentGate || evaluationDraft.gateFingerprints[proposal.gateId] !== gateStateFingerprint(currentGate);
                        return (
                          <article key={proposal.gateId}>
                            <div><code>{proposal.gateId}</code><strong>{gateLabels[proposal.gateId]}</strong><span className={`confidence confidence-${proposal.confidence}`}>{proposal.confidence}</span></div>
                            <p>{proposal.reasoning}</p>
                            {proposal.uncertainty && <small>Uncertainty: {proposal.uncertainty}</small>}
                            <div><span>Current: {currentGate?.status.replace("_", " ")}</span><strong>{gateChanged ? "Changed since draft" : `Draft: ${proposal.suggestedStatus.replace("_", " ")}`}</strong><button className="button small secondary" aria-label={`Apply ${proposal.gateId} gate recommendation`} disabled={gateChanged || evaluationDraft.contextFingerprint !== evaluationContextFingerprint} onClick={() => applyGateProposal(proposal.gateId)}>Apply this gate only</button></div>
                          </article>
                        );
                      })}
                    </div>
                  </details>
                </div>
              )}
            </section>
            <div className="review-config">
              <label><span>Dominant archetype</span><select value={state.review.archetype} onChange={(event) => updateReview({ archetype: event.target.value as Archetype })}>{ARCHETYPES.map((item) => <option key={item} value={item}>{archetypeLabels[item]}</option>)}</select></label>
              <label><span>Target stage</span><select value={state.review.stage} onChange={(event) => updateReview({ stage: event.target.value as Stage })}>{STAGES.map((item) => <option key={item} value={item}>{stageLabels[item]}</option>)}</select></label>
              <label><span>Protocol route</span><select value={state.review.protocolRoute} onChange={(event) => updateReview({ protocolRoute: event.target.value as ProtocolRoute })}>{Object.entries(routeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              <label><span>Evidence cutoff</span><input type="date" value={state.review.cutoffDate} onChange={(event) => updateReview({ cutoffDate: event.target.value })} /></label>
            </div>
            <div className="progress-line"><div><span style={{ width: `${(score.assessedClaims / score.totalClaims) * 100}%` }} /></div><strong>{score.assessedClaims} of {score.totalClaims} assessed</strong><button className="text-button" onClick={() => setSection("evidence")}>Attach evidence →</button></div>

            <section className="gate-section">
              <div className="section-title"><div><p className="eyebrow">Non-compensable controls</p><h2>Stage gates</h2></div><span>{score.gateBlockers.length} blockers</span></div>
              <div className="gate-grid">
                {state.review.gates.map((gate) => (
                  <article className={`gate-card status-${gate.status}`} key={gate.id}>
                    <div className="gate-top"><code>{gate.id}</code><select value={gate.status} onChange={(event) => updateGate(gate.id, { status: event.target.value as GateAssessment["status"] })}><option value="pass">Pass</option><option value="conditional">Conditional</option><option value="fail">Fail</option><option value="unresolved">Unresolved</option><option value="not_due">Not due</option></select></div>
                    <h3>{gateLabels[gate.id]}</h3>
                    <textarea rows={2} value={gate.rationale} placeholder="Decision rationale" onChange={(event) => updateGate(gate.id, { rationale: event.target.value })} />
                    {gate.status === "conditional" && <div className="conditional-fields"><input placeholder="Owner" value={gate.owner} onChange={(event) => updateGate(gate.id, { owner: event.target.value })} /><input type="date" value={gate.deadline} onChange={(event) => updateGate(gate.id, { deadline: event.target.value })} /><input placeholder="Expected artifact" value={gate.expectedArtifact} onChange={(event) => updateGate(gate.id, { expectedArtifact: event.target.value })} /><input placeholder="Pass threshold" value={gate.passThreshold} onChange={(event) => updateGate(gate.id, { passThreshold: event.target.value })} /><input placeholder="Kill threshold" value={gate.killThreshold} onChange={(event) => updateGate(gate.id, { killThreshold: event.target.value })} /></div>}
                  </article>
                ))}
              </div>
            </section>

            <section className="claims-section">
              <div className="section-title"><div><p className="eyebrow">Canonical rubric</p><h2>12 category rounds</h2></div><span>Weights locked to {archetypeLabels[state.review.archetype]}</span></div>
              <div className="category-list">
                {categories.map(([categoryId, category]) => {
                  const summary = score.categorySummaries.find((item) => item.id === categoryId)!;
                  const rows = RUBRIC.filter((row) => row.categoryId === categoryId);
                  return (
                    <details className="category-round" key={categoryId} open={categoryId === "1"}>
                      <summary>
                        <span className="category-number">{categoryId.padStart(2, "0")}</span>
                        <span className="category-name"><strong>{category}</strong><small>{summary.assessedClaims}/{summary.totalClaims} assessed · {summary.weight}% locked weight</small></span>
                        <span className="category-metrics"><b>{summary.rawPoints}</b><i>raw</i><b>{summary.validatedPoints}</b><i>validated</i></span>
                      </summary>
                      <div className="claim-table">
                        {rows.map((row) => {
                          const claim = state.review.claims.find((item) => item.claimId === row.claimId)!;
                          const result = score.claimResults.find((item) => item.claimId === row.claimId)!;
                          const evidenceCount = state.review.artifacts.filter((item) => item.rubricClaimIds.includes(row.claimId)).length;
                          return (
                            <div className="claim-row" key={row.claimId} id={`claim-${row.claimId}`}>
                              <div className="claim-copy"><code>{row.claimId}</code><div><strong>{row.atomicClaim}</strong><small>Locked weight {row.weights[state.review.archetype].toFixed(2)} · {evidenceCount} artifact{evidenceCount === 1 ? "" : "s"}</small></div></div>
                              <label className="compact-field"><span>Merit 0–5</span><input type="number" min="0" max="5" step="0.5" placeholder="—" value={claim.merit ?? ""} onChange={(event) => updateClaim(row.claimId, { merit: event.target.value === "" ? null : Number(event.target.value) })} /></label>
                              <label className="compact-field"><span>Evidence</span><select value={claim.grade} onChange={(event) => updateClaim(row.claimId, { grade: event.target.value as EvidenceGrade })}>{EVIDENCE_GRADES.map((grade) => <option key={grade}>{grade}</option>)}</select></label>
                              <div className="claim-contribution"><span>{result.rawPoints.toFixed(2)}</span><small>raw</small><span>{result.validatedPoints.toFixed(2)}</span><small>validated</small></div>
                            </div>
                          );
                        })}
                      </div>
                    </details>
                  );
                })}
              </div>
            </section>
          </div>
        )}

        {section === "evidence" && (
          <div className="page-section">
            <PageHeading eyebrow="Evidence" title="Add proof for your answers." description="Link each piece of evidence to a claim. Idea Foundry checks quality limits, dates, verification, duplicates, and counterevidence." />
            <section className="ai-assist-card evidence-ai-card" aria-labelledby="evidence-ai-title">
              <div className="ai-assist-head">
                <div className="ai-assist-symbol" aria-hidden="true">AI</div>
                <div><p className="eyebrow">Optional assistant</p><h2 id="evidence-ai-title">Organize evidence you already have</h2><p>Paste interview notes, test output, research excerpts, or audit notes. AI can split and classify the source, but it cannot create proof or verify itself.</p></div>
                <span className="provisional-pill">Human approval</span>
              </div>

              {desktopAvailable !== true ? (
                <div className="ai-assist-empty"><span>Desktop feature</span><p>Evidence organization uses the model connected in the local desktop app. The manual evidence form below remains available.</p><button className="button secondary" onClick={() => setSection("model")}>Model options</button></div>
              ) : !llmReady ? (
                <div className="ai-assist-empty"><span>Model required</span><p>Connect a model first, then return here with the actual source material.</p><button className="button secondary" onClick={() => setSection("model")}>Connect a model</button></div>
              ) : (
                <div className="evidence-source-workspace">
                  <div className="ai-model-line"><span className={llmUsesRemoteEndpoint ? "cloud" : "local"}>{llmUsesRemoteEndpoint ? "Cloud" : "Local"}</span><strong>{llmConfig.model}</strong><small>{llmUsesRemoteEndpoint ? "The source text is sent to the selected provider only when you click Send & organize. Remove sensitive details you do not want to share." : "The source stays on this computer when the endpoint is local."}</small></div>
                  <div className="evidence-source-grid">
                    <label className="full-field"><span>Source title</span><input maxLength={300} value={evidenceSource.label} placeholder="Example: Operator interview 03" onChange={(event) => setEvidenceSource((current) => ({ ...current, label: event.target.value }))} /></label>
                    <label className="full-field source-text-field"><span>Actual source text</span><textarea rows={8} maxLength={100_000} value={evidenceSource.text} placeholder="Paste the source contents here. A URL by itself is not evidence." onChange={(event) => setEvidenceSource((current) => ({ ...current, text: event.target.value }))} /></label>
                  </div>
                  <div className="ai-action-row"><span>The full source is used for this run but is not saved in the review. Approved records keep exact excerpts and a source fingerprint.</span><button className="button primary" disabled={aiAssistBusy !== null || !evidenceSource.label.trim() || evidenceSource.text.trim().length < 20} onClick={() => void organizeEvidenceWithAi()}>{aiAssistBusy === "evidence" ? "Organizing…" : llmUsesRemoteEndpoint ? "Send & organize" : "Organize with AI"}</button></div>
                </div>
              )}

              {aiUndoAvailable && aiUndo && <div className="ai-undo-bar" role="status"><span>Last AI-assisted approval: {aiUndo.label}</span><button className="text-button" onClick={undoLastAiApproval}>Undo</button></div>}

              {evidenceAnalysis && (
                <div className="ai-draft-panel">
                  <div className="ai-draft-summary"><div><strong>Provisional extraction</strong><span>{evidenceAnalysis.result.provider} · {evidenceAnalysis.result.model} · {new Date(evidenceAnalysis.createdAt).toLocaleString()}</span></div><span>{evidenceAnalysis.result.evidence.filter((proposal) => !proposal.unverifiable).length} grounded · {evidenceAnalysis.result.evidence.filter((proposal) => proposal.unverifiable).length} rejected</span></div>
                  {evidenceAnalysis.sourceFingerprint !== evidenceSourceFingerprint && <div className="ai-stale-warning" role="status"><strong>Source changed.</strong><span>This extraction no longer matches the pasted source. Run it again before applying records.</span></div>}
                  <div className="ai-queue-toolbar"><span>No extracted records are selected automatically.</span><div><button className="text-button" disabled={evidenceAnalysis.sourceFingerprint !== evidenceSourceFingerprint} onClick={() => setSelectedEvidenceProposals(evidenceAnalysis.result.evidence.map((proposal, index) => ({ proposal, index })).filter(({ proposal }) => !proposal.unverifiable && proposal.sourceExcerpt && evidenceSource.text.includes(proposal.sourceExcerpt)).map(({ index }) => index))}>Select grounded drafts</button><button className="text-button" onClick={() => setSelectedEvidenceProposals([])}>Clear</button></div></div>
                  <div className="evidence-proposal-list">
                    {evidenceAnalysis.result.evidence.map((proposal, index) => {
                      const grounded = !proposal.unverifiable && Boolean(proposal.sourceExcerpt) && evidenceSource.text.includes(proposal.sourceExcerpt);
                      return (
                        <article className={`evidence-proposal ${selectedEvidenceProposals.includes(index) ? "selected" : ""} ${grounded ? "" : "rejected"}`} key={`${proposal.title}-${index}`}>
                          <label className="ai-proposal-check"><input type="checkbox" checked={selectedEvidenceProposals.includes(index)} disabled={!grounded || evidenceAnalysis.sourceFingerprint !== evidenceSourceFingerprint} onChange={(event) => setSelectedEvidenceProposals((current) => event.target.checked ? [...new Set([...current, index])] : current.filter((proposalIndex) => proposalIndex !== index))} /><span className="sr-only">Select extracted record {index + 1}</span></label>
                          <div className="evidence-proposal-main">
                            <div className="evidence-proposal-title"><input aria-label={`Evidence title ${index + 1}`} maxLength={180} value={proposal.title} onChange={(event) => updateEvidenceProposal(index, { title: event.target.value })} /><span className={`confidence confidence-${proposal.confidence}`}>{proposal.confidence}</span></div>
                            {grounded ? <blockquote>{proposal.sourceExcerpt}</blockquote> : <div className="rejected-excerpt"><strong>Not grounded in the pasted source</strong><span>{proposal.unverifiableReason || "The proposed excerpt was not found verbatim, so this record cannot be approved."}</span></div>}
                            <p>{proposal.reasoning}</p>{proposal.uncertainty && <small>Uncertainty: {proposal.uncertainty}</small>}
                          </div>
                          <div className="evidence-proposal-fields">
                            <label><span>Claim link</span><select value={proposal.claimIds[0] ?? "1A"} onChange={(event) => updateEvidenceProposal(index, { claimIds: [event.target.value] })}>{RUBRIC.map((row) => <option value={row.claimId} key={row.claimId}>{row.claimId} · {row.atomicClaim}</option>)}</select><small>Linked: {proposal.claimIds.join(", ")}. Choosing another replaces all links.</small></label>
                            <label><span>Direction</span><select value={proposal.direction} onChange={(event) => updateEvidenceProposal(index, { direction: event.target.value as EvidenceProposal["direction"] })}><option value="supports">Supports</option><option value="contradicts">Contradicts</option></select></label>
                            <label><span>Type</span><select value={proposal.suggestedType} onChange={(event) => { const nextType = event.target.value as EvidenceType; const cappedGrade = EVIDENCE_RANK[proposal.suggestedGrade] > EVIDENCE_TYPE_MAX_RANK[nextType] ? `E${EVIDENCE_TYPE_MAX_RANK[nextType]}` as EvidenceGrade : proposal.suggestedGrade; updateEvidenceProposal(index, { suggestedType: nextType, suggestedGrade: cappedGrade }); }}>{EVIDENCE_TYPES.map((type) => <option key={type}>{type}</option>)}</select></label>
                            <label><span>Grade</span><select value={proposal.suggestedGrade} onChange={(event) => updateEvidenceProposal(index, { suggestedGrade: event.target.value as EvidenceGrade })}>{EVIDENCE_GRADES.map((grade) => <option key={grade} disabled={EVIDENCE_RANK[grade] > EVIDENCE_TYPE_MAX_RANK[proposal.suggestedType]}>{grade}</option>)}</select><small>Max E{EVIDENCE_TYPE_MAX_RANK[proposal.suggestedType]} for {proposal.suggestedType}</small></label>
                          </div>
                        </article>
                      );
                    })}
                  </div>

                  <section className="human-approval-panel">
                    <div><p className="eyebrow">Human approval</p><h3>Complete the provenance before adding records</h3><p>AI never fills reviewer identity, conflict disclosure, dates, or verification. Those attestations are yours.</p></div>
                    <div className="field-grid">
                      <label><span>Observed date</span><input type="date" value={evidenceSource.evidenceDate} onChange={(event) => setEvidenceSource((current) => ({ ...current, evidenceDate: event.target.value }))} /></label>
                      <label><span>Expiry date</span><input type="date" value={evidenceSource.expiryDate} onChange={(event) => setEvidenceSource((current) => ({ ...current, expiryDate: event.target.value }))} /></label>
                      <label><span>Reviewer</span><input value={evidenceSource.reviewer} placeholder="Required for E2+" onChange={(event) => setEvidenceSource((current) => ({ ...current, reviewer: event.target.value }))} /></label>
                      <label><span>Relationship / conflict</span><input value={evidenceSource.relationshipOrConflict} placeholder="Write None when none" onChange={(event) => setEvidenceSource((current) => ({ ...current, relationshipOrConflict: event.target.value }))} /></label>
                    </div>
                    <label className="check-field"><input type="checkbox" checked={evidenceHumanVerificationCurrent} onChange={(event) => setEvidenceSource((current) => ({ ...current, reviewerVerified: event.target.checked, verificationFingerprint: event.target.checked ? currentEvidenceVerificationFingerprint : "" }))} /><span>I reviewed the source and personally verify the selected evidence records</span></label>
                    <label className="check-field"><input type="checkbox" checked={evidenceSource.updateClaimGrades} onChange={(event) => setEvidenceSource((current) => ({ ...current, updateClaimGrades: event.target.checked }))} /><span>For supporting records, explicitly link them and use the approved grades on their claims</span></label>
                    {selectedEvidenceNeedsVerification && (!evidenceHumanVerificationCurrent || !evidenceSource.reviewer.trim() || !evidenceSource.relationshipOrConflict.trim()) && <div className="approval-requirement" role="status">E2+ records require a fresh verification of this exact selection, reviewer name, and relationship/conflict disclosure.</div>}
                    <div className="ai-apply-row"><span>Contradictions are added but never acknowledged automatically. The pasted full source is not stored.</span><button className="button primary" disabled={selectedEvidenceProposals.length === 0 || evidenceAnalysis.sourceFingerprint !== evidenceSourceFingerprint || !evidenceSource.evidenceDate || !evidenceSource.expiryDate || (selectedEvidenceNeedsVerification && (!evidenceHumanVerificationCurrent || !evidenceSource.reviewer.trim() || !evidenceSource.relationshipOrConflict.trim()))} onClick={applySelectedEvidence}>Add {selectedEvidenceProposals.length || "selected"} to ledger</button></div>
                  </section>
                </div>
              )}
            </section>
            <div className="evidence-layout">
              <section className="form-card evidence-form">
                <div className="form-card-head"><div><h3>Add an evidence record</h3><p>Grades apply to a claim—not to a document in the abstract.</p></div><code>{state.review.artifacts.length + 1}</code></div>
                <label className="full-field"><span>Artifact title</span><input value={evidenceDraft.title} placeholder="Example: Interview notes — operator 03" onChange={(event) => setEvidenceDraft((current) => ({ ...current, title: event.target.value }))} /></label>
                <div className="field-grid">
                  <label><span>Rubric claim</span><select value={evidenceDraft.claimId} onChange={(event) => setEvidenceDraft((current) => ({ ...current, claimId: event.target.value }))}>{RUBRIC.map((row) => <option value={row.claimId} key={row.claimId}>{row.claimId} · {row.atomicClaim}</option>)}</select></label>
                  <label><span>Direction</span><select value={evidenceDraft.direction} onChange={(event) => setEvidenceDraft((current) => ({ ...current, direction: event.target.value as "supports" | "contradicts" }))}><option value="supports">Supports</option><option value="contradicts">Contradicts</option></select></label>
                  <label><span>Evidence type</span><select value={evidenceDraft.evidenceType} onChange={(event) => setEvidenceDraft((current) => ({ ...current, evidenceType: event.target.value as EvidenceType }))}>{EVIDENCE_TYPES.map((type) => <option key={type}>{type}</option>)}</select></label>
                  <label><span>Claim grade</span><select value={evidenceDraft.grade} onChange={(event) => setEvidenceDraft((current) => ({ ...current, grade: event.target.value as EvidenceGrade }))}>{EVIDENCE_GRADES.map((grade) => <option key={grade}>{grade}</option>)}</select><small>Max for {evidenceDraft.evidenceType}: E{EVIDENCE_TYPE_MAX_RANK[evidenceDraft.evidenceType]}</small></label>
                  <label><span>Observed</span><input type="date" value={evidenceDraft.evidenceDate} onChange={(event) => setEvidenceDraft((current) => ({ ...current, evidenceDate: event.target.value }))} /></label>
                  <label><span>Expires</span><input type="date" value={evidenceDraft.expiryDate} onChange={(event) => setEvidenceDraft((current) => ({ ...current, expiryDate: event.target.value }))} /></label>
                  <label><span>Reviewer</span><input value={evidenceDraft.reviewer} placeholder="Required for E2+" onChange={(event) => setEvidenceDraft((current) => ({ ...current, reviewer: event.target.value }))} /></label>
                  <label><span>Relationship / conflict</span><input value={evidenceDraft.relationshipOrConflict} placeholder="Write None when none" onChange={(event) => setEvidenceDraft((current) => ({ ...current, relationshipOrConflict: event.target.value }))} /></label>
                </div>
                <label className="check-field"><input type="checkbox" checked={evidenceDraft.reviewerVerified} onChange={(event) => setEvidenceDraft((current) => ({ ...current, reviewerVerified: event.target.checked }))} /><span>Reviewer verified this evidence</span></label>
                <button className="button primary" onClick={addEvidence}>Add & recalculate</button>
              </section>
              <aside className="evidence-rules">
                <p className="eyebrow">Grade anchors</p>
                {["E0 · Assertion or unknown", "E1 · Secondary research or expert opinion", "E2 · Verified primary observation or direct test", "E3 · Behavior, commitment, telemetry, or adversarial test", "E4 · Repeated paid/production behavior or independent audit"].map((text) => <div key={text}><strong>{text.slice(0, 2)}</strong><span>{text.slice(5)}</span></div>)}
              </aside>
            </div>
            <section className="ledger-section">
              <div className="section-title"><div><p className="eyebrow">Current ledger</p><h2>{state.review.artifacts.length} records</h2></div><span>Cutoff {state.review.cutoffDate}</span></div>
              {state.review.artifacts.length === 0 ? <EmptyState number="E0" title="No evidence attached" text="Claims may still receive a merit score, but unsupported grades must remain E0." /> : (
                <div className="ledger-table">
                  {state.review.artifacts.map((artifact) => (
                    <article key={artifact.artifactId} className={`ledger-row direction-${artifact.direction}`}>
                      <div><code>{artifact.artifactId}</code><strong>{artifact.title}</strong><span title={artifact.sourceExcerpt}>{artifact.evidenceType} · {artifact.evidenceClaimId}{artifact.ingestionOrigin ? " · AI-organized, human-approved" : ""}</span></div>
                      <div><span>Claim</span><strong>{artifact.rubricClaimIds.join(", ")}</strong></div>
                      <div><span>Grade</span><strong>{artifact.grade}</strong></div>
                      <div><span>Direction</span><strong>{artifact.direction}</strong></div>
                      <div><span>Expires</span><strong>{artifact.expiryDate}</strong></div>
                      {artifact.direction === "contradicts" && <button className="button small secondary" onClick={() => acknowledgeEvidence(artifact)}>Acknowledge</button>}
                      <button className="icon-button" aria-label={`Delete ${artifact.title}`} onClick={() => removeEvidence(artifact)}>×</button>
                    </article>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}

        {section === "results" && (
          <div className="page-section results-page">
            <div className={`result-hero ${score.official && score.numericEligible && score.gateEligible ? "eligible" : "blocked"}`}>
              <div><p className="eyebrow">Stage decision instrument</p><h1>{!score.official ? "Validation incomplete" : score.numericEligible && score.gateEligible ? `Ready for ${stageLabels[state.review.stage]} human decision` : `Blocked at ${stageLabels[state.review.stage]}`}</h1><p>{!score.official ? `${score.validationErrors.length} input checks must be resolved before these totals become official.` : `${score.numericBlockers.length} numeric and ${score.gateBlockers.length} gate blockers remain.`}</p></div>
              <div className="result-verdict"><span>Numeric + gate status</span><strong>{score.numericEligible && score.gateEligible ? "READY" : "NOT READY"}</strong><small>Not a final investment or launch decision</small></div>
            </div>
            <div className="metric-grid">
              <Metric label="Raw Thesis Score" value={score.rawThesisScore} note="Merit before evidence discount" />
              <Metric label="Validated Score" value={score.validatedScore} note="Merit × evidence strength" />
              <Metric label="Confidence Index" value={score.evidenceConfidenceIndex} note="How strong the evidence base is" />
              <Metric label="Verified Coverage" value={score.verifiedEvidenceCoverage} note="Rubric weight at E2 or higher" suffix="%" />
            </div>
            <div className="integrity-strip"><span>Policy-adjusted score <strong>{score.policyAdjustedValidatedScore}</strong></span><span>Active cap <strong>{score.policyCap}</strong></span><span>Assessed <strong>{score.assessedClaims}/{score.totalClaims}</strong></span><span>Input fingerprint <code>{score.inputFingerprint}</code></span></div>
            {(score.validationErrors.length > 0 || score.numericBlockers.length > 0 || score.gateBlockers.length > 0) && (
              <div className="issue-columns">
                {score.validationErrors.length > 0 && <IssueList title="Validation errors" items={score.validationErrors} tone="error" />}
                {score.numericBlockers.length > 0 && <IssueList title="Critical floors & thresholds" items={score.numericBlockers} tone="warning" />}
                {score.gateBlockers.length > 0 && <IssueList title="Gate blockers" items={score.gateBlockers} tone="error" />}
              </div>
            )}
            {score.warnings.length > 0 && <IssueList title="Policy caps" items={score.warnings} tone="neutral" />}
            <section className="category-results">
              <div className="section-title"><div><p className="eyebrow">Contribution by category</p><h2>Raw vs. evidence-adjusted</h2></div><span>Scale is relative to each category weight</span></div>
              <div className="bar-table">
                {score.categorySummaries.map((category) => (
                  <div className="bar-row" key={category.id}>
                    <span className="category-number">{category.id.padStart(2, "0")}</span>
                    <div className="bar-copy"><strong>{category.category}</strong><small>{category.assessedClaims}/{category.totalClaims} assessed · {category.verifiedCoverage}% verified</small></div>
                    <div className="paired-bars"><span><i style={{ width: `${Math.min(100, category.rawPoints / category.weight * 100)}%` }} /></span><span><b style={{ width: `${Math.min(100, category.validatedPoints / category.weight * 100)}%` }} /></span></div>
                    <div className="bar-values"><strong>{category.rawPoints}</strong><strong>{category.validatedPoints}</strong></div>
                  </div>
                ))}
              </div>
            </section>
            <div className="integrity-footer"><span>Calculated locally</span><span>Rubric {FRAMEWORK_VERSION}</span><span>Engine {ENGINE_VERSION}</span><span>Manifest {score.rubricManifestSha256.slice(0, 12)}…</span></div>
          </div>
        )}

        {section === "export" && (
          <div className="page-section narrow">
            <PageHeading eyebrow="Import & export" title="Take your work with you." description="Download the complete reasoning or bring an existing review back in. Nothing is published or uploaded by Idea Foundry." />
            <section className="export-card">
              <div className="export-icon">JSON</div><div><h3>Full review packet</h3><p>Project, candidates, 51 claims, evidence ledger, gates, deterministic output, versions, and hashes.</p></div><button className="button primary" onClick={exportPacket}>Download JSON</button>
            </section>
            <section className="export-card">
              <div className="export-icon">CSV</div><div><h3>Claim scorecard</h3><p>One auditable row per canonical claim with locked weights and calculated contributions.</p></div><button className="button secondary" onClick={exportScorecard}>Download CSV</button>
            </section>
            <label className="profile-export"><input type="checkbox" checked={includeProfile} onChange={(event) => setIncludeProfile(event.target.checked)} /><span><strong>Include private profile in JSON</strong><small>Off by default. Profile data is not required to reproduce objective scores.</small></span></label>
            <section className="import-card"><div><p className="eyebrow">Import</p><h2>Recalculate an existing packet</h2><p>Client-supplied computed fields are ignored. The current engine recalculates from review inputs.</p></div><textarea rows={8} value={importText} placeholder="Paste Idea Foundry JSON here" onChange={(event) => setImportText(event.target.value)} /><button className="button secondary" disabled={!importText.trim()} onClick={importPacket}>Validate & import</button></section>
          </div>
        )}
      </section>

      <nav className="mobile-nav" aria-label="Mobile workspace">
        {primaryNavigation.map((item) => <button key={item.id} className={section === item.id ? "active" : ""} onClick={() => { setSection(item.id); setMobileMoreOpen(false); }}>{item.label}</button>)}
        <button className={utilityNavigation.some((item) => item.id === section) ? "active" : ""} aria-expanded={mobileMoreOpen} onClick={() => setMobileMoreOpen((current) => !current)}>More</button>
        {mobileMoreOpen && <div className="mobile-more-menu" role="menu" aria-label="More workspace tools">{utilityNavigation.map((item) => <button role="menuitem" key={item.id} className={section === item.id ? "active" : ""} onClick={() => { setSection(item.id); setMobileMoreOpen(false); }}>{item.label}</button>)}</div>}
      </nav>
      {toast && <div className="toast" role="status">{toast}</div>}
    </main>
  );
}

function Brand({ compact = false }: { compact?: boolean }) {
  if (!compact) return <div className="brand brand-wide"><img src={BRAND_LOGO_URL} alt="Idea Foundry — Xahau + Evernode" /></div>;
  return <div className="brand compact"><img src={BRAND_ICON_URL} alt="" aria-hidden="true" /><span><strong>Idea Foundry</strong><small>Xahau + Evernode</small></span></div>;
}

function PageHeading({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return <header className="page-heading"><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p>{description}</p></header>;
}

function LabeledInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="labeled-input"><span>{label}</span><input value={value} onChange={(event) => onChange(event.target.value)} /></label>;
}

function EmptyState({ number, title, text }: { number: string; title: string; text: string }) {
  return <div className="empty-state"><span>{number}</span><div><h3>{title}</h3><p>{text}</p></div></div>;
}

function WeightTotal({ value }: { value: number }) {
  return <span className={`weight-total ${value === 100 ? "valid" : "invalid"}`}>{value} / 100</span>;
}

function WeightEditor({ title, subtitle, items, onChange }: { title: string; subtitle: string; items: GenerationProfile["searchThemes"]; onChange: (items: GenerationProfile["searchThemes"]) => void }) {
  const total = items.reduce((sum, item) => sum + item.weight, 0);
  return (
    <section className="form-card">
      <div className="form-card-head"><div><h3>{title}</h3><p>{subtitle}</p></div><WeightTotal value={total} /></div>
      <div className="weight-list">
        {items.map((item, index) => <div key={item.id}><span>{String(index + 1).padStart(2, "0")}</span><input aria-label={`${title} label ${index + 1}`} value={item.label} onChange={(event) => onChange(items.map((current) => current.id === item.id ? { ...current, label: event.target.value } : current))} /><input aria-label={`${item.label} weight`} type="number" min="0" max="100" value={item.weight} onChange={(event) => onChange(items.map((current) => current.id === item.id ? { ...current, weight: Number(event.target.value) } : current))} /><b>%</b><button aria-label={`Remove ${item.label}`} disabled={items.length <= 3} onClick={() => onChange(items.filter((current) => current.id !== item.id))}>×</button></div>)}
      </div>
      <button className="text-button" disabled={items.length >= (title === "Search themes" ? 6 : 8)} onClick={() => onChange([...items, { id: crypto.randomUUID(), label: "New dimension", weight: 0 }])}>+ Add dimension</button>
    </section>
  );
}

function Metric({ label, value, note, suffix = "" }: { label: string; value: number; note: string; suffix?: string }) {
  return <article className="metric-card"><span>{label}</span><div><strong>{value.toFixed(1)}</strong><small>{suffix || "/ 100"}</small></div><p>{note}</p></article>;
}

function IssueList({ title, items, tone }: { title: string; items: string[]; tone: "error" | "warning" | "neutral" }) {
  return <section className={`issue-list ${tone}`}><div><span aria-hidden="true">{tone === "error" ? "×" : tone === "warning" ? "!" : "i"}</span><h3>{title}</h3><small>{items.length}</small></div><ul>{items.map((item) => <li key={item}>{item}</li>)}</ul></section>;
}

function QuickRunGuide({ phase, message, hasEvidence, remoteModel, onContinue, onExit }: {
  phase: QuickRunPhase;
  message: string;
  hasEvidence: boolean;
  remoteModel: boolean;
  onContinue: () => void;
  onExit: () => void;
}) {
  const steps = ["Idea", "Evaluation", "Evidence", "Gates", "Decision"];
  const activeIndex = phase === "generating" || phase === "choose-idea" ? 0
    : phase === "drafting-evaluation" || phase === "approve-evaluation" ? 1
      : phase === "evidence" ? 2
        : phase === "refreshing-gates" || phase === "approve-gates" ? 3
          : 4;
  const continueLabel = phase === "choose-idea" ? "Choose an idea"
    : phase === "approve-evaluation" ? "Continue without applying"
      : phase === "evidence" ? remoteModel ? "Send & refresh gates" : hasEvidence ? "Continue with current evidence" : "Continue evidence-free"
        : phase === "approve-gates" ? "See deterministic decision"
          : phase === "decision" ? "Open decision" : "";
  return (
    <section className="quick-run-guide" aria-label="Quick Run progress">
      <div className="quick-run-guide-copy"><span>Quick Run</span><strong>{message}</strong><small>{remoteModel ? "Cloud model: each AI step confirms before project or evidence context is sent." : "Local model: AI context stays on this computer."}</small></div>
      <ol>{steps.map((step, index) => <li className={index < activeIndex ? "done" : index === activeIndex ? "active" : ""} key={step}><i>{index < activeIndex ? "✓" : index + 1}</i><span>{step}</span></li>)}</ol>
      <div>{continueLabel && <button className="button small primary" onClick={onContinue}>{continueLabel}</button>}<button className="text-button" onClick={onExit}>Exit</button></div>
    </section>
  );
}

function Overview({ state, score, selectedIdea, desktopAvailable, llmReady, quickRunBusy, onQuickRun, onNavigate, onUpdateProject }: {
  state: AppState;
  score: ReturnType<typeof scoreReview>;
  selectedIdea?: IdeaCandidate;
  desktopAvailable: boolean;
  llmReady: boolean;
  quickRunBusy: boolean;
  onQuickRun: () => void;
  onNavigate: (section: Section) => void;
  onUpdateProject: (patch: Partial<ProjectDetails>) => void;
}) {
  const steps = [
    { id: "ideas" as const, number: "01", title: "Find & choose an idea", meta: selectedIdea ? "Idea chosen" : `${state.ideas.length} ideas`, done: Boolean(selectedIdea) },
    { id: "review" as const, number: "02", title: "Evaluate what must be true", meta: `${score.assessedClaims}/${score.totalClaims} answered`, done: score.assessedClaims === score.totalClaims },
    { id: "evidence" as const, number: "03", title: "Add proof", meta: `${state.review.artifacts.length} evidence records`, done: state.review.artifacts.length > 0 },
    { id: "results" as const, number: "04", title: "Read the decision", meta: score.official ? (score.numericEligible && score.gateEligible ? "Ready" : "Blocked") : "Provisional", done: score.official },
  ];
  return (
    <div className="page-section overview-page">
      <PageHeading eyebrow="Your project" title="Forge better ideas. Prove what holds." description="Move from a blank page to a clear decision without mixing personal preference, AI suggestions, and real evidence." />
      <section className="quick-run-launch">
        <div><span className="quick-run-kicker">Optional guided automation</span><h2>Run the whole workflow with fewer clicks</h2><p>Quick Run generates ideas when needed, drafts the evaluation, organizes sources you provide, refreshes gates, and opens the deterministic decision. It pauses whenever only you can honestly approve something.</p><small>Idea → Evaluation → Evidence → Gates → Decision · Cloud models confirm before context is sent</small></div>
        <div><strong>AI drafts. You approve.</strong><button className="button primary" disabled={quickRunBusy} onClick={onQuickRun}>{quickRunBusy ? "Quick Run working…" : desktopAvailable && llmReady ? "Start Quick Run" : desktopAvailable ? "Connect model to start" : "Open model options"}</button></div>
      </section>
      <div className="overview-grid">
        <section className="overview-main">
          <div className="setup-card">
            <p className="eyebrow">Project boundary</p>
            <label><span>Working title</span><input value={state.project.title} onChange={(event) => onUpdateProject({ title: event.target.value })} /></label>
            <label><span>Domain or opportunity boundary</span><textarea rows={3} value={state.project.domain} placeholder="Example: coordination failures in independent service marketplaces" onChange={(event) => onUpdateProject({ domain: event.target.value })} /></label>
          </div>
          <div className="workflow-list">
            {steps.map((step) => <button key={step.id} onClick={() => onNavigate(step.id)}><span className={step.done ? "done" : ""}>{step.done ? "✓" : step.number}</span><div><strong>{step.title}</strong><small>{step.meta}</small></div><b>→</b></button>)}
          </div>
        </section>
        <aside className="overview-aside">
          <div className="current-thesis"><img className="thesis-mark" src={BRAND_MARK_URL} alt="" aria-hidden="true" /><p className="eyebrow">Current idea</p><h2>{selectedIdea?.title || "No idea selected"}</h2><p>{selectedIdea?.concept || "Generate ideas or add your own, then choose one to evaluate."}</p><button className="button secondary" onClick={() => onNavigate(selectedIdea ? "review" : "ideas")}>{selectedIdea ? "Continue evaluation" : "Find an idea"}</button></div>
          <div className="boundary-card"><strong>What the app decides</strong><ul><li>Whether inputs are valid</li><li>What the locked formula calculates</li><li>Which caps, floors, and gates block the target stage</li></ul><strong>What humans still decide</strong><ul><li>Whether to invest, launch, or proceed</li><li>Whether evidence is truthful and sufficient</li><li>Whether the team should pursue the idea</li></ul></div>
        </aside>
      </div>
    </div>
  );
}
