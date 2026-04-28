import {
  DEFAULT_ROLEPLAY_INTERACTION_STYLE,
  getRoleplayInteractionStyleConfig,
} from '../../data/roleplayInteractionStyles';
import type {
  RoleplayCharacter,
  RoleplayLorebook,
  RoleplayLorebookEntry,
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
    mode: entry.constant ? 'always-on' : 'keyword',
    keywordMode: entry.use_regex ? 'regex' : 'plain',
    activationLogic: 'any',
    selective: entry.selective ?? false,
    caseSensitive: entry.case_sensitive ?? false,
    scanDepth: typeof entry.depth === 'number' ? entry.depth : 4,
    insertionOrder: typeof entry.insertion_order === 'number' ? entry.insertion_order : 100 + index,
    insertionPosition: position,
    tokenBudget: 220,
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

  const character: RoleplayCharacter = {
    id: crypto.randomUUID(),
    name,
    favorite: false,
    creator: normalizeString(data.creator),
    characterVersion: normalizeString(data.character_version),
    sourceFormat,
    sourceUrl: '',
    catalogTemplateId: null,
    catalogCategory: null,
    cardExtensions: data.extensions ?? null,
    avatar: null,
    interactionStyle: DEFAULT_ROLEPLAY_INTERACTION_STYLE,
    appearancePrompt: normalizeString(data.description),
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
    creatorNotes: [normalizeString(data.creator_notes), normalizeString(data.post_history_instructions)]
      .filter(Boolean)
      .join('\n\n'),
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
      depth: entry.scanDepth,
    }))
  );

  return {
    spec: 'chara_card_v2',
    spec_version: '2.0',
    data: {
      name: character.name,
      description: character.description,
      personality: character.personality,
      scenario: character.scenario,
      first_mes: character.openingRoleplayMessage || character.openingChatMessage,
      mes_example: character.exampleMessages,
      alternate_greetings: character.alternateGreetings,
      system_prompt: character.roleplaySystemPrompt || character.chatSystemPrompt || character.systemPrompt,
      post_history_instructions: character.creatorNotes,
      creator_notes: character.creatorNotes,
      tags: character.tags,
      creator: character.creator,
      character_version: character.characterVersion,
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
    const chunks = parsePngTextChunks(await file.arrayBuffer());
    const rawChara = chunks.get('chara');
    if (!rawChara) {
      throw new Error('PNG does not contain a readable chara metadata chunk.');
    }
    const parsed = decodeBase64Json(rawChara) as TavernCardJson;
    return importTavernCardJson(parsed);
  }

  const raw = await file.text();
  return importTavernCardJson(JSON.parse(raw) as TavernCardJson);
}
