export type IntelligenceTask = "competitor_red_team" | "idea_forge";

export interface IntelligenceIdeaContext {
  title: string;
  concept: string;
  user: string;
  buyer: string;
  currentAlternative: string;
  criticalAssumption: string;
  experiment: string;
  route: "Xahau" | "Evernode" | "Both" | "Neither yet";
}

export interface IntelligencePublicSource {
  sourceId: string;
  url: string;
  title: string;
  content: string;
  contentSha256: string;
}

export interface CompetitorRedTeamRunInput {
  task: "competitor_red_team";
  context: {
    idea: IntelligenceIdeaContext;
    projectBoundary: string;
    publicSources: IntelligencePublicSource[];
  };
  limits: {
    timeoutMs: number;
    maxSources: number;
  };
}

export interface IdeaForgeWeightedDimension {
  label: string;
  weight: number;
}

export interface IdeaForgeWorkStylePreference {
  label: string;
  orientation: string;
}

export interface IdeaForgeRunInput {
  task: "idea_forge";
  context: {
    opportunityBoundary: string;
    requestedCount: number;
    profile: {
      mode: "neutral" | "private";
      searchThemes: IdeaForgeWeightedDimension[];
      fitDimensions: IdeaForgeWeightedDimension[];
      workStylePreferences: IdeaForgeWorkStylePreference[];
    };
  };
  limits: {
    timeoutMs: number;
  };
}

export type IntelligenceRunInput = CompetitorRedTeamRunInput | IdeaForgeRunInput;

export interface IntelligenceCompetitorFinding {
  name: string;
  category: string;
  overlap: string;
  competitorAdvantage: string;
  ideaAdvantage: string;
  evidenceBasis: "provided_source" | "model_hypothesis";
  sourceIds: string[];
  confidence: "low" | "medium" | "high";
}

export interface IntelligenceFatalAssumption {
  assumption: string;
  failureMode: string;
  severity: "low" | "medium" | "high" | "critical";
  rationale: string;
}

export interface IntelligenceDisconfirmingTest {
  test: string;
  signal: string;
  stopCondition: string;
}

export interface IntelligenceResult {
  provisional: true;
  evidenceKind: "public_context";
  customerValidation: false;
  analysis: {
    summary: string;
    competitors: IntelligenceCompetitorFinding[];
    redTeam: {
      fatalAssumptions: IntelligenceFatalAssumption[];
      counterarguments: string[];
      disconfirmingTests: IntelligenceDisconfirmingTest[];
      goForwardConditions: string[];
    };
    confidence: "low" | "medium" | "high";
    limitations: string[];
  };
}

export type IdeaForgeExperimentMethod =
  | "observation"
  | "concierge"
  | "prototype"
  | "commitment"
  | "landing_page"
  | "technical_spike";

export interface IdeaForgeExperimentPlan {
  durationDays: number;
  method: IdeaForgeExperimentMethod;
  target: string;
  sampleSize: number | null;
  artifact: string;
  metric: string;
  passThreshold: string;
  killThreshold: string;
}

export interface IdeaForgeScores {
  personalFit: number | null;
  opportunitySignal: number;
  protocolAffordance: number;
  experimentability: number;
}

export interface IdeaForgeIdea {
  title: string;
  concept: string;
  user: string;
  buyer: string;
  triggeringSituation: string;
  currentAlternative: string;
  materialConsequence: string;
  whyNow: string;
  distributionWedge: string;
  adoptionFriction: string;
  protocolNeed: string;
  protocolCounterfactual: string;
  failureReason: string;
  criticalAssumption: string;
  experiment: string;
  experimentPlan: IdeaForgeExperimentPlan;
  route: "Xahau" | "Evernode" | "Both" | "Neither yet";
  scores: IdeaForgeScores;
}

