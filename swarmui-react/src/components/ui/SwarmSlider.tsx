import { Slider, type SliderProps } from '@mantine/core';
import { resolveSwarmTone, type SwarmToneInput } from './swarmTones';

export type SwarmSliderVisual = 'default' | 'glass';
export type SwarmSliderStatus = 'neutral' | 'good' | 'caution' | 'danger';

export interface SwarmSliderProps extends SliderProps {
    tone?: SwarmToneInput;
    visual?: SwarmSliderVisual;
    className?: string;
    status?: SwarmSliderStatus;
}

export function SwarmSlider({
    tone,
    color,
    visual = 'glass',
    className,
    status = 'neutral',
    ...props
}: SwarmSliderProps) {
    const statusTone = status === 'good'
        ? 'success'
        : status === 'caution'
            ? 'warning'
            : status === 'danger'
                ? 'danger'
                : undefined;
    const resolvedTone = resolveSwarmTone(tone ?? statusTone, color, 'primary', 'SwarmSlider');

    return (
        <Slider
            {...props}
            className={`swarm-slider swarm-tone--${resolvedTone} ${className ?? ''}`.trim()}
            data-swarm-tone={resolvedTone}
            data-swarm-slider-visual={visual}
            data-swarm-slider-status={status}
        />
    );
}
