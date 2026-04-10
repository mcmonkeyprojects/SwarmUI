/**
 * InstallPrompt Component
 * 
 * Shows a dismissible banner prompting users to install the PWA.
 * Appears when the app is installable and hasn't been dismissed.
 */

import { memo, useState, useEffect } from 'react';
import { Box, Text, CloseButton, Group } from '@mantine/core';
import { IconDownload } from '@tabler/icons-react';
import { usePWA } from '../hooks/usePWA';
import { SwarmButton as Button } from './ui';

interface InstallPromptProps {
    /** Position of the prompt */
    position?: 'top' | 'bottom';
}

/**
 * PWA Install Prompt Banner
 * 
 * Shows when the app can be installed. Dismissible with preference saved.
 * Uses CSS animations instead of Framer Motion for lighter weight.
 */
export const InstallPrompt = memo(function InstallPrompt({
    position = 'bottom',
}: InstallPromptProps) {
    const { isInstallable, promptInstall, dismissInstall } = usePWA();
    const [isVisible, setIsVisible] = useState(false);

    // Animate in after mount
    useEffect(() => {
        if (isInstallable) {
            const timer = setTimeout(() => setIsVisible(true), 50);
            return () => clearTimeout(timer);
        } else {
            setIsVisible(false);
        }
    }, [isInstallable]);

    if (!isInstallable) return null;

    const handleInstall = async () => {
        await promptInstall();
    };

    return (
        <div
            className="gpu-accelerated"
            style={{
                position: 'fixed',
                left: '50%',
                zIndex: 1000,
                transform: `translateX(-50%) translateY(${isVisible ? '0' : (position === 'bottom' ? '100px' : '-100px')})`,
                opacity: isVisible ? 1 : 0,
                transition: 'transform 300ms cubic-bezier(0.34, 1.56, 0.64, 1), opacity 300ms ease-out',
                ...(position === 'bottom' ? { bottom: 20 } : { top: 80 }),
            }}
        >
            <Box
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 16,
                    padding: '12px 16px 12px 20px',
                    background: 'linear-gradient(135deg, color-mix(in srgb, var(--theme-brand) 18%, transparent) 0%, color-mix(in srgb, var(--theme-accent) 18%, transparent) 100%)',
                    backdropFilter: 'blur(12px)',
                    border: '1px solid color-mix(in srgb, var(--theme-brand) 40%, transparent)',
                    borderRadius: 12,
                    boxShadow: '0 8px 32px color-mix(in srgb, var(--theme-gray-9) 35%, transparent)',
                }}
            >
                <IconDownload size={24} style={{ color: 'var(--theme-brand)' }} />

                <Box>
                    <Text size="sm" fw={600} style={{ color: 'var(--theme-gray-0)' }}>
                        Install SwarmUI
                    </Text>
                    <Text size="xs" c="dimmed">
                        Get the full app experience
                    </Text>
                </Box>

                <Group gap="sm" ml="md">
                    <Button
                        size="xs"
                        variant="filled"
                        leftSection={<IconDownload size={14} />}
                        onClick={handleInstall}
                        styles={{
                            root: {
                                background: 'var(--theme-brand-gradient)',
                                color: 'var(--theme-tone-primary-text)',
                                border: '1px solid var(--theme-tone-primary-border)',
                            },
                        }}
                    >
                        Install
                    </Button>
                    <CloseButton
                        size="sm"
                        variant="subtle"
                        onClick={dismissInstall}
                        aria-label="Dismiss install prompt"
                        c="dimmed"
                    />
                </Group>
            </Box>
        </div>
    );
});

InstallPrompt.displayName = 'InstallPrompt';

/**
 * Compact install button for header/toolbar
 */
export const InstallButton = memo(function InstallButton() {
    const { isInstallable, promptInstall } = usePWA();

    if (!isInstallable) return null;

    return (
        <Button
            size="xs"
            variant="light"
            leftSection={<IconDownload size={14} />}
            onClick={promptInstall}
            styles={{
                root: {
                    background: 'var(--theme-tone-primary-soft)',
                    color: 'var(--theme-text-primary)',
                    border: '1px solid var(--theme-tone-primary-border)',
                },
            }}
        >
            Install App
        </Button>
    );
});

InstallButton.displayName = 'InstallButton';

/**
 * Network status indicator
 * Uses CSS animations instead of Framer Motion
 */
export const NetworkStatus = memo(function NetworkStatus() {
    const { isOnline } = usePWA();
    const [isVisible, setIsVisible] = useState(!isOnline);

    useEffect(() => {
        if (!isOnline) {
            setIsVisible(true);
        } else {
            // Animate out before hiding
            const timer = setTimeout(() => setIsVisible(false), 200);
            return () => clearTimeout(timer);
        }
    }, [isOnline]);

    if (isOnline && !isVisible) return null;

    return (
        <div
            className="gpu-accelerated"
            style={{
                opacity: !isOnline ? 1 : 0,
                transform: !isOnline ? 'translateY(0)' : 'translateY(-20px)',
                transition: 'opacity 200ms ease-out, transform 200ms ease-out',
            }}
        >
            <Box
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '6px 12px',
                    background: 'color-mix(in srgb, var(--theme-warning) 16%, transparent)',
                    border: '1px solid color-mix(in srgb, var(--theme-warning) 42%, transparent)',
                    borderRadius: 6,
                }}
            >
                <Box
                    style={{
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        background: 'var(--theme-warning)',
                        animation: 'pulse 2s infinite',
                    }}
                />
                <Text size="xs" style={{ color: 'var(--theme-warning)' }}>
                    Offline
                </Text>
            </Box>
        </div>
    );
});

NetworkStatus.displayName = 'NetworkStatus';

/**
 * Update available notification
 * Uses CSS animations instead of Framer Motion
 */
export const UpdateNotification = memo(function UpdateNotification() {
    const { updateAvailable, applyUpdate } = usePWA();
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
        if (updateAvailable) {
            const timer = setTimeout(() => setIsVisible(true), 50);
            return () => clearTimeout(timer);
        } else {
            setIsVisible(false);
        }
    }, [updateAvailable]);

    if (!updateAvailable) return null;

    return (
        <div
            className="gpu-accelerated"
            style={{
                position: 'fixed',
                bottom: 20,
                right: 20,
                zIndex: 1000,
                opacity: isVisible ? 1 : 0,
                transform: isVisible ? 'scale(1)' : 'scale(0.9)',
                transition: 'opacity 200ms ease-out, transform 200ms ease-out',
            }}
        >
            <Box
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '12px 16px',
                    background: 'linear-gradient(135deg, color-mix(in srgb, var(--theme-success) 18%, transparent) 0%, color-mix(in srgb, var(--theme-accent) 16%, transparent) 100%)',
                    backdropFilter: 'blur(12px)',
                    border: '1px solid color-mix(in srgb, var(--theme-success) 42%, transparent)',
                    borderRadius: 10,
                    boxShadow: '0 8px 24px color-mix(in srgb, var(--theme-gray-9) 25%, transparent)',
                }}
            >
                <Text size="sm" style={{ color: 'var(--theme-gray-0)' }}>
                    Update available!
                </Text>
                <Button
                    size="xs"
                    variant="filled"
                    onClick={applyUpdate}
                    styles={{
                        root: {
                            background: 'var(--theme-brand-gradient)',
                            color: 'var(--theme-tone-primary-text)',
                            border: '1px solid var(--theme-tone-primary-border)',
                        },
                    }}
                >
                    Refresh
                </Button>
            </Box>
        </div>
    );
});

UpdateNotification.displayName = 'UpdateNotification';

