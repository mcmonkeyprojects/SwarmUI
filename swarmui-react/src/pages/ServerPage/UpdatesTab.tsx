import { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  Badge,
  Card,
  Center,
  Checkbox,
  Code,
  Collapse,
  Divider,
  Group,
  Loader,
  Modal,
  SimpleGrid,
  Stack,
  Table,
  Text,
  ThemeIcon,
} from '@mantine/core';
import {
  IconAlertTriangle,
  IconCheck,
  IconChevronDown,
  IconChevronRight,
  IconGitBranch,
  IconRefresh,
  IconRotateClockwise,
} from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { swarmClient } from '../../api/client';
import type {
  RepoUpdateStatus,
  UpdateAndRestartResponse,
  UpdateCheckResponse,
} from '../../api/types';
import { useSessionStore } from '../../stores/session';
import { SwarmButton } from '../../components/ui';

type RepoGroup = 'core' | 'extension' | 'backend';

interface GroupedRepo {
  group: RepoGroup;
  repo: RepoUpdateStatus;
}

function repoKey(item: GroupedRepo): string {
  return `${item.group}:${item.repo.name}:${item.repo.current_commit}:${item.repo.upstream}`;
}

function repoGroupLabel(group: RepoGroup): string {
  if (group == 'core') {
    return 'Core';
  }
  if (group == 'extension') {
    return 'Extension';
  }
  return 'Comfy / Backend';
}

function repoGroupColor(group: RepoGroup): string {
  if (group == 'core') {
    return 'blue';
  }
  if (group == 'extension') {
    return 'teal';
  }
  return 'violet';
}

function isSkippedRepo(repo: RepoUpdateStatus): boolean {
  return repo.warnings.some((warning) => warning.includes(': skipped.'));
}

function repoBlockers(repo: RepoUpdateStatus): string[] {
  if (isSkippedRepo(repo)) {
    return [];
  }
  const blockers: string[] = [];
  if (repo.has_local_changes) {
    blockers.push('Local working tree changes');
  }
  if (repo.is_detached) {
    blockers.push('Detached HEAD');
  }
  if (repo.is_diverged) {
    blockers.push('Diverged history');
  }
  if (!repo.upstream) {
    blockers.push('No remote update target');
  }
  if (repo.has_updates && !repo.can_fast_forward) {
    blockers.push('Cannot fast-forward safely');
  }
  if (!repo.has_updates && repo.warnings.length > 0 && !repo.can_auto_update) {
    blockers.push('Safety warnings require manual review');
  }
  return blockers;
}

function safetyTone(repo: RepoUpdateStatus): { color: string; label: string } {
  if (isSkippedRepo(repo)) {
    return { color: 'gray', label: 'Skipped' };
  }
  const blockers = repoBlockers(repo);
  if (blockers.length > 0) {
    return { color: 'red', label: 'Blocked' };
  }
  if (repo.has_updates) {
    return { color: 'green', label: 'Safe fast-forward' };
  }
  if (repo.warnings.length > 0) {
    return { color: 'yellow', label: 'Review' };
  }
  return { color: 'gray', label: 'Up to date' };
}

function commitCountFor(repo: RepoUpdateStatus): number {
  if (repo.behind_count > 0) {
    return repo.behind_count;
  }
  return repo.update_details.length;
}

function formatResult(data: unknown): string {
  if (typeof data == 'string') {
    return data;
  }
  try {
    return JSON.stringify(data, null, 2);
  } catch {
    return String(data);
  }
}

function buildGroupedRepos(preview: UpdateCheckResponse | null): GroupedRepo[] {
  if (!preview) {
    return [];
  }
  const repos: GroupedRepo[] = [];
  if (preview.server_repo) {
    repos.push({ group: 'core', repo: preview.server_repo });
  }
  for (const repo of preview.extension_repos || []) {
    repos.push({ group: 'extension', repo });
  }
  for (const repo of preview.backend_repos || []) {
    repos.push({ group: 'backend', repo });
  }
  return repos;
}

interface RepoRowProps {
  item: GroupedRepo;
}

