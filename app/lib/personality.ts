/**
 * Public-domain IPIP-NEO-120 personality inventory.
 *
 * Source: Johnson, J. A. (2014). Measuring thirty facets of the Five
 * Factor Model with a 120-item public domain inventory: Development of
 * the IPIP-NEO-120. Journal of Research in Personality, 51, 78-89.
 * https://doi.org/10.1016/j.jrp.2014.05.003
 *
 * Item wording, order, facet assignments, and scoring keys follow Table 1.
 * Scores produced here are positions on the 1-5 response scale transformed
 * to 0-100. They are not population percentiles or clinical interpretations.
 */

export const IPIP_NEO_120_ITEM_COUNT = 120;
export const IPIP_NEO_120_SCALE_MIN = 1;
export const IPIP_NEO_120_SCALE_MAX = 5;
export const IPIP_NEO_120_SOURCE = {
  author: "John A. Johnson",
  year: 2014,
  title: "Measuring thirty facets of the Five Factor Model with a 120-item public domain inventory: Development of the IPIP-NEO-120",
  journal: "Journal of Research in Personality, 51, 78-89",
  doi: "10.1016/j.jrp.2014.05.003",
  url: "https://doi.org/10.1016/j.jrp.2014.05.003",
  itemLicense: "Public domain",
} as const;

export const IPIP_NEO_120_RESPONSE_OPTIONS = [
  { value: 1, label: "Very inaccurate" },
  { value: 2, label: "Moderately inaccurate" },
  { value: 3, label: "Neither accurate nor inaccurate" },
  { value: 4, label: "Moderately accurate" },
  { value: 5, label: "Very accurate" },
] as const;

export const IPIP_NEO_120_DOMAIN_CODES = ["N", "E", "O", "A", "C"] as const;
export const IPIP_NEO_120_FACET_CODES = [
  "N1", "N2", "N3", "N4", "N5", "N6",
  "E1", "E2", "E3", "E4", "E5", "E6",
  "O1", "O2", "O3", "O4", "O5", "O6",
  "A1", "A2", "A3", "A4", "A5", "A6",
  "C1", "C2", "C3", "C4", "C5", "C6",
] as const;

export type IpipNeo120Response = 1 | 2 | 3 | 4 | 5;
export type PersonalityDomainCode = (typeof IPIP_NEO_120_DOMAIN_CODES)[number];
export type PersonalityFacetCode = (typeof IPIP_NEO_120_FACET_CODES)[number];
export type PersonalityItemKey = "positive" | "reverse";

export interface PersonalityDomainDefinition {
  code: PersonalityDomainCode;
  label: string;
}

export interface PersonalityFacetDefinition {
  code: PersonalityFacetCode;
  domain: PersonalityDomainCode;
  label: string;
}

export interface IpipNeo120Item {
  id: number;
  text: string;
  domain: PersonalityDomainCode;
  facet: PersonalityFacetCode;
  key: PersonalityItemKey;
}

export interface PersonalityScaleResult {
  code: string;
  label: string;
  score: number;
  responseMean: number;
  itemCount: number;
}

export interface PersonalityDomainResult extends PersonalityScaleResult {
  code: PersonalityDomainCode;
}

export interface PersonalityFacetResult extends PersonalityScaleResult {
  code: PersonalityFacetCode;
  domain: PersonalityDomainCode;
}

export type WorkStyleDimensionId =
  | "pressure_approach"
  | "engagement_approach"
  | "novelty_approach"
  | "collaboration_approach"
  | "planning_approach";

export interface WorkStyleFitDimension {
  id: WorkStyleDimensionId;
  label: string;
  orientation: string;
  sourceDomain: PersonalityDomainCode;
  /** A 0-100 position on the response scale, not a percentile. */
  position: number;
  /** Relative idea-generation emphasis. All five weights total exactly 100. */
  weight: number;
}

