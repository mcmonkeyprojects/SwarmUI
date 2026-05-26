import { memo } from 'react';
import { Accordion, Stack, Select, Text } from '@mantine/core';
import type { UseFormReturnType } from '@mantine/form';
import type { GenerateParams } from '../../../../api/types';
import { SliderWithInput } from '../../../../components/SliderWithInput';
import { ControlTray } from '../../../../components/ui';
import { useT2IParams } from '../../../../hooks/useT2IParams';
import {
    VAE_ALTERNATIVE_EMPTY_MESSAGE,
    getVaeAlternativeDisplayOptions,
    getVaeAlternativeOptionDescription,
    isVaeAlternativeValue,
    splitVaeOptions,
} from '../../../../utils/vaeAlternativeStack';

export interface AdvancedSettingsProps {
    form: UseFormReturnType<GenerateParams>;
    vaeOptions: { value: string; label: string }[];
    loadingVAEs: boolean;
}

export const AdvancedSettings = memo(function AdvancedSettings({
    form,
    vaeOptions,
    loadingVAEs,
}: AdvancedSettingsProps) {
    const { paramRanges } = useT2IParams();
    const { standardOptions, alternativeOptions } = splitVaeOptions(vaeOptions);
    const alternativeDisplayOptions = getVaeAlternativeDisplayOptions(alternativeOptions);
    const alternativeVaeValue = isVaeAlternativeValue(form.values.vae, vaeOptions)
        ? String(form.values.vae)
        : '';

    const clipRange = paramRanges['clipstopatlayer'];
    const clipMin = clipRange?.min !== undefined ? Math.max(clipRange.min, -12) : -12;
    const clipMax = clipRange?.max ?? -1;

    return (
        <Accordion
            multiple
            defaultValue={['advanced']}
            styles={{
                item: { backgroundColor: 'var(--mantine-color-invokeGray-9)', border: 'none', marginBottom: 8 },
                control: { padding: 'var(--mantine-spacing-sm)' },
                content: { padding: 'var(--mantine-spacing-sm)', paddingTop: 0 }
            }}
        >
            <Accordion.Item value="advanced">
                <Accordion.Control>
                    <div className="generate-accordion-control">
                        <Text size="xs" fw={700} c="invokeGray.0" tt="uppercase" className="generate-accordion-control__title" style={{ letterSpacing: '0.5px' }}>
                            Advanced
                        </Text>
                        <span className="generate-accordion-control__summary">
                            CLIP {form.values.clipstopatlayer || -1}
                        </span>
                    </div>
                </Accordion.Control>
                <Accordion.Panel>
                    <Stack gap="sm">
                        <ControlTray
                            title="Model Overrides"
                            subtitle="Use these only when the checkpoint needs a specific VAE or CLIP offset."
                            status={alternativeVaeValue ? 'VAE Alternative' : form.values.vae ? 'Custom VAE' : 'Default VAE'}
                            tone={form.values.vae ? 'info' : 'secondary'}
                        >
                            <Select
                                label="VAE Alternative Stack"
                                placeholder={loadingVAEs ? 'Loading...' : 'Default VAE path'}
                                data={alternativeDisplayOptions}
                                searchable
                                clearable
                                size="sm"
                                value={alternativeVaeValue}
                                disabled={loadingVAEs}
                                onChange={(value) => form.setFieldValue('vae', value || '')}
                                description="Overrides the standard VAE selection when selected."
                                nothingFoundMessage={VAE_ALTERNATIVE_EMPTY_MESSAGE}
                                renderOption={({ option }) => {
                                    const description = getVaeAlternativeOptionDescription(option.value);
                                    return (
                                        <Stack gap={2}>
                                            <Text size="sm">{option.label}</Text>
                                            {description ? (
                                                <Text size="xs" c="dimmed" lineClamp={2}>
                                                    {description}
                                                </Text>
                                            ) : null}
                                        </Stack>
                                    );
                                }}
                            />

                            <Select
                                label="VAE"
                                placeholder={loadingVAEs ? 'Loading...' : 'Default'}
                                data={[{ value: '', label: 'None (Default)' }, ...standardOptions]}
                                searchable
                                clearable
                                size="sm"
                                value={alternativeVaeValue ? '' : String(form.values.vae || '')}
                                onChange={(value) => form.setFieldValue('vae', value || '')}
                                disabled={Boolean(alternativeVaeValue)}
                                description={alternativeVaeValue ? 'Disabled while a VAE alternative is active.' : undefined}
                            />

                            <SliderWithInput
                                label="CLIP Skip"
                                tooltip="Number of CLIP layers to skip (clipstopatlayer). -1 is default (none). -2 is common for anime models."
                                value={form.values.clipstopatlayer || -1}
                                onChange={(value: number) => form.setFieldValue('clipstopatlayer', value)}
                                min={clipMin}
                                max={clipMax}
                                unit=" layer"
                                status={Math.abs(form.values.clipstopatlayer || -1) >= 6 ? 'caution' : 'neutral'}
                                marks={[
                                    { value: -12, label: '-12' },
                                    { value: -2, label: '-2' },
                                    { value: -1, label: '-1' }
                                ]}
                            />
                        </ControlTray>
                    </Stack>
                </Accordion.Panel>
            </Accordion.Item>
        </Accordion>
    );
});
