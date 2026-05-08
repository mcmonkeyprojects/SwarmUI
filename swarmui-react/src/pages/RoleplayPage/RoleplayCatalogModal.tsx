import { useMemo, useState } from 'react';
import {
  Alert,
  Badge,
  Divider,
  FileButton,
  Grid,
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
  IconFileImport,
  IconPlugConnected,
  IconPlus,
  IconSearch,
} from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { useShallow } from 'zustand/react/shallow';
import { ROLEPLAY_CATALOG_CATEGORIES, ROLEPLAY_CATALOG_TEMPLATES } from '../../data/roleplayCatalog';
import {
  ROLEPLAY_CHARACTER_SOURCE_PROVIDERS,
  fetchRoleplayCardFromUrl,
  fetchSillyTavernBridgeCharacterCard,
  listSillyTavernBridgeCharacters,
  previewFetchedRoleplayCard,
  previewRoleplayCardFile,
  probeSillyTavernBridge,
  type RoleplayCardPreview,
  type SillyTavernBridgeCharacter,
  type SillyTavernBridgeProbe,
} from '../../features/roleplay/roleplayCharacterSources';
import { useRoleplayStore } from '../../stores/roleplayStore';
import type { RoleplayCatalogTemplate, RoleplayCharacterImportMode } from '../../types/roleplay';
import { ElevatedCard } from '../../components/ui/ElevatedCard';
import { SwarmButton } from '../../components/ui/SwarmButton';

interface RoleplayCatalogModalProps {
  opened: boolean;
  onClose: () => void;
}

function categoryLabel(category: string): string {
  return category
    .split('-')
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(' ');
}

function templateMatchesSearch(template: RoleplayCatalogTemplate, query: string): boolean {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return true;
  }
  return [
    template.name,
    template.category,
    template.shortDescription,
    template.description,
    template.scenario,
    ...template.tags,
  ]
    .join(' ')
    .toLowerCase()
    .includes(normalizedQuery);
}

function getPreviewGreeting(preview: RoleplayCardPreview): string {
  return (
    preview.result.character.openingRoleplayMessage ||
    preview.result.character.openingChatMessage ||
    preview.result.character.alternateGreetings[0] ||
    ''
  );
}

