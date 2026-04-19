import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Accordion,
  Badge,
  Card,
  Center,
  Checkbox,
  Code,
  Group,
  Loader,
  NumberInput,
  Stack,
  Text,
  TextInput,
  Textarea,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { swarmClient } from '../../api/client';
import type {
  RepoUpdateStatus,
  UpdateAndRestartResponse,
  UpdateCheckResponse,
} from '../../api/types';
import { useSessionStore } from '../../stores/session';
import { SwarmButton } from '../../components/ui';

function stringifyResult(data: unknown): string {
  if (typeof data === 'string') {
    return data;
  }
  try {
    return JSON.stringify(data, null, 2);
  } catch {
    return String(data);
  }
}

function parseJsonInput(raw: string, fallback: Record<string, unknown> = {}): Record<string, unknown> {
  const text = raw.trim();
  if (!text) {
    return fallback;
  }
  const parsed = JSON.parse(text);
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    return parsed as Record<string, unknown>;
  }
  throw new Error('JSON must be an object');
}

function extractApiError(data: unknown): string | null {
  if (!data || typeof data !== 'object') {
    return null;
  }
  const maybeError = (data as { error?: unknown }).error;
  if (typeof maybeError === 'string' && maybeError.trim()) {
    return maybeError;
  }
  return null;
}

function formatRepoPreview(repo: RepoUpdateStatus | null | undefined): string {
  if (!repo) {
    return 'No repository status available.';
  }

  const lines: string[] = [];
  lines.push(repo.name);
  lines.push(`branch: ${repo.branch || '(unknown)'}`);
  lines.push(`upstream: ${repo.upstream || '(not configured)'}`);
  lines.push(`commit: ${repo.current_commit || '(unknown)'}${repo.upstream_commit ? ` -> ${repo.upstream_commit}` : ''}`);
  lines.push(`ahead/behind: ${repo.ahead_count}/${repo.behind_count}`);
  lines.push(`safe auto-update: ${repo.can_fast_forward ? 'yes' : repo.has_updates ? 'no' : 'not needed'}`);

  if (repo.local_changes_preview.length > 0) {
    lines.push('local changes:');
    for (const entry of repo.local_changes_preview) {
      lines.push(`  ${entry}`);
    }
  }

  if (repo.update_preview.length > 0) {
    lines.push('incoming commits:');
    for (const entry of repo.update_preview) {
      lines.push(`  ${entry}`);
    }
  }

  if (repo.warnings.length > 0) {
    lines.push('warnings:');
    for (const warning of repo.warnings) {
      lines.push(`  ${warning}`);
    }
  }

  return lines.join('\n');
}

function formatUpdatePreview(preview: UpdateCheckResponse | null): string {
  if (!preview) {
    return 'Run Check For Updates to load commit preview and safety diagnostics.';
  }

  const lines: string[] = [];
  lines.push(`Checked: ${preview.checked_at_utc || '(unknown time)'}`);
  lines.push(`SwarmUI updates: ${preview.server_updates_count}`);
  lines.push(`Extensions with updates: ${preview.extension_updates.length}`);
  lines.push(`Backend updates: ${preview.backend_updates.length}`);

  if (preview.warnings && preview.warnings.length > 0) {
    lines.push('Global warnings:');
    for (const warning of preview.warnings) {
      lines.push(`  ${warning}`);
    }
  }

  lines.push('');
  lines.push(formatRepoPreview(preview.server_repo));

  const extensionRepos = (preview.extension_repos || []).filter((repo) => repo.has_updates || repo.warnings.length > 0);
  if (extensionRepos.length > 0) {
    for (const repo of extensionRepos) {
      lines.push('');
      lines.push(formatRepoPreview(repo));
    }
  }

  return lines.join('\n').trim();
}

