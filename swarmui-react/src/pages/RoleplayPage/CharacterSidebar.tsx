import { useMemo, useState } from 'react';
import {
  ActionIcon,
  Badge,
  Group,
  Modal,
  ScrollArea,
  Select,
  Stack,
  Text,
  TextInput,
  Tooltip,
} from '@mantine/core';
import {
  IconDownload,
  IconFileImport,
  IconPlus,
  IconTrash,
  IconEdit,
  IconCopy,
  IconMessageCirclePlus,
  IconPhoto,
  IconSearch,
  IconStar,
  IconStarFilled,
} from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { useShallow } from 'zustand/react/shallow';
import { ElevatedCard } from '../../components/ui/ElevatedCard';
import { SwarmButton } from '../../components/ui/SwarmButton';
import { useRoleplayStore } from '../../stores/roleplayStore';
import { downloadTavernV2Json, downloadTavernV2Png } from '../../features/roleplay/tavernCard';
import { CharacterEditor } from './CharacterEditor';
import { CharacterCard } from './CharacterCard';
import { CharacterAvatar } from './CharacterAvatar';
import { RoleplayCatalogModal } from './RoleplayCatalogModal';
import { CharacterSourceBrowserModal } from './CharacterSourceBrowserModal';
import type {
  RoleplayCharacter,
  RoleplayCharacterGalleryImage,
  RoleplayChatSession,
} from '../../types/roleplay';

