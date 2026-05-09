import { swarmClient } from '../../api/client';
import type { RoleplayCharacter, RoleplayCharacterSourceMetadata } from '../../types/roleplay';
import { parseTavernCardFile, type TavernImportResult } from './tavernCard';

export type RoleplayCharacterSourceKind =
  | 'direct-url'
  | 'local-file'
  | 'source-browser'
  | 'external-open'
  | 'sillytavern-bridge'
  | 'disabled';

export type RoleplaySourceContentRatingMode = 'none' | 'sfw-default' | 'all';
export type RoleplaySourceContentRating = 'sfw' | 'nsfw' | 'all';

export interface RoleplayCharacterSourceProvider {
  id: string;
  label: string;
  kind: RoleplayCharacterSourceKind;
  supportsSearch: boolean;
  supportsDirectUrl: boolean;
  supportsExternalOpen: boolean;
  contentRatingMode: RoleplaySourceContentRatingMode;
  enabled: boolean;
  description: string;
  externalUrl?: string;
  fetchCard?: (input: string) => Promise<FetchedRoleplayCard>;
}

export interface FetchedRoleplayCard {
  file: File;
  finalUrl: string;
  mimeType: string;
  sourceMetadata: RoleplayCharacterSourceMetadata;
}

export interface RoleplaySourceSearchParams {
  providerId: string;
  query: string;
  page: number;
  contentRating: RoleplaySourceContentRating;
}

export interface RoleplaySourceSearchResult {
  providerId: string;
  externalId: string;
  title: string;
  creator: string;
  description: string;
  tags: string[];
  thumbnailUrl: string;
  contentRating: RoleplaySourceContentRating | string;
  externalUrl: string;
  sourceUrl: string;
}

export interface RoleplaySourceSearchResponse {
  success?: boolean;
  providerId?: string;
  results?: RoleplaySourceSearchResult[];
  page?: number;
  total?: number;
  hasMore?: boolean;
  error?: string;
}

export interface RoleplayCardPreview {
  result: TavernImportResult;
  fileName: string;
  finalUrl: string;
  mimeType: string;
  sourceMetadata: RoleplayCharacterSourceMetadata;
}

export interface SillyTavernBridgeProbe {
  reachable: boolean;
  bridgeAvailable: boolean;
  baseUrl: string;
  pluginId: string;
  message: string;
}

export interface SillyTavernBridgeCharacter {
  id: string;
  name: string;
  description?: string;
  tags?: string[];
}

interface RoleplayFetchCharacterCardUrlResponse {
  success?: boolean;
  fileName?: string;
  mimeType?: string;
  dataBase64?: string;
  finalUrl?: string;
  sourceProviderId?: string;
  sourceExternalId?: string;
  sourceLicense?: string;
  sourceContentRating?: string;
  error?: string;
}

const SILLYTAVERN_BRIDGE_PLUGIN_ID = 'swarm-roleplay-bridge';

const PROVIDER_LOOKUP: Record<string, RoleplayCharacterSourceProvider> = {};

function normalizeBaseUrl(url: string): string {
  return url.trim().replace(/\/+$/, '');
}

function inferMimeType(fileName: string, contentType: string | null): string {
  const normalizedType = contentType?.split(';')[0]?.trim().toLowerCase() ?? '';
  if (normalizedType) {
    return normalizedType;
  }
  const lowerName = fileName.toLowerCase();
  if (lowerName.endsWith('.png')) {
    return 'image/png';
  }
  if (lowerName.endsWith('.json')) {
    return 'application/json';
  }
  return 'application/octet-stream';
}

