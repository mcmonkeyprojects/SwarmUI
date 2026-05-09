import type {
  ActivatedRoleplayLoreEntry,
  ChatMessage,
  CompiledRoleplayPrompt,
  CompiledRoleplayPromptSegment,
  RoleplayApiMessageTrace,
  RoleplayContextBudgetReport,
  RoleplayGenerationMode,
  RoleplayHistoryBudgetTrace,
  RoleplayKnowledgeDocument,
  RoleplayLoreActivationDebugEntry,
  RoleplayCharacter,
  RoleplayChatSession,
  RoleplayLorebookEntry,
  RoleplayLorebook,
  RoleplayPersona,
  RoleplayPromptBlock,
  RoleplayPromptBlockTrace,
  RoleplayPromptBlockPosition,
  RoleplayPromptBlockRole,
  RoleplayPromptBudgetMode,
  RoleplayScriptVariable,
} from '../../types/roleplay';
import {
  buildCharacterPersonalityBlock,
  getEffectiveSystemPrompt,
} from './roleplayCharacterPrompting';
import { getRoleplayPresetStack } from '../../data/roleplayPresetStacks';
import { getMessageContent } from './roleplayMessageUtils';
import {
  buildRetrievedKnowledgeBlock,
  retrieveRoleplayKnowledge,
} from './roleplayKnowledgeRetrieval';

type HistoryMessage = { role: 'user' | 'assistant'; content: string };
type ApiMessage = { role: 'system' | 'user' | 'assistant'; content: string };
type BudgetedHistoryResult = {
  messages: HistoryMessage[];
  contextBudget: RoleplayContextBudgetReport;
  historyBudgetTrace: RoleplayHistoryBudgetTrace[];
};

const DEFAULT_CONTEXT_TOKEN_BUDGET = 8192;
const DEFAULT_RESERVED_RESPONSE_TOKENS = 768;
const COMPACT_LORE_TOKEN_BUDGET = 180;
const MICRO_LORE_TOKEN_BUDGET = 120;

const ALL_GENERATION_MODES: RoleplayGenerationMode[] = [
  'normal',
  'swipe',
  'regenerate',
  'continue',
  'impersonate',
  'quiet',
];

function budgetPromptContent(content: string, tokenBudget: number | null): string {
  const trimmed = content.trim();
  if (!trimmed || !tokenBudget || tokenBudget <= 0) {
    return trimmed;
  }
  const characterBudget = tokenBudget * 4;
  if (trimmed.length <= characterBudget) {
    return trimmed;
  }
  return `${trimmed.slice(0, Math.max(0, characterBudget - 3)).trimEnd()}...`;
}

function getBudgetedPromptBlockTokenLimit(
  source: RoleplayPromptBlock['source'],
  id: string,
  tokenBudget: number | null | undefined,
  budgetMode: RoleplayPromptBudgetMode
): number | null {
  if (tokenBudget !== undefined && tokenBudget !== null) {
    return tokenBudget;
  }
  if (budgetMode === 'full') {
    return null;
  }
  const compactBudgets: Record<string, number> = {
    'main-prompt': 420,
    persona: 180,
    character: 360,
    personality: 260,
    'creator-notes': 180,
    'character-note': 160,
    'group-roster': 260,
    scenario: 260,
    'stage-direction': 160,
    examples: 220,
    memory: 320,
    retrieval: 360,
    'author-note': 160,
    'post-history-note': 160,
  };
  const microBudgets: Record<string, number> = {
    'main-prompt': 280,
    persona: 120,
    character: 220,
    personality: 180,
    'creator-notes': 120,
    'character-note': 100,
    'group-roster': 160,
    scenario: 180,
    'stage-direction': 100,
    examples: 120,
    memory: 220,
    retrieval: 240,
    'author-note': 100,
    'post-history-note': 100,
  };
  if (source === 'preset') {
    return budgetMode === 'micro' ? 120 : 180;
  }
  if (source === 'retrieval') {
    return budgetMode === 'micro' ? 240 : 360;
  }
  if (source === 'lore') {
    return budgetMode === 'micro' ? MICRO_LORE_TOKEN_BUDGET : COMPACT_LORE_TOKEN_BUDGET;
  }
  return budgetMode === 'micro' ? (microBudgets[id] ?? 120) : (compactBudgets[id] ?? 180);
}

function trimContentToTokenBudget(content: string, tokenBudget: number): string {
  if (tokenBudget <= 0) {
    return '';
  }

  const characterBudget = Math.max(0, tokenBudget * 4 - 3);
  if (content.length <= characterBudget + 3) {
    return content.trim();
  }
  return `${content.slice(0, characterBudget).trimEnd()}...`;
}

function appendPromptBlock(
  blocks: RoleplayPromptBlock[],
  options: {
    id: string;
    label: string;
    content: string | null | undefined;
    order: number;
    role?: RoleplayPromptBlockRole;
    position?: RoleplayPromptBlockPosition;
    depth?: number | null;
    triggerModes?: RoleplayGenerationMode[];
    tokenBudget?: number | null;
    budgetMode?: RoleplayPromptBudgetMode;
    source: RoleplayPromptBlock['source'];
  }
) {
  const normalizedContent = options.content?.trim();
  if (!normalizedContent) {
    return;
  }

  const contentWithinBudget = budgetPromptContent(
    normalizedContent,
    getBudgetedPromptBlockTokenLimit(
      options.source,
      options.id,
      options.tokenBudget,
      options.budgetMode ?? 'full'
    )
  );
  blocks.push({
    id: options.id,
    label: options.label,
    role: options.role ?? 'system',
    content: contentWithinBudget,
    enabled: true,
    order: options.order,
    position: options.position ?? 'before-history',
    depth: options.depth ?? null,
    triggerModes: options.triggerModes ?? ALL_GENERATION_MODES,
    tokenBudget: options.tokenBudget ?? null,
    tokenEstimate: estimateTokens([contentWithinBudget]),
    source: options.source,
  });
}

