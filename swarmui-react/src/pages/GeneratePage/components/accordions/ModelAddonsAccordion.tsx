import { memo } from 'react';
import {
    Accordion,
    Stack,
    Select,
    Text,
} from '@mantine/core';
import type { UseFormReturnType } from '@mantine/form';
import type { GenerateParams } from '../../../../api/types';
import {
    VAE_ALTERNATIVE_EMPTY_MESSAGE,
    getVaeAlternativeDisplayOptions,
    getVaeAlternativeOptionDescription,
    isVaeAlternativeValue,
    splitVaeOptions,
} from '../../../../utils/vaeAlternativeStack';

export interface ModelAddonsAccordionProps {
    form: UseFormReturnType<GenerateParams>;
    vaeOptions: { value: string; label: string }[];
    loadingVAEs: boolean;
}

/**
 * Model Add-ons (VAE) accordion section.
 */
export const ModelAddonsAccordion = memo(function ModelAddonsAccordion({
    form,
    vaeOptions = [],
    loadingVAEs,
}: ModelAddonsAccordionProps) {
    const { standardOptions, alternativeOptions } = splitVaeOptions(vaeOptions);
    const alternativeDisplayOptions = getVaeAlternativeDisplayOptions(alternativeOptions);
    const alternativeVaeValue = isVaeAlternativeValue(form.values.vae, vaeOptions)
        ? String(form.values.vae)
        : '';

    return (
        <Accordion.Item value="modeladdons">
            <Accordion.Control>Model Add-ons (VAE)</Accordion.Control>
            <Accordion.Panel>
                <Stack gap="md">
                    <Select
                        label="VAE Alternative Stack"
                        placeholder={loadingVAEs ? 'Loading VAEs...' : 'Select alternative'}
                        data={alternativeDisplayOptions}
                        searchable
                        clearable
                        value={alternativeVaeValue}
                        disabled={loadingVAEs}
                        onChange={(value) => form.setFieldValue('vae', value || '')}
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
                        placeholder={loadingVAEs ? 'Loading VAEs...' : 'Select VAE'}
                        data={standardOptions}
                        searchable
                        clearable
                        value={alternativeVaeValue ? '' : String(form.values.vae || '')}
                        disabled={Boolean(alternativeVaeValue)}
                        onChange={(value) => form.setFieldValue('vae', value || '')}
                    />
                    <Text size="xs" c="invokeGray.3">
                        VAE alternatives replace the standard decoder path. Selecting one
                        clears and locks the regular VAE picker until removed.
                    </Text>
                </Stack>
            </Accordion.Panel>
        </Accordion.Item>
    );
});
