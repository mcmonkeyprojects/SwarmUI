/**
 * Roleplay memory system constants and utilities.
 */
import type {
    ChatMessage,
    RoleplayMemoryFact,
    RoleplayMemoryState,
} from '../../types/roleplay';
import { getMessageContent } from './roleplayMessageUtils';

/** Maximum number of memory facts stored per session. */
export const ROLEPLAY_MAX_MEMORY_FACTS = 50;

/** Number of messages between automatic memory refresh cycles. */
export const ROLEPLAY_MEMORY_REFRESH_THRESHOLD = 10;

/** Create a blank memory state for a new session or character. */
export function createEmptyRoleplayMemoryState(): RoleplayMemoryState {
    return {
        conversationSummary: '',
        continuity: {
            relationshipSummary: '',
            currentLocation: '',
            currentSituation: '',
            openThreads: [],
        },
        memoryFacts: [],
        memoryStatus: 'idle',
        messagesSinceMemoryRefresh: 0,
        lastMemoryUpdatedAt: null,
        lastVisitedAt: null,
    };
}

/**
 * Select the most recent messages suitable for a memory refresh request.
 */
export function getMessagesForMemoryRefresh(
    messages: ChatMessage[],
    maxMessages = 20,
): ChatMessage[] {
    return messages
        .filter((message) => message.includedInPrompt !== false)
        .slice(-maxMessages);
}

/**
 * Format selected messages into a string block for the memory-refresh LLM call.
 */
export function formatMessagesForMemoryRefresh(messages: ChatMessage[]): string {
    return messages
        .map((m) => `[${m.role}]: ${getMessageContent(m)}`)
        .join('\n\n');
}

/**
 * Merge newly generated memory facts with existing ones, deduplicating by text similarity.
 */
export function mergeGeneratedMemoryFacts(
    existing: RoleplayMemoryFact[],
    generated: RoleplayMemoryFact[],
): RoleplayMemoryFact[] {
    const merged = [...existing];
    for (const fact of generated) {
        const duplicate = merged.some(
            (e) => e.text.toLowerCase().trim() === fact.text.toLowerCase().trim(),
        );
        if (!duplicate) {
            merged.push(fact);
        }
    }
    return merged.slice(0, ROLEPLAY_MAX_MEMORY_FACTS);
}
