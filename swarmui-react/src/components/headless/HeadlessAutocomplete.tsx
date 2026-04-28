/**
 * HeadlessAutocomplete Component
 *
 * A styled autocomplete dropdown using the headless useHeadlessAutocomplete hook.
 * Maintains visual parity with the existing PromptInput autocomplete while using
 * Downshift for keyboard navigation and accessibility.
 */

import React, { useCallback, useRef, useEffect, forwardRef, useImperativeHandle } from 'react';
import { Paper, Stack, Box, Text, Badge, Group } from '@mantine/core';
import { useHeadlessAutocomplete, type UseHeadlessAutocompleteOptions } from '../../hooks/useHeadlessAutocomplete';
import type { AutoCompleteEntry } from '../../stores/autoCompleteStore';
import '../../styles/autocomplete.css';

export interface HeadlessAutocompleteHandle {
    /** Update the autocomplete based on text/cursor position */
    handleTextChange: (text: string, cursorPos: number) => void;
    /** Handle keyboard navigation, returns true if key was handled */
    handleKeyDown: (e: React.KeyboardEvent) => boolean;
    /** Get the replacement text for a suggestion */
    getReplacementText: (entry: AutoCompleteEntry) => { newText: string; newCursorPos: number };
    /** Close the dropdown */
    close: () => void;
    /** Load autocomplete data on demand */
    ensureLoaded: () => void;
    /** Whether data is loaded */
    isLoaded: boolean;
}

interface HeadlessAutocompleteProps {
    /** Called when a suggestion is selected */
    onSelect: (entry: AutoCompleteEntry, replacement: { newText: string; newCursorPos: number }) => void;
    /** Autocomplete options */
    options?: UseHeadlessAutocompleteOptions;
    /** Position style overrides */
    style?: React.CSSProperties;
}

/**
 * Get tag color class for category coloring
 */
function getTagColorClass(tag: number): string {
    return `tag-type-${Math.min(Math.max(tag, 0), 5)}`;
}

