import { CSSProperties, useEffect, useMemo, useRef, useState } from "react";
import { Chess, Move, Square } from "chess.js";
import { Chessboard } from "react-chessboard";
import { Pause, Play, RotateCcw, StepForward, Square as SquareIcon } from "lucide-react";
import { ConversationLog } from "./ConversationLog";
import { moveNumberFromPly, moveToUci, opposite, sideName, turnToSide } from "../lib/chess";
import type {
  LlmMoveRequest,
  LlmMoveResponse,
  LocalMoveRecord,
  PromptGraph,
  Side,
  TurnTrace
} from "../types";

type GameMode = "human-llm" | "llm-llm";

type Props = {
  systems: PromptGraph[];
  onGameActiveChange: (active: boolean) => void;
};

type ActiveSystems = Partial<Record<Side, PromptGraph>>;

function cloneGraph(graph: PromptGraph): PromptGraph {
  return JSON.parse(JSON.stringify(graph)) as PromptGraph;
}

export function GameplayScreen({ systems, onGameActiveChange }: Props) {
  const gameRef = useRef(new Chess());
  const movesRef = useRef<LocalMoveRecord[]>([]);
  const activeSystemsRef = useRef<ActiveSystems>({});
  const modeRef = useRef<GameMode>("human-llm");
  const autoPlayRef = useRef(true);
  const activeRef = useRef(false);

  const [mode, setMode] = useState<GameMode>("human-llm");
  const [humanSide, setHumanSide] = useState<Side>("white");
  const [llmSystemId, setLlmSystemId] = useState(systems[0]?.id || "");
  const [whiteSystemId, setWhiteSystemId] = useState(systems[0]?.id || "");
  const [blackSystemId, setBlackSystemId] = useState(systems[1]?.id || systems[0]?.id || "");
  const [fen, setFen] = useState(gameRef.current.fen());
  const [active, setActive] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [autoPlay, setAutoPlay] = useState(true);
  const [status, setStatus] = useState("Ready.");
  const [gameOver, setGameOver] = useState("");
  const [traces, setTraces] = useState<TurnTrace[]>([]);
  const [moves, setMoves] = useState<LocalMoveRecord[]>([]);
  const [selectedSquare, setSelectedSquare] = useState<Square | null>(null);
  const [moveHints, setMoveHints] = useState<Square[]>([]);
  const [lastMove, setLastMove] = useState<{ from: string; to: string } | null>(null);
  const [boardWidth, setBoardWidth] = useState(560);
  const boardWrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    onGameActiveChange(active && !gameOver);
  }, [active, gameOver, onGameActiveChange]);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  useEffect(() => {
    autoPlayRef.current = autoPlay;
  }, [autoPlay]);

  useEffect(() => {
    if (!systems.some((system) => system.id === llmSystemId)) setLlmSystemId(systems[0]?.id || "");
    if (!systems.some((system) => system.id === whiteSystemId)) setWhiteSystemId(systems[0]?.id || "");
    if (!systems.some((system) => system.id === blackSystemId)) setBlackSystemId(systems[0]?.id || "");
  }, [systems, llmSystemId, whiteSystemId, blackSystemId]);

  useEffect(() => {
    const compute = () => {
      const width = boardWrapRef.current?.getBoundingClientRect().width || 760;
      const heightLimit = Math.max(460, window.innerHeight - 230);
      const next = Math.max(380, Math.min(width - 24, heightLimit, 980));
      setBoardWidth(next);
    };
    compute();
    const observer = new ResizeObserver(compute);
    if (boardWrapRef.current) observer.observe(boardWrapRef.current);
    window.addEventListener("resize", compute);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", compute);
    };
  }, []);

  const currentTurn = turnToSide(gameRef.current.turn());
  const orientation = mode === "human-llm" ? humanSide : "white";
  const isHumanTurn = mode === "human-llm" && currentTurn === humanSide;
  const canMoveHuman = active && !waiting && !gameOver && isHumanTurn;

  const selectedSystemName = (id: string) => systems.find((system) => system.id === id)?.label || id;

  const startGame = () => {
    const fresh = new Chess();
    gameRef.current = fresh;
    movesRef.current = [];
    setMoves([]);
    setFen(fresh.fen());
    setTraces([]);
    setGameOver("");
    setLastMove(null);
    setSelectedSquare(null);
    setMoveHints([]);
    setActive(true);
    activeRef.current = true;
    setAutoPlay(true);
    setStatus("Game started.");

    if (mode === "human-llm") {
      const llmSide = opposite(humanSide);
      const graph = systems.find((system) => system.id === llmSystemId) || systems[0];
      activeSystemsRef.current = graph ? { [llmSide]: cloneGraph(graph) } : {};
      if (llmSide === "white") {
        void requestLlmMove();
      }
      return;
    }

    const whiteGraph = systems.find((system) => system.id === whiteSystemId) || systems[0];
    const blackGraph = systems.find((system) => system.id === blackSystemId) || systems[0];
    activeSystemsRef.current = {
      white: cloneGraph(whiteGraph),
      black: cloneGraph(blackGraph)
    };
    void requestLlmMove();
  };

  const stopGame = () => {
    setActive(false);
    activeRef.current = false;
    setWaiting(false);
    setAutoPlay(false);
    setStatus("Stopped.");
  };

  const requestLlmMove = async () => {
    const chess = gameRef.current;
    if (!activeRef.current && chess.history().length > 0) return;
    if (chess.isGameOver()) {
      concludeGame(chess);
      return;
    }

    const side = turnToSide(chess.turn());
    const graph = activeSystemsRef.current[side];
    if (!graph) {
      setStatus(`No LLM system for ${sideName(side)}.`);
      return;
    }

    const fenBefore = chess.fen();
    setWaiting(true);
    setStatus(`${sideName(side)} thinking with ${graph.label}.`);

    try {
      const body: LlmMoveRequest = {
        fen: fenBefore,
        graph,
        context: {
          moveNumber: moveNumberFromPly(movesRef.current.length),
          sanHistory: gameRef.current.history().join(" "),
          uciHistory: movesRef.current.map((move) => move.uci).join(" "),
          lastMove: movesRef.current.at(-1)?.san || "",
          llmSide: side,
          humanSide
        }
      };
      const response = await fetch("/api/llm-move", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      const data = (await response.json()) as LlmMoveResponse | { error: string };
      if (!response.ok) throw new Error("error" in data ? data.error : "LLM move request failed.");
      applyLlmMove(data as LlmMoveResponse, side, fenBefore);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "LLM move failed.");
      setWaiting(false);
    }
  };

  const applyLlmMove = (data: LlmMoveResponse, side: Side, fenBefore: string) => {
    const chess = gameRef.current;
    if (chess.fen() !== fenBefore) {
      setWaiting(false);
      return;
    }
    const applied = chess.move({
      from: data.move.slice(0, 2),
      to: data.move.slice(2, 4),
      promotion: data.move[4] || "q"
    });
    if (!applied) {
      setStatus(`Server returned illegal move ${data.move}.`);
      setWaiting(false);
      return;
    }
    const record: LocalMoveRecord = {
      actor: "llm",
      side,
      san: applied.san,
      uci: moveToUci(applied),
      fenAfter: chess.fen()
    };
    movesRef.current = [...movesRef.current, record];
    setMoves(movesRef.current);
    setFen(chess.fen());
    setLastMove({ from: applied.from, to: applied.to });
    setTraces((current) => [
      ...current,
      {
        id: `${Date.now()}-${movesRef.current.length}`,
        side,
        systemLabel: data.graphLabel,
        fenBefore,
        move: data.move,
        san: data.san,
        fallbackUsed: data.fallbackUsed,
        runs: data.runs
      }
    ]);

    if (chess.isGameOver()) {
      concludeGame(chess);
      setWaiting(false);
      return;
    }

    setStatus(`${sideName(side)} played ${applied.san}.`);
    setWaiting(false);

    if (modeRef.current === "llm-llm" && autoPlayRef.current) {
      window.setTimeout(() => void requestLlmMove(), 600);
    }
  };

  const concludeGame = (chess: Chess) => {
    const label = gameStatus(chess);
    setGameOver(label);
    setActive(false);
    activeRef.current = false;
    setStatus(label);
  };

  const loadHints = (square: Square) => {
    const verboseMoves = gameRef.current.moves({ square, verbose: true }) as Move[];
    setSelectedSquare(square);
    setMoveHints(verboseMoves.map((move) => move.to as Square));
  };

  const resetSelection = () => {
    setSelectedSquare(null);
    setMoveHints([]);
  };

  const attemptHumanMove = (from: Square, to: Square) => {
    if (!canMoveHuman) return false;
    const chess = gameRef.current;
    const move = chess.move({ from, to, promotion: "q" });
    if (!move) {
      setStatus("Illegal move.");
      return false;
    }
    const record: LocalMoveRecord = {
      actor: "human",
      side: humanSide,
      san: move.san,
      uci: moveToUci(move),
      fenAfter: chess.fen()
    };
    movesRef.current = [...movesRef.current, record];
    setMoves(movesRef.current);
    setFen(chess.fen());
    setLastMove({ from: move.from, to: move.to });
    resetSelection();

    if (chess.isGameOver()) {
      concludeGame(chess);
      return true;
    }

    setStatus(`You played ${move.san}.`);
    void requestLlmMove();
    return true;
  };

  const onSquareClick = (squareName: string) => {
    if (!canMoveHuman) return;
    const square = squareName as Square;
    const chess = gameRef.current;
    const piece = chess.get(square);
    const ownColor = humanSide === "white" ? "w" : "b";
    const isOwnPiece = piece?.color === ownColor;

    if (!selectedSquare) {
      if (isOwnPiece) loadHints(square);
      return;
    }

    if (square === selectedSquare) {
      resetSelection();
      return;
    }

    if (isOwnPiece) {
      loadHints(square);
      return;
    }

    if (!attemptHumanMove(selectedSquare, square)) resetSelection();
  };

  const squareStyles = useMemo(() => {
    const styles: Record<string, CSSProperties> = {};
    if (lastMove) {
      styles[lastMove.from] = { background: "rgba(220, 169, 64, 0.45)" };
      styles[lastMove.to] = { background: "rgba(78, 148, 105, 0.42)" };
    }
    if (selectedSquare) {
      styles[selectedSquare] = { boxShadow: "inset 0 0 0 3px rgba(34, 117, 81, 0.9)" };
    }
    moveHints.forEach((square) => {
      styles[square] = {
        ...styles[square],
        boxShadow: "inset 0 0 0 3px rgba(56, 111, 166, 0.86)"
      };
    });
    return styles;
  }, [lastMove, selectedSquare, moveHints]);

  return (
    <main className="screen-grid">
      <section className="panel board-panel">
        <div className="panel-header">
          <div className="game-title-stack">
            <h2>Game</h2>
            <span>{status}</span>
            <small>
              {moves.length ? `${moves.length} plies` : "No moves"}
              {" · "}
              {mode === "human-llm"
                ? `${sideName(humanSide)} user, ${sideName(opposite(humanSide))} ${selectedSystemName(llmSystemId)}`
                : `White ${selectedSystemName(whiteSystemId)}, Black ${selectedSystemName(blackSystemId)}`}
            </small>
          </div>
          <div className="button-row">
            {mode === "llm-llm" && active ? (
              <>
                {autoPlay ? (
                  <button className="play-control-button" onClick={() => setAutoPlay(false)}>
                    <Pause size={16} />
                    Pause autoplay
                  </button>
                ) : (
                  <button
                    className="play-control-button"
                    onClick={() => {
                      setAutoPlay(true);
                      if (!waiting && !gameOver) window.setTimeout(() => void requestLlmMove(), 0);
                    }}
                  >
                    <Play size={16} />
                    Resume autoplay
                  </button>
                )}
                <button
                  className="play-control-button"
                  onClick={() => void requestLlmMove()}
                  disabled={waiting || autoPlay || !!gameOver}
                >
                  <StepForward size={16} />
                  Step move
                </button>
                <button className="play-control-button" onClick={stopGame}>
                  <SquareIcon size={16} />
                  End game
                </button>
              </>
            ) : (
              <button className="play-control-button" onClick={active ? stopGame : startGame}>
                {active ? <SquareIcon size={16} /> : <Play size={16} />}
                {active ? "End game" : "Start game"}
              </button>
            )}
            <button className="play-control-button" onClick={startGame}>
              <RotateCcw size={16} />
              Restart
            </button>
          </div>
        </div>

        <div className="game-controls">
          <div className="segmented">
            <button disabled={active} className={mode === "human-llm" ? "active" : ""} onClick={() => setMode("human-llm")}>
              User vs LLM
            </button>
            <button disabled={active} className={mode === "llm-llm" ? "active" : ""} onClick={() => setMode("llm-llm")}>
              LLM vs LLM
            </button>
          </div>

          {mode === "human-llm" ? (
            <div className="control-grid">
              <label>
                User side
                <select disabled={active} value={humanSide} onChange={(event) => setHumanSide(event.target.value as Side)}>
                  <option value="white">White</option>
                  <option value="black">Black</option>
                </select>
              </label>
              <label>
                LLM system
                <select disabled={active} value={llmSystemId} onChange={(event) => setLlmSystemId(event.target.value)}>
                  {systems.map((system) => (
                    <option key={system.id} value={system.id}>
                      {system.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          ) : (
            <div className="control-grid">
              <label>
                White system
                <select disabled={active} value={whiteSystemId} onChange={(event) => setWhiteSystemId(event.target.value)}>
                  {systems.map((system) => (
                    <option key={system.id} value={system.id}>
                      {system.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Black system
                <select disabled={active} value={blackSystemId} onChange={(event) => setBlackSystemId(event.target.value)}>
                  {systems.map((system) => (
                    <option key={system.id} value={system.id}>
                      {system.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}
        </div>

        <div className="board-wrap" ref={boardWrapRef}>
          <Chessboard
            position={fen}
            boardOrientation={orientation}
            boardWidth={boardWidth}
            arePiecesDraggable={false}
            onSquareClick={onSquareClick}
            animationDuration={180}
            customSquareStyles={squareStyles}
            customBoardStyle={{
              borderRadius: "8px",
              border: "1px solid var(--line-strong)",
              boxShadow: "0 20px 50px rgba(32, 34, 38, 0.14)"
            }}
            customLightSquareStyle={{ backgroundColor: "var(--board-light)" }}
            customDarkSquareStyle={{ backgroundColor: "var(--board-dark)" }}
          />
          {gameOver && <div className="board-overlay">{gameOver}</div>}
        </div>
      </section>

      <ConversationLog traces={traces} />
    </main>
  );
}

function gameStatus(chess: Chess): string {
  if (chess.isCheckmate()) return `Checkmate. ${chess.turn() === "w" ? "Black" : "White"} wins.`;
  if (chess.isStalemate()) return "Draw by stalemate.";
  if (chess.isThreefoldRepetition()) return "Draw by repetition.";
  if (chess.isInsufficientMaterial()) return "Draw by insufficient material.";
  if (chess.isDraw()) return "Draw.";
  return "Game over.";
}
