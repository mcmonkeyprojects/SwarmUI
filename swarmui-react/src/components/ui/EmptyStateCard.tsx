import { Card, Group, Stack, Text } from '@mantine/core';
import type { ReactNode } from 'react';
import { SwarmButton as Button } from './SwarmButton';

export interface EmptyStateCardProps {
    title: string;
    description: string;
    icon?: ReactNode;
    actionLabel?: string;
    onAction?: () => void;
    className?: string;
}

export function EmptyStateCard({
    title,
    description,
    icon,
    actionLabel,
    onAction,
    className,
}: EmptyStateCardProps) {
    return (
        <Card className={`ui-empty-state surface-glass ${className ?? ''}`} withBorder p="xl" radius="md">
            <Stack align="center" gap="sm">
                {icon}
                <Text size="lg" fw={600}>
                    {title}
                </Text>
                <Text size="sm" c="var(--theme-gray-2)" ta="center" maw={420}>
                    {description}
                </Text>
                {actionLabel && onAction && (
                    <Group mt="xs">
                        <Button className="gradient-button-primary" onClick={onAction}>
                            {actionLabel}
                        </Button>
                    </Group>
                )}
            </Stack>
        </Card>
    );
}