function inferFileName(url: string, mimeType: string): string {
  try {
    const parsedUrl = new URL(url);
    const urlName = parsedUrl.pathname.split('/').filter(Boolean).pop();
    if (urlName) {
      return urlName;
    }
  } catch {
    // Fall through to a generated name.
  }
  return mimeType === 'image/png' ? 'character-card.png' : 'character-card.json';
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function createFileFromBytes(bytes: Uint8Array, fileName: string, mimeType: string): File {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return new File([buffer], fileName, { type: mimeType });
}

function createFetchedCardFromResponse(
  result: RoleplayFetchCharacterCardUrlResponse,
  fallbackUrl: string,
  fallbackProviderId: string,
  fallbackExternalId: string
): FetchedRoleplayCard {
  if (result.error) {
    throw new Error(result.error);
  }
  if (!result.success || !result.dataBase64) {
    throw new Error(result.error ?? 'Swarm proxy could not fetch this card.');
  }
  const mimeType = result.mimeType || inferMimeType(result.fileName ?? '', null);
  const finalUrl = result.finalUrl || fallbackUrl;
  const fileName = result.fileName || inferFileName(finalUrl, mimeType);
  const sourceProviderId = result.sourceProviderId || fallbackProviderId;
  const sourceExternalId = result.sourceExternalId || fallbackExternalId || finalUrl;
  return {
    file: createFileFromBytes(base64ToBytes(result.dataBase64), fileName, mimeType),
    finalUrl,
    mimeType,
    sourceMetadata: {
      sourceUrl: fallbackUrl || finalUrl,
      sourceDownloadUrl: finalUrl,
      sourceProviderId,
      sourceExternalId,
      sourceImportedAt: Date.now(),
      sourceLastCheckedAt: Date.now(),
      sourceLicense: result.sourceLicense ?? '',
      sourceContentRating: result.sourceContentRating ?? '',
    },
  };
}

async function fetchViaSwarmProxy(url: string): Promise<FetchedRoleplayCard> {
  const response = await swarmClient.post<RoleplayFetchCharacterCardUrlResponse>(
    'RoleplayFetchCharacterCardUrl',
    { url },
    { timeout: 45000 }
  );
  const result = response as RoleplayFetchCharacterCardUrlResponse;
  return createFetchedCardFromResponse(result, url, 'direct-url', url);
}

interface KnownSourceUrl {
  providerId: string;
  externalId: string;
  sourceUrl: string;
  externalUrl: string;
}

function getPathSegments(url: URL): string[] {
  return url.pathname.split('/').filter(Boolean);
}

export function getRoleplayCharacterSourceProvider(
  providerId: string | null | undefined
): RoleplayCharacterSourceProvider | null {
  if (!providerId) {
    return null;
  }
  return PROVIDER_LOOKUP[providerId] ?? null;
}

export function buildRoleplaySourceExternalUrl(
  providerId: string,
  externalId: string,
  fallbackUrl = ''
): string {
  const normalizedProviderId = (providerId || '').trim().toLowerCase();
  const normalizedExternalId = (externalId || '').trim().replace(/^\/+|\/+$/g, '');
  if (fallbackUrl) {
    return fallbackUrl;
  }
  if (!normalizedExternalId) {
    return '';
  }
  if (normalizedProviderId === 'charavault') {
    return `https://charavault.net/cards/${normalizedExternalId}`;
  }
  if (normalizedProviderId === 'botbooru') {
    return `https://botbooru.com/character/${encodeURIComponent(normalizedExternalId)}`;
  }
  if (normalizedProviderId === 'character-tavern') {
    return `https://character-tavern.com/character/${normalizedExternalId}`;
  }
  if (normalizedProviderId === 'jannyai' || normalizedProviderId === 'janitorai') {
    return `https://jannyai.com/characters/${normalizedExternalId}`;
  }
  if (normalizedProviderId === 'chub') {
    return `https://chub.ai/characters/${normalizedExternalId}`;
  }
  if (normalizedProviderId === 'taverncard') {
    return `https://www.taverncard.com/characters/${normalizedExternalId}`;
  }
  return '';
}

export function getRoleplayCharacterSourceOpenUrl(
  character: Pick<
    RoleplayCharacter,
    'sourceProviderId' | 'sourceExternalId' | 'sourceUrl' | 'sourceDownloadUrl'
  >
): string {
  return (
    character.sourceUrl ||
    buildRoleplaySourceExternalUrl(
      character.sourceProviderId,
      character.sourceExternalId,
      character.sourceUrl
    ) ||
    character.sourceDownloadUrl ||
    ''
  );
}

export function resolveKnownRoleplaySourceUrl(input: string): KnownSourceUrl | null {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(input.trim());
  } catch {
    return null;
  }

  const host = parsedUrl.hostname.toLowerCase();
  const segments = getPathSegments(parsedUrl);
  const uuidMatch = parsedUrl.href.match(
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i
  );

  if (
    uuidMatch &&
    (host === 'jannyai.com' ||
      host.endsWith('.jannyai.com') ||
      host === 'janitorai.com' ||
      host.endsWith('.janitorai.com') ||
      host === 'api.jannyai.com')
  ) {
    return {
      providerId: 'jannyai',
      externalId: uuidMatch[0],
      sourceUrl: parsedUrl.toString(),
      externalUrl: parsedUrl.toString(),
    };
  }

  if ((host === 'character-tavern.com' || host.endsWith('.character-tavern.com')) && segments.length >= 3) {
    if (segments[0] === 'character' || segments[0] === 'chat') {
      return {
        providerId: 'character-tavern',
        externalId: `${segments[1]}/${segments[2]}`,
        sourceUrl: parsedUrl.toString(),
        externalUrl: parsedUrl.toString(),
      };
    }
  }

  if (host === 'cards.character-tavern.com' && segments.length >= 2) {
    const externalId = `${segments[0]}/${segments[1].replace(/\.png$/i, '')}`;
    return {
      providerId: 'character-tavern',
      externalId,
      sourceUrl: parsedUrl.toString(),
      externalUrl: buildRoleplaySourceExternalUrl('character-tavern', externalId),
    };
  }

  if (
    (host === 'charavault.net' || host.endsWith('.charavault.net')) &&
    ((segments[0] === 'cards' && segments.length >= 3) ||
      (segments[0] === 'api' && segments[1] === 'cards' && segments.length >= 4))
  ) {
    const externalId =
      segments[0] === 'cards'
        ? `${segments[1]}/${segments[2]}`
        : `${segments[2]}/${segments[3]}`;
    return {
      providerId: 'charavault',
      externalId,
      sourceUrl: parsedUrl.toString(),
      externalUrl: buildRoleplaySourceExternalUrl('charavault', externalId, parsedUrl.toString()),
    };
  }

  if ((host === 'botbooru.com' || host.endsWith('.botbooru.com')) && segments.length >= 2) {
    if (
      (segments[0] === 'character' ||
        segments[0] === 'post' ||
        segments[0] === 'posts') &&
      segments[1]
    ) {
      return {
        providerId: 'botbooru',
        externalId: segments[1],
        sourceUrl: parsedUrl.toString(),
        externalUrl: buildRoleplaySourceExternalUrl('botbooru', segments[1], parsedUrl.toString()),
      };
    }
    if (segments[0] === 'download' && (segments[1] === 'png' || segments[1] === 'json') && segments[2]) {
      return {
        providerId: 'botbooru',
        externalId: segments[2],
        sourceUrl: parsedUrl.toString(),
        externalUrl: buildRoleplaySourceExternalUrl('botbooru', segments[2]),
      };
    }
  }

  return null;
}