function RepoRow({ item }: RepoRowProps) {
  const [open, setOpen] = useState(false);
  const tone = safetyTone(item.repo);
  const blockers = repoBlockers(item.repo);
  const hasDetails = item.repo.update_details.length > 0
    || item.repo.local_changes_preview.length > 0
    || item.repo.warnings.length > 0
    || blockers.length > 0;

  return (
    <>
      <Table.Tr>
        <Table.Td>
          <Group gap="xs" wrap="nowrap">
            <SwarmButton
              tone="secondary"
              emphasis="ghost"
              size="compact-xs"
              px={6}
              disabled={!hasDetails}
              onClick={() => setOpen((value) => !value)}
            >
              {open ? <IconChevronDown size={14} /> : <IconChevronRight size={14} />}
            </SwarmButton>
            <Stack gap={2}>
              <Text size="sm" fw={600}>{item.repo.name}</Text>
              <Group gap={6}>
                <Badge size="xs" color={repoGroupColor(item.group)} variant="light">
                  {repoGroupLabel(item.group)}
                </Badge>
                <Text size="xs" c="dimmed">{item.repo.current_commit || 'unknown'}</Text>
              </Group>
            </Stack>
          </Group>
        </Table.Td>
        <Table.Td>
          <Stack gap={2}>
            <Text size="sm">{item.repo.branch || 'unknown'}</Text>
            <Text size="xs" c="dimmed">{item.repo.upstream || 'not configured'}</Text>
          </Stack>
        </Table.Td>
        <Table.Td>
          <Text size="sm">{item.repo.ahead_count} / {item.repo.behind_count}</Text>
        </Table.Td>
        <Table.Td>
          <Badge color={tone.color} variant="light">{tone.label}</Badge>
        </Table.Td>
        <Table.Td>
          <Text size="sm">{commitCountFor(item.repo)}</Text>
        </Table.Td>
      </Table.Tr>
      {open && (
        <Table.Tr>
          <Table.Td colSpan={5}>
            <Stack gap="xs">
              {blockers.length > 0 && (
                <Alert color="red" icon={<IconAlertTriangle size={16} />}>
                  {blockers.join(' | ')}
                </Alert>
              )}
              {item.repo.warnings.length > 0 && (
                <Stack gap={4}>
                  <Text size="xs" fw={700}>Warnings</Text>
                  <Code block>{item.repo.warnings.join('\n')}</Code>
                </Stack>
              )}
              {item.repo.local_changes_preview.length > 0 && (
                <Stack gap={4}>
                  <Text size="xs" fw={700}>Local Changes</Text>
                  <Code block>{item.repo.local_changes_preview.join('\n')}</Code>
                </Stack>
              )}
              {item.repo.update_details.length > 0 && (
                <Stack gap={4}>
                  <Text size="xs" fw={700}>Incoming Commits</Text>
                  <Code block>
                    {item.repo.update_details
                      .map((commit) => `${commit.date_utc} ${commit.short_commit} ${commit.subject}`)
                      .join('\n')}
                  </Code>
                </Stack>
              )}
            </Stack>
          </Table.Td>
        </Table.Tr>
      )}
    </>
  );
}

