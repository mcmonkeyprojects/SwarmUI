import { memo, useCallback, useState, useMemo } from 'react';
import {
  Group,
  type MantineStyleProp,
  UnstyledButton,
  Popover,
  Slider,
  NumberInput,
  Tooltip,
  Stack,
  Text,
} from '@mantine/core';
import { IconSparkles, IconAlertTriangle } from '@tabler/icons-react';
import { SwarmBadge } from './ui';
import type { SwarmEmphasis, SwarmTone } from './ui';

interface PromptWizardTagChipProps {
  text: string;
  selected: boolean;
  weight?: number;
  isConflict?: boolean;
  isPairing?: boolean;
  onToggle: () => void;
  onWeightChange?: (weight: number) => void;
  // Tooltip data
  aliases?: string[];
  negativeText?: string;
  conflictTagNames?: string[];
  pairingTagNames?: string[];
}

export const PromptWizardTagChip = memo(function PromptWizardTagChip({
  text,
  selected,
  weight = 1.0,
  isConflict,
  isPairing,
  onToggle,
  onWeightChange,
  aliases,
  negativeText,
  conflictTagNames,
  pairingTagNames,
}: PromptWizardTagChipProps) {
  const [weightPopoverOpen, setWeightPopoverOpen] = useState(false);

  const handleWeightClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setWeightPopoverOpen((o) => !o);
  }, []);

  const handleSliderChange = useCallback(
    (val: number) => {
      onWeightChange?.(Math.round(val * 10) / 10);
    },
    [onWeightChange]
  );

  const handleNumberChange = useCallback(
    (val: string | number) => {
      if (typeof val === 'number') {
        const clamped = Math.max(0.1, Math.min(2.0, Math.round(val * 10) / 10));
        onWeightChange?.(clamped);
      }
    },
    [onWeightChange]
  );

  // Build tooltip content
  const tooltipContent = useMemo(() => {
    const lines: string[] = [];
    if (aliases && aliases.length > 0) {
      lines.push(`Also known as: ${aliases.join(', ')}`);
    }
    if (negativeText) {
      lines.push(`Auto-negative: ${negativeText}`);
    }
    if (conflictTagNames && conflictTagNames.length > 0) {
      lines.push(`Conflicts with: ${conflictTagNames.join(', ')}`);
    }
    if (pairingTagNames && pairingTagNames.length > 0) {
      lines.push(`Pairs well with: ${pairingTagNames.join(', ')}`);
    }
    return lines.length > 0 ? lines.join('\n') : null;
  }, [aliases, negativeText, conflictTagNames, pairingTagNames]);

  // Determine styling based on conflict / pairing
  let tone: SwarmTone = selected ? 'primary' : 'secondary';
  let emphasis: SwarmEmphasis = selected ? 'solid' : 'ghost';
  const style: MantineStyleProp = {
    cursor: 'pointer',
    userSelect: 'none',
    fontSize: '0.90rem',
    paddingInline: selected ? 8 : 14,
    paddingBlock: 4,
  };

  if (!selected && isConflict) {
    tone = 'danger';
    emphasis = 'soft';
    style.opacity = 0.6;
    style.textDecoration = 'line-through';
  } else if (!selected && isPairing) {
    tone = 'warning';
    emphasis = 'light';
    style.border = '1px solid var(--mantine-color-warning-light)';
  }

  const badge = (
    <SwarmBadge
      tone={tone}
      emphasis={emphasis}
      size="lg"
      style={style}
      onClick={onToggle}
      title={
        isConflict ? 'Conflicts with current selection' : isPairing ? 'Suggested pairing!' : ''
      }
    >
      <Group gap={6} wrap="nowrap" align="center">
        {!selected && isPairing && <IconSparkles size={12} />}
        {!selected && isConflict && <IconAlertTriangle size={12} />}
        <span>{text}</span>

        {selected && onWeightChange && (
          <Popover
            opened={weightPopoverOpen}
            onChange={setWeightPopoverOpen}
            position="bottom"
            withArrow
            shadow="md"
            trapFocus={false}
          >
            <Popover.Target>
              <UnstyledButton
                onClick={handleWeightClick}
                className="swarm-control-no-select"
                style={{
                  background: 'rgba(0,0,0,0.15)',
                  borderRadius: 8,
                  padding: '1px 6px',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  lineHeight: 1.4,
                }}
              >
                {weight.toFixed(1)}
              </UnstyledButton>
            </Popover.Target>
            <Popover.Dropdown onClick={(e) => e.stopPropagation()} style={{ padding: 12 }}>
              <Stack gap="xs" style={{ width: 180 }}>
                <Text size="xs" fw={600}>
                  Tag Weight
                </Text>
                <Slider
                  value={weight}
                  onChange={handleSliderChange}
                  min={0.1}
                  max={2.0}
                  step={0.1}
                  marks={[
                    { value: 0.5, label: '0.5' },
                    { value: 1.0, label: '1.0' },
                    { value: 1.5, label: '1.5' },
                    { value: 2.0, label: '2.0' },
                  ]}
                  size="sm"
                  label={(val) => val.toFixed(1)}
                />
                <NumberInput
                  value={weight}
                  onChange={handleNumberChange}
                  min={0.1}
                  max={2.0}
                  step={0.1}
                  decimalScale={1}
                  size="xs"
                />
              </Stack>
            </Popover.Dropdown>
          </Popover>
        )}
      </Group>
    </SwarmBadge>
  );

  if (tooltipContent) {
    return (
      <Tooltip
        label={tooltipContent}
        multiline
        w={260}
        openDelay={400}
        withArrow
        position="top"
        style={{ whiteSpace: 'pre-line' }}
      >
        {badge}
      </Tooltip>
    );
  }

  return badge;
});
