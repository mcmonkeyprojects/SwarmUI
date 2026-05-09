import {
  DEFAULT_ROLEPLAY_INTERACTION_STYLE,
  getRoleplayInteractionStyleConfig,
} from '../../data/roleplayInteractionStyles';
import type {
  RoleplayCharacter,
  RoleplayLorebook,
  RoleplayLorebookEntry,
  RoleplayPromptBlockRole,
} from '../../types/roleplay';
import { createEmptyRoleplayMemoryState } from './roleplayMemory';
import {
  createEmptyRoleplayPersonalityProfile,
  normalizeRoleplayPersonalityProfile,
} from './roleplayCharacterPrompting';

interface TavernCharacterBookEntry {
  keys?: string[];
  secondary_keys?: string[];
  comment?: string;
  content?: string;
  enabled?: boolean;
  constant?: boolean;
  selective?: boolean;
  case_sensitive?: boolean;
  use_regex?: boolean;
  insertion_order?: number;
  position?: string | number;
  depth?: number;
  extensions?: Record<string, unknown>;
}

interface TavernCharacterBook {
  name?: string;
  description?: string;
  entries?: TavernCharacterBookEntry[];
}

interface TavernV2Data {
  name?: string;
  description?: string;
  personality?: string;
  scenario?: string;
  first_mes?: string;
  mes_example?: string;
  alternate_greetings?: string[];
  system_prompt?: string;
  post_history_instructions?: string;
  creator_notes?: string;
  tags?: string[];
  creator?: string;
  character_version?: string;
  character_book?: TavernCharacterBook;
  extensions?: Record<string, unknown>;
  creator_notes_multilingual?: Record<string, unknown>;
  nickname?: string;
  creator_notes_html?: string;
  group_only_greetings?: string[];
  character_note?: string;
  character_note_role?: string;
  character_note_depth?: number;
}

interface TavernCardJson {
  spec?: string;
  spec_version?: string;
  data?: TavernV2Data;
  name?: string;
  description?: string;
  personality?: string;
  scenario?: string;
  first_mes?: string;
  mes_example?: string;
  alternate_greetings?: string[];
  system_prompt?: string;
  post_history_instructions?: string;
  creator_notes?: string;
  tags?: string[];
  creator?: string;
  character_version?: string;
  character_book?: TavernCharacterBook;
  extensions?: Record<string, unknown>;
}

export interface TavernImportResult {
  character: RoleplayCharacter;
  lorebooks: RoleplayLorebook[];
}

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function normalizeStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : [];
}

function normalizeRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function normalizeCharacterNoteRole(value: unknown): RoleplayPromptBlockRole {
  return value === 'user' || value === 'assistant' || value === 'system' ? value : 'system';
}

function createLoreEntry(entry: TavernCharacterBookEntry, index: number): RoleplayLorebookEntry {
  const now = Date.now();
  const position = entry.position === 'after_char' || entry.position === 1
    ? 'before-history'
    : 'before-history';
  return {
    id: crypto.randomUUID(),
    title: normalizeString(entry.comment) || `Entry ${index + 1}`,
    content: normalizeString(entry.content),
    keywords: normalizeStringArray(entry.keys),
    secondaryKeywords: normalizeStringArray(entry.secondary_keys),
    negativeKeywords: [],
    mode: entry.constant ? 'always-on' : 'keyword',
    keywordMode: entry.use_regex ? 'regex' : 'plain',
    activationLogic: 'any',
    selective: entry.selective ?? false,
    caseSensitive: entry.case_sensitive ?? false,
    scanDepth: typeof entry.depth === 'number' ? entry.depth : 4,
    insertionOrder: typeof entry.insertion_order === 'number' ? entry.insertion_order : 100 + index,
    insertionPosition: position,
    insertionDepth: typeof entry.depth === 'number' ? entry.depth : 4,
    tokenBudget: 220,
    recursive: false,
    enabled: entry.enabled !== false,
    createdAt: now,
    updatedAt: now,
  };
}

function createLorebook(book: TavernCharacterBook | undefined, characterName: string): RoleplayLorebook | null {
  const entries = book?.entries ?? [];
  if (entries.length === 0) {
    return null;
  }

  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    name: normalizeString(book?.name) || `${characterName} Lore`,
    description: normalizeString(book?.description),
    global: false,
    entries: entries.map((entry, index) => createLoreEntry(entry, index)),
    createdAt: now,
    updatedAt: now,
  };
}

function getCardData(card: TavernCardJson): {
  data: TavernV2Data;
  sourceFormat: RoleplayCharacter['sourceFormat'];
} {
  if (card.data) {
    return {
      data: card.data,
      sourceFormat: 'tavern-v2',
    };
  }
  return {
    data: card,
    sourceFormat: 'tavern-v1',
  };
}

