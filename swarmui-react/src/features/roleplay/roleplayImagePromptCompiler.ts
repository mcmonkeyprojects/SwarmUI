import type { GenerateParams } from '../../api/types';
import { inferPromptPresetKey, type PromptPresetKey } from '../../stores/promptEnhanceStore';
import type {
  RoleplayCharacter,
  RoleplayChatSession,
  RoleplayPersona,
  RoleplaySessionVisualState,
  RoleplayVisualCharacterState,
} from '../../types/roleplay';
import {
  getLastAssistantMessage,
  getLastMessageWithContent,
  getLastMessageWithSceneImage,
  getMessageContent,
  getMessageSceneImageUrl,
  getMessageSuggestedImagePrompt,
} from './roleplayMessageUtils';

export type RoleplayImagePromptBlockKind =
  | 'style'
  | 'character'
  | 'attire'
  | 'scene'
  | 'action'
  | 'camera'
  | 'quality'
  | 'negative';

export interface RoleplayImagePromptBlock {
  kind: RoleplayImagePromptBlockKind;
  label: string;
  content: string;
}

export interface RoleplayImageReferenceImage {
  url: string;
  label: string;
  source: 'character' | 'scene';
  characterId: string | null;
  characterName: string | null;
  role: string | null;
}

export interface CompiledRoleplayImagePrompt {
  prompt: string;
  negativePrompt: string;
  sceneSummary: string;
  promptBlocks: RoleplayImagePromptBlock[];
  negativePromptBlocks: RoleplayImagePromptBlock[];
  generateParams: Partial<GenerateParams>;
  referenceImageUrl: string | null;
  referenceImages: RoleplayImageReferenceImage[];
  debug: {
    characterIds: string[];
    model: string | null;
    formatPreset: PromptPresetKey;
    scenePromptSource: 'manual' | 'suggested' | 'message' | 'session' | 'fallback';
    enhancerEligible: boolean;
    extensionPoints: {
      controlNetPoseReference: string | null;
      regionalMaskReferences: string[];
      relightingReference: string | null;
    };
  };
}

export interface CompileRoleplayImagePromptInput {
  character: RoleplayCharacter;
  session: RoleplayChatSession;
  persona?: RoleplayPersona | null;
  groupCharacters?: RoleplayCharacter[];
  scenePrompt?: string | null;
  scenePromptSource?: CompiledRoleplayImagePrompt['debug']['scenePromptSource'];
  model?: string | null;
  width: number;
  height: number;
  steps: number;
  cfgscale: number;
  clipstopatlayer?: number | null;
}

const SD_BASE_NEGATIVE_PROMPT = [
  'worst quality',
  'low quality',
  'blurry',
  'bad anatomy',
  'bad hands',
  'extra fingers',
  'missing fingers',
  'deformed body',
  'distorted face',
  'asymmetrical eyes',
  'identity drift',
  'different face',
  'inconsistent outfit',
  'watermark',
  'text',
  'logo',
].join(', ');

const ILLUSTRATION_BASE_NEGATIVE_PROMPT = [
  'worst quality',
  'low quality',
  'normal quality',
  'lowres',
  'blurry',
  'bad anatomy',
  'bad hands',
  'extra fingers',
  'missing fingers',
  'deformed face',
  'bad eyes',
  'cropped',
  'watermark',
  'text',
  'logo',
  'identity drift',
  'outfit drift',
].join(', ');

const CINEMATIC_BASE_NEGATIVE_PROMPT = [
  'blurry',
  'soft focus',
  'low detail',
  'bad anatomy',
  'bad hands',
  'extra fingers',
  'missing fingers',
  'deformed face',
  'duplicate subject',
  'identity drift',
  'wrong costume',
  'background mismatch',
  'harsh artifacts',
  'watermark',
  'text',
  'logo',
].join(', ');

function cleanPart(value: string | null | undefined): string {
  return (value || '').replace(/\s+/g, ' ').trim();
}

function cleanSentence(value: string | null | undefined): string {
  const cleaned = cleanPart(value);
  if (!cleaned) {
    return '';
  }
  return cleaned.replace(/[.,;:]+$/g, '').trim();
}

function joinParts(parts: Array<string | null | undefined>, separator: string = ', '): string {
  return parts.map(cleanPart).filter(Boolean).join(separator);
}

function joinSentences(parts: Array<string | null | undefined>): string {
  return parts
    .map(cleanSentence)
    .filter(Boolean)
    .map((part) => `${part}.`)
    .join(' ');
}