export interface IdeaForgeResult {
  task: "idea_forge";
  provisional: true;
  evidenceKind: "hypothesis";
  customerValidation: false;
  pipelineVersion: "idea-forge/1.0.0";
  ideas: IdeaForgeIdea[];
  diagnostics: {
    framesGenerated: number;
    rawCandidatesGenerated: number;
    candidatesReturned: number;
    method: "frame-diverge-critique";
  };
}

export interface IntelligenceProgress {
  phase: string;
  message: string;
  percent?: number;
}

export type IntelligenceRunOutcome =
  | { kind: "completed"; result: IntelligenceResult }
  | { kind: "unavailable"; message: string }
  | { kind: "failed"; message: string };

export type IdeaForgeRunOutcome =
  | { kind: "completed"; result: IdeaForgeResult }
  | { kind: "unavailable"; message: string }
  | { kind: "failed"; message: string };

interface IntelligenceStatus {
  available: boolean;
  engine?: string;
  version?: string;
  message?: string;
}

interface IntelligenceEvent {
  seq: number;
  runId: string;
  type: string;
  phase?: string;
  message?: string;
  percent?: number;
}

interface IntelligenceEventBatch {
  events: IntelligenceEvent[];
  status: "running" | "completed" | "failed" | "cancelled";
  result?: unknown;
  error?: unknown;
}

interface IntelligenceBridge {
  getStatus(): Promise<IntelligenceStatus>;
  start(input: IntelligenceRunInput): Promise<{ runId: string }>;
  getEvents(input: { runId: string; afterSeq: number; waitMs?: number }): Promise<IntelligenceEventBatch>;
  cancel(input: { runId: string }): Promise<{ cancelled: boolean }>;
}

const DEFAULT_TIMEOUT_MS = 90_000;
const POLL_WAIT_MS = 1_000;

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function cleanText(value: unknown, maxLength: number): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function cleanStringArray(value: unknown, maxItems: number, maxLength: number): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => cleanText(item, maxLength))
    .filter((item, index, items) => item && items.indexOf(item) === index)
    .slice(0, maxItems);
}

function cleanConfidence(value: unknown): "low" | "medium" | "high" {
  const cleaned = cleanText(value, 16).toLowerCase();
  return cleaned === "low" || cleaned === "high" ? cleaned : "medium";
}

function exactRecord(value: unknown, keys: readonly string[]): Record<string, unknown> | null {
  const candidate = record(value);
  if (!candidate) return null;
  const actualKeys = Object.keys(candidate);
  return actualKeys.length === keys.length && actualKeys.every((key) => keys.includes(key))
    ? candidate
    : null;
}

function strictText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value.trim();
  return cleaned
    && cleaned.length <= maxLength
    && !/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(cleaned)
    ? cleaned
    : null;
}

function boundedScore(value: unknown, nullable = false): number | null | undefined {
  if (nullable && value === null) return null;
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100
    ? value
    : undefined;
}

