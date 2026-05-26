import { memo } from 'react';
import {
    Accordion,
    Stack,
    Select,
} from '@mantine/core';
import type { UseFormReturnType } from '@mantine/form';
import type { GenerateParams } from '../../../../api/types';
import { SliderWithInput } from '../../../../components/SliderWithInput';
import { ControlTray, SwarmSwitch } from '../../../../components/ui';
import { useT2IParams } from '../../../../hooks/useT2IParams';

export interface OptionsAccordionProps {
    form: UseFormReturnType<GenerateParams>;
}

/**
 * Additional Options accordion section.
 * Images, batch size, seamless tiling, and save options.
 */
export const OptionsAccordion = memo(function OptionsAccordion({
    form,
}: OptionsAccordionProps) {
    const { paramRanges } = useT2IParams();

    return (
        <Accordion.Item value="options">
            <Accordion.Control>
                <div className="generate-accordion-control">
                    <span className="generate-accordion-control__title">Additional Options</span>
                    <span className="generate-accordion-control__summary">
                        {form.values.images || 1} img | batch {form.values.batchsize || 1}
                    </span>
                </div>
            </Accordion.Control>
            <Accordion.Panel>
                <Stack gap="md">
                    <ControlTray
                        title="Output Count"
                        subtitle="Count controls how many jobs run; batch controls how many share one VRAM pass."
                        status={`${form.values.images || 1} x ${form.values.batchsize || 1}`}
                        tone="info"
                    >
                        <SliderWithInput
                            label="Images"
                            value={form.values.images || 1}
                            onChange={(value) => form.setFieldValue('images', value)}
                            min={paramRanges.images?.min ?? 1}
                            max={paramRanges.images?.viewMax ?? paramRanges.images?.max ?? 20}
                            step={paramRanges.images?.step ?? 1}
                            unit=" img"
                            tone="info"
                        />

                        <SliderWithInput
                            label="Batch Size"
                            value={form.values.batchsize || 1}
                            onChange={(value) => form.setFieldValue('batchsize', value)}
                            min={paramRanges.batchsize?.min ?? 1}
                            max={paramRanges.batchsize?.viewMax ?? paramRanges.batchsize?.max ?? 16}
                            step={paramRanges.batchsize?.step ?? 1}
                            unit=" batch"
                            status={(form.values.batchsize || 1) > 4 ? 'caution' : 'neutral'}
                        />
                    </ControlTray>

                    <Select
                        label="Seamless Tileable"
                        placeholder="None"
                        data={[
                            { value: '', label: 'None' },
                            { value: 'both', label: 'Both' },
                            { value: 'horizontal', label: 'Horizontal' },
                            { value: 'vertical', label: 'Vertical' },
                        ]}
                        {...form.getInputProps('seamlesstileable')}
                        clearable
                    />

                    <ControlTray
                        title="Save & Preview Flags"
                        subtitle="Operational toggles for lighter runs or cleaner outputs."
                        status={form.values.nopreviews ? 'Previews off' : 'Previews on'}
                        tone="secondary"
                    >
                        <SwarmSwitch
                            label="Remove Background"
                            {...form.getInputProps('removebackground', { type: 'checkbox' })}
                        />

                        <SwarmSwitch
                            label="Do Not Save"
                            {...form.getInputProps('donotsave', { type: 'checkbox' })}
                        />

                        <SwarmSwitch
                            label="Don't Save Intermediates"
                            {...form.getInputProps('dontsaveintermediates', { type: 'checkbox' })}
                        />

                        <SwarmSwitch
                            label="Disable Live Previews"
                            description="Sends SwarmUI's existing nopreviews flag for lighter generation updates."
                            {...form.getInputProps('nopreviews', { type: 'checkbox' })}
                        />
                    </ControlTray>
                </Stack>
            </Accordion.Panel>
        </Accordion.Item>
    );
});
