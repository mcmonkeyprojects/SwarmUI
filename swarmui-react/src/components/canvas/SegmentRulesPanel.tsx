import { memo, useMemo, useState } from 'react';
import {
  Box,
  Card,
  Collapse,
  Group,
  ScrollArea,
  Select,
  Stack,
  Text,
  TextInput,
  Textarea,
  Tooltip,
} from '@mantine/core';
import {
  IconChevronDown,
  IconChevronUp,
  IconSparkles,
  IconPlus,
  IconTrash,
} from '@tabler/icons-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { BuilderSegmentRule } from '../../features/promptBuilder';
import { usePromptBuilderStore } from '../../stores/promptBuilderStore';
import { useT2IParams } from '../../hooks/useT2IParams';
import type { T2IParam } from '../../api/types';
import type { SamplerOption, SchedulerOption } from '../../data/samplerData';
import { SamplingSelect, SwarmActionIcon, SwarmButton, SwarmSlider, SwarmSwitch } from '../ui';

interface SegmentRuleCardProps {
  rule: BuilderSegmentRule;
  index: number;
  total: number;
  yoloOptions: { value: string; label: string }[];
  samplerOptions: SamplerOption[];
  schedulerOptions: SchedulerOption[];
  onUpdate: (updates: Partial<BuilderSegmentRule>) => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}