function pushBlock(
  blocks: RoleplayImagePromptBlock[],
  kind: RoleplayImagePromptBlockKind,
  label: string,
  content: string | null | undefined
) {
  const cleaned = cleanPart(content);
  if (!cleaned) {
    return;
  }
  blocks.push({ kind, label, content: cleaned });
}

function dedupeList(values: string[]): string[] {
  const seen = new Set<string>();
  const deduped: string[] = [];
  for (const value of values) {
    const cleaned = cleanPart(value);
    if (!cleaned) {
      continue;
    }
    const normalized = cleaned.toLowerCase();
    if (seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    deduped.push(cleaned);
  }
  return deduped;
}

function getCharacterState(
  session: RoleplayChatSession,
  character: RoleplayCharacter
): RoleplayVisualCharacterState | null {
  return getSessionVisualState(session).characterStates[character.id] ?? null;
}

function getSessionVisualState(session: RoleplayChatSession): RoleplaySessionVisualState {
  return session.visualState ?? {
    location: '',
    timeOfDay: '',
    lighting: session.ambiencePrompt ?? '',
    sceneAnchor: session.sceneBackgroundPrompt ?? '',
    persistentObjects: '',
    negativePrompt: '',
    characterStates: {},
  };
}

function getCharacterReferenceImage(
  character: RoleplayCharacter,
  state: RoleplayVisualCharacterState | null
): string | null {
  if (state?.referenceImageId) {
    const selected = character.galleryImages.find((image) => image.id === state.referenceImageId);
    if (selected?.imageUrl) {
      return selected.imageUrl;
    }
  }

  const primaryFace = character.galleryImages.find(
    (image) =>
      image.isPrimaryReference &&
      (image.referenceRole === 'face' || image.referenceRole === 'portrait')
  );
  if (primaryFace?.imageUrl) {
    return primaryFace.imageUrl;
  }

  const primaryAny = character.galleryImages.find((image) => image.isPrimaryReference);
  if (primaryAny?.imageUrl) {
    return primaryAny.imageUrl;
  }

  return character.avatar || null;
}

function buildCharacterIdentityBlock(
  character: RoleplayCharacter,
  state: RoleplayVisualCharacterState | null,
  includeName: boolean
): string {
  const profile = character.visualProfile;
  const identity = joinParts([
    profile.permanentAnchor || character.appearancePrompt || character.description,
    state?.mood ? `mood: ${state.mood}` : '',
  ]);
  return includeName && identity ? `${character.name}: ${identity}` : identity;
}

function buildCharacterAttireBlock(
  character: RoleplayCharacter,
  state: RoleplayVisualCharacterState | null,
  includeName: boolean
): string {
  const profile = character.visualProfile;
  const attire = joinParts([
    state?.attire || profile.defaultAttire,
    state?.condition ? `condition: ${state.condition}` : '',
  ]);
  return includeName && attire ? `${character.name}: ${attire}` : attire;
}

function buildCharacterPoseBlock(
  character: RoleplayCharacter,
  state: RoleplayVisualCharacterState | null,
  includeName: boolean
): string {
  const poseCue = cleanPart(state?.poseCue);
  return includeName && poseCue ? `${character.name}: ${poseCue}` : poseCue;
}

function resolveScenePrompt(input: CompileRoleplayImagePromptInput): {
  prompt: string;
  source: CompiledRoleplayImagePrompt['debug']['scenePromptSource'];
} {
  const explicit = cleanPart(input.scenePrompt);
  if (explicit) {
    return {
      prompt: explicit,
      source: input.scenePromptSource ?? 'manual',
    };
  }

  const lastAssistantMessage = getLastAssistantMessage(input.session.messages);
  const suggestedScenePrompt = lastAssistantMessage
    ? cleanPart(getMessageSuggestedImagePrompt(lastAssistantMessage))
    : '';
  if (suggestedScenePrompt) {
    return {
      prompt: suggestedScenePrompt,
      source: 'suggested',
    };
  }

  const lastMessage = getLastMessageWithContent(input.session.messages);
  if (lastMessage) {
    return {
      prompt: cleanPart(getMessageContent(lastMessage)),
      source: 'message',
    };
  }

  const fallback = cleanPart(input.character.scenario || input.character.description);
  return {
    prompt: fallback,
    source: fallback ? 'fallback' : 'session',
  };
}

function getBaseNegativePrompt(formatPreset: PromptPresetKey): string {
  if (formatPreset === 'illustrious' || formatPreset === 'pony') {
    return ILLUSTRATION_BASE_NEGATIVE_PROMPT;
  }
  if (formatPreset === 'flux' || formatPreset === 'zimage') {
    return CINEMATIC_BASE_NEGATIVE_PROMPT;
  }
  return SD_BASE_NEGATIVE_PROMPT;
}

function buildCameraBlock(formatPreset: PromptPresetKey, multipleCharacters: boolean): string {
  if (formatPreset === 'flux' || formatPreset === 'zimage') {
    return joinSentences([
      multipleCharacters
        ? 'stage the cast clearly with readable separation and believable eyelines'
        : 'stage the subject clearly with readable body language',
      'use cinematic framing with coherent perspective and intentional depth',
      'keep lighting dramatic but physically plausible',
    ]);
  }
  return joinParts([
    multipleCharacters
      ? 'clear multi-character composition'
      : 'clear composition',
    'coherent spatial layout',
    'expressive body language',
    'detailed lighting',
    'camera-aware framing',
  ]);
}

function buildQualityBlock(formatPreset: PromptPresetKey, multipleCharacters: boolean): string {
  if (formatPreset === 'pony') {
    return joinParts([
      'score_9',
      'score_8_up',
      'score_7_up',
      'masterpiece',
      'best quality',
      'absurdres',
      multipleCharacters ? 'clear character separation' : 'strong character focus',
      'consistent character identity',
      'consistent outfit',
    ]);
  }
  if (formatPreset === 'illustrious') {
    return joinParts([
      'masterpiece',
      'best quality',
      'absurdres',
      'detailed face',
      'detailed eyes',
      multipleCharacters ? 'clear character separation' : 'strong character focus',
      'consistent character identity',
      'consistent outfit',
    ]);
  }
  if (formatPreset === 'flux' || formatPreset === 'zimage') {
    return joinSentences([
      'prioritize consistent character identity, wardrobe continuity, and believable anatomy',
      'preserve facial likeness, readable hands, and scene-level lighting coherence',
      multipleCharacters
        ? 'keep every character distinct and fully accounted for in frame'
        : 'keep the subject fully coherent from face to clothing',
    ]);
  }
  return joinParts([
    'high quality',
    'masterpiece',
    'detailed face',
    'detailed eyes',
    multipleCharacters ? 'clear character separation' : 'strong character focus',
    'consistent character identity',
    'consistent outfit',
  ]);
}

function buildContinuityNegativeBlock(
  formatPreset: PromptPresetKey,
  multipleCharacters: boolean
): string {
  const base = getBaseNegativePrompt(formatPreset);
  const extra = multipleCharacters
    ? 'merged characters, blended faces, swapped outfits, missing character, extra person, duplicated person, wrong character count'
    : 'outfit drift, prop drift, background mismatch, pose collapse';
  return `${base}, ${extra}`;
}

function collectReferenceImages(
  characters: RoleplayCharacter[],
  session: RoleplayChatSession
): RoleplayImageReferenceImage[] {
  const references: RoleplayImageReferenceImage[] = [];
  const seen = new Set<string>();

  for (const character of characters) {
    const state = getCharacterState(session, character);
    const referenceUrl = getCharacterReferenceImage(character, state);
    if (!referenceUrl || seen.has(referenceUrl)) {
      continue;
    }
    seen.add(referenceUrl);
    references.push({
      url: referenceUrl,
      label: `${character.name} reference`,
      source: 'character',
      characterId: character.id,
      characterName: character.name,
      role: state?.referenceImageId ? 'selected' : 'primary',
    });
  }

  const lastSceneReference = getLastMessageWithSceneImage(session.messages);
  const lastSceneReferenceUrl = lastSceneReference ? cleanPart(getMessageSceneImageUrl(lastSceneReference)) : '';
  if (lastSceneReferenceUrl && !seen.has(lastSceneReferenceUrl)) {
    references.push({
      url: lastSceneReferenceUrl,
      label: 'Previous generated scene',
      source: 'scene',
      characterId: null,
      characterName: null,
      role: 'scene',
    });
  }

  return references;
}

function buildSceneSummary(input: {
  session: RoleplayChatSession;
  visualState: RoleplaySessionVisualState;
  scenePrompt: string;
  characters: RoleplayCharacter[];
}): string {
  const { session, visualState, scenePrompt, characters } = input;
  const activeCharacterNames = characters.map((character) => character.name).join(', ');
  const pinnedFacts = dedupeList(
    session.memoryFacts.filter((fact) => fact.pinned).map((fact) => fact.text)
  ).slice(0, 3);
  const summaryParts = [
    activeCharacterNames ? `Cast: ${activeCharacterNames}` : '',
    scenePrompt ? `Beat: ${scenePrompt}` : '',
    visualState.location || session.continuity.currentLocation
      ? `Location: ${visualState.location || session.continuity.currentLocation}`
      : '',
    visualState.timeOfDay ? `Time: ${visualState.timeOfDay}` : '',
    visualState.lighting || session.ambiencePrompt
      ? `Lighting: ${visualState.lighting || session.ambiencePrompt}`
      : '',
    visualState.persistentObjects ? `Persistent objects: ${visualState.persistentObjects}` : '',
    session.continuity.currentSituation
      ? `Situation: ${session.continuity.currentSituation}`
      : '',
    pinnedFacts.length > 0 ? `Pinned continuity: ${pinnedFacts.join('; ')}` : '',
    session.continuity.openThreads.length > 0
      ? `Open threads: ${session.continuity.openThreads.slice(0, 3).join('; ')}`
      : '',
  ];
  return summaryParts.filter(Boolean).join('\n');
}

function buildContinuityPromptBlock(
  session: RoleplayChatSession,
  visualState: RoleplaySessionVisualState
): string {
  const pinnedFacts = dedupeList(
    session.memoryFacts.filter((fact) => fact.pinned).map((fact) => fact.text)
  ).slice(0, 4);
  return joinParts([
    session.continuity.currentSituation
      ? `current situation: ${session.continuity.currentSituation}`
      : '',
    session.continuity.currentLocation
      ? `continuity location: ${session.continuity.currentLocation}`
      : '',
    pinnedFacts.length > 0 ? `pinned continuity: ${pinnedFacts.join('; ')}` : '',
    session.continuity.openThreads.length > 0
      ? `unresolved threads: ${session.continuity.openThreads.slice(0, 3).join('; ')}`
      : '',
    session.conversationSummary
      ? `summary: ${cleanPart(session.conversationSummary).slice(0, 240)}`
      : '',
    visualState.persistentObjects
      ? `carry forward props and landmarks: ${visualState.persistentObjects}`
      : '',
  ]);
}

function formatPromptFromBlocks(
  blocks: RoleplayImagePromptBlock[],
  formatPreset: PromptPresetKey
): string {
  if (formatPreset === 'flux' || formatPreset === 'zimage') {
    return blocks
      .map((block) => cleanSentence(block.content))
      .filter(Boolean)
      .map((content) => `${content}.`)
      .join(' ');
  }
  return blocks.map((block) => block.content).join(', ');
}

function collectCharacterLoras(characters: RoleplayCharacter[]): {
  loras: string;
  loraweights: string;
} | null {
  const loraEntries = characters
    .filter((character) => cleanPart(character.characterLora).length > 0)
    .map((character) => ({
      lora: cleanPart(character.characterLora),
      weight: String(character.characterLoraWeight ?? 0.8),
    }));

  if (loraEntries.length === 0) {
    return null;
  }

  return {
    loras: loraEntries.map((entry) => entry.lora).join(','),
    loraweights: loraEntries.map((entry) => entry.weight).join(','),
  };
}

export function compileRoleplayImagePrompt(
  input: CompileRoleplayImagePromptInput
): CompiledRoleplayImagePrompt {
  const groupCharacters =
    input.groupCharacters && input.groupCharacters.length > 0
      ? input.groupCharacters
      : [input.character];
  const uniqueCharacters = groupCharacters.filter(
    (character, index, source) => source.findIndex((entry) => entry.id === character.id) === index
  );
  const multipleCharacters = uniqueCharacters.length > 1;
  const visualState = getSessionVisualState(input.session);
  const referenceImages = collectReferenceImages(uniqueCharacters, input.session);
  const referenceImageUrl = referenceImages[0]?.url ?? null;
  const recentSceneReference = referenceImages.find((reference) => reference.source === 'scene')?.url ?? null;
  const resolvedScenePrompt = resolveScenePrompt(input);
  const sceneSummary = buildSceneSummary({
    session: input.session,
    visualState,
    scenePrompt: resolvedScenePrompt.prompt,
    characters: uniqueCharacters,
  });
  const formatPreset = inferPromptPresetKey(input.model);
  const promptBlocks: RoleplayImagePromptBlock[] = [];
  const negativePromptBlocks: RoleplayImagePromptBlock[] = [];

  const styleAnchor = joinParts(uniqueCharacters.map((character) => character.visualProfile.styleAnchor));
  pushBlock(promptBlocks, 'style', 'Style Anchor', styleAnchor);

  for (const character of uniqueCharacters) {
    const state = getCharacterState(input.session, character);
    pushBlock(
      promptBlocks,
      'character',
      `${character.name} Visual Anchor`,
      buildCharacterIdentityBlock(character, state, multipleCharacters)
    );
    pushBlock(
      promptBlocks,
      'attire',
      `${character.name} Attire State`,
      buildCharacterAttireBlock(character, state, multipleCharacters)
    );
  }

  const sceneState = joinParts([
    visualState.sceneAnchor || input.session.sceneBackgroundPrompt,
    visualState.location ? `location: ${visualState.location}` : '',
    visualState.timeOfDay ? `time: ${visualState.timeOfDay}` : '',
    visualState.lighting || input.session.ambiencePrompt
      ? `lighting: ${visualState.lighting || input.session.ambiencePrompt}`
      : '',
    visualState.persistentObjects ? `persistent objects: ${visualState.persistentObjects}` : '',
  ]);
  pushBlock(promptBlocks, 'scene', 'Scene State', sceneState);
  pushBlock(
    promptBlocks,
    'scene',
    'Continuity Injection',
    buildContinuityPromptBlock(input.session, visualState)
  );
  pushBlock(promptBlocks, 'action', 'Current Scene Cue', resolvedScenePrompt.prompt);

  for (const character of uniqueCharacters) {
    const state = getCharacterState(input.session, character);
    pushBlock(
      promptBlocks,
      'action',
      `${character.name} Pose Cue`,
      buildCharacterPoseBlock(character, state, multipleCharacters)
    );
  }
  pushBlock(promptBlocks, 'action', 'Active Expression', input.session.activeExpression);
  pushBlock(promptBlocks, 'camera', 'Camera And Composition', buildCameraBlock(formatPreset, multipleCharacters));
  pushBlock(promptBlocks, 'quality', 'Quality Anchor', buildQualityBlock(formatPreset, multipleCharacters));

  for (const character of uniqueCharacters) {
    pushBlock(
      negativePromptBlocks,
      'negative',
      `${character.name} Negative Anchor`,
      character.visualProfile.negativeAnchor
    );
  }
  pushBlock(negativePromptBlocks, 'negative', 'Scene Negative', visualState.negativePrompt);
  pushBlock(
    negativePromptBlocks,
    'negative',
    'Continuity Negative',
    buildContinuityNegativeBlock(formatPreset, multipleCharacters)
  );

  const prompt = formatPromptFromBlocks(promptBlocks, formatPreset);
  const negativePrompt = negativePromptBlocks.map((block) => block.content).join(', ');
  const characterLoras = collectCharacterLoras(uniqueCharacters);
  const generateParams: Partial<GenerateParams> = {
    prompt,
    negativeprompt: negativePrompt,
    ...(input.model ? { model: input.model } : {}),
    width: input.width,
    height: input.height,
    images: 1,
    steps: input.steps,
    cfgscale: input.cfgscale,
    ...(input.clipstopatlayer !== null && input.clipstopatlayer !== undefined
      ? { clipstopatlayer: input.clipstopatlayer }
      : {}),
    ...(characterLoras ?? {}),
    ...(input.character.ipAdapterEnabled && referenceImageUrl
      ? {
          useipadapterforrevision: input.character.ipAdapterModel ?? 'faceid plus v2',
          ipadapterweight: input.character.ipAdapterWeight ?? 1,
          ipadapterstart: 0,
          ipadapterend: 1,
          ipadapterweighttype: 'standard',
          promptimages: referenceImageUrl,
        }
      : {}),
  };

  return {
    prompt,
    negativePrompt,
    sceneSummary,
    promptBlocks,
    negativePromptBlocks,
    generateParams,
    referenceImageUrl,
    referenceImages,
    debug: {
      characterIds: uniqueCharacters.map((character) => character.id),
      model: input.model ?? null,
      formatPreset,
      scenePromptSource: resolvedScenePrompt.source,
      enhancerEligible: prompt.length > 0,
      extensionPoints: {
        controlNetPoseReference: recentSceneReference,
        regionalMaskReferences: [],
        relightingReference: recentSceneReference,
      },
    },
  };
}
