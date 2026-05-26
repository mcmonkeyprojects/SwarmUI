import { useMemo } from 'react';
import {
    Box,
    ScrollArea,
    Stack,
} from '@mantine/core';
import { IconChevronLeft, IconChevronRight } from '@tabler/icons-react';
import type { UseFormReturnType } from '@mantine/form';
import type { GenerateParams, LoRASelection, BackendStatus, Model } from '../../../../api/types';
import type { Preset } from '../../../../stores/presets';
import { SwarmActionIcon } from '../../../../components/ui';

import { ParameterHeader } from './ParameterHeader';
import { PresetControls } from './PresetControls';
import { BaseModelSelector } from './BaseModelSelector';
import { PromptSection } from './PromptSection';
import { DimensionControls } from './DimensionControls';
import { GenerationSettings } from './GenerationSettings';
import { AdvancedSettings } from './AdvancedSettings';
import { ActiveLoRAs } from './ActiveLoRAs';
import { GenerateButton } from './GenerateButton';
import { analyzeGenerateQuality } from '../../utils/qualityCoach';

export interface ParameterPanelProps {
    // Form
    form: UseFormReturnType<GenerateParams>;
    onGenerate: (values: GenerateParams) => void;

    // Panel state
    collapsed: boolean;
    onToggleCollapse: () => void;
    panelSize: number;
    isResizing: boolean;

    // Store actions
    resetStore: () => void;

    // Presets
    presets: Preset[];
    onLoadPreset: (presetId: string) => void;
    onOpenSaveModal: () => void;
    onDeletePreset?: (presetId: string) => void;
    onDuplicatePreset?: (presetId: string) => void;

    // History
    onOpenHistory: () => void;

    // Backends
    backends: BackendStatus[];
    backendOptions: { value: string; label: string; disabled?: boolean }[];
    selectedBackend: string;
    onBackendChange: (value: string) => void;
    loadingBackends: boolean;

    // LoRAs
    activeLoras: LoRASelection[];
    onLoraChange: (loras: LoRASelection[]) => void;
    onOpenLoraBrowser: () => void;

    // Generation
    generating: boolean;
    onStop: () => void;
    onOpenSchedule: () => void;
    onGenerateAndUpscale?: () => void;

    // High-Res Fix (Refiner)
    enableRefiner: boolean;
    setEnableRefiner: (enabled: boolean) => void;

    // Models
    models: Model[];
    loadingModels: boolean;
    loadingModel: boolean;
    onModelSelect: (modelName: string | null) => void;

    // Advanced Settings
    vaeOptions: { value: string; label: string }[];
    loadingVAEs: boolean;

    // Advanced accordion (passed through for now)
    advancedAccordion?: React.ReactNode;
}

/**
 * Left panel containing all generation parameters.
 * Composed of smaller, focused components for maintainability.
 */