function appendPresetPromptBlock(
  blocks: RoleplayPromptBlock[],
  options: {
    id: string;
    label: string;
    content: string | null | undefined;
    enabled?: boolean;
    order: number;
    role?: RoleplayPromptBlockRole;
    position?: RoleplayPromptBlockPosition;
    depth?: number | null;
    triggerModes?: RoleplayGenerationMode[];
    tokenBudget?: number | null;
    budgetMode?: RoleplayPromptBudgetMode;
    source: RoleplayPromptBlock['source'];
  }
) {
  const beforeLength = blocks.length;
  appendPromptBlock(blocks, options);
  if (blocks.length > beforeLength) {
    blocks[blocks.length - 1] = {
      ...blocks[blocks.length - 1],
      enabled: options.enabled ?? blocks[blocks.length - 1].enabled,
    };
  }
}

function sortPromptBlocks(blocks: RoleplayPromptBlock[]): RoleplayPromptBlock[] {
  return [...blocks].sort((left, right) => {
    if (left.position !== right.position) {
      if (left.position === 'before-history') {
        return -1;
      }
      if (right.position === 'before-history') {
        return 1;
      }
      if (left.position === 'in-history') {
        return -1;
      }
      if (right.position === 'in-history') {
        return 1;
      }
    }
    if (left.order !== right.order) {
      return left.order - right.order;
    }
    return left.label.localeCompare(right.label);
  });
}

function filterPromptBlocksForMode(
  blocks: RoleplayPromptBlock[],
  generationMode: RoleplayGenerationMode
): RoleplayPromptBlock[] {
  return sortPromptBlocks(
    blocks.filter(
      (block) => block.enabled && block.triggerModes.includes(generationMode) && block.content.trim()
    )
  );
}

function applyPromptBlockSettings(
  blocks: RoleplayPromptBlock[],
  settings: RoleplayChatSession['promptStack']['promptBlockSettings'] | undefined
): RoleplayPromptBlock[] {
  const safeSettings = settings ?? {};
  return blocks.map((block) => {
    const blockSettings = safeSettings[block.id];
    if (!blockSettings) {
      return block;
    }

    const content =
      typeof blockSettings.tokenBudget === 'number'
        ? budgetPromptContent(block.content, blockSettings.tokenBudget)
        : block.content;

    return {
      ...block,
      enabled: blockSettings.enabled ?? block.enabled,
      order: blockSettings.order ?? block.order,
      role: blockSettings.role ?? block.role,
      position: blockSettings.position ?? block.position,
      depth: blockSettings.depth ?? block.depth,
      triggerModes:
        blockSettings.triggerModes && blockSettings.triggerModes.length > 0
          ? blockSettings.triggerModes
          : block.triggerModes,
      tokenBudget:
        blockSettings.tokenBudget !== undefined ? blockSettings.tokenBudget : block.tokenBudget,
      content,
      tokenEstimate: estimateTokens([content]),
    };
  });
}

function promptBlocksToSegments(blocks: RoleplayPromptBlock[]): CompiledRoleplayPromptSegment[] {
  return blocks.map((block) => ({
    key: block.id,
    label: block.label,
    content: block.content,
    role: block.role,
    position: block.position,
    depth: block.depth,
    tokenEstimate: block.tokenEstimate,
  }));
}

function appendPromptBlockMessages(
  apiMessages: RoleplayApiMessageTrace[],
  blocks: RoleplayPromptBlock[]
) {
  let pendingRole: RoleplayPromptBlockRole | null = null;
  let pendingContent: string[] = [];
  let pendingSourceBlockIds: string[] = [];

  const flushPending = () => {
    if (!pendingRole || pendingContent.length === 0) {
      return;
    }
    apiMessages.push({
      role: pendingRole,
      content: pendingContent.join('\n\n'),
      sourceBlockIds: pendingSourceBlockIds,
    });
    pendingRole = null;
    pendingContent = [];
    pendingSourceBlockIds = [];
  };

  for (const block of blocks) {
    if (pendingRole && pendingRole !== block.role) {
      flushPending();
    }
    pendingRole = block.role;
    pendingContent.push(block.content);
    pendingSourceBlockIds.push(block.id);
  }

  flushPending();
}

