import { useMemo, useState } from 'react';
import { ActionIcon, FileButton, Group, ScrollArea, Select, Stack, Text, TextInput, Tooltip } from '@mantine/core';
import {
  IconDownload,
  IconFileImport,
  IconPlus,
  IconTrash,
  IconEdit,
  IconCopy,
  IconMessageCirclePlus,
  IconSearch,
  IconStar,
  IconStarFilled,
} from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { useShallow } from 'zustand/react/shallow';
import { ElevatedCard } from '../../components/ui/ElevatedCard';
import { SwarmButton } from '../../components/ui/SwarmButton';
import { useRoleplayStore } from '../../stores/roleplayStore';
import { downloadTavernV2Json, parseTavernCardFile } from '../../features/roleplay/tavernCard';
import { CharacterEditor } from './CharacterEditor';
import { CharacterAvatar } from './CharacterAvatar';
import { RoleplayCatalogModal } from './RoleplayCatalogModal';
import type { RoleplayCharacter } from '../../types/roleplay';

export function CharacterSidebar() {
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingCharacter, setEditingCharacter] = useState<RoleplayCharacter | null>(null);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('recent');

  const {
    characters,
    lorebooks,
    chatSessions,
    activeCharacterId,
    activeSessionId,
    setActiveCharacter,
    setActiveSession,
    getCharacterSessions,
    createSession,
    duplicateSession,
    duplicateCharacter,
    renameSession,
    removeSession,
    removeCharacter,
    setCharacterFavorite,
    addCharacterWithLorebooks,
  } = useRoleplayStore(
    useShallow((s) => ({
      characters: s.characters,
      lorebooks: s.lorebooks,
      chatSessions: s.chatSessions,
      activeCharacterId: s.activeCharacterId,
      activeSessionId: s.activeSessionId,
      setActiveCharacter: s.setActiveCharacter,
      setActiveSession: s.setActiveSession,
      getCharacterSessions: s.getCharacterSessions,
      createSession: s.createSession,
      duplicateSession: s.duplicateSession,
      duplicateCharacter: s.duplicateCharacter,
      renameSession: s.renameSession,
      removeSession: s.removeSession,
      removeCharacter: s.removeCharacter,
      setCharacterFavorite: s.setCharacterFavorite,
      addCharacterWithLorebooks: s.addCharacterWithLorebooks,
    }))
  );

  const activeCharacter = characters.find((c) => c.id === activeCharacterId) ?? null;
  const activeCharacterSessions = activeCharacter ? getCharacterSessions(activeCharacter.id) : [];
  const recentCharacterIds = useMemo(() => {
    return [...chatSessions]
      .sort((left, right) => right.updatedAt - left.updatedAt)
      .map((session) => session.characterId)
      .filter((characterId, index, array) => array.indexOf(characterId) === index);
  }, [chatSessions]);
  const hotswapCharacters = useMemo(() => {
    const favorites = characters.filter((character) => character.favorite);
    const fallback = recentCharacterIds
      .map((characterId) => characters.find((character) => character.id === characterId))
      .filter((character): character is RoleplayCharacter => !!character);
    return (favorites.length > 0 ? favorites : fallback).slice(0, 8);
  }, [characters, recentCharacterIds]);
  const filteredCharacters = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    const nextCharacters = characters.filter((character) => {
      if (!normalizedSearch) {
        return true;
      }
      return [
        character.name,
        character.personality,
        character.description,
        character.scenario,
        ...character.tags,
      ]
        .join(' ')
        .toLowerCase()
        .includes(normalizedSearch);
    });

    return nextCharacters.sort((left, right) => {
      if (sort === 'name') {
        return left.name.localeCompare(right.name);
      }
      if (sort === 'favorites') {
        if (left.favorite !== right.favorite) {
          return left.favorite ? -1 : 1;
        }
        return left.name.localeCompare(right.name);
      }
      const leftRecentIndex = recentCharacterIds.indexOf(left.id);
      const rightRecentIndex = recentCharacterIds.indexOf(right.id);
      return (leftRecentIndex === -1 ? 9999 : leftRecentIndex) - (rightRecentIndex === -1 ? 9999 : rightRecentIndex);
    });
  }, [characters, recentCharacterIds, search, sort]);

  const handleNewCharacter = () => {
    setEditingCharacter(null);
    setEditorOpen(true);
  };

  const handleEditCharacter = (character: RoleplayCharacter) => {
    setEditingCharacter(character);
    setEditorOpen(true);
  };

  const handleDeleteCharacter = (id: string) => {
    if (characters.length <= 1) return;
    removeCharacter(id);
  };

  const handleImportTavernCard = async (file: File | null) => {
    if (!file) {
      return;
    }
    try {
      const result = await parseTavernCardFile(file);
      addCharacterWithLorebooks(result.character, result.lorebooks);
      notifications.show({
        title: 'Tavern Card Imported',
        message: `${result.character.name} was added to the deck.`,
        color: 'green',
      });
    } catch (error) {
      notifications.show({
        title: 'Import Failed',
        message: error instanceof Error ? error.message : 'Could not import Tavern card.',
        color: 'red',
      });
    }
  };

  const handleRenameSession = (sessionId: string, currentTitle: string) => {
    const nextTitle = window.prompt('Rename chat', currentTitle);
    if (nextTitle === null) {
      return;
    }
    renameSession(sessionId, nextTitle);
  };

  const handleExportActiveCharacter = () => {
    if (!activeCharacter) {
      return;
    }
    downloadTavernV2Json(activeCharacter, lorebooks);
  };

  const handleSelectCharacter = (characterId: string) => {
    if (characterId === activeCharacterId) {
      return;
    }
    setActiveCharacter(characterId);
  };

  const handleSelectSession = (sessionId: string) => {
    if (sessionId === activeSessionId) {
      return;
    }
    setActiveSession(sessionId);
  };

  return (
    <Stack h="100%" gap={0} className="roleplay-character-deck">
      {/* Header */}
      <Stack gap="xs" p="xs" className="roleplay-deck-header">
        <Group justify="space-between" wrap="nowrap">
          <Text size="sm" fw={700} c="var(--theme-text-primary)">
            Character Deck
          </Text>
          <Group gap={4} wrap="nowrap">
            <Tooltip label="New character">
              <ActionIcon variant="subtle" size="sm" color="gray" onClick={handleNewCharacter}>
                <IconPlus size={14} />
              </ActionIcon>
            </Tooltip>
            <Tooltip label="Catalog">
              <ActionIcon variant="subtle" size="sm" color="gray" onClick={() => setCatalogOpen(true)}>
                <IconMessageCirclePlus size={14} />
              </ActionIcon>
            </Tooltip>
            <FileButton onChange={handleImportTavernCard} accept="application/json,image/png,.json,.png">
              {(props) => (
                <Tooltip label="Import Tavern card">
                  <ActionIcon {...props} variant="subtle" size="sm" color="gray">
                    <IconFileImport size={14} />
                  </ActionIcon>
                </Tooltip>
              )}
            </FileButton>
          </Group>
        </Group>
        <TextInput
          leftSection={<IconSearch size={14} />}
          placeholder="Search characters"
          value={search}
          onChange={(event) => setSearch(event.currentTarget.value)}
          size="xs"
        />
        <Select
          value={sort}
          onChange={(value) => setSort(value ?? 'recent')}
          size="xs"
          data={[
            { value: 'recent', label: 'Recent first' },
            { value: 'favorites', label: 'Favorites first' },
            { value: 'name', label: 'Name A-Z' },
          ]}
          allowDeselect={false}
        />
        {hotswapCharacters.length > 0 ? (
          <Group gap={6} wrap="nowrap" className="roleplay-hotswap-strip">
            {hotswapCharacters.map((character) => (
              <Tooltip key={character.id} label={character.name}>
                <ActionIcon
                  variant={character.id === activeCharacterId ? 'filled' : 'subtle'}
                  size="lg"
                  radius="xl"
                  onClick={() => handleSelectCharacter(character.id)}
                >
                  <CharacterAvatar character={character} size={24} />
                </ActionIcon>
              </Tooltip>
            ))}
          </Group>
        ) : null}
      </Stack>

      {/* Active Character Profile */}
      {activeCharacter && (
        <Stack
          align="center"
          gap="xs"
          p="md"
          style={{ borderBottom: '1px solid var(--theme-gray-5)' }}
        >
          <CharacterAvatar character={activeCharacter} size={120} />
          <Text size="md" fw={700} ta="center">
            {activeCharacter.name}
          </Text>
          <Text size="xs" c="dimmed" ta="center" lineClamp={3}>
            {activeCharacter.personality}
          </Text>
          <SwarmButton
            tone="brand"
            emphasis="ghost"
            size="xs"
            leftSection={<IconEdit size={12} />}
            onClick={() => handleEditCharacter(activeCharacter)}
          >
            Edit Character
          </SwarmButton>
          <Group gap={4} wrap="nowrap">
            <Tooltip label={activeCharacter.favorite ? 'Unfavorite' : 'Favorite'}>
              <ActionIcon
                variant="subtle"
                size="sm"
                color={activeCharacter.favorite ? 'yellow' : 'gray'}
                onClick={() => setCharacterFavorite(activeCharacter.id)}
              >
                {activeCharacter.favorite ? <IconStarFilled size={14} /> : <IconStar size={14} />}
              </ActionIcon>
            </Tooltip>
            <Tooltip label="Duplicate character">
              <ActionIcon
                variant="subtle"
                size="sm"
                color="gray"
                onClick={() => duplicateCharacter(activeCharacter.id)}
              >
                <IconCopy size={14} />
              </ActionIcon>
            </Tooltip>
            <Tooltip label="Export Tavern V2 JSON">
              <ActionIcon
                variant="subtle"
                size="sm"
                color="gray"
                onClick={handleExportActiveCharacter}
              >
                <IconDownload size={14} />
              </ActionIcon>
            </Tooltip>
          </Group>
          <Stack gap={6} w="100%">
            <Group justify="space-between" wrap="nowrap">
              <Text size="xs" fw={600}>
                Chats
              </Text>
              <Tooltip label="New chat">
                <ActionIcon
                  variant="subtle"
                  size="sm"
                  color="gray"
                  onClick={() => activeCharacter && createSession(activeCharacter.id, 'New Chat')}
                >
                  <IconMessageCirclePlus size={14} />
                </ActionIcon>
              </Tooltip>
            </Group>
            {activeCharacterSessions.map((session) => (
              <ElevatedCard
                key={session.id}
                elevation={session.id === activeSessionId ? 'raised' : 'paper'}
                tone={session.id === activeSessionId ? 'brand' : 'neutral'}
                interactive
                onClick={() => handleSelectSession(session.id)}
                style={{ width: '100%' }}
              >
                <Stack gap={4}>
                  <Group justify="space-between" wrap="nowrap" align="flex-start">
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <Text size="xs" fw={600} truncate>
                        {session.title}
                      </Text>
                      <Text size="xs" c="dimmed">
                        {session.messages.length} messages
                      </Text>
                    </div>
                    <Group gap={2} wrap="nowrap">
                      <ActionIcon
                        variant="subtle"
                        size="xs"
                        color="gray"
                        onClick={(event) => {
                          event.stopPropagation();
                          handleRenameSession(session.id, session.title);
                        }}
                      >
                        <IconEdit size={11} />
                      </ActionIcon>
                      <ActionIcon
                        variant="subtle"
                        size="xs"
                        color="gray"
                        onClick={(event) => {
                          event.stopPropagation();
                          duplicateSession(session.id);
                        }}
                      >
                        <IconCopy size={11} />
                      </ActionIcon>
                      <ActionIcon
                        variant="subtle"
                        size="xs"
                        color="red"
                        onClick={(event) => {
                          event.stopPropagation();
                          removeSession(session.id);
                        }}
                      >
                        <IconTrash size={11} />
                      </ActionIcon>
                    </Group>
                  </Group>
                  {session.promptStack.authorNote.trim() && (
                    <Text size="xs" c="dimmed" lineClamp={2}>
                      Author's note: {session.promptStack.authorNote}
                    </Text>
                  )}
                </Stack>
              </ElevatedCard>
            ))}
          </Stack>
        </Stack>
      )}

      {/* Character List */}
      <ScrollArea flex={1} p="xs">
        <Stack gap="xs">
          {filteredCharacters.length === 0 ? (
            <Text size="xs" c="dimmed" ta="center" py="md">
              No characters match this search.
            </Text>
          ) : null}
          {filteredCharacters.map((character) => (
            <div
              key={character.id}
              role="button"
              tabIndex={0}
              onClick={() => handleSelectCharacter(character.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleSelectCharacter(character.id);
                }
              }}
              style={{ cursor: 'pointer' }}
            >
              <ElevatedCard
                elevation={character.id === activeCharacterId ? 'raised' : 'paper'}
                tone={character.id === activeCharacterId ? 'brand' : 'neutral'}
                interactive
              >
                <Group justify="space-between" wrap="nowrap">
                  <Group gap="xs" wrap="nowrap" style={{ minWidth: 0, flex: 1 }}>
                    <CharacterAvatar character={character} size={28} />
                    <Stack gap={2} style={{ minWidth: 0, flex: 1 }}>
                      <Text size="sm" fw={600} truncate>
                        {character.name}
                      </Text>
                      <Text size="xs" c="dimmed" lineClamp={1}>
                        {character.personality}
                      </Text>
                    </Stack>
                  </Group>
                  <Group gap={2} wrap="nowrap">
                    <ActionIcon
                      variant="subtle"
                      size="xs"
                      color={character.favorite ? 'yellow' : 'gray'}
                      onClick={(e) => {
                        e.stopPropagation();
                        setCharacterFavorite(character.id);
                      }}
                    >
                      {character.favorite ? <IconStarFilled size={12} /> : <IconStar size={12} />}
                    </ActionIcon>
                    <ActionIcon
                      variant="subtle"
                      size="xs"
                      color="gray"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleEditCharacter(character);
                      }}
                    >
                      <IconEdit size={12} />
                    </ActionIcon>
                    {characters.length > 1 && (
                      <ActionIcon
                        variant="subtle"
                        size="xs"
                        color="red"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteCharacter(character.id);
                        }}
                      >
                        <IconTrash size={12} />
                      </ActionIcon>
                    )}
                  </Group>
                </Group>
              </ElevatedCard>
            </div>
          ))}
        </Stack>
      </ScrollArea>

      {/* Character Editor Modal */}
      {editorOpen ? (
        <CharacterEditor
          opened={editorOpen}
          onClose={() => {
            setEditorOpen(false);
            setEditingCharacter(null);
          }}
          character={editingCharacter}
        />
      ) : null}
      {catalogOpen ? (
        <RoleplayCatalogModal opened={catalogOpen} onClose={() => setCatalogOpen(false)} />
      ) : null}
    </Stack>
  );
}
