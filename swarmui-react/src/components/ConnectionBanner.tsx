import { useEffect, useState } from 'react';
import { Paper, Group, Text, Loader, Transition } from '@mantine/core';
import { IconCheck, IconX, IconRefresh, IconWifiOff, IconAlertTriangle } from '@tabler/icons-react';
import { useSessionStore } from '../stores/session';
import { useWebSocketStore } from '../stores/websocketStore';
import { SwarmActionIcon as ActionIcon } from './ui';
import { useShallow } from 'zustand/react/shallow';

type ConnectionState = 'connecting' | 'connected' | 'failed' | 'retrying' | 'degraded' | 'unhealthy';

interface ConnectionBannerProps {
    /** Auto-hide the banner after successful connection (ms). Set to 0 to keep visible. */
    autoHideDelay?: number;
}

/**
 * Non-blocking connection status banner.
 * Shows the current backend connection state without blocking the UI.
 * Also monitors WebSocket connection health via heartbeat.
 */
export function ConnectionBanner({ autoHideDelay = 3000 }: ConnectionBannerProps) {
    const { isInitialized, initializeSession } = useSessionStore(
        useShallow((state) => ({
            isInitialized: state.isInitialized,
            initializeSession: state.initializeSession,
        }))
    );
    const wsHealth = useWebSocketStore((state) => state.connectionHealth);
    const connectionIssue = useWebSocketStore((state) => state.connectionIssue);
    const [connectionState, setConnectionState] = useState<ConnectionState>('connecting');
    const [visible, setVisible] = useState(true);
    const [retryCount, setRetryCount] = useState(0);

    // Initialize session on mount
    useEffect(() => {
        let mounted = true;
        let hideTimer: ReturnType<typeof setTimeout> | null = null;

        const connect = async () => {
            if (!mounted) return;

            setConnectionState(retryCount > 0 ? 'retrying' : 'connecting');

            try {
                await initializeSession();
                if (mounted) {
                    setConnectionState('connected');

                    // Auto-hide after successful connection
                    if (autoHideDelay > 0) {
                        hideTimer = setTimeout(() => {
                            if (mounted) setVisible(false);
                        }, autoHideDelay);
                    }
                }
            } catch (error) {
                if (mounted) {
                    setConnectionState('failed');
                    console.error('Failed to connect to backend:', error);
                }
            }
        };

        connect();

        return () => {
            mounted = false;
            if (hideTimer) {
                clearTimeout(hideTimer);
            }
        };
    }, [initializeSession, retryCount, autoHideDelay]);

    // Monitor WebSocket health and update state accordingly
    useEffect(() => {
        if (connectionState === 'connected' || connectionState === 'degraded' || connectionState === 'unhealthy') {
            if (wsHealth === 'degraded') {
                setConnectionState('degraded');
                setVisible(true);
            } else if (wsHealth === 'unhealthy') {
                setConnectionState('unhealthy');
                setVisible(true);
            } else if (wsHealth === 'connected' && (connectionState === 'degraded' || connectionState === 'unhealthy')) {
                setConnectionState('connected');
                // Auto-hide after recovery
                if (autoHideDelay > 0) {
                    setTimeout(() => setVisible(false), autoHideDelay);
                }
            }
        }
    }, [wsHealth, connectionState, autoHideDelay]);

    // Skip if already initialized (e.g., hot reload)
    useEffect(() => {
        if (isInitialized && connectionState === 'connecting') {
            setConnectionState('connected');
            if (autoHideDelay > 0) {
                setTimeout(() => setVisible(false), autoHideDelay);
            }
        }
    }, [isInitialized, connectionState, autoHideDelay]);

    const handleRetry = () => {
        setRetryCount((c) => c + 1);
    };

    const handleDismiss = () => {
        setVisible(false);
    };

    const getStateConfig = () => {
        switch (connectionState) {
            case 'connecting':
                return {
                    icon: <Loader size={16} color="white" />,
                    text: 'Connecting to backend...',
                    color: 'var(--mantine-color-blue-7)',
                    showRetry: false,
                };
            case 'retrying':
                return {
                    icon: <Loader size={16} color="white" />,
                    text: `Retrying connection... (${retryCount})`,
                    color: 'var(--mantine-color-yellow-7)',
                    showRetry: false,
                };
            case 'connected':
                return {
                    icon: <IconCheck size={16} />,
                    text: 'Connected to SwarmUI',
                    color: 'var(--mantine-color-green-7)',
                    showRetry: false,
                };
            case 'degraded':
                {
                    const detail = connectionIssue.reason
                        ? `${connectionIssue.reason}${connectionIssue.endpoint ? ` (${connectionIssue.endpoint})` : ''}`
                        : 'some updates may be delayed';
                return {
                    icon: <IconAlertTriangle size={16} />,
                    text: `Connection unstable - ${detail}`,
                    color: 'var(--mantine-color-yellow-7)',
                    showRetry: false,
                };
                }
            case 'unhealthy':
                {
                    const detail = connectionIssue.reason
                        ? `${connectionIssue.reason}${connectionIssue.endpoint ? ` (${connectionIssue.endpoint})` : ''}`
                        : 'attempting to reconnect';
                return {
                    icon: <IconWifiOff size={16} />,
                    text: `Connection lost - ${detail}`,
                    color: 'var(--mantine-color-orange-7)',
                    showRetry: true,
                };
                }
            case 'failed':
                return {
                    icon: <IconWifiOff size={16} />,
                    text: 'Failed to connect to backend',
                    color: 'var(--mantine-color-red-7)',
                    showRetry: true,
                };
        }
    };

    const config = getStateConfig();

    return (
        <Transition
            mounted={visible}
            transition="slide-down"
            duration={200}
            timingFunction="ease-out"
        >
            {(styles) => (
                <Paper
                    style={{
                        ...styles,
                        position: 'fixed',
                        top: 8,
                        left: '50%',
                        transform: 'translateX(-50%)',
                        zIndex: 10000,
                        backgroundColor: config.color,
                        border: 'none',
                        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
                    }}
                    px="md"
                    py="xs"
                    radius="md"
                >
                    <Group gap="sm" wrap="nowrap">
                        {config.icon}
                        <Text size="sm" fw={500} c="white">
                            {config.text}
                        </Text>
                        {config.showRetry && (
                            <ActionIcon
                                variant="transparent"
                                size="sm"
                                aria-label="Retry backend connection"
                                onClick={handleRetry}
                                c="white"
                            >
                                <IconRefresh size={14} />
                            </ActionIcon>
                        )}
                        {connectionState !== 'connecting' && connectionState !== 'retrying' && (
                            <ActionIcon
                                variant="transparent"
                                size="sm"
                                aria-label="Dismiss connection banner"
                                onClick={handleDismiss}
                                c="white"
                                opacity={0.7}
                            >
                                <IconX size={14} />
                            </ActionIcon>
                        )}
                    </Group>
                </Paper>
            )}
        </Transition>
    );
}
