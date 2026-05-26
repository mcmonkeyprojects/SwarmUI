import { useState, useEffect, useCallback } from 'react';
import {
    Stack,
    Group,
    Text,
    PasswordInput,
    Card,
    Loader,
    Center,
    Divider,
} from '@mantine/core';
import { IconKey, IconShield, IconUser } from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { swarmClient } from '../../api/client';
import { useSessionStore } from '../../stores/session';
import { SwarmButton } from '../../components/ui';

const API_KEY_TYPES = [
    { id: 'stability_api', label: 'Stability AI', description: 'For Stable Diffusion API access' },
    { id: 'civitai_api', label: 'CivitAI', description: 'For CivitAI model downloads' },
    { id: 'huggingface_api', label: 'HuggingFace', description: 'For HuggingFace model access' },
];

function PasswordChangeSection() {
    const [oldPassword, setOldPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [loading, setLoading] = useState(false);

    const handleChangePassword = async () => {
        if (newPassword !== confirmPassword) {
            notifications.show({ title: 'Error', message: 'Passwords do not match', color: 'red' });
            return;
        }
        if (newPassword.length < 1) {
            notifications.show({ title: 'Error', message: 'New password cannot be empty', color: 'red' });
            return;
        }
        setLoading(true);
        try {
            const response = await swarmClient.changePassword(oldPassword, newPassword);
            if (response.error) {
                notifications.show({ title: 'Error', message: response.error, color: 'red' });
            } else {
                notifications.show({ title: 'Success', message: 'Password changed successfully', color: 'green' });
                setOldPassword('');
                setNewPassword('');
                setConfirmPassword('');
            }
        } catch {
            notifications.show({ title: 'Error', message: 'Failed to change password', color: 'red' });
        } finally {
            setLoading(false);
        }
    };

    return (
        <Card withBorder padding="md" className="surface-glass swarm-server-card">
            <Stack gap="sm">
                <Group gap="xs">
                    <IconShield size={18} />
                    <Text fw={600}>Change Password</Text>
                </Group>
                <PasswordInput
                    label="Current Password"
                    value={oldPassword}
                    onChange={(e) => setOldPassword(e.currentTarget.value)}
                    placeholder="Enter current password"
                />
                <PasswordInput
                    label="New Password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.currentTarget.value)}
                    placeholder="Enter new password"
                />
                <PasswordInput
                    label="Confirm New Password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.currentTarget.value)}
                    placeholder="Confirm new password"
                    error={confirmPassword && newPassword !== confirmPassword ? 'Passwords do not match' : undefined}
                />
                <Group justify="flex-end">
                    <SwarmButton
                        tone="brand"
                        loading={loading}
                        onClick={handleChangePassword}
                        disabled={!oldPassword || !newPassword || newPassword !== confirmPassword}
                    >
                        Change Password
                    </SwarmButton>
                </Group>
            </Stack>
        </Card>
    );
}

function APIKeySection({ keyType, label, description }: { keyType: string; label: string; description: string }) {
    const [status, setStatus] = useState<string>('');
    const [keyValue, setKeyValue] = useState('');
    const [loading, setLoading] = useState(false);
    const [statusLoading, setStatusLoading] = useState(true);

    const loadStatus = useCallback(async () => {
        setStatusLoading(true);
        try {
            const result = await swarmClient.getAPIKeyStatus(keyType);
            setStatus(result.status || 'not set');
        } catch {
            setStatus('unknown');
        } finally {
            setStatusLoading(false);
        }
    }, [keyType]);

    useEffect(() => {
        queueMicrotask(() => {
            loadStatus();
        });
    }, [loadStatus]);

    const handleSave = async () => {
        if (!keyValue.trim()) return;
        setLoading(true);
        try {
            const response = await swarmClient.setAPIKey(keyType, keyValue.trim());
            if (response.error) {
                notifications.show({ title: 'Error', message: response.error, color: 'red' });
            } else {
                notifications.show({ title: 'Saved', message: `${label} API key updated`, color: 'green' });
                setKeyValue('');
                loadStatus();
            }
        } catch {
            notifications.show({ title: 'Error', message: `Failed to save ${label} API key`, color: 'red' });
        } finally {
            setLoading(false);
        }
    };

    return (
        <Card withBorder padding="sm" className="surface-glass swarm-server-card">
            <Group justify="space-between" wrap="nowrap">
                <Stack gap={2} style={{ flex: 1, minWidth: 0 }}>
                    <Group gap="xs">
                        <IconKey size={14} />
                        <Text size="sm" fw={600}>{label}</Text>
                    </Group>
                    <Text size="xs" c="dimmed">{description}</Text>
                    <Text size="xs" c="dimmed">
                        Status: {statusLoading ? '...' : status}
                    </Text>
                </Stack>
                <Group gap="xs" wrap="nowrap">
                    <PasswordInput
                        placeholder={`Enter ${label} key`}
                        value={keyValue}
                        onChange={(e) => setKeyValue(e.currentTarget.value)}
                        w="clamp(180px, 22vw, 320px)"
                        size="xs"
                    />
                    <SwarmButton
                        tone="brand"
                        size="xs"
                        loading={loading}
                        onClick={handleSave}
                        disabled={!keyValue.trim()}
                    >
                        Save
                    </SwarmButton>
                </Group>
            </Group>
        </Card>
    );
}

export function AccountTab() {
    const isInitialized = useSessionStore((s) => s.isInitialized);
    const sessionId = useSessionStore((s) => s.sessionId);
    const userId = useSessionStore((s) => s.userId);

    if (!isInitialized) {
        return <Center h={300}><Loader size="lg" /></Center>;
    }

    return (
        <Stack gap="lg" maw={760} className="swarm-server-section">
            {/* User Info */}
            <Card withBorder padding="md" className="surface-glass swarm-server-card">
                <Stack gap="xs">
                    <Group gap="xs">
                        <IconUser size={18} />
                        <Text fw={600}>User Info</Text>
                    </Group>
                    {userId && <Text size="sm">User: <strong>{userId}</strong></Text>}
                    {sessionId && <Text size="xs" c="dimmed">Session: {sessionId.substring(0, 12)}...</Text>}
                </Stack>
            </Card>

            {/* Password */}
            <PasswordChangeSection />

            <Divider label="API Keys" labelPosition="center" />

            {/* API Keys */}
            <Stack gap="sm">
                {API_KEY_TYPES.map((keyInfo) => (
                    <APIKeySection
                        key={keyInfo.id}
                        keyType={keyInfo.id}
                        label={keyInfo.label}
                        description={keyInfo.description}
                    />
                ))}
            </Stack>
        </Stack>
    );
}
