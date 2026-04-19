import { Box } from '@mantine/core';
import { forwardRef, type CSSProperties, type MouseEventHandler } from 'react';

export type ElevationLevel = 'floor' | 'table' | 'paper' | 'raised';

export interface ElevatedCardProps {
    /** Elevation level - determines background color and shadow depth */
    elevation?: ElevationLevel;
    /** Whether to show border */
    withBorder?: boolean;
    /** Whether card is interactive (shows hover effects) */
    interactive?: boolean;
    /** Optional tonal treatment */
    tone?: 'neutral' | 'brand' | 'accent' | 'success' | 'warning' | 'error';
    children: React.ReactNode;
    className?: string;
    style?: CSSProperties;
    onClick?: MouseEventHandler<HTMLDivElement>;
}

/**
 * A reusable card component with built-in surface elevation styling.
 * Uses the InvokeAI-inspired elevation system:
 * - floor: Deepest background (canvas)
 * - table: Panel level (sidebars)
 * - paper: Card level (content blocks)
 * - raised: Highlighted state
 */
export const ElevatedCard = forwardRef<HTMLDivElement, ElevatedCardProps>(
    function ElevatedCard(
        {
            elevation = 'paper',
            withBorder = true,
            interactive = false,
            tone = 'neutral',
            children,
            style,
            className,
            onClick,
        },
        ref
    ) {
        const elevationStyles: Record<ElevationLevel, CSSProperties> = {
            floor: {
                backgroundColor: 'var(--elevation-floor)',
                boxShadow: 'none',
            },
            table: {
                backgroundColor: 'var(--elevation-table)',
                boxShadow: 'var(--elevation-shadow-sm)',
            },
            paper: {
                backgroundColor: 'var(--elevation-paper)',
                boxShadow: 'var(--elevation-shadow-sm)',
            },
            raised: {
                backgroundColor: 'var(--elevation-raised)',
                boxShadow: 'var(--elevation-shadow-md)',
            },
        };

        const toneBorders: Record<NonNullable<ElevatedCardProps['tone']>, string> = {
            neutral: 'var(--theme-gray-5)',
            brand: 'color-mix(in srgb, var(--theme-brand) 46%, var(--theme-gray-5))',
            accent: 'color-mix(in srgb, var(--theme-accent-2) 46%, var(--theme-gray-5))',
            success: 'color-mix(in srgb, var(--theme-success) 46%, var(--theme-gray-5))',
            warning: 'color-mix(in srgb, var(--theme-warning) 46%, var(--theme-gray-5))',
            error: 'color-mix(in srgb, var(--theme-error) 46%, var(--theme-gray-5))',
        };

        const toneSurface: Record<NonNullable<ElevatedCardProps['tone']>, string> = {
            neutral: 'color-mix(in srgb, var(--theme-gray-8) 84%, transparent)',
            brand: 'color-mix(in srgb, var(--theme-brand-soft) 60%, transparent)',
            accent: 'color-mix(in srgb, var(--theme-accent-soft) 60%, transparent)',
            success: 'color-mix(in srgb, var(--theme-success-soft) 65%, transparent)',
            warning: 'color-mix(in srgb, var(--theme-warning-soft) 65%, transparent)',
            error: 'color-mix(in srgb, var(--theme-error-soft) 65%, transparent)',
        };

        const baseStyle: CSSProperties = {
            ...elevationStyles[elevation],
            borderRadius: 'calc(10px * var(--theme-radius-multiplier))',
            border: withBorder
                ? `var(--theme-border-width) var(--theme-border-style) ${toneBorders[tone]}`
                : 'none',
            padding: '12px',
            backgroundImage: `linear-gradient(160deg, ${toneSurface[tone]}, transparent 62%)`,
            transition: interactive
                ? 'transform 150ms var(--theme-animation-curve), box-shadow 150ms ease, background-color 150ms ease, border-color 150ms ease'
                : 'background-color 150ms ease',
            ...(interactive && {
                cursor: 'pointer',
                transform: 'translateZ(0)',
            }),
            ...style,
        };

        return (
            <Box
                ref={ref}
                className={`elevated-card elevated-card--${elevation} elevated-card--${tone} ${interactive ? 'fx-hover-lift' : ''} ${className || ''}`}
                style={baseStyle}
                onClick={onClick}
            >
                {children}
            </Box>
        );
    }
);
