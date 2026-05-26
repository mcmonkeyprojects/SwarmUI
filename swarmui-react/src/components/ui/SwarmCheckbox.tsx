import { Checkbox, type CheckboxProps } from '@mantine/core';
import { forwardRef } from 'react';
import { resolveSwarmTone, type SwarmToneInput } from './swarmTones';

export type SwarmCheckboxVisual = 'material' | 'squishy';

export interface SwarmCheckboxProps extends CheckboxProps {
    tone?: SwarmToneInput;
    visual?: SwarmCheckboxVisual;
    className?: string;
}

export const SwarmCheckbox = forwardRef<HTMLInputElement, SwarmCheckboxProps>(function SwarmCheckbox(
    {
        tone,
        color,
        visual = 'material',
        className,
        ...props
    },
    ref
) {
    const resolvedTone = resolveSwarmTone(tone, color, 'primary', 'SwarmCheckbox');

    return (
        <Checkbox
            ref={ref}
            {...props}
            className={`swarm-checkbox swarm-tone--${resolvedTone} ${className ?? ''}`.trim()}
            data-swarm-tone={resolvedTone}
            data-swarm-checkbox-visual={visual}
        />
    );
});
