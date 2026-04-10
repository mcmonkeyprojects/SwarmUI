import { useState } from 'react';
import {
    Modal,
    Stack,
    Group,
    TextInput,
    SegmentedControl,
    Text,
    Badge,
    Paper,
    Divider,
    TagsInput,
} from '@mantine/core';
import {
    IconClock,
    IconFlag,
    IconTag,
} from '@tabler/icons-react';
import type { GenerateParams } from '../api/types';
import type { JobPriority } from '../stores/queue';
import { SwarmButton as Button } from './ui';

interface ScheduleJobModalProps {
    opened: boolean;
    onClose: () => void;
    onSchedule: (options: {
        name?: string;
        scheduledAt?: number;
        priority: JobPriority;
        tags?: string[];
        addToQueue: boolean;
    }) => void;
    params: GenerateParams;
}

export function ScheduleJobModal({
    opened,
    onClose,
    onSchedule,
    params,
}: ScheduleJobModalProps) {
    const [name, setName] = useState('');
    const [scheduledDateTime, setScheduledDateTime] = useState('');
    const [priority, setPriority] = useState<JobPriority>('normal');
    const [tags, setTags] = useState<string[]>([]);
    const [scheduleMode, setScheduleMode] = useState<'now' | 'scheduled'>('now');

    const handleSubmit = () => {
        let scheduledAt: number | undefined;
        if (scheduleMode === 'scheduled' && scheduledDateTime) {
            scheduledAt = new Date(scheduledDateTime).getTime();
        }

        onSchedule({
            name: name || undefined,
            scheduledAt,
            priority,
            tags: tags.length > 0 ? tags : undefined,
            addToQueue: true,
        });
        // Reset form
        setName('');
        setScheduledDateTime('');
        setPriority('normal');
        setTags([]);
        setScheduleMode('now');
        onClose();
    };

    const priorityColors: Record<JobPriority, string> = {
        low: 'gray',
        normal: 'blue',
        high: 'orange',
        urgent: 'red',
    };

    // Get min datetime for the input (current time)
    const getMinDateTime = () => {
        const now = new Date();
        now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
        return now.toISOString().slice(0, 16);
    };

    // Parse scheduled date for display
    const getScheduledDisplay = () => {
        if (!scheduledDateTime) return null;
        return new Date(scheduledDateTime).toLocaleString();
    };

    return (
        <Modal
            opened={opened}
            onClose={onClose}
            title="Add to Queue"
            size="md"
            centered
        >
            <Stack gap="md">
                {/* Job Name */}
                <TextInput
                    label="Job Name (optional)"
                    placeholder="My generation job"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    leftSection={<IconTag size={16} />}
                />

                {/* Priority */}
                <div>
                    <Text size="sm" fw={500} mb={4}>
                        Priority
                    </Text>
                    <SegmentedControl
                        fullWidth
                        value={priority}
                        onChange={(v) => setPriority(v as JobPriority)}
                        data={[
                            { label: 'Low', value: 'low' },
                            { label: 'Normal', value: 'normal' },
                            { label: 'High', value: 'high' },
                            { label: 'Urgent', value: 'urgent' },
                        ]}
                        color={priorityColors[priority]}
                    />
                </div>

                {/* Schedule Mode */}
                <div>
                    <Text size="sm" fw={500} mb={4}>
                        When to Run
                    </Text>
                    <SegmentedControl
                        fullWidth
                        value={scheduleMode}
                        onChange={(v) => setScheduleMode(v as 'now' | 'scheduled')}
                        data={[
                            { label: 'Add to Queue Now', value: 'now' },
                            { label: 'Schedule for Later', value: 'scheduled' },
                        ]}
                    />
                </div>

                {/* Date/Time Picker (conditional) */}
                {scheduleMode === 'scheduled' && (
                    <TextInput
                        label="Scheduled Time"
                        type="datetime-local"
                        value={scheduledDateTime}
                        onChange={(e) => setScheduledDateTime(e.target.value)}
                        min={getMinDateTime()}
                        leftSection={<IconClock size={16} />}
                    />
                )}

                {/* Tags */}
                <TagsInput
                    label="Tags (optional)"
                    placeholder="Add tags for organization"
                    value={tags}
                    onChange={setTags}
                />

                <Divider />

                {/* Summary */}
                <Paper p="sm" withBorder>
                    <Text size="sm" c="dimmed" mb="xs">
                        Job Summary
                    </Text>
                    <Group gap="xs">
                        <Badge color={priorityColors[priority]} leftSection={<IconFlag size={12} />}>
                            {priority}
                        </Badge>
                        {scheduleMode === 'scheduled' && scheduledDateTime && (
                            <Badge color="cyan" leftSection={<IconClock size={12} />}>
                                {getScheduledDisplay()}
                            </Badge>
                        )}
                        {tags.map((tag) => (
                            <Badge key={tag} variant="outline" size="sm">
                                {tag}
                            </Badge>
                        ))}
                    </Group>
                    <Text size="xs" c="dimmed" mt="xs">
                        Model: {params.model?.split('/').pop() || 'Default'}
                    </Text>
                    <Text size="xs" c="dimmed">
                        Size: {params.width}x{params.height} | Steps: {params.steps}
                    </Text>
                </Paper>

                {/* Actions */}
                <Group justify="flex-end" gap="sm">
                    <Button variant="default" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button
                        onClick={handleSubmit}
                        disabled={scheduleMode === 'scheduled' && !scheduledDateTime}
                    >
                        {scheduleMode === 'scheduled' ? 'Schedule Job' : 'Add to Queue'}
                    </Button>
                </Group>
            </Stack>
        </Modal>
    );
}
