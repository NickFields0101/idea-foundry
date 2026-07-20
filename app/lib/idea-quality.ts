export type IdeaRoute = "Xahau" | "Evernode" | "Both" | "Neither yet";

export type ExperimentMethod =
  | "observation"
  | "concierge"
  | "prototype"
  | "commitment"
  | "landing_page"
  | "technical_spike";

export interface IdeaExperimentPlan {
  durationDays: number;
  method: ExperimentMethod;
  target: string;
  sampleSize: number | null;
  artifact: string;
  metric: string;
  passThreshold: string;
  killThreshold: string;
}

export interface IdeaQualityCandidate {
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
  experimentPlan?: IdeaExperimentPlan;
  route: IdeaRoute;
}

export interface IdeaQualityViolation {
  code: string;
  message: string;
}

export interface IdeaQualityReport {
  ruleset: "sift.idea-quality/1.0.0";
  disposition: "accept" | "repair" | "reject";
  thesisQuality: number;
  dimensions: {
    problemPrecision: number;
    mechanismCoherence: number;
    falsifiability: number;
    economicLogic: number;
    integrity: number;
  };
  protocolAssessment: {
    status: "required" | "plausible" | "unjustified" | "none";
    quality: number | null;
  };
  blockers: IdeaQualityViolation[];
  warnings: IdeaQualityViolation[];
}

const GENERIC_ACTORS = new Set([
  "anyone",
  "business",
  "businesses",
  "companies",
  "company",
  "consumers",
  "everyone",
  "organizations",
  "people",
  "platforms",
  "users",
]);

const MARKETING_PHRASES = [
  "ai-powered",
  "decentralized ecosystem",
  "game-changing",
  "revolutionary",
  "seamless",
  "transparent and secure",
  "web3 platform",
];

const STOPWORDS = new Set([
  "a", "an", "and", "app", "application", "blockchain", "both", "by", "for", "from",
  "in", "into", "is", "it", "of", "on", "or", "platform", "service", "that", "the",
  "their", "this", "to", "using", "with", "xahau", "evernode", "ai", "users", "user",
]);

function clean(value: unknown) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
}

function genericActor(value: string) {
  const normalized = clean(value).toLowerCase().replace(/[^a-z0-9 ]/g, "");
  return !normalized || GENERIC_ACTORS.has(normalized);
}

function substantive(value: string, minimum = 18) {
  const normalized = clean(value);
  return normalized.length >= minimum && normalized.split(" ").length >= 3;
}

function hasUnsupportedValidationClaim(candidate: IdeaQualityCandidate) {
  const text = [
    candidate.concept,
    candidate.materialConsequence,
    candidate.whyNow,
    candidate.protocolNeed,
  ].join(" ");
  return /\b(?:customers?|users?)\s+(?:already\s+)?(?:love|loved|asked|said|paid|committed|prefer|demand)\b/i.test(text)
    || /\b(?:proven|validated)\s+(?:demand|traction|product.market fit)\b/i.test(text)
    || /\b(?:in production|production usage|independent audit passed)\b/i.test(text);
}

function textHasAny(value: string, phrases: string[]) {
  const normalized = clean(value).toLowerCase();
  return phrases.some((phrase) => normalized.includes(phrase));
}

function thresholdLike(value: string) {
  return /\d|%|at least|at most|fewer than|more than|no more than|zero|none/i.test(value);
}

