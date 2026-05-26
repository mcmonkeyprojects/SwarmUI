import { Button, type ButtonProps, type ElementProps } from '@mantine/core';
import { forwardRef } from 'react';
import {
    mapEmphasisToButtonVariant,
    mapVariantToEmphasis,
    resolveSwarmTone,
    type SwarmEmphasis,
    type SwarmToneInput,
} from './swarmTones';

export type SwarmButtonShape = 'rounded' | 'pill' | 'square' | 'chamfer' | 'bracket' | 'slant';
export type SwarmButtonEffect = 'none' | 'neon';

export interface SwarmButtonProps
    extends Omit<ButtonProps, 'color' | 'variant'>,
        ElementProps<'button', keyof ButtonProps> {
    tone?: SwarmToneInput;
    emphasis?: SwarmEmphasis;
    shape?: SwarmButtonShape;
    effect?: SwarmButtonEffect;
    // Compatibility shim for one migration cycle.
    color?: string;
    variant?: ButtonProps['variant'];
    className?: string;
}

export const SwarmButton = forwardRef<HTMLButtonElement, SwarmButtonProps>(function SwarmButton(
    {
        tone,
        emphasis,
        shape,
        effect = 'none',
        color,
        variant,
        className,
        ...props
    },
    ref
) {
    const resolvedTone = resolveSwarmTone(tone, color, 'primary', 'SwarmButton');
    const resolvedEmphasis = emphasis ?? mapVariantToEmphasis(variant) ?? 'soft';
    const resolvedVariant = mapEmphasisToButtonVariant(resolvedEmphasis);

    return (
        <Button
            ref={ref}
            {...props}
            variant={resolvedVariant}
            className={`swarm-button swarm-tone--${resolvedTone} swarm-emphasis--${resolvedEmphasis} ${className ?? ''}`.trim()}
            data-swarm-tone={resolvedTone}
            data-swarm-emphasis={resolvedEmphasis}
            data-swarm-shape={shape}
            data-swarm-effect={effect === 'none' ? undefined : effect}
        />
    );
});
