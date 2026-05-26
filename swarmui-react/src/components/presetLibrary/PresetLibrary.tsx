import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEventHandler } from 'react';
import {
  Box,
  Group,
  Modal,
  ScrollArea,
  Stack,
  Text,
  ThemeIcon,
  UnstyledButton,
} from '@mantine/core';
import { useDisclosure, useViewportSize } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { IconBooks, IconChevronRight } from '@tabler/icons-react';
import { ElevatedCard, ResizeHandle, SwarmBadge, SwarmButton } from '../ui';
import { useResizablePanel } from '../../hooks/useResizablePanel';
import { usePresetLibraryStore } from '../../stores/presetLibraryStore';
import { PresetCreator } from './PresetCreator';
import { PresetLibraryFooter } from './PresetLibraryFooter';
import { PresetLibraryGrid } from './PresetLibraryGrid';
import { PresetLibraryHeader } from './PresetLibraryHeader';
import { PresetStagingStrip } from './PresetStagingStrip';
import type { LibraryPreset, PresetPromptSection } from '../../features/presetLibrary/types';
import './presetLibrary.css';

interface PresetLibraryProps {
  onApplyToPrompt?: (
    text: string,
    mode?: 'replace' | 'append',
    sections?: PresetPromptSection[]
  ) => void;
  currentPromptText?: string;
  compact?: boolean;
  triggerVariant?: 'card' | 'button';
}

let defaultPresetLibraryPromise: Promise<LibraryPreset[]> | null = null;

function loadDefaultPresetLibrary(): Promise<LibraryPreset[]> {
  if (!defaultPresetLibraryPromise) {
    defaultPresetLibraryPromise = import('../../data/presetLibrary.json').then(
      (module) => module.default as LibraryPreset[]
    );
  }

  return defaultPresetLibraryPromise;
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  const tagName = target.tagName.toLowerCase();
  return (
    tagName === 'input' ||
    tagName === 'textarea' ||
    tagName === 'select' ||
    target.isContentEditable
  );
}