function normalizeIdeaForgeInput(value: IdeaForgeRunInput): IdeaForgeRunInput | null {
  const input = exactRecord(value, ["task", "context", "limits"]);
  const context = exactRecord(input?.context, ["opportunityBoundary", "requestedCount", "profile"]);
  const profile = exactRecord(context?.profile, ["mode", "searchThemes", "fitDimensions", "workStylePreferences"]);
  const limits = exactRecord(input?.limits, ["timeoutMs"]);
  const opportunityBoundary = strictText(context?.opportunityBoundary, 10_000);
  const requestedCount = context?.requestedCount;
  const timeoutMs = limits?.timeoutMs;
  if (input?.task !== "idea_forge"
    || !context
    || !profile
    || !limits
    || !opportunityBoundary
    || !Number.isSafeInteger(requestedCount)
    || Number(requestedCount) < 1
    || Number(requestedCount) > 12
    || (profile.mode !== "neutral" && profile.mode !== "private")
    || !Number.isSafeInteger(timeoutMs)
    || Number(timeoutMs) < 10_000
    || Number(timeoutMs) > 180_000) return null;

  const normalizeDimensions = (candidate: unknown, maximum: number): IdeaForgeWeightedDimension[] | null => {
    if (!Array.isArray(candidate) || candidate.length > maximum) return null;
    const seen = new Set<string>();
    const normalized: IdeaForgeWeightedDimension[] = [];
    for (const raw of candidate) {
      const item = exactRecord(raw, ["label", "weight"]);
      const label = strictText(item?.label, 120);
      const weight = item?.weight;
      const key = label?.toLocaleLowerCase("en-US") ?? "";
      if (!item
        || !label
        || seen.has(key)
        || !Number.isSafeInteger(weight)
        || Number(weight) < 0
        || Number(weight) > 100) return null;
      seen.add(key);
      normalized.push({ label, weight: Number(weight) });
    }
    return normalized;
  };
  const searchThemes = normalizeDimensions(profile.searchThemes, 6);
  const fitDimensions = normalizeDimensions(profile.fitDimensions, 8);
  if (!searchThemes || !fitDimensions || !Array.isArray(profile.workStylePreferences) || profile.workStylePreferences.length > 8) return null;
  const seenWorkStyles = new Set<string>();
  const workStylePreferences: IdeaForgeWorkStylePreference[] = [];
  for (const raw of profile.workStylePreferences) {
    const item = exactRecord(raw, ["label", "orientation"]);
    const label = strictText(item?.label, 120);
    const orientation = strictText(item?.orientation, 240);
    const key = label?.toLocaleLowerCase("en-US") ?? "";
    if (!item || !label || !orientation || seenWorkStyles.has(key)) return null;
    seenWorkStyles.add(key);
    workStylePreferences.push({ label, orientation });
  }

  return {
    task: "idea_forge",
    context: {
      opportunityBoundary,
      requestedCount: Number(requestedCount),
      profile: {
        mode: profile.mode,
        searchThemes,
        fitDimensions,
        workStylePreferences,
      },
    },
    limits: { timeoutMs: Number(timeoutMs) },
  };
}

const IDEA_FORGE_TEXT_FIELDS = [
  "title",
  "concept",
  "user",
  "buyer",
  "triggeringSituation",
  "currentAlternative",
  "materialConsequence",
  "whyNow",
  "distributionWedge",
  "adoptionFriction",
  "protocolNeed",
  "protocolCounterfactual",
  "failureReason",
  "criticalAssumption",
  "experiment",
] as const;

const IDEA_FORGE_TEXT_LIMITS: Record<(typeof IDEA_FORGE_TEXT_FIELDS)[number], number> = {
  title: 200,
  concept: 1_200,
  user: 600,
  buyer: 600,
  triggeringSituation: 1_000,
  currentAlternative: 1_000,
  materialConsequence: 1_000,
  whyNow: 1_000,
  distributionWedge: 1_000,
  adoptionFriction: 1_000,
  protocolNeed: 1_200,
  protocolCounterfactual: 1_200,
  failureReason: 1_000,
  criticalAssumption: 1_000,
  experiment: 800,
};

