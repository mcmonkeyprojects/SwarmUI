import type {
  RoleplayCharacter,
  RoleplayChatSession,
  RoleplayKnowledgeChunk,
  RoleplayKnowledgeDocument,
  RoleplayKnowledgeScope,
  RoleplayPersona,
  RoleplayRetrievedKnowledgeChunk,
} from '../../types/roleplay';

const DEFAULT_CHUNK_TOKEN_TARGET = 220;
const DEFAULT_CHUNK_OVERLAP_TOKENS = 40;

function estimateTokens(text: string): number {
  return Math.ceil(text.trim().length / 4);
}

function normalizeSearchText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9_\s'-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenizeSearchText(text: string): string[] {
  const stopWords = new Set([
    'the',
    'and',
    'for',
    'that',
    'with',
    'this',
    'from',
    'they',
    'you',
    'your',
    'are',
    'was',
    'were',
    'have',
    'has',
    'but',
    'not',
    'she',
    'him',
    'her',
    'his',
    'its',
    'into',
    'then',
    'than',
    'what',
    'when',
    'where',
    'how',
  ]);
  return normalizeSearchText(text)
    .split(' ')
    .map((token) => token.trim())
    .filter((token) => token.length >= 3 && !stopWords.has(token));
}

function splitParagraphs(content: string): string[] {
  return content
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter((part) => part);
}

function chunkLongText(content: string, tokenTarget: number): string[] {
  const words = content.split(/\s+/).filter(Boolean);
  const wordTarget = Math.max(80, Math.floor(tokenTarget * 0.75));
  const overlapWords = Math.max(0, Math.floor(DEFAULT_CHUNK_OVERLAP_TOKENS * 0.75));
  const chunks: string[] = [];
  for (let index = 0; index < words.length; index += Math.max(1, wordTarget - overlapWords)) {
    chunks.push(words.slice(index, index + wordTarget).join(' '));
  }
  return chunks;
}

export function chunkRoleplayKnowledgeDocument(input: {
  documentId: string;
  title: string;
  content: string;
  tokenTarget?: number;
}): RoleplayKnowledgeChunk[] {
  const tokenTarget = input.tokenTarget ?? DEFAULT_CHUNK_TOKEN_TARGET;
  const now = Date.now();
  const paragraphChunks: string[] = [];
  let pending = '';
  for (const paragraph of splitParagraphs(input.content)) {
    const candidate = [pending, paragraph].filter(Boolean).join('\n\n');
    if (estimateTokens(candidate) <= tokenTarget || !pending) {
      pending = candidate;
      continue;
    }
    paragraphChunks.push(pending);
    pending = paragraph;
  }
  if (pending) {
    paragraphChunks.push(pending);
  }

  const normalizedChunks = paragraphChunks.flatMap((chunk) =>
    estimateTokens(chunk) > tokenTarget * 1.6 ? chunkLongText(chunk, tokenTarget) : [chunk]
  );

  return normalizedChunks.map((content, index) => ({
    id: `${input.documentId}-chunk-${index + 1}`,
    documentId: input.documentId,
    index,
    title: `${input.title} #${index + 1}`,
    content,
    tokenEstimate: estimateTokens(content),
    embedding: null,
    embeddingModel: null,
    updatedAt: now,
  }));
}

function isDocumentInScope(
  document: RoleplayKnowledgeDocument,
  options: {
    character: RoleplayCharacter;
    session: RoleplayChatSession;
    persona?: RoleplayPersona | null;
  }
): boolean {
  if (!document.enabled) {
    return false;
  }
  if (document.scope === 'global') {
    return true;
  }
  if (document.scope === 'character') {
    return document.characterId === options.character.id;
  }
  if (document.scope === 'persona') {
    return Boolean(options.persona?.id && document.personaId === options.persona.id);
  }
  return document.sessionId === options.session.id;
}

function scopeBoost(scope: RoleplayKnowledgeScope): number {
  if (scope === 'session') {
    return 0.2;
  }
  if (scope === 'character') {
    return 0.14;
  }
  if (scope === 'persona') {
    return 0.1;
  }
  return 0;
}

