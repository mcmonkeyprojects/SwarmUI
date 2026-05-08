import type { AssistantServerMode } from '../types/assistant';
import { unloadMagicPromptModel } from './magicPromptService';

export const ROLEPLAY_TEXT_MODEL_IDLE_UNLOAD_DELAY_MS = 120000;

export interface LocalTextModelResidency {
  endpointUrl: string;
  modelId: string;
  serverMode: AssistantServerMode | null | undefined;
}

export interface LocalTextModelUnloadResult {
  attempted: boolean;
  success: boolean;
  error?: string;
}

interface ScheduleLocalTextModelUnloadOptions {
  delayMs?: number;
  onError?: (error: string) => void;
}

const scheduledTextModelUnloads = new Map<string, ReturnType<typeof setTimeout>>();

function getResidencyKey(input: LocalTextModelResidency): string {
  return `${input.endpointUrl.replace(/\/+$/, '')}::${input.modelId.trim()}`;
}

export function canUnloadLocalTextModel(serverMode: AssistantServerMode | null | undefined): boolean {
  return serverMode === 'legacy-lmstudio';
}

export function cancelScheduledLocalTextModelUnload(input?: LocalTextModelResidency) {
  if (!input) {
    for (const timeoutId of scheduledTextModelUnloads.values()) {
      clearTimeout(timeoutId);
    }
    scheduledTextModelUnloads.clear();
    return;
  }

  const key = getResidencyKey(input);
  const timeoutId = scheduledTextModelUnloads.get(key);
  if (!timeoutId) {
    return;
  }
  clearTimeout(timeoutId);
  scheduledTextModelUnloads.delete(key);
}

export async function unloadLocalTextModelNow(
  input: LocalTextModelResidency
): Promise<LocalTextModelUnloadResult> {
  cancelScheduledLocalTextModelUnload(input);

  if (!canUnloadLocalTextModel(input.serverMode) || !input.modelId.trim()) {
    return { attempted: false, success: true };
  }

  const result = await unloadMagicPromptModel(input.endpointUrl, input.modelId);
  return {
    attempted: true,
    success: result.success,
    error: result.error,
  };
}

export function scheduleLocalTextModelUnload(
  input: LocalTextModelResidency,
  options: ScheduleLocalTextModelUnloadOptions = {}
) {
  if (!canUnloadLocalTextModel(input.serverMode) || !input.modelId.trim()) {
    return;
  }

  const key = getResidencyKey(input);
  cancelScheduledLocalTextModelUnload(input);
  const timeoutId = setTimeout(() => {
    scheduledTextModelUnloads.delete(key);
    void unloadMagicPromptModel(input.endpointUrl, input.modelId).then((result) => {
      if (!result.success) {
        options.onError?.(result.error || 'Failed to unload local text model.');
      }
    });
  }, options.delayMs ?? ROLEPLAY_TEXT_MODEL_IDLE_UNLOAD_DELAY_MS);
  scheduledTextModelUnloads.set(key, timeoutId);
}
