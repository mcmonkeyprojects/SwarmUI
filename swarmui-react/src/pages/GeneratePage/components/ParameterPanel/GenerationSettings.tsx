import { memo, useMemo } from 'react';
import { Accordion, Stack, Group, Text, Paper, Badge, SimpleGrid } from '@mantine/core';
import type { UseFormReturnType } from '@mantine/form';
import type { GenerateParams } from '../../../../api/types';
import { SliderWithInput } from '../../../../components/SliderWithInput';
import { SeedInput } from '../../../../components/SeedInput';
import { ControlTray, SwarmSwitch, type SwarmSliderFieldStatus } from '../../../../components/ui';
import { useT2IParams } from '../../../../hooks/useT2IParams';
import type { QualityCoachAnalysis, QualityCoachSeverity } from '../../utils/qualityCoach';
import { getCurrentMatrixCell } from '../../utils/qualityCoachLearningData';

export interface GenerationSettingsProps {
    /** Form instance */
    form: UseFormReturnType<GenerateParams>;
    /** Enable High-Res Fix state */
    enableHiResFix: boolean;
    /** Toggle Hi-Res Fix */
    setEnableHiResFix: (enabled: boolean) => void;
    /** Enable Upscale state */
    enableUpscale: boolean;
    /** Toggle Upscale */
    setEnableUpscale: (enabled: boolean) => void;
    /** Live quality coach analysis */
    qualityCoach?: QualityCoachAnalysis;
}

function toNumber(value: unknown): number | null {
    if (value === null || value === undefined || value === '') {
        return null;
    }
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
}

function getSeverityColor(severity: QualityCoachSeverity): string {
    if (severity === 'high-risk') return 'red';
    if (severity === 'caution') return 'yellow';
    return 'green';
}

function getSliderStatus(severity?: QualityCoachSeverity): SwarmSliderFieldStatus {
    if (severity === 'high-risk') {
        return 'danger';
    }
    if (severity === 'caution') {
        return 'caution';
    }
    return 'good';
}

/**
 * Core generation settings: Steps, CFG Scale, Images count, Batch Size, Seed, and High-Res Fix.
 * Ranges are dynamically loaded from the backend via ListT2IParams.
 */
