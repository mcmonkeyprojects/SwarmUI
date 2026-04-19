import { memo } from 'react';
import { Group, Select, Stack, Text, TextInput, ThemeIcon } from '@mantine/core';
import {
  IconLayoutSidebarRight,
  IconLayoutSidebarRightCollapse,
  IconLibrary,
  IconSearch,
  IconSparkles,
  IconX,
} from '@tabler/icons-react';
import { SwarmActionIcon, SwarmBadge, SwarmSegmentedControl } from './ui';
import { PROFILES } from '../features/promptWizard/profiles';

interface PromptWizardHeaderProps {
  activeProfileId: string;
  onProfileChange: (profileId: string) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  searchScope: 'global' | 'step';
  onSearchScopeChange: (scope: 'global' | 'step') => void;
  totalSelected: number;
  onClose: () => void;
  onOpenLibrary?: () => void;
  canvasVisible?: boolean;
  onToggleCanvas?: () => void;
}

export const PromptWizardHeader = memo(function PromptWizardHeader({
  activeProfileId,
  onProfileChange,
  searchQuery,
  onSearchChange,
  searchScope,
  onSearchScopeChange,
  totalSelected,
  onClose,
  onOpenLibrary,
  canvasVisible,
  onToggleCanvas,
}: PromptWizardHeaderProps) {
  return (
    <Stack
      gap="sm"
      px="lg"
      py="sm"
      style={{
        borderBottom: '1px solid var(--mantine-color-default-border)',
        background:
          'linear-gradient(180deg, color-mix(in srgb, var(--elevation-raised) 82%, transparent), transparent)',
      }}
    >
      <Group justify="space-between" align="flex-start" gap="md" wrap="wrap">
        <Group align="flex-start" gap="sm" wrap="nowrap">
          <ThemeIcon
            size={40}
            radius="md"
            variant="light"
            color="gray"
            style={{ backgroundColor: 'var(--elevation-paper)' }}
          >
            <IconSparkles size={18} />
          </ThemeIcon>
          <Stack gap={2}>
            <Group gap="xs">
              <Text fw={700} size="lg">
                Prompt Wizard
              </Text>
              <SwarmBadge tone={totalSelected > 0 ? 'primary' : 'secondary'} emphasis="soft">
                {totalSelected > 0 ? `${totalSelected} tags` : 'Ready'}
              </SwarmBadge>
            </Group>
            <Text size="sm" c="dimmed">
              Build prompts step by step with model-appropriate tag ordering.
            </Text>
          </Stack>
        </Group>
        <Group gap="xs">
          {onToggleCanvas && (
            <SwarmActionIcon
              tone={canvasVisible ? 'primary' : 'secondary'}
              emphasis={canvasVisible ? 'soft' : 'ghost'}
              onClick={onToggleCanvas}
              label={canvasVisible ? 'Hide prompt canvas' : 'Show prompt canvas'}
            >
              {canvasVisible ? (
                <IconLayoutSidebarRightCollapse size={18} />
              ) : (
                <IconLayoutSidebarRight size={18} />
              )}
            </SwarmActionIcon>
          )}
          {onOpenLibrary && (
            <SwarmActionIcon
              tone="secondary"
              emphasis="soft"
              onClick={onOpenLibrary}
              label="Open build tools & library"
            >
              <IconLibrary size={18} />
            </SwarmActionIcon>
          )}
          <SwarmActionIcon
            tone="secondary"
            emphasis="ghost"
            onClick={onClose}
            label="Close prompt wizard"
          >
            <IconX size={18} />
          </SwarmActionIcon>
        </Group>
      </Group>
      <Group align="stretch" gap="xs" wrap="wrap">
        <TextInput
          placeholder={
            searchScope === 'global'
              ? 'Search tags across all steps...'
              : 'Search only in the current step...'
          }
          leftSection={<IconSearch size={16} />}
          value={searchQuery}
          onChange={(event) => onSearchChange(event.currentTarget.value)}
          size="sm"
          style={{ flex: '1 1 360px', minWidth: 280 }}
        />
        <SwarmSegmentedControl
          value={searchScope}
          onChange={(value) => onSearchScopeChange(value as 'global' | 'step')}
          data={[
            { label: 'Global', value: 'global' },
            { label: 'This Step', value: 'step' },
          ]}
          style={{ flex: '0 0 176px' }}
        />
        <Select
          data={PROFILES.map((p) => ({ value: p.id, label: p.name }))}
          value={activeProfileId}
          onChange={(value) => value && onProfileChange(value)}
          size="sm"
          style={{ flex: '0 0 240px', minWidth: 220 }}
        />
      </Group>
    </Stack>
  );
});
