import type {
  ActivatedRoleplayLoreEntry,
  CompiledRoleplayPrompt,
  CompiledRoleplayPromptSegment,
  RoleplayCharacter,
  RoleplayChatSession,
  RoleplayLorebook,
  RoleplayPersona,
} from '../../types/roleplay';
import {
  buildCharacterPersonalityBlock,
  getEffectiveSystemPrompt,
} from './roleplayCharacterPrompting';

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

function areKeywordsActive(keywords: string[], sourceText: string): boolean {
  const normalizedSource = sourceText.toLowerCase();
  return keywords.some((keyword) => {
    const normalizedKeyword = keyword.trim().toLowerCase();
    return normalizedKeyword.length > 0 && normalizedSource.includes(normalizedKeyword);
  });
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

  const activationSource = [
    character.name,
    character.description,
    character.scenario,
    persona?.name ?? '',
    persona?.description ?? '',
    persona?.notes ?? '',
    ...historyMessages.map((message) => message.content),
  ]
    .filter(Boolean)
    .join('\n')
    .toLowerCase();

  const activatedEntries: ActivatedRoleplayLoreEntry[] = [];

  for (const lorebook of lorebooks) {
    if (!boundLorebookIds.has(lorebook.id)) {
      continue;
    }

    for (const entry of lorebook.entries) {
      if (!entry.enabled) {
        continue;
      }

      const shouldActivate =
        entry.mode === 'always-on' || areKeywordsActive(entry.keywords, activationSource);
      if (!shouldActivate) {
        continue;
      }

      activatedEntries.push({
        lorebookId: lorebook.id,
        lorebookName: lorebook.name,
        entryId: entry.id,
        entryTitle: entry.title || 'Untitled Entry',
        content: entry.content.trim(),
        mode: entry.mode,
      });
    }
  }

  return activatedEntries.filter((entry) => entry.content);
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
      .filter((message) => message.role === 'user' || message.role === 'assistant')
      .map((message) => ({
        role: message.role as 'user' | 'assistant',
        content: message.content,
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
  appendSegment(
    segments,
    'main-prompt',
    'Main Prompt',
    getEffectiveSystemPrompt(character, session)
  );

  if (session.promptStack.includePersona && persona) {
    appendSegment(
      segments,
      'persona',
      'Persona',
      [persona.name.trim(), persona.description.trim(), persona.notes.trim()]
        .filter(Boolean)
        .join('\n')
    );
  }

  if (session.promptStack.includeCharacterDefinition) {
    appendSegment(segments, 'character', 'Character Definition', character.description);
    appendSegment(
      segments,
      'personality',
      'Personality',
      buildCharacterPersonalityBlock(character)
    );
    appendSegment(segments, 'creator-notes', 'Creator Notes', character.creatorNotes);
  }

  if (session.promptStack.includeScenario) {
    appendSegment(segments, 'scenario', 'Scenario', character.scenario);
  }

  if (session.promptStack.includeExampleMessages) {
    appendSegment(segments, 'examples', 'Example Messages', character.exampleMessages);
  }

  if (session.promptStack.includeMemory) {
    appendSegment(segments, 'memory', 'Memory', buildMemoryBlock(session));
  }

  if (session.promptStack.includeLore) {
    for (const loreEntry of activatedLoreEntries) {
      appendSegment(
        segments,
        `lore-${loreEntry.entryId}`,
        `Lore: ${loreEntry.lorebookName} / ${loreEntry.entryTitle}`,
        loreEntry.content
      );
    }
  }

  appendSegment(segments, 'author-note', 'Author Note', session.promptStack.authorNote);

  const systemPrompt = segments.map((segment) => segment.content).join('\n\n');
  const apiMessages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [];

  if (systemPrompt) {
    apiMessages.push({ role: 'system', content: systemPrompt });
  }

  apiMessages.push(...historyMessages);

  const postHistoryNote = session.promptStack.postHistoryNote.trim();
  if (postHistoryNote) {
    apiMessages.push({ role: 'system', content: postHistoryNote });
  }

  return {
    systemPrompt,
    segments,
    historyMessages,
    apiMessages,
    activatedLoreEntries,
    tokenEstimate: estimateTokens([
      ...segments.map((segment) => segment.content),
      ...historyMessages.map((message) => message.content),
      postHistoryNote,
    ]),
  };
}
