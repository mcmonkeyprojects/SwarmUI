/**
 * HeadlessCombobox Component
 *
 * A searchable select/combobox using Downshift's useCombobox.
 * Provides accessible, keyboard-navigable dropdowns with filtering.
 * Styled to match Mantine Select appearance.
 */

import React, { useState, useMemo, useRef } from 'react';
import { useCombobox } from 'downshift';
import { TextInput, Paper, Stack, Text, ScrollArea, Box } from '@mantine/core';
import { IconChevronDown, IconCheck } from '@tabler/icons-react';
import './headless-combobox.css';

export interface ComboboxOption {
    value: string;
    label: string;
    group?: string;
}

export interface HeadlessComboboxProps {
    /** Available options */
    options: ComboboxOption[];
    /** Currently selected value */
    value: string | null;
    /** Called when selection changes */
    onChange: (value: string | null) => void;
    /** Placeholder text */
    placeholder?: string;
    /** Input label */
    label?: string;
    /** Left section icon */
    leftSection?: React.ReactNode;
    /** Whether to allow clearing */
    clearable?: boolean;
    /** Whether the dropdown is searchable */
    searchable?: boolean;
    /** Maximum height of dropdown */
    maxDropdownHeight?: number;
    /** Z-index for dropdown */
    zIndex?: number;
    /** Disabled state */
    disabled?: boolean;
    /** Style overrides */
    style?: React.CSSProperties;
}

export function HeadlessCombobox({
    options,
    value,
    onChange,
    placeholder = 'Select...',
    label,
    leftSection,
    clearable = true,
    searchable = true,
    maxDropdownHeight = 300,
    zIndex = 1000,
    disabled = false,
    style,
}: HeadlessComboboxProps) {
    const [searchValue, setSearchValue] = useState('');
    const inputRef = useRef<HTMLInputElement>(null);

    // Find selected option
    const selectedOption = useMemo(
        () => options.find((opt) => opt.value === value) || null,
        [options, value]
    );

    // Filter options based on input
    const filteredOptions = useMemo(() => {
        if (!searchable || !searchValue) return options;
        const lower = searchValue.toLowerCase();
        return options.filter(
            (opt) =>
                opt.label.toLowerCase().includes(lower) ||
                opt.value.toLowerCase().includes(lower)
        );
    }, [options, searchValue, searchable]);

    // Group options
    const groupedOptions = useMemo(() => {
        const groups = new Map<string, ComboboxOption[]>();
        filteredOptions.forEach((opt) => {
            const group = opt.group || '';
            if (!groups.has(group)) {
                groups.set(group, []);
            }
            groups.get(group)!.push(opt);
        });
        return groups;
    }, [filteredOptions]);

    const {
        isOpen,
        getToggleButtonProps,
        getMenuProps,
        getInputProps,
        getItemProps,
        highlightedIndex,
        openMenu,
        closeMenu,
    } = useCombobox({
        items: filteredOptions,
        selectedItem: selectedOption,
        itemToString: (item) => item?.label || '',
        onInputValueChange: ({ inputValue: newValue }) => {
            if (searchable) {
                setSearchValue(newValue || '');
            }
        },
        onSelectedItemChange: ({ selectedItem }) => {
            onChange(selectedItem?.value || null);
            setSearchValue('');
        },
        stateReducer: (_state, actionAndChanges) => {
            const { changes, type } = actionAndChanges;
            switch (type) {
                case useCombobox.stateChangeTypes.InputKeyDownEnter:
                case useCombobox.stateChangeTypes.ItemClick:
                    return {
                        ...changes,
                        isOpen: false,
                    };
                case useCombobox.stateChangeTypes.InputBlur:
                    return {
                        ...changes,
                        isOpen: false,
                    };
                default:
                    return changes;
            }
        },
    });

    // Handle clear
    const handleClear = (e: React.MouseEvent) => {
        e.stopPropagation();
        onChange(null);
        setSearchValue('');
        closeMenu();
    };

    // Flatten items for rendering with group headers
    const flatItems: { type: 'group' | 'item'; data: string | ComboboxOption; index?: number }[] =
        useMemo(() => {
            const result: { type: 'group' | 'item'; data: string | ComboboxOption; index?: number }[] =
                [];
            let itemIndex = 0;
            groupedOptions.forEach((items, group) => {
                if (group) {
                    result.push({ type: 'group', data: group });
                }
                items.forEach((item) => {
                    result.push({ type: 'item', data: item, index: itemIndex });
                    itemIndex++;
                });
            });
            return result;
        }, [groupedOptions]);

    return (
        <div className="headless-combobox" style={{ position: 'relative', ...style }}>
            <div {...getToggleButtonProps()}>
                <TextInput
                    {...getInputProps({
                        ref: inputRef,
                        onFocus: () => {
                            if (searchable) {
                                setSearchValue('');
                            }
                            openMenu();
                        },
                        onClick: () => {
                            if (searchable && !isOpen) {
                                setSearchValue('');
                            }
                            openMenu();
                        },
                        onBlur: () => {
                            if (!searchable) {
                                setSearchValue('');
                            }
                        }
                    })}
                    label={label}
                    placeholder={placeholder}
                    leftSection={leftSection}
                    rightSection={
                        <div className="headless-combobox-right" style={{ pointerEvents: 'none' }}>
                            {clearable && value && (
                                <button
                                    type="button"
                                    className="headless-combobox-clear"
                                    onClick={handleClear}
                                    aria-label="Clear selection"
                                    style={{ pointerEvents: 'auto' }}
                                >
                                    ×
                                </button>
                            )}
                            <IconChevronDown
                                size={16}
                                className={`headless-combobox-chevron ${isOpen ? 'open' : ''}`}
                            />
                        </div>
                    }
                    readOnly={!searchable}
                    disabled={disabled}
                />
            </div>

            {/* Dropdown */}
            {isOpen && (
                <Paper
                    {...getMenuProps()}
                    shadow="md"
                    withBorder
                    className="headless-combobox-dropdown open"
                    style={{
                        zIndex,
                    }}
                >
                    <ScrollArea h={Math.min(maxDropdownHeight, 240)} mah={maxDropdownHeight}>
                        <Stack gap={0}>
                            {flatItems.map((item) => {
                                if (item.type === 'group') {
                                    return (
                                        <Text
                                            key={`group-${item.data}`}
                                            size="xs"
                                            c="dimmed"
                                            fw={600}
                                            p="xs"
                                            style={{ textTransform: 'uppercase' }}
                                        >
                                            {item.data as string}
                                        </Text>
                                    );
                                }

                                const option = item.data as ComboboxOption;
                                const isSelected = option.value === value;
                                const isHighlighted = item.index === highlightedIndex;

                                return (
                                    <Box
                                        key={option.value}
                                        {...getItemProps({ item: option, index: item.index! })}
                                        className={`headless-combobox-item ${isHighlighted ? 'highlighted' : ''} ${isSelected ? 'selected' : ''}`}
                                    >
                                        <Text size="sm">{option.label}</Text>
                                        {isSelected && <IconCheck size={14} />}
                                    </Box>
                                );
                            })}
                            {filteredOptions.length === 0 && (
                                <Text size="sm" c="dimmed" p="md" ta="center">
                                    No options found
                                </Text>
                            )}
                        </Stack>
                    </ScrollArea>
                </Paper>
            )}
        </div>
    );
}
