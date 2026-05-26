import { memo, useCallback, useState } from 'react';
import {
    Group,
    Menu,
    Modal,
    TextInput,
    Textarea,
    Text,
    Divider,
} from '@mantine/core';
import {
    IconFolder,
    IconDeviceFloppy,
    IconChevronDown,
    IconTrash,
} from '@tabler/icons-react';
import type { PipelinePreset, PipelineStageConfig } from '../../../../types/pipeline';
import { createStageConfig } from '../../../../types/pipeline';
import { SwarmButton as Button } from '../../../../components/ui';

function buildPresetId(name: string): string {
    return `builtin_${name.toLowerCase().replace(/\s+/g, '_')}`;
}

const BUILT_IN_PRESETS: PipelinePreset[] = [
    {
        id: buildPresetId('fast_preview'),
        name: 'Fast Preview',
        description: 'Quick generation with default settings — good for iterating prompts.',
        stages: [createStageConfig('generate')],
        isBuiltIn: true,
    },
    {
        id: buildPresetId('quick_upscale'),
        name: 'Quick Upscale',
        description: 'Generate then upscale 2x with pixel Lanczos. No refinement.',
        stages: [
            createStageConfig('generate'),
            (() => {
                const s = createStageConfig('ai_upscale');
                s.settings = { refinerupscale: 2, refinerupscalemethod: 'pixel-lanczos', refinercontrolpercentage: 0, refinermethod: 'PostApply' };
                return s;
            })(),
        ],
        isBuiltIn: true,
    },
    {
        id: buildPresetId('quality_sdxl'),
        name: 'Quality SDXL',
        description: 'Generate with 30 steps, then refine at 0.3 denoise for polished output.',
        stages: [
            (() => {
                const s = createStageConfig('generate');
                s.settings = { steps: 30, cfgscale: 7 };
                return s;
            })(),
            createStageConfig('refine'),
        ],
        isBuiltIn: true,
    },
    {
        id: buildPresetId('full_enhancement'),
        name: 'Full Enhancement',
        description: 'Generate → Latent Upscale 2x → Refine 0.3 denoise → AI Upscale 2x. Full pipeline.',
        stages: [
            createStageConfig('generate'),
            createStageConfig('latent_upscale'),
            createStageConfig('refine'),
            createStageConfig('ai_upscale'),
        ],
        isBuiltIn: true,
    },
    {
        id: buildPresetId('upscale_existing'),
        name: 'Upscale Existing',
        description: 'AI Upscale only — run on an existing image without generation.',
        stages: [createStageConfig('ai_upscale')],
        isBuiltIn: true,
    },
    {
        id: buildPresetId('refine_existing'),
        name: 'Refine Existing',
        description: 'Refine only — improve an existing image without upscaling.',
        stages: [createStageConfig('refine')],
        isBuiltIn: true,
    },
];

interface PipelinePresetsProps {
    userPresets: PipelinePreset[];
    onLoadPreset: (stages: PipelineStageConfig[]) => void;
    onSavePreset: (name: string, description: string) => void;
    onDeletePreset: (presetId: string) => void;
    disabled: boolean;
}

export const PipelinePresets = memo(function PipelinePresets({
    userPresets,
    onLoadPreset,
    onSavePreset,
    onDeletePreset,
    disabled,
}: PipelinePresetsProps) {
    const [saveOpen, setSaveOpen] = useState(false);
    const [saveName, setSaveName] = useState('');
    const [saveDesc, setSaveDesc] = useState('');

    const handleSave = useCallback(() => {
        if (!saveName.trim()) {
            return;
        }
        onSavePreset(saveName.trim(), saveDesc.trim());
        setSaveName('');
        setSaveDesc('');
        setSaveOpen(false);
    }, [saveName, saveDesc, onSavePreset]);

    return (
        <Group gap="xs">
            <Menu shadow="md" width={280} position="bottom-start">
                <Menu.Target>
                    <Button
                        size="xs"
                        tone="secondary"
                        emphasis="soft"
                        leftSection={<IconFolder size={14} />}
                        rightSection={<IconChevronDown size={12} />}
                        disabled={disabled}
                    >
                        Presets
                    </Button>
                </Menu.Target>
                <Menu.Dropdown>
                    <Menu.Label>Built-in presets</Menu.Label>
                    {BUILT_IN_PRESETS.map((preset) => (
                        <Menu.Item
                            key={preset.id}
                            onClick={() => onLoadPreset(preset.stages.map((s) => ({ ...s })))}
                        >
                            <Text size="sm" fw={500}>{preset.name}</Text>
                            <Text size="xs" c="dimmed">{preset.description}</Text>
                        </Menu.Item>
                    ))}
                    {userPresets.length > 0 && (
                        <>
                            <Divider my={4} />
                            <Menu.Label>Your presets</Menu.Label>
                            {userPresets.map((preset) => (
                                <Menu.Item
                                    key={preset.id}
                                    onClick={() => onLoadPreset(preset.stages.map((s) => ({ ...s })))}
                                    rightSection={
                                        <IconTrash
                                            size={14}
                                            style={{ cursor: 'pointer', opacity: 0.6 }}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onDeletePreset(preset.id);
                                            }}
                                        />
                                    }
                                >
                                    <Text size="sm" fw={500}>{preset.name}</Text>
                                    <Text size="xs" c="dimmed">{preset.description}</Text>
                                </Menu.Item>
                            ))}
                        </>
                    )}
                </Menu.Dropdown>
            </Menu>

            <Button
                size="xs"
                tone="primary"
                emphasis="ghost"
                leftSection={<IconDeviceFloppy size={14} />}
                onClick={() => setSaveOpen(true)}
                disabled={disabled}
            >
                Save
            </Button>

            <Modal
                opened={saveOpen}
                onClose={() => setSaveOpen(false)}
                title="Save Pipeline Preset"
                size="sm"
            >
                <TextInput
                    label="Preset name"
                    placeholder="My preset"
                    value={saveName}
                    onChange={(e) => setSaveName(e.currentTarget.value)}
                    data-autofocus
                />
                <Textarea
                    label="Description"
                    placeholder="What this preset does..."
                    value={saveDesc}
                    onChange={(e) => setSaveDesc(e.currentTarget.value)}
                    mt="sm"
                    minRows={2}
                    maxRows={4}
                />
                <Group justify="flex-end" mt="md">
                    <Button
                        size="sm"
                        tone="secondary"
                        emphasis="ghost"
                        onClick={() => setSaveOpen(false)}
                    >
                        Cancel
                    </Button>
                    <Button
                        size="sm"
                        tone="primary"
                        emphasis="solid"
                        onClick={handleSave}
                        disabled={!saveName.trim()}
                    >
                        Save Preset
                    </Button>
                </Group>
            </Modal>
        </Group>
    );
});
