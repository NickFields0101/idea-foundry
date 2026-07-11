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

export interface ResearchEvidenceInput extends LlmConnectionOptions {
  /** User-visible selected idea and project context. Sent to OpenRouter for public web research. */
  projectContext: string;
  /** Optional canonical rubric claim IDs to research. Omit to use the complete catalog. */
  claimIds?: string[];
  /** Bounded to 3-10 public sources by the desktop main process. */
  maxSources?: number;
}

export interface ResearchCitation {
  sourceId: string;
  url: string;
  title: string;
  /** Provider-supplied extractive excerpt. Kept transiently until evidence is approved. */
  content: string;
  contentSha256: string;
}

export interface ResearchEvidenceProposal {
  title: string;
  sourceId: string;
  sourceUrl: string;
  sourceTitle: string;
  sourceExcerpt: string;
  claimIds: string[];
  suggestedType: "DeskResearch";
  suggestedGrade: "E1";
  direction: "supports" | "contradicts";
  verificationStatus: "provider_excerpt";
  reasoning: string;
  confidence: AiProposalConfidence;
  uncertainty: string;
  reviewerVerified: false;
}

export interface ResearchEvidenceResult {
  evidence: ResearchEvidenceProposal[];
  citations: ResearchCitation[];
  provider: "openrouter";
  model: string;
  researchEngine: "exa";
  researchedAt: string;
  webSearchRequests: number;
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

export type BuildToolId = "evernode-mcp" | "xahau-mcp" | "xahc" | "xahc-prover";

export type BuildCapability =
  | "list_templates"
  | "generate_contract"
  | "check_determinism"
  | "check_contract_api"
  | "recommend_pattern"
  | "check_hook_compat"
  | "generate_settlement"
  | "estimate_lease_cost"
  | "recommend_hosts"
  | "host_diagnostics"
  | "generate_deploy_commands"
  | "explain_error"
  | "scaffold_hook"
  | "analyze_hook"
  | "hook_report"
  | "doctor";

export interface BuildCatalogEntry {
  id: BuildToolId;
  label: string;
  summary: string;
  kind: "mcp" | "cli" | "companion";
  repositoryUrl: string;
  installUrl: string;
  capabilities: BuildCapability[];
  safety: string;
  platformNote?: string;
}

export interface BuildToolStatus {
  id: BuildToolId;
  available: boolean;
  runnable: boolean;
  support: "supported" | "custom" | "unsupported";
  version?: string;
  message: string;
}

export interface BuildRunInput {
  toolId: BuildToolId;
  capability: BuildCapability;
  /** Bounded JSON data validated again against the selected operation in the main process. */
  arguments?: Record<string, unknown>;
}

export interface BuildRunResult {
  toolId: BuildToolId;
  capability: BuildCapability;
  output: unknown;
  durationMs: number;
  truncated: boolean;
  advisory: true;
}

export interface IdeaFoundryBridge {
  desktop: boolean;
  app: {
    getVersion(): Promise<string>;
    /** Opens only one of SIFT's four exact allowlisted Hugegreencandle GitHub repositories. */
    openExternal(url: string): Promise<boolean>;
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
    researchEvidence(input: ResearchEvidenceInput): Promise<ResearchEvidenceResult>;
  };
  build: {
    getCatalog(): Promise<BuildCatalogEntry[]>;
    detect(): Promise<BuildToolStatus[]>;
    run(input: BuildRunInput): Promise<BuildRunResult>;
  };
}

declare global {
  interface Window {
    ideaFoundry?: IdeaFoundryBridge;
  }
}
