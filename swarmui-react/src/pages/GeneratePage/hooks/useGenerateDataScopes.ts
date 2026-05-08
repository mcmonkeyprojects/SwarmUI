import { useMemo } from 'react';
import type { GenerateWorkspaceMode } from '../../../stores/navigationStore';

interface UseGenerateDataScopesOptions {
    currentMode: GenerateWorkspaceMode;
    supplementalDataReady: boolean;
    openInspectorSections: string[];
    openQuickModules: string[];
    embeddingModalOpened: boolean;
    enableControlNet: boolean;
    enableRefiner: boolean;
}

export function useGenerateDataScopes({
    currentMode,
    supplementalDataReady,
    openInspectorSections,
    openQuickModules,
    embeddingModalOpened,
    enableControlNet,
    enableRefiner,
}: UseGenerateDataScopesOptions) {
    return useMemo(() => {
        const usesAdvancedRail = currentMode === 'advanced' || currentMode === 'video';
        const imageSetupOpen = openInspectorSections.includes('image-setup');
        const assetsOpen = openInspectorSections.includes('assets');
        const samplingOpen = openInspectorSections.includes('sampling');
        const hiResQuickModuleOpen = openQuickModules.includes('hi-res-fix');
        const modelStackQuickModuleOpen = openQuickModules.includes('model-stack');
        const shouldLoadAdvancedSidebarData = supplementalDataReady && usesAdvancedRail;
        const shouldLoadEmbeddings = supplementalDataReady && (usesAdvancedRail || embeddingModalOpened);
        const shouldLoadVaeData = shouldLoadAdvancedSidebarData && (samplingOpen || hiResQuickModuleOpen || modelStackQuickModuleOpen || enableRefiner);
        const shouldLoadControlNetData = shouldLoadAdvancedSidebarData && (imageSetupOpen || enableControlNet);
        const shouldLoadUpscalerData = shouldLoadAdvancedSidebarData && (imageSetupOpen || hiResQuickModuleOpen || enableRefiner);
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
        enableRefiner,
        openInspectorSections,
        openQuickModules,
        supplementalDataReady,
    ]);
}
