import {
  PRESET_PROMPT_SECTION_ORDER,
  type PresetCategory,
  type PresetPromptSection,
  parseWeightedWord,
  formatWeightedWord,
} from './types';
import type { PresetCartState } from './staging';

interface TokenNode {
  originalWord: string;
  resolvedWord: string;
  cleanWord: string;
  baseWeight: number;
  effectiveWeight: number;
  category: PresetCategory;
  contributors: string[];
}

export interface PresetCompilerTraceToken {
  originalWord: string;
  resolvedWord: string;
  cleanWord: string;
  category: PresetCategory;
  baseWeight: number;
  effectiveWeight: number;
  contributors: string[];
}

export interface PresetCompilerTraceSegment {
  part: string;
  reasonWords: string[];
  prompt: string;
}

export interface PresetCompilerTrace {
  tokens: PresetCompilerTraceToken[];
  mergedTokens: PresetCompilerTraceToken[];
  removedTokens: Array<{
    word: string;
    reason: string;
    keptWord: string;
  }>;
  segments: PresetCompilerTraceSegment[];
  assembledSceneText?: string;
}

export interface PresetCompilerOptions {
  autoSegments?: boolean;
  sfwMode?: boolean;
}

export interface PresetCompilerResult {
  sections: PresetPromptSection[];
  trace: PresetCompilerTrace;
}

interface SceneAssemblyResult {
  text: string;
  segments: PresetCompilerTraceSegment[];
}

/**
 * Resolves curly-brace variable placeholders in a tag using the active staged variables.
 */
function resolveWordVariables(
  word: string,
  presetId: string | undefined,
  stagedVariables: Record<string, Record<string, string>>
): string {
  if (!presetId) {
    return word;
  }
  const presetVars = stagedVariables[presetId] ?? {};
  return word.replace(/\{([^}]+)\}/g, (match, varName) => {
    const trimmedVarName = varName.trim();
    return presetVars[trimmedVarName] ?? match;
  });
}

/**
 * Normalizes a word by converting to lowercase and compacting internal whitespace for key matches.
 */
function normalizeWordKey(word: string): string {
  return word.toLowerCase().trim().replace(/\s+/g, ' ');
}

/**
 * Checks if wordA is a simpler semantic subsequence of wordB.
 * E.g., "beautiful face" is a subsequence of "gorgeous detailed beautiful face".
 */
function isSemanticSubset(wordA: string, wordB: string): boolean {
  const normA = normalizeWordKey(wordA);
  const normB = normalizeWordKey(wordB);

  if (normA === normB) {
    return true;
  }

  const partsA = normA.split(/\s+/);
  const partsB = normB.split(/\s+/);

  if (partsA.length >= partsB.length) {
    return false;
  }

  let indexB = 0;
  let matches = 0;

  for (const partA of partsA) {
    const foundIndex = partsB.indexOf(partA, indexB);
    if (foundIndex !== -1) {
      matches++;
      indexB = foundIndex + 1;
    }
  }

  return matches === partsA.length;
}

/**
 * Damps and normalizes cumulative weights using a logarithmic curve to prevent contrast blowout.
 * Formula: 1.0 + tanh(sum(weight_i - 1.0))
 * Capped strictly at 1.45.
 */
function mergeWeights(weights: number[]): number {
  if (weights.length === 0) {
    return 1.0;
  }
  if (weights.length === 1) {
    return weights[0];
  }

  const sumExcess = weights.reduce((sum, w) => sum + (w - 1.0), 0);
  const damped = 1.0 + Math.tanh(sumExcess);
  // Cap at 1.45 and round to 2 decimal places
  return Math.max(0.1, Math.min(1.45, Number(damped.toFixed(2))));
}

function traceToken(node: TokenNode): PresetCompilerTraceToken {
  return {
    originalWord: node.originalWord,
    resolvedWord: node.resolvedWord,
    cleanWord: node.cleanWord,
    category: node.category,
    baseWeight: node.baseWeight,
    effectiveWeight: node.effectiveWeight,
    contributors: [...node.contributors],
  };
}

function tokenMatchesKeyword(token: string, keyword: string): boolean {
  return token == keyword || token == `${keyword}s` || `${token}s` == keyword;
}

function nodeMatchesKeyword(node: TokenNode, keywords: string[]): boolean {
  const tokens = node.cleanWord.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  return keywords.some((keyword) => tokens.some((token) => tokenMatchesKeyword(token, keyword)));
}

function formatNodeAsTag(node: TokenNode): string {
  return formatWeightedWord(node.cleanWord, node.effectiveWeight);
}

function normalizeFormattedTagKey(tag: string): string {
  return normalizeWordKey(parseWeightedWord(tag).baseWord);
}

