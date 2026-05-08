import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Card, Title, Text, Stack, Code, Group } from '@mantine/core';
import { IconAlertTriangle, IconCopy, IconRefresh } from '@tabler/icons-react';
import { SwarmButton as Button } from './ui';
import { getRecentDebugTrace } from '../utils/debugTrace';
import { recoverFromRuntimeCrash } from '../utils/crashRecovery';

interface Props {
    children?: ReactNode;
    fallback?: ReactNode;
    fallbackTitle?: string;
    fallbackDescription?: string;
    recoverLabel?: string;
    reloadLabel?: string;
    copyLabel?: string;
    renderFallback?: (state: ErrorBoundaryFallbackState) => ReactNode;
    /** Called when user clicks "Try Again" - use to reset any relevant state */
    onRecover?: () => void;
}

interface State {
    hasError: boolean;
    error: Error | null;
    errorInfo: ErrorInfo | null;
    errorTime: Date | null;
}

export interface ErrorBoundaryFallbackState {
    error: Error | null;
    errorInfo: ErrorInfo | null;
    occurredAt: Date | null;
    routeContext: string;
    primaryFrame: string;
    primaryRuntimeFrame: string;
    recentTrace: string;
    errorDetails: string;
    tryAgain: () => void;
    reload: () => void;
    copyDetails: () => void;
}

function getPrimaryComponentFrame(componentStack?: string | null): string {
    const frame = componentStack
        ?.split('\n')
        .map((line) => line.trim())
        .find((line) => line.startsWith('at '));
    return frame || 'Unknown component';
}

