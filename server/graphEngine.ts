import { Chess, Move } from "chess.js";
import type { LlmProvider } from "./llmProvider";
import type {
  LlmMoveRequest,
  LlmMoveResponse,
  NodeOutput,
  NodeRunTrace,
  PromptGraph,
  PromptNode
} from "../src/types";

type RuntimeContext = {
  fen: string;
  sideToMove: "white" | "black";
  legalMoves: string[];
  legalMovesText: string;
  sanHistory: string;
  uciHistory: string;
  moveNumber: number;
  lastMove: string;
  llmSide: "white" | "black";
  humanSide: "white" | "black";
  candidateMove: string;
  candidateLegal: boolean;
  lastLlmOutput: string;
  finalMove: string;
  fallbackUsed: boolean;
  node: Record<string, { output: NodeOutput; rawOutput?: string }>;
};

const UCI_RE = /^[a-h][1-8][a-h][1-8][qrbn]?$/i;


export async function runPromptGraphMove(
  request: LlmMoveRequest,
  options: { provider: LlmProvider }
): Promise<LlmMoveResponse> {
  const chess = new Chess(request.fen);
  const legalMoves = getLegalUciMoves(chess);
  if (!legalMoves.length) {
    throw new Error("No legal moves are available in the supplied position.");
  }

  const context: RuntimeContext = {
    fen: request.fen,
    sideToMove: chess.turn() === "w" ? "white" : "black",
    legalMoves,
    legalMovesText: legalMoves.join(", "),
    sanHistory: request.context.sanHistory || "",
    uciHistory: request.context.uciHistory || "",
    moveNumber: request.context.moveNumber,
    lastMove: request.context.lastMove || "",
    llmSide: request.context.llmSide,
    humanSide: request.context.humanSide,
    candidateMove: "",
    candidateLegal: false,
    lastLlmOutput: "",
    finalMove: "",
    fallbackUsed: false,
    node: {}
  };

  const runs: NodeRunTrace[] = [];
  let currentNodeId = request.graph.entryNodeId;
  const visited: string[] = [];

  for (let step = 0; step < 30; step += 1) {
    const node = getNode(request.graph, currentNodeId);
    if (!node) {
      throw new Error(`Prompt graph references missing node "${currentNodeId}".`);
    }
    visited.push(node.id);
    const run = await executeNode(node, context, options.provider);
    runs.push(run);

    const outgoing = request.graph.edges.filter((edge) => edge.source === node.id);
    const next = outgoing.find((edge) => evaluateCondition(edge.condition, run.output, context));
    if (node.terminal || !next) {
      break;
    }
    currentNodeId = next.target;
  }

  if (visited.length >= 30) {
    throw new Error("Prompt graph exceeded the 30-node execution limit.");
  }

  let finalMove = context.finalMove || context.candidateMove;
  if (!legalMoves.includes(finalMove)) {
    throw new Error("The model did not return a legal move. No substitute move was played.");
  }

  const move = chess.move({
    from: finalMove.slice(0, 2),
    to: finalMove.slice(2, 4),
    promotion: finalMove[4] || "q"
  });
  if (!move) {
    throw new Error(`Graph produced illegal move "${finalMove}".`);
  }

  return {
    move: finalMove,
    san: move.san,
    fallbackUsed: context.fallbackUsed,
    graphLabel: request.graph.label,
    runs
  };
}

function getLegalUciMoves(chess: Chess): string[] {
  return (chess.moves({ verbose: true }) as Move[]).map(
    (move) => `${move.from}${move.to}${move.promotion || ""}`
  );
}

async function executeNode(
  node: PromptNode,
  context: RuntimeContext,
  provider: LlmProvider
): Promise<NodeRunTrace> {
  const started = performance.now();
  let input = "";
  let rawOutput = "";
  let output: NodeOutput = {};

  if (node.type === "llm") {
    const system = renderTemplate(node.systemPrompt || "", context);
    const user = renderTemplate(node.promptTemplate || "", context);
    input = user;
    const completion = await provider.complete({
      model: node.model || "gpt-5.6-luna",
      reasoningEffort: node.reasoningEffort,
      system,
      user,
      temperature: node.temperature,
      maxTokens: node.maxTokens
    });
    rawOutput = completion.text;
    context.lastLlmOutput = rawOutput;
    output = { text: rawOutput };
    context.node[node.id] = { output, rawOutput };
    return {
      nodeId: node.id,
      nodeLabel: node.id,
      nodeType: node.type,
      input,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
        { role: "assistant", content: rawOutput }
      ],
      rawOutput,
      output,
      tokenUsage: completion.usage,
      durationMs: Math.round(performance.now() - started)
    };
  }

  if (node.type === "parser") {
    const sourceText =
      (node.sourceNodeId && context.node[node.sourceNodeId]?.rawOutput) || context.lastLlmOutput;
    const parsed = extractMove(sourceText, context.sideToMove);
    context.candidateMove = parsed;
    output = { move: parsed, source: sourceText };
  }

  if (node.type === "legal") {
    const isLegal = context.legalMoves.includes(context.candidateMove);
    context.candidateLegal = isLegal;
    output = {
      move: context.candidateMove,
      isLegal,
      legalMoves: context.legalMoves
    };
  }

  if (node.type === "logic") {
    output = executeLogicNode(node, context);
  }

  context.node[node.id] = { output, rawOutput };
  return {
    nodeId: node.id,
    nodeLabel: node.id,
    nodeType: node.type,
    input,
    rawOutput,
    output,
    durationMs: Math.round(performance.now() - started)
  };
}