export function importTavernCardJson(card: TavernCardJson): TavernImportResult {
  const { data, sourceFormat } = getCardData(card);
  const now = Date.now();
  const name = normalizeString(data.name) || 'Imported Character';
  const config = getRoleplayInteractionStyleConfig(DEFAULT_ROLEPLAY_INTERACTION_STYLE);
  const lorebook = createLorebook(data.character_book, name);
  const personality = normalizeString(data.personality);
  const systemPrompt = normalizeString(data.system_prompt) || config.systemPrompt;
  const postHistoryInstructions = normalizeString(data.post_history_instructions);

  const character: RoleplayCharacter = {
    id: crypto.randomUUID(),
    name,
    favorite: false,
    creator: normalizeString(data.creator),
    characterVersion: normalizeString(data.character_version),
    sourceFormat,
    sourceUrl: '',
    sourceDownloadUrl: '',
    sourceProviderId: '',
    sourceExternalId: '',
    sourceImportedAt: null,
    sourceLastCheckedAt: null,
    sourceLicense: '',
    sourceContentRating: '',
    catalogTemplateId: null,
    catalogCategory: null,
    cardExtensions: data.extensions ?? null,
    tavernV2Data: sourceFormat === 'tavern-v2' ? ({ ...data } as Record<string, unknown>) : null,
    avatar: null,
    headshotUrl: null,
    interactionStyle: DEFAULT_ROLEPLAY_INTERACTION_STYLE,
    appearancePrompt: normalizeString(data.description),
    visualProfile: {
      permanentAnchor: normalizeString(data.description),
      defaultAttire: '',
      styleAnchor: '',
      negativeAnchor: '',
    },
    expressionSprites: [],
    galleryImages: [],
    imageModelId: null,
    personalityProfile: normalizeRoleplayPersonalityProfile({
      ...createEmptyRoleplayPersonalityProfile(),
      coreTraits: personality,
    }),
    personality,
    systemPrompt,
    chatSystemPrompt: systemPrompt,
    roleplaySystemPrompt: systemPrompt,
    openingChatMessage: normalizeString(data.first_mes),
    openingRoleplayMessage: normalizeString(data.first_mes),
    alternateGreetings: normalizeStringArray(data.alternate_greetings),
    sceneSuggestionPrompt: config.sceneSuggestionPrompt,
    description: normalizeString(data.description),
    scenario: normalizeString(data.scenario),
    exampleMessages: normalizeString(data.mes_example),
    tags: normalizeStringArray(data.tags),
    creatorNotes: normalizeString(data.creator_notes),
    postHistoryInstructions,
    characterNote: normalizeString(data.character_note),
    characterNoteRole: normalizeCharacterNoteRole(data.character_note_role),
    characterNoteDepth:
      typeof data.character_note_depth === 'number' ? data.character_note_depth : null,
    boundLorebookIds: lorebook ? [lorebook.id] : [],
    characterLora: null,
    characterLoraWeight: 0.8,
    ipAdapterEnabled: false,
    ipAdapterModel: 'faceid plus v2',
    ipAdapterWeight: 1.0,
    ...createEmptyRoleplayMemoryState(),
    createdAt: now,
    updatedAt: now,
  };

  return {
    character,
    lorebooks: lorebook ? [lorebook] : [],
  };
}

export function exportTavernV2Json(character: RoleplayCharacter, lorebooks: RoleplayLorebook[] = []): TavernCardJson {
  const boundLorebooks = lorebooks.filter((lorebook) =>
    character.boundLorebookIds.includes(lorebook.id)
  );
  const entries = boundLorebooks.flatMap((lorebook) =>
    lorebook.entries.map((entry) => ({
      keys: entry.keywords,
      secondary_keys: entry.secondaryKeywords,
      comment: entry.title,
      content: entry.content,
      enabled: entry.enabled,
      constant: entry.mode === 'always-on',
      selective: entry.selective,
      case_sensitive: entry.caseSensitive,
      use_regex: entry.keywordMode === 'regex',
      insertion_order: entry.insertionOrder,
      position:
        entry.insertionPosition === 'after-history'
          ? 'after_char'
          : entry.insertionPosition === 'in-history'
            ? 'at_depth'
            : 'before_char',
      depth: entry.scanDepth,
    }))
  );
  const preservedData = normalizeRecord(character.tavernV2Data) ?? {};

  return {
    spec: 'chara_card_v2',
    spec_version: '2.0',
    data: {
      ...preservedData,
      name: character.name,
      description: character.description,
      personality: character.personality,
      scenario: character.scenario,
      first_mes: character.openingRoleplayMessage || character.openingChatMessage,
      mes_example: character.exampleMessages,
      alternate_greetings: character.alternateGreetings,
      system_prompt: character.roleplaySystemPrompt || character.chatSystemPrompt || character.systemPrompt,
      post_history_instructions: character.postHistoryInstructions,
      creator_notes: character.creatorNotes,
      tags: character.tags,
      creator: character.creator,
      character_version: character.characterVersion,
      character_note: character.characterNote || undefined,
      character_note_role: character.characterNoteRole,
      character_note_depth:
        typeof character.characterNoteDepth === 'number' ? character.characterNoteDepth : undefined,
      extensions: character.cardExtensions ?? undefined,
      character_book:
        entries.length > 0
          ? {
              name: `${character.name} Lore`,
              description: boundLorebooks.map((lorebook) => lorebook.description).filter(Boolean).join('\n'),
              entries,
            }
          : undefined,
    },
  };
}

