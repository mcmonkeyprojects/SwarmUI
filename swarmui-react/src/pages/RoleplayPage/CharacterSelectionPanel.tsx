import { type CSSProperties, useMemo, useState } from 'react';
import {
  Badge,
  Group,
  ScrollArea,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
} from '@mantine/core';
import { IconFileImport, IconPlus, IconSearch } from '@tabler/icons-react';
import { useShallow } from 'zustand/react/shallow';
import { SwarmButton } from '../../components/ui/SwarmButton';
import { useRoleplayStore } from '../../stores/roleplayStore';
import { CharacterCard } from './CharacterCard';
import { CharacterEditor } from './CharacterEditor';
import { CharacterSourceBrowserModal } from './CharacterSourceBrowserModal';
import type { RoleplayCharacter, RoleplayChatSession } from '../../types/roleplay';

interface CharacterSelectionPanelProps {
  onSelectCharacter: (characterId: string) => void;
}

/**
 * Character selection / entry surface for the roleplay page.
 * Shows a searchable grid of existing characters, a "New Character"
 * action, and routes into the chat layout once a character is picked.
 */
export function CharacterSelectionPanel({ onSelectCharacter }: CharacterSelectionPanelProps) {
  const [search, setSearch] = useState('');
  const [editorOpen, setEditorOpen] = useState(false);
  const [sourceBrowserOpen, setSourceBrowserOpen] = useState(false);

  const {
    characters,
    chatSessions,
    activeCharacterId,
    setActiveCharacter,
    setActiveSession,
    createSession,
  } = useRoleplayStore(
    useShallow((s) => ({
      characters: s.characters,
      chatSessions: s.chatSessions,
      activeCharacterId: s.activeCharacterId,
      setActiveCharacter: s.setActiveCharacter,
      setActiveSession: s.setActiveSession,
      createSession: s.createSession,
    }))
  );

  const characterById = useMemo(
    () => new Map(characters.map((character) => [character.id, character])),
    [characters]
  );
  const { favoriteCount, totalPortraitCount } = useMemo(() => {
    let nextFavoriteCount = 0;
    let nextTotalPortraitCount = 0;
    for (const character of characters) {
      if (character.favorite) {
        nextFavoriteCount += 1;
      }
      if (character.avatar) {
        nextTotalPortraitCount += 1;
      }
    }
    return {
      favoriteCount: nextFavoriteCount,
      totalPortraitCount: nextTotalPortraitCount,
    };
  }, [characters]);
  const { sessionCountByCharacterId, sessionsByCharacterId } = useMemo(() => {
    const nextSessionCountByCharacterId = new Map<string, number>();
    const nextSessionsByCharacterId = new Map<string, RoleplayChatSession[]>();
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
    }
    for (const sessions of nextSessionsByCharacterId.values()) {
      sessions.sort((left, right) => right.updatedAt - left.updatedAt);
    }
    return {
      sessionCountByCharacterId: nextSessionCountByCharacterId,
      sessionsByCharacterId: nextSessionsByCharacterId,
    };
  }, [chatSessions]);
  const activeCharacter = activeCharacterId ? (characterById.get(activeCharacterId) ?? null) : null;
  const spotlightCharacter = activeCharacter ?? characters[0] ?? null;
  const totalSessionCount = chatSessions.length;

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return characters;
    return characters.filter((character) => {
      const haystack = [
        character.name,
        character.personality,
        character.description,
        character.tags.join(' '),
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [characters, search]);

  const handleSelect = (character: RoleplayCharacter) => {
    setActiveCharacter(character.id);

    const characterSessions = sessionsByCharacterId.get(character.id) ?? [];

    if (characterSessions.length > 0) {
      setActiveSession(characterSessions[0].id);
    } else {
      createSession(character.id, 'Main Chat');
    }

    onSelectCharacter(character.id);
  };

  const landingImageStyle = spotlightCharacter?.avatar
    ? ({
        '--roleplay-landing-image': `url("${spotlightCharacter.avatar}")`,
      } as CSSProperties)
    : undefined;

  return (
    <Stack gap="md" h="100%" className="roleplay-character-landing">
      <div
        className="roleplay-character-landing__masthead"
        style={landingImageStyle}
      >
        <Stack gap="md" className="roleplay-character-landing__copy">
          <Group gap="xs" wrap="wrap">
            <Badge variant="filled" className="roleplay-character-landing__eyebrow">
              Character Deck
            </Badge>
            {activeCharacter ? (
              <Badge variant="filled" className="roleplay-character-landing__eyebrow">
                {activeCharacter.name} selected
              </Badge>
            ) : null}
          </Group>
          <Stack gap={4}>
            <Text className="roleplay-character-landing__title">
              Choose a Character
            </Text>
            <Text className="roleplay-character-landing__subtitle">
              Pick a card to open its latest chat, import a Tavern card, or create a new character.
            </Text>
          </Stack>
          <Group gap="xs" wrap="wrap" className="roleplay-character-landing__stats">
            <Badge variant="filled">{characters.length} characters</Badge>
            <Badge variant="filled">{totalSessionCount} chats</Badge>
            <Badge variant="filled">{favoriteCount} favorites</Badge>
            <Badge variant="filled">{totalPortraitCount} portraits</Badge>
          </Group>
          <Group gap="xs" wrap="wrap">
            <SwarmButton
              tone="brand"
              emphasis="solid"
              leftSection={<IconPlus size={14} />}
              onClick={() => setEditorOpen(true)}
            >
              New Character
            </SwarmButton>
            <SwarmButton
              tone="secondary"
              emphasis="soft"
              leftSection={<IconFileImport size={14} />}
              onClick={() => setSourceBrowserOpen(true)}
            >
              Import Card
            </SwarmButton>
          </Group>
        </Stack>
        {spotlightCharacter ? (
          <div className="roleplay-character-landing__spotlight">
            <CharacterCard
              character={spotlightCharacter}
              sessionCount={sessionCountByCharacterId.get(spotlightCharacter.id) ?? 0}
              active={spotlightCharacter.id === activeCharacterId}
              featured
              onSelect={() => handleSelect(spotlightCharacter)}
            />
          </div>
        ) : null}
      </div>

      <Group className="roleplay-character-landing__toolbar" justify="space-between" wrap="wrap">
        <TextInput
          placeholder="Search characters"
          leftSection={<IconSearch size={14} />}
          value={search}
          onChange={(event) => setSearch(event.currentTarget.value)}
          className="roleplay-character-landing__search"
        />
        <Text size="xs" c="dimmed">
          {filtered.length} shown
        </Text>
      </Group>

      <ScrollArea flex={1} className="roleplay-character-picker-scroll">
        {filtered.length === 0 ? (
          <Stack align="center" gap="xs" py="xl">
            <Text size="sm" c="dimmed">
              {characters.length === 0
                ? 'No characters yet. Create one to get started.'
                : 'No characters match your search.'}
            </Text>
          </Stack>
        ) : (
          <SimpleGrid cols={{ base: 1, sm: 2, lg: 3, xl: 4 }} spacing="md">
            {filtered.map((character) => {
              const sessionCount = sessionCountByCharacterId.get(character.id) ?? 0;
              const isActive = character.id === activeCharacterId;
              return (
                <CharacterCard
                  key={character.id}
                  character={character}
                  sessionCount={sessionCount}
                  active={isActive}
                  featured
                  onSelect={() => handleSelect(character)}
                />
              );
            })}
          </SimpleGrid>
        )}
      </ScrollArea>

      <CharacterEditor
        opened={editorOpen}
        onClose={() => setEditorOpen(false)}
        character={null}
      />
      {sourceBrowserOpen ? (
        <CharacterSourceBrowserModal
          opened={sourceBrowserOpen}
          onClose={() => setSourceBrowserOpen(false)}
        />
      ) : null}
    </Stack>
  );
}