export const HeadlessAutocomplete = forwardRef<HeadlessAutocompleteHandle, HeadlessAutocompleteProps>(
    ({ onSelect, options = {}, style }, ref) => {
        const dropdownRef = useRef<HTMLDivElement>(null);

        const autocomplete = useHeadlessAutocomplete({
            ...options,
            onSelect: undefined,
        });

        const {
            suggestions,
            isOpen,
            highlightedIndex,
            currentWord,
            isLoaded,
            handleTextChange,
            getReplacementText,
            closeMenu,
            loadAutocompletions,
            getInputProps,
            getMenuProps,
            getItemProps,
            setHighlightedIndex,
        } = autocomplete;

        const handleItemSelect = useCallback(
            (entry: AutoCompleteEntry) => {
                const replacement = getReplacementText(entry);
                onSelect(entry, replacement);
                closeMenu();
            },
            [closeMenu, getReplacementText, onSelect]
        );

        // Handle keyboard for selection and navigation
        const handleKeyDown = useCallback(
            (e: React.KeyboardEvent) => {
                if (!isOpen || suggestions.length === 0) return false;

                if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    setHighlightedIndex((highlightedIndex + 1) % suggestions.length);
                    return true;
                }

                if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    setHighlightedIndex(
                        (highlightedIndex - 1 + suggestions.length) % suggestions.length
                    );
                    return true;
                }

                if ((e.key === 'Tab' || e.key === 'Enter') && suggestions[highlightedIndex]) {
                    e.preventDefault();
                    handleItemSelect(suggestions[highlightedIndex]);
                    return true;
                }

                if (e.key === 'Escape') {
                    e.preventDefault();
                    closeMenu();
                    return true;
                }

                return false;
            },
            [closeMenu, handleItemSelect, highlightedIndex, isOpen, setHighlightedIndex, suggestions]
        );

        // Scroll highlighted item into view
        useEffect(() => {
            if (highlightedIndex >= 0 && dropdownRef.current) {
                const items = dropdownRef.current.querySelectorAll('.autocomplete-item');
                const item = items[highlightedIndex] as HTMLElement;
                if (item) {
                    item.scrollIntoView({ block: 'nearest' });
                }
            }
        }, [highlightedIndex]);

        // Expose methods via ref
        useImperativeHandle(
            ref,
            () => ({
                handleTextChange,
                handleKeyDown,
                getReplacementText,
                close: closeMenu,
                ensureLoaded: () => {
                    void loadAutocompletions();
                },
                isLoaded,
            }),
            [closeMenu, getReplacementText, handleKeyDown, handleTextChange, isLoaded, loadAutocompletions]
        );

        // Always render the menu element to satisfy Downshift's requirement that getMenuProps is always called
        const shouldShow = isOpen && suggestions.length > 0;

        return (
            <>
            <input
                {...getInputProps({
                    value: currentWord,
                    readOnly: true,
                    tabIndex: -1,
                    'aria-hidden': true,
                })}
                style={{
                    position: 'absolute',
                    width: 1,
                    height: 1,
                    opacity: 0,
                    pointerEvents: 'none',
                }}
            />
            <Paper
                ref={dropdownRef}
                shadow="md"
                withBorder
                className="autocomplete-dropdown"
                style={{
                    position: 'absolute',
                    top: '100%',
                    left: 0,
                    right: 0,
                    zIndex: 1000,
                    maxHeight: 300,
                    overflow: 'auto',
                    display: shouldShow ? 'block' : 'none',
                    ...style,
                }}
                {...getMenuProps({ onKeyDown: handleKeyDown })}
            >
                <Stack gap={0}>
                    {suggestions.map((entry, idx) => (
                        <Box
                            key={`${entry.name}-${idx}`}
                            p="xs"
                            className={`autocomplete-item ${idx === highlightedIndex ? 'selected' : ''}`}
                            style={{
                                cursor: 'pointer',
                                backgroundColor:
                                    idx === highlightedIndex
                                        ? 'var(--mantine-color-blue-light)'
                                        : 'transparent',
                            }}
                            {...getItemProps({
                                item: entry,
                                index: idx,
                                onClick: () => handleItemSelect(entry),
                            })}
                        >
                            <Group justify="space-between" wrap="nowrap">
                                <Text
                                    size="sm"
                                    className={getTagColorClass(entry.tag)}
                                    style={{ fontWeight: 500 }}
                                >
                                    {entry.clean || entry.name}
                                </Text>
                                {entry.countDisplay && (
                                    <Badge size="xs" variant="light" color="gray">
                                        {entry.countDisplay}
                                    </Badge>
                                )}
                            </Group>
                            {/* Related tags - show only for highlighted item */}
                            {entry.alts && entry.alts.length > 0 && idx === highlightedIndex && (
                                <Box mt={4}>
                                    <Text size="xs" c="dimmed" mb={2}>
                                        Related tags (click to add):
                                    </Text>
                                    <Group gap={4} wrap="wrap">
                                        {entry.alts.slice(0, 8).map((alt) => (
                                            <Badge
                                                key={alt}
                                                size="xs"
                                                variant="outline"
                                                color="blue"
                                                style={{ cursor: 'pointer' }}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    // Create a synthetic entry for the alt tag
                                                    const altEntry: AutoCompleteEntry = {
                                                        name: alt,
                                                        clean: alt.replace(/_/g, ' '),
                                                        low: alt.toLowerCase(),
                                                        raw: alt,
                                                        tag: entry.tag,
                                                        count: 0,
                                                        countDisplay: '',
                                                        alts: [],
                                                    };
                                                    handleItemSelect(altEntry);
                                                }}
                                            >
                                                {alt.replace(/_/g, ' ')}
                                            </Badge>
                                        ))}
                                        {entry.alts.length > 8 && (
                                            <Text size="xs" c="dimmed">
                                                +{entry.alts.length - 8} more
                                            </Text>
                                        )}
                                    </Group>
                                </Box>
                            )}
                        </Box>
                    ))}
                </Stack>
                {/* Keyboard hints */}
                <Box className="autocomplete-hint">
                    <Text size="xs" c="dimmed">
                        <kbd>↑↓</kbd> navigate
                    </Text>
                    <Text size="xs" c="dimmed">
                        <kbd>Tab</kbd> select
                    </Text>
                    <Text size="xs" c="dimmed">
                        <kbd>Esc</kbd> close
                    </Text>
                </Box>
            </Paper>
            </>
        );
    }
);

HeadlessAutocomplete.displayName = 'HeadlessAutocomplete';