const SegmentRuleCard = memo(function SegmentRuleCard({
  rule,
  index,
  total,
  yoloOptions,
  samplerOptions,
  schedulerOptions,
  onUpdate,
  onDelete,
  onMoveUp,
  onMoveDown,
}: SegmentRuleCardProps) {
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const modelSelectData = useMemo(() => ([
    { value: 'auto', label: 'Auto (Grounded SAM2)' },
    { value: 'grounded-sam2', label: 'Grounded SAM2' },
    { value: 'clip-seg', label: 'CLIP-Seg (Text Match)' },
    ...yoloOptions,
  ]), [yoloOptions]);

  const modelValue = rule.modelType !== 'yolo'
    ? rule.modelType
    : `yolo:${rule.yoloModel}`;

  return (
    <Card
      p="sm"
      radius="sm"
      style={{
        border: '1px solid var(--mantine-color-invokeGray-7)',
        backgroundColor: 'var(--mantine-color-invokeGray-9)',
      }}
    >
      <Stack gap="xs">
        <Group justify="space-between">
          <Text size="sm" fw={500} c="invokeGray.0">
            Segment Rule {index + 1}
          </Text>
          <Group gap={2}>
            <Tooltip label="Move up">
              <SwarmActionIcon
                size="xs"
                tone="secondary"
                emphasis="ghost"
                label="Move segment rule up"
                disabled={index === 0}
                onClick={onMoveUp}
              >
                <IconChevronUp size={12} />
              </SwarmActionIcon>
            </Tooltip>
            <Tooltip label="Move down">
              <SwarmActionIcon
                size="xs"
                tone="secondary"
                emphasis="ghost"
                label="Move segment rule down"
                disabled={index === total - 1}
                onClick={onMoveDown}
              >
                <IconChevronDown size={12} />
              </SwarmActionIcon>
            </Tooltip>
            <Tooltip label="Delete">
              <SwarmActionIcon size="xs" tone="danger" emphasis="ghost" label="Delete segment rule" onClick={onDelete}>
                <IconTrash size={12} />
              </SwarmActionIcon>
            </Tooltip>
          </Group>
        </Group>

        <Select
          label="Segment Model"
          size="xs"
          data={modelSelectData}
          value={modelValue}
          onChange={(value) => {
            if (!value || value === 'auto' || value === 'grounded-sam2' || value === 'clip-seg') {
              onUpdate({ modelType: (value || 'auto') as BuilderSegmentRule['modelType'] });
              return;
            }
            onUpdate({
              modelType: 'yolo',
              yoloModel: value.replace('yolo:', ''),
            });
          }}
          comboboxProps={{ withinPortal: false }}
        />

        {rule.modelType !== 'yolo' ? (
          <TextInput
            label="Text Match"
            size="xs"
            value={rule.textMatch}
            placeholder="face"
            onChange={(event) => onUpdate({ textMatch: event.currentTarget.value })}
          />
        ) : (
          <Group grow>
            <TextInput
              label="YOLO Match ID"
              size="xs"
              type="number"
              value={`${rule.yoloId}`}
              onChange={(event) => {
                const parsed = Number.parseInt(event.currentTarget.value, 10);
                onUpdate({ yoloId: Number.isNaN(parsed) ? 0 : Math.max(0, parsed) });
              }}
            />
            <TextInput
              label="YOLO Class IDs"
              size="xs"
              value={rule.yoloClassIds}
              placeholder="0,apple,2"
              onChange={(event) => onUpdate({ yoloClassIds: event.currentTarget.value })}
            />
          </Group>
        )}

        <Textarea
          label="Generation Prompt"
          size="xs"
          value={rule.prompt}
          placeholder="Optional segment generation prompt..."
          onChange={(event) => onUpdate({ prompt: event.currentTarget.value })}
          autosize
          minRows={2}
          maxRows={4}
        />
        <Text size="xs" c="invokeGray.4">
          Leave this blank to reuse the main prompt. Broader matches like face or face|hair usually work better than tiny targets.
        </Text>

        <Box>
          <Group justify="space-between" mb={4}>
            <Text size="xs" c="invokeGray.4">Creativity</Text>
            <Text size="xs" c="invokeGray.3">{rule.creativity.toFixed(2)}</Text>
          </Group>
          <SwarmSlider
            value={rule.creativity}
            onChange={(value) => onUpdate({ creativity: value })}
            min={0}
            max={1}
            step={0.05}
            size="xs"
          />
        </Box>

        <Box>
          <Group justify="space-between" mb={4}>
            <Text size="xs" c="invokeGray.4">Threshold</Text>
            <Text size="xs" c="invokeGray.3">{rule.threshold.toFixed(2)}</Text>
          </Group>
          <SwarmSlider
            value={rule.threshold}
            onChange={(value) => onUpdate({ threshold: value })}
            min={0}
            max={1}
            step={0.05}
            size="xs"
          />
        </Box>

        <Group grow>
          <SwarmSwitch
            label="Invert Mask"
            size="xs"
            checked={rule.invertMask}
            onChange={(event) => onUpdate({ invertMask: event.currentTarget.checked })}
          />
          <SwarmSwitch
            label="Enabled"
            size="xs"
            checked={rule.enabled}
            onChange={(event) => onUpdate({ enabled: event.currentTarget.checked })}
          />
        </Group>

        <SwarmButton
          emphasis="ghost"
          tone="secondary"
          size="compact-xs"
          onClick={() => setAdvancedOpen((current) => !current)}
        >
          {advancedOpen ? 'Hide Advanced Options' : 'Show Advanced Options'}
        </SwarmButton>

        <Collapse expanded={advancedOpen}>
          <Stack gap="xs">
            <Group grow>
              <SamplingSelect
                kind="sampler"
                label="Sampler (Optional)"
                size="xs"
                clearable
                withSelectedDescription={false}
                value={rule.sampler || null}
                data={samplerOptions}
                onChange={(value) => onUpdate({ sampler: value || '' })}
                searchable
                comboboxProps={{ withinPortal: false }}
              />
              <SamplingSelect
                kind="scheduler"
                label="Scheduler (Optional)"
                size="xs"
                clearable
                withSelectedDescription={false}
                value={rule.scheduler || null}
                data={schedulerOptions}
                onChange={(value) => onUpdate({ scheduler: value || '' })}
                searchable
                comboboxProps={{ withinPortal: false }}
              />
            </Group>
            <Text size="xs" c="invokeGray.4">
              Advanced sampler controls are optional and only use existing backend-supported segment parameters.
            </Text>
          </Stack>
        </Collapse>
      </Stack>
    </Card>
  );
});

const COMMON_SEGMENT_PRESETS: Array<{
  label: string;
  textMatch: string;
  prompt: string;
}> = [
  { label: 'Face', textMatch: 'face', prompt: 'restore facial details and identity' },
  { label: 'Face + Hair', textMatch: 'face|hair', prompt: 'restore facial details and separate the hairstyle cleanly' },
  { label: 'Hair', textMatch: 'hair', prompt: 'clean hairstyle and hair silhouette' },
  { label: 'Hands', textMatch: 'hands', prompt: 'repair hand shape and finger detail' },
  { label: 'Clothing', textMatch: 'shirt', prompt: 'separate clothing color and details clearly' },
  { label: 'Background', textMatch: 'background', prompt: 'clean up background objects and separation' },
];