export function CharacterSidebar() {
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingCharacter, setEditingCharacter] = useState<RoleplayCharacter | null>(null);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [sourceBrowserOpen, setSourceBrowserOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('recent');
  const [selectedGalleryImage, setSelectedGalleryImage] =
    useState<RoleplayCharacterGalleryImage | null>(null);

  const {
    characters,
    lorebooks,
    chatSessions,
    activeCharacterId,
    activeSessionId,
    setActiveCharacter,
    setActiveSession,
    createSession,
    duplicateSession,
    duplicateCharacter,
    renameSession,
    removeSession,
    removeCharacter,
    setCharacterFavorite,
    updateCharacterAvatar,
    removeCharacterGalleryImage,
  } = useRoleplayStore(
    useShallow((s) => ({
      characters: s.characters,
      lorebooks: s.lorebooks,
      chatSessions: s.chatSessions,
      activeCharacterId: s.activeCharacterId,
      activeSessionId: s.activeSessionId,
      setActiveCharacter: s.setActiveCharacter,
      setActiveSession: s.setActiveSession,
      createSession: s.createSession,
      duplicateSession: s.duplicateSession,
      duplicateCharacter: s.duplicateCharacter,
      renameSession: s.renameSession,
      removeSession: s.removeSession,
      removeCharacter: s.removeCharacter,
      setCharacterFavorite: s.setCharacterFavorite,
      updateCharacterAvatar: s.updateCharacterAvatar,
      removeCharacterGalleryImage: s.removeCharacterGalleryImage,
    }))
  );

  const characterById = useMemo(
    () => new Map(characters.map((character) => [character.id, character])),
    [characters]
  );
  const {
    recentCharacterIds,
    sessionCountByCharacterId,
    sessionsByCharacterId,
  } = useMemo(() => {
    const nextSessionCountByCharacterId = new Map<string, number>();
    const nextSessionsByCharacterId = new Map<string, RoleplayChatSession[]>();
    const latestUpdatedAtByCharacterId = new Map<string, number>();

    for (const session of chatSessions) {
      nextSessionCountByCharacterId.set(
        session.characterId,
        (nextSessionCountByCharacterId.get(session.characterId) ?? 0) + 1
      );
      const characterSessions = nextSessionsByCharacterId.get(session.characterId);
      if (characterSessions) {
        characterSessions.push(session);
      } else {
        nextSessionsByCharacterId.set(session.characterId, [session]);
      }
      latestUpdatedAtByCharacterId.set(
        session.characterId,
        Math.max(latestUpdatedAtByCharacterId.get(session.characterId) ?? 0, session.updatedAt)
      );
    }

    for (const sessions of nextSessionsByCharacterId.values()) {
      sessions.sort((left, right) => right.updatedAt - left.updatedAt);
    }

    return {
      recentCharacterIds: [...latestUpdatedAtByCharacterId.entries()]
        .sort((left, right) => right[1] - left[1])
        .map(([characterId]) => characterId),
      sessionCountByCharacterId: nextSessionCountByCharacterId,
      sessionsByCharacterId: nextSessionsByCharacterId,
    };
  }, [chatSessions]);
  const recentCharacterRankById = useMemo(
    () => new Map(recentCharacterIds.map((characterId, index) => [characterId, index])),
    [recentCharacterIds]
  );
  const activeCharacter = activeCharacterId ? (characterById.get(activeCharacterId) ?? null) : null;
  const activeCharacterSessions = activeCharacter
    ? (sessionsByCharacterId.get(activeCharacter.id) ?? [])
    : [];
  const hotswapCharacters = useMemo(() => {
    const favorites = characters.filter((character) => character.favorite);
    const fallback = recentCharacterIds
      .map((characterId) => characterById.get(characterId))
      .filter((character): character is RoleplayCharacter => !!character);
    return (favorites.length > 0 ? favorites : fallback).slice(0, 8);
  }, [characterById, characters, recentCharacterIds]);
  const filteredCharacters = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    const nextCharacters = characters.filter((character) => {
      if (character.id === activeCharacterId) {
        return false;
      }
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
      const leftRecentIndex = recentCharacterRankById.get(left.id) ?? 9999;
      const rightRecentIndex = recentCharacterRankById.get(right.id) ?? 9999;
      return leftRecentIndex - rightRecentIndex;
    });
  }, [activeCharacterId, characters, recentCharacterRankById, search, sort]);

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

  const handleExportActiveCharacterPng = async () => {
    if (!activeCharacter) {
      return;
    }
    try {
      await downloadTavernV2Png(activeCharacter, lorebooks);
    } catch (error) {
      notifications.show({
        title: 'PNG Export Failed',
        message: error instanceof Error ? error.message : 'Could not export Tavern PNG.',
        color: 'red',
      });
    }
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

  const handleUseGalleryImageAsPortrait = () => {
    if (!activeCharacter || !selectedGalleryImage) {
      return;
    }
    updateCharacterAvatar(activeCharacter.id, selectedGalleryImage.imageUrl, selectedGalleryImage.imageUrl);
  };

  const handleRemoveGalleryImage = () => {
    if (!activeCharacter || !selectedGalleryImage) {
      return;
    }
    removeCharacterGalleryImage(activeCharacter.id, selectedGalleryImage.id);
    setSelectedGalleryImage(null);
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
            <Tooltip label="Import character card">
              <ActionIcon
                variant="subtle"
                size="sm"
                color="gray"
                onClick={() => setSourceBrowserOpen(true)}
              >
                <IconFileImport size={14} />
              </ActionIcon>
            </Tooltip>
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
          gap="xs"
          p="xs"
          className="roleplay-active-character-panel"
        >
          <CharacterCard
            character={activeCharacter}
            sessionCount={activeCharacterSessions.length}
            active
            featured
            actions={
              <Group gap={4} wrap="nowrap">
                <Tooltip label="Edit character">
                  <ActionIcon
                    variant="filled"
                    size="sm"
                    color="gray"
                    onClick={() => handleEditCharacter(activeCharacter)}
                  >
                    <IconEdit size={14} />
                  </ActionIcon>
                </Tooltip>
                <Tooltip label={activeCharacter.favorite ? 'Unfavorite' : 'Favorite'}>
                  <ActionIcon
                    variant="filled"
                    size="sm"
                    color={activeCharacter.favorite ? 'yellow' : 'gray'}
                    onClick={() => setCharacterFavorite(activeCharacter.id)}
                  >
                    {activeCharacter.favorite ? (
                      <IconStarFilled size={14} />
                    ) : (
                      <IconStar size={14} />
                    )}
                  </ActionIcon>
                </Tooltip>
                <Tooltip label="Duplicate character">
                  <ActionIcon
                    variant="filled"
                    size="sm"
                    color="gray"
                    onClick={() => duplicateCharacter(activeCharacter.id)}
                  >
                    <IconCopy size={14} />
                  </ActionIcon>
                </Tooltip>
              </Group>
            }
          />
          <Group gap={4} wrap="nowrap" justify="center">
            <SwarmButton
              tone="brand"
              emphasis="ghost"
              size="xs"
              leftSection={<IconEdit size={12} />}
              onClick={() => handleEditCharacter(activeCharacter)}
            >
              Edit Character
            </SwarmButton>
            <Tooltip label="Export Tavern V2 JSON">
              <ActionIcon variant="subtle" size="sm" color="gray" onClick={handleExportActiveCharacter}>
                <IconDownload size={14} />
              </ActionIcon>
            </Tooltip>
            <Tooltip label="Export Tavern V2 PNG">
              <ActionIcon
                variant="subtle"
                size="sm"
                color="gray"
                onClick={() => void handleExportActiveCharacterPng()}
              >
                <IconPhoto size={14} />
              </ActionIcon>
            </Tooltip>
          </Group>
          <Stack gap={6} w="100%">
            <Group justify="space-between" wrap="nowrap">
              <Text size="xs" fw={600}>
                Gallery
              </Text>
              <Badge size="xs" variant="light">
                {activeCharacter.galleryImages.length}
              </Badge>
            </Group>
            {activeCharacter.galleryImages.length > 0 ? (
              <div className="roleplay-character-gallery-strip">
                {activeCharacter.galleryImages.slice(0, 12).map((image) => (
                  <button
                    key={image.id}
                    type="button"
                    className="roleplay-character-gallery-thumb"
                    onClick={() => setSelectedGalleryImage(image)}
                    aria-label={`Open ${image.source} image`}
                  >
                    <img src={image.imageUrl} alt="" />
                    <span>{image.source}</span>
                  </button>
                ))}
              </div>
            ) : (
              <Text size="xs" c="dimmed" ta="center">
                Generated portraits and scene images will appear here.
              </Text>
            )}
          </Stack>
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
          {filteredCharacters.length === 0 && search.trim() ? (
            <Text size="xs" c="dimmed" ta="center" py="md">
              No other characters match this search.
            </Text>
          ) : null}
          {filteredCharacters.map((character) => (
            <CharacterCard
              key={character.id}
              character={character}
              sessionCount={sessionCountByCharacterId.get(character.id) ?? 0}
              active={character.id === activeCharacterId}
              compact
              onSelect={() => handleSelectCharacter(character.id)}
              actions={
                <Group gap={2} wrap="nowrap">
                  <ActionIcon
                    variant="filled"
                    size="xs"
                    color={character.favorite ? 'yellow' : 'gray'}
                    onClick={() => setCharacterFavorite(character.id)}
                  >
                    {character.favorite ? <IconStarFilled size={12} /> : <IconStar size={12} />}
                  </ActionIcon>
                  <ActionIcon
                    variant="filled"
                    size="xs"
                    color="gray"
                    onClick={() => handleEditCharacter(character)}
                  >
                    <IconEdit size={12} />
                  </ActionIcon>
                  {characters.length > 1 && (
                    <ActionIcon
                      variant="filled"
                      size="xs"
                      color="red"
                      onClick={() => handleDeleteCharacter(character.id)}
                    >
                      <IconTrash size={12} />
                    </ActionIcon>
                  )}
                </Group>
              }
            />
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
      {sourceBrowserOpen ? (
        <CharacterSourceBrowserModal
          opened={sourceBrowserOpen}
          onClose={() => setSourceBrowserOpen(false)}
        />
      ) : null}
      <Modal
        opened={selectedGalleryImage !== null}
        onClose={() => setSelectedGalleryImage(null)}
        title={selectedGalleryImage ? `${activeCharacter?.name ?? 'Character'} Gallery` : 'Gallery'}
        size="lg"
        centered
      >
        {selectedGalleryImage ? (
          <Stack gap="sm">
            <div className="roleplay-character-gallery-preview">
              <img src={selectedGalleryImage.imageUrl} alt="" />
            </div>
            <Group gap="xs" wrap="wrap">
              <Badge variant="light">{selectedGalleryImage.source}</Badge>
              <Text size="xs" c="dimmed">
                {new Date(selectedGalleryImage.createdAt).toLocaleString()}
              </Text>
            </Group>
            {selectedGalleryImage.prompt.trim() ? (
              <Text size="sm" c="dimmed" style={{ whiteSpace: 'pre-wrap' }}>
                {selectedGalleryImage.prompt}
              </Text>
            ) : null}
            <Group justify="flex-end" gap="xs">
              <SwarmButton
                tone="secondary"
                emphasis="ghost"
                size="xs"
                leftSection={<IconTrash size={12} />}
                onClick={handleRemoveGalleryImage}
              >
                Remove
              </SwarmButton>
              <SwarmButton
                tone="brand"
                emphasis="soft"
                size="xs"
                leftSection={<IconPhoto size={12} />}
                onClick={handleUseGalleryImageAsPortrait}
              >
                Use As Portrait
              </SwarmButton>
            </Group>
          </Stack>
        ) : null}
      </Modal>
    </Stack>
  );
}
