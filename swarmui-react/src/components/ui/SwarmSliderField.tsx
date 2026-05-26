import { NumberInput, Stack, Text, type SliderProps } from '@mantine/core';
import { SwarmSlider, type SwarmSliderStatus } from './SwarmSlider';
import type { SwarmToneInput } from './swarmTones';

export type SwarmSliderFieldStatus = SwarmSliderStatus;

export interface SwarmSliderFieldProps extends SliderProps {
    label?: string;
    tooltip?: string;
    decimalScale?: number;
    description?: string;
    className?: string;
    unit?: string;
    status?: SwarmSliderFieldStatus;
    valueFormatter?: (value: number) => string;
    tone?: SwarmToneInput;
}

function formatSliderValue(
    value: unknown,
    decimalScale?: number,
    unit?: string,
    valueFormatter?: (value: number) => string
): string {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        return '--';
    }

    if (valueFormatter) {
        return valueFormatter(value);
    }

    if (unit === '%') {
        return `${Math.round(value * 100)}%`;
    }

    if (typeof decimalScale === 'number') {
        return `${value.toFixed(decimalScale)}${unit ?? ''}`;
    }

    const formatted = Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.?0+$/, '');
    return `${formatted}${unit ?? ''}`;
}

function resolveStatusTone(status?: SwarmSliderFieldStatus, tone?: SwarmToneInput): SwarmToneInput | undefined {
    if (tone) {
        return tone;
    }
    if (status === 'good') {
        return 'success';
    }
    if (status === 'caution') {
        return 'warning';
    }
    if (status === 'danger') {
        return 'danger';
    }
    return undefined;
}

export function SwarmSliderField({
    label,
    tooltip,
    decimalScale,
    description,
    className,
    unit,
    status = 'neutral',
    valueFormatter,
    tone,
    ...props
}: SwarmSliderFieldProps) {
    const displayValue = formatSliderValue(props.value ?? props.defaultValue, decimalScale, unit, valueFormatter);
    const resolvedTone = resolveStatusTone(status, tone);
    const rawNumericValue = typeof props.value === 'number'
        ? props.value
        : typeof props.defaultValue === 'number'
            ? props.defaultValue
            : '';
    const numericValue = unit === '%' && typeof rawNumericValue === 'number'
        ? Math.round(rawNumericValue * 100)
        : rawNumericValue;
    const numberMin = unit === '%' && typeof props.min === 'number' ? props.min * 100 : props.min;
    const numberMax = unit === '%' && typeof props.max === 'number' ? props.max * 100 : props.max;
    const numberStep = unit === '%' && typeof props.step === 'number' ? props.step * 100 : props.step;

    const handleNumberChange = (value: string | number) => {
        if (typeof value === 'number' && Number.isFinite(value)) {
            props.onChange?.(unit === '%' ? value / 100 : value);
        }
    };

    return (
        <Stack
            gap={6}
            className={`swarm-slider-field ${className ?? ''}`.trim()}
            data-swarm-slider-field-visual="glass"
            data-swarm-slider-status={status}
            title={tooltip}
        >
            {(label || displayValue !== '--') && (
                <div className="swarm-slider-field__header">
                    {label && <Text size="sm" className="swarm-slider-field__label">{label}</Text>}
                    <NumberInput
                        aria-label={label ? `${label} value` : 'Slider value'}
                        value={numericValue}
                        onChange={handleNumberChange}
                        min={numberMin}
                        max={numberMax}
                        step={numberStep}
                        decimalScale={unit === '%' ? 0 : decimalScale}
                        disabled={props.disabled}
                        classNames={{
                            input: `swarm-slider-field__value-input ${unit ? 'swarm-slider-field__value-input--has-unit' : ''}`.trim()
                        }}
                        variant="unstyled"
                        size="xs"
                        hideControls
                        rightSection={unit ? <span className="swarm-slider-field__unit">{unit.trim()}</span> : undefined}
                        rightSectionWidth={unit ? 28 : undefined}
                        title={displayValue}
                    />
                </div>
            )}
            {description && <Text size="xs" c="dimmed">{description}</Text>}
            <div className="swarm-slider-field__control">
                <SwarmSlider {...props} tone={resolvedTone} />
            </div>
        </Stack>
    );
}