export interface PersonalityProfileResult {
  instrument: "IPIP-NEO-120";
  scoringVersion: "ipip-neo-120-scale-position/1.0.0";
  completedItems: 120;
  domains: PersonalityDomainResult[];
  facets: PersonalityFacetResult[];
  workStyleFit: WorkStyleFitDimension[];
  promptSummary: string;
}

export type IpipNeo120Responses =
  | readonly number[]
  | Readonly<Record<number | string, number>>;

export const IPIP_NEO_120_DOMAINS: readonly PersonalityDomainDefinition[] = [
  { code: "N", label: "Neuroticism" },
  { code: "E", label: "Extraversion" },
  { code: "O", label: "Openness to Experience" },
  { code: "A", label: "Agreeableness" },
  { code: "C", label: "Conscientiousness" },
] as const;

export const IPIP_NEO_120_FACETS: readonly PersonalityFacetDefinition[] = [
  { code: "N1", domain: "N", label: "Anxiety" },
  { code: "N2", domain: "N", label: "Anger" },
  { code: "N3", domain: "N", label: "Depression" },
  { code: "N4", domain: "N", label: "Self-Consciousness" },
  { code: "N5", domain: "N", label: "Immoderation" },
  { code: "N6", domain: "N", label: "Vulnerability" },
  { code: "E1", domain: "E", label: "Friendliness" },
  { code: "E2", domain: "E", label: "Gregariousness" },
  { code: "E3", domain: "E", label: "Assertiveness" },
  { code: "E4", domain: "E", label: "Activity Level" },
  { code: "E5", domain: "E", label: "Excitement Seeking" },
  { code: "E6", domain: "E", label: "Cheerfulness" },
  { code: "O1", domain: "O", label: "Imagination" },
  { code: "O2", domain: "O", label: "Artistic Interests" },
  { code: "O3", domain: "O", label: "Emotionality" },
  { code: "O4", domain: "O", label: "Adventurousness" },
  { code: "O5", domain: "O", label: "Intellect" },
  { code: "O6", domain: "O", label: "Liberalism" },
  { code: "A1", domain: "A", label: "Trust" },
  { code: "A2", domain: "A", label: "Morality" },
  { code: "A3", domain: "A", label: "Altruism" },
  { code: "A4", domain: "A", label: "Cooperation" },
  { code: "A5", domain: "A", label: "Modesty" },
  { code: "A6", domain: "A", label: "Sympathy" },
  { code: "C1", domain: "C", label: "Self-Efficacy" },
  { code: "C2", domain: "C", label: "Orderliness" },
  { code: "C3", domain: "C", label: "Dutifulness" },
  { code: "C4", domain: "C", label: "Achievement-Striving" },
  { code: "C5", domain: "C", label: "Self-Discipline" },
  { code: "C6", domain: "C", label: "Cautiousness" },
] as const;

