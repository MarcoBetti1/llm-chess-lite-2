import OpenAI from "openai";

export interface PromptCompletionRequest {
  model: string;
  system: string;
  user: string;
  temperature?: number;
  reasoningEffort?: "none" | "low" | "medium" | "high";
  maxTokens?: number;
}

export interface PromptCompletionResult {
  text: string;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
  };
}

export interface LlmProvider {
  complete(request: PromptCompletionRequest): Promise<PromptCompletionResult>;
}

export function createOpenAIResponsesProvider(): LlmProvider {
  let client: OpenAI | null = null;
  return {
    async complete(request) {
      if (!process.env.OPENAI_API_KEY) {
        throw new Error("OPENAI_API_KEY is not set. Add it to .env or the shell environment.");
      }
      client ??= new OpenAI({ apiKey: process.env.OPENAI_API_KEY, maxRetries: 0, timeout: 180000 });
      const payload: Record<string, unknown> = {
        model: request.model,
        store: false,
        truncation: "disabled",
        service_tier: "default",
        max_output_tokens: request.maxTokens ?? 2048,
        input: [
          { role: "system", content: request.system },
          { role: "user", content: request.user }
        ]
      };
      const reasoningModel = /^gpt-(5|6)([.-]|$)/.test(request.model);
      if (reasoningModel) payload.reasoning = { effort: request.reasoningEffort ?? "low" };
      else if (request.temperature !== undefined) payload.temperature = request.temperature;
      if (request.maxTokens !== undefined) payload.max_output_tokens = request.maxTokens;

      const response = await client.responses.create(payload as never);
      if (response.status !== "completed") {
        throw new Error(`Model response ${response.status}; no move applied. Token usage may still be billed.`);
      }
      return {
        text: extractOutputText(response).trim(),
        usage: extractUsage(response)
      };
    }
  };
}

function extractUsage(response: unknown): PromptCompletionResult["usage"] {
  const usage = (response as { usage?: unknown }).usage;
  if (!usage || typeof usage !== "object") return undefined;
  const record = usage as Record<string, unknown>;
  const inputTokens = readNumber(record.input_tokens) ?? readNumber(record.prompt_tokens);
  const outputTokens = readNumber(record.output_tokens) ?? readNumber(record.completion_tokens);
  const totalTokens = readNumber(record.total_tokens);
  return { inputTokens, outputTokens, totalTokens };
}

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function extractOutputText(response: unknown): string {
  const direct = (response as { output_text?: unknown }).output_text;
  if (typeof direct === "string") return direct;

  const output = (response as { output?: unknown }).output;
  if (!Array.isArray(output)) return "";

  const parts: string[] = [];
  for (const item of output) {
    if (!item || typeof item !== "object") continue;
    const content = (item as { content?: unknown }).content;
    if (!Array.isArray(content)) continue;
    for (const chunk of content) {
      if (!chunk || typeof chunk !== "object") continue;
      const text = (chunk as { text?: unknown }).text;
      if (typeof text === "string") parts.push(text);
    }
  }
  return parts.join("\n");
}
