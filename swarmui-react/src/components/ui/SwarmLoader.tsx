import { Box, type BoxProps } from '@mantine/core';
import { forwardRef, type CSSProperties } from 'react';
import { resolveSwarmTone, type SwarmToneInput } from './swarmTones';

export type SwarmLoaderVariant = 'material' | 'trace' | 'pulse';

export interface SwarmLoaderProps extends BoxProps {
    tone?: SwarmToneInput;
    variant?: SwarmLoaderVariant;
    size?: number | string;
    label?: string;
    className?: string;
}

export const SwarmLoader = forwardRef<HTMLDivElement, SwarmLoaderProps>(function SwarmLoader(
    {
        tone,
        variant = 'material',
        size = 36,
        label,
        className,
        style,
        ...props
    },
    ref
) {
    const resolvedTone = resolveSwarmTone(tone, undefined, 'primary', 'SwarmLoader');
    const loaderStyle = {
        '--swarm-loader-size': typeof size === 'number' ? `${size}px` : size,
        ...style,
    } as CSSProperties;

    return (
        <Box
            ref={ref}
            {...props}
            role="status"
            aria-live="polite"
            className={`swarm-loader swarm-tone--${resolvedTone} ${className ?? ''}`.trim()}
            data-swarm-tone={resolvedTone}
            data-swarm-loader-variant={variant}
            style={loaderStyle}
        >
            {variant === 'trace' ? (
                <span className="swarm-loader__trace-window" aria-hidden="true">
                    <span className="swarm-loader__trace-bar" />
                    <span className="swarm-loader__trace-line" />
                    <span className="swarm-loader__trace-line" />
                    <span className="swarm-loader__trace-line" />
                </span>
            ) : null}
            {variant === 'pulse' ? (
                <span className="swarm-loader__pulse" aria-hidden="true">
                    <span />
                    <span />
                    <span />
                    <span />
                </span>
            ) : null}
            {variant === 'material' ? (
                <svg className="swarm-loader__ring" viewBox="0 0 48 48" aria-hidden="true">
                    <circle cx="24" cy="24" r="18" />
                </svg>
            ) : null}
            {label ? <span className="swarm-loader__label">{label}</span> : null}
        </Box>
    );
});
