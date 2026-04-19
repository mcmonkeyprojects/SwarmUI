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
    /** Sort mode for results */
    sortMode?: SortMode;
    /** Match mode for filtering */
    matchMode?: MatchMode;
    /** Maximum results to show */
    maxResults?: number;
    /** Callback when an item is selected */
    onSelect?: (entry: AutoCompleteEntry) => void;
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
            const snapshot = result.data as { userData?: { autocompletions?: string[] } } | undefined;
            const autocompletions = snapshot?.userData?.autocompletions ?? [];
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
        if (!enabled || isLoaded || !autocompletionsQuery.data || autocompletionsQuery.data.length === 0) {
            return;
        }
        storeLoad(autocompletionsQuery.data);
    }, [autocompletionsQuery.data, enabled, isLoaded, storeLoad]);

    // Auto-load on mount if not loaded
    useEffect(() => {
        if (enabled && !isLoaded) {
            loadAutocompletions();
        }
    }, [enabled, isLoaded, loadAutocompletions]);

    // Handle text input to extract current word and search
    const handleTextChange = useCallback(
        (text: string, cursorPos: number) => {
            textValueRef.current = text;
            cursorPosRef.current = cursorPos;

            if (!enabled || !isLoaded) {
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
        [enabled, isLoaded, search, sortMode, matchMode, maxResults]
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

    // Call getInputProps once to suppress Downshift warning
    // This hook is designed for external input management (e.g., textareas)
    // so we don't apply these props to any element, but Downshift requires the call
    getInputProps({ suppressRefError: true });

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