function insertPromptBlocksIntoHistory(
  historyMessages: HistoryMessage[],
  blocks: RoleplayPromptBlock[]
): RoleplayApiMessageTrace[] {
  const nextMessages: RoleplayApiMessageTrace[] = historyMessages.map((message, index) => ({
    ...message,
    sourceBlockIds: [`history-${index}`],
  }));

  for (const block of sortPromptBlocks(blocks)) {
    const depth = Math.max(0, block.depth ?? 0);
    const insertIndex = Math.max(0, nextMessages.length - depth);
    nextMessages.splice(insertIndex, 0, {
      role: block.role,
      content: block.content,
      sourceBlockIds: [block.id],
    });
  }

  return nextMessages;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isKeywordActive(
  keyword: string,
  sourceText: string,
  options: Pick<RoleplayLorebookEntry, 'keywordMode' | 'caseSensitive'>
): boolean {
  const normalizedKeyword = keyword.trim();
  if (!normalizedKeyword) {
    return false;
  }

  if (options.keywordMode === 'regex') {
    try {
      const flags = options.caseSensitive ? '' : 'i';
      return new RegExp(normalizedKeyword, flags).test(sourceText);
    } catch {
      const escapedKeyword = escapeRegExp(normalizedKeyword);
      const flags = options.caseSensitive ? '' : 'i';
      return new RegExp(escapedKeyword, flags).test(sourceText);
    }
  }

  const haystack = options.caseSensitive ? sourceText : sourceText.toLowerCase();
  const needle = options.caseSensitive ? normalizedKeyword : normalizedKeyword.toLowerCase();
  return haystack.includes(needle);
}

function getMatchedKeywords(
  keywords: string[],
  sourceText: string,
  entry: RoleplayLorebookEntry
): string[] {
  return keywords
    .filter((keyword) => keyword.trim())
    .filter((keyword) => isKeywordActive(keyword, sourceText, entry));
}

function getLoreScanSource(options: {
  character: RoleplayCharacter;
  persona?: RoleplayPersona | null;
  historyMessages: HistoryMessage[];
  scanDepth: number;
}): string {
  const { character, persona, historyMessages, scanDepth } = options;
  const scannedHistory =
    scanDepth > 0 ? historyMessages.slice(-scanDepth) : historyMessages;

  return [
    character.name,
    character.description,
    character.scenario,
    character.creatorNotes,
    persona?.name ?? '',
    persona?.description ?? '',
    persona?.notes ?? '',
    ...scannedHistory.map((message) => message.content),
  ]
    .filter(Boolean)
    .join('\n');
}

function resolveActivatedLoreEntries(options: {
  character: RoleplayCharacter;
  session: RoleplayChatSession;
  persona?: RoleplayPersona | null;
  lorebooks?: RoleplayLorebook[];
  historyMessages: HistoryMessage[];
}): {
  activatedEntries: ActivatedRoleplayLoreEntry[];
  debugEntries: RoleplayLoreActivationDebugEntry[];
} {
  const { character, session, persona, lorebooks = [], historyMessages } = options;
  const boundLorebookIds = new Set([
    ...character.boundLorebookIds,
    ...(persona?.boundLorebookIds ?? []),
    ...session.boundLorebookIds,
  ]);
  const activatedEntries: ActivatedRoleplayLoreEntry[] = [];
  const debugEntries: RoleplayLoreActivationDebugEntry[] = [];
  const activatedEntryIds = new Set<string>();
  let recursiveSource = '';

  for (let pass = 0; pass < 3; pass += 1) {
    let activatedThisPass = false;
    for (const lorebook of lorebooks) {
      const includedLorebook = lorebook.global || boundLorebookIds.has(lorebook.id);
      for (const entry of lorebook.entries) {
        if (activatedEntryIds.has(entry.id)) {
          continue;
        }

        const baseActivationSource = getLoreScanSource({
          character,
          persona,
          historyMessages,
          scanDepth: entry.scanDepth,
        });
        const activationSource = [baseActivationSource, recursiveSource].filter(Boolean).join('\n');
        const matchedKeywords = getMatchedKeywords(entry.keywords, activationSource, entry);
        const matchedSecondaryKeywords = getMatchedKeywords(
          entry.secondaryKeywords,
          activationSource,
          entry
        );
        const matchedNegativeKeywords = getMatchedKeywords(
          entry.negativeKeywords,
          activationSource,
          entry
        );
        const primaryKeywordCount = entry.keywords.filter((keyword) => keyword.trim()).length;
        const secondaryKeywordCount = entry.secondaryKeywords.filter(
          (keyword) => keyword.trim()
        ).length;
        const primaryActive =
          entry.mode === 'always-on' ||
          (entry.activationLogic === 'all'
            ? matchedKeywords.length === primaryKeywordCount && matchedKeywords.length > 0
            : matchedKeywords.length > 0);
        const secondaryActive =
          !entry.selective ||
          secondaryKeywordCount === 0 ||
          (entry.activationLogic === 'all'
            ? matchedSecondaryKeywords.length === secondaryKeywordCount &&
              matchedSecondaryKeywords.length > 0
            : matchedSecondaryKeywords.length > 0);
        const negativeBlocked = matchedNegativeKeywords.length > 0;
        const shouldActivate =
          includedLorebook && entry.enabled && primaryActive && secondaryActive && !negativeBlocked;
        const reason = !includedLorebook
          ? 'Lorebook is not global or bound to this character, persona, or session.'
          : !entry.enabled
            ? 'Entry is disabled.'
            : negativeBlocked
              ? `Blocked by negative keyword: ${matchedNegativeKeywords.join(', ')}`
              : !primaryActive
                ? 'Primary keywords did not match.'
                : !secondaryActive
                  ? 'Secondary filter did not match.'
                  : pass > 0
                    ? 'Activated recursively.'
                    : 'Activated.';

        debugEntries.push({
          lorebookId: lorebook.id,
          lorebookName: lorebook.name,
          entryId: entry.id,
          entryTitle: entry.title || 'Untitled Entry',
          includedLorebook,
          enabled: entry.enabled,
          activated: shouldActivate,
          reason,
          matchedKeywords,
          matchedSecondaryKeywords,
          matchedNegativeKeywords,
          scanDepth: entry.scanDepth,
          recursivePass: pass,
        });

        if (!shouldActivate) {
          continue;
        }

        const content = budgetPromptContent(entry.content, entry.tokenBudget);
        activatedEntries.push({
          lorebookId: lorebook.id,
          lorebookName: lorebook.name,
          entryId: entry.id,
          entryTitle: entry.title || 'Untitled Entry',
          content,
          mode: entry.mode,
          insertionOrder: entry.insertionOrder,
          insertionPosition: entry.insertionPosition,
          insertionDepth: entry.insertionDepth,
          tokenEstimate: estimateTokens([content]),
        });
        activatedEntryIds.add(entry.id);
        activatedThisPass = true;
        if (entry.recursive) {
          recursiveSource = [recursiveSource, content].filter(Boolean).join('\n');
        }
      }
    }
    if (!activatedThisPass) {
      break;
    }
  }

  return {
    activatedEntries: activatedEntries
      .filter((entry) => entry.content)
      .sort((left, right) => {
        if (left.insertionPosition !== right.insertionPosition) {
          if (left.insertionPosition === 'before-history') {
            return -1;
          }
          if (right.insertionPosition === 'before-history') {
            return 1;
          }
          if (left.insertionPosition === 'in-history') {
            return -1;
          }
          if (right.insertionPosition === 'in-history') {
            return 1;
          }
        }
        if (left.insertionOrder !== right.insertionOrder) {
          return left.insertionOrder - right.insertionOrder;
        }
        return left.entryTitle.localeCompare(right.entryTitle);
      }),
    debugEntries,
  };
}

function getCombinedLoreScanSource(options: {
  character: RoleplayCharacter;
  persona?: RoleplayPersona | null;
  historyMessages: HistoryMessage[];
}): string {
  return getLoreScanSource({
    ...options,
    scanDepth: 0,
  });
}

function buildMemoryBlock(
  session: RoleplayChatSession,
  budgetMode: RoleplayPromptBudgetMode
): string {
  const parts: string[] = [];

  if (session.conversationSummary.trim()) {
    const summaryBudget = budgetMode === 'full' ? 700 : budgetMode === 'compact' ? 220 : 140;
    parts.push(`Summary: ${trimContentToTokenBudget(session.conversationSummary.trim(), summaryBudget)}`);
  }

  const continuityParts = [
    session.continuity.relationshipSummary.trim()
      ? `Relationship: ${session.continuity.relationshipSummary.trim()}`
      : '',
    session.continuity.currentLocation.trim()
      ? `Location: ${session.continuity.currentLocation.trim()}`
      : '',
    session.continuity.currentSituation.trim()
      ? `Situation: ${session.continuity.currentSituation.trim()}`
      : '',
    session.continuity.openThreads.length > 0
      ? `Open Threads:\n${session.continuity.openThreads
          .slice(0, budgetMode === 'full' ? session.continuity.openThreads.length : budgetMode === 'compact' ? 5 : 3)
          .map((thread) => `- ${thread.trim()}`)
          .join('\n')}`
      : '',
  ].filter(Boolean);

  if (continuityParts.length > 0) {
    parts.push(continuityParts.join('\n'));
  }

  const memoryFacts = [...session.memoryFacts]
    .sort((left, right) => Number(right.pinned) - Number(left.pinned))
    .slice(0, budgetMode === 'full' ? session.memoryFacts.length : budgetMode === 'compact' ? 12 : 8)
    .map((fact) => fact.text.trim())
    .filter((fact) => fact.length > 0);
  if (memoryFacts.length > 0) {
    parts.push(`Remembered Facts:\n${memoryFacts.map((fact) => `- ${fact}`).join('\n')}`);
  }

  return parts.join('\n\n');
}

function buildGroupRosterBlock(characters: RoleplayCharacter[]): string {
  return characters
    .map((character) =>
      [
        `Name: ${character.name}`,
        character.description.trim() ? `Description: ${character.description.trim()}` : '',
        buildCharacterPersonalityBlock(character).trim()
          ? `Personality: ${buildCharacterPersonalityBlock(character).trim()}`
          : '',
        character.scenario.trim() ? `Scenario Notes: ${character.scenario.trim()}` : '',
      ]
        .filter(Boolean)
        .join('\n')
    )
    .filter(Boolean)
    .join('\n\n');
}

function buildStageDirectionBlock(session: RoleplayChatSession): string {
  return [
    session.sceneBackgroundPrompt.trim()
      ? `Background: ${session.sceneBackgroundPrompt.trim()}`
      : '',
    session.ambiencePrompt.trim() ? `Ambience: ${session.ambiencePrompt.trim()}` : '',
    session.activeExpression.trim()
      ? `Active expression or sprite cue: ${session.activeExpression.trim()}`
      : '',
  ]
    .filter(Boolean)
    .join('\n');
}

function estimateTokens(parts: string[]): number {
  const combined = parts.join('\n');
  if (!combined.trim()) {
    return 0;
  }
  return Math.ceil(combined.length / 4);
}

function budgetHistoryMessages(options: {
  historyMessages: HistoryMessage[];
  promptBlocks: RoleplayPromptBlock[];
  maxContextTokens: number;
  reservedResponseTokens: number;
}): BudgetedHistoryResult {
  const maxContextTokens = Math.max(1024, options.maxContextTokens);
  const reservedResponseTokens = Math.max(0, options.reservedResponseTokens);
  const availableInputTokens = Math.max(0, maxContextTokens - reservedResponseTokens);
  const promptBlockTokens = estimateTokens(options.promptBlocks.map((block) => block.content));
  const historyBudgetTokens = Math.max(0, availableInputTokens - promptBlockTokens);
  const messages: HistoryMessage[] = [];
  const historyBudgetTrace: RoleplayHistoryBudgetTrace[] = options.historyMessages.map(
    (message, index) => ({
      originalIndex: index,
      role: message.role,
      originalContent: message.content,
      finalContent: null,
      tokenEstimate: estimateTokens([message.content]),
      included: false,
      truncated: false,
      reason: 'Dropped by context budget.',
    })
  );
  let remainingTokens = historyBudgetTokens;
  let droppedHistoryMessages = 0;
  let truncatedHistoryMessages = 0;

  for (let index = options.historyMessages.length - 1; index >= 0; index -= 1) {
    const message = options.historyMessages[index];
    const messageTokens = estimateTokens([message.content]);

    if (remainingTokens <= 0) {
      droppedHistoryMessages = index + 1;
      break;
    }

    if (messageTokens <= remainingTokens) {
      messages.unshift(message);
      historyBudgetTrace[index] = {
        ...historyBudgetTrace[index],
        finalContent: message.content,
        included: true,
        reason: 'Included within history budget.',
      };
      remainingTokens -= messageTokens;
      continue;
    }

    if (messages.length === 0) {
      const trimmedContent = trimContentToTokenBudget(message.content, remainingTokens);
      if (trimmedContent) {
        messages.unshift({
          ...message,
          content: trimmedContent,
        });
        historyBudgetTrace[index] = {
          ...historyBudgetTrace[index],
          finalContent: trimmedContent,
          included: true,
          truncated: true,
          reason: 'Truncated to fit remaining history budget.',
        };
        truncatedHistoryMessages = 1;
      }
      droppedHistoryMessages = index;
      remainingTokens = 0;
      break;
    }

    droppedHistoryMessages = index + 1;
    break;
  }

  return {
    messages,
    contextBudget: {
      maxContextTokens,
      reservedResponseTokens,
      availableInputTokens,
      promptBlockTokens,
      historyBudgetTokens,
      historyTokens: estimateTokens(messages.map((message) => message.content)),
      totalHistoryMessages: options.historyMessages.length,
      includedHistoryMessages: messages.length,
      droppedHistoryMessages,
      truncatedHistoryMessages,
    },
    historyBudgetTrace,
  };
}

function buildPromptBlockTraces(
  blocks: RoleplayPromptBlock[],
  generationMode: RoleplayGenerationMode
): RoleplayPromptBlockTrace[] {
  return sortPromptBlocks(blocks).map((block) => {
    const triggerMatched = block.triggerModes.includes(generationMode);
    const contentPresent = block.content.trim().length > 0;
    const included = block.enabled && triggerMatched && contentPresent;
    const reason = !block.enabled
      ? 'Disabled in prompt manager.'
      : !triggerMatched
        ? `Excluded for ${generationMode} trigger.`
        : !contentPresent
          ? 'Empty block content.'
          : 'Included.';
    return {
      blockId: block.id,
      label: block.label,
      included,
      reason,
    };
  });
}

function expandPromptMacros(
  content: string,
  context: {
    original: string;
    character: RoleplayCharacter;
    persona?: RoleplayPersona | null;
    scriptVariables?: Record<string, RoleplayScriptVariable>;
  }
): string {
  return content
    .replaceAll('{{original}}', context.original)
    .replaceAll('{{char}}', context.character.name)
    .replaceAll('{{user}}', context.persona?.name || 'User')
    .replaceAll('{{persona}}', context.persona?.description || context.persona?.notes || '')
    .replaceAll('{{scenario}}', context.character.scenario)
    .replaceAll('{{greeting}}', context.character.openingRoleplayMessage || context.character.openingChatMessage)
    .replace(/\{\{var:([\w.-]+)\}\}/g, (_match, name: string) => context.scriptVariables?.[name]?.value ?? '')
    .replace(/\$([A-Za-z_][\w.-]*)/g, (_match, name: string) => context.scriptVariables?.[name]?.value ?? '');
}

export function compileRoleplayPrompt(options: {
  character: RoleplayCharacter;
  session: RoleplayChatSession;
  persona?: RoleplayPersona | null;
  groupCharacters?: RoleplayCharacter[];
  lorebooks?: RoleplayLorebook[];
  pendingMessages?: HistoryMessage[];
  maxHistoryMessages?: number;
  generationMode?: RoleplayGenerationMode;
  maxContextTokens?: number;
  reservedResponseTokens?: number;
  promptBudgetMode?: RoleplayPromptBudgetMode;
  loreEntryLimit?: number | null;
  scriptVariables?: Record<string, RoleplayScriptVariable>;
  knowledgeDocuments?: RoleplayKnowledgeDocument[];
  retrievalQueryEmbedding?: number[] | null;
  retrievalEmbeddingModel?: string | null;
  retrievalMaxChunks?: number;
  retrievalMaxTokens?: number;
}): CompiledRoleplayPrompt {
  const {
    character,
    session,
    persona,
    groupCharacters = [],
    lorebooks = [],
    pendingMessages,
    maxHistoryMessages = 40,
    generationMode = 'normal',
    maxContextTokens = DEFAULT_CONTEXT_TOKEN_BUDGET,
    reservedResponseTokens = DEFAULT_RESERVED_RESPONSE_TOKENS,
    promptBudgetMode = 'full',
    loreEntryLimit = null,
    scriptVariables = {},
    knowledgeDocuments = [],
    retrievalQueryEmbedding = null,
    retrievalEmbeddingModel = null,
    retrievalMaxChunks = 4,
    retrievalMaxTokens = promptBudgetMode === 'full' ? 900 : promptBudgetMode === 'compact' ? 520 : 320,
  } = options;
  const promptStack = {
    roleplayPresetId: session.promptStack?.roleplayPresetId ?? 'none',
    mainPromptOverride: session.promptStack?.mainPromptOverride ?? '',
    authorNote: session.promptStack?.authorNote ?? '',
    postHistoryNote: session.promptStack?.postHistoryNote ?? '',
    includePersona: session.promptStack?.includePersona ?? true,
    includeCharacterDefinition: session.promptStack?.includeCharacterDefinition ?? true,
    includeScenario: session.promptStack?.includeScenario ?? true,
    includeExampleMessages: session.promptStack?.includeExampleMessages ?? true,
    includeMemory: session.promptStack?.includeMemory ?? true,
    includeLore: session.promptStack?.includeLore ?? true,
    promptBlockSettings: session.promptStack?.promptBlockSettings ?? {},
    promptBlockSettingsByPresetId: session.promptStack?.promptBlockSettingsByPresetId ?? {},
  };

  const historyMessages = (
    pendingMessages ??
    session.messages
      .filter(
        (message): message is ChatMessage =>
          (message.role === 'user' || message.role === 'assistant') &&
          message.includedInPrompt !== false
      )
      .map((message) => ({
        role: message.role as 'user' | 'assistant',
        content: getMessageContent(message),
      }))
  )
    .slice(-maxHistoryMessages)
    .map((message) => ({
      role: message.role,
      content: message.content.trim(),
    }))
    .filter((message) => message.content);

  const loreActivationResult = resolveActivatedLoreEntries({
    character,
    session,
    persona,
    lorebooks,
    historyMessages,
  });
  const { activatedEntries: activatedLoreEntries, debugEntries: loreActivationDebug } =
    loreActivationResult;
  const effectiveLoreEntryLimit =
    typeof loreEntryLimit === 'number' && loreEntryLimit >= 0 ? loreEntryLimit : null;
  const includedLoreEntries =
    promptStack.includeLore && effectiveLoreEntryLimit !== null
      ? activatedLoreEntries.slice(0, effectiveLoreEntryLimit)
      : activatedLoreEntries;
  const droppedLoreEntryCount = promptStack.includeLore
    ? Math.max(0, activatedLoreEntries.length - includedLoreEntries.length)
    : 0;

  const promptBlocks: RoleplayPromptBlock[] = [];
  const originalMainPrompt = getEffectiveSystemPrompt(character);
  const rawMainPrompt = getEffectiveSystemPrompt(character, session);
  const macroContext = {
    original: originalMainPrompt,
    character,
    persona,
    scriptVariables: {
      ...scriptVariables,
      ...(session.scriptVariables ?? {}),
    },
  };
  const activePreset = getRoleplayPresetStack(promptStack.roleplayPresetId);
  if (!activePreset.replacesMainPrompt) {
    appendPromptBlock(promptBlocks, {
      id: 'main-prompt',
      label: 'Main Prompt',
      content: expandPromptMacros(rawMainPrompt, macroContext),
      order: 0,
      budgetMode: promptBudgetMode,
      source: 'main',
    });
  }

  for (const presetBlock of activePreset.blocks) {
    appendPresetPromptBlock(promptBlocks, {
      id: presetBlock.id,
      label: presetBlock.label,
      content: expandPromptMacros(presetBlock.content, macroContext),
      enabled: presetBlock.enabled,
      order: presetBlock.order,
      role: presetBlock.role,
      position: presetBlock.position,
      depth: presetBlock.depth,
      triggerModes: presetBlock.triggerModes,
      tokenBudget: presetBlock.tokenBudget,
      budgetMode: promptBudgetMode,
      source: 'preset',
    });
  }

  if (promptStack.includePersona && persona) {
    appendPromptBlock(promptBlocks, {
      id: 'persona',
      label: 'Persona',
      content: [persona.name.trim(), persona.description.trim(), persona.notes.trim()]
        .filter(Boolean)
        .join('\n')
        .replaceAll('{{user}}', persona.name.trim() || 'User'),
      order: 10,
      budgetMode: promptBudgetMode,
      source: 'persona',
    });
  }

  if (promptStack.includeCharacterDefinition) {
    appendPromptBlock(promptBlocks, {
      id: 'character',
      label: 'Character Definition',
      content: expandPromptMacros(character.description, macroContext),
      order: 20,
      budgetMode: promptBudgetMode,
      source: 'character',
    });
    appendPromptBlock(promptBlocks, {
      id: 'personality',
      label: 'Personality',
      content: expandPromptMacros(buildCharacterPersonalityBlock(character), macroContext),
      order: 30,
      budgetMode: promptBudgetMode,
      source: 'character',
    });
    appendPromptBlock(promptBlocks, {
      id: 'creator-notes',
      label: 'Creator Notes',
      content: expandPromptMacros(character.creatorNotes, macroContext),
      order: 40,
      budgetMode: promptBudgetMode,
      source: 'character',
    });
    appendPromptBlock(promptBlocks, {
      id: 'character-note',
      label: 'Character Note',
      content: expandPromptMacros(character.characterNote, macroContext),
      order: 45,
      role: character.characterNoteRole,
      position: character.characterNoteDepth === null ? 'before-history' : 'in-history',
      depth: character.characterNoteDepth,
      budgetMode: promptBudgetMode,
      source: 'character',
    });
    appendPromptBlock(promptBlocks, {
      id: 'group-roster',
      label: 'Group Roster',
      content: expandPromptMacros(
        buildGroupRosterBlock(
          groupCharacters.filter((groupCharacter) => groupCharacter.id !== character.id)
        ),
        macroContext
      ),
      order: 47,
      budgetMode: promptBudgetMode,
      source: 'character',
    });
  }

  if (promptStack.includeScenario) {
    appendPromptBlock(promptBlocks, {
      id: 'scenario',
      label: 'Scenario',
      content: expandPromptMacros(character.scenario, macroContext),
      order: 50,
      budgetMode: promptBudgetMode,
      source: 'character',
    });
    appendPromptBlock(promptBlocks, {
      id: 'stage-direction',
      label: 'Stage Direction',
      content: expandPromptMacros(buildStageDirectionBlock(session), macroContext),
      order: 55,
      budgetMode: promptBudgetMode,
      source: 'note',
    });
  }

  if (promptStack.includeExampleMessages) {
    appendPromptBlock(promptBlocks, {
      id: 'examples',
      label: 'Example Messages',
      content: expandPromptMacros(character.exampleMessages, macroContext),
      order: 60,
      budgetMode: promptBudgetMode,
      source: 'character',
    });
  }

  if (promptStack.includeMemory) {
    appendPromptBlock(promptBlocks, {
      id: 'memory',
      label: 'Memory',
      content: buildMemoryBlock(session, promptBudgetMode),
      order: 70,
      budgetMode: promptBudgetMode,
      source: 'memory',
    });
  }

  const retrievedKnowledgeEntries = retrieveRoleplayKnowledge({
    character,
    session,
    persona,
    documents: knowledgeDocuments,
    queryText: historyMessages.slice(-8).map((message) => message.content).join('\n'),
    queryEmbedding: retrievalQueryEmbedding,
    embeddingModel: retrievalEmbeddingModel,
    maxChunks: retrievalMaxChunks,
    maxTokens: retrievalMaxTokens,
  });

  if (retrievedKnowledgeEntries.length > 0) {
    appendPromptBlock(promptBlocks, {
      id: 'retrieved-knowledge',
      label: 'Retrieved Knowledge',
      content: buildRetrievedKnowledgeBlock(retrievedKnowledgeEntries),
      order: 75,
      budgetMode: promptBudgetMode,
      source: 'retrieval',
    });
  }

  for (const injection of session.promptInjections ?? []) {
    if (!injection.enabled) {
      continue;
    }
    appendPromptBlock(promptBlocks, {
      id: `script-${injection.id}`,
      label: `Script: ${injection.label}`,
      content: expandPromptMacros(injection.content, macroContext),
      order: injection.order,
      role: injection.role,
      position: injection.position,
      depth: injection.depth,
      budgetMode: promptBudgetMode,
      source: 'script',
    });
  }

  if (promptStack.includeLore) {
    for (const loreEntry of includedLoreEntries.filter(
      (entry) => entry.insertionPosition === 'before-history'
    )) {
      appendPromptBlock(promptBlocks, {
        id: `lore-${loreEntry.entryId}`,
        label: `Lore: ${loreEntry.lorebookName} / ${loreEntry.entryTitle}`,
        content: expandPromptMacros(loreEntry.content, macroContext),
        order: 100 + loreEntry.insertionOrder,
        budgetMode: promptBudgetMode,
        source: 'lore',
      });
    }
  }

  if (promptStack.includeLore) {
    for (const loreEntry of includedLoreEntries.filter(
      (entry) => entry.insertionPosition === 'in-history'
    )) {
      appendPromptBlock(promptBlocks, {
        id: `lore-${loreEntry.entryId}`,
        label: `Lore: ${loreEntry.lorebookName} / ${loreEntry.entryTitle}`,
        content: expandPromptMacros(loreEntry.content, macroContext),
        order: 100 + loreEntry.insertionOrder,
        position: 'in-history',
        depth: loreEntry.insertionDepth,
        budgetMode: promptBudgetMode,
        source: 'lore',
      });
    }
  }

  appendPromptBlock(promptBlocks, {
    id: 'author-note',
    label: 'Author Note',
    content: expandPromptMacros(promptStack.authorNote, macroContext),
    order: 900,
    budgetMode: promptBudgetMode,
    source: 'note',
  });

  if (promptStack.includeLore) {
    for (const loreEntry of includedLoreEntries.filter(
      (entry) => entry.insertionPosition === 'after-history'
    )) {
      appendPromptBlock(promptBlocks, {
        id: `lore-${loreEntry.entryId}`,
        label: `Lore: ${loreEntry.lorebookName} / ${loreEntry.entryTitle}`,
        content: expandPromptMacros(loreEntry.content, macroContext),
        order: 100 + loreEntry.insertionOrder,
        position: 'after-history',
        budgetMode: promptBudgetMode,
        source: 'lore',
      });
    }
  }

  appendPromptBlock(promptBlocks, {
    id: 'post-history-note',
    label: 'Post-History Note',
    content: expandPromptMacros(
      [character.postHistoryInstructions, promptStack.postHistoryNote].filter(Boolean).join('\n\n'),
      macroContext
    ),
    order: 900,
    position: 'after-history',
    budgetMode: promptBudgetMode,
    source: 'note',
  });

  appendPromptBlock(promptBlocks, {
    id: 'mode-continue',
    label: 'Continue Mode',
    content:
      'Continue the last assistant message naturally in the same voice and scene. Do not restart the scene or repeat the previous sentence.',
    order: 950,
    position: 'after-history',
    triggerModes: ['continue'],
    budgetMode: promptBudgetMode,
    source: 'mode',
  });

  appendPromptBlock(promptBlocks, {
    id: 'mode-swipe',
    label: 'Alternate Swipe Mode',
    content:
      'Generate an alternate in-character response for the latest user turn. Keep continuity, but avoid reusing the previous response wording.',
    order: 950,
    position: 'after-history',
    triggerModes: ['swipe'],
    budgetMode: promptBudgetMode,
    source: 'mode',
  });

  appendPromptBlock(promptBlocks, {
    id: 'mode-regenerate',
    label: 'Regenerate Mode',
    content:
      'Replace the previous assistant response with a stronger in-character response. Preserve continuity and answer the same latest user turn directly.',
    order: 950,
    position: 'after-history',
    triggerModes: ['regenerate'],
    budgetMode: promptBudgetMode,
    source: 'mode',
  });

  appendPromptBlock(promptBlocks, {
    id: 'mode-impersonate',
    label: 'Impersonate Mode',
    content:
      'Write the next user message from the user persona point of view. Keep it plausible, concise, and grounded in the conversation.',
    order: 950,
    position: 'after-history',
    triggerModes: ['impersonate'],
    budgetMode: promptBudgetMode,
    source: 'mode',
  });

  const activePresetPromptBlockSettings =
    promptStack.promptBlockSettingsByPresetId[activePreset.id] ?? {};
  const scopedPromptBlockSettings: RoleplayChatSession['promptStack']['promptBlockSettings'] = {};
  for (const block of promptBlocks) {
    const blockSettings =
      block.source === 'preset'
        ? activePresetPromptBlockSettings[block.id]
        : promptStack.promptBlockSettings[block.id];
    if (blockSettings) {
      scopedPromptBlockSettings[block.id] = blockSettings;
    }
  }
  const configuredPromptBlocks = applyPromptBlockSettings(
    promptBlocks,
    scopedPromptBlockSettings
  );
  const blockTraces = buildPromptBlockTraces(configuredPromptBlocks, generationMode);
  const finalActiveBlocks = filterPromptBlocksForMode(configuredPromptBlocks, generationMode);
  const budgetedHistory = budgetHistoryMessages({
    historyMessages,
    promptBlocks: finalActiveBlocks,
    maxContextTokens,
    reservedResponseTokens,
  });
  const apiMessageTraces: RoleplayApiMessageTrace[] = [];
  const beforeHistoryBlocks = finalActiveBlocks.filter((block) => block.position === 'before-history');
  const inHistoryBlocks = finalActiveBlocks.filter((block) => block.position === 'in-history');
  const beforeHistorySystemBlocks = beforeHistoryBlocks.filter((block) => block.role === 'system');
  const systemPrompt = beforeHistorySystemBlocks.map((block) => block.content).join('\n\n');

  appendPromptBlockMessages(apiMessageTraces, beforeHistoryBlocks);
  apiMessageTraces.push(...insertPromptBlocksIntoHistory(budgetedHistory.messages, inHistoryBlocks));

  const afterHistoryBlocks = finalActiveBlocks.filter((block) => block.position === 'after-history');
  appendPromptBlockMessages(apiMessageTraces, afterHistoryBlocks);
  const apiMessages: ApiMessage[] = apiMessageTraces.map((message) => ({
    role: message.role,
    content: message.content,
  }));
  const memoryTokens = finalActiveBlocks
    .filter((block) => block.source === 'memory')
    .reduce((sum, block) => sum + block.tokenEstimate, 0);
  const loreTokens = finalActiveBlocks
    .filter((block) => block.source === 'lore')
    .reduce((sum, block) => sum + block.tokenEstimate, 0);
  const retrievedKnowledgeTokens = finalActiveBlocks
    .filter((block) => block.source === 'retrieval')
    .reduce((sum, block) => sum + block.tokenEstimate, 0);
  const retrievedKnowledgeVectorEntries = retrievedKnowledgeEntries.filter(
    (entry) => entry.retrievalMode === 'vector'
  ).length;
  const promptPressure =
    budgetedHistory.contextBudget.availableInputTokens > 0
      ? budgetedHistory.contextBudget.promptBlockTokens /
        budgetedHistory.contextBudget.availableInputTokens
      : 1;
  const diagnosticsWarnings: string[] = [];
  if (promptPressure >= 0.75) {
    diagnosticsWarnings.push(
      'Prompt blocks use most of the available input budget; recent chat may be dropped.'
    );
  }
  if (budgetedHistory.contextBudget.droppedHistoryMessages > 0) {
    diagnosticsWarnings.push(
      `${budgetedHistory.contextBudget.droppedHistoryMessages} history message(s) were dropped by the context budget.`
    );
  }
  if (droppedLoreEntryCount > 0) {
    diagnosticsWarnings.push(
      `${droppedLoreEntryCount} activated lore entr${
        droppedLoreEntryCount === 1 ? 'y was' : 'ies were'
      } capped by the selected model profile.`
    );
  }
  if (retrievedKnowledgeEntries.length >= retrievalMaxChunks) {
    diagnosticsWarnings.push(
      `Knowledge retrieval hit the ${retrievalMaxChunks} chunk cap; narrow the Knowledge Bank or raise the profile budget.`
    );
  }
  if (promptBudgetMode !== 'full') {
    diagnosticsWarnings.push(
      `${promptBudgetMode === 'micro' ? 'Micro' : 'Compact'} prompt budgeting is active for local model efficiency.`
    );
  }

  return {
    systemPrompt,
    promptBlocks: configuredPromptBlocks,
    generationMode,
    contextBudget: budgetedHistory.contextBudget,
    blockTraces,
    apiMessageTraces,
    loreScanSource: getCombinedLoreScanSource({ character, persona, historyMessages }),
    historyBudgetTrace: budgetedHistory.historyBudgetTrace,
    segments: promptBlocksToSegments(finalActiveBlocks),
    historyMessages: budgetedHistory.messages,
    apiMessages,
    activatedLoreEntries: includedLoreEntries,
    loreActivationDebug,
    retrievedKnowledgeEntries,
    diagnostics: {
      promptBudgetMode,
      memoryTokens,
      loreTokens,
      activatedLoreEntries: promptStack.includeLore ? activatedLoreEntries.length : 0,
      includedLoreEntries: promptStack.includeLore ? includedLoreEntries.length : 0,
      droppedLoreEntries: droppedLoreEntryCount,
      loreEntryLimit: effectiveLoreEntryLimit,
      retrievedKnowledgeEntries: retrievedKnowledgeEntries.length,
      retrievedKnowledgeTokens,
      retrievedKnowledgeVectorEntries,
      promptPressure,
      warnings: diagnosticsWarnings,
    },
    tokenEstimate: estimateTokens([
      ...finalActiveBlocks.map((block) => block.content),
      ...budgetedHistory.messages.map((message) => message.content),
    ]),
  };
}
