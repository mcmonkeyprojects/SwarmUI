import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Card, Title, Text, Stack, Code, Group } from '@mantine/core';
import { IconAlertTriangle, IconCopy, IconRefresh } from '@tabler/icons-react';
import { SwarmButton as Button } from './ui';
import { getRecentDebugTrace } from '../utils/debugTrace';

interface Props {
    children?: ReactNode;
    fallback?: ReactNode;
    /** Called when user clicks "Try Again" - use to reset any relevant state */
    onRecover?: () => void;
}

interface State {
    hasError: boolean;
    error: Error | null;
    errorInfo: ErrorInfo | null;
    errorTime: Date | null;
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
        console.error('Uncaught error:', error, errorInfo);
        this.setState({ errorInfo });
    }

    public render() {
        if (this.state.hasError) {
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
                                <Title order={2} style={{ color: 'var(--theme-gray-0)' }}>Something went wrong</Title>
                                <Text c="dimmed" size="sm">The application encountered an unexpected error.</Text>
                            </Stack>

                            {this.state.error && (
                                <>
                                    {(() => {
                                        const recentTrace = getRecentDebugTrace();
                                        return recentTrace ? (
                                            <>
                                                <Text fw={500} size="sm" c="yellow.3">Recent Trace:</Text>
                                                <Code block color="yellow" style={{ whiteSpace: 'pre-wrap', maxHeight: '220px', overflowY: 'auto', fontSize: '11px' }}>
                                                    {recentTrace}
                                                </Code>
                                            </>
                                        ) : null;
                                    })()}

                                    <Text fw={500} size="sm" c="red.3">Error Message:</Text>
                                    <Code block color="red" style={{ whiteSpace: 'pre-wrap', maxHeight: '150px', overflowY: 'auto' }}>
                                        {this.state.error.toString()}
                                    </Code>

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
                                    onClick={() => {
                                        const text = `Error: ${this.state.error?.toString()}\n\nTrace:\n${getRecentDebugTrace()}\n\nStack: ${this.state.errorInfo?.componentStack}`;
                                        navigator.clipboard.writeText(text);
                                        // Ideally show a toast here, but for now simple copy is fine
                                    }}
                                >
                                    Copy Details
                                </Button>
                                <Button
                                    variant="light"
                                    color="blue"
                                    leftSection={<IconRefresh size={16} />}
                                    onClick={this.handleTryAgain}
                                >
                                    Try Again
                                </Button>
                                <Button
                                    variant="light"
                                    color="orange"
                                    onClick={() => window.location.reload()}
                                >
                                    Reload Application
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