/** Canonical Johnson (2014) interleaved administration order. */
export const IPIP_NEO_120_ITEMS: readonly IpipNeo120Item[] = [
  { id: 1, text: "Worry about things", domain: "N", facet: "N1", key: "positive" },
  { id: 2, text: "Make friends easily", domain: "E", facet: "E1", key: "positive" },
  { id: 3, text: "Have a vivid imagination", domain: "O", facet: "O1", key: "positive" },
  { id: 4, text: "Trust others", domain: "A", facet: "A1", key: "positive" },
  { id: 5, text: "Complete tasks successfully", domain: "C", facet: "C1", key: "positive" },
  { id: 6, text: "Get angry easily", domain: "N", facet: "N2", key: "positive" },
  { id: 7, text: "Love large parties", domain: "E", facet: "E2", key: "positive" },
  { id: 8, text: "Believe in the importance of art", domain: "O", facet: "O2", key: "positive" },
  { id: 9, text: "Use others for my own ends", domain: "A", facet: "A2", key: "reverse" },
  { id: 10, text: "Like to tidy up", domain: "C", facet: "C2", key: "positive" },
  { id: 11, text: "Often feel blue", domain: "N", facet: "N3", key: "positive" },
  { id: 12, text: "Take charge", domain: "E", facet: "E3", key: "positive" },
  { id: 13, text: "Experience my emotions intensely", domain: "O", facet: "O3", key: "positive" },
  { id: 14, text: "Love to help others", domain: "A", facet: "A3", key: "positive" },
  { id: 15, text: "Keep my promises", domain: "C", facet: "C3", key: "positive" },
  { id: 16, text: "Find it difficult to approach others", domain: "N", facet: "N4", key: "positive" },
  { id: 17, text: "Am always busy", domain: "E", facet: "E4", key: "positive" },
  { id: 18, text: "Prefer variety to routine", domain: "O", facet: "O4", key: "positive" },
  { id: 19, text: "Love a good fight", domain: "A", facet: "A4", key: "reverse" },
  { id: 20, text: "Work hard", domain: "C", facet: "C4", key: "positive" },
  { id: 21, text: "Go on binges", domain: "N", facet: "N5", key: "positive" },
  { id: 22, text: "Love excitement", domain: "E", facet: "E5", key: "positive" },
  { id: 23, text: "Love to read challenging material", domain: "O", facet: "O5", key: "positive" },
  { id: 24, text: "Believe that I am better than others", domain: "A", facet: "A5", key: "reverse" },
  { id: 25, text: "Am always prepared", domain: "C", facet: "C5", key: "positive" },
  { id: 26, text: "Panic easily", domain: "N", facet: "N6", key: "positive" },
  { id: 27, text: "Radiate joy", domain: "E", facet: "E6", key: "positive" },
  { id: 28, text: "Tend to vote for liberal political candidates", domain: "O", facet: "O6", key: "positive" },
  { id: 29, text: "Sympathize with the homeless", domain: "A", facet: "A6", key: "positive" },
  { id: 30, text: "Jump into things without thinking", domain: "C", facet: "C6", key: "reverse" },
  { id: 31, text: "Fear for the worst", domain: "N", facet: "N1", key: "positive" },
  { id: 32, text: "Feel comfortable around people", domain: "E", facet: "E1", key: "positive" },
  { id: 33, text: "Enjoy wild flights of fantasy", domain: "O", facet: "O1", key: "positive" },
  { id: 34, text: "Believe that others have good intentions", domain: "A", facet: "A1", key: "positive" },
  { id: 35, text: "Excel in what I do", domain: "C", facet: "C1", key: "positive" },
  { id: 36, text: "Get irritated easily", domain: "N", facet: "N2", key: "positive" },
  { id: 37, text: "Talk to a lot of different people at parties", domain: "E", facet: "E2", key: "positive" },
  { id: 38, text: "See beauty in things that others might not notice", domain: "O", facet: "O2", key: "positive" },
  { id: 39, text: "Cheat to get ahead", domain: "A", facet: "A2", key: "reverse" },
  { id: 40, text: "Often forget to put things back in their proper place", domain: "C", facet: "C2", key: "reverse" },
  { id: 41, text: "Dislike myself", domain: "N", facet: "N3", key: "positive" },
  { id: 42, text: "Try to lead others", domain: "E", facet: "E3", key: "positive" },
  { id: 43, text: "Feel others’ emotions", domain: "O", facet: "O3", key: "positive" },
  { id: 44, text: "Am concerned about others", domain: "A", facet: "A3", key: "positive" },
  { id: 45, text: "Tell the truth", domain: "C", facet: "C3", key: "positive" },
  { id: 46, text: "Am afraid to draw attention to myself", domain: "N", facet: "N4", key: "positive" },
  { id: 47, text: "Am always on the go", domain: "E", facet: "E4", key: "positive" },
  { id: 48, text: "Prefer to stick with things that I know", domain: "O", facet: "O4", key: "reverse" },
  { id: 49, text: "Yell at people", domain: "A", facet: "A4", key: "reverse" },
  { id: 50, text: "Do more than what’s expected of me", domain: "C", facet: "C4", key: "positive" },
  { id: 51, text: "Rarely overindulge", domain: "N", facet: "N5", key: "reverse" },
  { id: 52, text: "Seek adventure", domain: "E", facet: "E5", key: "positive" },
  { id: 53, text: "Avoid philosophical discussions", domain: "O", facet: "O5", key: "reverse" },
  { id: 54, text: "Think highly of myself", domain: "A", facet: "A5", key: "reverse" },
  { id: 55, text: "Carry out my plans", domain: "C", facet: "C5", key: "positive" },
  { id: 56, text: "Become overwhelmed by events", domain: "N", facet: "N6", key: "positive" },
  { id: 57, text: "Have a lot of fun", domain: "E", facet: "E6", key: "positive" },
  { id: 58, text: "Believe that there is no absolute right or wrong", domain: "O", facet: "O6", key: "positive" },
  { id: 59, text: "Feel sympathy for those who are worse off than myself", domain: "A", facet: "A6", key: "positive" },
  { id: 60, text: "Make rash decisions", domain: "C", facet: "C6", key: "reverse" },
  { id: 61, text: "Am afraid of many things", domain: "N", facet: "N1", key: "positive" },
  { id: 62, text: "Avoid contacts with others", domain: "E", facet: "E1", key: "reverse" },
  { id: 63, text: "Love to daydream", domain: "O", facet: "O1", key: "positive" },
  { id: 64, text: "Trust what people say", domain: "A", facet: "A1", key: "positive" },
  { id: 65, text: "Handle tasks smoothly", domain: "C", facet: "C1", key: "positive" },
  { id: 66, text: "Lose my temper", domain: "N", facet: "N2", key: "positive" },
  { id: 67, text: "Prefer to be alone", domain: "E", facet: "E2", key: "reverse" },
  { id: 68, text: "Do not like poetry", domain: "O", facet: "O2", key: "reverse" },
  { id: 69, text: "Take advantage of others", domain: "A", facet: "A2", key: "reverse" },
  { id: 70, text: "Leave a mess in my room", domain: "C", facet: "C2", key: "reverse" },
  { id: 71, text: "Am often down in the dumps", domain: "N", facet: "N3", key: "positive" },
  { id: 72, text: "Take control of things", domain: "E", facet: "E3", key: "positive" },
  { id: 73, text: "Rarely notice my emotional reactions", domain: "O", facet: "O3", key: "reverse" },
  { id: 74, text: "Am indifferent to the feelings of others", domain: "A", facet: "A3", key: "reverse" },
  { id: 75, text: "Break rules", domain: "C", facet: "C3", key: "reverse" },
  { id: 76, text: "Only feel comfortable with friends", domain: "N", facet: "N4", key: "positive" },
  { id: 77, text: "Do a lot in my spare time", domain: "E", facet: "E4", key: "positive" },
  { id: 78, text: "Dislike changes", domain: "O", facet: "O4", key: "reverse" },
  { id: 79, text: "Insult people", domain: "A", facet: "A4", key: "reverse" },
  { id: 80, text: "Do just enough work to get by", domain: "C", facet: "C4", key: "reverse" },
  { id: 81, text: "Easily resist temptations", domain: "N", facet: "N5", key: "reverse" },
  { id: 82, text: "Enjoy being reckless", domain: "E", facet: "E5", key: "positive" },
  { id: 83, text: "Have difficulty understanding abstract ideas", domain: "O", facet: "O5", key: "reverse" },
  { id: 84, text: "Have a high opinion of myself", domain: "A", facet: "A5", key: "reverse" },
  { id: 85, text: "Waste my time", domain: "C", facet: "C5", key: "reverse" },
  { id: 86, text: "Feel that I’m unable to deal with things", domain: "N", facet: "N6", key: "positive" },
  { id: 87, text: "Love life", domain: "E", facet: "E6", key: "positive" },
  { id: 88, text: "Tend to vote for conservative political candidates", domain: "O", facet: "O6", key: "reverse" },
  { id: 89, text: "Am not interested in other people’s problems", domain: "A", facet: "A6", key: "reverse" },
  { id: 90, text: "Rush into things", domain: "C", facet: "C6", key: "reverse" },
  { id: 91, text: "Get stressed out easily", domain: "N", facet: "N1", key: "positive" },
  { id: 92, text: "Keep others at a distance", domain: "E", facet: "E1", key: "reverse" },
  { id: 93, text: "Like to get lost in thought", domain: "O", facet: "O1", key: "positive" },
  { id: 94, text: "Distrust people", domain: "A", facet: "A1", key: "reverse" },
  { id: 95, text: "Know how to get things done", domain: "C", facet: "C1", key: "positive" },
  { id: 96, text: "Am not easily annoyed", domain: "N", facet: "N2", key: "reverse" },
  { id: 97, text: "Avoid crowds", domain: "E", facet: "E2", key: "reverse" },
  { id: 98, text: "Do not enjoy going to art museums", domain: "O", facet: "O2", key: "reverse" },
  { id: 99, text: "Obstruct others’ plans", domain: "A", facet: "A2", key: "reverse" },
  { id: 100, text: "Leave my belongings around", domain: "C", facet: "C2", key: "reverse" },
  { id: 101, text: "Feel comfortable with myself", domain: "N", facet: "N3", key: "reverse" },
  { id: 102, text: "Wait for others to lead the way", domain: "E", facet: "E3", key: "reverse" },
  { id: 103, text: "Don’t understand people who get emotional", domain: "O", facet: "O3", key: "reverse" },
  { id: 104, text: "Take no time for others", domain: "A", facet: "A3", key: "reverse" },
  { id: 105, text: "Break my promises", domain: "C", facet: "C3", key: "reverse" },
  { id: 106, text: "Am not bothered by difficult social situations", domain: "N", facet: "N4", key: "reverse" },
  { id: 107, text: "Like to take it easy", domain: "E", facet: "E4", key: "reverse" },
  { id: 108, text: "Am attached to conventional ways", domain: "O", facet: "O4", key: "reverse" },
  { id: 109, text: "Get back at others", domain: "A", facet: "A4", key: "reverse" },
  { id: 110, text: "Put little time and effort into my work", domain: "C", facet: "C4", key: "reverse" },
  { id: 111, text: "Am able to control my cravings", domain: "N", facet: "N5", key: "reverse" },
  { id: 112, text: "Act wild and crazy", domain: "E", facet: "E5", key: "positive" },
  { id: 113, text: "Am not interested in theoretical discussions", domain: "O", facet: "O5", key: "reverse" },
  { id: 114, text: "Boast about my virtues", domain: "A", facet: "A5", key: "reverse" },
  { id: 115, text: "Have difficulty starting tasks", domain: "C", facet: "C5", key: "reverse" },
  { id: 116, text: "Remain calm under pressure", domain: "N", facet: "N6", key: "reverse" },
  { id: 117, text: "Look at the bright side of life", domain: "E", facet: "E6", key: "positive" },
  { id: 118, text: "Believe that we should be tough on crime", domain: "O", facet: "O6", key: "reverse" },
  { id: 119, text: "Try not to think about the needy", domain: "A", facet: "A6", key: "reverse" },
  { id: 120, text: "Act without thinking", domain: "C", facet: "C6", key: "reverse" },
] as const;

