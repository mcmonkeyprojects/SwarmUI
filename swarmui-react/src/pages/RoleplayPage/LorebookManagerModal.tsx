import { useEffect, useMemo, useState } from 'react';
import {
  ActionIcon,
  Badge,
  Divider,
  Grid,
  Group,
  Modal,
  NumberInput,
  ScrollArea,
  Select,
  Stack,
  Switch,
  TagsInput,
  Text,
  TextInput,
  Textarea,
  Tooltip,
} from '@mantine/core';
import {
  IconArrowDown,
  IconArrowUp,
  IconPlus,
  IconTrash,
} from '@tabler/icons-react';
import { useShallow } from 'zustand/react/shallow';
import { ElevatedCard } from '../../components/ui/ElevatedCard';
import { SwarmButton } from '../../components/ui/SwarmButton';
import { useRoleplayStore } from '../../stores/roleplayStore';
import type {
  RoleplayLorebook,
  RoleplayLoreActivationLogic,
  RoleplayLorebookEntry,
  RoleplayLorebookEntryMode,
  RoleplayLoreInsertionPosition,
  RoleplayLoreKeywordMode,
} from '../../types/roleplay';

interface LorebookManagerModalProps {
  opened: boolean;
  onClose: () => void;
}

interface LorebookDraft {
  name: string;
  description: string;
  global: boolean;
  entries: RoleplayLorebookEntry[];
}

function lorebookToDraft(lorebook: RoleplayLorebook): LorebookDraft {
  return {
    name: lorebook.name,
    description: lorebook.description,
    global: lorebook.global,
    entries: lorebook.entries.map((entry) => ({
      ...entry,
      keywords: [...entry.keywords],
      secondaryKeywords: [...entry.secondaryKeywords],
      negativeKeywords: [...entry.negativeKeywords],
    })),
  };
}

function emptyDraft(): LorebookDraft {
  return { name: '', description: '', global: false, entries: [] };
}

function createEmptyEntry(): RoleplayLorebookEntry {
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    title: '',
    content: '',
    keywords: [],
    secondaryKeywords: [],
    negativeKeywords: [],
    mode: 'keyword',
    keywordMode: 'plain',
    activationLogic: 'any',
    selective: false,
    caseSensitive: false,
    scanDepth: 4,
    insertionOrder: 100,
    insertionPosition: 'before-history',
    insertionDepth: 4,
    tokenBudget: 220,
    recursive: false,
    enabled: true,
    createdAt: now,
    updatedAt: now,
  };
}

const ENTRY_MODE_OPTIONS: Array<{ value: RoleplayLorebookEntryMode; label: string }> = [
  { value: 'keyword', label: 'Keyword triggered' },
  { value: 'always-on', label: 'Always on' },
];
const KEYWORD_MODE_OPTIONS: Array<{ value: RoleplayLoreKeywordMode; label: string }> = [
  { value: 'plain', label: 'Plain text' },
  { value: 'regex', label: 'Regex' },
];
const ACTIVATION_LOGIC_OPTIONS: Array<{ value: RoleplayLoreActivationLogic; label: string }> = [
  { value: 'any', label: 'Any keyword' },
  { value: 'all', label: 'All keywords' },
];
const INSERTION_POSITION_OPTIONS: Array<{ value: RoleplayLoreInsertionPosition; label: string }> = [
  { value: 'before-history', label: 'Before history' },
  { value: 'in-history', label: 'In history depth' },
  { value: 'after-history', label: 'After history' },
];

/**
 * Modal for managing lorebooks and their entries.
 */
