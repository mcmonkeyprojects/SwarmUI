import { useCallback, useMemo, useRef, useState, type PointerEvent } from 'react';
import {
  Badge,
  Box,
  Divider,
  Group,
  Loader,
  Modal,
  MultiSelect,
  NumberInput,
  Paper,
  ScrollArea,
  Select,
  Stack,
  Text,
  Textarea,
  TextInput,
  Tooltip,
} from '@mantine/core';
import { IconRefresh, IconUsers } from '@tabler/icons-react';
import type { BuilderRegionRule } from '../features/promptBuilder';
import {
  CHARACTER_LAYOUT_PRESETS,
  buildCharacterRegionRules,
  clampCharacterRegionBox,
  createCharacterRegionDraft,
  createCharacterRegionDrafts,
  getDefaultCharacterLayoutPreset,
  getCharacterLayoutBoxes,
  type CharacterLayoutPreset,
  type CharacterRegionDraft,
} from '../features/promptBuilder';
import { useLoRAs } from '../hooks/useModels';
import type { LoRA } from '../api/types';
import { SwarmActionIcon, SwarmButton, SwarmSlider, SwarmSwitch } from './ui';

interface CharacterRegionsBuilderModalProps {
  opened: boolean;
  existingRegions: BuilderRegionRule[];
  onClose: () => void;
  onApply: (regions: BuilderRegionRule[]) => void;
}

interface DragState {
  id: string;
  offsetX: number;
  offsetY: number;
}

const CHARACTER_COUNT_OPTIONS = [
  { value: '1', label: '1 character' },
  { value: '2', label: '2 characters' },
  { value: '3', label: '3 characters' },
  { value: '4', label: '4 characters' },
];

const PRESET_OPTIONS = Object.entries(CHARACTER_LAYOUT_PRESETS).map(([value, label]) => ({
  value,
  label,
}));

function regionToDraft(region: BuilderRegionRule, index: number): CharacterRegionDraft {
  return createCharacterRegionDraft(index, {
    x: region.x,
    y: region.y,
    width: region.width,
    height: region.height,
  }, {
    id: region.id,
    name: region.label || `Character ${index + 1}`,
    prompt: region.prompt,
    strength: region.strength,
    useInpaint: region.useInpaint,
    inpaintStrength: region.inpaintStrength,
    enabled: region.enabled,
    loras: [],
  });
}

function getLoraLabel(lora: LoRA): string {
  if (lora.title && lora.title !== lora.name) {
    return `${lora.title} (${lora.name})`;
  }
  return lora.name;
}

function createInitialDrafts(existingRegions: BuilderRegionRule[]): CharacterRegionDraft[] {
  const characterRegions = existingRegions.filter((region) => region.source === 'character');
  if (characterRegions.length > 0) {
    return characterRegions.slice(0, 4).map(regionToDraft);
  }
  return createCharacterRegionDrafts(2, 'left-right');
}

