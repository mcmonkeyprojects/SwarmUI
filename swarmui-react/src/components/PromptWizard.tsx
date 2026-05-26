import { memo, useCallback, useMemo, useState } from 'react';
import {
  Box,
  Center,
  Group,
  Loader,
  Modal,
  Stack,
  Text,
  ThemeIcon,
  UnstyledButton,
} from '@mantine/core';
import { useDisclosure, useViewportSize } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { IconChevronRight, IconSparkles } from '@tabler/icons-react';
import { ElevatedCard, ResizeHandle, SwarmBadge, SwarmButton } from './ui';
import { PromptWizardHeader } from './PromptWizardHeader';
import { PromptWizardSidebar } from './PromptWizardSidebar';
import { PromptWizardSteps } from './PromptWizardSteps';
import { PromptWizardStepContent } from './PromptWizardStepContent';
import { PromptWizardPreview } from './PromptWizardPreview';
import { useResizablePanel } from '../hooks/useResizablePanel';
import { usePromptWizardStore } from '../stores/promptWizardStore';
import { normalizePromptTags } from '../features/promptWizard/normalizeTags';
import { annotatePromptTags } from '../features/promptWizard/tagRelationships';
import { STEP_META, getStepMeta } from '../features/promptWizard/steps';
import { getProfile } from '../features/promptWizard/profiles';
import { assemblePrompt } from '../features/promptWizard/assemble';
import {
  buildPromptHealth,
  buildStepSummaries,
  findNextIncompleteStep,
} from '../features/promptWizard/wizardInsights';
import type { BuilderStep, PromptPreset, PromptTag } from '../features/promptWizard/types';

interface PromptWizardProps {
  onApplyToPrompt?: (text: string, mode?: 'replace' | 'append') => void;
  onApplyToNegative?: (text: string, mode?: 'replace' | 'append') => void;
  compact?: boolean;
  triggerVariant?: 'card' | 'button';
}

// Lazy-loaded data
let defaultTagsPromise: Promise<PromptTag[]> | null = null;
let defaultPresetsPromise: Promise<PromptPreset[]> | null = null;

function loadDefaultTags(): Promise<PromptTag[]> {
  if (!defaultTagsPromise) {
    defaultTagsPromise = import('../data/promptTags.json').then((m) =>
      annotatePromptTags(normalizePromptTags(m.default as PromptTag[]))
    );
  }
  return defaultTagsPromise;
}

function loadDefaultPresets(): Promise<PromptPreset[]> {
  if (!defaultPresetsPromise) {
    defaultPresetsPromise = import('../data/promptQuickPresets.json').then(
      (m) => m.default as PromptPreset[]
    );
  }
  return defaultPresetsPromise;
}