export function downloadTavernV2Json(character: RoleplayCharacter, lorebooks: RoleplayLorebook[] = []): void {
  const json = JSON.stringify(exportTavernV2Json(character, lorebooks), null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${character.name.replace(/\s+/g, '_').toLowerCase()}_tavern_v2.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function encodeBase64Utf8(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.slice(index, index + 0x8000));
  }
  return btoa(binary);
}

function decodeBase64Bytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

let crc32Table: Uint32Array | null = null;

function getCrc32Table(): Uint32Array {
  if (crc32Table) {
    return crc32Table;
  }
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  crc32Table = table;
  return table;
}

function crc32(bytes: Uint8Array): number {
  const table = getCrc32Table();
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function writeUint32(value: number): Uint8Array {
  const bytes = new Uint8Array(4);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, value);
  return bytes;
}

function joinBytes(parts: Uint8Array[]): Uint8Array {
  const totalLength = parts.reduce((sum, part) => sum + part.length, 0);
  const output = new Uint8Array(totalLength);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}

function createPngChunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = new TextEncoder().encode(type);
  const crcInput = joinBytes([typeBytes, data]);
  return joinBytes([
    writeUint32(data.length),
    typeBytes,
    data,
    writeUint32(crc32(crcInput)),
  ]);
}

function createPngTextChunk(keyword: string, value: string): Uint8Array {
  const keywordBytes = new TextEncoder().encode(keyword);
  const valueBytes = new TextEncoder().encode(value);
  return createPngChunk('tEXt', joinBytes([keywordBytes, new Uint8Array([0]), valueBytes]));
}

function insertTextChunkBeforeIend(pngBytes: Uint8Array, keyword: string, value: string): Uint8Array {
  for (let index = 0; index < PNG_SIGNATURE.length; index += 1) {
    if (pngBytes[index] !== PNG_SIGNATURE[index]) {
      throw new Error('Avatar image could not be converted to PNG.');
    }
  }

  const view = new DataView(pngBytes.buffer, pngBytes.byteOffset, pngBytes.byteLength);
  let offset = PNG_SIGNATURE.length;
  while (offset + 12 <= pngBytes.length) {
    const length = view.getUint32(offset);
    const type = String.fromCharCode(
      pngBytes[offset + 4],
      pngBytes[offset + 5],
      pngBytes[offset + 6],
      pngBytes[offset + 7]
    );
    if (type === 'IEND') {
      const textChunk = createPngTextChunk(keyword, value);
      return joinBytes([pngBytes.slice(0, offset), textChunk, pngBytes.slice(offset)]);
    }
    offset += 12 + length;
  }

  throw new Error('PNG image is missing an IEND chunk.');
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Could not load avatar image.'));
    image.src = src;
  });
}

function canvasToPngBytes(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('Could not render PNG avatar.'));
        return;
      }
      blob.arrayBuffer().then((buffer) => resolve(new Uint8Array(buffer))).catch(reject);
    }, 'image/png');
  });
}

function renderFallbackAvatar(character: RoleplayCharacter): Promise<Uint8Array> {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 768;
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Canvas is not available for PNG export.');
  }
  context.fillStyle = '#15161b';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#2f6fed';
  context.fillRect(0, canvas.height - 180, canvas.width, 180);
  context.fillStyle = '#ffffff';
  context.font = '700 96px sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(character.name.trim().slice(0, 2).toUpperCase() || 'RP', 256, 330);
  context.font = '500 38px sans-serif';
  context.fillText(character.name.trim() || 'Character', 256, 640);
  return canvasToPngBytes(canvas);
}

