import { Text } from '@mantine/core';
import type { RoleplayCharacter } from '../../types/roleplay';

interface CharacterAvatarProps {
    character: RoleplayCharacter | null;
    size?: number;
}

export function CharacterAvatar({ character, size = 32 }: CharacterAvatarProps) {
    if (!character) return null;

    const initial = character.name[0]?.toUpperCase() ?? '?';
    const avatarSrc = character.headshotUrl || character.avatar;

    if (avatarSrc) {
        return (
            <img
                src={avatarSrc}
                alt={character.name}
                style={{
                    width: size,
                    height: size,
                    borderRadius: '50%',
                    objectFit: 'cover',
                    objectPosition: 'top',
                    flexShrink: 0,
                    border: '1px solid var(--theme-gray-5)',
                }}
            />
        );
    }

    const fontSize = Math.max(10, Math.round(size * 0.4));

    return (
        <div
            style={{
                width: size,
                height: size,
                borderRadius: '50%',
                backgroundColor: 'var(--theme-brand)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
            }}
        >
            <Text size={`${fontSize}px`} fw={700} c="white" style={{ lineHeight: 1 }}>
                {initial}
            </Text>
        </div>
    );
}