export async function fetchRoleplayCardFromSource(
  providerId: string,
  externalId: string,
  sourceUrl = ''
): Promise<FetchedRoleplayCard> {
  const response = await swarmClient.post<RoleplayFetchCharacterCardUrlResponse>(
    'RoleplayFetchCharacterCardSource',
    { providerId, externalId, sourceUrl },
    { timeout: 45000 }
  );
  const result = response as RoleplayFetchCharacterCardUrlResponse;
  return createFetchedCardFromResponse(result, sourceUrl, providerId, externalId);
}

export async function fetchRoleplayCardFromUrl(url: string): Promise<FetchedRoleplayCard> {
  const trimmedUrl = url.trim();
  if (!trimmedUrl) {
    throw new Error('Enter a character card URL.');
  }
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(trimmedUrl);
  } catch {
    throw new Error('Enter a valid http or https URL.');
  }
  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    throw new Error('Only http and https URLs are supported.');
  }

  const knownSource = resolveKnownRoleplaySourceUrl(parsedUrl.toString());
  if (knownSource) {
    const fetchedCard = await fetchRoleplayCardFromSource(
      knownSource.providerId,
      knownSource.externalId,
      knownSource.sourceUrl
    );
    fetchedCard.sourceMetadata.sourceUrl = knownSource.externalUrl || knownSource.sourceUrl;
    fetchedCard.sourceMetadata.sourceDownloadUrl =
      fetchedCard.sourceMetadata.sourceDownloadUrl || fetchedCard.finalUrl;
    return fetchedCard;
  }

  let browserFetchError: Error | null = null;
  try {
    const response = await fetch(parsedUrl.toString(), {
      method: 'GET',
      credentials: 'omit',
      mode: 'cors',
    });
    if (!response.ok) {
      throw new Error(`${response.status} ${response.statusText}`);
    }
    const blob = await response.blob();
    const mimeType = inferMimeType(parsedUrl.pathname, blob.type);
    const fileName = inferFileName(response.url || parsedUrl.toString(), mimeType);
    return {
      file: new File([blob], fileName, { type: mimeType }),
      finalUrl: response.url || parsedUrl.toString(),
      mimeType,
      sourceMetadata: {
        sourceUrl: parsedUrl.toString(),
        sourceDownloadUrl: response.url || parsedUrl.toString(),
        sourceProviderId: 'direct-url',
        sourceExternalId: response.url || parsedUrl.toString(),
        sourceImportedAt: Date.now(),
        sourceLastCheckedAt: Date.now(),
      },
    };
  } catch (error) {
    browserFetchError = error instanceof Error ? error : new Error('Browser fetch failed.');
  }

  try {
    return await fetchViaSwarmProxy(parsedUrl.toString());
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw browserFetchError ?? new Error('Could not fetch this URL.');
  }
}

