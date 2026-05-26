import { useEffect, useMemo, useState } from 'react';
import {
  Badge,
  FileButton,
  Group,
  Loader,
  Modal,
  ScrollArea,
  Select,
  Stack,
  Tabs,
  Text,
  TextInput,
} from '@mantine/core';
import {
  IconDownload,
  IconExternalLink,
  IconFileImport,
  IconLink,
  IconSearch,
  IconUpload,
} from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { useShallow } from 'zustand/react/shallow';
import { SwarmButton } from '../../components/ui/SwarmButton';
import { ElevatedCard } from '../../components/ui/ElevatedCard';
import { useRoleplayStore } from '../../stores/roleplayStore';
import type { RoleplayCharacterImportMode } from '../../types/roleplay';
import {
  ROLEPLAY_CHARACTER_SOURCE_PROVIDERS,
  fetchRoleplayCardFromSource,
  fetchRoleplayCardFromUrl,
  previewFetchedRoleplayCard,
  previewRoleplayCardFile,
  searchRoleplayCardSources,
  type RoleplaySourceContentRating,
  type RoleplaySourceSearchResult,
} from '../../features/roleplay/roleplayCharacterSources';

interface CharacterSourceBrowserModalProps {
  opened: boolean;
  onClose: () => void;
}

const SEARCHABLE_PROVIDER_IDS = ROLEPLAY_CHARACTER_SOURCE_PROVIDERS.filter(
  (provider) => provider.enabled && (provider.supportsSearch || provider.supportsExternalOpen)
).map((provider) => provider.id);

const CONTENT_RATING_OPTIONS = [
  { value: 'sfw', label: 'SFW only' },
  { value: 'nsfw', label: 'NSFW only' },
  { value: 'all', label: 'All ratings' },
];

function openExternalUrl(url: string) {
  if (!url) {
    return;
  }
  window.open(url, '_blank', 'noopener,noreferrer');
}

