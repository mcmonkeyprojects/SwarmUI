import { useState, useEffect, useMemo, type MouseEvent } from 'react';
import { useDebounce } from '../hooks/useDebounce';
import { logger } from '../utils/logger';
import { Z_INDEX } from '../utils/zIndex';
import {
  Stack,
  Group,
  Text,
  TextInput,
  Card,
  Slider,
  ScrollArea,
  Loader,
  Center,
  Divider,
  NumberInput,
  Tooltip,
  Box,
  Paper,
} from '@mantine/core';
import { FloatingWindow } from './FloatingWindow';
import {
  IconSearch,
  IconPlus,
  IconX,
  IconLayoutGrid,
  IconLayoutList,
  IconPhoto,
  IconChevronDown,
  IconFolder,
  IconRefresh,
} from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { useQuery } from '@tanstack/react-query';
import { swarmClient } from '../api/client';
import type { LoRA, LoRASelection } from '../api/types';
import { LazyImage } from './LazyImage';
import { ModelDetailModal } from './ModelDetailModal';
import { HeadlessCombobox } from './headless/HeadlessCombobox';
import { SwarmActionIcon, SwarmBadge, SwarmButton, SwarmSegmentedControl } from './ui';
import { VirtualGrid } from './VirtualGrid';
import {
  BROWSER_THUMBNAIL_SIZES,
  BROWSER_THUMBNAIL_SIZE_OPTIONS,
  DEFAULT_THUMBNAIL_SIZE,
  type ThumbnailSize,
} from './browserThumbnailSizes';
import { featureFlags } from '../config/featureFlags';
import { useWorkerFilter } from '../hooks/useWorker';
import { queryKeys } from '../api/queryClient';

interface LoRABrowserProps {
  opened: boolean;
  onClose: () => void;
  selectedLoras: LoRASelection[];
  onLoraChange: (loras: LoRASelection[]) => void;
  onAddToPrompt?: (text: string) => void; // Callback to add trigger text to prompt
}

type ViewMode = 'cards' | 'list' | 'icons';
type ModelFilter = 'all' | 'sdxl' | 'sd15' | 'pony' | 'flux' | 'illustrious' | 'other';

const LORA_SEARCH_FIELDS: (keyof LoRA)[] = ['name', 'title', 'description', 'activationText', 'folder'];
const LORA_BROWSER_VIEW_MODE_OPTIONS = [
  {
    value: 'cards',
    label: (
      <Center style={{ gap: 6 }}>
        <IconLayoutGrid size={16} />
        <span>Cards</span>
      </Center>
    ),
  },
  {
    value: 'list',
    label: (
      <Center style={{ gap: 6 }}>
        <IconLayoutList size={16} />
        <span>List</span>
      </Center>
    ),
  },
  {
    value: 'icons',
    label: (
      <Center style={{ gap: 6 }}>
        <IconPhoto size={16} />
        <span>Icons</span>
      </Center>
    ),
  },
] as const;

// Detect model type from LoRA name/path
function detectModelType(lora: LoRA): ModelFilter {
  const name = (lora.name + ' ' + (lora.folder || '')).toLowerCase();

  if (name.includes('pony') || name.includes('ponydiff')) return 'pony';
  if (name.includes('flux') || name.includes('fluxdev')) return 'flux';
  if (name.includes('illustrious') || name.includes('illu')) return 'illustrious';
  if (name.includes('sdxl') || name.includes('xl_')) return 'sdxl';
  if (name.includes('sd15') || name.includes('sd1.5') || name.includes('1.5')) return 'sd15';

  return 'other';
}

// Helper function to extract keywords from activation text
function extractActivationKeywords(text: string): string[] {
  if (!text) return [];
  return text.split(/[,\n;]+/).map(k => k.trim()).filter(k => k.length > 1);
}