export async function searchRoleplayCardSources(
  params: RoleplaySourceSearchParams
): Promise<RoleplaySourceSearchResponse> {
  const response = await swarmClient.post<RoleplaySourceSearchResponse>(
    'RoleplaySearchCharacterCardSources',
    {
      providerId: params.providerId,
      query: params.query,
      page: params.page,
      contentRating: params.contentRating,
    },
    { timeout: 45000 }
  );
  const result = response as RoleplaySourceSearchResponse;
  if (result.error) {
    throw new Error(result.error);
  }
  return {
    ...result,
    results: Array.isArray(result.results) ? result.results : [],
    page: result.page ?? params.page,
    hasMore: result.hasMore ?? false,
  };
}

export async function previewFetchedRoleplayCard(
  fetchedCard: FetchedRoleplayCard
): Promise<RoleplayCardPreview> {
  const result = await parseTavernCardFile(fetchedCard.file);
  result.character.sourceUrl = fetchedCard.sourceMetadata.sourceUrl ?? fetchedCard.finalUrl;
  result.character.sourceDownloadUrl =
    fetchedCard.sourceMetadata.sourceDownloadUrl ?? fetchedCard.finalUrl;
  result.character.sourceProviderId = fetchedCard.sourceMetadata.sourceProviderId ?? '';
  result.character.sourceExternalId = fetchedCard.sourceMetadata.sourceExternalId ?? '';
  result.character.sourceImportedAt = fetchedCard.sourceMetadata.sourceImportedAt ?? null;
  result.character.sourceLastCheckedAt = fetchedCard.sourceMetadata.sourceLastCheckedAt ?? null;
  result.character.sourceLicense = fetchedCard.sourceMetadata.sourceLicense ?? '';
  result.character.sourceContentRating = fetchedCard.sourceMetadata.sourceContentRating ?? '';
  return {
    result,
    fileName: fetchedCard.file.name,
    finalUrl: fetchedCard.finalUrl,
    mimeType: fetchedCard.mimeType,
    sourceMetadata: fetchedCard.sourceMetadata,
  };
}

export async function previewRoleplayCardFile(file: File): Promise<RoleplayCardPreview> {
  const result = await parseTavernCardFile(file);
  const now = Date.now();
  const sourceMetadata: RoleplayCharacterSourceMetadata = {
    sourceUrl: '',
    sourceDownloadUrl: '',
    sourceProviderId: 'local-file',
    sourceExternalId: file.name,
    sourceImportedAt: now,
    sourceLastCheckedAt: now,
  };
  result.character.sourceUrl = '';
  result.character.sourceDownloadUrl = '';
  result.character.sourceProviderId = 'local-file';
  result.character.sourceExternalId = file.name;
  result.character.sourceImportedAt = now;
  result.character.sourceLastCheckedAt = now;
  return {
    result,
    fileName: file.name,
    finalUrl: '',
    mimeType: file.type || inferMimeType(file.name, null),
    sourceMetadata,
  };
}

export async function probeSillyTavernBridge(baseUrl: string): Promise<SillyTavernBridgeProbe> {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl || 'http://127.0.0.1:8000');
  try {
    const response = await fetch(
      `${normalizedBaseUrl}/api/plugins/${SILLYTAVERN_BRIDGE_PLUGIN_ID}/probe`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client: 'swarmui-roleplay' }),
      }
    );
    if (response.ok) {
      return {
        reachable: true,
        bridgeAvailable: true,
        baseUrl: normalizedBaseUrl,
        pluginId: SILLYTAVERN_BRIDGE_PLUGIN_ID,
        message: 'SillyTavern bridge plugin is available.',
      };
    }
    return {
      reachable: true,
      bridgeAvailable: false,
      baseUrl: normalizedBaseUrl,
      pluginId: SILLYTAVERN_BRIDGE_PLUGIN_ID,
      message: `SillyTavern responded, but the bridge plugin returned ${response.status}.`,
    };
  } catch (error) {
    return {
      reachable: false,
      bridgeAvailable: false,
      baseUrl: normalizedBaseUrl,
      pluginId: SILLYTAVERN_BRIDGE_PLUGIN_ID,
      message:
        error instanceof Error
          ? error.message
          : 'Could not reach SillyTavern from the browser.',
    };
  }
}