export class PersonalityScoringError extends Error {
  readonly code: "INCOMPLETE_RESPONSES" | "INVALID_RESPONSE" | "UNKNOWN_ITEM";
  readonly itemIds: number[];

  constructor(
    code: PersonalityScoringError["code"],
    message: string,
    itemIds: number[] = [],
  ) {
    super(message);
    this.name = "PersonalityScoringError";
    this.code = code;
    this.itemIds = itemIds;
  }
}

function round(value: number, places = 2): number {
  const factor = 10 ** places;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function normalizeResponses(input: IpipNeo120Responses): Map<number, IpipNeo120Response> {
  if (Array.isArray(input)) {
    if (input.length !== IPIP_NEO_120_ITEM_COUNT) {
      const missing = IPIP_NEO_120_ITEMS
        .slice(input.length)
        .map((item) => item.id);
      throw new PersonalityScoringError(
        "INCOMPLETE_RESPONSES",
        `IPIP-NEO-120 requires exactly 120 responses; received ${input.length}.`,
        missing,
      );
    }

    const normalized = new Map<number, IpipNeo120Response>();
    IPIP_NEO_120_ITEMS.forEach((item, index) => {
      const response = input[index];
      if (!Number.isInteger(response) || response < 1 || response > 5) {
        throw new PersonalityScoringError(
          "INVALID_RESPONSE",
          `Item ${item.id} must have an integer response from 1 to 5.`,
          [item.id],
        );
      }
      normalized.set(item.id, response as IpipNeo120Response);
    });
    return normalized;
  }

  if (input === null || typeof input !== "object") {
    throw new PersonalityScoringError(
      "INCOMPLETE_RESPONSES",
      "IPIP-NEO-120 requires responses for all 120 items.",
      IPIP_NEO_120_ITEMS.map((item) => item.id),
    );
  }

  const entries = Object.entries(input);
  const unknownIds = entries
    .map(([rawId]) => Number(rawId))
    .filter((id) => !Number.isInteger(id) || id < 1 || id > IPIP_NEO_120_ITEM_COUNT);
  if (unknownIds.length > 0) {
    throw new PersonalityScoringError(
      "UNKNOWN_ITEM",
      "Responses contain item identifiers outside the canonical 1-120 range.",
      unknownIds.filter(Number.isFinite),
    );
  }

  const missingIds = IPIP_NEO_120_ITEMS
    .filter((item) => !Object.prototype.hasOwnProperty.call(input, item.id))
    .map((item) => item.id);
  if (missingIds.length > 0) {
    throw new PersonalityScoringError(
      "INCOMPLETE_RESPONSES",
      `IPIP-NEO-120 is incomplete; ${missingIds.length} response${missingIds.length === 1 ? " is" : "s are"} missing.`,
      missingIds,
    );
  }

  const normalized = new Map<number, IpipNeo120Response>();
  for (const item of IPIP_NEO_120_ITEMS) {
    const response = input[item.id];
    if (!Number.isInteger(response) || response < 1 || response > 5) {
      throw new PersonalityScoringError(
        "INVALID_RESPONSE",
        `Item ${item.id} must have an integer response from 1 to 5.`,
        [item.id],
      );
    }
    normalized.set(item.id, response as IpipNeo120Response);
  }
  return normalized;
}

function keyedResponse(item: IpipNeo120Item, response: IpipNeo120Response): number {
  return item.key === "positive" ? response : 6 - response;
}

function scalePosition(keyedResponses: readonly number[]): Pick<PersonalityScaleResult, "score" | "responseMean"> {
  const responseMean = keyedResponses.reduce((sum, value) => sum + value, 0) / keyedResponses.length;
  return {
    responseMean: round(responseMean),
    score: round(((responseMean - IPIP_NEO_120_SCALE_MIN) /
      (IPIP_NEO_120_SCALE_MAX - IPIP_NEO_120_SCALE_MIN)) * 100),
  };
}

interface WorkStyleDefinition {
  id: WorkStyleDimensionId;
  label: string;
  sourceDomain: PersonalityDomainCode;
  low: string;
  middle: string;
  high: string;
}

const WORK_STYLE_DEFINITIONS: readonly WorkStyleDefinition[] = [
  {
    id: "pressure_approach",
    label: "Pressure approach",
    sourceDomain: "N",
    low: "Steady under pressure",
    middle: "Context-responsive",
    high: "Early risk sensing",
  },
  {
    id: "engagement_approach",
    label: "Engagement approach",
    sourceDomain: "E",
    low: "Independent depth",
    middle: "Flexible engagement",
    high: "Outward engagement",
  },
  {
    id: "novelty_approach",
    label: "Novelty approach",
    sourceDomain: "O",
    low: "Familiar-pattern focus",
    middle: "Contextual exploration",
    high: "Exploratory novelty",
  },
  {
    id: "collaboration_approach",
    label: "Collaboration approach",
    sourceDomain: "A",
    low: "Candid challenge",
    middle: "Flexible collaboration",
    high: "Cooperative alignment",
  },
  {
    id: "planning_approach",
    label: "Planning approach",
    sourceDomain: "C",
    low: "Adaptive spontaneity",
    middle: "Flexible planning",
    high: "Structured follow-through",
  },
] as const;

function neutralOrientation(definition: WorkStyleDefinition, score: number): string {
  if (score < 40) return definition.low;
  if (score > 60) return definition.high;
  return definition.middle;
}

/** Largest-remainder normalization produces deterministic integers totaling 100. */
function normalizeWeights(rawWeights: readonly number[]): number[] {
  const total = rawWeights.reduce((sum, value) => sum + value, 0);
  const exact = rawWeights.map((value) => (value / total) * 100);
  const weights = exact.map(Math.floor);
  let remainder = 100 - weights.reduce((sum, value) => sum + value, 0);
  const priority = exact
    .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((left, right) => right.fraction - left.fraction || left.index - right.index);
  for (let index = 0; index < priority.length && remainder > 0; index += 1) {
    weights[priority[index].index] += 1;
    remainder -= 1;
  }
  return weights;
}

function buildWorkStyleFit(domains: readonly PersonalityDomainResult[]): WorkStyleFitDimension[] {
  const byCode = new Map(domains.map((domain) => [domain.code, domain]));
  const positions = WORK_STYLE_DEFINITIONS.map((definition) => {
    const domain = byCode.get(definition.sourceDomain);
    if (!domain) throw new Error(`Missing domain ${definition.sourceDomain}.`);
    return domain.score;
  });

  // Distinctiveness from the neutral response midpoint determines how much each
  // bipolar style axis contributes to idea-generation fit. This is an explicit
  // application heuristic, not a validated IPIP personality score.
  const rawWeights = positions.map((position) => 20 + Math.abs(position - 50));
  const weights = normalizeWeights(rawWeights);

  return WORK_STYLE_DEFINITIONS.map((definition, index) => ({
    id: definition.id,
    label: definition.label,
    orientation: neutralOrientation(definition, positions[index]),
    sourceDomain: definition.sourceDomain,
    position: positions[index],
    weight: weights[index],
  }));
}

export function buildPersonalityPromptSummary(
  domains: readonly PersonalityDomainResult[],
  facets: readonly PersonalityFacetResult[],
  workStyleFit: readonly WorkStyleFitDimension[],
): string {
  const domainOrder: readonly PersonalityDomainCode[] = ["O", "C", "E", "A", "N"];
  const domainByCode = new Map(domains.map((domain) => [domain.code, domain]));
  const domainText = domainOrder
    .map((code) => {
      const domain = domainByCode.get(code);
      if (!domain) throw new Error(`Missing domain ${code}.`);
      return `${domain.label} ${domain.score}`;
    })
    .join(", ");

  const distinctiveFacets = [...facets]
    .sort((left, right) =>
      Math.abs(right.score - 50) - Math.abs(left.score - 50) ||
      IPIP_NEO_120_FACET_CODES.indexOf(left.code) - IPIP_NEO_120_FACET_CODES.indexOf(right.code))
    .slice(0, 5)
    .map((facet) => `${facet.label} ${facet.score}`)
    .join(", ");

  const workStyleText = workStyleFit
    .map((dimension) => `${dimension.orientation} ${dimension.weight}%`)
    .join(", ");

  return [
    `IPIP-NEO-120 self-report scale positions (0-100, not percentiles; 50 is the response midpoint): ${domainText}.`,
    `Most distinctive facet positions: ${distinctiveFacets}.`,
    `Idea-generation work-style emphasis: ${workStyleText}.`,
    "Use these as preference signals, not as a diagnosis or a selection criterion.",
  ].join(" ");
}

function recordValue(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function importedScalePosition(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100
    ? round(value)
    : undefined;
}

/**
 * Projects an imported result onto the canonical derived-only schema.
 * Unknown keys (including any raw responses), labels, orientations, weights,
 * and prompt text are discarded and reconstructed from the published scales.
 */
export function sanitizePersonalityProfileResult(input: unknown): PersonalityProfileResult | undefined {
  const value = recordValue(input);
  if (
    !value
    || value.instrument !== "IPIP-NEO-120"
    || value.scoringVersion !== "ipip-neo-120-scale-position/1.0.0"
    || value.completedItems !== 120
    || !Array.isArray(value.domains)
    || !Array.isArray(value.facets)
    || value.domains.length !== IPIP_NEO_120_DOMAINS.length
    || value.facets.length !== IPIP_NEO_120_FACETS.length
  ) return undefined;

  const importedDomains = new Map<PersonalityDomainCode, number>();
  for (const candidate of value.domains) {
    const domain = recordValue(candidate);
    if (!domain || !IPIP_NEO_120_DOMAIN_CODES.includes(domain.code as PersonalityDomainCode)) return undefined;
    const code = domain.code as PersonalityDomainCode;
    const score = importedScalePosition(domain.score);
    if (score === undefined || importedDomains.has(code)) return undefined;
    importedDomains.set(code, score);
  }

  const importedFacets = new Map<PersonalityFacetCode, number>();
  for (const candidate of value.facets) {
    const facet = recordValue(candidate);
    if (!facet || !IPIP_NEO_120_FACET_CODES.includes(facet.code as PersonalityFacetCode)) return undefined;
    const code = facet.code as PersonalityFacetCode;
    const score = importedScalePosition(facet.score);
    if (score === undefined || importedFacets.has(code)) return undefined;
    importedFacets.set(code, score);
  }

  const domains: PersonalityDomainResult[] = IPIP_NEO_120_DOMAINS.map((definition) => {
    const score = importedDomains.get(definition.code)!;
    return {
      ...definition,
      score,
      responseMean: round(1 + score * 0.04),
      itemCount: 24,
    };
  });
  const facets: PersonalityFacetResult[] = IPIP_NEO_120_FACETS.map((definition) => {
    const score = importedFacets.get(definition.code)!;
    return {
      ...definition,
      score,
      responseMean: round(1 + score * 0.04),
      itemCount: 4,
    };
  });
  const workStyleFit = buildWorkStyleFit(domains);
  return {
    instrument: "IPIP-NEO-120",
    scoringVersion: "ipip-neo-120-scale-position/1.0.0",
    completedItems: 120,
    domains,
    facets,
    workStyleFit,
    promptSummary: buildPersonalityPromptSummary(domains, facets, workStyleFit),
  };
}

export function scoreIpipNeo120(input: IpipNeo120Responses): PersonalityProfileResult {
  const responses = normalizeResponses(input);
  const keyedByItemId = new Map<number, number>();
  for (const item of IPIP_NEO_120_ITEMS) {
    keyedByItemId.set(item.id, keyedResponse(item, responses.get(item.id)!));
  }

  const facets: PersonalityFacetResult[] = IPIP_NEO_120_FACETS.map((definition) => {
    const items = IPIP_NEO_120_ITEMS.filter((item) => item.facet === definition.code);
    const position = scalePosition(items.map((item) => keyedByItemId.get(item.id)!));
    return {
      ...definition,
      ...position,
      itemCount: items.length,
    };
  });

  const domains: PersonalityDomainResult[] = IPIP_NEO_120_DOMAINS.map((definition) => {
    const items = IPIP_NEO_120_ITEMS.filter((item) => item.domain === definition.code);
    const position = scalePosition(items.map((item) => keyedByItemId.get(item.id)!));
    return {
      ...definition,
      ...position,
      itemCount: items.length,
    };
  });

  const workStyleFit = buildWorkStyleFit(domains);
  return {
    instrument: "IPIP-NEO-120",
    scoringVersion: "ipip-neo-120-scale-position/1.0.0",
    completedItems: 120,
    domains,
    facets,
    workStyleFit,
    promptSummary: buildPersonalityPromptSummary(domains, facets, workStyleFit),
  };
}
