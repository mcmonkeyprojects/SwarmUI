import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Accordion,
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

export function AdminToolsTab() {
  const isInitialized = useSessionStore((s) => s.isInitialized);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [result, setResult] = useState<string>('');
  const [wsLog, setWsLog] = useState<string>('');
  const socketsRef = useRef<WebSocket[]>([]);

  const [serverSettingsJson, setServerSettingsJson] = useState('{}');
  const [extensionName, setExtensionName] = useState('');

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

              <Text size="xs" c="dimmed">
                Update checks and safe restart updates now live in the dedicated Updates tab.
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