export async function listSillyTavernBridgeCharacters(
  baseUrl: string
): Promise<SillyTavernBridgeCharacter[]> {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
  const response = await fetch(
    `${normalizedBaseUrl}/api/plugins/${SILLYTAVERN_BRIDGE_PLUGIN_ID}/characters`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client: 'swarmui-roleplay' }),
    }
  );
  if (!response.ok) {
    throw new Error(`Bridge character list failed: ${response.status}`);
  }
  const data = (await response.json()) as { characters?: SillyTavernBridgeCharacter[] };
  return Array.isArray(data.characters) ? data.characters : [];
}

export async function fetchSillyTavernBridgeCharacterCard(
  baseUrl: string,
  characterId: string
): Promise<RoleplayCardPreview> {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
  const response = await fetch(
    `${normalizedBaseUrl}/api/plugins/${SILLYTAVERN_BRIDGE_PLUGIN_ID}/card`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client: 'swarmui-roleplay', characterId }),
    }
  );
  if (!response.ok) {
    throw new Error(`Bridge character import failed: ${response.status}`);
  }
  const data = (await response.json()) as {
    fileName?: string;
    mimeType?: string;
    dataBase64?: string;
    sourceExternalId?: string;
  };
  if (!data.dataBase64) {
    throw new Error('Bridge did not return character card data.');
  }
  const mimeType = data.mimeType || inferMimeType(data.fileName ?? '', null);
  const fileName = data.fileName || inferFileName(characterId, mimeType);
  return previewFetchedRoleplayCard({
    file: createFileFromBytes(base64ToBytes(data.dataBase64), fileName, mimeType),
    finalUrl: normalizedBaseUrl,
    mimeType,
    sourceMetadata: {
      sourceUrl: normalizedBaseUrl,
      sourceDownloadUrl: normalizedBaseUrl,
      sourceProviderId: 'sillytavern-bridge',
      sourceExternalId: data.sourceExternalId || characterId,
      sourceImportedAt: Date.now(),
      sourceLastCheckedAt: Date.now(),
    },
  });
}

export async function reimportRoleplayCharacterCard(
  character: Pick<
    RoleplayCharacter,
    'sourceProviderId' | 'sourceExternalId' | 'sourceUrl' | 'sourceDownloadUrl'
  >
): Promise<RoleplayCardPreview> {
  const providerId = (character.sourceProviderId || '').trim().toLowerCase();
  const sourceUrl = character.sourceUrl || '';
  const sourceDownloadUrl = character.sourceDownloadUrl || '';
  const sourceExternalId = character.sourceExternalId || '';
  if (providerId === 'local-file') {
    throw new Error('Local file imports cannot be re-imported automatically. Choose the file again.');
  }
  if (providerId === 'sillytavern-bridge') {
    if (!sourceExternalId) {
      throw new Error('This SillyTavern import is missing its source character id.');
    }
    return fetchSillyTavernBridgeCharacterCard(
      sourceUrl || sourceDownloadUrl || 'http://127.0.0.1:8000',
      sourceExternalId
    );
  }
  if (providerId && providerId !== 'direct-url') {
    const fetchedCard = await fetchRoleplayCardFromSource(
      providerId,
      sourceExternalId,
      sourceUrl || sourceDownloadUrl
    );
    fetchedCard.sourceMetadata.sourceUrl =
      sourceUrl ||
      buildRoleplaySourceExternalUrl(providerId, sourceExternalId, sourceUrl) ||
      fetchedCard.sourceMetadata.sourceUrl ||
      fetchedCard.finalUrl;
    fetchedCard.sourceMetadata.sourceDownloadUrl =
      fetchedCard.sourceMetadata.sourceDownloadUrl || fetchedCard.finalUrl;
    return previewFetchedRoleplayCard(fetchedCard);
  }
  const directUrl = sourceDownloadUrl || sourceUrl;
  if (!directUrl) {
    throw new Error('This character does not have enough source metadata to re-import.');
  }
  return previewFetchedRoleplayCard(await fetchRoleplayCardFromUrl(directUrl));
}

