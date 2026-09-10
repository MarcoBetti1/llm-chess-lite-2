export type Side = "white" | "black";

export type PromptNodeType = "llm" | "logic" | "parser" | "legal";

export type LogicKind =
  | "moveNumberEquals"
  | "useCandidateMove"
  | "firstLegalMove"
  | "setMove"
  | "always";

export type NodeOutput = Record<string, unknown>;

export interface TokenUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}

export interface PromptNode {
  id: string;
  label: string;
  type: PromptNodeType;
  position: { x: number; y: number };
  model?: string;
  temperature?: number;
  reasoningEffort?: "none" | "low" | "medium" | "high";
  maxTokens?: number;
  systemPrompt?: string;
  promptTemplate?: string;
  sourceNodeId?: string;
  logic?: {
    kind: LogicKind;
    compareValue?: string;
    moveValue?: string;
  };
  terminal?: boolean;
}

export interface PromptEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
  condition?: string;
}

export interface PromptGraph {
  id: string;
  label: string;
  version: string;
  entryNodeId: string;
  nodes: PromptNode[];
  edges: PromptEdge[];
}

export interface MoveRequestContext {
  moveNumber: number;
  sanHistory: string;
  uciHistory: string;
  lastMove: string;
  llmSide: Side;
  humanSide: Side;
}

export interface LlmMoveRequest {
  fen: string;
  graph: PromptGraph;
  context: MoveRequestContext;
}

export interface ChatMessageTrace {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface NodeRunTrace {
  nodeId: string;
  nodeLabel: string;
  nodeType: PromptNodeType;
  input?: string;
  messages?: ChatMessageTrace[];
  rawOutput?: string;
  output: NodeOutput;
  durationMs: number;
  tokenUsage?: TokenUsage;
  error?: string;
}

export interface LlmMoveResponse {
  move: string;
  san: string;
  fallbackUsed: boolean;
  graphLabel: string;
  runs: NodeRunTrace[];
}

export interface LocalMoveRecord {
  actor: "human" | "llm";
  side: Side;
  san: string;
  uci: string;
  fenAfter: string;
}

export interface TurnTrace {
  id: string;
  side: Side;
  systemLabel: string;
  fenBefore: string;
  move: string;
  san: string;
  fallbackUsed: boolean;
  runs: NodeRunTrace[];
}
