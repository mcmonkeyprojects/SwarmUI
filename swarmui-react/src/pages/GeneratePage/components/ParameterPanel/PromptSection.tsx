import { memo, useState } from 'react';
import { Stack, Group, Badge, Text, Box } from '@mantine/core';
import type { UseFormReturnType } from '@mantine/form';
import type { GenerateParams } from '../../../../api/types';
import { IconRefresh, IconUsers, IconX } from '@tabler/icons-react';
import { PresetLibrary } from '../../../../components/presetLibrary/PresetLibrary';
import { PromptWizard } from '../../../../components/PromptWizard';
import { PromptInput } from '../../../../components/PromptInput';
import { QuickModeIndicator } from '../../../../components/QuickModeIndicator';
import { CharacterRegionsBuilderModal } from '../../../../components/CharacterRegionsBuilderModal';
import { SwarmActionIcon, SwarmButton, SwarmTooltip } from '../../../../components/ui';
import { usePromptBuilderStore } from '../../../../stores/promptBuilderStore';
import {
  compilePromptBuilder,
  detectManualOverride,
  extractPrimaryManagedBlock,
  hasManagedBlock,
  stripManagedBlocks,
  upsertManagedBlock,
} from '../../../../features/promptBuilder';
import {
  appendPresetSectionsToPrompt,
  formatPresetSectionsForPrompt,
  prependPromptText,
} from '../../../../utils/promptTextTools';

export interface PromptSectionProps {
  /** Form instance */
  form: UseFormReturnType<GenerateParams>;
}

/**
 * Prompt section with prompt presets, main prompt, and negative prompt.
 */
