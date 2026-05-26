import { memo } from 'react';
import {
    Accordion,
    Stack,
} from '@mantine/core';
import type { UseFormReturnType } from '@mantine/form';
import type { GenerateParams } from '../../../../api/types';
import { SliderWithInput } from '../../../../components/SliderWithInput';
import { ControlTray, SamplingSelect } from '../../../../components/ui';
import { useT2IParams } from '../../../../hooks/useT2IParams';

export interface SamplerAccordionProps {
    form: UseFormReturnType<GenerateParams>;
}

/**
 * Sampler & Scheduler accordion section.
 * Options are dynamically loaded from the backend via ListT2IParams,
 * with fallback to local data if the API hasn't responded yet.
 */
export const SamplerAccordion = memo(function SamplerAccordion({
    form,
}: SamplerAccordionProps) {
    const { samplerOptions, schedulerOptions, paramRanges } = useT2IParams();

    const clipRange = paramRanges['clipstopatlayer'];
    const clipMin = clipRange?.min ?? -24;
    const clipMax = clipRange?.max ?? -1;

    return (
        <Accordion.Item value="sampler">
            <Accordion.Control>
                <div className="generate-accordion-control">
                    <span className="generate-accordion-control__title">Sampler & Scheduler</span>
                    <span className="generate-accordion-control__summary">
                        {form.values.sampler || 'Sampler'} | {form.values.scheduler || 'Scheduler'}
                    </span>
                </div>
            </Accordion.Control>
            <Accordion.Panel>
                <Stack gap="md">
                    <ControlTray
                        title="Sampling Route"
                        subtitle="Sampler family and scheduler define how the denoise path behaves."
                        status={form.values.sampler || 'Default'}
                        tone="primary"
                    >
                        <SamplingSelect
                            kind="sampler"
                            label="Sampler"
                            data={samplerOptions}
                            searchable
                            {...form.getInputProps('sampler')}
                        />

                        <SamplingSelect
                            kind="scheduler"
                            label="Scheduler"
                            data={schedulerOptions}
                            searchable
                            {...form.getInputProps('scheduler')}
                        />
                    </ControlTray>

                    <SliderWithInput
                        label="CLIP Stop At Layer"
                        value={form.values.clipstopatlayer || -1}
                        onChange={(value: number) => form.setFieldValue('clipstopatlayer', value)}
                        min={clipMin}
                        max={clipMax}
                        unit=" layer"
                        status={Math.abs(form.values.clipstopatlayer || -1) >= 6 ? 'caution' : 'neutral'}
                    />
                </Stack>
            </Accordion.Panel>
        </Accordion.Item>
    );
});