export function RoleplayCatalogModal({ opened, onClose }: RoleplayCatalogModalProps) {
  const [activeTab, setActiveTab] = useState<string | null>('local');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState(
    ROLEPLAY_CATALOG_TEMPLATES[0]?.id ?? ''
  );
  const [cardUrl, setCardUrl] = useState('');
  const [cardPreview, setCardPreview] = useState<RoleplayCardPreview | null>(null);
  const [importMode, setImportMode] = useState<RoleplayCharacterImportMode>('create');
  const [targetCharacterId, setTargetCharacterId] = useState<string | null>(null);
  const [isLoadingCard, setIsLoadingCard] = useState(false);
  const [sillyTavernBaseUrl, setSillyTavernBaseUrl] = useState('http://127.0.0.1:8000');
  const [sillyTavernProbe, setSillyTavernProbe] = useState<SillyTavernBridgeProbe | null>(null);
  const [sillyTavernCharacters, setSillyTavernCharacters] = useState<SillyTavernBridgeCharacter[]>([]);
  const [isProbingSillyTavern, setIsProbingSillyTavern] = useState(false);

  const {
    characters,
    activeCharacterId,
    createCharacterFromTemplate,
    importCharacterCard,
  } = useRoleplayStore(
    useShallow((state) => ({
      characters: state.characters,
      activeCharacterId: state.activeCharacterId,
      createCharacterFromTemplate: state.createCharacterFromTemplate,
      importCharacterCard: state.importCharacterCard,
    }))
  );

  const characterOptions = useMemo(
    () => characters.map((character) => ({ value: character.id, label: character.name })),
    [characters]
  );

  const templates = useMemo(
    () =>
      ROLEPLAY_CATALOG_TEMPLATES.filter((template) => {
        if (category && template.category !== category) {
          return false;
        }
        return templateMatchesSearch(template, search);
      }),
    [category, search]
  );
  const selectedTemplate =
    ROLEPLAY_CATALOG_TEMPLATES.find((template) => template.id === selectedTemplateId) ??
    templates[0] ??
    null;

  const handleCreate = (template: RoleplayCatalogTemplate) => {
    createCharacterFromTemplate(template);
    notifications.show({
      title: 'Character Created',
      message: `${template.name} is ready to chat.`,
      color: 'green',
    });
    onClose();
  };

  const handlePreviewFile = async (file: File | null) => {
    if (!file) {
      return;
    }
    setIsLoadingCard(true);
    try {
      const preview = await previewRoleplayCardFile(file);
      setCardPreview(preview);
      setImportMode('create');
      setTargetCharacterId(activeCharacterId);
      setActiveTab('import-file');
    } catch (error) {
      notifications.show({
        title: 'Import Failed',
        message: error instanceof Error ? error.message : 'Could not import Tavern card.',
        color: 'red',
      });
    } finally {
      setIsLoadingCard(false);
    }
  };

  const handlePreviewUrl = async () => {
    setIsLoadingCard(true);
    try {
      const fetchedCard = await fetchRoleplayCardFromUrl(cardUrl);
      const preview = await previewFetchedRoleplayCard(fetchedCard);
      setCardPreview(preview);
      setImportMode('create');
      setTargetCharacterId(activeCharacterId);
    } catch (error) {
      notifications.show({
        title: 'URL Import Failed',
        message: error instanceof Error ? error.message : 'Could not fetch this card URL.',
        color: 'red',
      });
    } finally {
      setIsLoadingCard(false);
    }
  };

  const handleCommitPreview = () => {
    if (!cardPreview) {
      return;
    }
    if (importMode === 'replace' && !targetCharacterId) {
      notifications.show({
        title: 'Choose Character',
        message: 'Pick a character to replace.',
        color: 'orange',
      });
      return;
    }
    importCharacterCard(cardPreview.result, {
      mode: importMode,
      targetCharacterId: targetCharacterId ?? undefined,
      sourceMetadata: cardPreview.sourceMetadata,
    });
    notifications.show({
      title: importMode === 'replace' ? 'Character Replaced' : 'Character Imported',
      message: `${cardPreview.result.character.name} is ready in the deck.`,
      color: 'green',
    });
    setCardPreview(null);
    onClose();
  };

  const handleProbeSillyTavern = async () => {
    setIsProbingSillyTavern(true);
    setSillyTavernCharacters([]);
    try {
      const probe = await probeSillyTavernBridge(sillyTavernBaseUrl);
      setSillyTavernProbe(probe);
      if (probe.bridgeAvailable) {
        setSillyTavernCharacters(await listSillyTavernBridgeCharacters(probe.baseUrl));
      }
    } catch (error) {
      notifications.show({
        title: 'SillyTavern Probe Failed',
        message: error instanceof Error ? error.message : 'Could not probe SillyTavern.',
        color: 'red',
      });
    } finally {
      setIsProbingSillyTavern(false);
    }
  };

  const handleImportSillyTavernCharacter = async (characterId: string) => {
    if (!sillyTavernProbe?.bridgeAvailable) {
      return;
    }
    setIsLoadingCard(true);
    try {
      const preview = await fetchSillyTavernBridgeCharacterCard(
        sillyTavernProbe.baseUrl,
        characterId
      );
      setCardPreview(preview);
      setImportMode('create');
      setTargetCharacterId(activeCharacterId);
      setActiveTab('import-file');
    } catch (error) {
      notifications.show({
        title: 'Bridge Import Failed',
        message: error instanceof Error ? error.message : 'Could not import this character.',
        color: 'red',
      });
    } finally {
      setIsLoadingCard(false);
    }
  };

  return (
    <Modal opened={opened} onClose={onClose} title="Character Hub" size="95%">
      <Tabs value={activeTab} onChange={setActiveTab} keepMounted={false}>
        <Tabs.List>
          <Tabs.Tab value="local">Local Catalog</Tabs.Tab>
          <Tabs.Tab value="import-file">Import File</Tabs.Tab>
          <Tabs.Tab value="import-url">Import URL</Tabs.Tab>
          <Tabs.Tab value="sillytavern">SillyTavern</Tabs.Tab>
          <Tabs.Tab value="sources">Sources</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="local" pt="md">
          <Grid gutter="md">
            <Grid.Col span={{ base: 12, md: 4 }}>
              <Stack gap="xs">
                <TextInput
                  leftSection={<IconSearch size={14} />}
                  placeholder="Search templates, tags, scenes..."
                  value={search}
                  onChange={(event) => setSearch(event.currentTarget.value)}
                />
                <Select
                  clearable
                  placeholder="All categories"
                  value={category}
                  data={ROLEPLAY_CATALOG_CATEGORIES.map((entry) => ({
                    value: entry,
                    label: categoryLabel(entry),
                  }))}
                  onChange={setCategory}
                />
                <Text size="xs" c="dimmed">
                  {ROLEPLAY_CATALOG_TEMPLATES.length} local templates.
                </Text>
                <ScrollArea h={560}>
                  <Stack gap="xs">
                    {templates.map((template) => (
                      <ElevatedCard
                        key={template.id}
                        elevation={template.id === selectedTemplate?.id ? 'raised' : 'paper'}
                        tone={template.id === selectedTemplate?.id ? 'brand' : 'neutral'}
                        interactive
                        onClick={() => setSelectedTemplateId(template.id)}
                      >
                        <Stack gap={6}>
                          <Group justify="space-between" wrap="nowrap">
                            <Text size="sm" fw={700} truncate>
                              {template.name}
                            </Text>
                            <Badge size="xs" variant="light">
                              {categoryLabel(template.category)}
                            </Badge>
                          </Group>
                          <Text size="xs" c="dimmed" lineClamp={2}>
                            {template.shortDescription}
                          </Text>
                          <Group gap={4}>
                            {template.tags.slice(0, 4).map((tag) => (
                              <Badge key={tag} size="xs" variant="outline">
                                {tag}
                              </Badge>
                            ))}
                          </Group>
                        </Stack>
                      </ElevatedCard>
                    ))}
                  </Stack>
                </ScrollArea>
              </Stack>
            </Grid.Col>

            <Grid.Col span={{ base: 12, md: 8 }}>
              {selectedTemplate ? (
                <Stack gap="sm">
                  <div
                    className="roleplay-catalog-preview"
                    style={{ background: selectedTemplate.thumbnail }}
                  >
                    <Stack gap="xs">
                      <Text size="xl" fw={800}>
                        {selectedTemplate.name}
                      </Text>
                      <Text size="sm">{selectedTemplate.shortDescription}</Text>
                      <Group gap={4}>
                        {selectedTemplate.tags.map((tag) => (
                          <Badge key={tag} size="xs" variant="filled">
                            {tag}
                          </Badge>
                        ))}
                      </Group>
                    </Stack>
                  </div>

                  <Grid gutter="sm">
                    <Grid.Col span={{ base: 12, sm: 6 }}>
                      <ElevatedCard elevation="floor">
                        <Stack gap={6}>
                          <Text size="xs" fw={700}>
                            Personality
                          </Text>
                          <Text size="sm" c="dimmed" style={{ whiteSpace: 'pre-wrap' }}>
                            {selectedTemplate.personality}
                          </Text>
                        </Stack>
                      </ElevatedCard>
                    </Grid.Col>
                    <Grid.Col span={{ base: 12, sm: 6 }}>
                      <ElevatedCard elevation="floor">
                        <Stack gap={6}>
                          <Text size="xs" fw={700}>
                            Scenario
                          </Text>
                          <Text size="sm" c="dimmed">
                            {selectedTemplate.scenario}
                          </Text>
                        </Stack>
                      </ElevatedCard>
                    </Grid.Col>
                    <Grid.Col span={12}>
                      <ElevatedCard elevation="floor">
                        <Stack gap={6}>
                          <Text size="xs" fw={700}>
                            Opening
                          </Text>
                          <Text size="sm" c="dimmed" style={{ whiteSpace: 'pre-wrap' }}>
                            {selectedTemplate.openingRoleplayMessage}
                          </Text>
                        </Stack>
                      </ElevatedCard>
                    </Grid.Col>
                  </Grid>

                  <Group justify="flex-end">
                    <SwarmButton
                      tone="brand"
                      emphasis="solid"
                      leftSection={<IconPlus size={16} />}
                      onClick={() => handleCreate(selectedTemplate)}
                    >
                      Create Character
                    </SwarmButton>
                  </Group>
                </Stack>
              ) : (
                <Text size="sm" c="dimmed">
                  No catalog templates match the current filter.
                </Text>
              )}
            </Grid.Col>
          </Grid>
        </Tabs.Panel>

        <Tabs.Panel value="import-file" pt="md">
          <Grid gutter="md">
            <Grid.Col span={{ base: 12, md: 4 }}>
              <Stack gap="sm">
                <FileButton onChange={handlePreviewFile} accept="application/json,image/png,.json,.png">
                  {(props) => (
                    <SwarmButton
                      {...props}
                      tone="brand"
                      emphasis="solid"
                      leftSection={<IconFileImport size={16} />}
                    >
                      Choose Tavern Card
                    </SwarmButton>
                  )}
                </FileButton>
                <Text size="sm" c="dimmed">
                  Supports Tavern V1/V2 JSON and PNG cards with readable `chara` metadata.
                </Text>
                {isLoadingCard ? (
                  <Group gap="xs">
                    <Loader size="sm" />
                    <Text size="sm">Reading card...</Text>
                  </Group>
                ) : null}
              </Stack>
            </Grid.Col>
            <Grid.Col span={{ base: 12, md: 8 }}>
              <ImportPreviewPanel
                preview={cardPreview}
                importMode={importMode}
                targetCharacterId={targetCharacterId}
                characterOptions={characterOptions}
                onModeChange={setImportMode}
                onTargetChange={setTargetCharacterId}
                onCommit={handleCommitPreview}
              />
            </Grid.Col>
          </Grid>
        </Tabs.Panel>

        <Tabs.Panel value="import-url" pt="md">
          <Grid gutter="md">
            <Grid.Col span={{ base: 12, md: 4 }}>
              <Stack gap="sm">
                <TextInput
                  label="Card URL"
                  placeholder="https://example.com/character.png"
                  value={cardUrl}
                  onChange={(event) => setCardUrl(event.currentTarget.value)}
                />
                <SwarmButton
                  tone="brand"
                  emphasis="solid"
                  leftSection={isLoadingCard ? <Loader size={14} /> : <IconDownload size={16} />}
                  onClick={() => void handlePreviewUrl()}
                  disabled={!cardUrl.trim() || isLoadingCard}
                >
                  Fetch Preview
                </SwarmButton>
                <Text size="sm" c="dimmed">
                  Direct browser fetch is tried first. If the host blocks CORS, Swarm will use the safe card proxy.
                </Text>
              </Stack>
            </Grid.Col>
            <Grid.Col span={{ base: 12, md: 8 }}>
              <ImportPreviewPanel
                preview={cardPreview}
                importMode={importMode}
                targetCharacterId={targetCharacterId}
                characterOptions={characterOptions}
                onModeChange={setImportMode}
                onTargetChange={setTargetCharacterId}
                onCommit={handleCommitPreview}
              />
            </Grid.Col>
          </Grid>
        </Tabs.Panel>

        <Tabs.Panel value="sillytavern" pt="md">
          <Grid gutter="md">
            <Grid.Col span={{ base: 12, md: 4 }}>
              <Stack gap="sm">
                <TextInput
                  label="SillyTavern URL"
                  value={sillyTavernBaseUrl}
                  onChange={(event) => setSillyTavernBaseUrl(event.currentTarget.value)}
                />
                <Group gap="xs">
                  <SwarmButton
                    tone="brand"
                    emphasis="solid"
                    leftSection={
                      isProbingSillyTavern ? <Loader size={14} /> : <IconPlugConnected size={16} />
                    }
                    onClick={() => void handleProbeSillyTavern()}
                    disabled={isProbingSillyTavern}
                  >
                    Probe
                  </SwarmButton>
                  <SwarmButton
                    tone="secondary"
                    emphasis="ghost"
                    onClick={() => window.open(sillyTavernBaseUrl, '_blank', 'noopener,noreferrer')}
                  >
                    Open ST
                  </SwarmButton>
                </Group>
                {sillyTavernProbe ? (
                  <Alert color={sillyTavernProbe.bridgeAvailable ? 'green' : 'orange'}>
                    {sillyTavernProbe.message}
                  </Alert>
                ) : null}
                <Text size="sm" c="dimmed">
                  Without the Swarm bridge plugin, use exported ST cards through Import File or a direct card URL.
                </Text>
              </Stack>
            </Grid.Col>
            <Grid.Col span={{ base: 12, md: 8 }}>
              {sillyTavernProbe?.bridgeAvailable ? (
                <Stack gap="xs">
                  <Text size="sm" fw={700}>
                    Bridge Characters
                  </Text>
                  {sillyTavernCharacters.length > 0 ? (
                    <ScrollArea h={440}>
                      <Stack gap="xs">
                        {sillyTavernCharacters.map((character) => (
                          <ElevatedCard key={character.id} elevation="paper">
                            <Group justify="space-between" align="flex-start">
                              <Stack gap={4} style={{ minWidth: 0 }}>
                                <Text fw={700}>{character.name}</Text>
                                <Text size="sm" c="dimmed" lineClamp={2}>
                                  {character.description || 'No description from bridge.'}
                                </Text>
                                <Group gap={4}>
                                  {(character.tags ?? []).slice(0, 5).map((tag) => (
                                    <Badge key={tag} size="xs" variant="outline">
                                      {tag}
                                    </Badge>
                                  ))}
                                </Group>
                              </Stack>
                              <SwarmButton
                                tone="brand"
                                emphasis="ghost"
                                size="xs"
                                onClick={() => void handleImportSillyTavernCharacter(character.id)}
                              >
                                Preview
                              </SwarmButton>
                            </Group>
                          </ElevatedCard>
                        ))}
                      </Stack>
                    </ScrollArea>
                  ) : (
                    <Text size="sm" c="dimmed">
                      The bridge is available but returned no characters.
                    </Text>
                  )}
                </Stack>
              ) : (
                <ImportPreviewPanel
                  preview={cardPreview}
                  importMode={importMode}
                  targetCharacterId={targetCharacterId}
                  characterOptions={characterOptions}
                  onModeChange={setImportMode}
                  onTargetChange={setTargetCharacterId}
                  onCommit={handleCommitPreview}
                />
              )}
            </Grid.Col>
          </Grid>
        </Tabs.Panel>

        <Tabs.Panel value="sources" pt="md">
          <Stack gap="sm">
            {ROLEPLAY_CHARACTER_SOURCE_PROVIDERS.map((provider) => (
              <ElevatedCard key={provider.id} elevation="paper" tone={provider.enabled ? 'neutral' : 'brand'}>
                <Group justify="space-between" align="flex-start">
                  <Stack gap={4}>
                    <Group gap="xs">
                      <Text fw={700}>{provider.label}</Text>
                      <Badge size="xs" color={provider.enabled ? 'green' : 'gray'}>
                        {provider.enabled ? 'Enabled' : 'Planned'}
                      </Badge>
                    </Group>
                    <Text size="sm" c="dimmed">
                      {provider.description}
                    </Text>
                    <Text size="xs" c="dimmed">
                      Search: {provider.supportsSearch ? 'yes' : 'no'} · Direct URL:{' '}
                      {provider.supportsDirectUrl ? 'yes' : 'no'}
                    </Text>
                  </Stack>
                </Group>
              </ElevatedCard>
            ))}
          </Stack>
        </Tabs.Panel>
      </Tabs>
    </Modal>
  );
}