export function UpdatesTab() {
  const isInitialized = useSessionStore((s) => s.isInitialized);
  const [preview, setPreview] = useState<UpdateCheckResponse | null>(null);
  const [lastResult, setLastResult] = useState('');
  const [checking, setChecking] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [updateExtensions, setUpdateExtensions] = useState(false);
  const [updateBackends, setUpdateBackends] = useState(false);
  const [forceRestart, setForceRestart] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const repos = useMemo(() => buildGroupedRepos(preview), [preview]);
  const selectedRepos = useMemo(() => repos.filter((item) => {
    if (item.group == 'extension' && !updateExtensions) {
      return false;
    }
    if (item.group == 'backend' && !updateBackends) {
      return false;
    }
    return item.group == 'core' || item.group == 'extension' || item.group == 'backend';
  }), [repos, updateBackends, updateExtensions]);
  const selectedReposWithUpdates = selectedRepos.filter((item) => item.repo.has_updates);
  const selectedBlockers = selectedRepos
    .flatMap((item) => repoBlockers(item.repo).map((blocker) => `${item.repo.name}: ${blocker}`));
  const selectedCommitCount = selectedReposWithUpdates.reduce((sum, item) => sum + commitCountFor(item.repo), 0);
  const canUpdate = !!preview && selectedBlockers.length == 0 && (selectedCommitCount > 0 || forceRestart);

  const checkForUpdates = useCallback(async () => {
    setChecking(true);
    try {
      const response = await swarmClient.checkForUpdates();
      setPreview(response);
      setLastResult(formatResult(response));
      notifications.show({
        title: 'Update preview loaded',
        message: `${response.server_updates_count} core commit(s), ${response.extension_updates.length} extension(s), ${response.backend_updates.length} backend repo(s).`,
        color: 'green',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      notifications.show({ title: 'Update check failed', message, color: 'red' });
    } finally {
      setChecking(false);
    }
  }, []);

  const runUpdate = useCallback(async () => {
    setUpdating(true);
    try {
      const extensionsToUpdate = selectedReposWithUpdates
        .filter((item) => item.group == 'extension')
        .map((item) => item.repo.name);
      const backendsToUpdate = selectedReposWithUpdates
        .filter((item) => item.group == 'backend')
        .map((item) => item.repo.name);
      const doUpdateServer = selectedReposWithUpdates.some((item) => item.group == 'core');
      const response: UpdateAndRestartResponse = await swarmClient.updateAndRestart({
        updateExtensions,
        updateBackends,
        extensionsToUpdate,
        backendsToUpdate,
        doUpdateServer,
        force: forceRestart,
      });
      setLastResult(formatResult(response));
      if (response.error) {
        notifications.show({ title: 'Update blocked', message: response.error, color: 'red' });
      } else if (response.success) {
        notifications.show({
          title: 'Update accepted',
          message: response.result || 'Restart requested.',
          color: 'green',
        });
      } else {
        notifications.show({
          title: 'No update applied',
          message: response.result || 'No changes found.',
          color: 'yellow',
        });
      }
      setConfirmOpen(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      notifications.show({ title: 'Update failed', message, color: 'red' });
    } finally {
      setUpdating(false);
    }
  }, [forceRestart, selectedReposWithUpdates, updateBackends, updateExtensions]);

  if (!isInitialized) {
    return (
      <Center h={300}>
        <Loader size="lg" />
      </Center>
    );
  }

  return (
    <Stack gap="md" className="swarm-server-section">
      <Card withBorder padding="md" className="surface-glass swarm-server-card">
        <Stack gap="md">
          <Group justify="space-between" align="flex-start">
            <Stack gap={4}>
              <Text fw={700}>Update Manager</Text>
              <Text size="sm" c="dimmed">
                Preview and apply clean fast-forward updates for SwarmUI, extensions, and supported Comfy/backend repos.
              </Text>
            </Stack>
            <SwarmButton
              tone="secondary"
              leftSection={<IconRefresh size={16} />}
              loading={checking}
              onClick={checkForUpdates}
            >
              Check for updates
            </SwarmButton>
          </Group>

          <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="sm">
            <Card withBorder padding="sm">
              <Group gap="xs">
                <ThemeIcon variant="light" color="blue"><IconGitBranch size={16} /></ThemeIcon>
                <Stack gap={0}>
                  <Text size="xs" c="dimmed">Core commits</Text>
                  <Text fw={700}>{preview?.server_updates_count ?? '-'}</Text>
                </Stack>
              </Group>
            </Card>
            <Card withBorder padding="sm">
              <Group gap="xs">
                <ThemeIcon variant="light" color="teal"><IconGitBranch size={16} /></ThemeIcon>
                <Stack gap={0}>
                  <Text size="xs" c="dimmed">Extensions with updates</Text>
                  <Text fw={700}>{preview?.extension_updates.length ?? '-'}</Text>
                </Stack>
              </Group>
            </Card>
            <Card withBorder padding="sm">
              <Group gap="xs">
                <ThemeIcon variant="light" color="violet"><IconGitBranch size={16} /></ThemeIcon>
                <Stack gap={0}>
                  <Text size="xs" c="dimmed">Backend repos with updates</Text>
                  <Text fw={700}>{preview?.backend_updates.length ?? '-'}</Text>
                </Stack>
              </Group>
            </Card>
          </SimpleGrid>

          <Group className="swarm-admin-toggles">
            <Checkbox
              label="Update extensions"
              checked={updateExtensions}
              onChange={(event) => setUpdateExtensions(event.currentTarget.checked)}
            />
            <Checkbox
              label="Update Comfy/backend repos"
              checked={updateBackends}
              onChange={(event) => setUpdateBackends(event.currentTarget.checked)}
            />
            <Checkbox
              label="Force restart"
              checked={forceRestart}
              onChange={(event) => setForceRestart(event.currentTarget.checked)}
            />
          </Group>

          {preview?.warnings && preview.warnings.length > 0 && (
            <Alert color="yellow" icon={<IconAlertTriangle size={16} />}>
              <Stack gap={2}>
                <Text size="sm" fw={700}>Update preview warnings</Text>
                {preview.warnings.slice(0, 6).map((warning) => (
                  <Text size="xs" key={warning}>{warning}</Text>
                ))}
              </Stack>
            </Alert>
          )}

          {selectedBlockers.length > 0 && (
            <Alert color="red" icon={<IconAlertTriangle size={16} />}>
              <Stack gap={2}>
                <Text size="sm" fw={700}>Selected update scope is blocked.</Text>
                {selectedBlockers.slice(0, 6).map((blocker) => (
                  <Text size="xs" key={blocker}>{blocker}</Text>
                ))}
              </Stack>
            </Alert>
          )}

          <Group justify="flex-end">
            <SwarmButton
              tone="danger"
              leftSection={<IconRotateClockwise size={16} />}
              disabled={!canUpdate}
              loading={updating}
              onClick={() => setConfirmOpen(true)}
            >
              Update and restart
            </SwarmButton>
          </Group>
        </Stack>
      </Card>

      <Card withBorder padding="md" className="surface-glass swarm-server-card">
        <Stack gap="sm">
          <Group justify="space-between">
            <Text fw={700}>Repository Preview</Text>
            {preview?.checked_at_utc && <Badge variant="light">Checked {preview.checked_at_utc}</Badge>}
          </Group>
          {repos.length == 0 ? (
            <Text size="sm" c="dimmed">Run an update check to load repository details.</Text>
          ) : (
            <Table.ScrollContainer minWidth={820}>
              <Table striped highlightOnHover verticalSpacing="sm">
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Repository</Table.Th>
                    <Table.Th>Branch / Upstream</Table.Th>
                    <Table.Th>Ahead / Behind</Table.Th>
                    <Table.Th>Safety</Table.Th>
                    <Table.Th>Commits</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {repos.map((item) => <RepoRow key={repoKey(item)} item={item} />)}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
          )}
        </Stack>
      </Card>

      <Collapse in={!!lastResult}>
        <Card withBorder padding="sm" className="surface-glass swarm-server-card">
          <Stack gap="xs">
            <Text size="sm" fw={600}>Last Update API Result</Text>
            <Code block className="swarm-server-code">{lastResult}</Code>
          </Stack>
        </Card>
      </Collapse>

      <Modal
        opened={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Confirm update and restart"
        size="lg"
      >
        <Stack gap="sm">
          <Alert color={selectedBlockers.length > 0 ? 'red' : 'yellow'} icon={<IconAlertTriangle size={16} />}>
            SwarmUI will apply only clean fast-forward updates, then request a server restart.
          </Alert>
          <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="sm">
            <Card withBorder padding="sm">
              <Text size="xs" c="dimmed">Repositories to update</Text>
              <Text fw={700}>{selectedReposWithUpdates.length}</Text>
            </Card>
            <Card withBorder padding="sm">
              <Text size="xs" c="dimmed">Incoming commits</Text>
              <Text fw={700}>{selectedCommitCount}</Text>
            </Card>
            <Card withBorder padding="sm">
              <Text size="xs" c="dimmed">Force restart</Text>
              <Text fw={700}>{forceRestart ? 'Yes' : 'No'}</Text>
            </Card>
          </SimpleGrid>
          <Divider />
          <Stack gap={4}>
            {selectedReposWithUpdates.length == 0 ? (
              <Text size="sm" c="dimmed">No selected repositories have updates.</Text>
            ) : selectedReposWithUpdates.map((item) => (
              <Group key={repoKey(item)} justify="space-between">
                <Group gap="xs">
                  <IconCheck size={16} color="var(--theme-success)" />
                  <Text size="sm">{item.repo.name}</Text>
                  <Badge size="xs" color={repoGroupColor(item.group)} variant="light">
                    {repoGroupLabel(item.group)}
                  </Badge>
                </Group>
                <Text size="sm" c="dimmed">{commitCountFor(item.repo)} commit(s)</Text>
              </Group>
            ))}
          </Stack>
          <Group justify="flex-end" mt="md">
            <SwarmButton tone="secondary" onClick={() => setConfirmOpen(false)}>
              Cancel
            </SwarmButton>
            <SwarmButton
              tone="danger"
              loading={updating}
              disabled={!canUpdate}
              onClick={runUpdate}
            >
              Update and restart
            </SwarmButton>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
