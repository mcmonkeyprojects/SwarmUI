import { useMemo } from 'react';
import type { GenerateWorkspaceMode } from '../../../stores/navigationStore';

interface UseGenerateDataScopesOptions {
    currentMode: GenerateWorkspaceMode;
    supplementalDataReady: boolean;
    openInspectorSections: string[];
    openQuickModules: string[];
    embeddingModalOpened: boolean;
    enableControlNet: boolean;
    enableHiResFix: boolean;
    enableUpscale: boolean;
}

export function useGenerateDataScopes({
    currentMode,
    supplementalDataReady,
    openInspectorSections,
    openQuickModules,
    embeddingModalOpened,
    enableControlNet,
    enableHiResFix,
    enableUpscale,
}: UseGenerateDataScopesOptions) {
    return useMemo(() => {
        const usesAdvancedRail = currentMode === 'advanced' || currentMode === 'video';
        const isPipelineMode = currentMode === 'pipeline';
        const imageSetupOpen = openInspectorSections.includes('image-setup');
        const assetsOpen = openInspectorSections.includes('assets');
        const samplingOpen = openInspectorSections.includes('sampling');
        const hiResQuickModuleOpen = openQuickModules.includes('hi-res-fix');
        const upscaleQuickModuleOpen = openQuickModules.includes('upscale');
        const modelStackQuickModuleOpen = openQuickModules.includes('model-stack');
        const shouldLoadAdvancedSidebarData = supplementalDataReady && usesAdvancedRail;
        const shouldLoadPipelineData = supplementalDataReady && isPipelineMode;
        const shouldLoadEmbeddings = supplementalDataReady && (usesAdvancedRail || embeddingModalOpened || isPipelineMode);
        const shouldLoadVaeData = shouldLoadAdvancedSidebarData && (samplingOpen || hiResQuickModuleOpen || upscaleQuickModuleOpen || modelStackQuickModuleOpen || enableHiResFix || enableUpscale);
        const shouldLoadControlNetData = shouldLoadAdvancedSidebarData && (imageSetupOpen || enableControlNet);
        const shouldLoadUpscalerData = shouldLoadAdvancedSidebarData || shouldLoadPipelineData;
        const shouldLoadWildcardData = supplementalDataReady && assetsOpen;

        return {
            usesAdvancedRail,
            shouldLoadVaeData,
            shouldLoadControlNetData,
            shouldLoadUpscalerData,
            shouldLoadEmbeddings,
            shouldLoadWildcardData,
        };
    }, [
        currentMode,
        embeddingModalOpened,
        enableControlNet,
        enableHiResFix,
        enableUpscale,
        openInspectorSections,
        openQuickModules,
        supplementalDataReady,
    ]);
}
