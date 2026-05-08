import { useState } from 'react';
import { useRenderProfiler } from '../../../hooks/useRenderProfiler';
import type { GenerateWorkspaceMode } from '../../../stores/navigationStore';
import { useGenerateDataScopes } from './useGenerateDataScopes';
import { useSupplementalDataReady } from './useSupplementalDataReady';

interface UseGeneratePageControllerOptions {
    currentMode: GenerateWorkspaceMode;
    openInspectorSections: string[];
    openQuickModules: string[];
    embeddingModalOpened: boolean;
    enableControlNet: boolean;
    enableRefiner: boolean;
}

export function useGeneratePageController({
    currentMode,
    openInspectorSections,
    openQuickModules,
    embeddingModalOpened,
    enableControlNet,
    enableRefiner,
}: UseGeneratePageControllerOptions) {
    useRenderProfiler('GeneratePage');
    const [routeEnteredAt] = useState(() => performance.now());
    const supplementalDataReady = useSupplementalDataReady();
    const dataScopes = useGenerateDataScopes({
        currentMode,
        supplementalDataReady,
        openInspectorSections,
        openQuickModules,
        embeddingModalOpened,
        enableControlNet,
        enableRefiner,
    });

    return {
        routeEnteredAt,
        supplementalDataReady,
        ...dataScopes,
    };
}
