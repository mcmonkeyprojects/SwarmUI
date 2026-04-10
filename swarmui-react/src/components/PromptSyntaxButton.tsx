import React, { useState, useCallback } from 'react';
import {
    Menu,
    Text,
    Badge,
    Group,
    Tooltip,
    Divider,
} from '@mantine/core';
import { IconPlus, IconChevronRight } from '@tabler/icons-react';
import {
    PROMPT_SYNTAX_CATEGORIES,
    getSyntaxByCategory,
    type PromptSyntaxItem,
    type PromptSyntaxCategory,
} from '../data/promptSyntaxData';
import { SwarmActionIcon as ActionIcon } from './ui';

interface PromptSyntaxButtonProps {
    /** Callback when syntax should be inserted */
    onInsert: (text: string) => void;
    /** Callback when a modal-based syntax is selected */
    onOpenModal?: (syntaxId: string) => void;
    /** Size of the button */
    size?: 'xs' | 'sm' | 'md';
    /** Whether the button is disabled */
    disabled?: boolean;
}

/**
 * Button that opens a dropdown menu for inserting prompt syntax.
 * Displays categorized menu of all available SwarmUI prompt syntax features.
 */
export const PromptSyntaxButton = React.memo(function PromptSyntaxButton({
    onInsert,
    onOpenModal,
    size = 'sm',
    disabled = false,
}: PromptSyntaxButtonProps) {
    const [opened, setOpened] = useState(false);

    const syntaxByCategory = getSyntaxByCategory();
    const categories = Object.keys(syntaxByCategory) as PromptSyntaxCategory[];

    const handleItemClick = useCallback((item: PromptSyntaxItem) => {
        if (item.hasModal && onOpenModal) {
            onOpenModal(item.id);
        } else {
            onInsert(item.template);
        }
        setOpened(false);
    }, [onInsert, onOpenModal]);

    return (
        <Menu
            opened={opened}
            onChange={setOpened}
            position="bottom-start"
            width={280}
            shadow="md"
            withArrow
            arrowPosition="center"
        >
            <Menu.Target>
                <Tooltip label="Insert prompt syntax" position="top">
                    <ActionIcon
                        variant="light"
                        color="blue"
                        size={size}
                        disabled={disabled}
                        aria-label="Insert prompt syntax"
                    >
                        <IconPlus size={size === 'xs' ? 12 : size === 'sm' ? 14 : 16} />
                    </ActionIcon>
                </Tooltip>
            </Menu.Target>

            <Menu.Dropdown>
                <Menu.Label>Insert Prompt Syntax</Menu.Label>

                {categories.map((category, categoryIndex) => {
                    const items = syntaxByCategory[category];
                    if (items.length === 0) return null;

                    const categoryInfo = PROMPT_SYNTAX_CATEGORIES[category];

                    return (
                        <React.Fragment key={category}>
                            {categoryIndex > 0 && <Divider my={4} />}

                            <Menu.Label>
                                <Group gap={6}>
                                    <Badge size="xs" color={categoryInfo.color} variant="light">
                                        {categoryInfo.label}
                                    </Badge>
                                </Group>
                            </Menu.Label>

                            {items.map((item) => (
                                <Menu.Item
                                    key={item.id}
                                    onClick={() => handleItemClick(item)}
                                    rightSection={
                                        item.hasModal ? (
                                            <IconChevronRight size={14} opacity={0.5} />
                                        ) : null
                                    }
                                >
                                    <Group gap="xs" wrap="nowrap">
                                        <Text size="sm" fw={500}>
                                            {item.label}
                                        </Text>
                                        <Text size="xs" c="dimmed" truncate style={{ flex: 1 }}>
                                            {item.description}
                                        </Text>
                                    </Group>
                                </Menu.Item>
                            ))}
                        </React.Fragment>
                    );
                })}
            </Menu.Dropdown>
        </Menu>
    );
});

PromptSyntaxButton.displayName = 'PromptSyntaxButton';