function normalizeIdeaForgeIdea(value: unknown): IdeaForgeIdea | null {
  const item = exactRecord(value, [...IDEA_FORGE_TEXT_FIELDS, "experimentPlan", "route", "scores"]);
  const experimentPlan = exactRecord(item?.experimentPlan, [
    "durationDays",
    "method",
    "target",
    "sampleSize",
    "artifact",
    "metric",
    "passThreshold",
    "killThreshold",
  ]);
  const scores = exactRecord(item?.scores, [
    "personalFit",
    "opportunitySignal",
    "protocolAffordance",
    "experimentability",
  ]);
  if (!item || !experimentPlan || !scores) return null;

  const text = Object.fromEntries(IDEA_FORGE_TEXT_FIELDS.map((key) => [
    key,
    strictText(item[key], IDEA_FORGE_TEXT_LIMITS[key]),
  ])) as Record<(typeof IDEA_FORGE_TEXT_FIELDS)[number], string | null>;
  if (IDEA_FORGE_TEXT_FIELDS.some((key) => !text[key])) return null;

  const methods = new Set<IdeaForgeExperimentMethod>([
    "observation",
    "concierge",
    "prototype",
    "commitment",
    "landing_page",
    "technical_spike",
  ]);
  const routes = new Set<IdeaForgeIdea["route"]>(["Xahau", "Evernode", "Both", "Neither yet"]);
  const durationDays = experimentPlan.durationDays;
  const sampleSize = experimentPlan.sampleSize;
  const personalFit = boundedScore(scores.personalFit, true);
  const opportunitySignal = boundedScore(scores.opportunitySignal);
  const protocolAffordance = boundedScore(scores.protocolAffordance);
  const experimentability = boundedScore(scores.experimentability);
  if (!Number.isSafeInteger(durationDays)
    || Number(durationDays) < 1
    || Number(durationDays) > 14
    || !methods.has(experimentPlan.method as IdeaForgeExperimentMethod)
    || (sampleSize !== null && (typeof sampleSize !== "number"
      || !Number.isFinite(sampleSize)
      || sampleSize <= 0
      || sampleSize > 100_000))
    || !routes.has(item.route as IdeaForgeIdea["route"])
    || personalFit === undefined
    || opportunitySignal === undefined
    || protocolAffordance === undefined
    || experimentability === undefined) return null;
  const target = strictText(experimentPlan.target, 600);
  const artifact = strictText(experimentPlan.artifact, 600);
  const metric = strictText(experimentPlan.metric, 600);
  const passThreshold = strictText(experimentPlan.passThreshold, 600);
  const killThreshold = strictText(experimentPlan.killThreshold, 600);
  if (!target || !artifact || !metric || !passThreshold || !killThreshold) return null;

  return {
    ...Object.fromEntries(IDEA_FORGE_TEXT_FIELDS.map((key) => [key, text[key] as string])) as Pick<IdeaForgeIdea, (typeof IDEA_FORGE_TEXT_FIELDS)[number]>,
    experimentPlan: {
      durationDays: Number(durationDays),
      method: experimentPlan.method as IdeaForgeExperimentMethod,
      target,
      sampleSize: sampleSize === null ? null : Number(sampleSize),
      artifact,
      metric,
      passThreshold,
      killThreshold,
    },
    route: item.route as IdeaForgeIdea["route"],
    scores: {
      personalFit: personalFit as number | null,
      opportunitySignal: opportunitySignal as number,
      protocolAffordance: protocolAffordance as number,
      experimentability: experimentability as number,
    },
  };
}

function normalizeIdeaForgeResult(
  value: unknown,
  expected: { requestedCount: number; profileMode: "neutral" | "private" },
): IdeaForgeResult | null {
  const input = exactRecord(value, [
    "task",
    "provisional",
    "evidenceKind",
    "customerValidation",
    "pipelineVersion",
    "ideas",
    "diagnostics",
  ]);
  const diagnostics = exactRecord(input?.diagnostics, [
    "framesGenerated",
    "rawCandidatesGenerated",
    "candidatesReturned",
    "method",
  ]);
  if (input?.task !== "idea_forge"
    || input.provisional !== true
    || input.evidenceKind !== "hypothesis"
    || input.customerValidation !== false
    || input.pipelineVersion !== "idea-forge/1.0.0"
    || !Array.isArray(input.ideas)
    || input.ideas.length !== expected.requestedCount
    || !diagnostics
    || diagnostics.method !== "frame-diverge-critique") return null;

  const ideas = input.ideas.map(normalizeIdeaForgeIdea);
  if (ideas.some((idea) => !idea)) return null;
  const normalizedIdeas = ideas as IdeaForgeIdea[];
  if (expected.profileMode === "neutral" && normalizedIdeas.some((idea) => idea.scores.personalFit !== null)) return null;
  const titles = normalizedIdeas.map((idea) => idea.title.toLocaleLowerCase("en-US"));
  if (new Set(titles).size !== titles.length) return null;
  const counts = [diagnostics.framesGenerated, diagnostics.rawCandidatesGenerated, diagnostics.candidatesReturned];
  if (counts.some((count) => !Number.isSafeInteger(count) || Number(count) < 0)
    || diagnostics.candidatesReturned !== ideas.length) return null;

  return {
    task: "idea_forge",
    provisional: true,
    evidenceKind: "hypothesis",
    customerValidation: false,
    pipelineVersion: "idea-forge/1.0.0",
    ideas: normalizedIdeas,
    diagnostics: {
      framesGenerated: Number(diagnostics.framesGenerated),
      rawCandidatesGenerated: Number(diagnostics.rawCandidatesGenerated),
      candidatesReturned: Number(diagnostics.candidatesReturned),
      method: "frame-diverge-critique",
    },
  };
}

