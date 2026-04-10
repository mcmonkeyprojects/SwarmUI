import { ActionIcon, type ActionIconProps, type ElementProps } from '@mantine/core';
import { forwardRef } from 'react';
import {
    mapEmphasisToButtonVariant,
    mapVariantToEmphasis,
    resolveSwarmTone,
    type SwarmEmphasis,
    type SwarmToneInput,
} from './swarmTones';

export type SwarmActionIconShape = 'rounded' | 'circle' | 'square';

export interface SwarmActionIconProps
    extends Omit<ActionIconProps, 'color' | 'variant'>,
        ElementProps<'button', keyof ActionIconProps> {
    tone?: SwarmToneInput;
    emphasis?: SwarmEmphasis;
    shape?: SwarmActionIconShape;
    // Compatibility shim for one migration cycle.
    color?: string;
    variant?: ActionIconProps['variant'];
    label?: string;
    className?: string;
}

export const SwarmActionIcon = forwardRef<HTMLButtonElement, SwarmActionIconProps>(function SwarmActionIcon(
    {
        tone,
        emphasis,
        shape,
        color,
        variant,
        label,
        className,
        ...props
    },
    ref
) {
    const resolvedTone = resolveSwarmTone(tone, color, 'secondary', 'SwarmActionIcon');
    const resolvedEmphasis = emphasis ?? mapVariantToEmphasis(variant) ?? 'ghost';
    const resolvedVariant = mapEmphasisToButtonVariant(resolvedEmphasis);
    const ariaLabel = props['aria-label'] ?? label ?? (typeof props.title === 'string' ? props.title : undefined);

    return (
        <ActionIcon
            ref={ref}
            {...props}
            variant={resolvedVariant}
            aria-label={ariaLabel}
            className={`swarm-action-icon swarm-tone--${resolvedTone} swarm-emphasis--${resolvedEmphasis} ${className ?? ''}`.trim()}
            data-swarm-tone={resolvedTone}
            data-swarm-emphasis={resolvedEmphasis}
            data-swarm-shape={shape}
        />
    );
});
