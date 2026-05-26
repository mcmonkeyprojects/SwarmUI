import { TextInput, type TextInputProps } from '@mantine/core';
import { IconSearch } from '@tabler/icons-react';
import { forwardRef } from 'react';
import { resolveSwarmTone, type SwarmToneInput } from './swarmTones';

export type SwarmSearchInputVisual = 'quiet' | 'glitch' | 'holo';

export interface SwarmSearchInputProps extends TextInputProps {
    tone?: SwarmToneInput;
    visual?: SwarmSearchInputVisual;
    className?: string;
}

export const SwarmSearchInput = forwardRef<HTMLInputElement, SwarmSearchInputProps>(function SwarmSearchInput(
    {
        tone,
        color,
        visual = 'holo',
        className,
        leftSection,
        ...props
    },
    ref
) {
    const resolvedTone = resolveSwarmTone(tone, color, 'info', 'SwarmSearchInput');

    return (
        <TextInput
            ref={ref}
            {...props}
            leftSection={leftSection ?? <IconSearch size={16} />}
            className={`swarm-search-input swarm-tone--${resolvedTone} ${className ?? ''}`.trim()}
            data-swarm-tone={resolvedTone}
            data-swarm-search-visual={visual}
        />
    );
});
