import { memo } from 'react';
import { Stack, Group, Badge, Text, Box, Tooltip } from '@mantine/core';
import type { UseFormReturnType } from '@mantine/form';
import type { GenerateParams } from '../../../../api/types';
import { IconRefresh, IconX } from '@tabler/icons-react';
import { PresetLibrary } from '../../../../components/presetLibrary/PresetLibrary';
import { PromptWizard } from '../../../../components/PromptWizard';
import { PromptInput } from '../../../../components/PromptInput';
import { QuickModeIndicator } from '../../../../components/QuickModeIndicator';
import { SwarmActionIcon } from '../../../../components/ui';
import { usePromptBuilderStore } from '../../../../stores/promptBuilderStore';
import {
  compilePromptBuilder,
  detectManualOverride,
  extractPrimaryManagedBlock,
  hasManagedBlock,
  stripManagedBlocks,
  upsertManagedBlock,
} from '../../../../features/promptBuilder';
import { prependPromptText } from '../../../../utils/promptTextTools';

export interface PromptSectionProps {
  /** Form instance */
  form: UseFormReturnType<GenerateParams>;
}

/**
 * Prompt section with prompt presets, main prompt, and negative prompt.
 */
export const PromptSection = memo(function PromptSection({ form }: PromptSectionProps) {
  const regions = usePromptBuilderStore((state) => state.regions);
  const segments = usePromptBuilderStore((state) => state.segments);
  const syncState = usePromptBuilderStore((state) => state.syncState);
  const lastCompiledBlockHash = usePromptBuilderStore((state) => state.lastCompiledBlockHash);
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

  return (
    <Stack gap="sm" className="generate-studio__prompt-section">
      {/* Prompt tools */}
      <Box className="generate-studio__prompt-library-trigger">
        <PromptWizard
          compact
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
      </Box>

      <Box className="generate-studio__prompt-library-trigger">
        <PresetLibrary
          compact
          currentPromptText={form.values.prompt || ''}
          onApplyToPrompt={(text, mode) => {
            if (mode === 'replace') {
              form.setFieldValue('prompt', text);
            } else {
              form.setFieldValue('prompt', prependPromptText(form.values.prompt, text));
            }
          }}
        />
      </Box>

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
              <Tooltip label="Resync prompt builder content from the canvas">
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
              </Tooltip>
              <Tooltip label="Remove the managed prompt block">
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
              </Tooltip>
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
    </Stack>
  );
});