export function CharacterRegionsBuilderModal({
  opened,
  existingRegions,
  onClose,
  onApply,
}: CharacterRegionsBuilderModalProps) {
  const previewRef = useRef<HTMLDivElement>(null);
  const initialDrafts = useMemo(() => createInitialDrafts(existingRegions), [existingRegions]);
  const hasExistingCharacterRegions = existingRegions.some((region) => region.source === 'character');
  const [count, setCount] = useState(initialDrafts.length);
  const [preset, setPreset] = useState<CharacterLayoutPreset>(hasExistingCharacterRegions ? 'custom' : 'left-right');
  const [drafts, setDrafts] = useState<CharacterRegionDraft[]>(initialDrafts);
  const [activeId, setActiveId] = useState<string>(initialDrafts[0]?.id ?? 'character-region-1');
  const [dragState, setDragState] = useState<DragState | null>(null);
  const lorasQuery = useLoRAs({ enabled: opened });

  const loraOptions = useMemo(() => {
    return (lorasQuery.data ?? []).map((lora: LoRA) => ({
      value: lora.name,
      label: getLoraLabel(lora),
    }));
  }, [lorasQuery.data]);

  const activeDraft = drafts.find((draft) => draft.id === activeId) ?? drafts[0] ?? null;

  const updateDraft = useCallback((id: string, updates: Partial<CharacterRegionDraft>) => {
    setDrafts((current) => current.map((draft) => {
      if (draft.id !== id) {
        return draft;
      }
      const next = { ...draft, ...updates };
      const box = clampCharacterRegionBox(next);
      return { ...next, ...box };
    }));
  }, []);

  const applyPreset = useCallback((nextCount: number, nextPreset: CharacterLayoutPreset) => {
    const boxes = getCharacterLayoutBoxes(nextCount, nextPreset);
    setDrafts((current) => boxes.map((box, index) => createCharacterRegionDraft(index, box, current[index])));
    setActiveId('character-region-1');
  }, []);

  const handleCountChange = useCallback((value: string | null) => {
    const nextCount = Math.max(1, Math.min(4, Number(value || 1)));
    const nextPreset = preset === 'custom' ? getDefaultCharacterLayoutPreset(nextCount) : preset;
    setCount(nextCount);
    setPreset(nextPreset);
    applyPreset(nextCount, nextPreset);
  }, [applyPreset, preset]);

  const handlePresetChange = useCallback((value: string | null) => {
    const nextPreset = (value || getDefaultCharacterLayoutPreset(count)) as CharacterLayoutPreset;
    setPreset(nextPreset);
    if (nextPreset !== 'custom') {
      applyPreset(count, nextPreset);
    }
  }, [applyPreset, count]);

  const handlePointerDown = useCallback((event: PointerEvent<HTMLDivElement>, draft: CharacterRegionDraft) => {
    const preview = previewRef.current;
    if (!preview) {
      return;
    }
    const rect = preview.getBoundingClientRect();
    const pointerX = (event.clientX - rect.left) / rect.width;
    const pointerY = (event.clientY - rect.top) / rect.height;
    setActiveId(draft.id);
    setDragState({
      id: draft.id,
      offsetX: pointerX - draft.x,
      offsetY: pointerY - draft.y,
    });
    setPreset('custom');
    event.currentTarget.setPointerCapture(event.pointerId);
  }, []);

  const handlePointerMove = useCallback((event: PointerEvent<HTMLDivElement>) => {
    if (!dragState) {
      return;
    }
    const preview = previewRef.current;
    const draft = drafts.find((item) => item.id === dragState.id);
    if (!preview || !draft) {
      return;
    }
    const rect = preview.getBoundingClientRect();
    const pointerX = (event.clientX - rect.left) / rect.width;
    const pointerY = (event.clientY - rect.top) / rect.height;
    updateDraft(dragState.id, {
      x: pointerX - dragState.offsetX,
      y: pointerY - dragState.offsetY,
    });
  }, [drafts, dragState, updateDraft]);

  const handleApply = useCallback(() => {
    onApply(buildCharacterRegionRules(drafts));
    onClose();
  }, [drafts, onApply, onClose]);

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Character Regions"
      size="xl"
      centered
    >
      <Stack gap="md">
        <Group grow align="flex-end">
          <Select
            label="Characters"
            data={CHARACTER_COUNT_OPTIONS}
            value={String(count)}
            onChange={handleCountChange}
            allowDeselect={false}
          />
          <Select
            label="Layout"
            data={PRESET_OPTIONS}
            value={preset}
            onChange={handlePresetChange}
            allowDeselect={false}
          />
          <Tooltip label="Reset boxes to the selected layout">
            <SwarmActionIcon
              size="lg"
              tone="secondary"
              emphasis="soft"
              label="Reset character boxes"
              onClick={() => applyPreset(count, preset === 'custom' ? getDefaultCharacterLayoutPreset(count) : preset)}
            >
              <IconRefresh size={18} />
            </SwarmActionIcon>
          </Tooltip>
        </Group>

        <Paper p="sm" radius="sm" bg="invokeGray.9" style={{ border: '1px solid var(--mantine-color-invokeGray-7)' }}>
          <Box
            ref={previewRef}
            onPointerMove={handlePointerMove}
            onPointerUp={() => setDragState(null)}
            onPointerCancel={() => setDragState(null)}
            style={{
              position: 'relative',
              aspectRatio: '16 / 10',
              minHeight: 220,
              border: '1px solid var(--mantine-color-invokeGray-7)',
              borderRadius: 6,
              overflow: 'hidden',
              background:
                'linear-gradient(90deg, color-mix(in srgb, var(--mantine-color-invokeGray-8) 92%, transparent) 1px, transparent 1px), linear-gradient(color-mix(in srgb, var(--mantine-color-invokeGray-8) 92%, transparent) 1px, transparent 1px), var(--mantine-color-invokeGray-9)',
              backgroundSize: '10% 10%',
            }}
          >
            {drafts.map((draft, index) => {
              const active = draft.id === activeId;
              return (
                <Box
                  key={draft.id}
                  onPointerDown={(event) => handlePointerDown(event, draft)}
                  onClick={() => setActiveId(draft.id)}
                  style={{
                    position: 'absolute',
                    left: `${draft.x * 100}%`,
                    top: `${draft.y * 100}%`,
                    width: `${draft.width * 100}%`,
                    height: `${draft.height * 100}%`,
                    border: active ? '2px solid var(--mantine-color-invokeBrand-5)' : '2px dashed var(--mantine-color-invokeBrand-7)',
                    backgroundColor: active
                      ? 'color-mix(in srgb, var(--mantine-color-invokeBrand-6) 22%, transparent)'
                      : 'color-mix(in srgb, var(--mantine-color-invokeBrand-6) 12%, transparent)',
                    cursor: 'grab',
                    opacity: draft.enabled ? 1 : 0.42,
                  }}
                >
                  <Badge size="xs" color={active ? 'blue' : 'gray'} style={{ position: 'absolute', top: 4, left: 4 }}>
                    {draft.name.trim() || `Character ${index + 1}`}
                  </Badge>
                </Box>
              );
            })}
          </Box>
          <Text size="xs" c="invokeGray.4" mt="xs">
            Drag boxes to roughly target each character. Use the numeric fields below for tighter placement.
          </Text>
        </Paper>

        <Group align="flex-start" wrap="nowrap">
          <ScrollArea h={420} w={230} offsetScrollbars>
            <Stack gap="xs">
              {drafts.map((draft, index) => (
                <Paper
                  key={draft.id}
                  p="xs"
                  radius="sm"
                  onClick={() => setActiveId(draft.id)}
                  style={{
                    cursor: 'pointer',
                    border: draft.id === activeId
                      ? '2px solid var(--mantine-color-invokeBrand-6)'
                      : '1px solid var(--mantine-color-invokeGray-7)',
                    backgroundColor: 'var(--mantine-color-invokeGray-9)',
                  }}
                >
                  <Group gap="xs" wrap="nowrap">
                    <IconUsers size={16} />
                    <Box style={{ minWidth: 0 }}>
                      <Text size="sm" fw={600} truncate>{draft.name || `Character ${index + 1}`}</Text>
                      <Text size="xs" c="invokeGray.4" truncate>{draft.prompt || 'No prompt yet'}</Text>
                    </Box>
                  </Group>
                </Paper>
              ))}
            </Stack>
          </ScrollArea>

          <Divider orientation="vertical" />

          {activeDraft && (
            <ScrollArea h={420} style={{ flex: 1 }} offsetScrollbars>
              <Stack gap="sm" pr="sm">
                <Group grow>
                  <TextInput
                    label="Character Name"
                    value={activeDraft.name}
                    onChange={(event) => updateDraft(activeDraft.id, { name: event.currentTarget.value })}
                  />
                  <SwarmSwitch
                    label="Enabled"
                    checked={activeDraft.enabled}
                    onChange={(event) => updateDraft(activeDraft.id, { enabled: event.currentTarget.checked })}
                  />
                </Group>

                <Textarea
                  label="Character Prompt"
                  placeholder="Describe this character only..."
                  value={activeDraft.prompt}
                  onChange={(event) => updateDraft(activeDraft.id, { prompt: event.currentTarget.value })}
                  minRows={3}
                  maxRows={6}
                  autosize
                />

                <Stack gap={4}>
                  <Group justify="space-between">
                    <Text size="sm" fw={500}>Region Strength</Text>
                    <Text size="xs" c="invokeGray.3">{activeDraft.strength.toFixed(2)}</Text>
                  </Group>
                  <SwarmSlider
                    value={activeDraft.strength}
                    onChange={(value) => updateDraft(activeDraft.id, { strength: value })}
                    min={0}
                    max={1}
                    step={0.05}
                  />
                </Stack>

                <SwarmSwitch
                  label="Use Object Inpaint"
                  description="Compiles this character as <object:...> instead of <region:...>."
                  checked={activeDraft.useInpaint}
                  onChange={(event) => updateDraft(activeDraft.id, { useInpaint: event.currentTarget.checked })}
                />

                {activeDraft.useInpaint && (
                  <Stack gap={4}>
                    <Group justify="space-between">
                      <Text size="sm" fw={500}>Inpaint Strength</Text>
                      <Text size="xs" c="invokeGray.3">{activeDraft.inpaintStrength.toFixed(2)}</Text>
                    </Group>
                    <SwarmSlider
                      value={activeDraft.inpaintStrength}
                      onChange={(value) => updateDraft(activeDraft.id, { inpaintStrength: value })}
                      min={0}
                      max={1}
                      step={0.05}
                    />
                  </Stack>
                )}

                <Divider />

                <MultiSelect
                  label="Character LoRAs"
                  description="Selected LoRAs are embedded in this character's region prompt."
                  placeholder={lorasQuery.isLoading ? 'Loading LoRAs...' : 'Choose LoRAs'}
                  data={loraOptions}
                  value={activeDraft.loras.map((lora) => lora.name)}
                  onChange={(values) => {
                    const nextLoras = values.map((name) => activeDraft.loras.find((lora) => lora.name === name) ?? { name, weight: 1 });
                    updateDraft(activeDraft.id, { loras: nextLoras });
                  }}
                  searchable
                  clearable
                  rightSection={lorasQuery.isLoading ? <Loader size={14} /> : undefined}
                />

                {activeDraft.loras.map((lora) => (
                  <NumberInput
                    key={lora.name}
                    label={`${lora.name} weight`}
                    value={lora.weight}
                    min={-2}
                    max={2}
                    step={0.05}
                    decimalScale={2}
                    onChange={(value) => {
                      const numeric = typeof value === 'number' ? value : Number(value || 1);
                      updateDraft(activeDraft.id, {
                        loras: activeDraft.loras.map((item) => item.name === lora.name ? { ...item, weight: numeric } : item),
                      });
                    }}
                  />
                ))}

                <Divider />

                <Group grow>
                  <NumberInput label="X" value={activeDraft.x} min={0} max={1} step={0.01} decimalScale={2} onChange={(value) => updateDraft(activeDraft.id, { x: Number(value || 0) })} />
                  <NumberInput label="Y" value={activeDraft.y} min={0} max={1} step={0.01} decimalScale={2} onChange={(value) => updateDraft(activeDraft.id, { y: Number(value || 0) })} />
                  <NumberInput label="Width" value={activeDraft.width} min={0.01} max={1} step={0.01} decimalScale={2} onChange={(value) => updateDraft(activeDraft.id, { width: Number(value || 0.01) })} />
                  <NumberInput label="Height" value={activeDraft.height} min={0.01} max={1} step={0.01} decimalScale={2} onChange={(value) => updateDraft(activeDraft.id, { height: Number(value || 0.01) })} />
                </Group>
              </Stack>
            </ScrollArea>
          )}
        </Group>

        <Group justify="space-between">
          <Text size="xs" c="invokeGray.4">
            Applying replaces only character-created regions. Canvas regions, background regions, and segment rules stay intact.
          </Text>
          <Group>
            <SwarmButton emphasis="ghost" tone="secondary" onClick={onClose}>Cancel</SwarmButton>
            <SwarmButton emphasis="solid" onClick={handleApply}>Apply Character Regions</SwarmButton>
          </Group>
        </Group>
      </Stack>
    </Modal>
  );
}

export default CharacterRegionsBuilderModal;