async function getAvatarPngBytes(character: RoleplayCharacter): Promise<Uint8Array> {
  if (!character.avatar) {
    return renderFallbackAvatar(character);
  }

  if (character.avatar.startsWith('data:image/png;base64,')) {
    return decodeBase64Bytes(character.avatar.split(',')[1] ?? '');
  }

  try {
    const image = await loadImage(character.avatar);
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth || 512;
    canvas.height = image.naturalHeight || 768;
    const context = canvas.getContext('2d');
    if (!context) {
      return renderFallbackAvatar(character);
    }
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return await canvasToPngBytes(canvas);
  } catch {
    return renderFallbackAvatar(character);
  }
}

export async function downloadTavernV2Png(
  character: RoleplayCharacter,
  lorebooks: RoleplayLorebook[] = []
): Promise<void> {
  const json = JSON.stringify(exportTavernV2Json(character, lorebooks));
  const chara = encodeBase64Utf8(json);
  const avatarPng = await getAvatarPngBytes(character);
  const pngWithMetadata = insertTextChunkBeforeIend(avatarPng, 'chara', chara);
  const pngBuffer = new ArrayBuffer(pngWithMetadata.byteLength);
  new Uint8Array(pngBuffer).set(pngWithMetadata);
  const blob = new Blob([pngBuffer], { type: 'image/png' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${character.name.replace(/\s+/g, '_').toLowerCase()}_tavern_v2.png`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function decodeBase64Json(value: string): unknown {
  const decoded = atob(value.trim());
  const bytes = new Uint8Array(decoded.length);
  for (let index = 0; index < decoded.length; index += 1) {
    bytes[index] = decoded.charCodeAt(index);
  }
  return JSON.parse(new TextDecoder().decode(bytes));
}

function parsePngTextChunks(arrayBuffer: ArrayBuffer): Map<string, string> {
  const dataView = new DataView(arrayBuffer);
  const bytes = new Uint8Array(arrayBuffer);
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  for (let index = 0; index < signature.length; index += 1) {
    if (bytes[index] !== signature[index]) {
      throw new Error('Not a PNG file.');
    }
  }

  const decoder = new TextDecoder();
  const chunks = new Map<string, string>();
  let offset = 8;
  while (offset + 8 <= bytes.length) {
    const length = dataView.getUint32(offset);
    const type = decoder.decode(bytes.slice(offset + 4, offset + 8));
    const chunkStart = offset + 8;
    const chunkEnd = chunkStart + length;
    if (chunkEnd > bytes.length) {
      break;
    }

    if (type === 'tEXt') {
      const chunk = bytes.slice(chunkStart, chunkEnd);
      const separatorIndex = chunk.indexOf(0);
      if (separatorIndex > 0) {
        const key = decoder.decode(chunk.slice(0, separatorIndex));
        const value = decoder.decode(chunk.slice(separatorIndex + 1));
        chunks.set(key, value);
      }
    } else if (type === 'iTXt') {
      const chunk = bytes.slice(chunkStart, chunkEnd);
      const separatorIndex = chunk.indexOf(0);
      if (separatorIndex > 0) {
        const key = decoder.decode(chunk.slice(0, separatorIndex));
        const value = decoder.decode(chunk.slice(separatorIndex + 5));
        chunks.set(key, value);
      }
    }

    offset = chunkEnd + 4;
  }
  return chunks;
}

export async function parseTavernCardFile(file: File): Promise<TavernImportResult> {
  if (file.type === 'image/png' || file.name.toLowerCase().endsWith('.png')) {
    let chunks: Map<string, string>;
    try {
      chunks = parsePngTextChunks(await file.arrayBuffer());
    } catch (error) {
      if (error instanceof Error && error.message === 'Not a PNG file.') {
        throw new Error('The selected PNG file is not a valid Tavern card image.');
      }
      throw error;
    }
    const rawChara = chunks.get('chara');
    if (!rawChara) {
      throw new Error('PNG does not contain a readable Tavern chara metadata chunk.');
    }
    let parsed: TavernCardJson;
    try {
      parsed = decodeBase64Json(rawChara) as TavernCardJson;
    } catch {
      throw new Error('PNG contains Tavern metadata, but it could not be decoded.');
    }
    const result = importTavernCardJson(parsed);
    const imageUrl = await fileToDataUrl(file);
    result.character.avatar = imageUrl;
    result.character.galleryImages = [
      {
        id: crypto.randomUUID(),
        imageUrl,
        source: 'import',
        prompt: result.character.description || result.character.appearancePrompt || '',
        sessionId: null,
        messageId: null,
        createdAt: Date.now(),
      },
      ...result.character.galleryImages,
    ];
    return result;
  }

  try {
    const raw = await file.text();
    return importTavernCardJson(JSON.parse(raw) as TavernCardJson);
  } catch {
    throw new Error('JSON import failed because the file is not valid Tavern card JSON.');
  }
}