export const SegmentRulesPanel = memo(function SegmentRulesPanel() {
  const segments = usePromptBuilderStore((state) => state.segments);
  const addSegment = usePromptBuilderStore((state) => state.addSegment);
  const updateSegment = usePromptBuilderStore((state) => state.updateSegment);
  const removeSegment = usePromptBuilderStore((state) => state.removeSegment);
  const reorderSegments = usePromptBuilderStore((state) => state.reorderSegments);

  const { params, samplerOptions, schedulerOptions } = useT2IParams();

  const yoloOptions = useMemo(() => {
    const yoloParam = params.find((param: T2IParam) => param.id === 'yolomodelinternal');
    if (!yoloParam?.values?.length) {
      return [] as { value: string; label: string }[];
    }
    return yoloParam.values.map((value) => ({
      value: `yolo:${value}`,
      label: value,
    }));
  }, [params]);

  return (
    <Card
      p="sm"
      radius="md"
      style={{
        border: '1px solid var(--mantine-color-invokeGray-7)',
        backgroundColor: 'var(--mantine-color-invokeGray-9)',
      }}
    >
      <Stack gap="md">
        <Group justify="space-between">
          <Text size="sm" fw={500} c="invokeGray.1">
            Segment Rules
          </Text>
          {segments.length > 0 && (
            <Tooltip label="Remove all segment rules">
              <SwarmActionIcon
                size="sm"
                tone="danger"
                emphasis="ghost"
                label="Remove all segment rules"
                onClick={() => {
                  for (const segment of segments) {
                    removeSegment(segment.id);
                  }
                }}
              >
                <IconTrash size={14} />
              </SwarmActionIcon>
            </Tooltip>
          )}
        </Group>

        <SwarmButton
          size="xs"
          emphasis="soft"
          leftSection={<IconPlus size={14} />}
          onClick={() => addSegment()}
        >
          Add Segment Rule
        </SwarmButton>

        <Box>
          <Text size="xs" c="invokeGray.4" mb="xs">
            Quick Assist Presets
          </Text>
          <Group gap="xs">
            {COMMON_SEGMENT_PRESETS.map((preset) => (
              <SwarmButton
                key={preset.label}
                size="compact-xs"
                emphasis="ghost"
                tone="secondary"
                leftSection={<IconSparkles size={12} />}
                onClick={() => addSegment({
                  modelType: 'auto',
                  textMatch: preset.textMatch,
                  prompt: preset.prompt,
                  creativity: 0.6,
                  threshold: 0.5,
                  enabled: true,
                })}
              >
                {preset.label}
              </SwarmButton>
            ))}
          </Group>
          <Text size="xs" c="invokeGray.5" mt="xs">
            These compile to the existing backend <code>{'<segment:...>'}</code> syntax and stay compatible with Swarm segment refining.
          </Text>
        </Box>

        {segments.length === 0 ? (
          <Box
            p="md"
            style={{
              textAlign: 'center',
              border: '1px dashed var(--mantine-color-invokeGray-7)',
              borderRadius: 8,
            }}
          >
            <Text size="sm" c="invokeGray.4">No segment rules defined.</Text>
            <Text size="xs" c="invokeGray.5">
              Segment rules compile to &lt;segment:...&gt; syntax.
            </Text>
          </Box>
        ) : (
          <ScrollArea h={340} offsetScrollbars>
            <Stack gap="xs">
              <AnimatePresence>
                {segments.map((rule, index) => (
                  <motion.div
                    key={rule.id}
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.15 }}
                  >
                    <SegmentRuleCard
                      rule={rule}
                      index={index}
                      total={segments.length}
                      yoloOptions={yoloOptions}
                      samplerOptions={samplerOptions}
                      schedulerOptions={schedulerOptions}
                      onUpdate={(updates) => updateSegment(rule.id, updates)}
                      onDelete={() => removeSegment(rule.id)}
                      onMoveUp={() => reorderSegments(index, index - 1)}
                      onMoveDown={() => reorderSegments(index, index + 1)}
                    />
                  </motion.div>
                ))}
              </AnimatePresence>
            </Stack>
          </ScrollArea>
        )}
      </Stack>
    </Card>
  );
});

export default SegmentRulesPanel;
