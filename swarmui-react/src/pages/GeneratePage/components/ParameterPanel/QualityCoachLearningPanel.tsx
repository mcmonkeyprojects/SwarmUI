import { useMemo, useState } from 'react';
import {
    Accordion,
    Badge,
    Box,
    Checkbox,
    Divider,
    Group,
    List,
    Paper,
    SimpleGrid,
    Stack,
    Text,
} from '@mantine/core';
import type { GenerateParams } from '../../../../api/types';
import type { QualityCoachAnalysis, QualityCoachSeverity } from '../../utils/qualityCoach';
import { SwarmButton, SwarmCheckbox } from '../../../../components/ui';
import {
    getCurrentMatrixCell,
    getAllFailureModes,
    getAllGuides,
    getAllRecipes,
    getMatchedFailureModes,
    getMatrixBandForCfg,
    getMatrixBandForSteps,
    getLearningLevelLabel,
    QUALITY_COACH_DIAGNOSTIC_SYMPTOMS,
    QUALITY_COACH_GLOSSARY,
    QUALITY_COACH_MATRIX,
} from '../../utils/qualityCoachLearningData';

export interface QualityCoachLearningPanelProps {
    qualityCoach: QualityCoachAnalysis;
    currentValues?: Partial<GenerateParams>;
    onApplyValues?: (overrides: Partial<GenerateParams>) => void;
    onClose?: () => void;
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

function getSeverityLabel(severity: QualityCoachSeverity): string {
    if (severity === 'high-risk') return 'High Risk';
    if (severity === 'caution') return 'Caution';
    return 'Balanced';
}

export function QualityCoachLearningPanel({
    qualityCoach,
    currentValues,
    onApplyValues,
    onClose,
}: QualityCoachLearningPanelProps) {
    const [selectedSymptoms, setSelectedSymptoms] = useState<string[]>([]);

    const currentCfg = toNumber(currentValues?.cfgscale);
    const currentSteps = toNumber(currentValues?.steps);
    const matrixCell = useMemo(
        () => getCurrentMatrixCell(currentCfg, currentSteps),
        [currentCfg, currentSteps]
    );
    const guides = useMemo(() => getAllGuides(), []);
    const recipes = useMemo(() => getAllRecipes(), []);
    const failureModes = useMemo(() => getAllFailureModes(), []);
    const matchedFailures = useMemo(() => getMatchedFailureModes(selectedSymptoms), [selectedSymptoms]);

    return (
        <Stack gap="md" style={{ maxHeight: 'min(700px, 85vh)', overflowY: 'auto', paddingRight: 6 }}>
            {/* Status header */}
            <Paper p="sm" radius="md" style={{ border: '1px solid var(--mantine-color-invokeGray-7)' }}>
                <Group justify="space-between" align="center" wrap="wrap" gap="xs">
                    <div>
                        <Text fw={700} size="sm">Quality Coach</Text>
                        <Text size="xs" c="dimmed">
                            CFG {currentCfg ?? 'unset'} · Steps {currentSteps ?? 'unset'} · {matrixCell.title}
                        </Text>
                    </div>
                    <Badge color={getSeverityColor(qualityCoach.overallSeverity)} variant="light">
                        {qualityCoach.overallLabel}
                    </Badge>
                </Group>
            </Paper>

            {/* Parameter health grid */}
            <SimpleGrid cols={2} spacing="sm" verticalSpacing="sm">
                {qualityCoach.parameterHealth.map((item) => (
                    <Paper
                        key={item.key}
                        p="sm"
                        radius="md"
                        style={{ border: '1px solid var(--mantine-color-invokeGray-7)' }}
                    >
                        <Group justify="space-between" align="flex-start" wrap="nowrap">
                            <div>
                                <Text fw={600} size="sm">{item.label}</Text>
                                <Text size="xs" c="dimmed">Current: {item.currentValue}</Text>
                            </div>
                            <Badge color={getSeverityColor(item.severity)} variant="light">
                                {getSeverityLabel(item.severity)}
                            </Badge>
                        </Group>
                        <Text size="xs" mt={6}>{item.note}</Text>
                        <Text size="xs" c="dimmed" mt={4}>
                            Recommended: {item.recommendedRange}
                        </Text>
                    </Paper>
                ))}
            </SimpleGrid>

            {/* Live issues */}
            {qualityCoach.issues.length > 0 ? (
                <Stack gap="sm">
                    <Text size="xs" fw={700} tt="uppercase" c="dimmed">Issues Found</Text>
                    {qualityCoach.issues.slice(0, 6).map((issue) => (
                        <Paper
                            key={issue.id}
                            p="sm"
                            radius="md"
                            style={{ border: '1px solid var(--mantine-color-invokeGray-7)' }}
                        >
                            <Group justify="space-between" align="flex-start" wrap="wrap" gap="xs">
                                <div>
                                    <Text fw={600} size="sm">{issue.title}</Text>
                                    <Text size="xs" c="dimmed">
                                        {issue.currentValue ?? 'Current value unavailable'} | {issue.recommendedRange ?? 'See recommendation'}
                                    </Text>
                                </div>
                                <Badge color={getSeverityColor(issue.severity)} variant="light">
                                    {getSeverityLabel(issue.severity)}
                                </Badge>
                            </Group>
                            <Text size="xs" mt={6}>{issue.description}</Text>
                            {issue.evidence ? (
                                <Text size="xs" c="dimmed" mt={4}>Why: {issue.evidence}</Text>
                            ) : null}
                            {issue.recommendation ? (
                                <Text size="xs" mt={4}>Fix: {issue.recommendation}</Text>
                            ) : null}
                        </Paper>
                    ))}
                    {onApplyValues && Object.keys(qualityCoach.mergedOverrides).length > 0 ? (
                        <SwarmButton
                            size="sm"
                            tone="secondary"
                            emphasis="soft"
                            onClick={() => {
                                onApplyValues(qualityCoach.mergedOverrides);
                                onClose?.();
                            }}
                        >
                            Apply All Suggested Fixes
                        </SwarmButton>
                    ) : null}
                </Stack>
            ) : (
                <Paper p="sm" radius="md" style={{ border: '1px solid var(--mantine-color-invokeGray-7)' }}>
                    <Text size="sm" fw={600}>Current settings look balanced.</Text>
                    <Text size="xs" c="dimmed" mt={4}>
                        No high-confidence warnings right now. Expand the reference sections below to understand why.
                    </Text>
                </Paper>
            )}

            {/* Learn More accordion */}
            <Accordion multiple variant="separated">
                <Accordion.Item value="matrix">
                    <Accordion.Control>
                        <Text fw={600} size="sm">CFG × Steps Interaction Matrix</Text>
                    </Accordion.Control>
                    <Accordion.Panel>
                        <Stack gap="sm">
                            <Text size="xs" c="dimmed">
                                CFG controls guidance strength and steps control denoising iterations. The highlighted cell shows where your current settings land.
                            </Text>
                            <SimpleGrid cols={3} spacing="sm">
                                {QUALITY_COACH_MATRIX.map((cell) => {
                                    const isCurrent =
                                        cell.cfgBand === getMatrixBandForCfg(currentCfg) &&
                                        cell.stepsBand === getMatrixBandForSteps(currentSteps);
                                    return (
                                        <Paper
                                            key={`${cell.stepsBand}-${cell.cfgBand}`}
                                            p="sm"
                                            radius="md"
                                            style={{
                                                border: isCurrent
                                                    ? `2px solid var(--mantine-color-${getSeverityColor(cell.severity)}-6)`
                                                    : '1px solid var(--mantine-color-invokeGray-7)',
                                                boxShadow: isCurrent ? '0 0 0 1px rgba(255,255,255,0.05)' : undefined,
                                            }}
                                        >
                                            <Group justify="space-between" align="flex-start" wrap="wrap" gap="xs">
                                                <Text fw={600} size="sm">{cell.title}</Text>
                                                <Badge color={getSeverityColor(cell.severity)} variant="light">
                                                    {getSeverityLabel(cell.severity)}
                                                </Badge>
                                            </Group>
                                            <Text size="xs" c="dimmed" mt={4}>
                                                {cell.stepsBand.toUpperCase()} steps × {cell.cfgBand.toUpperCase()} CFG
                                            </Text>
                                            <Text size="xs" mt={6}>{cell.description}</Text>
                                        </Paper>
                                    );
                                })}
                            </SimpleGrid>
                            <Paper p="sm" radius="md" style={{ border: '1px solid var(--mantine-color-invokeGray-7)' }}>
                                <Text size="sm" fw={600}>Current cell: {matrixCell.title}</Text>
                                <Text size="xs" mt={4}>{matrixCell.description}</Text>
                            </Paper>
                        </Stack>
                    </Accordion.Panel>
                </Accordion.Item>

                <Accordion.Item value="diagnose">
                    <Accordion.Control>
                        <Text fw={600} size="sm">Diagnose a Problem</Text>
                    </Accordion.Control>
                    <Accordion.Panel>
                        <Stack gap="sm">
                            <Text size="xs" c="dimmed">
                                Tick the symptoms that match what you are seeing. The coach will map them to the most likely failure modes and fixes.
                            </Text>
                            <Checkbox.Group value={selectedSymptoms} onChange={setSelectedSymptoms}>
                                <SimpleGrid cols={2} spacing="xs">
                                    {QUALITY_COACH_DIAGNOSTIC_SYMPTOMS.map((symptom) => (
                                        <SwarmCheckbox key={symptom.id} value={symptom.id} label={symptom.label} visual="squishy" />
                                    ))}
                                </SimpleGrid>
                            </Checkbox.Group>
                            {matchedFailures.length > 0 ? (
                                <Stack gap="sm">
                                    {matchedFailures.slice(0, 4).map((failure) => (
                                        <Paper key={failure.id} p="sm" radius="md" style={{ border: '1px solid var(--mantine-color-invokeGray-7)' }}>
                                            <Group justify="space-between" align="flex-start" wrap="wrap" gap="xs">
                                                <div>
                                                    <Text fw={600} size="sm">{failure.name}</Text>
                                                    <Text size="xs" c="dimmed">{failure.whatItMeans}</Text>
                                                </div>
                                                <Badge color={getSeverityColor(failure.severity)} variant="light">
                                                    Match {failure.matchCount}
                                                </Badge>
                                            </Group>
                                            <Text size="xs" mt={6}>Likely causes: {failure.likelyCauses.join(', ')}</Text>
                                            <Text size="xs" c="dimmed" mt={4}>Suggested fix: {failure.fix}</Text>
                                        </Paper>
                                    ))}
                                </Stack>
                            ) : (
                                <Text size="xs" c="dimmed">
                                    No symptoms selected yet. Try choosing terms like overbaked, mushy, washed out, or double head.
                                </Text>
                            )}
                        </Stack>
                    </Accordion.Panel>
                </Accordion.Item>

                <Accordion.Item value="recipes">
                    <Accordion.Control>
                        <Text fw={600} size="sm">Recipe Cards</Text>
                    </Accordion.Control>
                    <Accordion.Panel>
                        <Stack gap="sm">
                            <Text size="xs" c="dimmed">
                                Quick-start parameter sets for common goals. Safe launch points rather than absolute rules.
                            </Text>
                            {recipes.map((recipe) => (
                                <Paper key={recipe.id} p="sm" radius="md" style={{ border: '1px solid var(--mantine-color-invokeGray-7)' }}>
                                    <Group justify="space-between" align="flex-start" wrap="wrap" gap="xs">
                                        <div>
                                            <Text fw={600} size="sm">{recipe.name}</Text>
                                            <Text size="xs" c="dimmed">{recipe.goal}</Text>
                                        </div>
                                        <Badge color="blue" variant="light">
                                            {getLearningLevelLabel(recipe.difficulty)}
                                        </Badge>
                                    </Group>
                                    <Text size="xs" mt={6}>{recipe.notes}</Text>
                                    <Text size="xs" c="dimmed" mt={4}>
                                        CFG {recipe.params.cfgscale ?? '-'} | Steps {recipe.params.steps ?? '-'} | Sampler {recipe.params.sampler ?? '-'} | Size {recipe.params.width ?? '-'}x{recipe.params.height ?? '-'}
                                    </Text>
                                    {onApplyValues ? (
                                        <SwarmButton
                                            size="xs"
                                            tone="secondary"
                                            emphasis="soft"
                                            mt="sm"
                                            onClick={() => {
                                                onApplyValues(recipe.params);
                                                onClose?.();
                                            }}
                                        >
                                            Apply Recipe
                                        </SwarmButton>
                                    ) : null}
                                </Paper>
                            ))}
                        </Stack>
                    </Accordion.Panel>
                </Accordion.Item>

                <Accordion.Item value="gallery">
                    <Accordion.Control>
                        <Text fw={600} size="sm">Failure Mode Gallery</Text>
                    </Accordion.Control>
                    <Accordion.Panel>
                        <Stack gap="sm">
                            <Text size="xs" c="dimmed">
                                Community-style labels for broken generations, connected to likely parameter causes and fixes.
                            </Text>
                            {failureModes.map((mode) => (
                                <Paper key={mode.id} p="sm" radius="md" style={{ border: '1px solid var(--mantine-color-invokeGray-7)' }}>
                                    <Group justify="space-between" align="flex-start" wrap="wrap" gap="xs">
                                        <div>
                                            <Text fw={600} size="sm">{mode.term}</Text>
                                            <Text size="xs" c="dimmed">{mode.whatItMeans}</Text>
                                        </div>
                                        <Badge color={getSeverityColor(mode.severity)} variant="light">
                                            {getSeverityLabel(mode.severity)}
                                        </Badge>
                                    </Group>
                                    <Text size="xs" mt={6}>Typical causes: {mode.likelyCauses.join(', ')}</Text>
                                    <Text size="xs" c="dimmed" mt={4}>Fix: {mode.fix}</Text>
                                </Paper>
                            ))}
                        </Stack>
                    </Accordion.Panel>
                </Accordion.Item>

                <Accordion.Item value="deep-dives">
                    <Accordion.Control>
                        <Text fw={600} size="sm">Parameter Deep Dives</Text>
                    </Accordion.Control>
                    <Accordion.Panel>
                        <Stack gap="sm">
                            <Accordion multiple defaultValue={guides.slice(0, 2).map((guide) => guide.key)}>
                                {guides.map((guide) => (
                                    <Accordion.Item key={guide.key} value={guide.key}>
                                        <Accordion.Control>
                                            <Group justify="space-between" wrap="wrap" gap="xs">
                                                <div>
                                                    <Text fw={600} size="sm">{guide.title}</Text>
                                                    <Text size="xs" c="dimmed">{guide.expandedName}</Text>
                                                </div>
                                                <Badge color="gray" variant="outline">
                                                    {getLearningLevelLabel(guide.difficulty)}
                                                </Badge>
                                            </Group>
                                        </Accordion.Control>
                                        <Accordion.Panel>
                                            <Stack gap="sm">
                                                <Text size="xs">{guide.description}</Text>
                                                <Text size="xs">{guide.typicalRange}</Text>
                                                <Text size="xs">{guide.sweetSpot}</Text>
                                                <Text size="xs">{guide.defaultStartingPoint}</Text>
                                                {guide.aliases?.length ? (
                                                    <Text size="xs" c="dimmed">Aliases: {guide.aliases.join(', ')}</Text>
                                                ) : null}
                                                <Divider />
                                                <Stack gap="xs">
                                                    {guide.effects.map((effect) => (
                                                        <Paper key={effect.range} p="xs" radius="sm" style={{ border: '1px solid var(--mantine-color-invokeGray-7)' }}>
                                                            <Text fw={600} size="xs">{effect.range}</Text>
                                                            <Text size="xs" mt={4}>{effect.visualResult}</Text>
                                                        </Paper>
                                                    ))}
                                                </Stack>
                                                <List size="xs" spacing="xs">
                                                    {guide.teachingPoints.map((point) => (
                                                        <List.Item key={point}>{point}</List.Item>
                                                    ))}
                                                </List>
                                            </Stack>
                                        </Accordion.Panel>
                                    </Accordion.Item>
                                ))}
                            </Accordion>
                        </Stack>
                    </Accordion.Panel>
                </Accordion.Item>

                <Accordion.Item value="glossary">
                    <Accordion.Control>
                        <Text fw={600} size="sm">Glossary</Text>
                    </Accordion.Control>
                    <Accordion.Panel>
                        <Stack gap="xs">
                            {QUALITY_COACH_GLOSSARY.map((item) => (
                                <Box key={item.term}>
                                    <Text size="xs" fw={600}>{item.term}</Text>
                                    <Text size="xs" c="dimmed">
                                        {item.meaning} Typical cause: {item.typicalCause}
                                    </Text>
                                </Box>
                            ))}
                        </Stack>
                    </Accordion.Panel>
                </Accordion.Item>
            </Accordion>
        </Stack>
    );
}