function executeLogicNode(node: PromptNode, context: RuntimeContext): NodeOutput {
  const logic = node.logic || { kind: "always" };
  if (logic.kind === "moveNumberEquals") {
    const expected = Number(logic.compareValue || 1);
    return { match: context.moveNumber === expected, moveNumber: context.moveNumber };
  }
  if (logic.kind === "useCandidateMove") {
    if (context.candidateLegal && context.candidateMove) {
      context.finalMove = context.candidateMove;
    }
    return { move: context.finalMove, final: Boolean(context.finalMove) };
  }
  if (logic.kind === "firstLegalMove") {
    context.finalMove = context.legalMoves[0] || "";
    context.fallbackUsed = true;
    return { move: context.finalMove, final: Boolean(context.finalMove), fallback: true };
  }
  if (logic.kind === "setMove") {
    const move = (logic.moveValue || "").trim().toLowerCase();
    context.finalMove = context.legalMoves.includes(move) ? move : "";
    return { move: context.finalMove, final: Boolean(context.finalMove) };
  }
  return { match: true };
}

export function extractMove(text: string, sideToMove: "white" | "black"): string {
  const token = text.trim().toLowerCase();
  const rank = sideToMove === "black" ? "8" : "1";
  if (token === "o-o-o" || token === "0-0-0") return `e${rank}c${rank}`;
  if (token === "o-o" || token === "0-0") return `e${rank}g${rank}`;
  return UCI_RE.test(token) ? token : "";
}

function renderTemplate(template: string, context: RuntimeContext): string {
  return template.replace(/\{\{\s*([^}]+?)\s*\}\}|\{([^}]+?)\}/g, (_match, mustache, braces) => {
    const key = String(mustache || braces || "").trim();
    const value = resolvePath(key, context);
    if (Array.isArray(value)) return value.join(", ");
    if (value === undefined || value === null) return "";
    if (typeof value === "object") return JSON.stringify(value);
    return String(value);
  });
}

function evaluateCondition(condition: string | undefined, output: NodeOutput, context: RuntimeContext): boolean {
  const trimmed = (condition || "").trim();
  if (!trimmed || trimmed === "always") return true;
  const match = trimmed.match(/^(.+?)\s*(==|!=|>=|<=|>|<)\s*(.+)$/);
  if (!match) return false;

  const left = resolveConditionValue(match[1].trim(), output, context);
  const right = parseConditionLiteral(match[3].trim());
  const op = match[2];

  if (op === "==") return left === right;
  if (op === "!=") return left !== right;
  if (typeof left === "number" && typeof right === "number") {
    if (op === ">=") return left >= right;
    if (op === "<=") return left <= right;
    if (op === ">") return left > right;
    if (op === "<") return left < right;
  }
  return false;
}

function parseConditionLiteral(value: string): unknown {
  const unquoted = value.replace(/^["']|["']$/g, "");
  if (unquoted === "true") return true;
  if (unquoted === "false") return false;
  if (unquoted === "null") return null;
  const number = Number(unquoted);
  return Number.isFinite(number) && unquoted !== "" ? number : unquoted;
}

function resolveConditionValue(path: string, output: NodeOutput, context: RuntimeContext): unknown {
  if (path.startsWith("output.")) return resolvePath(path.slice("output.".length), output);
  if (path.startsWith("system.")) return resolvePath(path.slice("system.".length), context);
  return resolvePath(path, context);
}

function resolvePath(path: string, source: unknown): unknown {
  const parts = path.split(".");
  let cursor: unknown = source;
  for (const part of parts) {
    if (cursor && typeof cursor === "object" && part in cursor) {
      cursor = (cursor as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return cursor;
}

function getNode(graph: PromptGraph, id: string): PromptNode | undefined {
  return graph.nodes.find((node) => node.id === id);
}
