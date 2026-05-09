import OpenAI from 'openai';

export function createOpenAIClientFromEnv(env = process.env) {
  const apiKey = String(env.OPENAI_API_KEY || '').trim();
  if (!apiKey) return null;
  return new OpenAI({
    apiKey,
    baseURL: String(env.OPENAI_BASE_URL || 'https://api.openai.com/v1').trim(),
  });
}