function normalizeIntelligenceResult(value: unknown): IntelligenceResult | null {
  const input = record(value);
  const analysisInput = record(input?.analysis);
  const redTeamInput = record(analysisInput?.redTeam);
  if (input?.provisional !== true
    || input.evidenceKind !== "public_context"
    || input.customerValidation !== false
    || !analysisInput
    || !redTeamInput) return null;

  const competitors = Array.isArray(analysisInput.competitors)
    ? analysisInput.competitors.flatMap((value): IntelligenceCompetitorFinding[] => {
      const item = record(value);
      const name = cleanText(item?.name, 180);
      if (!item || !name) return [];
      const sourceIds = cleanStringArray(item.sourceIds, 12, 160);
      const evidenceBasis = item.evidenceBasis === "provided_source" && sourceIds.length > 0
        ? "provided_source" as const
        : "model_hypothesis" as const;
      return [{
        name,
        category: cleanText(item.category, 240),
        overlap: cleanText(item.overlap, 1_200),
        competitorAdvantage: cleanText(item.competitorAdvantage, 1_200),
        ideaAdvantage: cleanText(item.ideaAdvantage, 1_200),
        evidenceBasis,
        sourceIds: evidenceBasis === "provided_source" ? sourceIds : [],
        confidence: cleanConfidence(item.confidence),
      }];
    }).slice(0, 12)
    : [];

  const fatalAssumptions = Array.isArray(redTeamInput.fatalAssumptions)
    ? redTeamInput.fatalAssumptions.flatMap((value): IntelligenceFatalAssumption[] => {
      const item = record(value);
      const assumption = cleanText(item?.assumption, 1_000);
      if (!item || !assumption) return [];
      const rawSeverity = cleanText(item.severity, 16).toLowerCase();
      const severity: IntelligenceFatalAssumption["severity"] = rawSeverity === "critical"
        || rawSeverity === "high"
        || rawSeverity === "medium"
        || rawSeverity === "low"
        ? rawSeverity
        : "medium";
      return [{
        assumption,
        failureMode: cleanText(item.failureMode, 1_600),
        severity,
        rationale: cleanText(item.rationale, 1_600),
      }];
    }).slice(0, 16)
    : [];

  const disconfirmingTests = Array.isArray(redTeamInput.disconfirmingTests)
    ? redTeamInput.disconfirmingTests.flatMap((value): IntelligenceDisconfirmingTest[] => {
      const item = record(value);
      const proposedTest = cleanText(item?.test, 1_200);
      if (!item || !proposedTest) return [];
      return [{
        test: proposedTest,
        signal: cleanText(item.signal, 1_200),
        stopCondition: cleanText(item.stopCondition, 1_200),
      }];
    }).slice(0, 12)
    : [];

  return {
    provisional: true,
    evidenceKind: "public_context",
    customerValidation: false,
    analysis: {
      summary: cleanText(analysisInput.summary, 6_000),
      competitors,
      redTeam: {
        fatalAssumptions,
        counterarguments: cleanStringArray(redTeamInput.counterarguments, 12, 1_600),
        disconfirmingTests,
        goForwardConditions: cleanStringArray(redTeamInput.goForwardConditions, 12, 1_600),
      },
      confidence: cleanConfidence(analysisInput.confidence),
      limitations: cleanStringArray(analysisInput.limitations, 12, 1_600),
    },
  };
}

