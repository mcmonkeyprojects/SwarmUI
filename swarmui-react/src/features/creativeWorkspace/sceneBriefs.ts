import type { GenerateParams } from '../../api/types';
import type {
  RoleplayCharacter,
  RoleplayChatSession,
  RoleplayPersona,
} from '../../types/roleplay';
import { compileRoleplayImagePrompt } from '../roleplay/roleplayImagePromptCompiler';
import type { CreativeProvenance, SceneBrief } from './types';

export function buildRoleplaySceneBrief(input: {
  character: RoleplayCharacter;
  session: RoleplayChatSession;
  persona?: RoleplayPersona | null;
  groupCharacters?: RoleplayCharacter[];
  model?: string | null;
  width: number;
  height: number;
  steps: number;
  cfgscale: number;
  clipstopatlayer?: number | null;
  projectId?: string | null;
}): SceneBrief {
  const lastAssistantMessage = [...input.session.messages]
    .reverse()
    .find((message) => message.role === 'assistant');
  const compiledImagePrompt = compileRoleplayImagePrompt({
    character: input.character,
    session: input.session,
    persona: input.persona,
    groupCharacters: input.groupCharacters,
    model: input.model,
    width: input.width,
    height: input.height,
    steps: input.steps,
    cfgscale: input.cfgscale,
    clipstopatlayer: input.clipstopatlayer,
  });
  const prompt = compiledImagePrompt.prompt;
  const negativePrompt = compiledImagePrompt.negativePrompt;
  const appearancePrefix =
    input.character.visualProfile.permanentAnchor.trim() ||
    input.character.appearancePrompt?.trim() ||
    '';
  const now = Date.now();
  const generateParams: Partial<GenerateParams> = compiledImagePrompt.generateParams;

  const provenance: CreativeProvenance = {
    source: 'roleplay',
    projectId: input.projectId ?? null,
    prompt,
    negativePrompt,
    model: input.model ?? null,
    loras: input.character.characterLora ? [input.character.characterLora] : [],
    roleplayCharacterId: input.character.id,
    roleplayCharacterName: input.character.name,
    roleplaySessionId: input.session.id,
    roleplayMessageId: lastAssistantMessage?.id ?? null,
    capturedAt: now,
  };

  return {
    id: `scene-brief-${now}-${Math.random().toString(36).slice(2, 8)}`,
    projectId: input.projectId ?? null,
    title: `${input.character.name}: ${input.session.title}`,
    prompt,
    negativePrompt,
    appearancePrefix,
    sceneSummary: compiledImagePrompt.sceneSummary,
    referenceImageUrls: compiledImagePrompt.referenceImages.map((reference) => reference.url),
    generateParams,
    memorySummary: input.session.conversationSummary || input.persona?.description || '',
    openThreads: input.session.continuity.openThreads.slice(),
    provenance,
    createdAt: now,
    updatedAt: now,
  };
}