function buildUpdateConfirmMessage(
  preview: UpdateCheckResponse | null,
  updateExtensions: boolean,
  updateBackends: boolean,
  force: boolean
): string {
  const lines: string[] = ['Run UpdateAndRestart now?'];

  if (preview?.checked_at_utc) {
    lines.push(`Last preview: ${preview.checked_at_utc}`);
  }

  if (preview?.warnings && preview.warnings.length > 0) {
    lines.push('Preview warnings:');
    for (const warning of preview.warnings.slice(0, 4)) {
      lines.push(`- ${warning}`);
    }
  }

  if (updateExtensions) {
    lines.push('Selected extensions will be fast-forwarded when safe.');
  }

  if (updateBackends) {
    lines.push('Backend auto-update is not implemented yet and will be skipped.');
  }

  if (force) {
    lines.push('Force restart is enabled.');
  }

  return lines.join('\n');
}

export function AdminToolsTab() {
  const isInitialized = useSessionStore((s) => s.isInitialized);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [result, setResult] = useState<string>('');
  const [wsLog, setWsLog] = useState<string>('');
  const [updatePreview, setUpdatePreview] = useState<UpdateCheckResponse | null>(null);
  const socketsRef = useRef<WebSocket[]>([]);

  const [serverSettingsJson, setServerSettingsJson] = useState('{}');
  const [extensionName, setExtensionName] = useState('');
  const [updateExtensions, setUpdateExtensions] = useState(false);
  const [updateBackends, setUpdateBackends] = useState(false);
  const [forceUpdate, setForceUpdate] = useState(false);

  const [wildcardCard, setWildcardCard] = useState('');
  const [wildcardOptions, setWildcardOptions] = useState('');
  const [modelName, setModelName] = useState('');
  const [modelSubtype, setModelSubtype] = useState('Stable-Diffusion');
  const [promptFillInput, setPromptFillInput] = useState('');
  const [paramEditsJson, setParamEditsJson] = useState('{}');
  const [presetLinksJson, setPresetLinksJson] = useState('{}');

  const [languageCode, setLanguageCode] = useState('en');
  const [tokenizeText, setTokenizeText] = useState('');
  const [tokenizeTokenset, setTokenizeTokenset] = useState('clip');
  const [tokenizeSkipSyntax, setTokenizeSkipSyntax] = useState(false);
  const [tokenizeWeighting, setTokenizeWeighting] = useState(true);
  const [pickleType, setPickleType] = useState('Stable-Diffusion');
  const [pickleFp16, setPickleFp16] = useState(false);

  const [comfyFeatures, setComfyFeatures] = useState('');
  const [comfyBackendId, setComfyBackendId] = useState<number>(0);
  const [trtModel, setTrtModel] = useState('');
  const [trtAspect, setTrtAspect] = useState('1:1');
  const [trtAspectRange, setTrtAspectRange] = useState('1.0');
  const [trtOptBatch, setTrtOptBatch] = useState<number>(1);
  const [trtMaxBatch, setTrtMaxBatch] = useState<number>(4);
  const [loraBaseModel, setLoraBaseModel] = useState('');
  const [loraOtherModel, setLoraOtherModel] = useState('');
  const [loraRank, setLoraRank] = useState<number>(16);
  const [loraOutName, setLoraOutName] = useState('');

  useEffect(() => {
    return () => {
      socketsRef.current.forEach((socket) => {
        try {
          socket.close();
        } catch {
          // Ignore close failures during unmount cleanup.
        }
      });
      socketsRef.current = [];
    };
  }, []);

  const runAction = useCallback(async (name: string, fn: () => Promise<unknown>) => {
    setBusyAction(name);
    try {
      const data = await fn();
      setResult(stringifyResult(data));
      const apiError = extractApiError(data);
      if (apiError) {
        notifications.show({ title: 'Action failed', message: apiError, color: 'red' });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      notifications.show({ title: 'Action failed', message, color: 'red' });
    } finally {
      setBusyAction(null);
    }
  }, []);

  if (!isInitialized) {
    return (
      <Center h={300}>
        <Loader size="lg" />
      </Center>
    );
  }

  return (
    <Stack gap="md" className="swarm-server-section">
      <Accordion defaultValue={['server']} multiple className="swarm-server-accordion">
        <Accordion.Item value="server">
          <Accordion.Control>Server / Extensions / Updates</Accordion.Control>
          <Accordion.Panel>
            <Stack gap="sm">
              <Group>
                <SwarmButton
                  tone="secondary"
                  size="xs"
                  loading={busyAction === 'checkUpdates'}
                  onClick={() =>
                    runAction('checkUpdates', async () => {
                      const response = await swarmClient.checkForUpdates();
                      setUpdatePreview(response);
                      return response;
                    })
                  }
                >
                  Check For Updates
                </SwarmButton>
                <SwarmButton
                  tone="secondary"
                  size="xs"
                  loading={busyAction === 'listSettings'}
                  onClick={() =>
                    runAction('listSettings', async () => {
                      const response = await swarmClient.listServerSettings();
                      if ('settings' in response) {
                        setServerSettingsJson(stringifyResult(response.settings));
                      }
                      return response;
                    })
                  }
                >
                  Load Server Settings
                </SwarmButton>
                <SwarmButton
                  tone="secondary"
                  size="xs"
                  loading={busyAction === 'listUsers'}
                  onClick={() => runAction('listUsers', () => swarmClient.listConnectedUsers())}
                >
                  List Connected Users
                </SwarmButton>
              </Group>

              <Textarea
                label="Server settings JSON"
                value={serverSettingsJson}
                onChange={(e) => setServerSettingsJson(e.currentTarget.value)}
                minRows={4}
                maxRows={12}
                autosize
              />
              <SwarmButton
                tone="brand"
                size="xs"
                loading={busyAction === 'applySettings'}
                onClick={() =>
                  runAction('applySettings', async () => {
                    const settings = parseJsonInput(serverSettingsJson);
                    return swarmClient.changeServerSettings(settings);
                  })
                }
              >
                Apply Server Settings
              </SwarmButton>

              <Group grow>
                <TextInput
                  label="Extension name"
                  placeholder="example-extension"
                  value={extensionName}
                  onChange={(e) => setExtensionName(e.currentTarget.value)}
                />
              </Group>
              <Group>
                <SwarmButton
                  tone="brand"
                  size="xs"
                  loading={busyAction === 'installExtension'}
                  disabled={!extensionName.trim()}
                  onClick={() =>
                    runAction('installExtension', () => swarmClient.installExtension(extensionName.trim()))
                  }
                >
                  Install Extension
                </SwarmButton>
                <SwarmButton
                  tone="secondary"
                  size="xs"
                  loading={busyAction === 'updateExtension'}
                  disabled={!extensionName.trim()}
                  onClick={() =>
                    runAction('updateExtension', () => swarmClient.updateExtension(extensionName.trim()))
                  }
                >
                  Update Extension
                </SwarmButton>
                <SwarmButton
                  tone="danger"
                  emphasis="outline"
                  size="xs"
                  loading={busyAction === 'uninstallExtension'}
                  disabled={!extensionName.trim()}
                  onClick={() =>
                    runAction('uninstallExtension', () => swarmClient.uninstallExtension(extensionName.trim()))
                  }
                >
                  Uninstall Extension
                </SwarmButton>
              </Group>

              <Group className="swarm-admin-toggles">
                <Checkbox
                  label="Update Extensions"
                  checked={updateExtensions}
                  onChange={(e) => setUpdateExtensions(e.currentTarget.checked)}
                />
                <Checkbox
                  label="Update Backends (not yet supported)"
                  checked={updateBackends}
                  disabled
                  onChange={(e) => setUpdateBackends(e.currentTarget.checked)}
                />
                <Checkbox
                  label="Force Restart"
                  checked={forceUpdate}
                  onChange={(e) => setForceUpdate(e.currentTarget.checked)}
                />
                <SwarmButton
                  tone="danger"
                  size="xs"
                  loading={busyAction === 'updateAndRestart'}
                  onClick={async () => {
                    if (!window.confirm(buildUpdateConfirmMessage(updatePreview, updateExtensions, updateBackends, forceUpdate))) {
                      return;
                    }
                    setBusyAction('updateAndRestart');
                    try {
                      const response: UpdateAndRestartResponse = await swarmClient.updateAndRestart({
                        updateExtensions,
                        updateBackends,
                        force: forceUpdate,
                      });
                      setResult(stringifyResult(response));
                      if (response.error) {
                        notifications.show({ title: 'Update failed', message: response.error, color: 'red' });
                      } else if (response.success) {
                        notifications.show({
                          title: 'Update accepted',
                          message: response.result || 'Update scheduled successfully.',
                          color: 'green',
                        });
                      }
                    } catch (error) {
                      const message = error instanceof Error ? error.message : String(error);
                      notifications.show({ title: 'Update failed', message, color: 'red' });
                    } finally {
                      setBusyAction(null);
                    }
                  }}
                >
                  Update And Restart
                </SwarmButton>
              </Group>
              <Text size="xs" c="dimmed">
                SwarmUI core updates are supported here. Separate backend package auto-update is still pending, so that path is intentionally disabled.
              </Text>
            </Stack>
          </Accordion.Panel>
        </Accordion.Item>

        <Accordion.Item value="modelPreset">
          <Accordion.Control>Model / Preset Advanced</Accordion.Control>
          <Accordion.Panel>
            <Stack gap="sm">
              <Group grow>
                <TextInput
                  label="Wildcard card"
                  placeholder="animals/cats"
                  value={wildcardCard}
                  onChange={(e) => setWildcardCard(e.currentTarget.value)}
                />
              </Group>
              <Textarea
                label="Wildcard options"
                placeholder={'line1\nline2\nline3'}
                value={wildcardOptions}
                onChange={(e) => setWildcardOptions(e.currentTarget.value)}
                minRows={3}
                autosize
              />
              <Group>
                <SwarmButton
                  tone="brand"
                  size="xs"
                  loading={busyAction === 'editWildcard'}
                  disabled={!wildcardCard.trim()}
                  onClick={() =>
                    runAction('editWildcard', () =>
                      swarmClient.editWildcard({
                        card: wildcardCard.trim(),
                        options: wildcardOptions,
                      })
                    )
                  }
                >
                  Save Wildcard
                </SwarmButton>
                <SwarmButton
                  tone="danger"
                  emphasis="outline"
                  size="xs"
                  loading={busyAction === 'deleteWildcard'}
                  disabled={!wildcardCard.trim()}
                  onClick={() =>
                    runAction('deleteWildcard', () => swarmClient.deleteWildcard(wildcardCard.trim()))
                  }
                >
                  Delete Wildcard
                </SwarmButton>
              </Group>

              <Group grow>
                <TextInput
                  label="Model name"
                  placeholder="model.safetensors"
                  value={modelName}
                  onChange={(e) => setModelName(e.currentTarget.value)}
                />
                <TextInput
                  label="Model subtype"
                  value={modelSubtype}
                  onChange={(e) => setModelSubtype(e.currentTarget.value)}
                />
              </Group>
              <Group>
                <SwarmButton
                  tone="secondary"
                  size="xs"
                  loading={busyAction === 'modelHeaders'}
                  disabled={!modelName.trim()}
                  onClick={() =>
                    runAction('modelHeaders', () =>
                      swarmClient.getModelHeaders(modelName.trim(), modelSubtype.trim() || 'Stable-Diffusion')
                    )
                  }
                >
                  Get Model Headers
                </SwarmButton>
                <SwarmButton
                  tone="secondary"
                  size="xs"
                  loading={busyAction === 'modelHash'}
                  disabled={!modelName.trim()}
                  onClick={() =>
                    runAction('modelHash', () =>
                      swarmClient.getModelHash(modelName.trim(), modelSubtype.trim() || 'Stable-Diffusion')
                    )
                  }
                >
                  Get Model Hash
                </SwarmButton>
              </Group>

              <TextInput
                label="Prompt for TestPromptFill"
                value={promptFillInput}
                onChange={(e) => setPromptFillInput(e.currentTarget.value)}
              />
              <SwarmButton
                tone="secondary"
                size="xs"
                loading={busyAction === 'testPromptFill'}
                disabled={!promptFillInput.trim()}
                onClick={() => runAction('testPromptFill', () => swarmClient.testPromptFill(promptFillInput))}
              >
                Test Prompt Fill
              </SwarmButton>

              <Textarea
                label="Param edits JSON"
                value={paramEditsJson}
                onChange={(e) => setParamEditsJson(e.currentTarget.value)}
                minRows={3}
                autosize
              />
              <SwarmButton
                tone="brand"
                size="xs"
                loading={busyAction === 'setParamEdits'}
                onClick={() =>
                  runAction('setParamEdits', async () => {
                    const edits = parseJsonInput(paramEditsJson);
                    return swarmClient.setParamEdits(edits);
                  })
                }
              >
                Save Param Edits
              </SwarmButton>

              <Textarea
                label="Preset links JSON"
                value={presetLinksJson}
                onChange={(e) => setPresetLinksJson(e.currentTarget.value)}
                minRows={3}
                autosize
              />
              <SwarmButton
                tone="brand"
                size="xs"
                loading={busyAction === 'setPresetLinks'}
                onClick={() =>
                  runAction('setPresetLinks', async () => {
                    const links = parseJsonInput(presetLinksJson);
                    return swarmClient.setPresetLinks(links);
                  })
                }
              >
                Save Preset Links
              </SwarmButton>
            </Stack>
          </Accordion.Panel>
        </Accordion.Item>

        <Accordion.Item value="utility">
          <Accordion.Control>Utility / Locale / Tools</Accordion.Control>
          <Accordion.Panel>
            <Stack gap="sm">
              <Group grow>
                <TextInput
                  label="Language code"
                  value={languageCode}
                  onChange={(e) => setLanguageCode(e.currentTarget.value)}
                />
                <SwarmButton
                  tone="secondary"
                  size="xs"
                  loading={busyAction === 'getLanguage'}
                  onClick={() => runAction('getLanguage', () => swarmClient.getLanguage(languageCode.trim()))}
                >
                  Get Language
                </SwarmButton>
              </Group>

              <Textarea
                label="Tokenize text"
                value={tokenizeText}
                onChange={(e) => setTokenizeText(e.currentTarget.value)}
                minRows={3}
                autosize
              />
              <Group>
                <TextInput
                  label="Tokenset"
                  value={tokenizeTokenset}
                  onChange={(e) => setTokenizeTokenset(e.currentTarget.value)}
                />
                <Checkbox
                  label="Skip Prompt Syntax"
                  checked={tokenizeSkipSyntax}
                  onChange={(e) => setTokenizeSkipSyntax(e.currentTarget.checked)}
                />
                <Checkbox
                  label="Weighting"
                  checked={tokenizeWeighting}
                  onChange={(e) => setTokenizeWeighting(e.currentTarget.checked)}
                />
              </Group>
              <SwarmButton
                tone="secondary"
                size="xs"
                loading={busyAction === 'tokenizeInDetail'}
                disabled={!tokenizeText.trim()}
                onClick={() =>
                  runAction('tokenizeInDetail', () =>
                    swarmClient.tokenizeInDetail({
                      text: tokenizeText,
                      skipPromptSyntax: tokenizeSkipSyntax,
                      tokenset: tokenizeTokenset,
                      weighting: tokenizeWeighting,
                    })
                  )
                }
              >
                Tokenize In Detail
              </SwarmButton>

              <Group>
                <TextInput
                  label="Pickle model type"
                  value={pickleType}
                  onChange={(e) => setPickleType(e.currentTarget.value)}
                />
                <Checkbox
                  label="Convert to fp16"
                  checked={pickleFp16}
                  onChange={(e) => setPickleFp16(e.currentTarget.checked)}
                />
                <SwarmButton
                  tone="secondary"
                  size="xs"
                  loading={busyAction === 'pickle2SafeTensor'}
                  onClick={() =>
                    runAction('pickle2SafeTensor', () => swarmClient.pickle2SafeTensor(pickleType, pickleFp16))
                  }
                >
                  Run Pickle2SafeTensor
                </SwarmButton>
              </Group>

              <SwarmButton
                tone="danger"
                emphasis="outline"
                size="xs"
                loading={busyAction === 'wipeMetadata'}
                onClick={() => {
                  if (!window.confirm('Wipe metadata now? This can take a while.')) {
                    return;
                  }
                  runAction('wipeMetadata', () => swarmClient.wipeMetadata());
                }}
              >
                Wipe Metadata
              </SwarmButton>
            </Stack>
          </Accordion.Panel>
        </Accordion.Item>

        <Accordion.Item value="comfy">
          <Accordion.Control>Comfy Advanced Tools</Accordion.Control>
          <Accordion.Panel>
            <Stack gap="sm">
              <Group grow>
                <TextInput
                  label="Comfy features (comma-separated)"
                  value={comfyFeatures}
                  onChange={(e) => setComfyFeatures(e.currentTarget.value)}
                />
                <SwarmButton
                  tone="brand"
                  size="xs"
                  loading={busyAction === 'comfyInstallFeatures'}
                  disabled={!comfyFeatures.trim()}
                  onClick={() =>
                    runAction('comfyInstallFeatures', () => swarmClient.comfyInstallFeatures(comfyFeatures.trim()))
                  }
                >
                  Install Features
                </SwarmButton>
              </Group>

              <Group>
                <NumberInput
                  label="Comfy backend ID"
                  value={comfyBackendId}
                  onChange={(value) => setComfyBackendId(typeof value === 'number' ? value : 0)}
                  allowDecimal={false}
                />
                <SwarmButton
                  tone="secondary"
                  size="xs"
                  loading={busyAction === 'comfyNodeTypes'}
                  onClick={() =>
                    runAction('comfyNodeTypes', () => swarmClient.comfyGetNodeTypesForBackend(comfyBackendId))
                  }
                >
                  Get Node Types
                </SwarmButton>
                <SwarmButton
                  tone="secondary"
                  size="xs"
                  loading={busyAction === 'comfyEnsureRefreshable'}
                  onClick={() => runAction('comfyEnsureRefreshable', () => swarmClient.comfyEnsureRefreshable())}
                >
                  Ensure Refreshable
                </SwarmButton>
              </Group>

              <Card withBorder padding="sm" className="surface-glass swarm-server-card">
                <Stack gap="xs">
                  <Text size="sm" fw={600}>TensorRT Create (WebSocket)</Text>
                  <Group grow>
                    <TextInput
                      label="Model"
                      value={trtModel}
                      onChange={(e) => setTrtModel(e.currentTarget.value)}
                    />
                    <TextInput
                      label="Aspect"
                      value={trtAspect}
                      onChange={(e) => setTrtAspect(e.currentTarget.value)}
                    />
                    <TextInput
                      label="Aspect Range"
                      value={trtAspectRange}
                      onChange={(e) => setTrtAspectRange(e.currentTarget.value)}
                    />
                  </Group>
                  <Group>
                    <NumberInput
                      label="Optimal Batch"
                      value={trtOptBatch}
                      onChange={(v) => setTrtOptBatch(typeof v === 'number' ? v : 1)}
                      allowDecimal={false}
                      min={1}
                    />
                    <NumberInput
                      label="Max Batch"
                      value={trtMaxBatch}
                      onChange={(v) => setTrtMaxBatch(typeof v === 'number' ? v : 1)}
                      allowDecimal={false}
                      min={1}
                    />
                    <SwarmButton
                      tone="secondary"
                      size="xs"
                      onClick={() => {
                        if (!trtModel.trim()) {
                          notifications.show({ title: 'Missing model', message: 'TensorRT model is required', color: 'red' });
                          return;
                        }
                        setWsLog('');
                        const socket = swarmClient.doTensorRTCreate(
                          {
                            model: trtModel.trim(),
                            aspect: trtAspect.trim(),
                            aspectRange: trtAspectRange.trim(),
                            optBatch: trtOptBatch,
                            maxBatch: trtMaxBatch,
                          },
                          {
                            onMessage: (data) => setWsLog((prev) => `${prev}${stringifyResult(data)}\n`),
                            onError: (error) => setWsLog((prev) => `${prev}ERROR: ${error}\n`),
                            onComplete: () => setWsLog((prev) => `${prev}DONE\n`),
                          }
                        );
                        socketsRef.current.push(socket);
                      }}
                    >
                      Start TensorRT Create
                    </SwarmButton>
                  </Group>
                </Stack>
              </Card>

              <Card withBorder padding="sm" className="surface-glass swarm-server-card">
                <Stack gap="xs">
                  <Text size="sm" fw={600}>LoRA Extraction (WebSocket)</Text>
                  <Group grow>
                    <TextInput
                      label="Base Model"
                      value={loraBaseModel}
                      onChange={(e) => setLoraBaseModel(e.currentTarget.value)}
                    />
                    <TextInput
                      label="Other Model"
                      value={loraOtherModel}
                      onChange={(e) => setLoraOtherModel(e.currentTarget.value)}
                    />
                    <TextInput
                      label="Output Name"
                      value={loraOutName}
                      onChange={(e) => setLoraOutName(e.currentTarget.value)}
                    />
                  </Group>
                  <Group>
                    <NumberInput
                      label="Rank"
                      value={loraRank}
                      onChange={(v) => setLoraRank(typeof v === 'number' ? v : 16)}
                      allowDecimal={false}
                      min={1}
                      max={320}
                    />
                    <SwarmButton
                      tone="secondary"
                      size="xs"
                      onClick={() => {
                        if (!loraBaseModel.trim() || !loraOtherModel.trim() || !loraOutName.trim()) {
                          notifications.show({
                            title: 'Missing fields',
                            message: 'Base model, other model, and output name are required',
                            color: 'red',
                          });
                          return;
                        }
                        setWsLog('');
                        const socket = swarmClient.doLoraExtraction(
                          {
                            baseModel: loraBaseModel.trim(),
                            otherModel: loraOtherModel.trim(),
                            rank: loraRank,
                            outName: loraOutName.trim(),
                          },
                          {
                            onMessage: (data) => setWsLog((prev) => `${prev}${stringifyResult(data)}\n`),
                            onError: (error) => setWsLog((prev) => `${prev}ERROR: ${error}\n`),
                            onComplete: () => setWsLog((prev) => `${prev}DONE\n`),
                          }
                        );
                        socketsRef.current.push(socket);
                      }}
                    >
                      Start LoRA Extraction
                    </SwarmButton>
                  </Group>
                </Stack>
              </Card>
            </Stack>
          </Accordion.Panel>
        </Accordion.Item>
      </Accordion>

      <Card withBorder padding="sm" className="surface-glass swarm-server-card">
        <Stack gap="xs">
          <Group gap="xs">
            <Text size="sm" fw={600}>Update Preview</Text>
            {updatePreview && (
              <>
                <Badge color="blue" variant="light">{updatePreview.server_updates_count} core</Badge>
                <Badge color="teal" variant="light">{updatePreview.extension_updates.length} extensions</Badge>
                <Badge color={updatePreview.warnings?.length ? 'yellow' : 'gray'} variant="light">
                  {updatePreview.warnings?.length || 0} warnings
                </Badge>
              </>
            )}
          </Group>
          <Code block className="swarm-server-code">{formatUpdatePreview(updatePreview)}</Code>
        </Stack>
      </Card>

      <Card withBorder padding="sm" className="surface-glass swarm-server-card">
        <Stack gap="xs">
          <Text size="sm" fw={600}>Last API Result</Text>
          <Code block className="swarm-server-code">{result || 'No result yet.'}</Code>
        </Stack>
      </Card>

      <Card withBorder padding="sm" className="surface-glass swarm-server-card">
        <Stack gap="xs">
          <Text size="sm" fw={600}>WebSocket Log</Text>
          <Code block className="swarm-server-code">{wsLog || 'No WebSocket activity yet.'}</Code>
        </Stack>
      </Card>
    </Stack>
  );
}