function protocolQuality(candidate: IdeaQualityCandidate, blockers: IdeaQualityViolation[], warnings: IdeaQualityViolation[]) {
  const need = clean(candidate.protocolNeed);
  const counterfactual = clean(candidate.protocolCounterfactual);
  if (candidate.route === "Neither yet") {
    const protocolText = `${need} ${counterfactual}`;
    const explicitlyUnneeded = /\b(?:no protocol is required|protocol is not required|does not require (?:a )?protocol|conventional .+ is (?:simpler|sufficient|better))\b/i.test(protocolText);
    if (!explicitlyUnneeded && textHasAny(protocolText, ["essential", "required", "must use", "only possible"])) {
      blockers.push({
        code: "protocol.route_contradiction",
        message: "The route says no protocol is needed while the rationale claims one is essential.",
      });
      return { status: "unjustified" as const, quality: 0 };
    }
    return { status: "none" as const, quality: null };
  }

  let quality = 0;
  if (substantive(need, 30)) quality += 35;
  else warnings.push({ code: "protocol.need_vague", message: "The protocol job is not concrete enough." });
  if (substantive(counterfactual, 30)) quality += 35;
  else warnings.push({ code: "protocol.counterfactual_missing", message: "Compare the route with a conventional service or database." });
  if (textHasAny(counterfactual, ["centralized", "database", "server", "saas", "operator", "conventional"])) quality += 15;
  if (textHasAny(need, ["independent", "multi-party", "multiple parties", "shared state", "consensus", "settlement", "account rule", "hosting"])) quality += 15;

  const routeText = `${need} ${counterfactual}`.toLowerCase();
  if (candidate.route === "Xahau" && !routeText.includes("xahau")) {
    warnings.push({ code: "protocol.xahau_role_missing", message: "Name the exact job Xahau performs." });
    quality = Math.min(quality, 60);
  }
  if (candidate.route === "Evernode" && !routeText.includes("evernode")) {
    warnings.push({ code: "protocol.evernode_role_missing", message: "Name the exact job Evernode performs." });
    quality = Math.min(quality, 60);
  }
  if (candidate.route === "Both" && (!routeText.includes("xahau") || !routeText.includes("evernode"))) {
    blockers.push({
      code: "protocol.both_incomplete",
      message: "A Both route must give Xahau and Evernode separate responsibilities.",
    });
    quality = Math.min(quality, 40);
  }
  if (quality < 50) {
    blockers.push({
      code: "protocol.capability_unexplained",
      message: "The idea does not establish a concrete protocol advantage over the conventional alternative.",
    });
  }
  return {
    status: quality >= 70 ? "required" as const : quality >= 50 ? "plausible" as const : "unjustified" as const,
    quality: Math.min(100, quality),
  };
}

export function assessIdeaQuality(candidate: IdeaQualityCandidate): IdeaQualityReport {
  const blockers: IdeaQualityViolation[] = [];
  const warnings: IdeaQualityViolation[] = [];

  let problemPrecision = 0;
  if (!genericActor(candidate.user)) problemPrecision += 6;
  else warnings.push({ code: "actor.generic", message: "Name a specific user role or segment." });
  if (substantive(candidate.triggeringSituation)) problemPrecision += 6;
  else warnings.push({ code: "trigger.generic", message: "Name the observable situation that starts the problem." });
  if (substantive(candidate.currentAlternative)) problemPrecision += 6;
  else warnings.push({ code: "alternative.generic", message: "Name what the user actually does today." });
  if (substantive(candidate.materialConsequence)) problemPrecision += 7;
  else warnings.push({ code: "consequence.generic", message: "State the material consequence of the current workflow." });

  let mechanismCoherence = 0;
  if (substantive(candidate.concept, 45)) mechanismCoherence += 6;
  if (!genericActor(candidate.buyer)) mechanismCoherence += 3;
  else warnings.push({ code: "buyer.generic", message: "Name the economic buyer or say why the user pays." });
  if (substantive(candidate.distributionWedge)) mechanismCoherence += 3;
  else warnings.push({ code: "distribution.missing", message: "Name a reachable first distribution path." });
  if (substantive(candidate.adoptionFriction)) mechanismCoherence += 3;
  else warnings.push({ code: "adoption_friction.missing", message: "Name the largest switching or trust friction." });

  let falsifiability = 0;
  if (substantive(candidate.criticalAssumption)) falsifiability += 5;
  else warnings.push({ code: "assumption.generic", message: "State one atomic assumption that can be wrong." });
  const plan = candidate.experimentPlan;
  if (plan) {
    if (Number.isInteger(plan.durationDays) && plan.durationDays >= 1 && plan.durationDays <= 14) falsifiability += 5;
    if (["observation", "concierge", "prototype", "commitment", "landing_page", "technical_spike"].includes(plan.method)) falsifiability += 4;
    if (substantive(plan.target, 8)) falsifiability += 3;
    if (substantive(plan.metric, 8)) falsifiability += 4;
    if (substantive(plan.passThreshold, 6) && thresholdLike(plan.passThreshold)) falsifiability += 4;
    else blockers.push({ code: "experiment.no_pass_threshold", message: "The experiment needs an observable pass threshold." });
    if (substantive(plan.killThreshold, 6) && thresholdLike(plan.killThreshold)) falsifiability += 5;
    else blockers.push({ code: "experiment.no_kill_threshold", message: "The experiment needs a stop or kill threshold." });
  } else {
    const experiment = clean(candidate.experiment);
    if (/\b(?:14|fourteen)\s*days?\b/i.test(experiment)) falsifiability += 4;
    if (/\b(?:observe|concierge|prototype|commit|landing page|technical spike|interview|test)\b/i.test(experiment)) falsifiability += 4;
    if (thresholdLike(experiment)) falsifiability += 5;
    if (/\b(?:stop|kill|abandon|do not proceed|fewer than|less than)\b/i.test(experiment)) falsifiability += 4;
    warnings.push({ code: "experiment.unstructured", message: "Use a structured 14-day plan with a metric, pass threshold, and kill threshold." });
  }

  let economicLogic = 0;
  if (!genericActor(candidate.buyer)) economicLogic += 5;
  if (substantive(candidate.materialConsequence)) economicLogic += 4;
  if (substantive(candidate.currentAlternative)) economicLogic += 3;
  if (substantive(candidate.whyNow)) economicLogic += 3;
  else warnings.push({ code: "timing.missing", message: "State the change that makes this worth testing now." });

  let integrity = 15;
  if (hasUnsupportedValidationClaim(candidate)) {
    integrity = 0;
    blockers.push({
      code: "integrity.unsupported_validation_claim",
      message: "A newly generated idea cannot claim customers, traction, payments, production use, or an audit already exists.",
    });
  }
  const marketingCount = MARKETING_PHRASES.filter((phrase) => textHasAny(`${candidate.title} ${candidate.concept}`, [phrase])).length;
  if (marketingCount) {
    integrity = Math.max(0, integrity - Math.min(6, marketingCount * 2));
    warnings.push({ code: "clarity.marketing_language", message: "Replace marketing language with a concrete mechanism." });
  }

  const protocolAssessment = protocolQuality(candidate, blockers, warnings);
  const thesisQuality = Math.round(problemPrecision + mechanismCoherence + falsifiability + economicLogic + integrity);
  const disposition = blockers.length > 0 || thesisQuality < 55
    ? "reject" as const
    : thesisQuality >= 75
      ? "accept" as const
      : "repair" as const;

  return {
    ruleset: "sift.idea-quality/1.0.0",
    disposition,
    thesisQuality,
    dimensions: { problemPrecision, mechanismCoherence, falsifiability, economicLogic, integrity },
    protocolAssessment,
    blockers,
    warnings,
  };
}

