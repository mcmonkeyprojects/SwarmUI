import type {
  ActivatedRoleplayLoreEntry,
  ChatMessage,
  CompiledRoleplayPrompt,
  CompiledRoleplayPromptSegment,
  RoleplayCharacter,
  RoleplayChatSession,
  RoleplayLorebookEntry,
  RoleplayLorebook,
  RoleplayPersona,
} from '../../types/roleplay';
import {
  buildCharacterPersonalityBlock,
  getEffectiveSystemPrompt,
} from './roleplayCharacterPrompting';
import { getMessageContent } from './roleplayMessageUtils';

type HistoryMessage = { role: 'user' | 'assistant'; content: string };

function appendSegment(
  segments: CompiledRoleplayPromptSegment[],
  key: string,
  label: string,
  content: string | null | undefined
) {
  const normalizedContent = content?.trim();
  if (!normalizedContent) {
    return;
  }
  segments.push({ key, label, content: normalizedContent });
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

function areKeywordsActive(
  keywords: string[],
  sourceText: string,
  entry: RoleplayLorebookEntry
): boolean {
  const activeKeywords = keywords.filter((keyword) => keyword.trim());
  if (activeKeywords.length === 0) {
    return false;
  }

  if (entry.activationLogic === 'all') {
    return activeKeywords.every((keyword) => isKeywordActive(keyword, sourceText, entry));
  }

  return activeKeywords.some((keyword) => isKeywordActive(keyword, sourceText, entry));
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

function budgetLoreContent(content: string, tokenBudget: number | null): string {
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

function resolveActivatedLoreEntries(options: {
  character: RoleplayCharacter;
  session: RoleplayChatSession;
  persona?: RoleplayPersona | null;
  lorebooks?: RoleplayLorebook[];
  historyMessages: HistoryMessage[];
}): ActivatedRoleplayLoreEntry[] {
  const { character, session, persona, lorebooks = [], historyMessages } = options;
  const boundLorebookIds = new Set([
    ...character.boundLorebookIds,
    ...(persona?.boundLorebookIds ?? []),
    ...session.boundLorebookIds,
  ]);

  if (boundLorebookIds.size === 0) {
    return [];
  }

  const activatedEntries: ActivatedRoleplayLoreEntry[] = [];

  for (const lorebook of lorebooks) {
    if (!boundLorebookIds.has(lorebook.id)) {
      continue;
    }

    for (const entry of lorebook.entries) {
      if (!entry.enabled) {
        continue;
      }

      const activationSource = getLoreScanSource({
        character,
        persona,
        historyMessages,
        scanDepth: entry.scanDepth,
      });
      const primaryActive =
        entry.mode === 'always-on' || areKeywordsActive(entry.keywords, activationSource, entry);
      const secondaryActive =
        !entry.selective ||
        entry.secondaryKeywords.length === 0 ||
        areKeywordsActive(entry.secondaryKeywords, activationSource, entry);
      const shouldActivate = primaryActive && secondaryActive;
      if (!shouldActivate) {
        continue;
      }

      const content = budgetLoreContent(entry.content, entry.tokenBudget);

      activatedEntries.push({
        lorebookId: lorebook.id,
        lorebookName: lorebook.name,
        entryId: entry.id,
        entryTitle: entry.title || 'Untitled Entry',
        content,
        mode: entry.mode,
        insertionOrder: entry.insertionOrder,
        insertionPosition: entry.insertionPosition,
        tokenEstimate: estimateTokens([content]),
      });
    }
  }

  return activatedEntries
    .filter((entry) => entry.content)
    .sort((left, right) => {
      if (left.insertionPosition !== right.insertionPosition) {
        return left.insertionPosition === 'before-history' ? -1 : 1;
      }
      if (left.insertionOrder !== right.insertionOrder) {
        return left.insertionOrder - right.insertionOrder;
      }
      return left.entryTitle.localeCompare(right.entryTitle);
    });
}

function buildMemoryBlock(session: RoleplayChatSession): string {
  const parts: string[] = [];

  if (session.conversationSummary.trim()) {
    parts.push(`Summary: ${session.conversationSummary.trim()}`);
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
          .map((thread) => `- ${thread.trim()}`)
          .join('\n')}`
      : '',
  ].filter(Boolean);

  if (continuityParts.length > 0) {
    parts.push(continuityParts.join('\n'));
  }

  const memoryFacts = session.memoryFacts
    .map((fact) => fact.text.trim())
    .filter((fact) => fact.length > 0);
  if (memoryFacts.length > 0) {
    parts.push(`Remembered Facts:\n${memoryFacts.map((fact) => `- ${fact}`).join('\n')}`);
  }

  return parts.join('\n\n');
}

function estimateTokens(parts: string[]): number {
  const combined = parts.join('\n');
  if (!combined.trim()) {
    return 0;
  }
  return Math.ceil(combined.length / 4);
}

function expandPromptMacros(
  content: string,
  context: {
    original: string;
    character: RoleplayCharacter;
    persona?: RoleplayPersona | null;
  }
): string {
  return content
    .replaceAll('{{original}}', context.original)
    .replaceAll('{{char}}', context.character.name)
    .replaceAll('{{user}}', context.persona?.name || 'User')
    .replaceAll('{{persona}}', context.persona?.description || context.persona?.notes || '')
    .replaceAll('{{scenario}}', context.character.scenario)
    .replaceAll('{{greeting}}', context.character.openingRoleplayMessage || context.character.openingChatMessage);
}

export function compileRoleplayPrompt(options: {
  character: RoleplayCharacter;
  session: RoleplayChatSession;
  persona?: RoleplayPersona | null;
  lorebooks?: RoleplayLorebook[];
  pendingMessages?: HistoryMessage[];
  maxHistoryMessages?: number;
}): CompiledRoleplayPrompt {
  const {
    character,
    session,
    persona,
    lorebooks = [],
    pendingMessages,
    maxHistoryMessages = 40,
  } = options;

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

  const activatedLoreEntries = resolveActivatedLoreEntries({
    character,
    session,
    persona,
    lorebooks,
    historyMessages,
  });

  const segments: CompiledRoleplayPromptSegment[] = [];
  const originalMainPrompt = getEffectiveSystemPrompt(character);
  const rawMainPrompt = getEffectiveSystemPrompt(character, session);
  const macroContext = { original: originalMainPrompt, character, persona };
  appendSegment(
    segments,
    'main-prompt',
    'Main Prompt',
    expandPromptMacros(rawMainPrompt, macroContext)
  );

  if (session.promptStack.includePersona && persona) {
    appendSegment(
      segments,
      'persona',
      'Persona',
      [persona.name.trim(), persona.description.trim(), persona.notes.trim()]
        .filter(Boolean)
        .join('\n')
        .replaceAll('{{user}}', persona.name.trim() || 'User')
    );
  }

  if (session.promptStack.includeCharacterDefinition) {
    appendSegment(
      segments,
      'character',
      'Character Definition',
      expandPromptMacros(character.description, macroContext)
    );
    appendSegment(
      segments,
      'personality',
      'Personality',
      expandPromptMacros(buildCharacterPersonalityBlock(character), macroContext)
    );
    appendSegment(
      segments,
      'creator-notes',
      'Creator Notes',
      expandPromptMacros(character.creatorNotes, macroContext)
    );
  }

  if (session.promptStack.includeScenario) {
    appendSegment(segments, 'scenario', 'Scenario', expandPromptMacros(character.scenario, macroContext));
  }

  if (session.promptStack.includeExampleMessages) {
    appendSegment(
      segments,
      'examples',
      'Example Messages',
      expandPromptMacros(character.exampleMessages, macroContext)
    );
  }

  if (session.promptStack.includeMemory) {
    appendSegment(segments, 'memory', 'Memory', buildMemoryBlock(session));
  }

  if (session.promptStack.includeLore) {
    for (const loreEntry of activatedLoreEntries.filter(
      (entry) => entry.insertionPosition === 'before-history'
    )) {
      appendSegment(
        segments,
        `lore-${loreEntry.entryId}`,
        `Lore: ${loreEntry.lorebookName} / ${loreEntry.entryTitle}`,
        expandPromptMacros(loreEntry.content, macroContext)
      );
    }
  }

  appendSegment(
    segments,
    'author-note',
    'Author Note',
    expandPromptMacros(session.promptStack.authorNote, macroContext)
  );

  const systemPrompt = segments.map((segment) => segment.content).join('\n\n');
  const apiMessages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [];

  if (systemPrompt) {
    apiMessages.push({ role: 'system', content: systemPrompt });
  }

  apiMessages.push(...historyMessages);

  const afterHistorySegments: CompiledRoleplayPromptSegment[] = [];
  if (session.promptStack.includeLore) {
    for (const loreEntry of activatedLoreEntries.filter(
      (entry) => entry.insertionPosition === 'after-history'
    )) {
      appendSegment(
        afterHistorySegments,
        `lore-${loreEntry.entryId}`,
        `Lore: ${loreEntry.lorebookName} / ${loreEntry.entryTitle}`,
        expandPromptMacros(loreEntry.content, macroContext)
      );
    }
  }

  const postHistoryNote = expandPromptMacros(
    session.promptStack.postHistoryNote.trim(),
    macroContext
  );
  const afterHistoryPrompt = [
    ...afterHistorySegments.map((segment) => segment.content),
    postHistoryNote,
  ]
    .filter(Boolean)
    .join('\n\n');
  if (afterHistoryPrompt) {
    apiMessages.push({ role: 'system', content: afterHistoryPrompt });
  }

  return {
    systemPrompt,
    segments: [...segments, ...afterHistorySegments],
    historyMessages,
    apiMessages,
    activatedLoreEntries,
    tokenEstimate: estimateTokens([
      ...segments.map((segment) => segment.content),
      ...historyMessages.map((message) => message.content),
      afterHistoryPrompt,
    ]),
  };
}
