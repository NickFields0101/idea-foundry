export type LlmProvider = "ollama" | "lmstudio" | "openrouter" | "openaiCompatible";

export interface LlmConfig {
  provider: LlmProvider;
  baseUrl: string;
  model: string;
  hasApiKey: boolean;
}

export interface SaveLlmConfigInput {
  provider: LlmProvider;
  baseUrl: string;
  model: string;
  apiKey?: string;
  clearApiKey?: boolean;
}

export interface LlmConnectionOptions {
  provider?: LlmProvider;
  baseUrl?: string;
  model?: string;
  apiKey?: string;
}

export interface LlmConnectionTest {
  ok: boolean;
  message: string;
  provider: LlmProvider;
  baseUrl: string;
  model?: string;
  latencyMs?: number;
}

export interface LlmModel {
  id: string;
  name: string;
}

export interface GenerateIdeasInput extends LlmConnectionOptions {
  prompt: string;
  count?: number;
}

export interface NormalizedIdeaScores {
  personalFit: number | null;
  opportunitySignal: number;
  protocolAffordance: number;
  experimentability: number;
}

export interface NormalizedGeneratedIdea {
  title: string;
  concept: string;
  user: string;
  buyer: string;
  triggeringSituation: string;
  currentAlternative: string;
  materialConsequence: string;
  protocolNeed: string;
  failureReason: string;
  criticalAssumption: string;
  experiment: string;
  route: "Xahau" | "Evernode" | "Both" | "Neither yet";
  scores: NormalizedIdeaScores;
}

export interface GeneratedIdeasResult {
  ideas: NormalizedGeneratedIdea[];
  provider: LlmProvider;
  model: string;
}

export interface IdeaFoundryBridge {
  desktop: boolean;
  app: {
    getVersion(): Promise<string>;
  };
  llm: {
    getConfig(): Promise<LlmConfig>;
    saveConfig(input: SaveLlmConfigInput): Promise<LlmConfig>;
    testConnection(input?: LlmConnectionOptions): Promise<LlmConnectionTest>;
    listModels(input?: LlmConnectionOptions): Promise<LlmModel[]>;
    generateIdeas(input: GenerateIdeasInput): Promise<GeneratedIdeasResult>;
  };
}

declare global {
  interface Window {
    ideaFoundry?: IdeaFoundryBridge;
  }
}
