export type RoleplayInteractionStyle = 'storyteller' | 'personal-chat';
export type RoleplayMemoryStatus = 'idle' | 'updating' | 'stale' | 'error';
export type RoleplayLorebookEntryMode = 'always-on' | 'keyword';
export type RoleplayLoreKeywordMode = 'plain' | 'regex';
export type RoleplayLoreActivationLogic = 'any' | 'all';
export type RoleplayLoreInsertionPosition = 'before-history' | 'after-history' | 'in-history';
export type RoleplayCharacterSourceFormat = 'native' | 'catalog' | 'swarm-bundle' | 'tavern-v1' | 'tavern-v2';
export type RoleplayCharacterImportMode = 'create' | 'replace' | 'duplicate';
export type RoleplayChatProvider = 'local' | 'openrouter' | 'openai-compatible';
export type RoleplayPromptBudgetMode = 'full' | 'compact' | 'micro';
export type RoleplayKnowledgeScope = 'global' | 'character' | 'persona' | 'session';

export interface RoleplayScriptVariable {
  name: string;
  value: string;
  updatedAt: number;
}

export interface RoleplayCharacterSourceMetadata {
  sourceUrl?: string;
  sourceDownloadUrl?: string;
  sourceProviderId?: string;
  sourceExternalId?: string;
  sourceImportedAt?: number;
  sourceLastCheckedAt?: number;
  sourceLicense?: string;
  sourceContentRating?: string;
}

