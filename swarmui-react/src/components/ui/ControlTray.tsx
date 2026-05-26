import { Badge, Box, Group, Stack, Text, type BoxProps } from '@mantine/core';
import { resolveSwarmTone, type SwarmToneInput } from './swarmTones';

export interface ControlTrayProps extends BoxProps {
    title?: string;
    subtitle?: string;
    status?: string;
    tone?: SwarmToneInput;
}

export function ControlTray({
    title,
    subtitle,
    status,
    tone,
    className,
    children,
    ...props
}: ControlTrayProps) {
    const resolvedTone = resolveSwarmTone(tone, undefined, 'primary', 'ControlTray');

    return (
        <Box
            {...props}
            className={`swarm-control-tray swarm-tone--${resolvedTone} ${className ?? ''}`.trim()}
            data-swarm-tone={resolvedTone}
        >
            {(title || subtitle || status) && (
                <Group justify="space-between" align="flex-start" gap="sm" wrap="nowrap" className="swarm-control-tray__header">
                    <Stack gap={2} style={{ minWidth: 0 }}>
                        {title && <Text size="xs" fw={700} tt="uppercase" className="swarm-control-tray__title">{title}</Text>}
                        {subtitle && <Text size="xs" c="dimmed" className="swarm-control-tray__subtitle">{subtitle}</Text>}
                    </Stack>
                    {status && (
                        <Badge size="xs" variant="light" className="swarm-control-tray__status">
                            {status}
                        </Badge>
                    )}
                </Group>
            )}
            <Stack gap="sm" className="swarm-control-tray__body">
                {children}
            </Stack>
        </Box>
    );
}