export const PromptWizard = memo(function PromptWizard({
  onApplyToPrompt,
  onApplyToNegative,
  compact = false,
  triggerVariant = 'card',
}: PromptWizardProps) {
  const [opened, { open, close }] = useDisclosure(false);
  const [sidebarOpened, sidebarHandlers] = useDisclosure(false);
  const [canvasVisible, setCanvasVisible] = useState(true);
  const toggleCanvas = useCallback(() => setCanvasVisible((v) => !v), []);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchScope, setSearchScope] = useState<'global' | 'step'>('global');
  const [defaultTags, setDefaultTags] = useState<PromptTag[]>([]);
  const [defaultPresets, setDefaultPresets] = useState<PromptPreset[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const viewport = useViewportSize();
  const widthPanel = useResizablePanel({
    initialSize: 1480,
    minSize: 980,
    maxSize: 1880,
    direction: 'horizontal',
  });
  const heightPanel = useResizablePanel({
    initialSize: 1040,
    minSize: 760,
    maxSize: 1400,
    direction: 'vertical',
  });

  const {
    selectedTagIds,
    manualNegativeTexts,
    activeProfileId,
    activeStep,
    lastEditedStep,
    recentSteps,
    recentGroupKeys,
    customTags,
    customPresets,
    sessionBundles,
    savedRecipes,
    savedStates,
    tagWeights,
    toggleTag,
    deselectTag,
    toggleManualNegativeText,
    clearSelections,
    setActiveStep,
    setActiveProfile,
    markStepInteraction,
    recordGroupFocus,
    applyPreset,
    saveBundle,
    applyBundle,
    removeBundle,
    saveRecipe,
    applyRecipe,
    removeRecipe,
    saveStateSnapshot,
    loadStateSnapshot,
    removeStateSnapshot,
  } = usePromptWizardStore();

  const handleOpen = useCallback(() => {
    open();
    if (hasLoaded || isLoading) return;
    setIsLoading(true);
    Promise.all([loadDefaultTags(), loadDefaultPresets()])
      .then(([tags, presets]) => {
        setDefaultTags(tags);
        setDefaultPresets(presets);
        setHasLoaded(true);
      })
      .catch(() => {
        notifications.show({
          title: 'Prompt Wizard Unavailable',
          message: 'Could not load tag library.',
          color: 'red',
        });
      })
      .finally(() => setIsLoading(false));
  }, [hasLoaded, isLoading, open]);

  // Merge default + custom tags
  const allTags = useMemo(
    () => annotatePromptTags([...defaultTags, ...customTags]),
    [customTags, defaultTags]
  );

  // When searching, show tags across all steps; otherwise scope to active step
  const hasSearch = searchQuery.trim().length > 0;
  const stepTags = useMemo(() => {
    if (!hasSearch) return allTags.filter((t) => t.step === activeStep);
    return searchScope === 'global' ? allTags : allTags.filter((t) => t.step === activeStep);
  }, [activeStep, allTags, hasSearch, searchScope]);

  // Tag counts per step
  const tagCountsByStep = useMemo(() => {
    const counts = {} as Record<BuilderStep, number>;
    for (const meta of STEP_META) {
      counts[meta.step] = selectedTagIds.filter((id) =>
        allTags.some((t) => t.id === id && t.step === meta.step)
      ).length;
    }
    return counts;
  }, [selectedTagIds, allTags]);

  const selectedTagIdSet = useMemo(() => new Set(selectedTagIds), [selectedTagIds]);
  const validTagIdSet = useMemo(() => new Set(allTags.map((tag) => tag.id)), [allTags]);
  const stepSummaries = useMemo(
    () => buildStepSummaries(STEP_META, allTags, selectedTagIdSet),
    [allTags, selectedTagIdSet]
  );
  const completionByStep = useMemo(
    () =>
      Object.fromEntries(
        STEP_META.map((meta) => [meta.step, stepSummaries[meta.step].completion])
      ) as Record<BuilderStep, 'empty' | 'started' | 'strong'>,
    [stepSummaries]
  );

  // Assembly
  const profile = getProfile(activeProfileId);
  const selectedTags = useMemo(
    () =>
      selectedTagIds.map((id) => allTags.find((t) => t.id === id)).filter(Boolean) as PromptTag[],
    [selectedTagIds, allTags]
  );
  const assembled = useMemo(
    () =>
      profile ? assemblePrompt(selectedTags, profile, tagWeights) : { positive: '', negative: '' },
    [selectedTags, profile, tagWeights]
  );
  const mergedNegativePreview = useMemo(() => {
    const extraNegatives = manualNegativeTexts.filter(
      (text) =>
        !assembled.negative
          .toLowerCase()
          .split(profile?.tagSeparator ?? ', ')
          .includes(text.toLowerCase())
    );
    return [assembled.negative, ...extraNegatives]
      .filter(Boolean)
      .join(profile?.tagSeparator ?? ', ');
  }, [assembled.negative, manualNegativeTexts, profile]);
  const explicitCount = useMemo(
    () =>
      selectedTags.filter(
        (tag) => tag.subcategory === 'Explicit' || tag.majorGroup?.includes('Explicit')
      ).length,
    [selectedTags]
  );
  const promptHealth = useMemo(
    () => buildPromptHealth(selectedTags, manualNegativeTexts),
    [manualNegativeTexts, selectedTags]
  );

  const handleSendToGenerate = useCallback(() => {
    if (!assembled.positive || !onApplyToPrompt) return;
    onApplyToPrompt(assembled.positive, 'replace');
    if (mergedNegativePreview && onApplyToNegative) {
      onApplyToNegative(mergedNegativePreview, 'replace');
    }
    notifications.show({
      title: 'Sent to Generate',
      message: 'Prompt and negatives applied.',
      color: 'teal',
    });
  }, [assembled.positive, mergedNegativePreview, onApplyToPrompt, onApplyToNegative]);

  const handleAppendToGenerate = useCallback(() => {
    if (!assembled.positive || !onApplyToPrompt) return;
    onApplyToPrompt(assembled.positive, 'append');
    if (mergedNegativePreview && onApplyToNegative) {
      onApplyToNegative(mergedNegativePreview, 'append');
    }
    notifications.show({
      title: 'Appended to Prompt',
      message: 'Tags appended to existing prompt.',
      color: 'teal',
    });
  }, [assembled.positive, mergedNegativePreview, onApplyToPrompt, onApplyToNegative]);

  const handleCopyPositive = useCallback(() => {
    if (assembled.positive) {
      navigator.clipboard.writeText(assembled.positive);
      notifications.show({
        title: 'Copied',
        message: 'Positive prompt copied to clipboard.',
        color: 'teal',
      });
    }
  }, [assembled.positive]);

  const handleCopyNegative = useCallback(() => {
    if (mergedNegativePreview) {
      navigator.clipboard.writeText(mergedNegativePreview);
      notifications.show({
        title: 'Copied',
        message: 'Negative prompt copied to clipboard.',
        color: 'teal',
      });
    }
  }, [mergedNegativePreview]);

  const handleClose = useCallback(() => {
    close();
  }, [close]);

  const totalSelected = selectedTagIds.length;
  const stepMeta = getStepMeta(activeStep)!;
  const modalWidth = useMemo(
    () =>
      Math.min(
        widthPanel.size,
        viewport.width > 0 ? Math.floor(viewport.width * 0.96) : widthPanel.size
      ),
    [viewport.width, widthPanel.size]
  );
  const modalHeight = useMemo(
    () =>
      Math.min(
        heightPanel.size,
        viewport.height > 0 ? Math.floor(viewport.height * 0.92) : heightPanel.size
      ),
    [heightPanel.size, viewport.height]
  );
  const profileStepSummary = useMemo(
    () => (profile?.stepOrder ?? []).map((step) => getStepMeta(step)?.label ?? step).join(' -> '),
    [profile]
  );

  // Step navigation
  const profileStepOrder = profile?.stepOrder ?? STEP_META.map((m) => m.step);
  const orderedStepMeta = useMemo(
    () => profileStepOrder.map((step) => getStepMeta(step)).filter(Boolean) as typeof STEP_META,
    [profileStepOrder]
  );

  // Layout breakpoints
  const isNarrow = modalWidth < 900;
  const isStackedCanvas = modalWidth < 1180;

  const currentStepIndex = profileStepOrder.indexOf(activeStep);
  const canGoPrev = currentStepIndex > 0;
  const canGoNext = currentStepIndex < profileStepOrder.length - 1;
  const nextIncompleteStep = useMemo(
    () => findNextIncompleteStep(orderedStepMeta, stepSummaries, activeStep),
    [activeStep, orderedStepMeta, stepSummaries]
  );
  const goToPrev = useCallback(() => {
    if (canGoPrev) setActiveStep(profileStepOrder[currentStepIndex - 1]);
  }, [canGoPrev, currentStepIndex, profileStepOrder, setActiveStep]);
  const goToNext = useCallback(() => {
    if (canGoNext) setActiveStep(profileStepOrder[currentStepIndex + 1]);
  }, [canGoNext, currentStepIndex, profileStepOrder, setActiveStep]);

  const handleToggleTag = useCallback(
    (tagId: string) => {
      toggleTag(tagId);
      markStepInteraction(activeStep);
    },
    [activeStep, markStepInteraction, toggleTag]
  );

  const handleApplyPreset = useCallback(
    (tagIds: string[]) => {
      const validTagIds = tagIds.filter((tagId) => validTagIdSet.has(tagId));
      if (validTagIds.length === 0) {
        notifications.show({
          title: 'Preset Unavailable',
          message: 'This preset references tags that are no longer available.',
          color: 'yellow',
        });
        return;
      }

      applyPreset(validTagIds);

      if (validTagIds.length !== tagIds.length) {
        notifications.show({
          title: 'Preset Partially Applied',
          message: 'Some preset tags are no longer available and were skipped.',
          color: 'yellow',
        });
      }
    },
    [applyPreset, validTagIdSet]
  );

  const handleSaveBundle = useCallback(
    (name: string, description?: string) => {
      saveBundle({ name, description, tagIds: selectedTagIds });
    },
    [saveBundle, selectedTagIds]
  );

  const handleSaveRecipe = useCallback(
    (name: string, description?: string) => {
      saveRecipe({ name, description, profileId: activeProfileId, tagIds: selectedTagIds });
    },
    [activeProfileId, saveRecipe, selectedTagIds]
  );

  const handleSaveState = useCallback(
    (name: string, description?: string) => {
      saveStateSnapshot({
        name,
        description,
        profileId: activeProfileId,
        activeStep,
        selectedTagIds,
        manualNegativeTexts,
      });
    },
    [activeProfileId, activeStep, manualNegativeTexts, saveStateSnapshot, selectedTagIds]
  );

  return (
    <>
      {triggerVariant === 'button' ? (
        <SwarmButton
          size="xs"
          tone="primary"
          emphasis="soft"
          leftSection={<IconSparkles size={14} />}
          onClick={handleOpen}
          className="generate-studio__prompt-tool-button"
        >
          Prompt Wizard{totalSelected > 0 ? ` (${totalSelected})` : ''}
        </SwarmButton>
      ) : (
        <UnstyledButton
          onClick={handleOpen}
          className="swarm-control-no-select"
          style={{ width: '100%', textAlign: 'left' }}
          aria-label="Open prompt wizard"
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
                  <IconSparkles size={20} />
                </ThemeIcon>
                <Stack gap={2}>
                  <Group gap="xs">
                    <Text fw={600} size="sm">
                      Prompt Wizard
                    </Text>
                    <SwarmBadge tone={totalSelected > 0 ? 'primary' : 'secondary'} emphasis="soft">
                      {totalSelected > 0 ? `${totalSelected} tags` : 'Ready'}
                    </SwarmBadge>
                  </Group>
                  <Text size="xs" c="dimmed">
                    {compact
                      ? 'Build prompts step by step.'
                      : totalSelected > 0
                        ? `${totalSelected} tags selected`
                        : 'Build prompts step by step with guided tag selection'}
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

      {/* Sidebar drawer */}
      <PromptWizardSidebar
        opened={sidebarOpened}
        onClose={sidebarHandlers.close}
        steps={orderedStepMeta}
        activeStep={activeStep}
        stepSummaries={stepSummaries}
        lastEditedStep={lastEditedStep}
        recentSteps={recentSteps}
        recentGroupKeys={recentGroupKeys}
        profileName={profile?.name ?? 'Unknown'}
        nextIncompleteStep={nextIncompleteStep}
        defaultPresets={defaultPresets}
        customPresets={customPresets}
        sessionBundles={sessionBundles}
        savedRecipes={savedRecipes}
        savedStates={savedStates}
        onJumpStep={setActiveStep}
        onApplyPreset={handleApplyPreset}
        onApplyBundle={applyBundle}
        onRemoveBundle={removeBundle}
        onApplyRecipe={applyRecipe}
        onRemoveRecipe={removeRecipe}
        onLoadState={loadStateSnapshot}
        onRemoveState={removeStateSnapshot}
        onSaveBundle={handleSaveBundle}
        onSaveRecipe={handleSaveRecipe}
        onSaveState={handleSaveState}
      />

      {/* Wizard modal */}
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
            maxWidth: '96vw',
            height: `${modalHeight}px`,
            maxHeight: '92vh',
          },
          header: { display: 'none' },
          body: { padding: 0, display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 },
        }}
      >
        {isLoading && !hasLoaded ? (
          <Center p="xl" mih={320}>
            <Stack align="center" gap="sm">
              <Loader size="sm" />
              <Text size="sm" c="dimmed">
                Loading tag library...
              </Text>
            </Stack>
          </Center>
        ) : (
          <Box
            style={{
              position: 'relative',
              display: 'flex',
              flexDirection: 'column',
              flex: 1,
              minHeight: 0,
            }}
          >
            {/* Header with library button */}
            <PromptWizardHeader
              activeProfileId={activeProfileId}
              onProfileChange={setActiveProfile}
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              searchScope={searchScope}
              onSearchScopeChange={setSearchScope}
              totalSelected={totalSelected}
              onClose={handleClose}
              onOpenLibrary={sidebarHandlers.open}
              canvasVisible={canvasVisible}
              onToggleCanvas={toggleCanvas}
            />

            {/* When narrow, show horizontal step tabs */}
            {isNarrow && (
              <PromptWizardSteps
                steps={orderedStepMeta}
                activeStep={activeStep}
                tagCountsByStep={tagCountsByStep}
                completionByStep={completionByStep}
                onStepClick={setActiveStep}
                horizontal
              />
            )}

            {/* Main 3-column body */}
            <Box
              style={{
                display: 'flex',
                flex: 1,
                minHeight: 0,
                minWidth: 0,
                overflow: 'hidden',
                alignItems: 'stretch',
              }}
            >
              {/* Column 1: Vertical step rail (hidden when narrow) */}
              {!isNarrow && (
                <PromptWizardSteps
                  steps={orderedStepMeta}
                  activeStep={activeStep}
                  tagCountsByStep={tagCountsByStep}
                  completionByStep={completionByStep}
                  onStepClick={setActiveStep}
                />
              )}

              {/* Column 2: Tag Palette */}
              <Box
                style={{
                  flex: 1,
                  minWidth: 0,
                  minHeight: 0,
                  height: '100%',
                  overflow: 'hidden',
                }}
              >
                <PromptWizardStepContent
                  stepMeta={stepMeta}
                  tags={stepTags}
                  allTags={allTags}
                  selectedTagIds={selectedTagIdSet}
                  manualNegativeTexts={manualNegativeTexts}
                  searchQuery={searchQuery}
                  onToggleTag={handleToggleTag}
                  onAddNegativePair={toggleManualNegativeText}
                  onFocusGroup={recordGroupFocus}
                />
              </Box>

              {/* Column 3: Prompt Canvas (side panel when wide + visible, bottom strip otherwise) */}
              {!isStackedCanvas && canvasVisible && (
                <Box
                  style={{
                    width: 300,
                    minWidth: 280,
                    maxWidth: 340,
                    height: '100%',
                    flexShrink: 0,
                  }}
                >
                  <PromptWizardPreview
                    positivePreview={assembled.positive}
                    negativePreview={mergedNegativePreview}
                    positiveCount={selectedTags.length}
                    negativeCount={
                      mergedNegativePreview
                        ? mergedNegativePreview.split(profile?.tagSeparator ?? ', ').filter(Boolean)
                            .length
                        : 0
                    }
                    explicitCount={explicitCount}
                    profileName={profile?.name ?? 'Unknown'}
                    profileStepSummary={profileStepSummary}
                    healthIssues={promptHealth}
                    onSendToGenerate={handleSendToGenerate}
                    onAppendToGenerate={handleAppendToGenerate}
                    onCopyPositive={handleCopyPositive}
                    onCopyNegative={handleCopyNegative}
                    onClear={clearSelections}
                    hasSelection={totalSelected > 0}
                    selectedTags={selectedTags}
                    tagWeights={tagWeights}
                    onDeselectTag={deselectTag}
                    activeStep={activeStep}
                    onJumpStep={setActiveStep}
                  />
                </Box>
              )}
            </Box>

            {/* Footer: step nav */}
            <Group
              justify="space-between"
              px="sm"
              py={6}
              style={{
                borderTop: '1px solid var(--mantine-color-default-border)',
                flexShrink: 0,
              }}
            >
              <SwarmButton
                tone="secondary"
                emphasis="ghost"
                size="compact-sm"
                onClick={goToPrev}
                disabled={!canGoPrev}
              >
                Previous
              </SwarmButton>
              <Text size="xs" c="dimmed">
                {stepMeta.label} ({currentStepIndex + 1}/{profileStepOrder.length})
              </Text>
              <SwarmButton
                tone="secondary"
                emphasis="ghost"
                size="compact-sm"
                onClick={goToNext}
                disabled={!canGoNext}
              >
                Next
              </SwarmButton>
            </Group>

            {/* Bottom preview fallback when canvas is stacked (narrow view) or collapsed */}
            {(isStackedCanvas || !canvasVisible) && (
              <Box
                style={{
                  maxHeight: 200,
                  flexShrink: 0,
                  borderTop: '1px solid var(--mantine-color-default-border)',
                }}
              >
                <PromptWizardPreview
                  positivePreview={assembled.positive}
                  negativePreview={mergedNegativePreview}
                  positiveCount={selectedTags.length}
                  negativeCount={
                    mergedNegativePreview
                      ? mergedNegativePreview.split(profile?.tagSeparator ?? ', ').filter(Boolean)
                          .length
                      : 0
                  }
                  explicitCount={explicitCount}
                  profileName={profile?.name ?? 'Unknown'}
                  profileStepSummary={profileStepSummary}
                  healthIssues={promptHealth}
                  onSendToGenerate={handleSendToGenerate}
                  onAppendToGenerate={handleAppendToGenerate}
                  onCopyPositive={handleCopyPositive}
                  onCopyNegative={handleCopyNegative}
                  onClear={clearSelections}
                  hasSelection={totalSelected > 0}
                  selectedTags={selectedTags}
                  tagWeights={tagWeights}
                  onDeselectTag={deselectTag}
                  activeStep={activeStep}
                  onJumpStep={setActiveStep}
                />
              </Box>
            )}

            {/* Resize handles */}
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
        )}
      </Modal>
    </>
  );
});
