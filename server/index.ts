import "dotenv/config";
import express from "express";
import { createOpenAIResponsesProvider } from "./llmProvider";
import { createMoveRunner } from "./moveRunner";
import type { LlmMoveRequest } from "../src/types";

const app = express();
const port = Number(process.env.PORT || 8787);
const moveRunner = createMoveRunner(createOpenAIResponsesProvider());

app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.post("/api/llm-move", async (req, res) => {
  try {
    const body = req.body as LlmMoveRequest;
    if (!body?.fen || !body?.graph || !body?.context) {
      res.status(400).json({ error: "fen, graph, and context are required." });
      return;
    }
    const result = await moveRunner.runSingleMove(body);
    res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown server error.";
    res.status(500).json({ error: message });
  }
});

app.listen(port, "127.0.0.1", () => {
  console.log(`LLM Chess Lite API listening on http://127.0.0.1:${port}`);
});
