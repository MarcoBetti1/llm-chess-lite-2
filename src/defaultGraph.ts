import { PromptGraph } from "./types";

export const DEFAULT_MODEL = "gpt-4.1-mini";

export const defaultPromptGraph: PromptGraph = {
  id: "lite_chess_prompt_graph",
  label: "Lite chess move graph",
  version: "0.1.0",
  entryNodeId: "opening_gate",
  nodes: [
    {
      id: "opening_gate",
      label: "Move 1 gate",
      type: "logic",
      position: { x: 20, y: 130 },
      logic: { kind: "moveNumberEquals", compareValue: "1" }
    },
    {
      id: "opening_prompt",
      label: "Opening prompt",
      type: "llm",
      position: { x: 300, y: 20 },
      model: DEFAULT_MODEL,
      temperature: 0.2,
      maxTokens: 80,
      systemPrompt:
        "You are a practical chess opening player. Choose one legal move in UCI notation only.",
      promptTemplate:
        "FEN: {fen}\nSide to move: {sideToMove}\nLegal UCI moves: {legalMovesText}\nMove number: {moveNumber}\n\nReturn exactly one legal UCI move, with no explanation."
    },
    {
      id: "main_prompt",
      label: "Position prompt",
      type: "llm",
      position: { x: 300, y: 240 },
      model: DEFAULT_MODEL,
      temperature: 0.25,
      maxTokens: 100,
      systemPrompt:
        "You are a chess player choosing moves for the current side. Prefer legal, purposeful, forcing moves. Output one UCI move only.",
      promptTemplate:
        "FEN: {fen}\nSide to move: {sideToMove}\nLegal UCI moves: {legalMovesText}\nSAN history: {sanHistory}\nLast move: {lastMove}\n\nReturn exactly one legal UCI move, with no explanation."
    },
    {
      id: "parse_move",
      label: "Parse move",
      type: "parser",
      position: { x: 620, y: 130 }
    },
    {
      id: "local_legal_check",
      label: "Local legal check",
      type: "legal",
      position: { x: 900, y: 130 }
    },
    {
      id: "repair_prompt",
      label: "Repair prompt",
      type: "llm",
      position: { x: 1180, y: 20 },
      model: DEFAULT_MODEL,
      temperature: 0.0,
      maxTokens: 80,
      systemPrompt:
        "The previous chess move was invalid. Choose one move from the supplied legal UCI list only.",
      promptTemplate:
        "FEN: {fen}\nSide to move: {sideToMove}\nRejected move: {candidateMove}\nLegal UCI moves: {legalMovesText}\n\nReturn exactly one move copied from the legal UCI list."
    },
    {
      id: "parse_repair",
      label: "Parse repair",
      type: "parser",
      position: { x: 1480, y: 20 }
    },
    {
      id: "repair_legal_check",
      label: "Repair legal check",
      type: "legal",
      position: { x: 1760, y: 20 }
    },
    {
      id: "finalize_move",
      label: "Finalize move",
      type: "logic",
      position: { x: 2050, y: 130 },
      logic: { kind: "useCandidateMove" },
      terminal: true
    },
    {
      id: "fallback_move",
      label: "Fallback move",
      type: "logic",
      position: { x: 2050, y: 300 },
      logic: { kind: "firstLegalMove" },
      terminal: true
    }
  ],
  edges: [
    {
      id: "opening_gate-opening_prompt",
      source: "opening_gate",
      target: "opening_prompt",
      label: "first move",
      condition: "output.match == true"
    },
    {
      id: "opening_gate-main_prompt",
      source: "opening_gate",
      target: "main_prompt",
      label: "later",
      condition: "output.match == false"
    },
    {
      id: "opening_prompt-parse_move",
      source: "opening_prompt",
      target: "parse_move"
    },
    {
      id: "main_prompt-parse_move",
      source: "main_prompt",
      target: "parse_move"
    },
    {
      id: "parse_move-local_legal_check",
      source: "parse_move",
      target: "local_legal_check"
    },
    {
      id: "local_legal_check-finalize_move",
      source: "local_legal_check",
      target: "finalize_move",
      label: "legal",
      condition: "output.isLegal == true"
    },
    {
      id: "local_legal_check-repair_prompt",
      source: "local_legal_check",
      target: "repair_prompt",
      label: "repair",
      condition: "output.isLegal == false"
    },
    {
      id: "repair_prompt-parse_repair",
      source: "repair_prompt",
      target: "parse_repair"
    },
    {
      id: "parse_repair-repair_legal_check",
      source: "parse_repair",
      target: "repair_legal_check"
    },
    {
      id: "repair_legal_check-finalize_move",
      source: "repair_legal_check",
      target: "finalize_move",
      label: "legal",
      condition: "output.isLegal == true"
    },
    {
      id: "repair_legal_check-fallback_move",
      source: "repair_legal_check",
      target: "fallback_move",
      label: "fallback",
      condition: "output.isLegal == false"
    }
  ]
};