export function CharacterSourceBrowserModal({
  opened,
  onClose,
}: CharacterSourceBrowserModalProps) {
  const [importMode, setImportMode] = useState<RoleplayCharacterImportMode>('create');
  const [targetCharacterId, setTargetCharacterId] = useState<string | null>(null);
  const [directUrl, setDirectUrl] = useState('');
  const [activeProviderId, setActiveProviderId] = useState(
    SEARCHABLE_PROVIDER_IDS[0] ?? 'charavault'
  );
  const [query, setQuery] = useState('');
  const [contentRating, setContentRating] = useState<RoleplaySourceContentRating>('sfw');
  const [page, setPage] = useState(1);
  const [results, setResults] = useState<RoleplaySourceSearchResult[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  const { activeCharacterId, characters, importCharacterCard } = useRoleplayStore(
    useShallow((state) => ({
      activeCharacterId: state.activeCharacterId,
      characters: state.characters,
      importCharacterCard: state.importCharacterCard,
    }))
  );

  const characterOptions = useMemo(
    () => characters.map((character) => ({ value: character.id, label: character.name })),
    [characters]
  );
  const characterById = useMemo(
    () => new Map(characters.map((character) => [character.id, character])),
    [characters]
  );
  const activeCharacterName = useMemo(
    () =>
      activeCharacterId
        ? (characterById.get(activeCharacterId)?.name ?? null)
        : null,
    [activeCharacterId, characterById]
  );

  const providerOptions = useMemo(
    () =>
      ROLEPLAY_CHARACTER_SOURCE_PROVIDERS.filter(
        (provider) => provider.enabled && (provider.supportsSearch || provider.supportsExternalOpen)
      ).map((provider) => ({
        value: provider.id,
        label: provider.label,
      })),
    []
  );

  const activeProvider = ROLEPLAY_CHARACTER_SOURCE_PROVIDERS.find(
    (provider) => provider.id === activeProviderId
  );

  useEffect(() => {
    if (opened) {
      queueMicrotask(() => {
        setTargetCharacterId(activeCharacterId);
      });
    }
  }, [activeCharacterId, opened]);

  const importPreview = async (
    previewPromise: ReturnType<typeof previewFetchedRoleplayCard> | ReturnType<typeof previewRoleplayCardFile>
  ) => {
    const preview = await previewPromise;
    if (importMode === 'replace' && !targetCharacterId) {
      throw new Error('Choose a character to replace before importing.');
    }
    importCharacterCard(preview.result, {
      mode: importMode,
      targetCharacterId: targetCharacterId ?? undefined,
      sourceMetadata: preview.sourceMetadata,
    });
    notifications.show({
      title: importMode === 'replace' ? 'Character Replaced' : 'Character Imported',
      message:
        importMode === 'replace'
          ? `${preview.result.character.name} was re-imported onto the selected character.`
          : `${preview.result.character.name} was added to the deck.`,
      color: 'green',
    });
    onClose();
  };

  const handleImportFile = async (file: File | null) => {
    if (!file) {
      return;
    }
    setIsImporting(true);
    try {
      await importPreview(previewRoleplayCardFile(file));
    } catch (error) {
      notifications.show({
        title: 'Import Failed',
        message: error instanceof Error ? error.message : 'Could not import this card.',
        color: 'red',
      });
    } finally {
      setIsImporting(false);
    }
  };

  const handleImportDirectUrl = async () => {
    const trimmedUrl = directUrl.trim();
    if (!trimmedUrl) {
      return;
    }
    setIsImporting(true);
    try {
      const fetched = await fetchRoleplayCardFromUrl(trimmedUrl);
      await importPreview(previewFetchedRoleplayCard(fetched));
      setDirectUrl('');
    } catch (error) {
      notifications.show({
        title: 'Import Failed',
        message: error instanceof Error ? error.message : 'Could not import from this URL.',
        color: 'red',
      });
    } finally {
      setIsImporting(false);
    }
  };

  const runSearch = async (nextPage = 1, append = false) => {
    if (!activeProvider?.supportsSearch) {
      return;
    }
    setIsSearching(true);
    try {
      const response = await searchRoleplayCardSources({
        providerId: activeProvider.id,
        query,
        page: nextPage,
        contentRating,
      });
      const nextResults = response.results ?? [];
      setResults((current) => (append ? [...current, ...nextResults] : nextResults));
      setHasMore(response.hasMore ?? false);
      setPage(nextPage);
    } catch (error) {
      notifications.show({
        title: 'Search Failed',
        message: error instanceof Error ? error.message : 'Could not search this source.',
        color: 'red',
      });
    } finally {
      setIsSearching(false);
    }
  };

  const handleProviderChange = (providerId: string | null) => {
    if (!providerId) {
      return;
    }
    setActiveProviderId(providerId);
    setResults([]);
    setHasMore(false);
    setPage(1);
  };

  const handleImportSourceResult = async (result: RoleplaySourceSearchResult) => {
    setIsImporting(true);
    try {
      const fetched = await fetchRoleplayCardFromSource(
        result.providerId,
        result.externalId,
        result.externalUrl || result.sourceUrl
      );
      fetched.sourceMetadata.sourceUrl = result.externalUrl || result.sourceUrl;
      fetched.sourceMetadata.sourceDownloadUrl =
        fetched.sourceMetadata.sourceDownloadUrl || fetched.finalUrl;
      fetched.sourceMetadata.sourceProviderId = result.providerId;
      fetched.sourceMetadata.sourceExternalId = result.externalId;
      fetched.sourceMetadata.sourceContentRating = result.contentRating;
      await importPreview(previewFetchedRoleplayCard(fetched));
    } catch (error) {
      notifications.show({
        title: 'Import Failed',
        message: error instanceof Error ? error.message : 'Could not import this source card.',
        color: 'red',
      });
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Import Character Card"
      size="xl"
      scrollAreaComponent={ScrollArea.Autosize}
    >
      <Tabs defaultValue="url">
        <Tabs.List>
          <Tabs.Tab value="url" leftSection={<IconLink size={14} />}>
            Direct URL
          </Tabs.Tab>
          <Tabs.Tab value="file" leftSection={<IconUpload size={14} />}>
            Local File
          </Tabs.Tab>
          <Tabs.Tab value="browse" leftSection={<IconSearch size={14} />}>
            Browse Sources
          </Tabs.Tab>
        </Tabs.List>

        <Stack gap="sm" pt="md">
          <Select
            label="Import Mode"
            value={importMode}
            data={[
              { value: 'create', label: 'Create New Character' },
              { value: 'replace', label: 'Replace Existing Character' },
              { value: 'duplicate', label: 'Duplicate Imported Character' },
            ]}
            onChange={(value) =>
              setImportMode((value ?? 'create') as RoleplayCharacterImportMode)
            }
            allowDeselect={false}
          />
          {importMode === 'replace' ? (
            <Select
              label="Replace Character"
              value={targetCharacterId}
              data={characterOptions}
              placeholder="Choose a character"
              onChange={setTargetCharacterId}
              searchable
            />
          ) : null}
          {importMode !== 'replace' && activeCharacterId ? (
            <Text size="xs" c="dimmed">
              Active character: {activeCharacterName}
            </Text>
          ) : null}
        </Stack>

        <Tabs.Panel value="url" pt="md">
          <Stack gap="sm">
            <TextInput
              label="Card or character URL"
              description="Supports direct Tavern PNG/JSON URLs plus JannyAI, JanitorAI, Character Tavern, Botbooru, and CharaVault URLs."
              placeholder="https://..."
              value={directUrl}
              onChange={(event) => setDirectUrl(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  void handleImportDirectUrl();
                }
              }}
            />
            <Group justify="flex-end">
              <SwarmButton
                tone="brand"
                emphasis="solid"
                leftSection={isImporting ? <Loader size={14} /> : <IconDownload size={14} />}
                disabled={!directUrl.trim() || isImporting}
                onClick={() => void handleImportDirectUrl()}
              >
                Import URL
              </SwarmButton>
            </Group>
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel value="file" pt="md">
          <Stack gap="sm">
            <Text size="sm" c="dimmed">
              Import Tavern V1/V2 JSON files or PNG character cards from disk.
            </Text>
            <Group justify="flex-end">
              <FileButton onChange={handleImportFile} accept="application/json,image/png,.json,.png">
                {(props) => (
                  <SwarmButton
                    {...props}
                    tone="brand"
                    emphasis="solid"
                    leftSection={isImporting ? <Loader size={14} /> : <IconFileImport size={14} />}
                    disabled={isImporting}
                  >
                    Choose Card File
                  </SwarmButton>
                )}
              </FileButton>
            </Group>
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel value="browse" pt="md">
          <Stack gap="sm">
            <Group align="end" grow>
              <Select
                label="Source"
                data={providerOptions}
                value={activeProviderId}
                onChange={handleProviderChange}
                allowDeselect={false}
              />
              <Select
                label="Rating"
                data={CONTENT_RATING_OPTIONS}
                value={contentRating}
                onChange={(value) =>
                  setContentRating((value as RoleplaySourceContentRating | null) ?? 'sfw')
                }
                disabled={activeProvider?.contentRatingMode === 'none'}
                allowDeselect={false}
              />
            </Group>

            <Text size="xs" c="dimmed">
              {activeProvider?.description}
            </Text>

            {activeProvider?.supportsSearch ? (
              <>
                <Group align="end" wrap="nowrap">
                  <TextInput
                    label="Search"
                    placeholder="Character name, creator, or tag"
                    value={query}
                    onChange={(event) => setQuery(event.currentTarget.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        void runSearch(1, false);
                      }
                    }}
                    style={{ flex: 1 }}
                  />
                  <SwarmButton
                    tone="brand"
                    emphasis="solid"
                    leftSection={isSearching ? <Loader size={14} /> : <IconSearch size={14} />}
                    disabled={isSearching}
                    onClick={() => void runSearch(1, false)}
                  >
                    Search
                  </SwarmButton>
                </Group>

                {results.length === 0 && !isSearching ? (
                  <Text size="sm" c="dimmed" ta="center" py="xl">
                    Search this source to preview importable cards.
                  </Text>
                ) : null}

                <Stack gap="xs">
                  {results.map((result) => (
                    <ElevatedCard key={`${result.providerId}:${result.externalId}`} elevation="paper">
                      <Group align="flex-start" wrap="nowrap">
                        <div className="roleplay-source-card-thumb">
                          {result.thumbnailUrl ? <img src={result.thumbnailUrl} alt="" /> : null}
                        </div>
                        <Stack gap={4} style={{ minWidth: 0, flex: 1 }}>
                          <Group gap="xs" wrap="nowrap">
                            <Text size="sm" fw={700} truncate>
                              {result.title}
                            </Text>
                            <Badge size="xs" variant="light">
                              {result.contentRating || 'unknown'}
                            </Badge>
                          </Group>
                          {result.creator ? (
                            <Text size="xs" c="dimmed" truncate>
                              {result.creator}
                            </Text>
                          ) : null}
                          <Text size="xs" c="dimmed" lineClamp={2}>
                            {result.description || 'No description available.'}
                          </Text>
                          <Group gap={4} wrap="wrap">
                            {result.tags.slice(0, 6).map((tag) => (
                              <Badge key={tag} size="xs" variant="outline">
                                {tag}
                              </Badge>
                            ))}
                          </Group>
                        </Stack>
                        <Stack gap={4}>
                          <SwarmButton
                            tone="brand"
                            emphasis="soft"
                            size="xs"
                            leftSection={<IconDownload size={12} />}
                            disabled={isImporting}
                            onClick={() => void handleImportSourceResult(result)}
                          >
                            Import
                          </SwarmButton>
                          {result.externalUrl ? (
                            <SwarmButton
                              tone="secondary"
                              emphasis="ghost"
                              size="xs"
                              leftSection={<IconExternalLink size={12} />}
                              onClick={() => openExternalUrl(result.externalUrl)}
                            >
                              Open
                            </SwarmButton>
                          ) : null}
                        </Stack>
                      </Group>
                    </ElevatedCard>
                  ))}
                </Stack>

                {hasMore ? (
                  <Group justify="center">
                    <SwarmButton
                      tone="secondary"
                      emphasis="soft"
                      disabled={isSearching}
                      onClick={() => void runSearch(page + 1, true)}
                    >
                      Load More
                    </SwarmButton>
                  </Group>
                ) : null}
              </>
            ) : (
              <Stack gap="sm" align="center" py="xl">
                <Text size="sm" c="dimmed" ta="center">
                  This source does not currently expose a stable public card search API.
                </Text>
                <SwarmButton
                  tone="brand"
                  emphasis="soft"
                  leftSection={<IconExternalLink size={14} />}
                  onClick={() => openExternalUrl(activeProvider?.externalUrl ?? '')}
                >
                  Open Source
                </SwarmButton>
              </Stack>
            )}
          </Stack>
        </Tabs.Panel>
      </Tabs>
    </Modal>
  );
}
