"use client";

import { useEffect, useMemo, useState } from "react";
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
import type {
  LlmConfig,
  LlmConnectionOptions,
  LlmProvider,
  NormalizedGeneratedIdea,
  SaveLlmConfigInput,
} from "./desktop-bridge";

type Section = "overview" | "ideas" | "profile" | "model" | "review" | "evidence" | "results" | "export";

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
    location: "Cloud · API key",
    remote: true,
    keyRequired: true,
    lockedEndpoint: true,
  },
  openaiCompatible: {
    label: "OpenAI-compatible",
    defaultUrl: "https://api.openai.com/v1",
    boundary: "May be local or cloud. Prompts leave this computer whenever the endpoint is remote.",
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
  const [state, setState] = useState<AppState>(defaultState);
  const [hydrated, setHydrated] = useState(false);
  const [toast, setToast] = useState("");
  const [includeProfile, setIncludeProfile] = useState(false);
  const [importText, setImportText] = useState("");
  const [desktopVersion, setDesktopVersion] = useState("");
  const [llmConfig, setLlmConfig] = useState<LlmConfig>(DEFAULT_LLM_CONFIG);
  const [llmApiKey, setLlmApiKey] = useState("");
  const [clearLlmApiKey, setClearLlmApiKey] = useState(false);
  const [llmModels, setLlmModels] = useState<Array<{ id: string; name: string }>>([]);
  const [llmBusy, setLlmBusy] = useState<"loading" | "saving" | "testing" | "models" | null>(null);
  const [llmMessage, setLlmMessage] = useState("");
  const [llmMessageTone, setLlmMessageTone] = useState<"neutral" | "success" | "error">("neutral");
  const [ideaCount, setIdeaCount] = useState(8);
  const [generatingIdeas, setGeneratingIdeas] = useState(false);
  const [lastGeneration, setLastGeneration] = useState<{ provider: string; model: string; count: number } | null>(null);
  const [evidenceDraft, setEvidenceDraft] = useState({
    title: "",
    claimId: "1A",
    evidenceType: "CustomerObservation" as EvidenceType,
    grade: "E2" as EvidenceGrade,
    direction: "supports" as "supports" | "contradicts",
    evidenceDate: today(),
    expiryDate: oneYearFromToday(),
    reviewerVerified: false,
    reviewer: "",
    relationshipOrConflict: "None",
  });
  const desktopAvailable = typeof window === "undefined" ? null : window.ideaFoundry?.desktop === true;
  const selectedLlmProvider = LLM_PROVIDERS[llmConfig.provider];
  const llmHasUsableApiKey = Boolean(llmApiKey.trim() || (llmConfig.hasApiKey && !clearLlmApiKey));
  const llmReady = Boolean(llmConfig.model.trim() && (!selectedLlmProvider.keyRequired || llmHasUsableApiKey));

  useEffect(() => {
    const bridge = window.ideaFoundry;
    if (!bridge?.desktop) return;

    let cancelled = false;
    Promise.all([bridge.app.getVersion(), bridge.llm.getConfig()])
      .then(([version, config]) => {
        if (cancelled) return;
        setDesktopVersion(version);
        setLlmConfig(normalizeLlmConfig(config));
        setLlmMessage("Connector settings loaded from this computer.");
        setLlmMessageTone("neutral");
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setLlmMessage(error instanceof Error ? error.message : "Could not load the local connector settings.");
        setLlmMessageTone("error");
      })
      .finally(() => {
        if (!cancelled) setLlmBusy(null);
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

  const score = useMemo(() => scoreReview(state.review), [state.review]);
  const profileErrors = useMemo(() => validateGenerationProfile(state.profile), [state.profile]);
  const selectedIdea = state.ideas.find((idea) => idea.id === state.project.selectedIdeaId);
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

  function updateReview(patch: Partial<ReviewInput>) {
    setState((current) => ({ ...current, review: { ...current.review, ...patch } }));
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
    setState((current) => ({
      ...current,
      project: { ...current.project, title: idea.title, selectedIdeaId: idea.id },
    }));
    setSection("review");
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

  async function saveLlmSettings() {
    const bridge = window.ideaFoundry;
    if (!bridge?.desktop) throw new Error("The model connector is available in the desktop app.");
    setLlmBusy("saving");
    setLlmMessage("Saving this connector on your computer…");
    setLlmMessageTone("neutral");
    try {
      const saved = await bridge.llm.saveConfig(currentLlmInput());
      const normalized = normalizeLlmConfig(saved);
      setLlmConfig(normalized);
      setLlmApiKey("");
      setClearLlmApiKey(false);
      setLlmMessage("Connector saved locally. API credentials are protected by the operating system.");
      setLlmMessageTone("success");
      return normalized;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not save the connector.";
      setLlmMessage(message);
      setLlmMessageTone("error");
      throw error;
    } finally {
      setLlmBusy(null);
    }
  }

  async function testLlmConnection() {
    const bridge = window.ideaFoundry;
    if (!bridge?.desktop) return;
    setLlmBusy("testing");
    setLlmMessage("Testing the endpoint without sending project data…");
    setLlmMessageTone("neutral");
    try {
      const result = await bridge.llm.testConnection(currentLlmInput() as LlmConnectionOptions);
      setLlmMessage(result.message || (result.ok ? "Connection succeeded." : "Connection failed."));
      setLlmMessageTone(result.ok ? "success" : "error");
    } catch (error) {
      setLlmMessage(error instanceof Error ? error.message : "Connection failed.");
      setLlmMessageTone("error");
    } finally {
      setLlmBusy(null);
    }
  }

  async function refreshLlmModels() {
    const bridge = window.ideaFoundry;
    if (!bridge?.desktop) return;
    setLlmBusy("models");
    setLlmMessage("Reading the models exposed by this endpoint…");
    setLlmMessageTone("neutral");
    try {
      const models = await bridge.llm.listModels(currentLlmInput() as LlmConnectionOptions);
      setLlmModels(models);
      if (!llmConfig.model && models.length === 1) {
        setLlmConfig((current) => ({ ...current, model: models[0].id }));
      }
      setLlmMessage(models.length ? `${models.length} model${models.length === 1 ? "" : "s"} available.` : "The endpoint returned no models.");
      setLlmMessageTone(models.length ? "success" : "error");
    } catch (error) {
      setLlmModels([]);
      setLlmMessage(error instanceof Error ? error.message : "Could not list models.");
      setLlmMessageTone("error");
    } finally {
      setLlmBusy(null);
    }
  }

  async function generateWithConnectedLlm() {
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

    setGeneratingIdeas(true);
    try {
      const saved = normalizeLlmConfig(await bridge.llm.saveConfig(currentLlmInput()));
      setLlmConfig(saved);
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
      const generatedAt = new Date().toISOString();
      const candidates = result.ideas
        .map((idea: NormalizedGeneratedIdea) => validateGeneratedIdea(idea, state.profile.mode === "private"))
        .filter((idea): idea is Omit<IdeaCandidate, "id" | "source"> => idea !== null)
        .map((idea) => ({
          ...idea,
          id: crypto.randomUUID(),
          source: { kind: "llm" as const, provider: result.provider, model: result.model, generatedAt },
        }));
      if (candidates.length === 0) throw new Error("The model returned no ideas that passed the local schema.");
      setState((current) => ({ ...current, ideas: [...current.ideas, ...candidates] }));
      setLastGeneration({ provider: result.provider, model: result.model, count: candidates.length });
      setToast(`${candidates.length} AI hypotheses added`);
    } catch (error) {
      setLlmMessage(error instanceof Error ? error.message : "Idea generation failed.");
      setLlmMessageTone("error");
      setSection("model");
    } finally {
      setGeneratingIdeas(false);
    }
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
    const suffix = String(state.review.artifacts.length + 1).padStart(3, "0");
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
    updateReview({ artifacts: [...state.review.artifacts, artifact] });
    if (artifact.direction === "supports") {
      const claim = state.review.claims.find((item) => item.claimId === artifact.rubricClaimIds[0]);
      updateClaim(artifact.rubricClaimIds[0], {
        grade: artifact.grade,
        evidenceClaimIds: [...new Set([...(claim?.evidenceClaimIds ?? []), artifact.evidenceClaimId])],
        evidenceArtifactIds: [...new Set([...(claim?.evidenceArtifactIds ?? []), artifact.artifactId])],
      });
    }
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
            <p className="hero-lede">Generate a focused slate, test 51 weighted claims, and see what the evidence actually supports.</p>
            <div className="hero-actions">
              <button className="button primary" onClick={() => start("neutral")}>Start profile-neutral <span aria-hidden="true">→</span></button>
              <button className="button secondary" onClick={() => start("private")}>Build a private profile</button>
            </div>
            <p className="trust-line">No account · Saved on this device · Nothing is shared automatically</p>
            <div className="method-strip" aria-label="Method">
              {[["01", "Generate candidates"], ["02", "Challenge assumptions"], ["03", "Attach evidence"], ["04", "Calculate readiness"]].map(([number, label]) => (
                <div key={number}><span>{number}</span><strong>{label}</strong></div>
              ))}
            </div>
          </div>
          <aside className="specimen" aria-label="Illustrative result specimen">
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

  const navigation: Array<{ id: Section; label: string; meta?: string }> = [
    { id: "overview", label: "Overview" },
    { id: "ideas", label: "Ideas", meta: String(state.ideas.length) },
    { id: "profile", label: "Profile", meta: state.profile.mode === "private" ? (profileErrors.length ? "!" : "P") : "N" },
    { id: "model", label: "LLM", meta: desktopAvailable && llmReady ? "✓" : "—" },
    { id: "review", label: "Review", meta: `${score.assessedClaims}/${score.totalClaims}` },
    { id: "evidence", label: "Evidence", meta: String(state.review.artifacts.length) },
    { id: "results", label: "Results", meta: score.numericEligible && score.gateEligible ? "✓" : "!" },
    { id: "export", label: "Export" },
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
          {navigation.map((item) => (
            <button key={item.id} className={section === item.id ? "active" : ""} onClick={() => setSection(item.id)}>
              <span className="nav-mark" aria-hidden="true" />
              <span>{item.label}</span>
              {item.meta && <small>{item.meta}</small>}
            </button>
          ))}
        </nav>
        <div className="rail-footer">
          <div><span>Privacy</span><strong>{state.profile.mode === "private" ? "Private profile" : "Profile-neutral"}</strong></div>
          <div><span>Rubric</span><strong>v3 · 51 claims</strong></div>
          <button className="text-button danger" onClick={() => {
            if (window.confirm("Clear this locally saved workspace?")) {
              localStorage.removeItem(STORAGE_KEY);
              setState(defaultState());
              setSection("overview");
            }
          }}>Clear local data</button>
        </div>
      </aside>

      <section className="workspace">
        {section === "overview" && (
          <Overview
            state={state}
            score={score}
            selectedIdea={selectedIdea}
            onNavigate={setSection}
            onUpdateProject={(patch) => setState((current) => ({ ...current, project: { ...current.project, ...patch } }))}
          />
        )}

        {section === "ideas" && (
          <div className="page-section">
            <PageHeading eyebrow="Exploration workspace" title="Generate candidates before you defend one." description="Idea priority is a search heuristic. It never changes the objective 51-claim score." />
            <div className="notice neutral"><strong>Profile boundary</strong><span>{state.profile.mode === "private" ? "Your private profile changes ranking only—not evidence, gates, weights, or readiness." : "Neutral mode ignores personal fit and ranks only opportunity, protocol affordance, and experimentability."}</span></div>
            <div className="idea-toolbar">
              <button className="button primary" disabled={generatingIdeas} onClick={generateWithConnectedLlm}>
                {generatingIdeas ? "Generating hypotheses…" : "Generate with connected LLM"}
              </button>
              <button className="button primary" onClick={loadStarterSlate}>Load editable starter slate</button>
              <button className="button secondary" onClick={addIdea}>Add idea manually</button>
              <button className="button ghost" onClick={() => copyText(prompt, "LLM prompt copied")}>Copy generation prompt</button>
            </div>
            <div className="generation-status">
              <span className={desktopAvailable && llmReady ? "connected" : "disconnected"} aria-hidden="true" />
              <strong>{desktopAvailable && llmReady ? `${LLM_PROVIDERS[llmConfig.provider].label} · ${llmConfig.model}` : "No model selected"}</strong>
              <button className="text-button" onClick={() => setSection("model")}>Connector settings →</button>
              {lastGeneration && <small>Last slate: {lastGeneration.count} ideas from {lastGeneration.model}</small>}
            </div>
            <details className="prompt-panel">
              <summary>Use with any LLM</summary>
              <p>The LLM proposes hypotheses. This app remains the only calculator.</p>
              <textarea readOnly value={prompt} rows={9} aria-label="Idea generation prompt" />
            </details>
            {sortedIdeas.length === 0 ? (
              <EmptyState number="00" title="No candidates yet" text="Load four falsifiable examples, add your own, or copy the profile-aware prompt into your preferred LLM." />
            ) : (
              <div className="idea-list">
                {sortedIdeas.map((idea, index) => {
                  const priority = calculateGenerationPriority(state.profile, idea.scores);
                  return (
                    <article className="idea-card" key={idea.id}>
                      <div className="idea-rank"><span>#{String(index + 1).padStart(2, "0")}</span><strong>{priority}</strong><small>search priority</small></div>
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
                          <LabeledInput label="Buyer" value={idea.buyer} onChange={(value) => updateIdea(idea.id, { buyer: value })} />
                          <LabeledInput label="Current alternative" value={idea.currentAlternative} onChange={(value) => updateIdea(idea.id, { currentAlternative: value })} />
                          <LabeledInput label="Critical assumption" value={idea.criticalAssumption} onChange={(value) => updateIdea(idea.id, { criticalAssumption: value })} />
                        </div>
                        <LabeledInput label="14-day falsification experiment" value={idea.experiment} onChange={(value) => updateIdea(idea.id, { experiment: value })} />
                        <div className="score-sliders">
                          {(Object.keys(idea.scores) as Array<keyof GenerationComponentScores>).map((key) => (
                            <label key={key} className={key === "personalFit" && state.profile.mode === "neutral" ? "disabled" : ""}>
                              <span>{key.replace(/([A-Z])/g, " $1")} <b>{idea.scores[key]}</b></span>
                              <input type="range" min="0" max="100" value={idea.scores[key]} disabled={key === "personalFit" && state.profile.mode === "neutral"} onChange={(event) => updateIdea(idea.id, { scores: { ...idea.scores, [key]: Number(event.target.value) } })} />
                            </label>
                          ))}
                        </div>
                        <div className="idea-actions">
                          <span>Exploration only · not validated{idea.source ? ` · AI draft from ${idea.source.model}` : ""}</span>
                          <button className="button small primary" onClick={() => beginReview(idea)}>Start 51-claim review</button>
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
            <PageHeading eyebrow="Optional model intelligence" title="Connect a model without surrendering the calculator." description="Your model may propose hypotheses. Only confirmed human inputs enter the deterministic evidence review." />
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
                <div className="model-boundary-grid">
                  <article><span>01</span><strong>Model proposes</strong><p>Ideas, assumptions, interview questions, and experiments enter as editable hypotheses.</p></article>
                  <article><span>02</span><strong>You confirm</strong><p>No model output becomes evidence, a grade, or a gate decision automatically.</p></article>
                  <article><span>03</span><strong>Engine calculates</strong><p>The locked 51-claim rules engine remains provider-independent and deterministic.</p></article>
                </div>

                <section className="form-card model-config-card">
                  <div className="form-card-head">
                    <div><h3>Model endpoint</h3><p>{desktopVersion ? `Desktop ${desktopVersion} · ` : ""}Stored only on this computer</p></div>
                    <span className={`connector-state ${llmReady ? "ready" : "idle"}`}>{llmReady ? "Configured" : "Not configured"}</span>
                  </div>
                  <div className="provider-picker" role="group" aria-label="LLM provider">
                    {(Object.keys(LLM_PROVIDERS) as LlmProvider[]).map((provider) => (
                      <button
                        key={provider}
                        className={llmConfig.provider === provider ? "active" : ""}
                        onClick={() => {
                          setLlmConfig({ provider, baseUrl: LLM_PROVIDERS[provider].defaultUrl, model: "", hasApiKey: false });
                          setLlmApiKey("");
                          setClearLlmApiKey(false);
                          setLlmModels([]);
                          setLlmMessage("");
                        }}
                      >
                        <strong>{LLM_PROVIDERS[provider].label}</strong>
                        <span>{LLM_PROVIDERS[provider].location}</span>
                      </button>
                    ))}
                  </div>
                  <div className={`endpoint-boundary ${selectedLlmProvider.remote ? "remote-warning" : "local"}`}>
                    <strong>{selectedLlmProvider.remote ? "Cloud boundary" : "Local endpoint"}</strong>
                    <span>{selectedLlmProvider.boundary}</span>
                  </div>
                  <div className="model-field-grid">
                    <label className="full-field">
                      <span>Base URL</span>
                      <input value={llmConfig.baseUrl} spellCheck={false} readOnly={selectedLlmProvider.lockedEndpoint} aria-readonly={selectedLlmProvider.lockedEndpoint} onChange={(event) => setLlmConfig((current) => ({ ...current, baseUrl: event.target.value }))} />
                    </label>
                    <label className="full-field">
                      <span>Model</span>
                      <input list="available-llm-models" value={llmConfig.model} placeholder="Choose or enter a model ID" onChange={(event) => setLlmConfig((current) => ({ ...current, model: event.target.value }))} />
                      <datalist id="available-llm-models">{llmModels.map((model) => <option key={model.id} value={model.id}>{model.name}</option>)}</datalist>
                    </label>
                    <label className="full-field model-key-field">
                      <span>API key {selectedLlmProvider.keyRequired ? "(required)" : "(optional)"}</span>
                      <input type="password" autoComplete="off" required={selectedLlmProvider.keyRequired} aria-required={selectedLlmProvider.keyRequired} value={llmApiKey} placeholder={llmConfig.hasApiKey ? "A protected key is already saved" : selectedLlmProvider.keyRequired ? "Paste your OpenRouter API key" : "Leave blank when the endpoint needs no key"} onChange={(event) => { setLlmApiKey(event.target.value); setClearLlmApiKey(false); }} />
                      <small>{llmConfig.provider === "openrouter" ? "Stored with operating-system encryption; never written to projects, exports, or browser storage." : "Never written to project files or browser storage."}</small>
                    </label>
                    <label className="idea-count-field">
                      <span>Ideas per slate</span>
                      <input type="number" min="1" max="12" value={ideaCount} onChange={(event) => setIdeaCount(Math.max(1, Math.min(12, Number(event.target.value) || 1)))} />
                    </label>
                  </div>
                  {llmConfig.hasApiKey && (selectedLlmProvider.keyRequired ? (
                    <p className="required-key-note">To remove this required key, choose another provider and save it. Paste a new key above to replace it.</p>
                  ) : (
                    <label className="check-field clear-key-field"><input type="checkbox" checked={clearLlmApiKey} onChange={(event) => setClearLlmApiKey(event.target.checked)} /><span>Remove the saved API key</span></label>
                  ))}
                  <div className="model-actions">
                    <button className="button secondary" disabled={llmBusy !== null} onClick={refreshLlmModels}>{llmBusy === "models" ? "Reading models…" : "Refresh models"}</button>
                    <button className="button secondary" disabled={llmBusy !== null} onClick={testLlmConnection}>{llmBusy === "testing" ? "Testing…" : "Test connection"}</button>
                    <button className="button primary" disabled={llmBusy !== null} onClick={() => void saveLlmSettings()}>{llmBusy === "saving" ? "Saving…" : "Save locally"}</button>
                  </div>
                  {llmMessage && <div className={`connector-message ${llmMessageTone}`} role="status">{llmMessage}</div>}
                </section>

                <section className="model-generation-card">
                  <div><p className="eyebrow">Ready when you are</p><h2>Generate an editable hypothesis slate</h2><p>The current profile and domain boundary will be included. With a remote endpoint, that selected context leaves this computer.</p></div>
                  <button className="button primary" disabled={generatingIdeas || !llmReady} onClick={generateWithConnectedLlm}>{generatingIdeas ? "Generating…" : `Generate ${ideaCount} ideas`}</button>
                </section>
              </>
            )}
          </div>
        )}

        {section === "profile" && (
          <div className="page-section narrow">
            <PageHeading eyebrow="Private ranking layer" title="Shape the search without contaminating the score." description="Your profile affects candidate order and role design only. Objective opportunity scores remain invariant." />
            <div className="mode-switch" role="group" aria-label="Profile mode">
              <button className={state.profile.mode === "neutral" ? "active" : ""} onClick={() => setState((current) => ({ ...current, profile: emptyProfile("neutral") }))}><strong>Profile-neutral</strong><span>No personal-preference inputs</span></button>
              <button className={state.profile.mode === "private" ? "active" : ""} onClick={() => setState((current) => ({ ...current, profile: emptyProfile("private") }))}><strong>Private profile</strong><span>Weighted fit and search themes</span></button>
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
                <section className="form-card">
                  <div className="form-card-head"><div><h3>Generation Priority weights</h3><p>Personal 25–45 · Opportunity 25–40 · Protocol 10–25 · Experiment 15–25</p></div><WeightTotal value={Object.values(state.profile.generationWeights).reduce((sum, weight) => sum + weight, 0)} /></div>
                  <div className="outer-weights">
                    {(Object.keys(state.profile.generationWeights) as Array<keyof GenerationProfile["generationWeights"]>).map((key) => (
                      <label key={key}><span>{key.replace(/([A-Z])/g, " $1")}</span><div><input type="number" min="0" max="100" value={state.profile.generationWeights[key]} onChange={(event) => setState((current) => ({ ...current, profile: { ...current.profile, locked: false, generationWeights: { ...current.profile.generationWeights, [key]: Number(event.target.value) } } }))} /><b>%</b></div></label>
                    ))}
                  </div>
                </section>
                {profileErrors.length > 0 && <IssueList title="Fix before locking" items={profileErrors} tone="warning" />}
                <div className="profile-lock-row"><span>Only this minimized weight profile is stored. Raw interview notes are not collected.</span><button className="button primary" disabled={profileErrors.length > 0} onClick={() => { setState((current) => ({ ...current, profile: { ...current.profile, locked: true } })); setToast("Private profile locked locally"); }}>{state.profile.locked ? "Profile locked" : "Lock profile"}</button></div>
              </>
            )}
          </div>
        )}

        {section === "review" && (
          <div className="page-section">
            <PageHeading eyebrow="Deterministic review" title="Assess the thesis claim by claim." description="Blank merit is Unassessed. Unsupported evidence starts at E0. The calculator never fills gaps optimistically." />
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
            <PageHeading eyebrow="Evidence ledger" title="Make every grade traceable." description="Evidence is checked for grade ceilings, expiry, reviewer verification, duplicates, claim links, and undisclosed counterevidence." />
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
                      <div><code>{artifact.artifactId}</code><strong>{artifact.title}</strong><span>{artifact.evidenceType} · {artifact.evidenceClaimId}</span></div>
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
            <PageHeading eyebrow="Portable review packet" title="Export the reasoning, not just the number." description="Downloads stay on this device. Nothing is published or uploaded by Idea Foundry." />
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
        {navigation.filter((item) => ["overview", "ideas", "review", "evidence", "results"].includes(item.id)).map((item) => <button key={item.id} className={section === item.id ? "active" : ""} onClick={() => setSection(item.id)}>{item.label}</button>)}
      </nav>
      {toast && <div className="toast" role="status">{toast}</div>}
    </main>
  );
}

function Brand({ compact = false }: { compact?: boolean }) {
  return <div className={`brand ${compact ? "compact" : ""}`}><span className="brand-mark" aria-hidden="true"><i /><b /><em /></span><span><strong>Idea Foundry</strong><small>Xahau + Evernode</small></span></div>;
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

function Overview({ state, score, selectedIdea, onNavigate, onUpdateProject }: { state: AppState; score: ReturnType<typeof scoreReview>; selectedIdea?: IdeaCandidate; onNavigate: (section: Section) => void; onUpdateProject: (patch: Partial<ProjectDetails>) => void }) {
  const steps = [
    { id: "ideas" as const, number: "01", title: "Generate & shortlist", meta: `${state.ideas.length} candidates`, done: state.ideas.length > 0 },
    { id: "profile" as const, number: "02", title: "Set search profile", meta: state.profile.mode === "private" ? (state.profile.locked ? "Locked" : "Draft") : "Neutral", done: state.profile.mode === "neutral" || state.profile.locked },
    { id: "review" as const, number: "03", title: "Assess 51 claims", meta: `${score.assessedClaims}/${score.totalClaims}`, done: score.assessedClaims === score.totalClaims },
    { id: "evidence" as const, number: "04", title: "Verify evidence", meta: `${state.review.artifacts.length} records`, done: state.review.artifacts.length > 0 },
    { id: "results" as const, number: "05", title: "Read the decision", meta: score.official ? (score.numericEligible && score.gateEligible ? "Ready" : "Blocked") : "Provisional", done: score.official },
  ];
  return (
    <div className="page-section overview-page">
      <PageHeading eyebrow="Decision workspace" title="Turn enthusiasm into a testable thesis." description="One workspace keeps personal search fit, market evidence, protocol necessity, and stage readiness deliberately separate." />
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
          <div className="current-thesis"><p className="eyebrow">Current thesis</p><h2>{selectedIdea?.title || "No idea selected"}</h2><p>{selectedIdea?.concept || "Shortlist a candidate to begin an immutable evidence review."}</p><button className="button secondary" onClick={() => onNavigate(selectedIdea ? "review" : "ideas")}>{selectedIdea ? "Continue review" : "Explore ideas"}</button></div>
          <div className="boundary-card"><strong>What the app decides</strong><ul><li>Whether inputs are valid</li><li>What the locked formula calculates</li><li>Which caps, floors, and gates block the target stage</li></ul><strong>What humans still decide</strong><ul><li>Whether to invest, launch, or proceed</li><li>Whether evidence is truthful and sufficient</li><li>Whether the team should pursue the idea</li></ul></div>
        </aside>
      </div>
    </div>
  );
}