export const PromptSection = memo(function PromptSection({ form }: PromptSectionProps) {
  const [characterRegionsOpen, setCharacterRegionsOpen] = useState(false);
  const regions = usePromptBuilderStore((state) => state.regions);
  const segments = usePromptBuilderStore((state) => state.segments);
  const syncState = usePromptBuilderStore((state) => state.syncState);
  const lastCompiledBlockHash = usePromptBuilderStore((state) => state.lastCompiledBlockHash);
  const setRegions = usePromptBuilderStore((state) => state.setRegions);
  const markManualOverride = usePromptBuilderStore((state) => state.markManualOverride);
  const markSynced = usePromptBuilderStore((state) => state.markSynced);
  const clearManagedBlock = usePromptBuilderStore((state) => state.clearManagedBlock);

  const hasBuilderRules = regions.length > 0 || segments.length > 0;
  const hasVisibleBlock = hasManagedBlock(form.values.prompt || '');
  const showBuilderStatus = hasBuilderRules || hasVisibleBlock || !!lastCompiledBlockHash;

  const handlePromptChange = (value: string) => {
    if (lastCompiledBlockHash) {
      const overridden = detectManualOverride(value, lastCompiledBlockHash);
      if (overridden && syncState === 'synced') {
        markManualOverride();
      } else if (!overridden && syncState === 'manual_override') {
        const currentBlock = extractPrimaryManagedBlock(value);
        if (currentBlock) {
          markSynced(currentBlock.raw, lastCompiledBlockHash);
        }
      }
    }
    form.setFieldValue('prompt', value);
  };

  const handleResyncFromCanvas = () => {
    const compiled = compilePromptBuilder({ regions, segments });
    const nextPrompt = upsertManagedBlock(form.values.prompt || '', compiled.managedBlock);
    form.setFieldValue('prompt', nextPrompt);
    markSynced(compiled.managedBlock, compiled.blockHash);
  };

  const handleRemoveManagedBlock = () => {
    const nextPrompt = stripManagedBlocks(form.values.prompt || '');
    form.setFieldValue('prompt', nextPrompt);
    clearManagedBlock();
  };

  const handleApplyCharacterRegions = (characterRegions: typeof regions) => {
    const nextRegions = [
      ...regions.filter((region) => region.source !== 'character'),
      ...characterRegions,
    ];
    const compiled = compilePromptBuilder({ regions: nextRegions, segments });
    const nextPrompt = upsertManagedBlock(form.values.prompt || '', compiled.managedBlock);
    setRegions(nextRegions);
    form.setFieldValue('prompt', nextPrompt);
    markSynced(compiled.managedBlock, compiled.blockHash);
  };

  return (
    <Stack gap="sm" className="generate-studio__prompt-section">
      <Group gap="xs" wrap="wrap" className="generate-studio__prompt-tools">
        <PromptWizard
          compact
          triggerVariant="button"
          onApplyToPrompt={(text, mode) => {
            if (mode === 'replace') {
              form.setFieldValue('prompt', text);
            } else {
              form.setFieldValue('prompt', prependPromptText(form.values.prompt, text));
            }
          }}
          onApplyToNegative={(text, mode) => {
            if (mode === 'replace') {
              form.setFieldValue('negativeprompt', text);
            } else {
              form.setFieldValue(
                'negativeprompt',
                prependPromptText(form.values.negativeprompt, text)
              );
            }
          }}
        />

        <SwarmButton
          size="xs"
          emphasis="soft"
          tone="secondary"
          leftSection={<IconUsers size={14} />}
          onClick={() => setCharacterRegionsOpen(true)}
        >
          Character Regions
        </SwarmButton>

        <PresetLibrary
          compact
          triggerVariant="button"
          currentPromptText={form.values.prompt || ''}
          onApplyToPrompt={(text, mode, sections) => {
            if (mode === 'replace') {
              form.setFieldValue(
                'prompt',
                sections ? formatPresetSectionsForPrompt(sections) : text
              );
            } else {
              form.setFieldValue(
                'prompt',
                sections
                  ? appendPresetSectionsToPrompt(form.values.prompt, sections)
                  : prependPromptText(form.values.prompt, text)
              );
            }
          }}
        />
      </Group>

      {showBuilderStatus && (
        <Stack gap={6} className="generate-studio__prompt-builder-status">
          <Group justify="space-between" align="center" wrap="wrap">
            <Group gap="xs">
              <Text size="xs" c="dimmed">
                Prompt Builder
              </Text>
              <Badge
                size="sm"
                variant="light"
                color={
                  syncState === 'synced'
                    ? 'green'
                    : syncState === 'manual_override'
                      ? 'yellow'
                      : 'gray'
                }
              >
                {syncState.replace('_', ' ')}
              </Badge>
            </Group>
            <Group gap="xs" className="generate-studio__prompt-builder-actions">
              <SwarmTooltip label="Resync prompt builder content from the canvas">
                <SwarmActionIcon
                  size="sm"
                  tone="secondary"
                  emphasis="ghost"
                  onClick={handleResyncFromCanvas}
                  disabled={!hasBuilderRules}
                  aria-label="Resync from canvas"
                >
                  <IconRefresh size={15} />
                </SwarmActionIcon>
              </SwarmTooltip>
              <SwarmTooltip label="Remove the managed prompt block">
                <SwarmActionIcon
                  size="sm"
                  tone="secondary"
                  emphasis="ghost"
                  onClick={handleRemoveManagedBlock}
                  disabled={!hasVisibleBlock}
                  aria-label="Remove managed block"
                >
                  <IconX size={15} />
                </SwarmActionIcon>
              </SwarmTooltip>
            </Group>
          </Group>
          {syncState === 'manual_override' && (
            <Text size="xs" c="yellow.6">
              Managed block was edited manually. Canvas state will not auto-overwrite it until
              resync.
            </Text>
          )}
        </Stack>
      )}

      {/* Prompt */}
      <PromptInput
        label="Prompt"
        placeholder="A beautiful landscape with mountains..."
        required
        value={form.values.prompt}
        onChange={handlePromptChange}
        promptRole="prompt"
        contextModel={form.values.model || ''}
        onNegativePromptChange={(value) => form.setFieldValue('negativeprompt', value)}
        autosize
        minRows={4}
        maxRows={12}
        showSyntaxButton={true}
      />

      {/* Negative Prompt */}
      <PromptInput
        label="Negative Prompt"
        placeholder="ugly, blurry, bad quality..."
        value={form.values.negativeprompt || ''}
        onChange={(value) => form.setFieldValue('negativeprompt', value)}
        promptRole="negative"
        contextModel={form.values.model || ''}
        autosize
        minRows={2}
        maxRows={12}
      />

      <Box className="generate-studio__prompt-cache-row">
        <QuickModeIndicator
          prompt={form.values.prompt || ''}
          model={form.values.model || ''}
          negativePrompt={form.values.negativeprompt}
          compact={false}
        />
      </Box>

      {characterRegionsOpen && (
        <CharacterRegionsBuilderModal
          opened={characterRegionsOpen}
          existingRegions={regions}
          onClose={() => setCharacterRegionsOpen(false)}
          onApply={handleApplyCharacterRegions}
        />
      )}
    </Stack>
  );
});
