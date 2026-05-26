import { Switch, type SwitchProps } from '@mantine/core';
import { resolveSwarmTone, type SwarmToneInput } from './swarmTones';

export type SwarmSwitchVisual = 'default' | 'massive';

export interface SwarmSwitchProps extends SwitchProps {
    tone?: SwarmToneInput;
    visual?: SwarmSwitchVisual;
    className?: string;
}

export function SwarmSwitch({
    tone,
    color,
    visual = 'massive',
    className,
    ...props
}: SwarmSwitchProps) {
    const resolvedTone = resolveSwarmTone(tone, color, 'primary', 'SwarmSwitch');

    return (
        <Switch
            {...props}
            className={`swarm-switch swarm-tone--${resolvedTone} ${className ?? ''}`.trim()}
            data-swarm-tone={resolvedTone}
            data-swarm-switch-visual={visual}
        />
    );
}
