import { Badge, type BadgeProps } from '@mantine/core';
import { forwardRef } from 'react';
import {
    mapEmphasisToBadgeVariant,
    mapVariantToEmphasis,
    resolveSwarmTone,
    type SwarmEmphasis,
    type SwarmTone,
} from './swarmTones';

export interface SwarmBadgeProps extends Omit<BadgeProps, 'color' | 'variant'> {
    tone?: SwarmTone;
    emphasis?: SwarmEmphasis;
    contrast?: 'default' | 'strong';
    // Compatibility shim for one migration cycle.
    color?: string;
    variant?: BadgeProps['variant'];
}

export const SwarmBadge = forwardRef<HTMLDivElement, SwarmBadgeProps>(function SwarmBadge(
    {
        tone,
        emphasis,
        contrast = 'default',
        color,
        variant,
        className,
        ...props
    },
    ref
) {
    const resolvedTone = resolveSwarmTone(tone, color, 'secondary', 'SwarmBadge');
    const resolvedEmphasis = emphasis ?? mapVariantToEmphasis(variant) ?? 'soft';
    const resolvedVariant = mapEmphasisToBadgeVariant(resolvedEmphasis);

    return (
        <Badge
            ref={ref}
            {...props}
            variant={resolvedVariant}
            className={`swarm-badge swarm-tone--${resolvedTone} swarm-emphasis--${resolvedEmphasis} ${contrast === 'strong' ? 'swarm-badge--contrast-strong' : ''} ${className ?? ''}`.trim()}
            data-swarm-tone={resolvedTone}
            data-swarm-emphasis={resolvedEmphasis}
            data-swarm-contrast={contrast}
        />
    );
});
