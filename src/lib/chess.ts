import type { Move } from "chess.js";
import type { Side } from "../types";

export function moveToUci(move: Move): string {
  return `${move.from}${move.to}${move.promotion || ""}`;
}

export function opposite(side: Side): Side {
  return side === "white" ? "black" : "white";
}

export function turnToSide(turn: "w" | "b"): Side {
  return turn === "w" ? "white" : "black";
}

export function sideName(side: Side): string {
  return side === "white" ? "White" : "Black";
}

export function moveNumberFromPly(plyCount: number): number {
  return Math.floor(plyCount / 2) + 1;
}
