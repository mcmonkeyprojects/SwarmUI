import type { CSSProperties, ReactNode } from 'react';
import { forwardRef, memo } from 'react';
import { useDebugTrace } from '../../utils/debugTrace';

type SegmentOption = {
    value: string;
    label: ReactNode;
    disabled?: boolean;
};

export interface SwarmSegmentedControlProps {
    value?: string;
    onChange?: (value: string) => void;
    data: ReadonlyArray<SegmentOption | string>;
    disabled?: boolean;
    fullWidth?: boolean;
    className?: string;
    style?: CSSProperties;
    size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
    compact?: boolean;
    transitionDuration?: number;
}

function normalizeOptions(data: ReadonlyArray<SegmentOption | string>): SegmentOption[] {
    return data.map((item) => {
        if (typeof item === 'string') {
            return { value: item, label: item };
        }
        return item;
    });
}

function getMetrics(size: SwarmSegmentedControlProps['size'], compact: boolean) {
    switch (size) {
        case 'sm':
            return { minHeight: compact ? 28 : 32, paddingX: 12, fontSize: 13 };
        case 'md':
            return { minHeight: compact ? 32 : 36, paddingX: 14, fontSize: 14 };
        case 'lg':
            return { minHeight: compact ? 36 : 42, paddingX: 16, fontSize: 15 };
        case 'xl':
            return { minHeight: compact ? 40 : 46, paddingX: 18, fontSize: 16 };
        case 'xs':
        default:
            return { minHeight: compact ? 24 : 28, paddingX: 10, fontSize: 12 };
    }
}

const SwarmSegmentedControlInner = forwardRef<HTMLDivElement, SwarmSegmentedControlProps>(
    function SwarmSegmentedControl(
        {
            className,
            size = 'xs',
            compact = true,
            transitionDuration = 120,
            value,
            data,
            onChange,
            disabled = false,
            fullWidth = false,
            style,
        },
        ref
    ) {
        const options = normalizeOptions(data);
        const metrics = getMetrics(size, compact);

        useDebugTrace('SwarmSegmentedControl', {
            className: className ?? '',
            size,
            compact,
            transitionDuration,
            value,
            dataLength: options.length,
        });

        return (
            <div
                ref={ref}
                className={`swarm-segmented-control ${compact ? 'swarm-segmented-control--compact' : ''} ${className ?? ''}`.trim()}
                role="tablist"
                aria-disabled={disabled ? 'true' : undefined}
                style={{
                    display: 'inline-flex',
                    alignItems: 'stretch',
                    width: fullWidth ? '100%' : undefined,
                    minWidth: 0,
                    padding: 2,
                    borderRadius: 'var(--mantine-radius-default)',
                    backgroundColor: 'var(--theme-surface-panel)',
                    border: 'var(--theme-border-width) var(--theme-border-style) var(--theme-gray-5)',
                    boxShadow: 'var(--elevation-shadow-sm)',
                    gap: 2,
                    ...style,
                }}
            >
                {options.map((option) => {
                    const active = option.value === value;
                    const optionDisabled = disabled || !!option.disabled;

                    return (
                        <button
                            key={option.value}
                            type="button"
                            role="tab"
                            aria-selected={active}
                            disabled={optionDisabled}
                            data-active={active ? 'true' : undefined}
                            onClick={() => {
                                if (!optionDisabled && option.value !== value) {
                                    onChange?.(option.value);
                                }
                            }}
                            style={{
                                flex: fullWidth ? 1 : undefined,
                                minWidth: 0,
                                minHeight: metrics.minHeight,
                                padding: `0 ${metrics.paddingX}px`,
                                border: active
                                    ? '1px solid color-mix(in srgb, var(--theme-selected-border) 72%, transparent)'
                                    : '1px solid transparent',
                                borderRadius: 'calc(var(--mantine-radius-default) - 2px)',
                                background: active ? 'var(--theme-selected-surface)' : 'transparent',
                                color: active ? 'var(--theme-selected-text)' : 'var(--theme-text-secondary)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: 6,
                                whiteSpace: 'nowrap',
                                fontSize: metrics.fontSize,
                                lineHeight: 1,
                                cursor: optionDisabled ? 'default' : 'pointer',
                                opacity: optionDisabled ? 0.45 : 1,
                                transition: `background-color ${transitionDuration}ms ease, border-color ${transitionDuration}ms ease, color ${transitionDuration}ms ease`,
                            }}
                        >
                            {option.label}
                        </button>
                    );
                })}
            </div>
        );
    }
);

SwarmSegmentedControlInner.displayName = 'SwarmSegmentedControl';

export const SwarmSegmentedControl = memo(SwarmSegmentedControlInner);