function dedupeFormattedTags(tags: string[]): string[] {
  const seen = new Set<string>();
  const deduped: string[] = [];

  for (const tag of tags) {
    const trimmedTag = tag.trim();
    const key = normalizeFormattedTagKey(trimmedTag);
    if (!key || seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduped.push(trimmedTag);
  }

  return deduped;
}

function formatPromptTags(tags: string[]): string {
  return dedupeFormattedTags(tags).join(', ');
}

function appendNodeTags(tags: string[], nodes: TokenNode[]): void {
  for (const node of nodes) {
    tags.push(formatNodeAsTag(node));
  }
}

function compactedNodeCoversOriginal(compactedNode: TokenNode, originalNode: TokenNode): boolean {
  const compactedKey = normalizeWordKey(compactedNode.cleanWord);
  const originalKey = normalizeWordKey(originalNode.cleanWord);
  return (
    compactedKey == originalKey ||
    compactedKey.endsWith(` ${originalKey}`) ||
    originalKey.endsWith(` ${compactedKey}`) ||
    isSemanticSubset(originalKey, compactedKey)
  );
}

function restoreCompactedNodeOrder(
  originalNodes: TokenNode[],
  remainingNodes: TokenNode[],
  compactedNodes: TokenNode[]
): TokenNode[] {
  const remainingSet = new Set(remainingNodes);
  const usedCompactedNodes = new Set<TokenNode>();
  const orderedNodes: TokenNode[] = [];

  for (const originalNode of originalNodes) {
    if (remainingSet.has(originalNode)) {
      orderedNodes.push(originalNode);
      continue;
    }

    const replacementNode = compactedNodes.find(
      (compactedNode) =>
        !usedCompactedNodes.has(compactedNode) &&
        compactedNodeCoversOriginal(compactedNode, originalNode)
    );
    if (replacementNode) {
      orderedNodes.push(replacementNode);
      usedCompactedNodes.add(replacementNode);
    }
  }

  for (const compactedNode of compactedNodes) {
    if (!usedCompactedNodes.has(compactedNode)) {
      orderedNodes.push(compactedNode);
    }
  }

  return orderedNodes;
}

function formatJoinedList(items: string[], finalJoiner = 'and'): string {
  if (items.length == 0) {
    return '';
  }
  if (items.length == 1) {
    return items[0];
  }
  if (items.length == 2) {
    return `${items[0]} ${finalJoiner} ${items[1]}`;
  }

  const leadingItems = items.slice(0, -1);
  const lastItem = items[items.length - 1];
  return `${leadingItems.join(', ')}, ${finalJoiner} ${lastItem}`;
}

function formatNodeList(nodes: TokenNode[], finalJoiner = 'and'): string {
  return formatJoinedList(nodes.map((node) => formatNodeAsTag(node)), finalJoiner);
}

/**
 * Grammatical classifications for Adjective-Noun modifier sorting.
 */
const HAIR_LENGTHS = new Set(['long', 'short', 'shoulder-length', 'medium-length', 'very long', 'very short', 'cropped', 'shaved', 'bald']);
const HAIR_TEXTURES = new Set(['curly', 'straight', 'wavy', 'messy', 'braided', 'fluffy', 'spiky', 'shaggy', 'frizzy', 'slicked-back', 'ponytail', 'pigtails']);
const HAIR_COLORS = new Set(['blonde', 'black', 'brown', 'red', 'platinum blonde', 'silver', 'white', 'pink', 'blue', 'green', 'purple', 'orange', 'auburn', 'golden', 'dyed']);

const EYE_EXPRESSIONS = new Set(['big', 'large', 'beautiful', 'detailed', 'glowing', 'sparkling', 'expressive', 'piercing', 'wide', 'seductive', 'sensual', 'narrow']);
const EYE_COLORS = new Set(['blue', 'green', 'brown', 'amber', 'red', 'purple', 'pink', 'hazel', 'gold', 'yellow']);

const LIP_TEXTURES = new Set(['soft', 'glossy', 'plump', 'full', 'pouting', 'moist']);
const LIP_COLORS = new Set(['red', 'pink', 'cherry', 'peach', 'dark']);

const TARGET_NOUNS = ['hair', 'eyes', 'skin', 'lips', 'breasts', 'boobs', 'bust', 'body', 'figure'];

/**
 * Sorts adjectives modifying a specific noun according to grammatical categories.
 */
function sortModifiers(noun: string, adjectives: string[]): string[] {
  const normNoun = noun.toLowerCase();

  if (normNoun == 'hair') {
    const lengths: string[] = [];
    const textures: string[] = [];
    const colors: string[] = [];
    const others: string[] = [];

    for (const adj of adjectives) {
      const lower = adj.toLowerCase();
      if (HAIR_LENGTHS.has(lower)) {
        lengths.push(adj);
      }
      else if (HAIR_TEXTURES.has(lower)) {
        textures.push(adj);
      }
      else if (HAIR_COLORS.has(lower)) {
        colors.push(adj);
      }
      else {
        others.push(adj);
      }
    }
    return [...lengths, ...textures, ...colors, ...others];
  }

  if (normNoun == 'eyes') {
    const expressions: string[] = [];
    const colors: string[] = [];
    const others: string[] = [];

    for (const adj of adjectives) {
      const lower = adj.toLowerCase();
      if (EYE_EXPRESSIONS.has(lower)) {
        expressions.push(adj);
      }
      else if (EYE_COLORS.has(lower)) {
        colors.push(adj);
      }
      else {
        others.push(adj);
      }
    }
    return [...expressions, ...colors, ...others];
  }

  if (normNoun == 'lips') {
    const textures: string[] = [];
    const colors: string[] = [];
    const others: string[] = [];

    for (const adj of adjectives) {
      const lower = adj.toLowerCase();
      if (LIP_TEXTURES.has(lower)) {
        textures.push(adj);
      }
      else if (LIP_COLORS.has(lower)) {
        colors.push(adj);
      }
      else {
        others.push(adj);
      }
    }
    return [...textures, ...colors, ...others];
  }

  return adjectives;
}

/**
 * Extracts adjective-modifier phrases sharing common nouns and groups/sorts them.
 */
function extractAndCompactNounPhrases(nodes: TokenNode[]): {
  compacted: TokenNode[];
  remaining: TokenNode[];
} {
  const compactedNodes: TokenNode[] = [];
  const remainingNodes: TokenNode[] = [...nodes];

  const nounGroups = new Map<string, {
    modifiers: Set<string>;
    weights: number[];
    contributors: string[];
    originalCategory: PresetCategory;
  }>();

  for (const noun of TARGET_NOUNS) {
    const matchingNodes = remainingNodes.filter((node) => {
      const cleanLower = node.cleanWord.toLowerCase();
      return cleanLower.endsWith(' ' + noun);
    });

    if (matchingNodes.length == 0) {
      continue;
    }

    const group = {
      modifiers: new Set<string>(),
      weights: [] as number[],
      contributors: [] as string[],
      originalCategory: 'characters' as PresetCategory,
    };

    for (const node of matchingNodes) {
      const cleanLower = node.cleanWord.toLowerCase();
      const lastIdx = cleanLower.lastIndexOf(' ' + noun);
      const mod = node.cleanWord.slice(0, lastIdx).trim();
      if (mod) {
        group.modifiers.add(mod);
      }
      group.weights.push(node.effectiveWeight);
      group.contributors.push(...node.contributors);
      group.originalCategory = node.category;

      const idx = remainingNodes.indexOf(node);
      if (idx !== -1) {
        remainingNodes.splice(idx, 1);
      }
    }

    const baselineNounNode = remainingNodes.find(
      (node) => node.cleanWord.toLowerCase() == noun
    );
    if (baselineNounNode) {
      group.weights.push(baselineNounNode.effectiveWeight);
      group.contributors.push(...baselineNounNode.contributors);
      group.originalCategory = baselineNounNode.category;
      const idx = remainingNodes.indexOf(baselineNounNode);
      if (idx !== -1) {
        remainingNodes.splice(idx, 1);
      }
    }

    nounGroups.set(noun, group);
  }

  for (const [noun, group] of nounGroups.entries()) {
    if (group.modifiers.size == 0) {
      compactedNodes.push({
        originalWord: noun,
        resolvedWord: noun,
        cleanWord: noun,
        baseWeight: 1.0,
        effectiveWeight: mergeWeights(group.weights),
        category: group.originalCategory,
        contributors: Array.from(new Set(group.contributors)),
      });
      continue;
    }

    const sortedMods = sortModifiers(noun, Array.from(group.modifiers));
    const compiledWord = sortedMods.join(' ') + ' ' + noun;

    compactedNodes.push({
      originalWord: compiledWord,
      resolvedWord: compiledWord,
      cleanWord: compiledWord,
      baseWeight: 1.0,
      effectiveWeight: mergeWeights(group.weights),
      category: group.originalCategory,
      contributors: Array.from(new Set(group.contributors)),
    });
  }

  return {
    compacted: compactedNodes,
    remaining: remainingNodes,
  };
}

const FACE_KEYWORDS = [
  'eye', 'facial', 'facial-features', 'lip', 'mouth', 'face', 'expression',
  'makeup', 'blush', 'nose', 'cheek', 'pout', 'smile', 'ear', 'eyelash',
  'eyebrow', 'head', 'look', 'gaze', 'teeth', 'tongue', 'freckles', 'beauty',
  'beard', 'mustache', 'haircut', 'frown', 'grin', 'hair'
];
const HANDS_KEYWORDS = ['hand', 'finger', 'nail', 'wrist', 'palm', 'fist', 'glove'];
const BREASTS_KEYWORDS = ['breast', 'breasts', 'boob', 'boobs', 'cleavage', 'nipple', 'nipples', 'bust', 'chest'];
const VULVA_KEYWORDS = ['vulva', 'pussy', 'vagina', 'cunt', 'clitoris', 'crotch', 'groin', 'pubic'];
const PENIS_KEYWORDS = ['penis', 'cock', 'dick', 'shaft', 'phallus', 'erection'];
const BUTT_KEYWORDS = ['butt', 'ass', 'booty', 'buttocks', 'anus', 'glute', 'asshole'];

const GENERAL_BODY_CLOTHING_KEYWORDS = [
  'body', 'hourglass', 'hip', 'hips', 'waist', 'pelvic', 'thigh', 'thighs',
  'legs', 'feet', 'foot', 'silhouette', 'posture', 'standing', 'nude', 'naked',
  'outfit', 'wearing', 'dress', 'jacket', 'skirt', 'coat', 'pants', 'stockings',
  'suit', 'clothed', 'underwear', 'lingerie', 'bra', 'panties'
];

function extractSegmentDetails(
  nodes: TokenNode[],
  includeKeywords: string[],
  excludeKeywords: string[],
  defaultDetails: string[]
): string[] {
  let detailsList: string[] = [];
  for (const n of nodes) {
    const hasInclude = nodeMatchesKeyword(n, includeKeywords);
    if (hasInclude) {
      const hasExclude = nodeMatchesKeyword(n, excludeKeywords);
      if (!hasExclude && n.cleanWord.length < 60) {
        detailsList.push(formatNodeAsTag(n));
      }
    }
  }
  detailsList = dedupeFormattedTags(detailsList);
  if (detailsList.length === 0) {
    detailsList = defaultDetails;
  }
  return detailsList;
}

interface RedundantTagRule {
  categories: PresetCategory[];
  weaker: string[];
  stronger: string[];
  reason: string;
}

const REDUNDANT_TAG_RULES: RedundantTagRule[] = [
  {
    categories: ['quality'],
    weaker: ['8k quality', '8k resolution', 'high definition'],
    stronger: ['absurdres', 'highres'],
    reason: 'illustrious-resolution-overlap',
  },
  {
    categories: ['quality'],
    weaker: ['ultra detailed', 'refined detail', 'intricate details'],
    stronger: ['highly detailed'],
    reason: 'detail-fidelity-overlap',
  },
  {
    categories: ['perspectives'],
    weaker: ['head to toe', 'entire figure visible', 'full silhouette'],
    stronger: ['full body'],
    reason: 'full-body-framing-overlap',
  },
  {
    categories: ['styles'],
    weaker: ['anime aesthetic', 'anime style'],
    stronger: ['anime artwork'],
    reason: 'anime-style-overlap',
  },
];

function reduceRedundantNodes(nodes: TokenNode[], trace: PresetCompilerTrace): TokenNode[] {
  return nodes.filter((candidateNode) => {
    const candidateKey = normalizeWordKey(candidateNode.cleanWord);

    for (const rule of REDUNDANT_TAG_RULES) {
      if (!rule.categories.includes(candidateNode.category)) {
        continue;
      }
      if (!rule.weaker.includes(candidateKey)) {
        continue;
      }

      const strongerNode = nodes.find((node) => {
        if (!rule.categories.includes(node.category)) {
          return false;
        }
        return rule.stronger.includes(normalizeWordKey(node.cleanWord));
      });

      if (strongerNode) {
        trace.removedTokens.push({
          word: candidateNode.cleanWord,
          reason: rule.reason,
          keptWord: strongerNode.cleanWord,
        });
        return false;
      }
    }

    return true;
  });
}

const COMMON_SUBJECTS = [
  '1girl',
  '1boy',
  'woman',
  'man',
  'girl',
  'boy',
  'elf',
  'cyborg',
  'dragon',
  'warrior',
  'female',
  'male',
];

const SEGMENT_MEDIUM_PRIORITY = [
  'anime artwork',
  'anime aesthetic',
  'illustration',
  'digital painting',
  'photo',
  'portrait',
  'photograph',
  'drawing',
];

function findSubjectNode(characterNodes: TokenNode[]): TokenNode | undefined {
  let subjectNode = characterNodes.find((node) =>
    COMMON_SUBJECTS.some((subject) => node.cleanWord.toLowerCase().includes(subject))
  );

  if (!subjectNode && characterNodes.length > 0) {
    subjectNode = characterNodes[0];
  }

  return subjectNode;
}

function findSegmentMediumTags(styleNodes: TokenNode[]): string[] {
  for (const medium of SEGMENT_MEDIUM_PRIORITY) {
    const exactNode = styleNodes.find((node) => normalizeWordKey(node.cleanWord) == medium);
    if (exactNode) {
      return [formatNodeAsTag(exactNode)];
    }
  }

  const animeNode = styleNodes.find((node) => {
    const lower = node.cleanWord.toLowerCase();
    return lower.includes('anime') || lower.includes('doujin') || lower.includes('hentai');
  });
  if (animeNode) {
    return ['anime artwork'];
  }

  return [];
}

function segmentReasonWords(nodes: TokenNode[], keywords: string[]): string[] {
  return dedupeFormattedTags(
    nodes.filter((node) => nodeMatchesKeyword(node, keywords)).map((node) => node.cleanWord)
  );
}

function buildSegmentPrompt(
  baseSubject: string,
  details: string[],
  mediumTags: string[]
): string {
  return formatPromptTags([baseSubject, ...details, 'high detail', ...mediumTags])
    .replace(/\s+/g, ' ')
    .replace(/,\s*,/g, ',')
    .trim();
}

function appendSegmentTag(
  segmentTags: string[],
  segments: PresetCompilerTraceSegment[],
  sourceNodes: TokenNode[],
  part: string,
  segmentSyntax: string,
  includeKeywords: string[],
  excludeKeywords: string[],
  defaultDetails: string[],
  baseSubject: string,
  mediumTags: string[]
): void {
  const details = extractSegmentDetails(sourceNodes, includeKeywords, excludeKeywords, defaultDetails);
  const prompt = buildSegmentPrompt(baseSubject, details, mediumTags);
  segmentTags.push(`<segment:${segmentSyntax}> ${prompt}`);
  segments.push({
    part,
    reasonWords: segmentReasonWords(sourceNodes, includeKeywords),
    prompt,
  });
}

function assembleIllustriousTagPrompt(
  categoryNodes: Record<PresetCategory, TokenNode[]>,
  options: Required<PresetCompilerOptions>
): SceneAssemblyResult {
  const characterNodes = categoryNodes['characters'] ?? [];
  const explicitNodes = categoryNodes['explicit'] ?? [];
  const styleNodes = categoryNodes['styles'] ?? [];
  const qualityNodes = categoryNodes['quality'] ?? [];
  const perspectiveNodes = categoryNodes['perspectives'] ?? [];
  const sceneNodes = categoryNodes['scenes'] ?? [];
  const lightingNodes = categoryNodes['lighting'] ?? [];
  const subjectNode = findSubjectNode(characterNodes);

  if (!subjectNode) {
    return { text: '', segments: [] };
  }

  const otherCharacterNodes = characterNodes.filter((node) => node !== subjectNode);
  const { compacted, remaining } = extractAndCompactNounPhrases([
    ...otherCharacterNodes,
    ...explicitNodes,
  ]);
  const orderedDetailNodes = restoreCompactedNodeOrder(
    [...otherCharacterNodes, ...explicitNodes],
    remaining,
    compacted
  );
  const characterDetailNodes = orderedDetailNodes.filter((node) => node.category != 'explicit');
  const explicitDetailNodes = orderedDetailNodes.filter((node) => node.category == 'explicit');

  const promptTags: string[] = [];
  appendNodeTags(promptTags, qualityNodes);
  appendNodeTags(promptTags, [subjectNode, ...characterDetailNodes]);
  appendNodeTags(promptTags, explicitDetailNodes);
  appendNodeTags(promptTags, perspectiveNodes);
  appendNodeTags(promptTags, sceneNodes);
  appendNodeTags(promptTags, styleNodes);
  appendNodeTags(promptTags, lightingNodes);

  const basePrompt = formatPromptTags(promptTags);
  const segments: PresetCompilerTraceSegment[] = [];
  const segmentTags: string[] = [];

  if (!options.autoSegments) {
    return { text: basePrompt, segments };
  }

  const segmentSourceNodes = [...qualityNodes, ...characterNodes, ...explicitNodes];
  const mediumTags = findSegmentMediumTags(styleNodes);
  const baseSubject = formatNodeAsTag(subjectNode);

  if (segmentSourceNodes.some((node) => nodeMatchesKeyword(node, FACE_KEYWORDS))) {
    appendSegmentTag(
      segmentTags,
      segments,
      segmentSourceNodes,
      'face',
      'face,0.65,0.4',
      FACE_KEYWORDS,
      [
        ...HANDS_KEYWORDS,
        ...BREASTS_KEYWORDS,
        ...VULVA_KEYWORDS,
        ...PENIS_KEYWORDS,
        ...BUTT_KEYWORDS,
        ...GENERAL_BODY_CLOTHING_KEYWORDS,
      ],
      ['detailed face', 'detailed eyes', 'natural skin texture', 'sharp focus'],
      baseSubject,
      mediumTags
    );
  }

  if (segmentSourceNodes.some((node) => nodeMatchesKeyword(node, HANDS_KEYWORDS))) {
    appendSegmentTag(
      segmentTags,
      segments,
      segmentSourceNodes,
      'hands',
      'hand|hands|fingers,0.6,0.35',
      HANDS_KEYWORDS,
      [
        ...FACE_KEYWORDS,
        ...BREASTS_KEYWORDS,
        ...VULVA_KEYWORDS,
        ...PENIS_KEYWORDS,
        ...BUTT_KEYWORDS,
        ...GENERAL_BODY_CLOTHING_KEYWORDS,
      ],
      ['detailed hands', 'perfect fingers', 'natural skin texture', 'sharp focus'],
      baseSubject,
      mediumTags
    );
  }

  if (segmentSourceNodes.some((node) => nodeMatchesKeyword(node, BREASTS_KEYWORDS))) {
    appendSegmentTag(
      segmentTags,
      segments,
      segmentSourceNodes,
      'breasts',
      'breasts,0.65,0.3',
      BREASTS_KEYWORDS,
      [
        ...FACE_KEYWORDS,
        ...HANDS_KEYWORDS,
        ...VULVA_KEYWORDS,
        ...PENIS_KEYWORDS,
        ...BUTT_KEYWORDS,
        ...GENERAL_BODY_CLOTHING_KEYWORDS,
      ],
      ['detailed breasts', 'natural skin texture', 'sharp focus'],
      baseSubject,
      mediumTags
    );
  }

  if (segmentSourceNodes.some((node) => nodeMatchesKeyword(node, VULVA_KEYWORDS))) {
    appendSegmentTag(
      segmentTags,
      segments,
      segmentSourceNodes,
      'vulva',
      'vulva,0.65,0.3',
      VULVA_KEYWORDS,
      [
        ...FACE_KEYWORDS,
        ...HANDS_KEYWORDS,
        ...BREASTS_KEYWORDS,
        ...PENIS_KEYWORDS,
        ...BUTT_KEYWORDS,
        ...GENERAL_BODY_CLOTHING_KEYWORDS,
      ],
      ['detailed anatomy', 'natural skin texture', 'sharp focus'],
      baseSubject,
      mediumTags
    );
  }

  if (segmentSourceNodes.some((node) => nodeMatchesKeyword(node, PENIS_KEYWORDS))) {
    appendSegmentTag(
      segmentTags,
      segments,
      segmentSourceNodes,
      'penis',
      'penis,0.65,0.3',
      PENIS_KEYWORDS,
      [
        ...FACE_KEYWORDS,
        ...HANDS_KEYWORDS,
        ...BREASTS_KEYWORDS,
        ...VULVA_KEYWORDS,
        ...BUTT_KEYWORDS,
        ...GENERAL_BODY_CLOTHING_KEYWORDS,
      ],
      ['detailed anatomy', 'natural skin texture', 'sharp focus'],
      baseSubject,
      mediumTags
    );
  }

  if (segmentSourceNodes.some((node) => nodeMatchesKeyword(node, BUTT_KEYWORDS))) {
    appendSegmentTag(
      segmentTags,
      segments,
      segmentSourceNodes,
      'butt',
      'butt,0.65,0.3',
      BUTT_KEYWORDS,
      [
        ...FACE_KEYWORDS,
        ...HANDS_KEYWORDS,
        ...BREASTS_KEYWORDS,
        ...VULVA_KEYWORDS,
        ...PENIS_KEYWORDS,
        ...GENERAL_BODY_CLOTHING_KEYWORDS,
      ],
      ['detailed butt', 'natural skin texture', 'sharp focus'],
      baseSubject,
      mediumTags
    );
  }

  return {
    text: [basePrompt, ...segmentTags].filter(Boolean).join(' '),
    segments,
  };
}

/**
 * Assembles the smart prompt. The normal path is Illustrious-style tag ordering;
 * the older paragraph assembler remains as a defensive fallback for odd staged data.
 */
function assembleCoherentScenePrompt(
  categoryNodes: Record<PresetCategory, TokenNode[]>,
  options: Required<PresetCompilerOptions>
): SceneAssemblyResult {
  const characterNodes = categoryNodes['characters'] ?? [];
  const explicitNodes = categoryNodes['explicit'] ?? [];
  const styleNodes = categoryNodes['styles'] ?? [];
  const qualityNodes = categoryNodes['quality'] ?? [];
  const perspectiveNodes = categoryNodes['perspectives'] ?? [];
  const sceneNodes = categoryNodes['scenes'] ?? [];
  const lightingNodes = categoryNodes['lighting'] ?? [];
  const tagPrompt = assembleIllustriousTagPrompt(categoryNodes, options);

  if (tagPrompt.text) {
    return tagPrompt;
  }

  const commonSubjects = ['1girl', '1boy', 'woman', 'man', 'girl', 'boy', 'elf', 'cyborg', 'dragon', 'warrior', 'female', 'male'];
  let subjectNode = characterNodes.find((n) =>
    commonSubjects.some((subj) => n.cleanWord.toLowerCase().includes(subj))
  );

  if (!subjectNode && characterNodes.length > 0) {
    subjectNode = characterNodes[0];
  }

  if (!subjectNode) {
    return { text: '', segments: [] };
  }

  // --- Technique B: SwarmUI Segment Detail Auto-Injector Scan ---
  let needsFaceSegment = false;
  let needsHandSegment = false;
  let needsBreastsSegment = false;
  let needsVulvaSegment = false;
  let needsPenisSegment = false;
  let needsButtSegment = false;

  for (const n of [...characterNodes, ...explicitNodes]) {
    if (nodeMatchesKeyword(n, FACE_KEYWORDS)) {
      needsFaceSegment = true;
    }
    if (nodeMatchesKeyword(n, HANDS_KEYWORDS)) {
      needsHandSegment = true;
    }
    if (nodeMatchesKeyword(n, BREASTS_KEYWORDS)) {
      needsBreastsSegment = true;
    }
    if (nodeMatchesKeyword(n, VULVA_KEYWORDS)) {
      needsVulvaSegment = true;
    }
    if (nodeMatchesKeyword(n, PENIS_KEYWORDS)) {
      needsPenisSegment = true;
    }
    if (nodeMatchesKeyword(n, BUTT_KEYWORDS)) {
      needsButtSegment = true;
    }
  }

  // --- Technique D: Dynamic Complexity & Weight Balancer ---
  const complexityScore = sceneNodes.length + lightingNodes.length + styleNodes.length;
  let characterWeight = 1.10;
  if (complexityScore >= 6) {
    characterWeight = 1.20;
  }
  else if (complexityScore >= 4) {
    characterWeight = 1.15;
  }

  // --- Technique C: Structural Subject Noun Extraction ---
  let simplifiedSubject = 'character';
  if (subjectNode) {
    const rawSubj = subjectNode.cleanWord.toLowerCase();
    if (rawSubj.includes('girl') || rawSubj.includes('female') || rawSubj.includes('woman')) {
      simplifiedSubject = 'girl';
      if (rawSubj.includes('elf')) {
        simplifiedSubject = 'elf girl';
      }
      else if (rawSubj.includes('wolf')) {
        simplifiedSubject = 'wolf girl';
      }
    }
    else if (rawSubj.includes('boy') || rawSubj.includes('male') || rawSubj.includes('man')) {
      simplifiedSubject = 'boy';
      if (rawSubj.includes('knight')) {
        simplifiedSubject = 'knight';
      }
    }
    else if (rawSubj.includes('cyborg')) {
      simplifiedSubject = 'cyborg';
    }
    else if (rawSubj.includes('dragon')) {
      simplifiedSubject = 'dragon';
    }
    else {
      const parts = subjectNode.cleanWord.trim().split(/\s+/);
      simplifiedSubject = parts[parts.length - 1].toLowerCase();
    }
  }

  const otherCharNodes = characterNodes.filter((n) => n !== subjectNode);
  const physicalNodesToCompact = [...otherCharNodes, ...explicitNodes];

  const { compacted, remaining } = extractAndCompactNounPhrases(physicalNodesToCompact);

  const clothingKeywords = ['jacket', 'skirt', 'stockings', 'boots', 'bikini', 'dress', 'shirt', 'pants', 'coat', 'outfit', 'suit', 'clothed', 'wearing', 'apron', 'underwear', 'lingerie', 'bra', 'panties'];
  const nudityKeywords = ['nude', 'naked', 'topless', 'bare', 'exposed'];

  const clothingNodes: TokenNode[] = [];
  const bodyStateNodes: TokenNode[] = [];
  const attributeNodes: TokenNode[] = [];

  for (const node of remaining) {
    const wordLower = node.cleanWord.toLowerCase();
    if (nudityKeywords.some((kw) => wordLower.includes(kw))) {
      bodyStateNodes.push(node);
    }
    else if (clothingKeywords.some((kw) => wordLower.includes(kw))) {
      clothingNodes.push(node);
    }
    else {
      attributeNodes.push(node);
    }
  }

  const physicalTraits = [...attributeNodes, ...compacted];

  const styleMediums = ['photo', 'portrait', 'illustration', 'oil painting', '3d render', 'sketch', 'digital painting', 'photograph', 'drawing'];
  const primaryMediumNode = styleNodes.find((n) =>
    styleMediums.some((med) => n.cleanWord.toLowerCase().includes(med))
  );

  const otherStyleNodes = styleNodes.filter((n) => n !== primaryMediumNode);

  const qualityAdjectives = ['photorealistic', 'hyperrealistic', 'realistic', 'detailed', 'highly detailed', 'gorgeous', 'beautiful', 'exquisite', 'masterpiece', 'stunning'];
  const activeQualityPrefixes: string[] = [];

  for (const qNode of qualityNodes) {
    const qLower = qNode.cleanWord.toLowerCase();
    if (qualityAdjectives.some((adj) => qLower.includes(adj))) {
      activeQualityPrefixes.push(formatWeightedWord(qNode.cleanWord, qNode.effectiveWeight));
    }
  }

  for (const sNode of otherStyleNodes) {
    const sLower = sNode.cleanWord.toLowerCase();
    if (qualityAdjectives.some((adj) => sLower.includes(adj))) {
      activeQualityPrefixes.push(formatWeightedWord(sNode.cleanWord, sNode.effectiveWeight));
    }
  }

  let compositionPrefix = '';
  if (perspectiveNodes.length > 0) {
    const compText = perspectiveNodes.map((n) => formatWeightedWord(n.cleanWord, n.effectiveWeight)).join(', ');
    compositionPrefix = `${compText} of `;
  }

  let prefix = 'A ';
  if (activeQualityPrefixes.length > 0) {
    const firstChar = activeQualityPrefixes[0].replace(/^\(+/, '').toLowerCase()[0];
    const useAn = ['a', 'e', 'i', 'o', 'u'].includes(firstChar);
    prefix = useAn ? 'An ' : 'A ';
    prefix += activeQualityPrefixes.join(' ') + ' ';
  }

  if (primaryMediumNode) {
    prefix += formatWeightedWord(primaryMediumNode.cleanWord, primaryMediumNode.effectiveWeight) + ' of ';
  }
  else if (compositionPrefix) {
    prefix += compositionPrefix;
  }
  else {
    prefix = 'A scene featuring ';
  }

  // --- Technique A: CLIP Adjacency Structural Attention Brackets Assembly ---
  let characterClause = '';
  const rawSubject = subjectNode.cleanWord;

  if (physicalTraits.length > 0) {
    const rawTraits = physicalTraits.map((n) => formatWeightedWord(n.cleanWord, n.effectiveWeight));

    for (let i = 0; i < rawTraits.length; i++) {
      const wLower = rawTraits[i].toLowerCase();
      if (
        (wLower.endsWith('body') || wLower.endsWith('figure')) &&
        !wLower.startsWith('a ') && !wLower.startsWith('an ')
      ) {
        const firstLetter = wLower[0];
        const useAn = ['a', 'e', 'i', 'o', 'u'].includes(firstLetter);
        rawTraits[i] = (useAn ? 'an ' : 'a ') + rawTraits[i];
      }
    }

    let rawPhysicalText = '';
    if (rawTraits.length == 1) {
      rawPhysicalText = ` with ${rawTraits[0]}`;
    }
    else if (rawTraits.length == 2) {
      rawPhysicalText = ` with ${rawTraits[0]} and ${rawTraits[1]}`;
    }
    else {
      const last = rawTraits.pop();
      rawPhysicalText = ` with ${rawTraits.join(', ')}, and ${last}`;
    }

    const dynamicWeightStr = Number(characterWeight.toFixed(2));
    characterClause = `(${rawSubject}${rawPhysicalText}:${dynamicWeightStr})`;
  }
  else {
    if (complexityScore >= 4) {
      const dynamicWeightStr = Number(characterWeight.toFixed(2));
      characterClause = `(${rawSubject}:${dynamicWeightStr})`;
    }
    else {
      characterClause = formatWeightedWord(subjectNode.cleanWord, subjectNode.effectiveWeight);
    }
  }

  let clothingText = '';
  if (clothingNodes.length > 0) {
    clothingText = `, wearing ${formatNodeList(clothingNodes)}`;
  }

  let bodyStateText = '';
  if (bodyStateNodes.length > 0) {
    bodyStateText = `, ${formatNodeList(bodyStateNodes)}`;
  }

  let sceneText = '';
  if (sceneNodes.length > 0) {
    const placedScenes: string[] = [];
    const ambientScenes: string[] = [];

    for (const node of sceneNodes) {
      const wordLower = node.cleanWord.toLowerCase();
      if (wordLower.startsWith('in ') || wordLower.startsWith('on ') || wordLower.startsWith('at ')) {
        placedScenes.push(formatWeightedWord(node.cleanWord, node.effectiveWeight));
      }
      else {
        ambientScenes.push(formatWeightedWord(node.cleanWord, node.effectiveWeight));
      }
    }

    if (placedScenes.length > 0 && ambientScenes.length > 0) {
      sceneText = `, ${formatJoinedList(placedScenes)} with ${formatJoinedList(ambientScenes)}`;
    }
    else if (placedScenes.length > 0) {
      sceneText = `, ${formatJoinedList(placedScenes)}`;
    }
    else {
      sceneText = `, in a setting with ${formatJoinedList(ambientScenes)}`;
    }
  }

  let lightingText = '';
  if (lightingNodes.length > 0) {
    const directedLights: string[] = [];
    const lightQualities: string[] = [];

    for (const node of lightingNodes) {
      const wordLower = node.cleanWord.toLowerCase();
      if (wordLower.startsWith('under ') || wordLower.startsWith('with ') || wordLower.startsWith('lit by ')) {
        directedLights.push(formatWeightedWord(node.cleanWord, node.effectiveWeight));
      }
      else {
        lightQualities.push(formatWeightedWord(node.cleanWord, node.effectiveWeight));
      }
    }

    if (directedLights.length > 0 && lightQualities.length > 0) {
      lightingText = `, ${formatJoinedList(directedLights)} with ${formatJoinedList(lightQualities)}`;
    }
    else if (directedLights.length > 0) {
      lightingText = `, ${formatJoinedList(directedLights)}`;
    }
    else {
      lightingText = `, under ${formatJoinedList(lightQualities)}`;
    }
  }

  // --- Technique C: Structural Subject Reinforcement ---
  let reinforcementText = '';
  if (complexityScore >= 3) {
    reinforcementText = `, centering the ${simplifiedSubject}`;
  }

  const leftoverStylesAndQuality = [...qualityNodes, ...styleNodes].filter((n) => {
    if (n === primaryMediumNode) {
      return false;
    }
    const lower = n.cleanWord.toLowerCase();
    if (qualityAdjectives.some((adj) => lower.includes(adj))) {
      return false;
    }
    return true;
  });

  let suffixText = '';
  if (leftoverStylesAndQuality.length > 0) {
    const leftovers = leftoverStylesAndQuality.map((n) => formatWeightedWord(n.cleanWord, n.effectiveWeight));
    suffixText = `, ${leftovers.join(', ')}`;
  }

  let sentence = `${prefix}${characterClause}${clothingText}${bodyStateText}${sceneText}${lightingText}${reinforcementText}${suffixText}.`;

  sentence = sentence
    .replace(/\s+/g, ' ')
    .replace(/\s+,\s*/g, ', ')
    .replace(/\s+\.\s*/g, '.')
    .replace(/,\s*\./g, '.');

  // --- Technique B: SwarmUI Segment Detail Injector Auto-Appender ---
  const baseSubject = subjectNode ? subjectNode.cleanWord : 'character';
  const mediumText = primaryMediumNode ? primaryMediumNode.cleanWord : 'photo';
  let segmentTags = '';
  const segments: PresetCompilerTraceSegment[] = [];

  if (!options.autoSegments) {
    return { text: sentence, segments };
  }

  if (needsFaceSegment) {
    const faceDetailsText = extractSegmentDetails(
      [...characterNodes, ...explicitNodes],
      FACE_KEYWORDS,
      [...HANDS_KEYWORDS, ...BREASTS_KEYWORDS, ...VULVA_KEYWORDS, ...PENIS_KEYWORDS, ...BUTT_KEYWORDS, ...GENERAL_BODY_CLOTHING_KEYWORDS],
      ['detailed face', 'beautiful detailed eyes', 'natural skin texture', 'sharp focus']
    );
    let faceSegmentPrompt = `a close-up portrait of the face of ${baseSubject}, ${faceDetailsText}, high detail, ${mediumText}`;
    faceSegmentPrompt = faceSegmentPrompt.replace(/\s+/g, ' ').replace(/,\s*,/g, ',').trim();
    segmentTags += ` <segment:face,0.65,0.4> ${faceSegmentPrompt}`;
    segments.push({
      part: 'face',
      reasonWords: [...characterNodes, ...explicitNodes].filter((node) => nodeMatchesKeyword(node, FACE_KEYWORDS)).map((node) => node.cleanWord),
      prompt: faceSegmentPrompt,
    });
  }

  if (needsHandSegment) {
    const handDetailsText = extractSegmentDetails(
      [...characterNodes, ...explicitNodes],
      HANDS_KEYWORDS,
      [...FACE_KEYWORDS, ...BREASTS_KEYWORDS, ...VULVA_KEYWORDS, ...PENIS_KEYWORDS, ...BUTT_KEYWORDS, ...GENERAL_BODY_CLOTHING_KEYWORDS],
      ['detailed hands', 'perfect fingers', 'natural skin texture', 'sharp focus']
    );
    let handSegmentPrompt = `a close-up of the hands of ${baseSubject}, ${handDetailsText}, high detail, ${mediumText}`;
    handSegmentPrompt = handSegmentPrompt.replace(/\s+/g, ' ').replace(/,\s*,/g, ',').trim();
    segmentTags += ` <segment:hand|hands|fingers,0.6,0.35> ${handSegmentPrompt}`;
    segments.push({
      part: 'hands',
      reasonWords: [...characterNodes, ...explicitNodes].filter((node) => nodeMatchesKeyword(node, HANDS_KEYWORDS)).map((node) => node.cleanWord),
      prompt: handSegmentPrompt,
    });
  }

  if (needsBreastsSegment) {
    const breastsDetailsText = extractSegmentDetails(
      [...characterNodes, ...explicitNodes],
      BREASTS_KEYWORDS,
      [...FACE_KEYWORDS, ...HANDS_KEYWORDS, ...VULVA_KEYWORDS, ...PENIS_KEYWORDS, ...BUTT_KEYWORDS, ...GENERAL_BODY_CLOTHING_KEYWORDS],
      ['detailed breasts', 'perfect breasts', 'natural skin texture', 'sharp focus']
    );
    let breastsSegmentPrompt = `a close-up of the breasts of ${baseSubject}, ${breastsDetailsText}, high detail, ${mediumText}`;
    breastsSegmentPrompt = breastsSegmentPrompt.replace(/\s+/g, ' ').replace(/,\s*,/g, ',').trim();
    segmentTags += ` <segment:breasts,0.65,0.3> ${breastsSegmentPrompt}`;
    segments.push({
      part: 'breasts',
      reasonWords: [...characterNodes, ...explicitNodes].filter((node) => nodeMatchesKeyword(node, BREASTS_KEYWORDS)).map((node) => node.cleanWord),
      prompt: breastsSegmentPrompt,
    });
  }

  if (needsVulvaSegment) {
    const vulvaDetailsText = extractSegmentDetails(
      [...characterNodes, ...explicitNodes],
      VULVA_KEYWORDS,
      [...FACE_KEYWORDS, ...HANDS_KEYWORDS, ...BREASTS_KEYWORDS, ...PENIS_KEYWORDS, ...BUTT_KEYWORDS, ...GENERAL_BODY_CLOTHING_KEYWORDS],
      ['detailed vulva', 'perfect anatomy', 'natural skin texture', 'sharp focus']
    );
    let vulvaSegmentPrompt = `a close-up of the vulva of ${baseSubject}, ${vulvaDetailsText}, high detail, ${mediumText}`;
    vulvaSegmentPrompt = vulvaSegmentPrompt.replace(/\s+/g, ' ').replace(/,\s*,/g, ',').trim();
    segmentTags += ` <segment:vulva,0.65,0.3> ${vulvaSegmentPrompt}`;
    segments.push({
      part: 'vulva',
      reasonWords: [...characterNodes, ...explicitNodes].filter((node) => nodeMatchesKeyword(node, VULVA_KEYWORDS)).map((node) => node.cleanWord),
      prompt: vulvaSegmentPrompt,
    });
  }

  if (needsPenisSegment) {
    const penisDetailsText = extractSegmentDetails(
      [...characterNodes, ...explicitNodes],
      PENIS_KEYWORDS,
      [...FACE_KEYWORDS, ...HANDS_KEYWORDS, ...BREASTS_KEYWORDS, ...VULVA_KEYWORDS, ...BUTT_KEYWORDS, ...GENERAL_BODY_CLOTHING_KEYWORDS],
      ['detailed penis', 'perfect anatomy', 'natural skin texture', 'sharp focus']
    );
    let penisSegmentPrompt = `a close-up of the penis of ${baseSubject}, ${penisDetailsText}, high detail, ${mediumText}`;
    penisSegmentPrompt = penisSegmentPrompt.replace(/\s+/g, ' ').replace(/,\s*,/g, ',').trim();
    segmentTags += ` <segment:penis,0.65,0.3> ${penisSegmentPrompt}`;
    segments.push({
      part: 'penis',
      reasonWords: [...characterNodes, ...explicitNodes].filter((node) => nodeMatchesKeyword(node, PENIS_KEYWORDS)).map((node) => node.cleanWord),
      prompt: penisSegmentPrompt,
    });
  }

  if (needsButtSegment) {
    const buttDetailsText = extractSegmentDetails(
      [...characterNodes, ...explicitNodes],
      BUTT_KEYWORDS,
      [...FACE_KEYWORDS, ...HANDS_KEYWORDS, ...BREASTS_KEYWORDS, ...VULVA_KEYWORDS, ...PENIS_KEYWORDS, ...GENERAL_BODY_CLOTHING_KEYWORDS],
      ['detailed butt', 'perfect buttocks', 'natural skin texture', 'sharp focus']
    );
    let buttSegmentPrompt = `a close-up of the butt of ${baseSubject}, ${buttDetailsText}, high detail, ${mediumText}`;
    buttSegmentPrompt = buttSegmentPrompt.replace(/\s+/g, ' ').replace(/,\s*,/g, ',').trim();
    segmentTags += ` <segment:butt,0.65,0.3> ${buttSegmentPrompt}`;
    segments.push({
      part: 'butt',
      reasonWords: [...characterNodes, ...explicitNodes].filter((node) => nodeMatchesKeyword(node, BUTT_KEYWORDS)).map((node) => node.cleanWord),
      prompt: buttSegmentPrompt,
    });
  }

  sentence += segmentTags;

  return { text: sentence, segments };
}

function createEmptyTrace(): PresetCompilerTrace {
  return {
    tokens: [],
    mergedTokens: [],
    removedTokens: [],
    segments: [],
  };
}

function normalizeCompilerOptions(options: PresetCompilerOptions = {}): Required<PresetCompilerOptions> {
  return {
    autoSegments: options.autoSegments ?? true,
    sfwMode: options.sfwMode ?? false,
  };
}

function buildTokenNodes(
  state: PresetCartState,
  stagedVariables: Record<string, Record<string, string>>,
  sfwMode?: boolean
): TokenNode[] {
  const tokenNodes: TokenNode[] = [];

  // --- Tier 1: Variable Substitution & Parser ---
  for (const word of state.stagedWords) {
    const key = normalizeWordKey(word);
    const baseWeight = state.wordWeights[key] ?? 1.0;
    const contributors = state.wordContributors[key] ?? [];
    const category = state.categoryByKey[key] ?? 'characters';

    // Resolve variables using first active contributor
    const primaryPresetId = contributors[0];
    const resolvedWord = resolveWordVariables(word, primaryPresetId, stagedVariables);

    const { baseWord, weight: parsedWeight } = parseWeightedWord(resolvedWord);

    if (sfwMode) {
      const baseWordLower = baseWord.toLowerCase();
      const nsfwKeywords = [
        'vulva', 'pussy', 'vagina', 'cunt', 'clitoris', 'pubic', 'areola', 'nipple', 'nipples',
        'asshole', 'anus', 'penis', 'cock', 'dick', 'nude', 'naked', 'topless', 'bare breasts',
        'bare vulva', 'bare slit', 'bare pussy', 'shaved pussy', 'nude body', 'naked body'
      ];
      if (nsfwKeywords.some((kw) => baseWordLower.includes(kw))) {
        continue;
      }
    }

    // Apply category preset multipliers if active
    const multiplier = contributors.reduce(
      (max, id) => Math.max(max, state.presetMultipliers[id] ?? 1.0),
      1.0
    );

    tokenNodes.push({
      originalWord: word,
      resolvedWord,
      cleanWord: baseWord,
      baseWeight: parsedWeight !== 1.0 ? parsedWeight : baseWeight,
      effectiveWeight: (parsedWeight !== 1.0 ? parsedWeight : baseWeight) * multiplier,
      category,
      contributors,
    });
  }

  return tokenNodes;
}

function compileTokenNodes(
  tokenNodes: TokenNode[],
  deduplicate: boolean,
  options: Required<PresetCompilerOptions>,
  trace: PresetCompilerTrace
): PresetPromptSection[] {
  trace.tokens = tokenNodes.map(traceToken);

  // If deduplication is disabled, run standard flat compile with resolved variables
  if (!deduplicate) {
    const sections: PresetPromptSection[] = [];
    const nodesByCategory = new Map<PresetCategory, TokenNode[]>();

    for (const node of tokenNodes) {
      const existing = nodesByCategory.get(node.category) ?? [];
      nodesByCategory.set(node.category, [...existing, node]);
    }

    for (const category of PRESET_PROMPT_SECTION_ORDER) {
      const categoryNodes = nodesByCategory.get(category) ?? [];
      if (categoryNodes.length === 0) {
        continue;
      }

      const formattedWords = categoryNodes.map((node) =>
        formatWeightedWord(node.cleanWord, node.effectiveWeight)
      );

      sections.push({
        category,
        words: [...formattedWords],
        text: formattedWords.join(', '),
      });
    }

    return sections;
  }

  // --- Tier 2: Semantic Deduplication & Merging ---
  const mergedNodes: TokenNode[] = [];

  for (const node of tokenNodes) {
    const nodeKey = normalizeWordKey(node.cleanWord);
    // Check if we have an exact match already
    const exactMatch = mergedNodes.find((m) => normalizeWordKey(m.cleanWord) === nodeKey);

    if (exactMatch) {
      // Tier 3: Merge weights using cumulative logarithmic damping
      exactMatch.effectiveWeight = mergeWeights([exactMatch.effectiveWeight, node.effectiveWeight]);
      exactMatch.contributors = Array.from(new Set([...exactMatch.contributors, ...node.contributors]));
      continue;
    }

    mergedNodes.push(node);
  }

  // Subsequence-based semantic deduplication:
  // E.g., remove "beautiful face" if "gorgeous detailed beautiful face" is present in the same category.
  const semanticallyReducedNodes = mergedNodes.filter((candidateNode, index, self) => {
    const removedBy = self.find((otherNode, otherIndex) => {
      if (index === otherIndex || candidateNode.category !== otherNode.category) {
        return false;
      }
      // If candidate is a subsequence of another, and has a lower or equal weight, filter it out
      if (
        isSemanticSubset(candidateNode.cleanWord, otherNode.cleanWord) &&
        candidateNode.effectiveWeight <= otherNode.effectiveWeight
      ) {
        return true;
      }
      return false;
    });
    if (removedBy) {
      trace.removedTokens.push({
        word: candidateNode.cleanWord,
        reason: 'semantic-subset',
        keptWord: removedBy.cleanWord,
      });
      return false;
    }
    return true;
  });

  const finalNodes = reduceRedundantNodes(semanticallyReducedNodes, trace);

  trace.mergedTokens = finalNodes.map(traceToken);

  // --- Tier 4: Unified Natural-Language Scene Assembly & Fallback Stager ---
  const finalNodesByCategoryRecord = {} as Record<PresetCategory, TokenNode[]>;
  for (const node of finalNodes) {
    if (!finalNodesByCategoryRecord[node.category]) {
      finalNodesByCategoryRecord[node.category] = [];
    }
    finalNodesByCategoryRecord[node.category].push(node);
  }

  const assembledScene = assembleCoherentScenePrompt(finalNodesByCategoryRecord, options);
  trace.segments = assembledScene.segments;
  trace.assembledSceneText = assembledScene.text || undefined;

  if (assembledScene.text) {
    return [
      {
        category: 'scenes',
        words: [assembledScene.text],
        text: assembledScene.text,
      }
    ];
  }

  // Fallback: Optimal Syntactic Category Layering (if no characters/subject was staged)
  const OPTIMAL_SYNTAX_ORDER: PresetCategory[] = [
    'quality',
    'styles',
    'perspectives',
    'characters',
    'explicit',
    'scenes',
    'lighting',
  ];

  const sections: PresetPromptSection[] = [];
  const finalNodesByCategory = new Map<PresetCategory, TokenNode[]>();

  for (const node of finalNodes) {
    const existing = finalNodesByCategory.get(node.category) ?? [];
    finalNodesByCategory.set(node.category, [...existing, node]);
  }

  for (const category of OPTIMAL_SYNTAX_ORDER) {
    const categoryNodes = finalNodesByCategory.get(category) ?? [];
    if (categoryNodes.length === 0) {
      continue;
    }

    const formattedWords = categoryNodes.map((node) =>
      formatWeightedWord(node.cleanWord, node.effectiveWeight)
    );

    sections.push({
      category,
      words: [...formattedWords],
      text: formattedWords.join(', '),
    });
  }

  return sections;
}

export function compileStagedPromptWithTrace(
  state: PresetCartState,
  stagedVariables: Record<string, Record<string, string>>,
  deduplicate: boolean,
  options: PresetCompilerOptions = {}
): PresetCompilerResult {
  const normalizedOptions = normalizeCompilerOptions(options);
  const trace = createEmptyTrace();
  const tokenNodes = buildTokenNodes(state, stagedVariables, normalizedOptions.sfwMode);
  const sections = compileTokenNodes(tokenNodes, deduplicate, normalizedOptions, trace);

  if (!deduplicate) {
    trace.mergedTokens = trace.tokens;
  }

  return {
    sections,
    trace,
  };
}

/**
 * The core Smart Prompt Compiler & Natural-Language Scene Builder.
 */
export function compileStagedPrompt(
  state: PresetCartState,
  stagedVariables: Record<string, Record<string, string>>,
  deduplicate: boolean,
  options: PresetCompilerOptions = {}
): PresetPromptSection[] {
  return compileStagedPromptWithTrace(state, stagedVariables, deduplicate, options).sections;
}