function errorMessage(value: unknown, fallback: string): string {
  if (value instanceof Error && value.message.trim()) return value.message.trim();
  if (typeof value === "string" && value.trim()) return value.trim();
  const input = record(value);
  return cleanText(input?.message, 1_000) || fallback;
}

function getIntelligenceBridge(): IntelligenceBridge | null {
  if (typeof window === "undefined") return null;
  const candidate = record((window.sift as unknown as Record<string, unknown> | undefined)?.intelligence);
  if (!candidate
    || typeof candidate.getStatus !== "function"
    || typeof candidate.start !== "function"
    || typeof candidate.getEvents !== "function"
    || typeof candidate.cancel !== "function") return null;
  return candidate as unknown as IntelligenceBridge;
}

export function intelligenceContextSummary(result: IntelligenceResult): string {
  const { analysis } = result;
  const lines = [
    "PROVISIONAL PYTHON COMPETITOR AND RED-TEAM ANALYSIS — NOT CUSTOMER EVIDENCE",
    analysis.summary ? `Synthesis: ${analysis.summary}` : "Synthesis: No summary supplied.",
  ];
  if (analysis.competitors.length) {
    lines.push("Competitor landscape:");
    for (const item of analysis.competitors) {
      lines.push(`- ${item.name} (${item.category || "uncategorized"}): overlap ${item.overlap || "unresolved"}. Their advantage: ${item.competitorAdvantage || "unresolved"}. Idea advantage: ${item.ideaAdvantage || "unresolved"}.`);
    }
  }
  if (analysis.redTeam.fatalAssumptions.length) {
    lines.push("Fatal assumptions:");
    for (const risk of analysis.redTeam.fatalAssumptions) {
      lines.push(`- [${risk.severity.toUpperCase()}] ${risk.assumption}. Failure mode: ${risk.failureMode || "Unresolved."} ${risk.rationale}`);
    }
  }
  if (analysis.redTeam.disconfirmingTests.length) {
    lines.push("Suggested disconfirming tests:");
    for (const test of analysis.redTeam.disconfirmingTests) {
      lines.push(`- ${test.test}. Signal: ${test.signal || "Define before testing."} Stop condition: ${test.stopCondition || "Define before testing."}`);
    }
  }
  if (analysis.limitations.length) lines.push(`Limitations: ${analysis.limitations.join(" | ")}`);
  lines.push("Treat every statement above as a provisional analysis prompt. It cannot create, verify, or upgrade an evidence record.");
  return lines.join("\n").slice(0, 16_000);
}

interface IntelligenceRunOptions {
  onProgress?: (progress: IntelligenceProgress) => void;
  isCancelled?: () => boolean;
}

interface IntelligenceRunMessages {
  unavailable: string;
  missingRunId: string;
  working: string;
  invalidResult: string;
  failed: string;
  cancelled: string;
  timedOut: string;
  unexpected: string;
}

type GenericIntelligenceRunOutcome<Result> =
  | { kind: "completed"; result: Result }
  | { kind: "unavailable"; message: string }
  | { kind: "failed"; message: string };

