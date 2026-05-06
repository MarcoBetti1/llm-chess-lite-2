# LLM Chess Lite

User vs OpenAI chess app with a configurable prompt graph for the LLM move logic.

## Run

```powershell
cd "C:\Users\marco\Documents\New project\llm-chess-lite"
npm.cmd install
copy .env.example .env
# Edit .env and set OPENAI_API_KEY
npm.cmd run dev
```

Client: http://127.0.0.1:5173  
API: http://127.0.0.1:8787

## Prompt Graph

The saved graph is snapshotted when a game starts. Configuration edits are locked while a game is active and only affect the next game after saving.

Available template variables include `{fen}`, `{sideToMove}`, `{legalMovesText}`, `{sanHistory}`, `{uciHistory}`, `{moveNumber}`, `{lastMove}`, `{candidateMove}`, and node paths like `{node.parse_move.output.move}`.