export function ParameterPanel({
    form,
    onGenerate,
    collapsed,
    onToggleCollapse,
    panelSize,
    isResizing,
    resetStore,
    presets,
    onLoadPreset,
    onOpenSaveModal,
    onDeletePreset,
    onDuplicatePreset,
    onOpenHistory,
    activeLoras,
    onLoraChange,
    onOpenLoraBrowser,
    generating,
    onStop,
    onOpenSchedule,
    onGenerateAndUpscale,
    enableRefiner,
    setEnableRefiner,
    models,
    loadingModels,
    loadingModel,
    onModelSelect,
    vaeOptions,
    loadingVAEs,
    advancedAccordion,
}: ParameterPanelProps) {
    const selectedModel = useMemo(
        () => models.find((model) => model.name === form.values.model) ?? null,
        [form.values.model, models]
    );
    const qualityCoach = analyzeGenerateQuality(form.values, selectedModel);

    return (
        <Box
            className="surface-table panel-gradient-subtle"
            style={{
                flex: collapsed ? '0 0 40px' : `0 0 ${panelSize}px`,
                minWidth: collapsed ? 40 : panelSize,
                maxWidth: collapsed ? 40 : panelSize,
                backdropFilter: 'blur(8px)',
                borderRight: 'var(--elevation-border)',
                boxShadow: 'var(--elevation-shadow-lg)',
                transition: isResizing
                    ? 'none'
                    : 'flex 250ms cubic-bezier(0.16, 1, 0.3, 1), min-width 250ms cubic-bezier(0.16, 1, 0.3, 1), max-width 250ms cubic-bezier(0.16, 1, 0.3, 1)',
                overflow: 'visible',
                position: 'relative',
                zIndex: 10,
            }}
        >
            {!collapsed && (
                <ScrollArea h="100%" p="sm">
                    <form onSubmit={form.onSubmit(onGenerate)}>
                        <Stack gap="sm">
                            {/* Header */}
                            <ParameterHeader
                                form={form}
                                resetStore={resetStore}
                            />

                            {/* Base Model Selector */}
                            <BaseModelSelector
                                form={form}
                                models={models}
                                loadingModels={loadingModels}
                                loadingModel={loadingModel}
                                onModelSelect={onModelSelect}
                            />

                            {/* Preset & History Controls */}
                            <PresetControls
                                presets={presets}
                                onLoadPreset={onLoadPreset}
                                onOpenSaveModal={onOpenSaveModal}
                                onOpenHistory={onOpenHistory}
                                onDeletePreset={onDeletePreset}
                                onDuplicatePreset={onDuplicatePreset}
                            />

                            {/* Prompt Section */}
                            <PromptSection form={form} />

                            {/* Dimension Controls */}
                            <DimensionControls form={form} />

                            {/* Generation Settings */}
                            <GenerationSettings
                                form={form}
                                enableRefiner={enableRefiner}
                                setEnableRefiner={setEnableRefiner}
                                qualityCoach={qualityCoach}
                            />

                            {/* Advanced Settings */}
                            <AdvancedSettings
                                form={form}
                                vaeOptions={vaeOptions}
                                loadingVAEs={loadingVAEs}
                            />

                            {/* Advanced Accordion (passed through) */}
                            {advancedAccordion}

                            {/* Active LoRAs */}
                            <ActiveLoRAs
                                form={form}
                                activeLoras={activeLoras}
                                onLoraChange={onLoraChange}
                                onOpenLoraBrowser={onOpenLoraBrowser}
                            />

                            <div className="divider-themed" />

                            {/* Generate Button */}
                            <GenerateButton
                                generating={generating}
                                onStop={onStop}
                                onOpenSchedule={onOpenSchedule}
                                onGenerateAndUpscale={onGenerateAndUpscale}
                                qualityCoach={qualityCoach}
                                currentValues={form.values}
                                onApplyQualityCoachFixes={(overrides) => {
                                    form.setValues({
                                        ...form.values,
                                        ...overrides,
                                    });
                                }}
                                onInsertPromptSyntax={(text) => {
                                    form.setFieldValue('prompt', (form.values.prompt || '').trim() + ' ' + text.trim());
                                }}
                            />
                        </Stack>
                    </form>
                </ScrollArea>
            )}

            {/* Collapse Button */}
            <SwarmActionIcon
                style={{
                    position: 'absolute',
                    top: '50%',
                    right: collapsed ? 8 : -12,
                    transform: 'translateY(-50%)',
                    zIndex: 10,
                }}
                size="sm"
                tone="secondary"
                emphasis="solid"
                onClick={onToggleCollapse}
            >
                {collapsed ? (
                    <IconChevronRight size={14} />
                ) : (
                    <IconChevronLeft size={14} />
                )}
            </SwarmActionIcon>
        </Box>
    );
}

// Re-export sub-components for direct access if needed
export { ParameterHeader } from './ParameterHeader';
export { PresetControls } from './PresetControls';
export { BaseModelSelector } from './BaseModelSelector';
export { PromptSection } from './PromptSection';
export { DimensionControls } from './DimensionControls';
export { GenerationSettings } from './GenerationSettings';
export { AdvancedSettings } from './AdvancedSettings';
export { ActiveLoRAs } from './ActiveLoRAs';
export { GenerateButton } from './GenerateButton';
