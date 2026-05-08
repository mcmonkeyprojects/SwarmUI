import { useEffect, useState } from 'react';
import { featureFlags } from '../../../config/featureFlags';

/**
 * Defers non-primary Generate data until after the initial workspace shell has painted.
 */
export function useSupplementalDataReady(): boolean {
    const [supplementalDataReady, setSupplementalDataReady] = useState(false);

    useEffect(() => {
        let frameHandle = 0;
        let timerHandle: number | null = null;

        frameHandle = window.requestAnimationFrame(() => {
            timerHandle = window.setTimeout(() => {
                setSupplementalDataReady(true);
            }, featureFlags.generateDeferredDataDelayMs);
        });

        return () => {
            window.cancelAnimationFrame(frameHandle);
            if (timerHandle !== null) {
                window.clearTimeout(timerHandle);
            }
        };
    }, []);

    return supplementalDataReady;
}