interface ImportPreviewPanelProps {
  preview: RoleplayCardPreview | null;
  importMode: RoleplayCharacterImportMode;
  targetCharacterId: string | null;
  characterOptions: Array<{ value: string; label: string }>;
  onModeChange: (mode: RoleplayCharacterImportMode) => void;
  onTargetChange: (id: string | null) => void;
  onCommit: () => void;
}

function ImportPreviewPanel({
  preview,
  importMode,
  targetCharacterId,
  characterOptions,
  onModeChange,
  onTargetChange,
  onCommit,
}: ImportPreviewPanelProps) {
  if (!preview) {
    return (
      <ElevatedCard elevation="floor">
        <Text size="sm" c="dimmed">
          Choose a file, fetch a URL, or preview a bridge character to inspect it before importing.
        </Text>
      </ElevatedCard>
    );
  }

  const character = preview.result.character;
  const greeting = getPreviewGreeting(preview);

  return (
    <Stack gap="sm">
      <ElevatedCard elevation="raised" tone="brand">
        <Stack gap="xs">
          <Group justify="space-between" align="flex-start">
            <Stack gap={4} style={{ minWidth: 0 }}>
              <Text size="xl" fw={800}>
                {character.name}
              </Text>
              <Text size="sm" c="dimmed">
                {character.creator || 'Unknown creator'}
                {character.characterVersion ? ` · v${character.characterVersion}` : ''}
              </Text>
            </Stack>
            <Badge variant="filled">{character.sourceFormat}</Badge>
          </Group>
          <Group gap={4}>
            {character.tags.slice(0, 8).map((tag) => (
              <Badge key={tag} size="xs" variant="outline">
                {tag}
              </Badge>
            ))}
          </Group>
          <Divider />
          <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>
            {character.description || character.personality || 'No description supplied.'}
          </Text>
          {greeting ? (
            <Text size="sm" c="dimmed" style={{ whiteSpace: 'pre-wrap' }} lineClamp={4}>
              {greeting}
            </Text>
          ) : null}
          <Text size="xs" c="dimmed">
            {preview.fileName} · {preview.mimeType} · {preview.result.lorebooks.length} lorebook(s)
          </Text>
          {preview.finalUrl ? (
            <Text size="xs" c="dimmed" lineClamp={1}>
              Source: {preview.finalUrl}
            </Text>
          ) : null}
        </Stack>
      </ElevatedCard>

      <ElevatedCard elevation="floor">
        <Stack gap="sm">
          <Select
            label="Import Mode"
            value={importMode}
            data={[
              { value: 'create', label: 'Create New' },
              { value: 'replace', label: 'Replace Existing' },
              { value: 'duplicate', label: 'Duplicate Existing' },
            ]}
            onChange={(value) => onModeChange((value ?? 'create') as RoleplayCharacterImportMode)}
            allowDeselect={false}
          />
          {importMode === 'replace' ? (
            <Select
              label="Replace Character"
              value={targetCharacterId}
              data={characterOptions}
              onChange={onTargetChange}
              placeholder="Choose a character"
            />
          ) : null}
          <Group justify="flex-end">
            <SwarmButton tone="brand" emphasis="solid" onClick={onCommit}>
              {importMode === 'replace' ? 'Replace Character' : 'Import Character'}
            </SwarmButton>
          </Group>
        </Stack>
      </ElevatedCard>
    </Stack>
  );
}