function scoreChunk(queryTokens: string[], document: RoleplayKnowledgeDocument, chunk: RoleplayKnowledgeChunk): number {
  if (queryTokens.length === 0) {
    return 0;
  }
  const chunkTokens = new Set(tokenizeSearchText(`${document.title} ${document.description} ${chunk.content}`));
  let matches = 0;
  for (const token of queryTokens) {
    if (chunkTokens.has(token)) {
      matches += 1;
    }
  }
  return matches / Math.max(4, queryTokens.length) + scopeBoost(document.scope);
}

function cosineSimilarity(left: number[] | null | undefined, right: number[] | null | undefined): number | null {
  if (!left?.length || !right?.length || left.length !== right.length) {
    return null;
  }
  let dot = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;
  for (let index = 0; index < left.length; index += 1) {
    dot += left[index] * right[index];
    leftMagnitude += left[index] * left[index];
    rightMagnitude += right[index] * right[index];
  }
  if (leftMagnitude <= 0 || rightMagnitude <= 0) {
    return null;
  }
  return dot / (Math.sqrt(leftMagnitude) * Math.sqrt(rightMagnitude));
}

export function retrieveRoleplayKnowledge(options: {
  character: RoleplayCharacter;
  session: RoleplayChatSession;
  persona?: RoleplayPersona | null;
  documents: RoleplayKnowledgeDocument[];
  queryText: string;
  queryEmbedding?: number[] | null;
  embeddingModel?: string | null;
  maxChunks: number;
  maxTokens: number;
}): RoleplayRetrievedKnowledgeChunk[] {
  const queryTokens = tokenizeSearchText([
    options.character.name,
    options.character.description,
    options.persona?.name ?? '',
    options.persona?.description ?? '',
    options.queryText,
  ].join('\n'));
  const candidates: RoleplayRetrievedKnowledgeChunk[] = [];

  for (const document of options.documents) {
    if (!isDocumentInScope(document, options)) {
      continue;
    }
    for (const chunk of document.chunks) {
      const vectorScore =
        chunk.embeddingModel &&
        options.embeddingModel &&
        chunk.embeddingModel === options.embeddingModel
          ? cosineSimilarity(options.queryEmbedding, chunk.embedding)
          : null;
      const lexicalScore = scoreChunk(queryTokens, document, chunk);
      const score = vectorScore === null ? lexicalScore : vectorScore + scopeBoost(document.scope);
      if (score <= 0) {
        continue;
      }
      candidates.push({
        documentId: document.id,
        documentTitle: document.title,
        chunkId: chunk.id,
        chunkTitle: chunk.title,
        scope: document.scope,
        score,
        reason:
          vectorScore === null
            ? `Lexical match (${document.scope})`
            : `Vector match (${document.scope}, cosine ${vectorScore.toFixed(2)})`,
        retrievalMode: vectorScore === null ? 'lexical' : 'vector',
        content: chunk.content,
        tokenEstimate: chunk.tokenEstimate,
      });
    }
  }

  const results: RoleplayRetrievedKnowledgeChunk[] = [];
  let remainingTokens = Math.max(0, options.maxTokens);
  for (const candidate of candidates.sort((left, right) => right.score - left.score)) {
    if (results.length >= options.maxChunks || remainingTokens <= 0) {
      break;
    }
    if (candidate.tokenEstimate > remainingTokens && results.length > 0) {
      continue;
    }
    results.push(candidate);
    remainingTokens -= candidate.tokenEstimate;
  }
  return results;
}

export function buildRetrievedKnowledgeBlock(entries: RoleplayRetrievedKnowledgeChunk[]): string {
  return entries
    .map((entry, index) =>
      [
        `[${index + 1}] ${entry.documentTitle} / ${entry.chunkTitle}`,
        `Scope: ${entry.scope}; ${entry.reason}; score ${entry.score.toFixed(2)}; mode ${entry.retrievalMode}`,
        entry.content,
      ].join('\n')
    )
    .join('\n\n');
}
