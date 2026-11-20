/** Published language-model counts from each linked model card. Active counts are per token. */
export const modelCatalog = {
  "Clef Flash": { repository: "Cloudflare/clef-flash", total: "9.4B", active: null },
  "Qwen2.5-1.5B-Instruct": { repository: "Qwen/Qwen2.5-1.5B-Instruct", total: "1.5B", active: null },
  "Mistral Small 4": { repository: "mistralai/Mistral-Small-4-119B-2603", total: "119B", active: "6.5B" },
  "DeepSeek-V4-Flash": { repository: "deepseek-ai/DeepSeek-V4-Flash", total: "284B", active: "13B" },
  "GLM-5": { repository: "zai-org/GLM-5", total: "744B", active: "40B" },
  "Kimi K2.6": { repository: "moonshotai/Kimi-K2.6", total: "1T", active: "32B" },
  "DeepSeek-V4-Pro": { repository: "deepseek-ai/DeepSeek-V4-Pro", total: "1.6T", active: "49B" },
  "Gemma 4 26B A4B": { repository: "google/gemma-4-26B-A4B-it", total: "25.2B", active: "3.8B" },
  "Qwen3.6-35B-A3B": { repository: "Qwen/Qwen3.6-35B-A3B", total: "35B", active: "3B" },
  "Qwen3.8-2.4T-A95B": { repository: "Qwen/Qwen3.8-2.4T-A95B", total: "2.4T", active: "95B" },
} as const;
export type BaseModelName = keyof typeof modelCatalog;
export const baseModelNames = Object.keys(modelCatalog) as BaseModelName[];
export function modelCard(name: string) {
  return Object.hasOwn(modelCatalog, name) ? modelCatalog[name as BaseModelName] : undefined;
}
