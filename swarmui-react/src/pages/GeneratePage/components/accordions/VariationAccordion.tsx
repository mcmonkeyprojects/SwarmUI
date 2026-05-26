import { memo } from 'react';
import {
    Accordion,
    Stack,
    Text,
} from '@mantine/core';
import type { UseFormReturnType } from '@mantine/form';
import type { GenerateParams } from '../../../../api/types';
import { SliderWithInput } from '../../../../components/SliderWithInput';
import { ControlTray, SwarmSwitch } from '../../../../components/ui';

export interface VariationAccordionProps {
    form: UseFormReturnType<GenerateParams>;
    enabled: boolean;
    onToggle: (enabled: boolean) => void;
}

/**
 * Variation Seed accordion section.
 * Creates similar but different images using variation seed.
 */
export const VariationAccordion = memo(function VariationAccordion({
    form,
    enabled,
    onToggle,
}: VariationAccordionProps) {
    return (
        <Accordion.Item value="variations">
            <Accordion.Control>
                <div className="generate-accordion-control">
                    <span className="generate-accordion-control__title">Variation Seed</span>
                    <span className="generate-accordion-control__summary">
                        {enabled ? `Strength ${form.values.variationseedstrength || 0}` : 'Off'}
                    </span>
                </div>
            </Accordion.Control>
            <Accordion.Panel>
                <Stack gap="md">
                    <ControlTray
                        title="Variation Controls"
                        subtitle="Blend a second seed into the base result."
                        status={enabled ? 'Armed' : 'Off'}
                        tone={enabled ? 'info' : 'secondary'}
                    >
                        <SwarmSwitch
                            label="Enable Variation Seed"
                            size="xs"
                            checked={enabled}
                            onChange={(e) => onToggle(e.currentTarget.checked)}
                            tone="info"
                        />
                        <SliderWithInput
                            label="Variation Seed"
                            value={form.values.variationseed || -1}
                            onChange={(value) => form.setFieldValue('variationseed', value)}
                            min={-1}
                            max={999999999}
                            valueFormatter={(value) => value === -1 ? 'random' : String(Math.round(value))}
                            tone="info"
                        />

                        <SliderWithInput
                            label="Variation Strength"
                            value={form.values.variationseedstrength || 0}
                            onChange={(value) => form.setFieldValue('variationseedstrength', value)}
                            min={0}
                            max={1}
                            step={0.05}
                            decimalScale={2}
                            unit="%"
                            status={(form.values.variationseedstrength || 0) > 0.7 ? 'caution' : 'neutral'}
                            marks={[
                                { value: 0, label: '0' },
                                { value: 0.25, label: '0.25' },
                                { value: 0.5, label: '0.5' },
                                { value: 0.75, label: '0.75' },
                            ]}
                        />
                    </ControlTray>
                    <Text size="xs" c="invokeGray.3">
                        Creates similar but different images. 0 = don't use, 1 = replace
                        base seed entirely.
                    </Text>
                </Stack>
            </Accordion.Panel>
        </Accordion.Item>
    );
});