export function LoRABrowser({ opened, onClose, selectedLoras, onLoraChange, onAddToPrompt }: LoRABrowserProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearch = useDebounce(searchQuery, 200);
  const [tempSelections, setTempSelections] = useState<LoRASelection[]>(selectedLoras);
  const [viewMode, setViewMode] = useState<ViewMode>('cards');
  const [folderDepth, setFolderDepth] = useState<number>(1); // Default to 1 to only show root level initially
  const [selectedFolder, setSelectedFolder] = useState<string>('all');
  const [detailLora, setDetailLora] = useState<LoRA | null>(null);
  const [modelFilter, setModelFilter] = useState<ModelFilter>('all');
  const [thumbnailSize, setThumbnailSize] = useState<ThumbnailSize>(DEFAULT_THUMBNAIL_SIZE);
  const lorasQuery = useQuery({
    queryKey: queryKeys.loras.list(),
    queryFn: () => swarmClient.listLoRAs(),
    staleTime: 5 * 60 * 1000,
    enabled: opened,
  });
  const loras = lorasQuery.data ?? [];
  const loading = opened && lorasQuery.isLoading && !lorasQuery.data;

  useEffect(() => {
    if (opened) {
      setTempSelections(selectedLoras);
    }
  }, [opened, selectedLoras]);

  const loadLoras = async () => {
    try {
      const result = await lorasQuery.refetch();
      if (result.data && result.data.length > 0) {
        logger.debug('[LoRABrowser] Total LoRAs:', result.data.length);
      }
    } catch (error) {
      console.error('Failed to load LoRAs:', error);
      notifications.show({
        title: 'Error',
        message: 'Failed to load LoRA list',
        color: 'red',
      });
    }
  };

  // Helper to get preview URL - handles both preview_image (API) and preview fields
  const getPreviewUrl = (lora: LoRA): string | null => {
    const rawPreview = (lora as LoRA & { preview_image?: string }).preview_image || lora.preview;
    if (!rawPreview) {
      return null;
    }
    const preview = rawPreview.trim();
    if (!preview || preview === 'imgs/model_placeholder.jpg') {
      return null;
    }
    // Already fully-qualified or embedded.
    if (
      preview.startsWith('data:') ||
      preview.startsWith('http://') ||
      preview.startsWith('https://')
    ) {
      return preview;
    }
    // Match prior ModelBrowser behavior: convert legacy 'viewspecial/' to '/View/'
    if (preview.startsWith('viewspecial/')) {
      return preview.replace('viewspecial/', '/View/');
    }
    // Keep absolute/route-prefixed values unchanged.
    if (preview.startsWith('/')) {
      return preview;
    }
    return `/View/${preview}`;
  };

  // Get unique folders
  const folders = Array.from(new Set(loras.map((l: LoRA) => l.folder))).filter(Boolean).sort();

  // Build hierarchical folder options with indentation and LoRA counts
  const folderOptions: { value: string; label: string }[] = (() => {
    const totalCountMap = new Map<string, number>();
    for (const folder of folders) {
      let total = 0;
      for (const lora of loras) {
        if (lora.folder === folder || lora.folder?.startsWith(folder + '/') || lora.folder?.startsWith(folder + '\\')) total++;
      }
      totalCountMap.set(folder as string, total);
    }
    const options: { value: string; label: string }[] = [{ value: 'all', label: `Root folder (${loras.length})` }];
    for (const f of folders) {
      const depth = (f as string).split(/[/\\]/).filter(Boolean).length;
      const indent = depth > 1 ? '  '.repeat(depth - 1) + '└ ' : '';
      const count = totalCountMap.get(f as string) || 0;
      const name = (f as string).split(/[/\\]/).pop();
      options.push({ value: f as string, label: `${indent}${name} (${count})` });
    }
    return options;
  })();

  const modelFilterOptions: { value: string; label: string }[] = [
    { value: 'all', label: 'All Architectures' },
    { value: 'sdxl', label: 'SDXL' },
    { value: 'sd15', label: 'SD 1.5' },
    { value: 'pony', label: 'Pony' },
    { value: 'flux', label: 'Flux' },
    { value: 'illustrious', label: 'Illustrious' },
    { value: 'other', label: 'Other' },
  ];

  const { result: searchFilteredLoras } = useWorkerFilter<LoRA>(
    loras,
    debouncedSearch,
    LORA_SEARCH_FIELDS
  );

  // Memoized filtered LoRAs for performance
  const filteredLoras = useMemo(() => {
    return searchFilteredLoras.filter((lora: LoRA) => {
      // Folder matching: show items in selected folder OR its subfolders
      let matchesFolder = false;
      if (selectedFolder === 'all') {
        matchesFolder = true;
      } else {
        // Match if item is in selected folder or any subfolder of it
        matchesFolder = lora.folder === selectedFolder ||
          lora.folder?.startsWith(selectedFolder + '/') ||
          lora.folder?.startsWith(selectedFolder + '\\') ||
          false;
      }

      const matchesModel = modelFilter === 'all' || detectModelType(lora) === modelFilter;

      // Folder depth filtering: relative to selected folder
      // Calculate depth relative to selected folder (not root)
      const folderPath = lora.folder || '';
      let relativeDepth = 0;

      if (selectedFolder === 'all') {
        // When showing all, depth is from root
        relativeDepth = folderPath ? folderPath.split(/[/\\]/).filter(Boolean).length : 0;
      } else if (matchesFolder) {
        // When a folder is selected, calculate depth relative to that folder
        const selectedDepth = selectedFolder.split(/[/\\]/).filter(Boolean).length;
        const itemDepth = folderPath ? folderPath.split(/[/\\]/).filter(Boolean).length : 0;
        relativeDepth = itemDepth - selectedDepth;
      }

      // When a specific architecture is selected, ignore depth restriction so all
      // matching LoRAs are visible regardless of how deep in subfolders they live.
      const matchesFolderDepth = modelFilter !== 'all' || relativeDepth < folderDepth;

      return matchesFolder && matchesModel && matchesFolderDepth;
    });
  }, [searchFilteredLoras, selectedFolder, modelFilter, folderDepth]);

  const isLoraSelected = (loraName: string) => {
    return tempSelections.some((sel: LoRASelection) => sel.lora === loraName);
  };

  const handleAddLora = (lora: LoRA) => {
    if (!isLoraSelected(lora.name)) {
      setTempSelections([...tempSelections, { lora: lora.name, weight: 1.0 }]);
      notifications.show({
        title: 'LoRA Added',
        message: `Added "${lora.title || lora.name}"`,
        color: 'blue',
      });
    }
  };

  const handleRemoveLora = (loraName: string) => {
    setTempSelections(tempSelections.filter((sel: LoRASelection) => sel.lora !== loraName));
  };

  const handleWeightChange = (loraName: string, weight: number) => {
    setTempSelections(
      tempSelections.map((sel: LoRASelection) =>
        sel.lora === loraName ? { ...sel, weight } : sel
      )
    );
  };

  const handleApply = () => {
    onLoraChange(tempSelections);
    notifications.show({
      title: 'LoRAs Applied',
      message: `Applied ${tempSelections.length} LoRA(s)`,
      color: 'green',
    });
    onClose();
  };

  const handleClearAll = () => {
    setTempSelections([]);
  };

  const openLoraDetails = (lora: LoRA) => {
    setDetailLora(lora);
  };

  // Render LoRA Card (Cards View)
  const renderLoRACard = (lora: LoRA) => {
    const selected = isLoraSelected(lora.name);

    return (
      <Card
        key={lora.name}
        withBorder
        padding="sm"
        className="swarm-selectable-card"
        data-selected={selected ? 'true' : undefined}
        style={{
          cursor: 'pointer',
          borderColor: selected ? 'var(--theme-selected-border)' : undefined,
          borderWidth: selected ? 2 : 1,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <Stack gap="xs">
          {/* Preview Image */}
          {getPreviewUrl(lora) && (
            <Box
              style={{
                height: BROWSER_THUMBNAIL_SIZES[thumbnailSize].card,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: 'var(--theme-surface-input)',
                borderRadius: 4,
                overflow: 'hidden',
              }}
            >
              <LazyImage
                src={getPreviewUrl(lora)!}
                alt={lora.title || lora.name}
                fit="contain"
                height="100%"
                width="100%"
                rootMargin="100px"
              />
            </Box>
          )}

          {/* Header */}
          <Group justify="space-between" wrap="nowrap">
            <Box style={{ flex: 1, minWidth: 0 }}>
              <Text size="sm" fw={600} truncate>
                {lora.title || lora.name}
              </Text>
              {lora.folder && (
                <Group gap={4}>
                  <IconFolder size={12} />
                  <Text size="xs" c="dimmed" truncate>
                    {lora.folder}
                  </Text>
                </Group>
              )}
            </Box>
            <Group gap={4}>
              {selected ? (
                <SwarmBadge tone="info" size="sm">Selected</SwarmBadge>
              ) : (
                <SwarmActionIcon
                  size="sm"
                  tone="info"
                  emphasis="soft"
                  label={`Add ${lora.title || lora.name}`}
                  onClick={(e: MouseEvent<HTMLButtonElement>) => {
                    e.stopPropagation();
                    handleAddLora(lora);
                  }}
                >
                  <IconPlus size={16} />
                </SwarmActionIcon>
              )}
            </Group>
          </Group>

          {/* Description - shown in collapsed view */}
          {lora.description && (
            <Text size="xs" c="dimmed" lineClamp={2}>
              {lora.description.replace(/<[^>]*>/g, ' ').substring(0, 150)}...
            </Text>
          )}

          {/* More Info Button - Opens Detail Modal */}
          <SwarmButton
            size="xs"
            tone="secondary"
            emphasis="ghost"
            fullWidth
            rightSection={<IconChevronDown size={14} />}
            onClick={(e: MouseEvent<HTMLButtonElement>) => {
              e.stopPropagation();
              openLoraDetails(lora);
            }}
          >
            More Info
          </SwarmButton>
        </Stack>
      </Card>
    );
  };

  // Render LoRA List Item (List View)
  const renderLoRAListItem = (lora: LoRA) => {
    const selected = isLoraSelected(lora.name);

    return (
      <Card
        key={lora.name}
        withBorder
        padding="sm"
        className="swarm-selectable-card"
        data-selected={selected ? 'true' : undefined}
        style={{
          borderColor: selected ? 'var(--theme-selected-border)' : undefined,
          borderWidth: selected ? 2 : 1,
        }}
      >
        <Group justify="space-between" wrap="nowrap">
          {/* Left side - Info */}
          <Group gap="md" style={{ flex: 1, minWidth: 0 }}>
            {getPreviewUrl(lora) && (
              <Box
                style={{
                  width: BROWSER_THUMBNAIL_SIZES[thumbnailSize].list,
                  height: BROWSER_THUMBNAIL_SIZES[thumbnailSize].list,
                  flexShrink: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: 'var(--theme-surface-input)',
                  borderRadius: 4,
                  overflow: 'hidden',
                }}
              >
                <LazyImage
                  src={getPreviewUrl(lora)!}
                  alt={lora.title || lora.name}
                  fit="contain"
                  height="100%"
                  width="100%"
                  rootMargin="100px"
                />
              </Box>
            )}
            <Box style={{ flex: 1, minWidth: 0 }}>
              <Text size="sm" fw={600} truncate>
                {lora.title || lora.name}
              </Text>
              {lora.folder && (
                <Group gap={4} mt={2}>
                  <IconFolder size={12} />
                  <Text size="xs" c="dimmed">{lora.folder}</Text>
                </Group>
              )}
            </Box>
          </Group>

          {/* Right side - Actions */}
          <Group gap="xs">
            <SwarmActionIcon
              size="sm"
              tone="secondary"
              emphasis="ghost"
              label={`Show details for ${lora.title || lora.name}`}
              onClick={() => openLoraDetails(lora)}
            >
              <IconChevronDown size={16} />
            </SwarmActionIcon>
            {selected ? (
              <SwarmBadge tone="info" size="sm">Selected</SwarmBadge>
            ) : (
              <SwarmActionIcon
                size="sm"
                tone="info"
                emphasis="soft"
                label={`Add ${lora.title || lora.name}`}
                onClick={() => handleAddLora(lora)}
              >
                <IconPlus size={16} />
              </SwarmActionIcon>
            )}
          </Group>
        </Group>
      </Card>
    );
  };

  // Render LoRA Icon (Icons View)
  const renderLoRAIcon = (lora: LoRA) => {
    const selected = isLoraSelected(lora.name);

    return (
      <Tooltip
        key={lora.name}
        label={
          <Stack gap={4}>
            <Text size="xs" fw={600}>{lora.title || lora.name}</Text>
            {lora.activationText && (
              <Text size="xs" c="var(--theme-success)">Trigger: {lora.activationText}</Text>
            )}
            {lora.description && (
              <Text size="xs">{lora.description}</Text>
            )}
          </Stack>
        }
        withArrow
      >
        <Card
          withBorder
          padding="xs"
          className="swarm-selectable-card"
          data-selected={selected ? 'true' : undefined}
          style={{
            cursor: 'pointer',
            borderColor: selected ? 'var(--theme-selected-border)' : undefined,
            borderWidth: selected ? 2 : 1,
            position: 'relative',
          }}
          onClick={() => handleAddLora(lora)}
        >
          <Stack gap={4} align="center">
            {getPreviewUrl(lora) ? (
              <Box
                style={{
                  width: BROWSER_THUMBNAIL_SIZES[thumbnailSize].icon,
                  height: BROWSER_THUMBNAIL_SIZES[thumbnailSize].icon,
                  flexShrink: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: 'var(--theme-surface-input)',
                  borderRadius: 4,
                  overflow: 'hidden',
                }}
              >
                <LazyImage
                  src={getPreviewUrl(lora)!}
                  alt={lora.title || lora.name}
                  fit="contain"
                  height="100%"
                  width="100%"
                  rootMargin="100px"
                />
              </Box>
            ) : (
              <Center
                style={{
                  width: BROWSER_THUMBNAIL_SIZES[thumbnailSize].icon,
                  height: BROWSER_THUMBNAIL_SIZES[thumbnailSize].icon,
                  backgroundColor: 'var(--theme-surface-input)',
                  borderRadius: 4,
                }}
              >
                <IconPhoto size={24} color="var(--theme-text-secondary)" />
              </Center>
            )}
            <Text size="xs" fw={500} ta="center" lineClamp={2} w="100%">
              {lora.title || lora.name}
            </Text>
            {selected && (
              <SwarmBadge tone="info" size="xs" fullWidth>
                Selected
              </SwarmBadge>
            )}
          </Stack>
        </Card>
      </Tooltip>
    );
  };

  const detailTriggerKeywords = detailLora
    ? Array.from(
      new Set(
        [
          ...extractActivationKeywords(detailLora.activationText || ''),
          ...(detailLora.trainedWords || []),
        ]
          .map((word) => word.trim())
          .filter((word) => word.length > 1)
      )
    )
    : [];

  const shouldVirtualize = featureFlags.virtualizedBrowsersV2 && filteredLoras.length >= 120;
  const virtualContainerHeight = useMemo(() => {
    if (typeof window === 'undefined') return 520;
    return Math.max(360, Math.min(720, window.innerHeight - 320));
  }, []);

  return (
    <FloatingWindow
      opened={opened}
      onClose={onClose}
      title="LoRA Browser"
      initialWidth={1100}
      initialHeight={750}
      minWidth={600}
      minHeight={400}
      zIndex={Z_INDEX.modal}
    >
      <Stack gap="md">
        {/* Controls Row */}
        <Group grow className="swarm-browser-controls-row">
          <TextInput
            placeholder="Search LoRAs..."
            leftSection={<IconSearch size={16} />}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.currentTarget.value)}
          />
          <HeadlessCombobox
            placeholder="Filter by folder"
            options={folderOptions}
            value={selectedFolder}
            onChange={(value) => setSelectedFolder(value || 'all')}
            leftSection={<IconFolder size={16} />}
            clearable
            style={{ flex: 1 }}
          />
          <HeadlessCombobox
            placeholder="Filter by model"
            options={modelFilterOptions}
            value={modelFilter}
            onChange={(value) => setModelFilter((value as ModelFilter) || 'all')}
            clearable
            style={{ minWidth: 150 }}
          />
        </Group>

        {/* View Options */}
        <div className="swarm-browser-view-row">
          <div className="swarm-browser-view-row__left">
            <SwarmSegmentedControl
              value={viewMode}
              onChange={(value) => setViewMode(value as ViewMode)}
              data={LORA_BROWSER_VIEW_MODE_OPTIONS}
            />
            <NumberInput
              label="Folder Depth"
              description={folderDepth >= 99 ? 'Showing all depths' : `${folderDepth === 1 ? 'This folder only' : `Up to ${folderDepth} levels deep`}`}
              value={folderDepth >= 99 ? '' : folderDepth}
              placeholder="All"
              onChange={(value) => {
                if (value === '' || value === undefined) {
                  setFolderDepth(99);
                } else {
                  const normalized = Number(value) || 1;
                  setFolderDepth(Math.min(99, Math.max(1, normalized)));
                }
              }}
              min={1}
              max={99}
              step={1}
              w={160}
              size="xs"
              rightSection={
                folderDepth < 99 ? (
                  <Tooltip label="Show all depths">
                    <Box
                      component="button"
                      type="button"
                      onClick={() => setFolderDepth(99)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, lineHeight: 0, color: 'var(--mantine-color-dimmed)' }}
                    >
                      <Text size="xs" c="dimmed">All</Text>
                    </Box>
                  </Tooltip>
                ) : undefined
              }
            />
            <SwarmActionIcon
              tone="secondary"
              emphasis="soft"
              label="Refresh LoRA list"
              onClick={() => {
                void loadLoras();
              }}
              title="Refresh LoRAs"
            >
              <IconRefresh size={18} />
            </SwarmActionIcon>
          </div>
          <Text size="sm" c="dimmed" className="swarm-browser-view-row__meta">
            {filteredLoras.length} LoRA{filteredLoras.length !== 1 ? 's' : ''} found
          </Text>
          <SwarmSegmentedControl
            value={thumbnailSize}
            onChange={(value) => setThumbnailSize(value as ThumbnailSize)}
            data={BROWSER_THUMBNAIL_SIZE_OPTIONS}
            className="swarm-browser-view-row__right"
          />
        </div>

        {/* Selected LoRAs */}
        {tempSelections.length > 0 && (
          <Paper withBorder p="md">
            <Stack gap="md">
              <Group justify="space-between">
                <Text size="sm" fw={600}>
                  Selected LoRAs ({tempSelections.length})
                </Text>
                <SwarmButton
                  size="xs"
                  tone="danger"
                  emphasis="ghost"
                  onClick={handleClearAll}
                >
                  Clear All
                </SwarmButton>
              </Group>
              <ScrollArea h={150}>
                <Stack gap="xs">
                  {tempSelections.map((selection) => {
                    const lora = loras.find(l => l.name === selection.lora);
                    return (
                      <Card key={selection.lora} withBorder padding="xs">
                        <Stack gap="xs">
                          <Group justify="space-between">
                            <Box style={{ flex: 1 }}>
                              <Text size="sm" fw={500}>
                                {lora?.title || selection.lora}
                              </Text>
                              {lora?.activationText && (
                                <SwarmBadge tone="success" emphasis="soft" size="xs" mt={2}>
                                  {lora.activationText}
                                </SwarmBadge>
                              )}
                            </Box>
                            <SwarmActionIcon
                              size="sm"
                              tone="danger"
                              emphasis="ghost"
                              label={`Remove ${selection.lora}`}
                              onClick={() => handleRemoveLora(selection.lora)}
                            >
                              <IconX size={16} />
                            </SwarmActionIcon>
                          </Group>
                          <Group gap="md" grow>
                            <Slider
                              min={-5}
                              max={5}
                              step={0.01}
                              value={selection.weight}
                              onChange={(value) => handleWeightChange(selection.lora, value)}
                              style={{ flex: 1 }}
                              marks={[
                                { value: -5, label: '-5' },
                                { value: -2.5, label: '' },
                                { value: 0, label: '0' },
                                { value: 1, label: '1' },
                                { value: 2.5, label: '' },
                                { value: 5, label: '5' },
                              ]}
                            />
                            <Text size="sm" ta="center" style={{ minWidth: 60 }}>
                              {selection.weight.toFixed(2)}
                            </Text>
                          </Group>
                        </Stack>
                      </Card>
                    );
                  })}
                </Stack>
              </ScrollArea>
            </Stack>
          </Paper>
        )}

        <Divider />

        {/* Available LoRAs */}
        {loading ? (
          <Center h={300}>
            <Loader size="lg" />
          </Center>
        ) : filteredLoras.length === 0 ? (
          <Center h={200}>
            <Text c="dimmed">No LoRAs found</Text>
          </Center>
        ) : (
          <>
            {viewMode === 'cards' && (
              shouldVirtualize ? (
                <VirtualGrid
                  items={filteredLoras}
                  columns={{ base: 1, sm: 2, md: 3, lg: 4, xl: 5 }}
                  rowHeight={BROWSER_THUMBNAIL_SIZES[thumbnailSize].card + 180}
                  containerHeight={virtualContainerHeight}
                  gap={16}
                  overscan={4}
                  renderItem={(lora: LoRA) => renderLoRACard(lora)}
                />
              ) : (
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: `repeat(auto-fill, minmax(${BROWSER_THUMBNAIL_SIZES[thumbnailSize].card * 1.5 + 60}px, 1fr))`,
                  gap: 16,
                }}>
                  {filteredLoras.map((lora: LoRA) => renderLoRACard(lora))}
                </div>
              )
            )}

            {viewMode === 'list' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {filteredLoras.map((lora: LoRA) => renderLoRAListItem(lora))}
              </div>
            )}

            {viewMode === 'icons' && (
              shouldVirtualize ? (
                <VirtualGrid
                  items={filteredLoras}
                  columns={{ base: 3, sm: 4, md: 6, lg: 7, xl: 8 }}
                  rowHeight={BROWSER_THUMBNAIL_SIZES[thumbnailSize].icon + 96}
                  containerHeight={virtualContainerHeight}
                  gap={8}
                  overscan={4}
                  renderItem={(lora: LoRA) => renderLoRAIcon(lora)}
                />
              ) : (
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: `repeat(auto-fill, minmax(${BROWSER_THUMBNAIL_SIZES[thumbnailSize].icon + 40}px, 1fr))`,
                  gap: 8,
                }}>
                  {filteredLoras.map((lora: LoRA) => renderLoRAIcon(lora))}
                </div>
              )
            )}
          </>
        )}

        {/* Actions - Sticky Footer */}
        <Group
          className="swarm-browser-footer swarm-browser-footer--end"
        >
          <SwarmButton tone="secondary" emphasis="ghost" onClick={onClose}>
            Cancel
          </SwarmButton>
          <SwarmButton onClick={handleApply} tone="info" emphasis="solid" className="gradient-button with-glow">
            Apply LoRAs ({tempSelections.length})
          </SwarmButton>
        </Group>
      </Stack>

      <ModelDetailModal
        opened={Boolean(detailLora)}
        onClose={() => setDetailLora(null)}
        modelName={detailLora?.name || ''}
        subtype="LoRA"
        onModelChanged={() => {
          void loadLoras();
        }}
        onAddTriggerToPrompt={onAddToPrompt}
        extraTriggerKeywords={detailTriggerKeywords}
      />
    </FloatingWindow>
  );
}
