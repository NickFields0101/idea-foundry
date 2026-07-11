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

export interface ListModelsInput extends LlmConnectionOptions {
  query?: string;
}

export interface GenerateIdeasInput extends LlmConnectionOptions {
  prompt: string;
  count?: number;
}

export type AiProposalConfidence = "low" | "medium" | "high";
export type AiGateStatus = "pass" | "conditional" | "fail" | "unresolved" | "not_due";
export type AiEvidenceType =
  | "FounderAssertion"
  | "DeskResearch"
  | "ExpertOpinion"
  | "CustomerObservation"
  | "CustomerCommitment"
  | "Payment"
  | "PrototypeTest"
  | "Benchmark"
  | "Audit"
  | "ProductionBehavior"
  | "ReferenceCheck"
  | "RoleSimulation"
  | "Other";
export type AiEvidenceGrade = "E0" | "E1" | "E2" | "E3" | "E4";

export interface DraftEvaluationInput extends LlmConnectionOptions {
  /** User-visible selected idea and project context. Sent to the configured model. */
  projectContext: string;
  /** Optional canonical rubric claim IDs to evaluate. Omit to request the complete catalog. */
  claimIds?: string[];
  /** Quick Run may refresh only canonical gates after evidence changes. */
  scope?: "claims_and_gates" | "gates_only";
}

export interface EvaluationClaimProposal {
  claimId: string;
  suggestedMerit: number | null;
  reasoning: string;
  confidence: AiProposalConfidence;
  uncertainty: string;
}

export interface EvaluationGateProposal {
  gateId: "G1" | "G2" | "G3" | "G4" | "G5" | "G6" | "G7" | "G8";
  suggestedStatus: AiGateStatus;
  reasoning: string;
  confidence: AiProposalConfidence;
  uncertainty: string;
}

export interface DraftEvaluationResult {
  claims: EvaluationClaimProposal[];
  gates: EvaluationGateProposal[];
  provider: LlmProvider;
  model: string;
  provisional: true;
}

export interface ExtractEvidenceInput extends LlmConnectionOptions {
  /** The only source from which the model may propose evidence. */
  sourceText: string;
  sourceLabel?: string;
}

export interface EvidenceProposal {
  title: string;
  sourceExcerpt: string;
  claimIds: string[];
  suggestedType: AiEvidenceType;
  suggestedGrade: AiEvidenceGrade;
  direction: "supports" | "contradicts";
  verificationStatus: "source_supported" | "unverifiable";
  unverifiable: boolean;
  unverifiableReason: string;
  reasoning: string;
  confidence: AiProposalConfidence;
  uncertainty: string;
  /** AI output is never allowed to verify evidence. A human reviewer must do that separately. */
  reviewerVerified: false;
}

export interface ExtractEvidenceResult {
  evidence: EvidenceProposal[];
  sourceLabel: string;
  provider: LlmProvider;
  model: string;
  provisional: true;
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
    clearConfig(): Promise<LlmConfig>;
    testConnection(input?: LlmConnectionOptions): Promise<LlmConnectionTest>;
    listModels(input?: ListModelsInput): Promise<LlmModel[]>;
    generateIdeas(input: GenerateIdeasInput): Promise<GeneratedIdeasResult>;
    draftEvaluation(input: DraftEvaluationInput): Promise<DraftEvaluationResult>;
    extractEvidence(input: ExtractEvidenceInput): Promise<ExtractEvidenceResult>;
  };
}

declare global {
  interface Window {
    ideaFoundry?: IdeaFoundryBridge;
  }
}