export const ROLEPLAY_CHARACTER_SOURCE_PROVIDERS: RoleplayCharacterSourceProvider[] = [
  {
    id: 'direct-url',
    label: 'Direct URL',
    kind: 'direct-url',
    supportsSearch: false,
    supportsDirectUrl: true,
    supportsExternalOpen: false,
    contentRatingMode: 'none',
    enabled: true,
    description: 'Import Tavern JSON or PNG character cards, plus known site character URLs.',
    fetchCard: fetchRoleplayCardFromUrl,
  },
  {
    id: 'local-file',
    label: 'Local File',
    kind: 'local-file',
    supportsSearch: false,
    supportsDirectUrl: false,
    supportsExternalOpen: false,
    contentRatingMode: 'none',
    enabled: true,
    description: 'Import Tavern V1/V2 JSON files and PNG cards from disk.',
  },
  {
    id: 'charavault',
    label: 'CharaVault',
    kind: 'source-browser',
    supportsSearch: true,
    supportsDirectUrl: false,
    supportsExternalOpen: true,
    contentRatingMode: 'sfw-default',
    enabled: true,
    externalUrl: 'https://charavault.net/',
    description: 'Search CharaVault and import public Tavern PNG character cards.',
  },
  {
    id: 'botbooru',
    label: 'Botbooru',
    kind: 'source-browser',
    supportsSearch: true,
    supportsDirectUrl: false,
    supportsExternalOpen: true,
    contentRatingMode: 'sfw-default',
    enabled: true,
    externalUrl: 'https://botbooru.com/',
    description: 'Search Botbooru public gallery entries and import Tavern character cards.',
  },
  {
    id: 'jannyai',
    label: 'JannyAI',
    kind: 'external-open',
    supportsSearch: false,
    supportsDirectUrl: true,
    supportsExternalOpen: true,
    contentRatingMode: 'none',
    enabled: true,
    externalUrl: 'https://jannyai.com/characters/search',
    description: 'Paste a JannyAI or JanitorAI character URL to import through JannyAI downloads.',
  },
  {
    id: 'character-tavern',
    label: 'Character Tavern',
    kind: 'external-open',
    supportsSearch: false,
    supportsDirectUrl: true,
    supportsExternalOpen: true,
    contentRatingMode: 'none',
    enabled: true,
    externalUrl: 'https://character-tavern.com/search/cards',
    description: 'Paste a Character Tavern character URL to import the compatible card PNG.',
  },
  {
    id: 'wyvern',
    label: 'WyvernChat',
    kind: 'external-open',
    supportsSearch: false,
    supportsDirectUrl: false,
    supportsExternalOpen: true,
    contentRatingMode: 'none',
    enabled: true,
    externalUrl: 'https://app.wyvern.chat/explore',
    description: 'Open WyvernChat externally. Built-in card export was not found in a stable public API.',
  },
  {
    id: 'sillytavern-bridge',
    label: 'SillyTavern Bridge',
    kind: 'sillytavern-bridge',
    supportsSearch: false,
    supportsDirectUrl: false,
    supportsExternalOpen: false,
    contentRatingMode: 'none',
    enabled: true,
    description: 'Connect to a running SillyTavern bridge plugin when installed.',
  },
  {
    id: 'chub',
    label: 'Chub',
    kind: 'external-open',
    supportsSearch: false,
    supportsDirectUrl: true,
    supportsExternalOpen: true,
    contentRatingMode: 'sfw-default',
    enabled: true,
    externalUrl: 'https://chub.ai/characters',
    description:
      'Open Chub externally, download the official PNG/JSON card, or paste a direct card URL. Built-in search waits for a stable public card API.',
  },
  {
    id: 'taverncard',
    label: 'TavernCard',
    kind: 'external-open',
    supportsSearch: false,
    supportsDirectUrl: true,
    supportsExternalOpen: true,
    contentRatingMode: 'sfw-default',
    enabled: true,
    externalUrl: 'https://www.taverncard.com/',
    description:
      'Open TavernCard externally and import downloaded PNG cards or direct card links. Public pages confirm PNG downloads, but no stable search API is wired here yet.',
  },
];

for (let index = 0; index < ROLEPLAY_CHARACTER_SOURCE_PROVIDERS.length; index += 1) {
  const provider = ROLEPLAY_CHARACTER_SOURCE_PROVIDERS[index];
  PROVIDER_LOOKUP[provider.id] = provider;
}
