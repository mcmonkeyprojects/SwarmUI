import { useEffect, useMemo, useState } from 'react';
import {
  ActionIcon,
  Badge,
  Divider,
  Grid,
  Group,
  Modal,
  MultiSelect,
  ScrollArea,
  Stack,
  TagsInput,
  Text,
  TextInput,
  Textarea,
  Tooltip,
} from '@mantine/core';
import { IconPlus, IconStar, IconTrash } from '@tabler/icons-react';
import { useShallow } from 'zustand/react/shallow';
import { ElevatedCard } from '../../components/ui/ElevatedCard';
import { SwarmButton } from '../../components/ui/SwarmButton';
import {
  DEFAULT_PERSONA_ID,
  useRoleplayStore,
} from '../../stores/roleplayStore';
import type { RoleplayPersona } from '../../types/roleplay';

interface PersonaManagerModalProps {
  opened: boolean;
  onClose: () => void;
}

interface PersonaDraft {
  name: string;
  description: string;
  notes: string;
  avatar: string;
  tags: string[];
  boundLorebookIds: string[];
}

function personaToDraft(persona: RoleplayPersona): PersonaDraft {
  return {
    name: persona.name,
    description: persona.description,
    notes: persona.notes,
    avatar: persona.avatar ?? '',
    tags: [...persona.tags],
    boundLorebookIds: [...persona.boundLorebookIds],
  };
}

function emptyDraft(): PersonaDraft {
  return {
    name: '',
    description: '',
    notes: '',
    avatar: '',
    tags: [],
    boundLorebookIds: [],
  };
}

/**
 * Modal for managing user personas.
 * Provides full CRUD and active-session assignment.
 */
