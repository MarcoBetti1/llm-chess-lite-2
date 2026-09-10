import { PromptGraph } from "./types";

export const DEFAULT_MODEL = "gpt-5.6-luna";

// A bad answer stops the turn. Repair and firstLegalMove nodes remain available
// for explicitly designed playground graphs, but are not the default.
export const defaultPromptGraph: PromptGraph = {
  id: "strict_chess_move", label: "One request, no repairs", version: "0.2.0",
  entryNodeId: "choose_move",
  nodes: [
    { id: "choose_move", label: "Choose move", type: "llm", position: { x: 20, y: 100 },
      model: DEFAULT_MODEL, reasoningEffort: "low", maxTokens: 2048,
      systemPrompt: "Play the best chess move. Return exactly one legal UCI move, with no explanation.",
      promptTemplate: "FEN: {fen}\nSide to move: {sideToMove}\nLegal UCI moves: {legalMovesText}\nSAN history: {sanHistory}" },
    { id: "parse_move", label: "Parse exact move", type: "parser", position: { x: 320, y: 100 } },
    { id: "local_legal_check", label: "Check legality", type: "legal", position: { x: 620, y: 100 } },
    { id: "finalize_move", label: "Play legal move", type: "logic", position: { x: 920, y: 100 }, logic: { kind: "useCandidateMove" }, terminal: true }
  ],
  edges: [
    { id: "choose-parse", source: "choose_move", target: "parse_move" },
    { id: "parse-check", source: "parse_move", target: "local_legal_check" },
    { id: "check-play", source: "local_legal_check", target: "finalize_move", condition: "output.isLegal == true" }
  ]
};
