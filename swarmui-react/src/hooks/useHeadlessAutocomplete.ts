/**
 * useHeadlessAutocomplete Hook
 * Provides autocomplete functionality using Downshift's useCombobox.
 * A headless alternative to useAutoComplete that handles keyboard navigation,
 * ARIA attributes, and focus management automatically.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { useCombobox, type UseComboboxStateChange } from 'downshift';
import {
    useAutoCompleteStore,
    type AutoCompleteEntry,
    type SortMode,
    type MatchMode,
} from '../stores/autoCompleteStore';
import { useBackendAutocompletions } from './useBackendBootstrap';

export interface UseHeadlessAutocompleteOptions {
    /** Whether autocomplete is enabled */
    enabled?: boolean;
    /** Whether autocomplete should preload on mount */
    loadOnMount?: boolean;
    /** Sort mode for results */
    sortMode?: SortMode;
    /** Match mode for filtering */
    matchMode?: MatchMode;
    /** Maximum results to show */
    maxResults?: number;
    /** Callback when an item is selected */
    onSelect?: (entry: AutoCompleteEntry) => void;
}

function normalizeAutocompletions(value: unknown): string[] {
    if (Array.isArray(value)) {
        return value.filter((item): item is string => typeof item === 'string');
    }
    if (value && typeof value === 'object' && 'userData' in value) {
        const userData = (value as { userData?: { autocompletions?: unknown } }).userData;
        if (Array.isArray(userData?.autocompletions)) {
            return userData.autocompletions.filter((item): item is string => typeof item === 'string');
        }
    }
    return [];
}

/**
 * Find the start and end of the current word at cursor position.
 * Words are separated by commas, spaces, or newlines.
 */
function findWordBounds(text: string, cursorPos: number): { start: number; end: number } {
    let start = cursorPos;
    while (start > 0) {
        const char = text[start - 1];
        if (char === ',' || char === ' ' || char === '\n' || char === '\t') {
            break;
        }
        start--;
    }
    while (start < cursorPos && (text[start] === ' ' || text[start] === '\t')) {
        start++;
    }

    let end = cursorPos;
    while (end < text.length) {
        const char = text[end];
        if (char === ',' || char === ' ' || char === '\n' || char === '\t') {
            break;
        }
        end++;
    }

    return { start, end };
}

export function useHeadlessAutocomplete(options: UseHeadlessAutocompleteOptions = {}) {
    const {
        enabled = true,
        loadOnMount = false,
        sortMode = 'Active',
        matchMode = 'Bucketed',
        maxResults = 50,
        onSelect,
    } = options;

    const [suggestions, setSuggestions] = useState<AutoCompleteEntry[]>([]);
    const [currentWord, setCurrentWord] = useState('');
    const cursorPosRef = useRef(0);
    const textValueRef = useRef('');
    const loadingRef = useRef(false);

    // Store access
    const isLoaded = useAutoCompleteStore((state) => state.isLoaded);
    const search = useAutoCompleteStore((state) => state.search);
    const storeLoad = useAutoCompleteStore((state) => state.loadAutocompletions);
    const autocompletionsQuery = useBackendAutocompletions({ enabled });

    const loadAutocompletions = useCallback(async () => {
        if (isLoaded || loadingRef.current) return;
        loadingRef.current = true;

        try {
            const result = await autocompletionsQuery.refetch();
            const autocompletions = normalizeAutocompletions(result.data);
            if (autocompletions.length > 0) {
                storeLoad(autocompletions);
            }
        } catch (error) {
            console.error('[useHeadlessAutocomplete] Failed to load autocompletions:', error);
        } finally {
            loadingRef.current = false;
        }
    }, [autocompletionsQuery, isLoaded, storeLoad]);

    useEffect(() => {
        const autocompletions = normalizeAutocompletions(autocompletionsQuery.data);
        if (!enabled || isLoaded || autocompletions.length === 0) {
            return;
        }
        storeLoad(autocompletions);
    }, [autocompletionsQuery.data, enabled, isLoaded, storeLoad]);

    useEffect(() => {
        if (enabled && loadOnMount && !isLoaded) {
            void loadAutocompletions();
        }
    }, [enabled, isLoaded, loadOnMount, loadAutocompletions]);

    // Handle text input to extract current word and search
    const handleTextChange = useCallback(
        (text: string, cursorPos: number) => {
            textValueRef.current = text;
            cursorPosRef.current = cursorPos;

            if (!enabled) {
                setSuggestions([]);
                setCurrentWord('');
                return;
            }

            if (!isLoaded) {
                void loadAutocompletions();
                setSuggestions([]);
                setCurrentWord('');
                return;
            }

            const { start } = findWordBounds(text, cursorPos);
            const word = text.substring(start, cursorPos).trim();

            if (word.length < 2) {
                setSuggestions([]);
                setCurrentWord('');
                return;
            }

            setCurrentWord(word);
            const results = search(word, { sortMode, matchMode, maxResults });
            setSuggestions(results);
        },
        [enabled, isLoaded, loadAutocompletions, search, sortMode, matchMode, maxResults]
    );

    // Get replacement text when selecting a suggestion
    const getReplacementText = useCallback(
        (entry: AutoCompleteEntry): { newText: string; newCursorPos: number } => {
            const text = textValueRef.current;
            const cursorPos = cursorPosRef.current;
            const { start } = findWordBounds(text, cursorPos);

            const before = text.substring(0, start);
            const after = text.substring(cursorPos);
            const replacement = entry.clean || entry.name;

            const newText = before + replacement + after;
            const newCursorPos = start + replacement.length;

            return { newText, newCursorPos };
        },
        []
    );

    // Downshift combobox configuration
    const {
        isOpen,
        highlightedIndex,
        getMenuProps,
        getInputProps,
        getItemProps,
        closeMenu,
        openMenu,
        setHighlightedIndex,
    } = useCombobox({
        items: suggestions,
        inputValue: currentWord,
        itemToString: (item) => item?.clean || item?.name || '',
        onSelectedItemChange: ({ selectedItem }: UseComboboxStateChange<AutoCompleteEntry>) => {
            if (selectedItem && onSelect) {
                onSelect(selectedItem);
            }
        },
        // Don't let downshift control our input value directly
        stateReducer: (state, actionAndChanges) => {
            const { changes, type } = actionAndChanges;
            switch (type) {
                case useCombobox.stateChangeTypes.InputKeyDownEnter:
                case useCombobox.stateChangeTypes.ItemClick:
                    return {
                        ...changes,
                        isOpen: false,
                        inputValue: state.inputValue, // Keep current input value
                    };
                default:
                    return changes;
            }
        },
    });

    // Close menu when suggestions are empty
    useEffect(() => {
        if (suggestions.length === 0) {
            closeMenu();
        } else if (suggestions.length > 0 && currentWord.length >= 2) {
            openMenu();
        }
    }, [suggestions.length, currentWord.length, closeMenu, openMenu]);

    return {
        // State
        suggestions,
        isOpen: isOpen && suggestions.length > 0,
        highlightedIndex,
        isLoaded,
        currentWord,

        // Actions
        handleTextChange,
        getReplacementText,
        closeMenu,
        setHighlightedIndex,
        loadAutocompletions,

        // Downshift props (for a11y)
        getMenuProps,
        getInputProps,
        getItemProps,
    };
}
