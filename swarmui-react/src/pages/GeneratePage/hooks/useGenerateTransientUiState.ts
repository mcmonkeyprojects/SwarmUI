import { useState } from 'react';

/**
 * Local-only Generate UI state that should not be persisted in global stores.
 */
export function useGenerateTransientUiState() {
    const [presetName, setPresetName] = useState('');
    const [presetDescription, setPresetDescription] = useState('');
    const [diagnosticsModalOpen, setDiagnosticsModalOpen] = useState(false);
    const [galleryDrawerOpen, setGalleryDrawerOpen] = useState(false);
    const [galleryPinned, setGalleryPinned] = useState(false);
    const [comparisonOpen, setComparisonOpen] = useState(false);

    return {
        presetName,
        setPresetName,
        presetDescription,
        setPresetDescription,
        diagnosticsModalOpen,
        setDiagnosticsModalOpen,
        galleryDrawerOpen,
        setGalleryDrawerOpen,
        galleryPinned,
        setGalleryPinned,
        comparisonOpen,
        setComparisonOpen,
    };
}
