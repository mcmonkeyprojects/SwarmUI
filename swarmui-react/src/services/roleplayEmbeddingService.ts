import type { AssistantRequestConfig, AssistantServerMode } from '../types/assistant';

function normalizeUrl(url: string): string {
  return url.replace(/\/+$/, '');
}

function normalizeOpenAIBaseUrl(endpointUrl: string): string {
  const base = normalizeUrl(endpointUrl);
  return base.endsWith('/v1') ? base : `${base}/v1`;
}

function buildAssistantHeaders(config?: AssistantRequestConfig): HeadersInit {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  const apiKey = config?.apiKey?.trim();
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }
  if (config?.provider === 'openrouter') {
    if (config.referer?.trim()) {
      headers['HTTP-Referer'] = config.referer.trim();
    }
    headers['X-OpenRouter-Title'] = config.title?.trim() || 'SwarmUI Roleplay';
  }
  return headers;
}

function getEmbeddingUrl(endpointUrl: string): string {
  return `${normalizeOpenAIBaseUrl(endpointUrl)}/embeddings`;
}

function normalizeEmbedding(value: unknown): number[] | null {
  if (!Array.isArray(value)) {
    return null;
  }
  const embedding = value.filter((entry): entry is number => typeof entry === 'number' && Number.isFinite(entry));
  return embedding.length > 0 ? embedding : null;
}

export async function embedRoleplayTexts(input: {
  endpointUrl: string;
  serverMode: AssistantServerMode | null;
  modelId: string;
  texts: string[];
  requestConfig?: AssistantRequestConfig;
  signal?: AbortSignal;
}): Promise<number[][]> {
  const texts = input.texts.map((text) => text.trim()).filter(Boolean);
  if (!input.modelId.trim() || texts.length === 0) {
    return [];
  }

  const response = await fetch(getEmbeddingUrl(input.endpointUrl), {
    method: 'POST',
    headers: buildAssistantHeaders(input.requestConfig),
    body: JSON.stringify({
      model: input.modelId,
      input: texts,
    }),
    signal: input.signal,
  });
  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(`Embedding request failed (${response.status}): ${errorText || response.statusText}`);
  }

  const data = (await response.json()) as {
    data?: Array<{ index?: number; embedding?: unknown }>;
  };
  const rows = Array.isArray(data.data) ? data.data : [];
  const embeddingsByIndex = new Map<number, number[]>();
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const embedding = normalizeEmbedding(row.embedding);
    if (!embedding) {
      continue;
    }
    embeddingsByIndex.set(row.index ?? index, embedding);
  }
  return texts.map((_, index) => embeddingsByIndex.get(index) ?? []);
}