async function runIntelligenceTask<Result>(
  input: IntelligenceRunInput,
  normalizeResult: (value: unknown) => Result | null,
  options: IntelligenceRunOptions,
  messages: IntelligenceRunMessages,
): Promise<GenericIntelligenceRunOutcome<Result>> {
  const bridge = getIntelligenceBridge();
  if (!bridge) {
    return { kind: "unavailable", message: messages.unavailable };
  }

  let runId = "";
  try {
    const status = await bridge.getStatus();
    if (!status.available) {
      return {
        kind: "unavailable",
        message: cleanText(status.message, 1_000) || messages.unavailable,
      };
    }

    const started = await bridge.start(input);
    runId = cleanText(started.runId, 200);
    if (!runId) return { kind: "failed", message: messages.missingRunId };

    let afterSeq = 0;
    const timeoutMs = Number.isFinite(input.limits.timeoutMs) && input.limits.timeoutMs > 0
      ? Math.min(input.limits.timeoutMs, 180_000)
      : DEFAULT_TIMEOUT_MS;
    const deadline = Date.now() + timeoutMs + 15_000;

    while (Date.now() < deadline) {
      if (options.isCancelled?.()) {
        await bridge.cancel({ runId }).catch(() => ({ cancelled: false }));
        return { kind: "failed", message: messages.cancelled };
      }
      const batch = await bridge.getEvents({ runId, afterSeq, waitMs: POLL_WAIT_MS });
      for (const event of Array.isArray(batch.events) ? batch.events : []) {
        if (event.runId !== runId || !Number.isSafeInteger(event.seq) || event.seq <= afterSeq) continue;
        afterSeq = event.seq;
        options.onProgress?.({
          phase: cleanText(event.phase, 120) || "working",
          message: cleanText(event.message, 1_000) || messages.working,
          ...(typeof event.percent === "number" && Number.isFinite(event.percent)
            ? { percent: Math.max(0, Math.min(100, event.percent)) }
            : {}),
        });
      }

      if (batch.status === "completed") {
        const result = normalizeResult(batch.result);
        return result
          ? { kind: "completed", result }
          : { kind: "failed", message: messages.invalidResult };
      }
      if (batch.status === "failed") {
        return { kind: "failed", message: errorMessage(batch.error, messages.failed) };
      }
      if (batch.status === "cancelled") return { kind: "failed", message: messages.cancelled };
    }

    await bridge.cancel({ runId }).catch(() => ({ cancelled: false }));
    return { kind: "failed", message: messages.timedOut };
  } catch (error) {
    if (runId) await bridge.cancel({ runId }).catch(() => ({ cancelled: false }));
    return { kind: "failed", message: errorMessage(error, messages.unexpected) };
  }
}

export async function runCompetitorRedTeamIntelligence(
  input: CompetitorRedTeamRunInput,
  options: IntelligenceRunOptions = {},
): Promise<IntelligenceRunOutcome> {
  return runIntelligenceTask(input, normalizeIntelligenceResult, options, {
    unavailable: "The optional Python intelligence engine is not installed in this build.",
    missingRunId: "The Python intelligence engine did not return a run identifier.",
    working: "Python intelligence is working.",
    invalidResult: "The Python intelligence result failed SIFT's local schema validation.",
    failed: "The Python intelligence analysis failed.",
    cancelled: "Intelligence analysis cancelled.",
    timedOut: "The Python intelligence analysis timed out; SIFT continued with its standard screen.",
    unexpected: "The Python intelligence engine could not complete.",
  });
}

export async function runIdeaForgeIntelligence(
  input: IdeaForgeRunInput,
  options: IntelligenceRunOptions = {},
): Promise<IdeaForgeRunOutcome> {
  const normalizedInput = normalizeIdeaForgeInput(input);
  if (!normalizedInput) {
    return { kind: "failed", message: "The Idea Forge request failed SIFT's local schema validation." };
  }
  return runIntelligenceTask(
    normalizedInput,
    (value) => normalizeIdeaForgeResult(value, {
      requestedCount: normalizedInput.context.requestedCount,
      profileMode: normalizedInput.context.profile.mode,
    }),
    options,
    {
      unavailable: "The optional Python Idea Forge engine is not installed in this build.",
      missingRunId: "The Python Idea Forge engine did not return a run identifier.",
      working: "Python Idea Forge is working.",
      invalidResult: "The Python Idea Forge result failed SIFT's local schema validation.",
      failed: "Python Idea Forge failed.",
      cancelled: "Idea Forge cancelled.",
      timedOut: "Python Idea Forge timed out before it could return a complete idea slate.",
      unexpected: "The Python Idea Forge engine could not complete.",
    },
  );
}