function signatureTokens(candidate: IdeaQualityCandidate) {
  return new Set([
    candidate.user,
    candidate.buyer,
    candidate.triggeringSituation,
    candidate.currentAlternative,
    candidate.concept,
    candidate.criticalAssumption,
  ].join(" ").toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/)
    .filter((token) => token.length > 2 && !STOPWORDS.has(token)));
}

function canonicalTitle(candidate: IdeaQualityCandidate) {
  return candidate.title.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim().replace(/\s+/g, " ");
}

export function ideaSimilarity(left: IdeaQualityCandidate, right: IdeaQualityCandidate) {
  const a = signatureTokens(left);
  const b = signatureTokens(right);
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const token of a) if (b.has(token)) intersection += 1;
  return intersection / (a.size + b.size - intersection);
}

export function selectQualitySlate<T extends IdeaQualityCandidate>(
  candidates: readonly T[],
  requestedCount: number,
  explorationPriority: (candidate: T) => number,
  existingCandidates: readonly IdeaQualityCandidate[] = [],
) {
  const assessed = candidates.map((candidate, index) => ({ candidate, index, report: assessIdeaQuality(candidate) }));
  const ordered = assessed
    .filter(({ report }) => report.disposition !== "reject")
    .sort((left, right) => {
      const dispositionDifference = Number(right.report.disposition === "accept") - Number(left.report.disposition === "accept");
      if (dispositionDifference) return dispositionDifference;
      const priorityDifference = explorationPriority(right.candidate) - explorationPriority(left.candidate);
      if (priorityDifference) return priorityDifference;
      const qualityDifference = right.report.thesisQuality - left.report.thesisQuality;
      return qualityDifference || left.index - right.index;
    });
  const selected: typeof ordered = [];
  for (const item of ordered) {
    if (existingCandidates.some((existing) => (
      canonicalTitle(existing) === canonicalTitle(item.candidate)
      || ideaSimilarity(existing, item.candidate) >= 0.72
    ))) continue;
    if (selected.some((existing) => (
      canonicalTitle(existing.candidate) === canonicalTitle(item.candidate)
      || ideaSimilarity(existing.candidate, item.candidate) >= 0.72
    ))) continue;
    selected.push(item);
    if (selected.length >= Math.max(1, requestedCount)) break;
  }
  return {
    selected,
    rejected: assessed.filter((item) => !selected.includes(item)),
    partial: selected.length < Math.max(1, requestedCount),
  };
}
