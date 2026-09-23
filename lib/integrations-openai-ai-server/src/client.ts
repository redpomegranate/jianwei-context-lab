import OpenAI from "openai";

export function chatModel(): string {
  return process.env.DEEPSEEK_MODEL?.trim() || "deepseek-flash";
}

function baseURL(): string {
  return process.env.DEEPSEEK_BASE_URL?.trim() || "https://api.deepseek.com";
}

export interface ModelUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export async function createCandidateCompletion(
  system: string,
  user: string,
  options: { apiKey?: string; baseUrl?: string; model?: string } = {},
): Promise<{ content: string; usage: ModelUsage | null }> {
  const apiKey = options.apiKey?.trim() || process.env.DEEPSEEK_API_KEY?.trim();
  if (!apiKey) throw new Error("DEEPSEEK_API_KEY 未配置");
  const completion = await new OpenAI({
    apiKey,
    baseURL: options.baseUrl?.trim() || baseURL(),
    maxRetries: 0,
    timeout: 70_000,
  }).chat.completions.create({
    model: options.model?.trim() || chatModel(),
    max_tokens: 4096,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    response_format: { type: "json_object" },
    reasoning_effort: "none",
  } as OpenAI.Chat.ChatCompletionCreateParamsNonStreaming);
  const message = completion.choices[0]?.message as
    | (OpenAI.Chat.ChatCompletionMessage & { reasoning_content?: string | null })
    | undefined;
  const content = message?.content?.trim() || message?.reasoning_content?.trim();
  if (!content) throw new Error("empty_model_output");
  const promptTokens = completion.usage?.prompt_tokens ?? 0;
  const completionTokens = completion.usage?.completion_tokens ?? 0;
  const totalTokens = completion.usage?.total_tokens ?? promptTokens + completionTokens;
  return {
    content,
    usage: completion.usage
      ? { promptTokens, completionTokens, totalTokens }
      : null,
  };
}