export const PresetLibrary = memo(function PresetLibrary({
  onApplyToPrompt,
  currentPromptText = '',
  compact = false,
  triggerVariant = 'card',
}: PresetLibraryProps) {
  const [opened, { open, close }] = useDisclosure(false);
  const [defaultPresets, setDefaultPresets] = useState<LibraryPreset[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [searchDraft, setSearchDraft] = useState('');
  const [editingPresetId, setEditingPresetId] = useState<string | null>(null);
  const [creatorOpen, setCreatorOpen] = useState(false);
  const hasRunMigration = useRef(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const viewport = useViewportSize();
  const widthPanel = useResizablePanel({
    initialSize: 1280,
    minSize: 860,
    maxSize: 1720,
    direction: 'horizontal',
  });
  const heightPanel = useResizablePanel({
    initialSize: 900,
    minSize: 680,
    maxSize: 1320,
    direction: 'vertical',
  });

  const {
    userPresets,
    activeCategory,
    showExplicit,
    stagedWords,
    stagedSections,
    stagedFromPresetIds,
    searchQuery,
    unstageWord,
    clearStaged,
    commitStagedSections,
    migrateFromWizardStore,
    addUserPreset,
    updateUserPreset,
    removeUserPreset,
    setActiveCategory,
    setShowExplicit,
    setSearchQuery,
    resetEphemeral,
  } = usePresetLibraryStore();

  const ensureDefaultsLoaded = useCallback(() => {
    if (hasLoaded || isLoading) {
      return;
    }

    setIsLoading(true);
    loadDefaultPresetLibrary()
      .then((presets) => {
        setDefaultPresets(presets);
        setHasLoaded(true);
      })
      .catch(() => {
        notifications.show({
          title: 'Preset Library Unavailable',
          message: 'Could not load the preset library.',
          color: 'red',
        });
      })
      .finally(() => setIsLoading(false));
  }, [hasLoaded, isLoading]);

  useEffect(() => {
    ensureDefaultsLoaded();
  }, [ensureDefaultsLoaded]);

  useEffect(() => {
    setSearchDraft(searchQuery);
  }, [searchQuery]);

  useEffect(() => {
    if (!showExplicit && activeCategory === 'explicit') {
      setActiveCategory('characters');
    }
  }, [activeCategory, setActiveCategory, showExplicit]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (searchDraft !== searchQuery) {
        setSearchQuery(searchDraft);
      }
    }, 150);

    return () => window.clearTimeout(timer);
  }, [searchDraft, searchQuery, setSearchQuery]);

  useEffect(() => {
    if (!opened) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === '/' && !event.altKey && !event.ctrlKey && !event.metaKey) {
        if (isTypingTarget(event.target)) {
          return;
        }

        event.preventDefault();
        searchInputRef.current?.focus();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [opened]);

  const allPresets = useMemo(
    () => [...defaultPresets, ...userPresets],
    [defaultPresets, userPresets]
  );
  const stagedPresets = useMemo(() => {
    return stagedFromPresetIds.map((id) => {
      const preset = allPresets.find((p) => p.id === id);
      return preset ? { id: preset.id, name: preset.name, thumbnail: preset.thumbnail } : { id, name: id };
    });
  }, [stagedFromPresetIds, allPresets]);
  const totalPresetCount = allPresets.length;
  const editingPreset = useMemo(
    () => userPresets.find((preset) => preset.id === editingPresetId) ?? null,
    [editingPresetId, userPresets]
  );
  const modalWidth = useMemo(
    () =>
      Math.min(
        widthPanel.size,
        viewport.width > 0 ? Math.floor(viewport.width * 0.98) : widthPanel.size
      ),
    [viewport.width, widthPanel.size]
  );
  const modalHeight = useMemo(
    () =>
      Math.min(
        heightPanel.size,
        viewport.height > 0 ? Math.floor(viewport.height * 0.95) : heightPanel.size
      ),
    [heightPanel.size, viewport.height]
  );

  const closeCreator = useCallback(() => {
    setCreatorOpen(false);
    setEditingPresetId(null);
  }, []);

  const handleOpen = useCallback(() => {
    if (!showExplicit && activeCategory === 'explicit') {
      setActiveCategory('characters');
    }

    open();
    ensureDefaultsLoaded();

    if (!hasRunMigration.current) {
      hasRunMigration.current = true;
      void migrateFromWizardStore();
    }
  }, [
    activeCategory,
    ensureDefaultsLoaded,
    migrateFromWizardStore,
    open,
    setActiveCategory,
    showExplicit,
  ]);

  const handleClose = useCallback(() => {
    close();
    closeCreator();
    resetEphemeral();
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  }, [close, closeCreator, resetEphemeral]);

  const handleToggleShowExplicit = useCallback(
    (show: boolean) => {
      setShowExplicit(show);
      if (!show && activeCategory === 'explicit') {
        setActiveCategory('characters');
      }
    },
    [activeCategory, setActiveCategory, setShowExplicit]
  );

  const handleCreatePreset = useCallback(() => {
    setEditingPresetId(null);
    setCreatorOpen(true);
  }, []);

  const handleEditPreset = useCallback((preset: LibraryPreset) => {
    setEditingPresetId(preset.id);
    setCreatorOpen(true);
  }, []);

  const handleDeletePreset = useCallback(
    (preset: LibraryPreset) => {
      if (!window.confirm(`Delete preset "${preset.name}"?`)) {
        return;
      }

      removeUserPreset(preset.id);
      if (editingPresetId === preset.id) {
        closeCreator();
      }

      notifications.show({
        title: 'Preset Deleted',
        message: `${preset.name} was removed from the library.`,
        color: 'teal',
      });
    },
    [closeCreator, editingPresetId, removeUserPreset]
  );

  const handleSavePreset = useCallback(
    (values: {
      name: string;
      description?: string;
      category: LibraryPreset['category'];
      thumbnail?: string;
      words: string[];
    }) => {
      if (editingPresetId) {
        updateUserPreset(editingPresetId, values);
        notifications.show({
          title: 'Preset Updated',
          message: `${values.name} was updated.`,
          color: 'teal',
        });
      } else {
        addUserPreset(values);
        notifications.show({
          title: 'Preset Created',
          message: `${values.name} was added to the library.`,
          color: 'teal',
        });
      }

      if (values.category === 'explicit') {
        setShowExplicit(true);
      }
      setActiveCategory(values.category);
      closeCreator();
    },
    [
      addUserPreset,
      closeCreator,
      editingPresetId,
      setActiveCategory,
      setShowExplicit,
      updateUserPreset,
    ]
  );

  const handleApply = useCallback(
    (mode: 'append' | 'replace') => {
      const stagedWordCount = stagedWords.length;
      const committedSections = commitStagedSections();
      const committedText = committedSections.map((section) => section.text).join('\n');
      if (committedSections.length === 0 || !onApplyToPrompt) {
        handleClose();
        return;
      }

      onApplyToPrompt(committedText, mode, committedSections);
      notifications.show({
        title: mode === 'append' ? 'Added to Prompt' : 'Prompt Replaced',
        message: `${stagedWordCount} ${stagedWordCount === 1 ? 'word' : 'words'} ${mode === 'append' ? 'added to' : 'applied to'} prompt.`,
        color: 'teal',
      });
      handleClose();
    },
    [commitStagedSections, handleClose, onApplyToPrompt, stagedWords.length]
  );

  const handleSearchKeyDown = useCallback<KeyboardEventHandler<HTMLInputElement>>(
    (event) => {
      if (event.key === 'Escape' && searchDraft.trim()) {
        event.preventDefault();
        event.stopPropagation();
        setSearchDraft('');
        setSearchQuery('');
      }
    },
    [searchDraft, setSearchQuery]
  );

  const triggerBadgeLabel =
    stagedWords.length > 0
      ? `${stagedWords.length} staged`
      : totalPresetCount > 0
        ? `${totalPresetCount}`
        : '...';

  return (
    <>
      {triggerVariant === 'button' ? (
        <SwarmButton
          ref={triggerRef}
          size="xs"
          tone="secondary"
          emphasis="soft"
          leftSection={<IconBooks size={14} />}
          onClick={handleOpen}
          className="generate-studio__prompt-tool-button"
        >
          Presets{stagedWords.length > 0 ? ` (${stagedWords.length})` : ''}
        </SwarmButton>
      ) : (
        <UnstyledButton
          ref={triggerRef}
          onClick={handleOpen}
          className="swarm-control-no-select"
          style={{ width: '100%', textAlign: 'left' }}
          aria-label="Open Preset Library"
        >
          <ElevatedCard
            elevation="paper"
            withBorder
            interactive
            className={compact ? 'generate-studio__prompt-library-card--compact' : undefined}
            style={{ padding: compact ? 10 : 14 }}
          >
            <Group justify="space-between" align="center" wrap="nowrap">
              <Group gap="sm" wrap="nowrap">
                <ThemeIcon
                  size={compact ? 32 : 38}
                  radius="md"
                  variant="light"
                  color="gray"
                  style={{ backgroundColor: 'var(--elevation-raised)' }}
                >
                  <IconBooks size={20} />
                </ThemeIcon>
                <Stack gap={2}>
                  <Group gap="xs">
                    <Text fw={600} size="sm">
                      Preset Library
                    </Text>
                    <SwarmBadge
                      tone={stagedWords.length > 0 ? 'primary' : 'secondary'}
                      emphasis="soft"
                    >
                      {triggerBadgeLabel}
                    </SwarmBadge>
                  </Group>
                  <Text size="xs" c="dimmed">
                    {compact
                      ? 'Quick-inject curated word clusters.'
                      : stagedWords.length > 0
                        ? `${stagedWords.length} words staged for prompt injection`
                        : 'Quick-inject curated word clusters'}
                  </Text>
                </Stack>
              </Group>
              <ThemeIcon size={compact ? 28 : 32} radius="xl" variant="light" color="gray">
                <IconChevronRight size={18} />
              </ThemeIcon>
            </Group>
          </ElevatedCard>
        </UnstyledButton>
      )}

      <Modal
        opened={opened}
        onClose={handleClose}
        size={modalWidth}
        padding={0}
        centered
        styles={{
          content: {
            overflow: 'hidden',
            background: 'var(--elevation-table)',
            display: 'flex',
            flexDirection: 'column',
            position: 'relative',
            width: `${modalWidth}px`,
            maxWidth: '98vw',
            height: `${modalHeight}px`,
            maxHeight: '95vh',
          },
          header: { display: 'none' },
          body: { padding: 0, display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 },
        }}
      >
        <Box className="preset-library__modal-shell">
          <PresetLibraryHeader
            activeCategory={activeCategory}
            searchQuery={searchDraft}
            showExplicit={showExplicit}
            onCategoryChange={setActiveCategory}
            onSearchChange={setSearchDraft}
            onSearchClear={() => {
              setSearchDraft('');
              setSearchQuery('');
            }}
            onSearchKeyDown={handleSearchKeyDown}
            onToggleShowExplicit={handleToggleShowExplicit}
            onCreatePreset={handleCreatePreset}
            onClose={handleClose}
            searchInputRef={searchInputRef}
          />

          <ScrollArea className="preset-library__body" type="auto">
            {creatorOpen ? (
              <PresetCreator
                activeCategory={activeCategory}
                showExplicit={showExplicit}
                currentPromptText={currentPromptText}
                initialPreset={editingPreset}
                onSave={handleSavePreset}
                onCancel={closeCreator}
              />
            ) : (
              <PresetLibraryGrid
                presets={allPresets}
                activeCategory={activeCategory}
                showExplicit={showExplicit}
                searchQuery={searchQuery}
                isLoading={isLoading && !hasLoaded}
                stagedPresetIds={stagedFromPresetIds}
                onClearSearch={() => {
                  setSearchDraft('');
                  setSearchQuery('');
                }}
                onCreatePreset={handleCreatePreset}
                onEditPreset={handleEditPreset}
                onDeletePreset={handleDeletePreset}
              />
            )}
          </ScrollArea>

          <PresetStagingStrip
            words={stagedWords}
            sections={stagedSections}
            onRemoveWord={unstageWord}
            onClear={clearStaged}
            stagedPresets={stagedPresets}
          />
          <PresetLibraryFooter
            stagedWordCount={stagedWords.length}
            onCancel={handleClose}
            onAppend={() => handleApply('append')}
            onReplace={() => handleApply('replace')}
          />

          <Box style={{ position: 'absolute', top: 0, right: 0, bottom: 12, zIndex: 8 }}>
            <ResizeHandle
              direction="horizontal"
              onPointerDown={widthPanel.handlePointerDown}
              onNudge={widthPanel.nudgeSize}
              isResizing={widthPanel.isResizing}
            />
          </Box>
          <Box style={{ position: 'absolute', top: 0, left: 0, bottom: 12, zIndex: 8 }}>
            <ResizeHandle
              direction="horizontal"
              onPointerDown={(event) => widthPanel.handlePointerDown(event, true)}
              onNudge={(delta) => widthPanel.nudgeSize(-delta)}
              isResizing={widthPanel.isResizing}
            />
          </Box>
          <Box style={{ position: 'absolute', left: 0, right: 12, bottom: 0, zIndex: 8 }}>
            <ResizeHandle
              direction="vertical"
              onPointerDown={heightPanel.handlePointerDown}
              onNudge={heightPanel.nudgeSize}
              isResizing={heightPanel.isResizing}
            />
          </Box>
          <Box style={{ position: 'absolute', left: 0, right: 12, top: 0, zIndex: 8 }}>
            <ResizeHandle
              direction="vertical"
              onPointerDown={(event) => heightPanel.handlePointerDown(event, true)}
              onNudge={(delta) => heightPanel.nudgeSize(-delta)}
              isResizing={heightPanel.isResizing}
            />
          </Box>
        </Box>
      </Modal>
    </>
  );
});