export function PersonaManagerModal({ opened, onClose }: PersonaManagerModalProps) {
  const {
    personas,
    lorebooks,
    activeSessionId,
    chatSessions,
    addPersona,
    updatePersona,
    removePersona,
    setSessionActivePersona,
  } = useRoleplayStore(
    useShallow((s) => ({
      personas: s.personas,
      lorebooks: s.lorebooks,
      activeSessionId: s.activeSessionId,
      chatSessions: s.chatSessions,
      addPersona: s.addPersona,
      updatePersona: s.updatePersona,
      removePersona: s.removePersona,
      setSessionActivePersona: s.setSessionActivePersona,
    }))
  );

  const activeSession = useMemo(
    () => chatSessions.find((session) => session.id === activeSessionId) ?? null,
    [chatSessions, activeSessionId]
  );

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<PersonaDraft>(emptyDraft);
  const [isNew, setIsNew] = useState(false);

  // Sync selection when modal opens or personas change.
  useEffect(() => {
    if (!opened) return;
    if (selectedId && personas.some((persona) => persona.id === selectedId)) return;
    const fallback = activeSession?.activePersonaId ?? personas[0]?.id ?? null;
    setSelectedId(fallback);
    setIsNew(false);
  }, [opened, personas, selectedId, activeSession]);

  // Sync draft when selection changes (unless editing a new draft).
  useEffect(() => {
    if (isNew) return;
    const persona = personas.find((item) => item.id === selectedId) ?? null;
    setDraft(persona ? personaToDraft(persona) : emptyDraft());
  }, [selectedId, personas, isNew]);

  const lorebookOptions = useMemo(
    () => lorebooks.map((lorebook) => ({ value: lorebook.id, label: lorebook.name })),
    [lorebooks]
  );

  const existingPersona = isNew
    ? null
    : personas.find((persona) => persona.id === selectedId) ?? null;
  const isDefault = selectedId === DEFAULT_PERSONA_ID && !isNew;
  const isDirty = useMemo(() => {
    if (isNew) return draft.name.trim().length > 0;
    if (!existingPersona) return false;
    const current = personaToDraft(existingPersona);
    return (
      current.name !== draft.name ||
      current.description !== draft.description ||
      current.notes !== draft.notes ||
      current.avatar !== draft.avatar ||
      current.tags.join('|') !== draft.tags.join('|') ||
      current.boundLorebookIds.join('|') !== draft.boundLorebookIds.join('|')
    );
  }, [draft, existingPersona, isNew]);

  const handleNew = () => {
    setIsNew(true);
    setSelectedId(null);
    setDraft(emptyDraft());
  };

  const handleSelect = (id: string) => {
    setIsNew(false);
    setSelectedId(id);
  };

  const handleSave = () => {
    const name = draft.name.trim();
    if (!name) return;

    const payload = {
      name,
      description: draft.description,
      notes: draft.notes,
      avatar: draft.avatar.trim() ? draft.avatar.trim() : null,
      tags: draft.tags,
      boundLorebookIds: draft.boundLorebookIds,
    };

    if (isNew) {
      const now = Date.now();
      const id = crypto.randomUUID();
      addPersona({
        id,
        ...payload,
        createdAt: now,
        updatedAt: now,
      });
      setIsNew(false);
      setSelectedId(id);
    } else if (selectedId) {
      updatePersona(selectedId, payload);
    }
  };

  const handleDelete = () => {
    if (!selectedId || isDefault) return;
    removePersona(selectedId);
    setSelectedId(null);
  };

  const handleRevert = () => {
    if (isNew) {
      setIsNew(false);
      setSelectedId(personas[0]?.id ?? null);
      return;
    }
    if (existingPersona) {
      setDraft(personaToDraft(existingPersona));
    }
  };

  const handleSetActive = () => {
    if (!activeSessionId || !selectedId || isNew) return;
    setSessionActivePersona(activeSessionId, selectedId);
  };

  return (
    <Modal opened={opened} onClose={onClose} title="Persona Manager" size="xl">
      <Grid gutter="md">
        <Grid.Col span={{ base: 12, sm: 5 }}>
          <Stack gap="xs" h="100%">
            <Group justify="space-between">
              <Text size="sm" fw={600}>
                Personas
              </Text>
              <Tooltip label="New persona">
                <ActionIcon variant="subtle" onClick={handleNew}>
                  <IconPlus size={14} />
                </ActionIcon>
              </Tooltip>
            </Group>
            <ScrollArea h={420}>
              <Stack gap="xs">
                {personas.map((persona) => {
                  const isActiveSelection = !isNew && persona.id === selectedId;
                  const isSessionActive = activeSession?.activePersonaId === persona.id;
                  return (
                    <ElevatedCard
                      key={persona.id}
                      elevation={isActiveSelection ? 'raised' : 'paper'}
                      tone={isActiveSelection ? 'brand' : 'neutral'}
                      interactive
                      onClick={() => handleSelect(persona.id)}
                    >
                      <Group justify="space-between" wrap="nowrap">
                        <Stack gap={2} style={{ minWidth: 0, flex: 1 }}>
                          <Group gap={4} wrap="nowrap">
                            <Text size="sm" fw={600} truncate>
                              {persona.name}
                            </Text>
                            {isSessionActive && (
                              <Tooltip label="Active on current session">
                                <IconStar size={12} />
                              </Tooltip>
                            )}
                          </Group>
                          <Text size="xs" c="dimmed" lineClamp={2}>
                            {persona.description || 'No description'}
                          </Text>
                        </Stack>
                        {persona.id === DEFAULT_PERSONA_ID && (
                          <Badge size="xs" variant="light">
                            default
                          </Badge>
                        )}
                      </Group>
                    </ElevatedCard>
                  );
                })}
                {isNew && (
                  <ElevatedCard elevation="raised" tone="brand">
                    <Text size="sm" fw={600}>
                      {draft.name.trim() || 'New persona'}
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

        <Grid.Col span={{ base: 12, sm: 7 }}>
          {isNew || existingPersona ? (
            <Stack gap="sm">
              <TextInput
                label="Name"
                required
                value={draft.name}
                onChange={(event) =>
                  setDraft((prev) => ({ ...prev, name: event.currentTarget.value }))
                }
                disabled={isDefault}
              />
              <Textarea
                label="Description"
                description="A short, in-world description of who this persona is."
                minRows={3}
                autosize
                value={draft.description}
                onChange={(event) =>
                  setDraft((prev) => ({ ...prev, description: event.currentTarget.value }))
                }
              />
              <Textarea
                label="Notes"
                description="Extra context the AI should know about this persona."
                minRows={3}
                autosize
                value={draft.notes}
                onChange={(event) =>
                  setDraft((prev) => ({ ...prev, notes: event.currentTarget.value }))
                }
              />
              <TextInput
                label="Avatar URL"
                placeholder="https://..."
                value={draft.avatar}
                onChange={(event) =>
                  setDraft((prev) => ({ ...prev, avatar: event.currentTarget.value }))
                }
              />
              <TagsInput
                label="Tags"
                value={draft.tags}
                onChange={(value) => setDraft((prev) => ({ ...prev, tags: value }))}
              />
              <MultiSelect
                label="Bound Lorebooks"
                description="Lorebooks that auto-apply whenever this persona is active."
                data={lorebookOptions}
                value={draft.boundLorebookIds}
                onChange={(value) =>
                  setDraft((prev) => ({ ...prev, boundLorebookIds: value }))
                }
                searchable
                placeholder={lorebookOptions.length === 0 ? 'No lorebooks yet' : 'Choose lorebooks'}
              />

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
                <Group gap="xs">
                  {!isNew && activeSessionId && (
                    <SwarmButton
                      tone="brand"
                      emphasis="soft"
                      onClick={handleSetActive}
                      disabled={activeSession?.activePersonaId === selectedId}
                    >
                      Set Active For Session
                    </SwarmButton>
                  )}
                  {!isNew && !isDefault && (
                    <Tooltip label="Delete persona">
                      <ActionIcon variant="subtle" color="red" onClick={handleDelete}>
                        <IconTrash size={14} />
                      </ActionIcon>
                    </Tooltip>
                  )}
                </Group>
              </Group>
            </Stack>
          ) : (
            <Stack align="center" justify="center" h={420}>
              <Text size="sm" c="dimmed">
                Select a persona or create a new one.
              </Text>
            </Stack>
          )}
        </Grid.Col>
      </Grid>
    </Modal>
  );
}