export const GenerationSettings = memo(function GenerationSettings({
    form,
    setEnableHiResFix,
    setEnableUpscale,
    qualityCoach,
}: GenerationSettingsProps) {
    const { paramRanges } = useT2IParams();
    const matrixCell = useMemo(
        () => getCurrentMatrixCell(toNumber(form.values.cfgscale), toNumber(form.values.steps)),
        [form.values.cfgscale, form.values.steps]
    );
    const cfgHealth = qualityCoach?.parameterHealth.find((item) => item.key === 'cfg');
    const stepsHealth = qualityCoach?.parameterHealth.find((item) => item.key === 'steps');
    const refinerControl = typeof form.values.refinercontrolpercentage === 'number'
        ? form.values.refinercontrolpercentage
        : (typeof form.values.refinercontrol === 'number' ? form.values.refinercontrol : 0);
    const refinerUpscale = typeof form.values.refinerupscale === 'number' ? form.values.refinerupscale : 1;
    const hiResFixEnabled = refinerControl > 0;
    const postUpscaleEnabled = refinerUpscale > 1;

    const setHiResFixEnabled = (checked: boolean) => {
        if (checked) {
            form.setFieldValue('refinercontrol', refinerControl > 0 ? refinerControl : 0.2);
            form.setFieldValue('refinercontrolpercentage', refinerControl > 0 ? refinerControl : 0.2);
            setEnableHiResFix(true);
            return;
        }

        form.setFieldValue('refinercontrol', 0);
        form.setFieldValue('refinercontrolpercentage', 0);
        if (!postUpscaleEnabled) {
            setEnableHiResFix(false);
        }
    };

    const setPostUpscaleEnabled = (checked: boolean) => {
        if (checked) {
            if (refinerUpscale <= 1) {
                form.setFieldValue('refinerupscale', 2);
            }
            setEnableUpscale(true);
            return;
        }

        form.setFieldValue('refinerupscale', 1);
        if (!hiResFixEnabled) {
            setEnableUpscale(false);
        }
    };

    const stepsRange = paramRanges['steps'];
    const cfgRange = paramRanges['cfgscale'];
    const imagesRange = paramRanges['images'];
    const batchSizeRange = paramRanges['batchsize'];

    const stepsMin = stepsRange?.min ?? 1;
    const stepsMax = stepsRange?.viewMax ?? stepsRange?.max ?? 150;
    const cfgMin = cfgRange?.min ?? 1;
    const cfgMax = cfgRange?.viewMax ?? cfgRange?.max ?? 30;
    const cfgStep = cfgRange?.step ?? 0.5;
    const imagesMin = imagesRange?.min ?? 1;
    const imagesMax = imagesRange?.viewMax ?? imagesRange?.max ?? 20;
    const batchSizeMin = batchSizeRange?.min ?? 1;
    const batchSizeMax = batchSizeRange?.viewMax ?? batchSizeRange?.max ?? 8;

    return (
        <Accordion
            multiple
            defaultValue={['generation', 'batch']}
            variant="contained"
            styles={{
                item: { backgroundColor: 'var(--mantine-color-invokeGray-9)', border: 'none', marginBottom: 8 },
                control: { padding: 'var(--mantine-spacing-sm)' },
                content: { padding: 'var(--mantine-spacing-sm)', paddingTop: 0 }
            }}
        >
            {/* Generation Settings - Steps & CFG */}
            <Accordion.Item value="generation">
                <Accordion.Control>
                    <div className="generate-accordion-control">
                        <Text size="xs" fw={700} c="invokeGray.0" tt="uppercase" className="generate-accordion-control__title" style={{ letterSpacing: '0.5px' }}>
                            Generation
                        </Text>
                        <span className="generate-accordion-control__summary">
                            {form.values.steps || 20} steps | CFG {form.values.cfgscale || 7}
                        </span>
                    </div>
                </Accordion.Control>
                <Accordion.Panel>
                    <Stack gap="sm">
                        <ControlTray
                            title="Subsystems"
                            subtitle="Large switches arm the major generation paths."
                            status={`${hiResFixEnabled ? 'Refine on' : 'Refine off'} | ${postUpscaleEnabled ? 'Upscale on' : 'Upscale off'}`}
                            tone={hiResFixEnabled || postUpscaleEnabled ? 'info' : 'secondary'}
                        >
                            <SwarmSwitch
                                label="Hi-Res Fix"
                                size="xs"
                                checked={hiResFixEnabled}
                                onChange={(e) => setHiResFixEnabled(e.currentTarget.checked)}
                                tone="info"
                            />
                            <SwarmSwitch
                                label="Post Upscale"
                                size="xs"
                                checked={postUpscaleEnabled}
                                onChange={(e) => setPostUpscaleEnabled(e.currentTarget.checked)}
                                tone="success"
                            />
                        </ControlTray>
                        <ControlTray
                            title="Live Baking Status"
                            subtitle={matrixCell.description}
                            status={matrixCell.title}
                            tone={matrixCell.severity === 'high-risk' ? 'danger' : matrixCell.severity === 'caution' ? 'warning' : 'success'}
                        >
                            <Group justify="space-between" align="flex-start" wrap="nowrap">
                                <div>
                                    <Text size="xs" fw={600}>Current balance</Text>
                                    <Text size="xs" c="dimmed">CFG strictness and step time are watched together.</Text>
                                </div>
                                <Badge color={getSeverityColor(matrixCell.severity)} variant="light">
                                    {matrixCell.title}
                                </Badge>
                            </Group>
                            <SimpleGrid cols={2} spacing="xs" mt="sm">
                                <Paper p="xs" radius="sm" style={{ border: '1px solid var(--mantine-color-invokeGray-7)' }}>
                                    <Text size="xs" fw={600}>CFG</Text>
                                    <Text size="xs" c="dimmed">
                                        {cfgHealth ? `${cfgHealth.currentValue} | ${cfgHealth.note}` : 'Adjust CFG to see live guidance.'}
                                    </Text>
                                </Paper>
                                <Paper p="xs" radius="sm" style={{ border: '1px solid var(--mantine-color-invokeGray-7)' }}>
                                    <Text size="xs" fw={600}>Steps</Text>
                                    <Text size="xs" c="dimmed">
                                        {stepsHealth ? `${stepsHealth.currentValue} | ${stepsHealth.note}` : 'Adjust steps to see live guidance.'}
                                    </Text>
                                </Paper>
                            </SimpleGrid>
                            <Text size="xs" mt="sm">
                                Baking analogy: CFG is recipe strictness, steps are oven time. Mid CFG with mid steps is usually the safe sweet spot.
                            </Text>
                        </ControlTray>
                        {/* Steps */}
                        <SliderWithInput
                            label="Steps"
                            tooltip="The number of denoising steps. More steps = higher quality but slower. 20-30 is good for most images."
                            value={form.values.steps || 20}
                            onChange={(value) => form.setFieldValue('steps', value)}
                            min={stepsMin}
                            max={stepsMax}
                            unit=" steps"
                            status={getSliderStatus(stepsHealth?.severity)}
                            marks={[
                                { value: stepsMin, label: String(stepsMin) },
                                { value: 20, label: '20' },
                                { value: 50, label: '50' },
                                { value: stepsMax, label: String(stepsMax) },
                            ]}
                        />

                        {/* CFG Scale */}
                        <SliderWithInput
                            label="CFG Scale"
                            tooltip="Classifier-Free Guidance scale. Higher values follow the prompt more closely but may reduce image quality. 5-10 is typical."
                            value={form.values.cfgscale || 7}
                            onChange={(value) => form.setFieldValue('cfgscale', value)}
                            min={cfgMin}
                            max={cfgMax}
                            step={cfgStep}
                            decimalScale={1}
                            status={getSliderStatus(cfgHealth?.severity)}
                            marks={[
                                { value: cfgMin, label: String(cfgMin) },
                                { value: 7, label: '7' },
                                { value: 15, label: '15' },
                                { value: cfgMax, label: String(cfgMax) },
                            ]}
                        />
                    </Stack>
                </Accordion.Panel>
            </Accordion.Item>

            {/* Batch Settings - Images & Seed */}
            <Accordion.Item value="batch">
                <Accordion.Control>
                    <div className="generate-accordion-control">
                        <Text size="xs" fw={700} c="invokeGray.0" tt="uppercase" className="generate-accordion-control__title" style={{ letterSpacing: '0.5px' }}>
                            Batch & Seed
                        </Text>
                        <span className="generate-accordion-control__summary">
                            {form.values.images || 1} img | batch {form.values.batchsize || 1}
                        </span>
                    </div>
                </Accordion.Control>
                <Accordion.Panel>
                    <Stack gap="sm">
                        <Group grow align="flex-start">
                            <SliderWithInput
                                label="Images (Count)"
                                tooltip="Number of images to generate sequentially."
                                value={form.values.images || 1}
                                onChange={(value) => form.setFieldValue('images', value)}
                                min={imagesMin}
                                max={imagesMax}
                                step={1}
                                unit=" img"
                                marks={[
                                    { value: imagesMin, label: String(imagesMin) },
                                    { value: imagesMax > 10 ? 10 : imagesMax, label: String(imagesMax > 10 ? 10 : imagesMax) },
                                ]}
                            />
                            <SliderWithInput
                                label="Batch Size"
                                tooltip="Number of images to generate simultaneously in one VRAM pass."
                                value={form.values.batchsize || 1}
                                onChange={(value) => form.setFieldValue('batchsize', value)}
                                min={batchSizeMin}
                                max={batchSizeMax}
                                step={1}
                                unit=" batch"
                                marks={[
                                    { value: batchSizeMin, label: String(batchSizeMin) },
                                    { value: batchSizeMax, label: String(batchSizeMax) },
                                ]}
                            />
                        </Group>
                        <SeedInput
                            value={form.values.seed ?? -1}
                            onChange={(value) => form.setFieldValue('seed', value)}
                        />
                    </Stack>
                </Accordion.Panel>
            </Accordion.Item>
        </Accordion>
    );
});
