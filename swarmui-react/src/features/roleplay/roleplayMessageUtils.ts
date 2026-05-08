import type { ChatMessage, ChatMessageVariant } from '../../types/roleplay';

export function getActiveMessageVariant(message: ChatMessage): ChatMessageVariant | null {
  if (!message.activeVariantId || message.variants.length === 0) {
    return null;
  }
  return message.variants.find((variant) => variant.id === message.activeVariantId) ?? null;
}

export function getMessageContent(message: ChatMessage): string {
  return getActiveMessageVariant(message)?.content ?? message.content;
}

export function getMessageSceneImageUrl(message: ChatMessage): string | null {
  return getActiveMessageVariant(message)?.sceneImageUrl ?? message.sceneImageUrl;
}

export function getMessageSuggestedImagePrompt(message: ChatMessage): string | null {
  return getActiveMessageVariant(message)?.suggestedImagePrompt ?? message.suggestedImagePrompt;
}

export function findLastMessage(
  messages: ChatMessage[],
  predicate: (message: ChatMessage) => boolean
): ChatMessage | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (predicate(messages[index])) {
      return messages[index];
    }
  }
  return null;
}

export function getLastAssistantMessage(messages: ChatMessage[]): ChatMessage | null {
  return findLastMessage(messages, (message) => message.role === 'assistant');
}

export function getLastUserMessage(messages: ChatMessage[]): ChatMessage | null {
  return findLastMessage(messages, (message) => message.role === 'user');
}

export function getLastMessageWithContent(messages: ChatMessage[]): ChatMessage | null {
  return findLastMessage(messages, (message) => getMessageContent(message).trim().length > 0);
}

export function getLastMessageWithSceneImage(messages: ChatMessage[]): ChatMessage | null {
  return findLastMessage(
    messages,
    (message) => (getMessageSceneImageUrl(message)?.trim().length ?? 0) > 0
  );
}

export function createMessageVariant(
  content: string,
  sceneImageUrl: string | null = null,
  suggestedImagePrompt: string | null = null
): ChatMessageVariant {
  return {
    id: crypto.randomUUID(),
    content,
    timestamp: Date.now(),
    sceneImageUrl,
    suggestedImagePrompt,
  };
}

export function applyVariantToMessage(message: ChatMessage, variant: ChatMessageVariant): ChatMessage {
  return {
    ...message,
    content: variant.content,
    sceneImageUrl: variant.sceneImageUrl,
    suggestedImagePrompt: variant.suggestedImagePrompt,
    activeVariantId: variant.id,
  };
}
