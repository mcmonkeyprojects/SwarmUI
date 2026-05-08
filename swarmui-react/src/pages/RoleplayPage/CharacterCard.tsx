import type { KeyboardEvent, ReactNode } from 'react';
import { Badge, Group, Text } from '@mantine/core';
import { IconMessageCircle, IconStarFilled } from '@tabler/icons-react';
import type { RoleplayCharacter } from '../../types/roleplay';

interface CharacterCardProps {
  character: RoleplayCharacter;
  sessionCount?: number;
  active?: boolean;
  compact?: boolean;
  featured?: boolean;
  actions?: ReactNode;
  onSelect?: () => void;
}

function getCharacterSummary(character: RoleplayCharacter): string {
  return (
    character.personality.trim() ||
    character.description.trim() ||
    character.scenario.trim() ||
    'No description yet.'
  );
}

/**
 * Shared portrait-forward card for character picking and deck browsing.
 */
export function CharacterCard({
  character,
  sessionCount = 0,
  active = false,
  compact = false,
  featured = false,
  actions,
  onSelect,
}: CharacterCardProps) {
  const initial = character.name[0]?.toUpperCase() ?? '?';
  const summary = getCharacterSummary(character);
  const visibleTags = character.tags.slice(0, compact ? 1 : 3);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!onSelect) {
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onSelect();
    }
  };

  return (
    <div
      className="roleplay-character-card"
      data-active={active}
      data-compact={compact}
      data-featured={featured}
      data-has-image={!!character.avatar}
      role={onSelect ? 'button' : undefined}
      tabIndex={onSelect ? 0 : undefined}
      onClick={onSelect}
      onKeyDown={handleKeyDown}
      aria-label={onSelect ? `Select ${character.name}` : undefined}
    >
      <div className="roleplay-character-card__media" aria-hidden="true">
        {character.avatar ? (
          <img src={character.avatar} alt="" />
        ) : (
          <div className="roleplay-character-card__initial">{initial}</div>
        )}
      </div>
      <div className="roleplay-character-card__shade" />
      <div className="roleplay-character-card__content">
        <Group justify="space-between" wrap="nowrap" align="flex-start" gap="xs">
          <div className="roleplay-character-card__title-block">
            <Group gap={5} wrap="nowrap">
              <Text className="roleplay-character-card__name" lineClamp={1}>
                {character.name}
              </Text>
              {character.favorite ? (
                <IconStarFilled className="roleplay-character-card__favorite" size={14} />
              ) : null}
            </Group>
            {!compact ? (
              <Text className="roleplay-character-card__summary" lineClamp={featured ? 4 : 3}>
                {summary}
              </Text>
            ) : null}
          </div>
          {actions ? (
            <div
              className="roleplay-character-card__actions"
              onClick={(event) => event.stopPropagation()}
              onKeyDown={(event) => event.stopPropagation()}
            >
              {actions}
            </div>
          ) : null}
        </Group>
        <Group gap={5} wrap="wrap" className="roleplay-character-card__meta">
          <Badge
            size="xs"
            variant="filled"
            leftSection={<IconMessageCircle size={10} />}
            className="roleplay-character-card__badge"
          >
            {sessionCount} {sessionCount === 1 ? 'chat' : 'chats'}
          </Badge>
          {visibleTags.map((tag) => (
            <Badge key={tag} size="xs" variant="filled" className="roleplay-character-card__badge">
              {tag}
            </Badge>
          ))}
        </Group>
      </div>
    </div>
  );
}
