import { memo } from 'react';
import { Box, Group, Tooltip } from '@mantine/core';
import { SwarmButton } from '../ui';

interface PresetLibraryFooterProps {
  stagedWordCount: number;
  onCancel: () => void;
  onAppend: () => void;
  onReplace: () => void;
}

export const PresetLibraryFooter = memo(function PresetLibraryFooter({
  stagedWordCount,
  onCancel,
  onAppend,
  onReplace,
}: PresetLibraryFooterProps) {
  const actionsDisabled = stagedWordCount === 0;
  const appendTooltip = actionsDisabled ? 'Stage at least one preset first.' : '';
  const replaceTooltip = actionsDisabled
    ? 'Stage at least one preset first.'
    : 'This will overwrite your current prompt.';

  return (
    <Box className="preset-library__footer">
      <Group justify="space-between" align="center" wrap="wrap" gap="sm">
        <SwarmButton tone="secondary" emphasis="ghost" onClick={onCancel}>
          Cancel
        </SwarmButton>

        <Group gap="xs" wrap="wrap" justify="flex-end">
          <Tooltip label={appendTooltip} disabled={!appendTooltip}>
            <Box>
              <SwarmButton
                tone="primary"
                emphasis="soft"
                disabled={actionsDisabled}
                onClick={onAppend}
              >
                Append to Prompt
              </SwarmButton>
            </Box>
          </Tooltip>

          <Tooltip label={replaceTooltip}>
            <Box>
              <SwarmButton
                tone="primary"
                emphasis="solid"
                disabled={actionsDisabled}
                onClick={onReplace}
              >
                Replace Prompt
              </SwarmButton>
            </Box>
          </Tooltip>
        </Group>
      </Group>
    </Box>
  );
});