function getRouteContext(): string {
    if (typeof window === 'undefined') {
        return 'Unknown route';
    }
    return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

function getErrorName(error: Error | null): string {
    return error?.name || 'Error';
}

function getPrimaryRuntimeFrame(error: Error | null): string {
    const frame = error?.stack
        ?.split('\n')
        .map((line) => line.trim())
        .find((line) => line.includes('/src/') || line.includes('\\src\\'));
    return frame || 'No app source frame found';
}

export class ErrorBoundary extends Component<Props, State> {
    public state: State = {
        hasError: false,
        error: null,
        errorInfo: null,
        errorTime: null,
    };

    public static getDerivedStateFromError(error: Error): State {
        // Update state so the next render will show the fallback UI.
        return { hasError: true, error, errorInfo: null, errorTime: new Date() };
    }

    private handleTryAgain = () => {
        // Reset error state to try rendering children again
        this.setState({ hasError: false, error: null, errorInfo: null, errorTime: null });
        // Call optional recovery callback
        this.props.onRecover?.();
    };

    public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        const primaryFrame = getPrimaryComponentFrame(errorInfo.componentStack);
        const primaryRuntimeFrame = getPrimaryRuntimeFrame(error);
        console.error('Uncaught render error:', {
            name: error.name,
            message: error.message,
            route: getRouteContext(),
            component: primaryFrame,
            sourceFrame: primaryRuntimeFrame,
            stack: error.stack,
            componentStack: errorInfo.componentStack,
            recentTrace: getRecentDebugTrace(),
        });
        this.setState({ errorInfo });
    }

    public render() {
        if (this.state.hasError) {
            const recentTrace = getRecentDebugTrace();
            const primaryFrame = getPrimaryComponentFrame(this.state.errorInfo?.componentStack);
            const primaryRuntimeFrame = getPrimaryRuntimeFrame(this.state.error);
            const routeContext = getRouteContext();
            const occurredAt = this.state.errorTime?.toLocaleString() ?? 'Unknown time';
            const errorDetails = [
                `Error: ${this.state.error?.toString()}`,
                `Name: ${getErrorName(this.state.error)}`,
                `Route: ${routeContext}`,
                `Primary component: ${primaryFrame}`,
                `Primary source frame: ${primaryRuntimeFrame}`,
                `Occurred: ${occurredAt}`,
                '',
                `Trace:\n${recentTrace || 'No recent trace captured.'}`,
                '',
                `Component stack:\n${this.state.errorInfo?.componentStack || 'No component stack captured.'}`,
                '',
                `Runtime stack:\n${this.state.error?.stack || 'No runtime stack captured.'}`,
            ].join('\n');
            const copyDetails = () => {
                void navigator.clipboard.writeText(errorDetails);
            };
            const reload = async () => {
                await recoverFromRuntimeCrash();
            };
            const fallbackState: ErrorBoundaryFallbackState = {
                error: this.state.error,
                errorInfo: this.state.errorInfo,
                occurredAt: this.state.errorTime,
                routeContext,
                primaryFrame,
                primaryRuntimeFrame,
                recentTrace,
                errorDetails,
                tryAgain: this.handleTryAgain,
                reload,
                copyDetails,
            };

            if (this.props.renderFallback) {
                return this.props.renderFallback(fallbackState);
            }

            if (this.props.fallback) {
                return this.props.fallback;
            }

            return (
                <div style={{ padding: '40px', maxWidth: '800px', margin: '0 auto' }}>
                    <Card
                        withBorder
                        shadow="sm"
                        radius="md"
                        p="xl"
                        style={{
                            backgroundColor: 'var(--theme-gray-8)',
                            borderColor: 'var(--theme-gray-5)',
                        }}
                    >
                        <Stack gap="md">
                            <Stack gap="xs" align="center">
                                <IconAlertTriangle size={50} color="var(--theme-warning)" />
                                <Title order={2} style={{ color: 'var(--theme-gray-0)' }}>
                                    {this.props.fallbackTitle || 'Something went wrong'}
                                </Title>
                                <Text c="dimmed" size="sm">
                                    {this.props.fallbackDescription || `${getErrorName(this.state.error)} in ${primaryFrame}`}
                                </Text>
                            </Stack>

                            {this.state.error && (
                                <>
                                    <Text fw={500} size="sm" c="dimmed">Crash Context:</Text>
                                    <Code block color="gray" style={{ whiteSpace: 'pre-wrap', fontSize: '12px' }}>
                                        {`Route: ${routeContext}\nPrimary component: ${primaryFrame}\nPrimary source frame: ${primaryRuntimeFrame}\nOccurred: ${occurredAt}`}
                                    </Code>

                                    {recentTrace ? (
                                        <>
                                            <Text fw={500} size="sm" c="yellow.3">Recent Trace:</Text>
                                            <Code block color="yellow" style={{ whiteSpace: 'pre-wrap', maxHeight: '220px', overflowY: 'auto', fontSize: '11px' }}>
                                                {recentTrace}
                                            </Code>
                                        </>
                                    ) : null}

                                    <Text fw={500} size="sm" c="red.3">Error Message:</Text>
                                    <Code block color="red" style={{ whiteSpace: 'pre-wrap', maxHeight: '150px', overflowY: 'auto' }}>
                                        {this.state.error.toString()}
                                    </Code>

                                    {this.state.error.stack && (
                                        <>
                                            <Text fw={500} size="sm" c="dimmed" mt="sm">Runtime Stack:</Text>
                                            <Code block color="gray" style={{ whiteSpace: 'pre-wrap', maxHeight: '180px', overflowY: 'auto', fontSize: '11px' }}>
                                                {this.state.error.stack}
                                            </Code>
                                        </>
                                    )}

                                    {this.state.errorInfo && (
                                        <>
                                            <Text fw={500} size="sm" c="dimmed" mt="sm">Component Stack:</Text>
                                            <Code block color="gray" style={{ whiteSpace: 'pre-wrap', maxHeight: '200px', overflowY: 'auto', fontSize: '11px' }}>
                                                {this.state.errorInfo.componentStack}
                                            </Code>
                                        </>
                                    )}
                                </>
                            )}

                            <Group justify="center" mt="md">
                                <Button
                                    variant="subtle"
                                    color="gray"
                                    leftSection={<IconCopy size={16} />}
                                    onClick={copyDetails}
                                >
                                    {this.props.copyLabel || 'Copy Details'}
                                </Button>
                                <Button
                                    variant="light"
                                    color="blue"
                                    leftSection={<IconRefresh size={16} />}
                                    onClick={this.handleTryAgain}
                                >
                                    {this.props.recoverLabel || 'Try Again'}
                                </Button>
                                <Button
                                    variant="light"
                                    color="orange"
                                    onClick={() => {
                                        void reload();
                                    }}
                                >
                                    {this.props.reloadLabel || 'Reset UI State & Reload'}
                                </Button>
                            </Group>
                        </Stack>
                    </Card>
                </div>
            );
        }

        return this.props.children;
    }
}
