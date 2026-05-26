import { SegmentedControl, Stack, Text } from '@mantine/core';
import type { VideoWorkflow } from './videoModelProfiles';

/**
 * Determines initial workflow state from the current init image preview.
 * Exported for testing.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function resolveInitialWorkflow(initImagePreview: string | null): VideoWorkflow {
    return initImagePreview ? 'i2v' : 't2v';
}

interface VideoWorkflowToggleProps {
    workflow: VideoWorkflow;
    onChange: (workflow: VideoWorkflow) => void;
}

export function VideoWorkflowToggle({ workflow, onChange }: VideoWorkflowToggleProps) {
    return (
        <Stack gap="xs">
            <SegmentedControl
                value={workflow}
                onChange={(value) => onChange(value as VideoWorkflow)}
                data={[
                    { value: 't2v', label: 'Text-to-Video' },
                    { value: 'i2v', label: 'Image-to-Video' },
                ]}
                fullWidth
                size="sm"
            />
            {workflow === 'i2v' && (
                <Text size="xs" c="invokeGray.3">
                    Upload an init image below to animate it.
                </Text>
            )}
            {workflow === 't2v' && (
                <Text size="xs" c="invokeGray.3">
                    Describe the video content in your prompt.
                </Text>
            )}
        </Stack>
    );
}