export interface RoleplayModelCompatibilitySettings {
  forceFinalUserTurn: boolean;
  inlineSystemPrompt: boolean;
  localProfileId?: string;
  maxContextTokens?: number;
  memoryBudgetMode?: RoleplayPromptBudgetMode;
  loreEntryLimit?: number;
  maxHistoryMessages?: number;
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

export interface RoleplayCharacterVisualProfile {
  permanentAnchor: string;
  defaultAttire: string;
  styleAnchor: string;
  negativeAnchor: string;
}

export interface RoleplayVisualCharacterState {
  attire: string;
  condition: string;
  mood: string;
  poseCue: string;
  referenceImageId: string | null;
}

export interface RoleplaySessionVisualState {
  location: string;
  timeOfDay: string;
  lighting: string;
  sceneAnchor: string;
  persistentObjects: string;
  negativePrompt: string;
  characterStates: Record<string, RoleplayVisualCharacterState>;
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
  roleplayPresetId: string;
  mainPromptOverride: string;
  authorNote: string;
  postHistoryNote: string;
  includePersona: boolean;
  includeCharacterDefinition: boolean;
  includeScenario: boolean;
  includeExampleMessages: boolean;
  includeMemory: boolean;
  includeLore: boolean;
  promptBlockSettings: Record<string, RoleplayPromptBlockSettings>;
  promptBlockSettingsByPresetId: Record<string, Record<string, RoleplayPromptBlockSettings>>;
}

export interface RoleplayPromptInjection {
  id: string;
  label: string;
  content: string;
  role: RoleplayPromptBlockRole;
  position: RoleplayPromptBlockPosition;
  depth: number | null;
  order: number;
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface RoleplayQuickReply {
  id: string;
  label: string;
  script: string;
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface RoleplayScriptTraceEntry {
  id: string;
  timestamp: number;
  source: 'slash' | 'quick-reply' | 'hook';
  label: string;
  input: string;
  status: 'success' | 'error';
  message: string;
  commandCount: number;
}

export interface RoleplayKnowledgeChunk {
  id: string;
  documentId: string;
  index: number;
  title: string;
  content: string;
  tokenEstimate: number;
  embedding?: number[] | null;
  embeddingModel?: string | null;
  updatedAt: number;
}

export interface RoleplayKnowledgeDocument {
  id: string;
  title: string;
  description: string;
  scope: RoleplayKnowledgeScope;
  characterId: string | null;
  personaId: string | null;
  sessionId: string | null;
  sourceType: 'note' | 'text-file' | 'chat-history' | 'external';
  content: string;
  chunks: RoleplayKnowledgeChunk[];
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface RoleplayRetrievedKnowledgeChunk {
  documentId: string;
  documentTitle: string;
  chunkId: string;
  chunkTitle: string;
  scope: RoleplayKnowledgeScope;
  score: number;
  reason: string;
  retrievalMode: 'vector' | 'lexical';
  content: string;
  tokenEstimate: number;
}

export interface RoleplayLorebookEntry {
  id: string;
  title: string;
  content: string;
  keywords: string[];
  secondaryKeywords: string[];
  negativeKeywords: string[];
  mode: RoleplayLorebookEntryMode;
  keywordMode: RoleplayLoreKeywordMode;
  activationLogic: RoleplayLoreActivationLogic;
  selective: boolean;
  caseSensitive: boolean;
  scanDepth: number;
  insertionOrder: number;
  insertionPosition: RoleplayLoreInsertionPosition;
  insertionDepth: number;
  tokenBudget: number | null;
  recursive: boolean;
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface RoleplayLorebook {
  id: string;
  name: string;
  description: string;
  global: boolean;
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

export interface RoleplayCharacterExpressionSprite {
  id: string;
  label: string;
  prompt: string;
  imageUrl: string | null;
}

export type RoleplayCharacterGalleryImageSource = 'portrait' | 'scene' | 'upload' | 'import';
export type RoleplayCharacterGalleryReferenceRole =
  | 'portrait'
  | 'face'
  | 'body'
  | 'outfit'
  | 'expression'
  | 'scene'
  | 'other';

export interface RoleplayCharacterGalleryImage {
  id: string;
  imageUrl: string;
  source: RoleplayCharacterGalleryImageSource;
  referenceRole?: RoleplayCharacterGalleryReferenceRole | null;
  isPrimaryReference?: boolean;
  prompt: string;
  negativePrompt?: string | null;
  sessionId: string | null;
  messageId: string | null;
  createdAt: number;
}

export interface RoleplayCharacter {
  id: string;
  name: string;
  favorite: boolean;
  creator: string;
  characterVersion: string;
  sourceFormat: RoleplayCharacterSourceFormat;
  sourceUrl: string;
  sourceDownloadUrl: string;
  sourceProviderId: string;
  sourceExternalId: string;
  sourceImportedAt: number | null;
  sourceLastCheckedAt: number | null;
  sourceLicense: string;
  sourceContentRating: string;
  catalogTemplateId: string | null;
  catalogCategory: string | null;
  cardExtensions: Record<string, unknown> | null;
  avatar: string | null;
  /** Square headshot for avatar display (circular icons). Generated automatically with portrait. */
  headshotUrl: string | null;
  interactionStyle: RoleplayInteractionStyle;
  /** Visual description for consistent image generation: hair, eyes, clothing, art style, etc. */
  appearancePrompt: string | null;
  visualProfile: RoleplayCharacterVisualProfile;
  expressionSprites: RoleplayCharacterExpressionSprite[];
  galleryImages: RoleplayCharacterGalleryImage[];
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
  postHistoryInstructions: string;
  characterNote: string;
  characterNoteRole: RoleplayPromptBlockRole;
  characterNoteDepth: number | null;
  tavernV2Data: Record<string, unknown> | null;
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

export interface RoleplayChatBranch {
  id: string;
  name: string;
  parentBranchId: string | null;
  forkMessageId: string | null;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
}

export interface RoleplayChatCheckpoint {
  id: string;
  name: string;
  branchId: string;
  forkMessageId: string | null;
  messages: ChatMessage[];
  memoryState: RoleplayMemoryState;
  createdAt: number;
}

export interface RoleplayChatSession extends RoleplayMemoryState {
  id: string;
  characterId: string;
  title: string;
  activePersonaId: string | null;
  participantCharacterIds: string[];
  activeSpeakerCharacterId: string | null;
  sceneBackgroundPrompt: string;
  ambiencePrompt: string;
  activeExpression: string;
  visualState: RoleplaySessionVisualState;
  chatBackgroundImage: string | null;
  boundLorebookIds: string[];
  promptStack: RoleplayPromptStack;
  scriptVariables: Record<string, RoleplayScriptVariable>;
  promptInjections: RoleplayPromptInjection[];
  messages: ChatMessage[];
  activeBranchId: string;
  branches: RoleplayChatBranch[];
  checkpoints: RoleplayChatCheckpoint[];
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
  insertionDepth: number;
  tokenEstimate: number;
}

export interface RoleplayLoreActivationDebugEntry {
  lorebookId: string;
  lorebookName: string;
  entryId: string;
  entryTitle: string;
  includedLorebook: boolean;
  enabled: boolean;
  activated: boolean;
  reason: string;
  matchedKeywords: string[];
  matchedSecondaryKeywords: string[];
  matchedNegativeKeywords: string[];
  scanDepth: number;
  recursivePass: number;
}

export type RoleplayGenerationMode =
  | 'normal'
  | 'swipe'
  | 'regenerate'
  | 'continue'
  | 'impersonate'
  | 'quiet';
export type RoleplayPromptBlockRole = 'system' | 'user' | 'assistant';
export type RoleplayPromptBlockPosition = 'before-history' | 'after-history' | 'in-history';

export interface RoleplayPromptBlock {
  id: string;
  label: string;
  role: RoleplayPromptBlockRole;
  content: string;
  enabled: boolean;
  order: number;
  position: RoleplayPromptBlockPosition;
  depth: number | null;
  triggerModes: RoleplayGenerationMode[];
  tokenBudget: number | null;
  tokenEstimate: number;
  source: 'main' | 'preset' | 'character' | 'persona' | 'memory' | 'retrieval' | 'lore' | 'note' | 'mode' | 'script';
}

export interface RoleplayPromptBlockSettings {
  enabled?: boolean;
  order?: number;
  role?: RoleplayPromptBlockRole;
  position?: RoleplayPromptBlockPosition;
  depth?: number | null;
  triggerModes?: RoleplayGenerationMode[];
  tokenBudget?: number | null;
}

export interface RoleplayContextBudgetReport {
  maxContextTokens: number;
  reservedResponseTokens: number;
  availableInputTokens: number;
  promptBlockTokens: number;
  historyBudgetTokens: number;
  historyTokens: number;
  totalHistoryMessages: number;
  includedHistoryMessages: number;
  droppedHistoryMessages: number;
  truncatedHistoryMessages: number;
}

export interface RoleplayPromptDiagnostics {
  promptBudgetMode: RoleplayPromptBudgetMode;
  memoryTokens: number;
  loreTokens: number;
  activatedLoreEntries: number;
  includedLoreEntries: number;
  droppedLoreEntries: number;
  loreEntryLimit: number | null;
  retrievedKnowledgeEntries: number;
  retrievedKnowledgeTokens: number;
  retrievedKnowledgeVectorEntries: number;
  promptPressure: number;
  warnings: string[];
}

export interface RoleplayPromptBlockTrace {
  blockId: string;
  label: string;
  included: boolean;
  reason: string;
}

export interface RoleplayApiMessageTrace {
  role: 'system' | 'user' | 'assistant';
  content: string;
  sourceBlockIds: string[];
}

export interface RoleplayHistoryBudgetTrace {
  originalIndex: number;
  role: 'user' | 'assistant';
  originalContent: string;
  finalContent: string | null;
  tokenEstimate: number;
  included: boolean;
  truncated: boolean;
  reason: string;
}

export interface CompiledRoleplayPromptSegment {
  key: string;
  label: string;
  content: string;
  role?: RoleplayPromptBlockRole;
  position?: RoleplayPromptBlockPosition;
  depth?: number | null;
  tokenEstimate?: number;
}

export interface CompiledRoleplayPrompt {
  systemPrompt: string;
  promptBlocks: RoleplayPromptBlock[];
  generationMode: RoleplayGenerationMode;
  contextBudget: RoleplayContextBudgetReport;
  blockTraces: RoleplayPromptBlockTrace[];
  apiMessageTraces: RoleplayApiMessageTrace[];
  loreScanSource: string;
  historyBudgetTrace: RoleplayHistoryBudgetTrace[];
  segments: CompiledRoleplayPromptSegment[];
  historyMessages: Array<{ role: 'user' | 'assistant'; content: string }>;
  apiMessages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  activatedLoreEntries: ActivatedRoleplayLoreEntry[];
  loreActivationDebug: RoleplayLoreActivationDebugEntry[];
  retrievedKnowledgeEntries: RoleplayRetrievedKnowledgeChunk[];
  diagnostics: RoleplayPromptDiagnostics;
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
