import { memo, useEffect } from 'react';
import { notifications } from '@mantine/notifications';
import { useWebSocketStore } from '../../../stores/websocketStore';

interface CanvasGenerationResultWatcherProps {
    awaitingCanvasResult: boolean;
    awaitingCanvasImageCount: number;
    generating: boolean;
    generatedImages: string[];
    markCanvasAwaitingResult: (awaiting: boolean) => void;
    setCanvasPendingResult: (result: { imageUrl: string; source: 'generate' }) => void;
}

export const CanvasGenerationResultWatcher = memo(function CanvasGenerationResultWatcher({
    awaitingCanvasResult,
    awaitingCanvasImageCount,
    generating,
    generatedImages,
    markCanvasAwaitingResult,
    setCanvasPendingResult,
}: CanvasGenerationResultWatcherProps) {
    const generationPhase = useWebSocketStore((state) => state.generation.phase);
    const generationError = useWebSocketStore((state) => state.generation.error);

    useEffect(() => {
        if (!awaitingCanvasResult) {
            return;
        }

        if (generatedImages.length > awaitingCanvasImageCount) {
            const latestImage = generatedImages[generatedImages.length - 1];
            if (latestImage) {
                setCanvasPendingResult({
                    imageUrl: latestImage,
                    source: 'generate',
                });
            }
            return;
        }

        if (!generating && (generationPhase === 'error' || generationPhase === 'complete')) {
            markCanvasAwaitingResult(false);
            if (generationPhase === 'error' && generationError) {
                notifications.show({
                    title: 'Canvas Generation Failed',
                    message: generationError,
                    color: 'red',
                });
            }
        }
    }, [
        awaitingCanvasImageCount,
        awaitingCanvasResult,
        generatedImages,
        generating,
        generationError,
        generationPhase,
        markCanvasAwaitingResult,
        setCanvasPendingResult,
    ]);

    return null;
});
