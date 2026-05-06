import { runPromptGraphMove } from "./graphEngine";
import type { LlmProvider } from "./llmProvider";
import type { LlmMoveRequest, LlmMoveResponse } from "../src/types";

export interface MoveJob {
  gameId: string;
  ply: number;
  request: LlmMoveRequest;
}

export interface MoveJobResult {
  gameId: string;
  ply: number;
  result?: LlmMoveResponse;
  error?: string;
}

export function createMoveRunner(provider: LlmProvider) {
  return {
    runSingleMove(request: LlmMoveRequest) {
      return runPromptGraphMove(request, { provider });
    },
    async runSequentialMoveJobs(jobs: MoveJob[]): Promise<MoveJobResult[]> {
      const results: MoveJobResult[] = [];
      for (const job of jobs) {
        try {
          const result = await runPromptGraphMove(job.request, { provider });
          results.push({ gameId: job.gameId, ply: job.ply, result });
        } catch (error) {
          results.push({
            gameId: job.gameId,
            ply: job.ply,
            error: error instanceof Error ? error.message : "Unknown move job error."
          });
        }
      }
      return results;
    }
  };
}
