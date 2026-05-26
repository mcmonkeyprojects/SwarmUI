/**
 * PWA Hooks and Utilities
 * 
 * Provides hooks for PWA features including install prompts,
 * network status, and service worker updates.
 */

import { useState, useEffect, useCallback } from 'react';

interface BeforeInstallPromptEvent extends Event {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

interface UsePWAReturn {
    /** Whether the app can be installed (PWA install prompt available) */
    isInstallable: boolean;
    /** Whether the app is running in standalone/installed mode */
    isInstalled: boolean;
    /** Trigger the install prompt */
    promptInstall: () => Promise<boolean>;
    /** Whether the device is currently online */
    isOnline: boolean;
    /** Whether a service worker update is available */
    updateAvailable: boolean;
    /** Apply the pending service worker update (reloads page) */
    applyUpdate: () => void;
    /** Dismiss the install prompt (persists in localStorage) */
    dismissInstall: () => void;
    /** Whether the install prompt was previously dismissed */
    installDismissed: boolean;
}

const INSTALL_DISMISSED_KEY = 'swarmui-pwa-install-dismissed';

/**
 * Hook for PWA functionality
 */
export function usePWA(): UsePWAReturn {
    const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
    const [isInstalled, setIsInstalled] = useState(false);
    const [isOnline, setIsOnline] = useState(navigator.onLine);
    const [updateAvailable, setUpdateAvailable] = useState(false);
    const [installDismissed, setInstallDismissed] = useState(() => {
        return localStorage.getItem(INSTALL_DISMISSED_KEY) === 'true';
    });
    const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null);

    // Listen for the beforeinstallprompt event
    useEffect(() => {
        const handler = (e: Event) => {
            e.preventDefault();
            setInstallPrompt(e as BeforeInstallPromptEvent);
        };

        window.addEventListener('beforeinstallprompt', handler);

        // Check if already installed (standalone mode)
        if (window.matchMedia('(display-mode: standalone)').matches) {
            queueMicrotask(() => {
                setIsInstalled(true);
            });
        }

        return () => {
            window.removeEventListener('beforeinstallprompt', handler);
        };
    }, []);

    // Listen for app installed event
    useEffect(() => {
        const handler = () => {
            setIsInstalled(true);
            setInstallPrompt(null);
        };

        window.addEventListener('appinstalled', handler);
        return () => window.removeEventListener('appinstalled', handler);
    }, []);

    // Network status listeners
    useEffect(() => {
        const handleOnline = () => setIsOnline(true);
        const handleOffline = () => setIsOnline(false);

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, []);

    // Service worker update detection
    useEffect(() => {
        if (!('serviceWorker' in navigator)) return;

        navigator.serviceWorker.ready.then((reg) => {
            setRegistration(reg);

            // Check for updates periodically
            reg.addEventListener('updatefound', () => {
                const newWorker = reg.installing;
                if (!newWorker) return;

                newWorker.addEventListener('statechange', () => {
                    if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                        setUpdateAvailable(true);
                    }
                });
            });
        });

        // Listen for controller change (update applied)
        let refreshing = false;
        navigator.serviceWorker.addEventListener('controllerchange', () => {
            if (!refreshing) {
                refreshing = true;
                window.location.reload();
            }
        });
    }, []);

    const promptInstall = useCallback(async (): Promise<boolean> => {
        if (!installPrompt) return false;

        try {
            await installPrompt.prompt();
            const { outcome } = await installPrompt.userChoice;

            if (outcome === 'accepted') {
                setInstallPrompt(null);
                return true;
            }
            return false;
        } catch {
            return false;
        }
    }, [installPrompt]);

    const applyUpdate = useCallback(() => {
        if (!registration?.waiting) return;

        // Tell the waiting service worker to activate
        registration.waiting.postMessage({ type: 'SKIP_WAITING' });
    }, [registration]);

    const dismissInstall = useCallback(() => {
        setInstallDismissed(true);
        localStorage.setItem(INSTALL_DISMISSED_KEY, 'true');
    }, []);

    return {
        isInstallable: !!installPrompt && !installDismissed,
        isInstalled,
        promptInstall,
        isOnline,
        updateAvailable,
        applyUpdate,
        dismissInstall,
        installDismissed,
    };
}

/**
 * Hook for just network status (lighter weight)
 */
export function useNetworkStatus() {
    const [isOnline, setIsOnline] = useState(navigator.onLine);

    useEffect(() => {
        const handleOnline = () => setIsOnline(true);
        const handleOffline = () => setIsOnline(false);

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, []);

    return isOnline;
}
