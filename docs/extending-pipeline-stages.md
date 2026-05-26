# Extending Pipeline Stages

This guide covers how to add new stage types to the pipeline system.

## Architecture Overview

The pipeline system consists of:
- **Types** (`src/types/pipeline.ts`): Stage configurations, results, and presets
- **Store** (`src/stores/pipelineStore.ts`): Zustand state management with persistence
- **Orchestrator** (`src/hooks/usePipelineOrchestrator.ts`): Sequential execution logic
- **UI Components** (`src/pages/GeneratePage/components/PipelineBuilder/`): Builder, cards, progress, etc.

## Adding a New Stage Type

### 1. Update Type Definitions

In `src/types/pipeline.ts`:

```typescript
export type PipelineStageKind = 'generate' | 'latent_upscale' | 'refine' | 'ai_upscale' | 'your_new_stage';

export const PIPELINE_STAGE_LABELS: Record<PipelineStageKind, string> = {
    generate: 'Generate',
    latent_upscale: 'Latent Upscale',
    refine: 'Refine',
    ai_upscale: 'AI Upscale',
    your_new_stage: 'Your New Stage',
};
```

### 2. Add Default Settings

In `createStageConfig()` function:

```typescript
if (kind === 'your_new_stage') {
    return {
        id: `stage_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        kind,
        label: PIPELINE_STAGE_LABELS[kind],
        enabled: true,
        settings: {
            // Default settings for your stage
            yourSetting: 'default_value',
        },
        inherits: {
            prompt: 'inherit',
            negativePrompt: 'inherit',
            seed: 'random',
            dimensions: 'inherit',
            model: 'override',
        },
    };
}
```

### 3. Update Stage Icons

In `src/pages/GeneratePage/components/PipelineBuilder/PipelineStageCard.tsx`:

```typescript
import { IconYourIcon } from '@tabler/icons-react';

const STAGE_ICONS: Record<PipelineStageKind, typeof IconSparkles> = {
    generate: IconSparkles,
    latent_upscale: IconArrowsMaximize,
    refine: IconWand,
    ai_upscale: IconPhotoUp,
    your_new_stage: IconYourIcon,
};
```

Also update `PipelineFlow.tsx` with the same icon mapping.

### 4. Add Stage Settings UI

In `PipelineStageCard.tsx`, add a render function:

```typescript
function renderYourNewStageSettings(
    stage: PipelineStageConfig,
    onUpdate: (settings: Record<string, unknown>) => void,
    modelOptions: { value: string; label: string }[],
): React.ReactNode {
    return (
        <Stack gap="xs" pt="xs">
            {/* Your settings UI here */}
            <TextInput
                label="Your Setting"
                size="xs"
                value={String(stage.settings.yourSetting || '')}
                onChange={(e) => onUpdate({ yourSetting: e.currentTarget.value })}
            />
        </Stack>
    );
}
```

Then add it to the settings rendering logic:

```typescript
else if (stage.kind === 'your_new_stage') {
    settingsContent = renderYourNewStageSettings(stage, onUpdateSettings, modelOptions);
}
```

### 5. Update Summary Logic

In `summarizeSettings()`:

```typescript
if (stage.kind === 'your_new_stage') {
    let parts: string[] = [];
    if (s.yourSetting) parts.push(`Setting: ${s.yourSetting}`);
    return parts.length > 0 ? parts.join(' · ') : 'Default settings';
}
```

### 6. Add to Pipeline Flow Menu

In `PipelineFlow.tsx`, add your stage to the menu:

```typescript
<Menu.Item
    leftSection={<IconYourIcon size={16} />}
    onClick={() => onAddStage('your_new_stage')}
>
    {PIPELINE_STAGE_LABELS.your_new_stage}
</Menu.Item>
```

### 7. (Optional) Add Built-in Preset

In `PipelinePresets.tsx`:

```typescript
{
    id: buildPresetId('your_preset'),
    name: 'Your Preset Name',
    description: 'Description of what this preset does.',
    stages: [
        createStageConfig('generate'),
        createStageConfig('your_new_stage'),
    ],
    isBuiltIn: true,
},
```

## Orchestrator Integration

The orchestrator automatically handles new stages because:
1. It reads stages from the store dynamically
2. `buildStageGenerateParams()` applies stage settings to the generation params
3. The WebSocket subscription detects completion/errors generically

No changes needed to `usePipelineOrchestrator.ts` unless your stage requires special execution logic.

## Stage Execution Flow

1. User clicks "Run Pipeline" → `runPipeline(baseParams)` called
2. `startPipelineRun()` sets `isRunning: true`
3. Orchestrator detects `isRunning` change → calls `runNextStage()`
4. `runNextStage()`:
   - Gets current stage from enabled stages list
   - Gets parent result from `stageResults`
   - Builds params via `buildStageGenerateParams()`
   - Calls `startGeneration(params)`
5. WebSocket detects generation completion → `handleCompletion()`
6. Records result → `recordStageResult(result)`
7. Advances to next stage → `advanceStage()`
8. Orchestrator detects `currentStageIndex` change → calls `runNextStage()` again
9. Loop continues until all stages complete or error occurs

## Key Files Reference

| File | Purpose |
|------|---------|
| `src/types/pipeline.ts` | Type definitions, stage config factory |
| `src/stores/pipelineStore.ts` | Zustand store, persistence |
| `src/hooks/usePipelineOrchestrator.ts` | Sequential execution, WebSocket integration |
| `components/PipelineBuilder/PipelineBuilder.tsx` | Main UI container |
| `components/PipelineBuilder/PipelineStageCard.tsx` | Stage card, icons, settings UI |
| `components/PipelineBuilder/PipelineFlow.tsx` | Stage addition menu |
| `components/PipelineBuilder/PipelineProgress.tsx` | Progress tracking |
| `components/PipelineBuilder/PipelinePresets.tsx` | Preset management |

## Testing New Stages

1. Add the stage to a pipeline
2. Configure settings
3. Run the pipeline
4. Verify:
   - Stage executes in correct order
   - Settings are passed to generation correctly
   - Output image is captured
   - Next stage receives correct input image
   - Error handling works as expected
