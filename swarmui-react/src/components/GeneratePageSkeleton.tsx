import { memo } from 'react';
import { Box, Group, Stack } from '@mantine/core';
import { SwarmLoader } from './ui';

/**
 * Skeleton placeholder that matches GeneratePage layout
 * Shows immediately while the actual page lazy-loads
 */
export const GeneratePageSkeleton = memo(function GeneratePageSkeleton() {
    const shimmerStyle = {
        background: 'linear-gradient(90deg, var(--mantine-color-invokeGray-7) 25%, var(--mantine-color-invokeGray-6) 50%, var(--mantine-color-invokeGray-7) 75%)',
        backgroundSize: '200% 100%',
        animation: 'shimmer 1.5s ease-in-out infinite',
        borderRadius: 8,
    };

    return (
        <Box
            style={{
                height: 'var(--app-content-height)',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
                padding: 0,
            }}
        >
            {/* Main Content Area */}
            <Box style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
                {/* Left Panel Skeleton */}
                <Box
                    style={{
                        width: 360,
                        minWidth: 360,
                        backgroundColor: 'var(--mantine-color-invokeGray-8)',
                        borderRight: '1px solid var(--mantine-color-invokeGray-6)',
                        padding: 16,
                    }}
                >
                    <Stack gap="md">
                        {/* Header skeleton */}
                        <Box style={{ ...shimmerStyle, height: 32, width: '60%' }} />

                        {/* Prompt area skeleton */}
                        <Box style={{ ...shimmerStyle, height: 100, width: '100%' }} />

                        {/* Negative prompt skeleton */}
                        <Box style={{ ...shimmerStyle, height: 60, width: '100%' }} />

                        {/* Settings skeleton */}
                        <Group gap="sm">
                            <Box style={{ ...shimmerStyle, height: 40, width: 80 }} />
                            <Box style={{ ...shimmerStyle, height: 40, width: 80 }} />
                            <Box style={{ ...shimmerStyle, height: 40, width: 80 }} />
                        </Group>

                        {/* Sliders skeleton */}
                        <Box style={{ ...shimmerStyle, height: 24, width: '100%' }} />
                        <Box style={{ ...shimmerStyle, height: 24, width: '100%' }} />

                        {/* Generate button skeleton */}
                        <Box style={{ ...shimmerStyle, height: 48, width: '100%' }} />
                    </Stack>
                </Box>

                {/* Center Panel Skeleton */}
                <Box
                    style={{
                        flex: 1,
                        backgroundColor: 'var(--mantine-color-invokeGray-9)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                    }}
                >
                    <Box style={{ ...shimmerStyle, width: 512, height: 512, display: 'grid', placeItems: 'center' }}>
                        <SwarmLoader variant="pulse" size={44} />
                    </Box>
                </Box>

                {/* Right Panel Skeleton */}
                <Box
                    style={{
                        width: 300,
                        minWidth: 300,
                        backgroundColor: 'var(--mantine-color-invokeGray-8)',
                        borderLeft: '1px solid var(--mantine-color-invokeGray-6)',
                        padding: 16,
                    }}
                >
                    <Stack gap="sm">
                        {/* Gallery header skeleton */}
                        <Box style={{ ...shimmerStyle, height: 24, width: '50%' }} />

                        {/* Thumbnail grid skeleton */}
                        <Group gap="xs">
                            <Box style={{ ...shimmerStyle, height: 80, width: 80 }} />
                            <Box style={{ ...shimmerStyle, height: 80, width: 80 }} />
                            <Box style={{ ...shimmerStyle, height: 80, width: 80 }} />
                        </Group>
                    </Stack>
                </Box>
            </Box>

            {/* Bottom Toolbar Skeleton */}
            <Box
                style={{
                    height: 150,
                    backgroundColor: 'var(--mantine-color-invokeGray-8)',
                    borderTop: '1px solid var(--mantine-color-invokeGray-6)',
                    padding: 16,
                }}
            >
                <Group gap="md" h="100%">
                    {/* Model panel skeleton */}
                    <Box style={{ ...shimmerStyle, flex: 1, height: '100%' }} />
                    <Box style={{ ...shimmerStyle, flex: 1, height: '100%' }} />
                    <Box style={{ ...shimmerStyle, flex: 1, height: '100%' }} />
                </Group>
            </Box>
        </Box>
    );
});

GeneratePageSkeleton.displayName = 'GeneratePageSkeleton';