export function LorebookManagerModal({ opened, onClose }: LorebookManagerModalProps) {
  const { lorebooks, addLorebook, updateLorebook, removeLorebook } = useRoleplayStore(
    useShallow((s) => ({
      lorebooks: s.lorebooks,
      addLorebook: s.addLorebook,
      updateLorebook: s.updateLorebook,
      removeLorebook: s.removeLorebook,
    }))
  );

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<LorebookDraft>(emptyDraft);
  const [isNew, setIsNew] = useState(false);
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);

  // Sync selection when modal opens or lorebooks change.
  useEffect(() => {
    if (!opened) return;
    if (selectedId && lorebooks.some((book) => book.id === selectedId)) return;
    const fallback = lorebooks[0]?.id ?? null;
    queueMicrotask(() => {
      setSelectedId(fallback);
      setIsNew(false);
    });
  }, [opened, lorebooks, selectedId]);

  // Sync draft when selection changes (unless editing a new draft).
  useEffect(() => {
    if (isNew) return;
    const lorebook = lorebooks.find((item) => item.id === selectedId) ?? null;
    const nextDraft = lorebook ? lorebookToDraft(lorebook) : emptyDraft();
    queueMicrotask(() => {
      setDraft(nextDraft);
      setSelectedEntryId(nextDraft.entries[0]?.id ?? null);
    });
  }, [selectedId, lorebooks, isNew]);

  const existingLorebook = isNew
    ? null
    : lorebooks.find((book) => book.id === selectedId) ?? null;

  const isDirty = useMemo(() => {
    if (isNew) return draft.name.trim().length > 0 || draft.entries.length > 0;
    if (!existingLorebook) return false;
    const current = lorebookToDraft(existingLorebook);
    if (current.name !== draft.name) return true;
    if (current.description !== draft.description) return true;
    if (current.global !== draft.global) return true;
    if (current.entries.length !== draft.entries.length) return true;
    for (let index = 0; index < current.entries.length; index += 1) {
      const a = current.entries[index];
      const b = draft.entries[index];
      if (
        a.id !== b.id ||
        a.title !== b.title ||
        a.content !== b.content ||
        a.mode !== b.mode ||
        a.keywordMode !== b.keywordMode ||
        a.activationLogic !== b.activationLogic ||
        a.selective !== b.selective ||
        a.caseSensitive !== b.caseSensitive ||
        a.scanDepth !== b.scanDepth ||
        a.insertionOrder !== b.insertionOrder ||
        a.insertionPosition !== b.insertionPosition ||
        a.tokenBudget !== b.tokenBudget ||
        a.enabled !== b.enabled ||
        a.keywords.join('|') !== b.keywords.join('|') ||
        a.secondaryKeywords.join('|') !== b.secondaryKeywords.join('|') ||
        a.negativeKeywords.join('|') !== b.negativeKeywords.join('|') ||
        a.insertionDepth !== b.insertionDepth ||
        a.recursive !== b.recursive
      ) {
        return true;
      }
    }
    return false;
  }, [draft, existingLorebook, isNew]);

  const selectedEntry = useMemo(
    () => draft.entries.find((entry) => entry.id === selectedEntryId) ?? null,
    [draft.entries, selectedEntryId]
  );

  const updateEntry = (entryId: string, updates: Partial<RoleplayLorebookEntry>) => {
    setDraft((prev) => ({
      ...prev,
      entries: prev.entries.map((entry) =>
        entry.id === entryId ? { ...entry, ...updates, updatedAt: Date.now() } : entry
      ),
    }));
  };

  const handleNewLorebook = () => {
    setIsNew(true);
    setSelectedId(null);
    setDraft(emptyDraft());
    setSelectedEntryId(null);
  };

  const handleSelectLorebook = (id: string) => {
    setIsNew(false);
    setSelectedId(id);
  };

  const handleAddEntry = () => {
    const entry = createEmptyEntry();
    setDraft((prev) => ({ ...prev, entries: [...prev.entries, entry] }));
    setSelectedEntryId(entry.id);
  };

  const handleDeleteEntry = (entryId: string) => {
    setDraft((prev) => {
      const nextEntries = prev.entries.filter((entry) => entry.id !== entryId);
      return { ...prev, entries: nextEntries };
    });
    setSelectedEntryId((current) => (current === entryId ? null : current));
  };

  const handleMoveEntry = (entryId: string, direction: -1 | 1) => {
    setDraft((prev) => {
      const index = prev.entries.findIndex((entry) => entry.id === entryId);
      if (index === -1) return prev;
      const target = index + direction;
      if (target < 0 || target >= prev.entries.length) return prev;
      const nextEntries = [...prev.entries];
      const [moved] = nextEntries.splice(index, 1);
      nextEntries.splice(target, 0, moved);
      return { ...prev, entries: nextEntries };
    });
  };

  const handleSave = () => {
    const name = draft.name.trim();
    if (!name) return;
    const now = Date.now();
    const payload = {
      name,
      description: draft.description,
      global: draft.global,
      entries: draft.entries,
      updatedAt: now,
    };
    if (isNew) {
      const id = crypto.randomUUID();
      addLorebook({ id, createdAt: now, ...payload });
      setIsNew(false);
      setSelectedId(id);
    } else if (selectedId) {
      updateLorebook(selectedId, payload);
    }
  };

  const handleDeleteLorebook = () => {
    if (!selectedId || isNew) return;
    removeLorebook(selectedId);
    setSelectedId(null);
  };

  const handleRevert = () => {
    if (isNew) {
      setIsNew(false);
      setSelectedId(lorebooks[0]?.id ?? null);
      return;
    }
    if (existingLorebook) {
      const next = lorebookToDraft(existingLorebook);
      setDraft(next);
      setSelectedEntryId(next.entries[0]?.id ?? null);
    }
  };

  return (
    <Modal opened={opened} onClose={onClose} title="Lorebook Manager" size="90%">
      <Grid gap="md">
        <Grid.Col span={{ base: 12, sm: 4 }}>
          <Stack gap="xs">
            <Group justify="space-between">
              <Text size="sm" fw={600}>
                Lorebooks
              </Text>
              <Tooltip label="New lorebook">
                <ActionIcon variant="subtle" onClick={handleNewLorebook}>
                  <IconPlus size={14} />
                </ActionIcon>
              </Tooltip>
            </Group>
            <ScrollArea h={520}>
              <Stack gap="xs">
                {lorebooks.length === 0 && !isNew && (
                  <Text size="xs" c="dimmed">
                    No lorebooks yet. Create one to start adding entries.
                  </Text>
                )}
                {lorebooks.map((lorebook) => {
                  const isActive = !isNew && lorebook.id === selectedId;
                  return (
                    <ElevatedCard
                      key={lorebook.id}
                      elevation={isActive ? 'raised' : 'paper'}
                      tone={isActive ? 'brand' : 'neutral'}
                      interactive
                      onClick={() => handleSelectLorebook(lorebook.id)}
                    >
                      <Stack gap={2}>
                        <Text size="sm" fw={600} truncate>
                          {lorebook.name}
                        </Text>
                        <Text size="xs" c="dimmed">
                          {lorebook.entries.length}{' '}
                          {lorebook.entries.length === 1 ? 'entry' : 'entries'}
                        </Text>
                      </Stack>
                    </ElevatedCard>
                  );
                })}
                {isNew && (
                  <ElevatedCard elevation="raised" tone="brand">
                    <Text size="sm" fw={600}>
                      {draft.name.trim() || 'New lorebook'}
                    </Text>
                    <Text size="xs" c="dimmed">
                      Unsaved
                    </Text>
                  </ElevatedCard>
                )}
              </Stack>
            </ScrollArea>
          </Stack>
        </Grid.Col>

        <Grid.Col span={{ base: 12, sm: 8 }}>
          {isNew || existingLorebook ? (
            <Stack gap="sm">
              <TextInput
                label="Name"
                required
                value={draft.name}
                onChange={(event) =>
                  setDraft((prev) => ({ ...prev, name: event.currentTarget.value }))
                }
              />
              <Textarea
                label="Description"
                minRows={2}
                autosize
                value={draft.description}
                onChange={(event) =>
                  setDraft((prev) => ({ ...prev, description: event.currentTarget.value }))
                }
              />
              <Switch
                label="Global lorebook"
                description="Global lorebooks are scanned for every roleplay chat without binding them to a character, persona, or session."
                checked={draft.global}
                onChange={(event) =>
                  setDraft((prev) => ({ ...prev, global: event.currentTarget.checked }))
                }
              />

              <Divider label="Entries" labelPosition="left" />

              <Grid gap="sm">
                <Grid.Col span={{ base: 12, sm: 5 }}>
                  <Stack gap="xs">
                    <Group justify="space-between">
                      <Text size="xs" fw={600}>
                        {draft.entries.length} entries
                      </Text>
                      <Tooltip label="Add entry">
                        <ActionIcon variant="subtle" size="sm" onClick={handleAddEntry}>
                          <IconPlus size={12} />
                        </ActionIcon>
                      </Tooltip>
                    </Group>
                    <ScrollArea h={280}>
                      <Stack gap="xs">
                        {draft.entries.length === 0 && (
                          <Text size="xs" c="dimmed">
                            No entries yet.
                          </Text>
                        )}
                        {draft.entries.map((entry, index) => {
                          const isActive = entry.id === selectedEntryId;
                          return (
                            <ElevatedCard
                              key={entry.id}
                              elevation={isActive ? 'raised' : 'paper'}
                              tone={isActive ? 'brand' : 'neutral'}
                              interactive
                              onClick={() => setSelectedEntryId(entry.id)}
                            >
                              <Group justify="space-between" wrap="nowrap">
                                <Stack gap={2} style={{ minWidth: 0, flex: 1 }}>
                                  <Text size="xs" fw={600} truncate>
                                    {entry.title || 'Untitled entry'}
                                  </Text>
                                  <Group gap={4}>
                                    <Badge size="xs" variant="light">
                                      {entry.mode === 'always-on' ? 'always' : 'keyword'}
                                    </Badge>
                                    {!entry.enabled && (
                                      <Badge size="xs" color="gray" variant="outline">
                                        disabled
                                      </Badge>
                                    )}
                                  </Group>
                                </Stack>
                                <Group gap={0} wrap="nowrap">
                                  <ActionIcon
                                    variant="subtle"
                                    size="xs"
                                    disabled={index === 0}
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      handleMoveEntry(entry.id, -1);
                                    }}
                                  >
                                    <IconArrowUp size={11} />
                                  </ActionIcon>
                                  <ActionIcon
                                    variant="subtle"
                                    size="xs"
                                    disabled={index === draft.entries.length - 1}
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      handleMoveEntry(entry.id, 1);
                                    }}
                                  >
                                    <IconArrowDown size={11} />
                                  </ActionIcon>
                                  <ActionIcon
                                    variant="subtle"
                                    size="xs"
                                    color="red"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      handleDeleteEntry(entry.id);
                                    }}
                                  >
                                    <IconTrash size={11} />
                                  </ActionIcon>
                                </Group>
                              </Group>
                            </ElevatedCard>
                          );
                        })}
                      </Stack>
                    </ScrollArea>
                  </Stack>
                </Grid.Col>

                <Grid.Col span={{ base: 12, sm: 7 }}>
                  {selectedEntry ? (
                    <Stack gap="xs">
                      <TextInput
                        label="Title"
                        value={selectedEntry.title}
                        onChange={(event) =>
                          updateEntry(selectedEntry.id, { title: event.currentTarget.value })
                        }
                      />
                      <Select
                        label="Mode"
                        data={ENTRY_MODE_OPTIONS}
                        value={selectedEntry.mode}
                        onChange={(value) =>
                          value &&
                          updateEntry(selectedEntry.id, {
                            mode: value as RoleplayLorebookEntryMode,
                          })
                        }
                        allowDeselect={false}
                      />
                      <TagsInput
                        label="Keywords"
                        description="Triggers entry when any keyword is found in recent messages."
                        value={selectedEntry.keywords}
                        onChange={(value) => updateEntry(selectedEntry.id, { keywords: value })}
                        disabled={selectedEntry.mode === 'always-on'}
                      />
                      <TagsInput
                        label="Secondary Keywords"
                        description="Used when selective activation is enabled."
                        value={selectedEntry.secondaryKeywords}
                        onChange={(value) =>
                          updateEntry(selectedEntry.id, { secondaryKeywords: value })
                        }
                        disabled={selectedEntry.mode === 'always-on'}
                      />
                      <TagsInput
                        label="Negative Keywords"
                        description="Prevents activation when any negative keyword is found."
                        value={selectedEntry.negativeKeywords}
                        onChange={(value) =>
                          updateEntry(selectedEntry.id, { negativeKeywords: value })
                        }
                      />
                      <Grid gap="xs">
                        <Grid.Col span={{ base: 12, sm: 6 }}>
                          <Select
                            label="Keyword Mode"
                            data={KEYWORD_MODE_OPTIONS}
                            value={selectedEntry.keywordMode}
                            onChange={(value) =>
                              value &&
                              updateEntry(selectedEntry.id, {
                                keywordMode: value as RoleplayLoreKeywordMode,
                              })
                            }
                            allowDeselect={false}
                            disabled={selectedEntry.mode === 'always-on'}
                          />
                        </Grid.Col>
                        <Grid.Col span={{ base: 12, sm: 6 }}>
                          <Select
                            label="Match Logic"
                            data={ACTIVATION_LOGIC_OPTIONS}
                            value={selectedEntry.activationLogic}
                            onChange={(value) =>
                              value &&
                              updateEntry(selectedEntry.id, {
                                activationLogic: value as RoleplayLoreActivationLogic,
                              })
                            }
                            allowDeselect={false}
                            disabled={selectedEntry.mode === 'always-on'}
                          />
                        </Grid.Col>
                        <Grid.Col span={{ base: 12, sm: 6 }}>
                          <Select
                            label="Insertion"
                            data={INSERTION_POSITION_OPTIONS}
                            value={selectedEntry.insertionPosition}
                            onChange={(value) =>
                              value &&
                              updateEntry(selectedEntry.id, {
                                insertionPosition: value as RoleplayLoreInsertionPosition,
                              })
                            }
                            allowDeselect={false}
                          />
                        </Grid.Col>
                        <Grid.Col span={{ base: 12, sm: 6 }}>
                          <NumberInput
                            label="Order"
                            min={0}
                            value={selectedEntry.insertionOrder}
                            onChange={(value) =>
                              updateEntry(selectedEntry.id, {
                                insertionOrder:
                                  typeof value === 'number' ? value : selectedEntry.insertionOrder,
                              })
                            }
                          />
                        </Grid.Col>
                        <Grid.Col span={{ base: 12, sm: 6 }}>
                          <NumberInput
                            label="History Depth"
                            description="Used when insertion is set to in-history."
                            min={0}
                            value={selectedEntry.insertionDepth}
                            onChange={(value) =>
                              updateEntry(selectedEntry.id, {
                                insertionDepth:
                                  typeof value === 'number' ? value : selectedEntry.insertionDepth,
                              })
                            }
                          />
                        </Grid.Col>
                        <Grid.Col span={{ base: 12, sm: 6 }}>
                          <NumberInput
                            label="Scan Depth"
                            min={0}
                            value={selectedEntry.scanDepth}
                            onChange={(value) =>
                              updateEntry(selectedEntry.id, {
                                scanDepth:
                                  typeof value === 'number' ? value : selectedEntry.scanDepth,
                              })
                            }
                            disabled={selectedEntry.mode === 'always-on'}
                          />
                        </Grid.Col>
                        <Grid.Col span={{ base: 12, sm: 6 }}>
                          <NumberInput
                            label="Token Budget"
                            min={0}
                            value={selectedEntry.tokenBudget ?? 0}
                            onChange={(value) =>
                              updateEntry(selectedEntry.id, {
                                tokenBudget:
                                  typeof value === 'number' && value > 0 ? value : null,
                              })
                            }
                          />
                        </Grid.Col>
                      </Grid>
                      <Textarea
                        label="Content"
                        description="The lore text injected into the prompt when this entry activates."
                        minRows={6}
                        autosize
                        value={selectedEntry.content}
                        onChange={(event) =>
                          updateEntry(selectedEntry.id, { content: event.currentTarget.value })
                        }
                      />
                      <Switch
                        label="Selective secondary filter"
                        checked={selectedEntry.selective}
                        onChange={(event) =>
                          updateEntry(selectedEntry.id, {
                            selective: event.currentTarget.checked,
                          })
                        }
                      />
                      <Switch
                        label="Case sensitive"
                        checked={selectedEntry.caseSensitive}
                        onChange={(event) =>
                          updateEntry(selectedEntry.id, {
                            caseSensitive: event.currentTarget.checked,
                          })
                        }
                        disabled={selectedEntry.mode === 'always-on'}
                      />
                      <Switch
                        label="Recursive activation source"
                        description="Activated content can trigger later recursive lore passes."
                        checked={selectedEntry.recursive}
                        onChange={(event) =>
                          updateEntry(selectedEntry.id, {
                            recursive: event.currentTarget.checked,
                          })
                        }
                      />
                      <Switch
                        label="Enabled"
                        checked={selectedEntry.enabled}
                        onChange={(event) =>
                          updateEntry(selectedEntry.id, {
                            enabled: event.currentTarget.checked,
                          })
                        }
                      />
                    </Stack>
                  ) : (
                    <Stack align="center" justify="center" h={280}>
                      <Text size="xs" c="dimmed">
                        Select an entry to edit, or add a new one.
                      </Text>
                    </Stack>
                  )}
                </Grid.Col>
              </Grid>

              <Divider />

              <Group justify="space-between" wrap="wrap" gap="xs">
                <Group gap="xs">
                  <SwarmButton
                    tone="brand"
                    emphasis="solid"
                    onClick={handleSave}
                    disabled={!draft.name.trim() || !isDirty}
                  >
                    {isNew ? 'Create' : 'Save'}
                  </SwarmButton>
                  {isDirty && (
                    <SwarmButton emphasis="ghost" onClick={handleRevert}>
                      Revert
                    </SwarmButton>
                  )}
                </Group>
                {!isNew && (
                  <Tooltip label="Delete lorebook">
                    <ActionIcon variant="subtle" color="red" onClick={handleDeleteLorebook}>
                      <IconTrash size={14} />
                    </ActionIcon>
                  </Tooltip>
                )}
              </Group>
            </Stack>
          ) : (
            <Stack align="center" justify="center" h={520}>
              <Text size="sm" c="dimmed">
                Select a lorebook or create a new one.
              </Text>
            </Stack>
          )}
        </Grid.Col>
      </Grid>
    </Modal>
  );
}
