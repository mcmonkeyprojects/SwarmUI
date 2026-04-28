export type RoleplayInteractionStyle = 'storyteller' | 'personal-chat';
export type RoleplayMemoryStatus = 'idle' | 'updating' | 'stale' | 'error';
export type RoleplayLorebookEntryMode = 'always-on' | 'keyword';
export type RoleplayLoreKeywordMode = 'plain' | 'regex';
export type RoleplayLoreActivationLogic = 'any' | 'all';
export type RoleplayLoreInsertionPosition = 'before-history' | 'after-history';
export type RoleplayCharacterSourceFormat = 'native' | 'catalog' | 'swarm-bundle' | 'tavern-v1' | 'tavern-v2';

export interface RoleplayModelCompatibilitySettings {
  forceFinalUserTurn: boolean;
  inlineSystemPrompt: boolean;
}

export interface RoleplayMemoryFact {
  id: string;
  text: string;
  pinned: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface RoleplayContinuityState {
  relationshipSummary: string;
  currentLocation: string;
  currentSituation: string;
  openThreads: string[];
}

export interface RoleplayPersonalityProfile {
  coreTraits: string;
  speakingStyle: string;
  emotionalTone: string;
  boundaries: string;
  motivations: string;
  relationshipToUser: string;
  quirks: string;
}

export interface RoleplayMemoryState {
  conversationSummary: string;
  continuity: RoleplayContinuityState;
  memoryFacts: RoleplayMemoryFact[];
  memoryStatus: RoleplayMemoryStatus;
  messagesSinceMemoryRefresh: number;
  lastMemoryUpdatedAt: number | null;
  lastVisitedAt: number | null;
}

export interface RoleplayPromptStack {
  mainPromptOverride: string;
  authorNote: string;
  postHistoryNote: string;
  includePersona: boolean;
  includeCharacterDefinition: boolean;
  includeScenario: boolean;
  includeExampleMessages: boolean;
  includeMemory: boolean;
  includeLore: boolean;
}

export interface RoleplayLorebookEntry {
  id: string;
  title: string;
  content: string;
  keywords: string[];
  secondaryKeywords: string[];
  mode: RoleplayLorebookEntryMode;
  keywordMode: RoleplayLoreKeywordMode;
  activationLogic: RoleplayLoreActivationLogic;
  selective: boolean;
  caseSensitive: boolean;
  scanDepth: number;
  insertionOrder: number;
  insertionPosition: RoleplayLoreInsertionPosition;
  tokenBudget: number | null;
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface RoleplayLorebook {
  id: string;
  name: string;
  description: string;
  entries: RoleplayLorebookEntry[];
  createdAt: number;
  updatedAt: number;
}

export interface RoleplayPersona {
  id: string;
  name: string;
  description: string;
  notes: string;
  avatar: string | null;
  tags: string[];
  boundLorebookIds: string[];
  createdAt: number;
  updatedAt: number;
}

export interface RoleplayCharacter {
  id: string;
  name: string;
  favorite: boolean;
  creator: string;
  characterVersion: string;
  sourceFormat: RoleplayCharacterSourceFormat;
  sourceUrl: string;
  catalogTemplateId: string | null;
  catalogCategory: string | null;
  cardExtensions: Record<string, unknown> | null;
  avatar: string | null;
  interactionStyle: RoleplayInteractionStyle;
  /** Visual description for consistent image generation: hair, eyes, clothing, art style, etc. */
  appearancePrompt: string | null;
  imageModelId: string | null;
  personalityProfile: RoleplayPersonalityProfile;
  personality: string;
  systemPrompt: string;
  chatSystemPrompt: string;
  roleplaySystemPrompt: string;
  openingChatMessage: string;
  openingRoleplayMessage: string;
  alternateGreetings: string[];
  sceneSuggestionPrompt: string | null;
  description: string;
  scenario: string;
  exampleMessages: string;
  tags: string[];
  creatorNotes: string;
  boundLorebookIds: string[];
  /**
   * Optional LoRA model name for character consistency.
   * Passed as the `loras` SwarmUI param when generating scenes/portraits.
   * Example: "my_character_v1.safetensors"
   */
  characterLora: string | null;
  /** LoRA weight, 0.0–1.5. Defaults to 0.8. */
  characterLoraWeight: number;
  /**
   * Whether to use IP-Adapter FaceID for character face consistency in generated scenes.
   * Requires: (1) a portrait/avatar set on this character, (2) ComfyUI with the
   * ComfyUI-IPAdapter-plus node pack and ip-adapter-faceid-plusv2_sdxl model installed.
   * When enabled, the character avatar is sent as `promptimages` and SwarmUI's built-in
   * IP-Adapter workflow step handles the face embedding — no LoRA required.
   */
  ipAdapterEnabled: boolean;
  /**
   * IP-Adapter FaceID model preset.
   * "faceid plus v2" is recommended for SDXL. "faceid" for SD1.5.
   * Full list: "faceid" | "faceid plus v2" | "faceid portrait"
   */
  ipAdapterModel: string;
  /** IP-Adapter face identity weight. Range 0.5–1.5, default 1.0.
   *  Lower = more scene freedom, higher = stricter face match. */
  ipAdapterWeight: number;
  conversationSummary: string;
  continuity: RoleplayContinuityState;
  memoryFacts: RoleplayMemoryFact[];
  memoryStatus: RoleplayMemoryStatus;
  messagesSinceMemoryRefresh: number;
  lastMemoryUpdatedAt: number | null;
  lastVisitedAt: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface ChatMessageVariant {
  id: string;
  content: string;
  timestamp: number;
  sceneImageUrl: string | null;
  suggestedImagePrompt: string | null;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  includedInPrompt: boolean;
  variants: ChatMessageVariant[];
  activeVariantId: string | null;
  timestamp: number;
  sceneImageUrl: string | null;
  /**
   * Scene prompt extracted from a [SCENE: ...] tag in the AI's response.
   * Present until the suggestion is dismissed or a scene image is generated.
   */
  suggestedImagePrompt: string | null;
}

export interface RoleplayChatSession extends RoleplayMemoryState {
  id: string;
  characterId: string;
  title: string;
  activePersonaId: string | null;
  boundLorebookIds: string[];
  promptStack: RoleplayPromptStack;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
}

export interface ActivatedRoleplayLoreEntry {
  lorebookId: string;
  lorebookName: string;
  entryId: string;
  entryTitle: string;
  content: string;
  mode: RoleplayLorebookEntryMode;
  insertionOrder: number;
  insertionPosition: RoleplayLoreInsertionPosition;
  tokenEstimate: number;
}

export interface CompiledRoleplayPromptSegment {
  key: string;
  label: string;
  content: string;
}

export interface CompiledRoleplayPrompt {
  systemPrompt: string;
  segments: CompiledRoleplayPromptSegment[];
  historyMessages: Array<{ role: 'user' | 'assistant'; content: string }>;
  apiMessages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  activatedLoreEntries: ActivatedRoleplayLoreEntry[];
  tokenEstimate: number;
}

export type RoleplayConnectionState = 'idle' | 'connecting' | 'connected' | 'error';

export interface RoleplayCatalogTemplate {
  id: string;
  name: string;
  category: string;
  tags: string[];
  shortDescription: string;
  description: string;
  personality: string;
  personalityProfile: RoleplayPersonalityProfile;
  systemPrompt: string;
  chatSystemPrompt: string;
  roleplaySystemPrompt: string;
  openingChatMessage: string;
  openingRoleplayMessage: string;
  alternateGreetings: string[];
  scenario: string;
  exampleMessages: string;
  creatorNotes: string;
  appearancePrompt: string;
  thumbnail: string;
  lorebook?: {
    name: string;
    description: string;
    entries: Array<{
      title: string;
      content: string;
      keywords: string[];
    }>;
  };
}
