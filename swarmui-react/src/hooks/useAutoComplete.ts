/**
 * useAutoComplete Hook
 * Provides autocomplete functionality for prompt text inputs.
 * Uses the autoCompleteStore for word list data.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import {
    useAutoCompleteStore,
    type AutoCompleteEntry,
    type SortMode,
    type MatchMode
} from '../stores/autoCompleteStore';
import { useBackendAutocompletions } from './useBackendBootstrap';

export interface UseAutoCompleteOptions {
    /** Whether autocomplete is enabled */
    enabled?: boolean;
    /** Sort mode for results */
    sortMode?: SortMode;
    /** Match mode for filtering */
    matchMode?: MatchMode;
    /** Maximum results to show */
    maxResults?: number;
}

export interface UseAutoCompleteReturn {
    /** Current suggestions */
    suggestions: AutoCompleteEntry[];
    /** Currently selected index */
    selectedIndex: number;
    /** Set the selected index */
    setSelectedIndex: (idx: number) => void;
    /** Whether suggestions are visible */
    isOpen: boolean;
    /** Handle text input change */
    handleInput: (text: string, cursorPos: number) => void;
    /** Get replacement text when selecting a suggestion */
    getReplacementText: (
        entry: AutoCompleteEntry,
        currentText: string,
        cursorPos: number
    ) => { newText: string; newCursorPos: number };
    /** Handle keyboard navigation, returns true if key was handled */
    handleKeyDown: (e: React.KeyboardEvent) => boolean;
    /** Close suggestions */
    close: () => void;
    /** Whether data is loaded */
    isLoaded: boolean;
    /** Manually load autocompletions */
    loadAutocompletions: () => Promise<void>;
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
    // Find word start (scan backwards)
    let start = cursorPos;
    while (start > 0) {
        const char = text[start - 1];
        if (char === ',' || char === ' ' || char === '\n' || char === '\t') {
            break;
        }
        start--;
    }
    // Skip leading whitespace
    while (start < cursorPos && (text[start] === ' ' || text[start] === '\t')) {
        start++;
    }

    // Find word end (scan forwards)
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

export function useAutoComplete(options: UseAutoCompleteOptions = {}): UseAutoCompleteReturn {
    const {
        enabled = true,
        sortMode = 'Active',
        matchMode = 'Bucketed',
        maxResults = 50,
    } = options;

    const [suggestions, setSuggestions] = useState<AutoCompleteEntry[]>([]);
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [isOpen, setIsOpen] = useState(false);

    // Refs for caching
    const lastQueryRef = useRef<string>('');
    const lastResultsRef = useRef<AutoCompleteEntry[]>([]);
    const loadingRef = useRef(false);

    // Store access - subscribe to isLoaded reactively
    const isLoaded = useAutoCompleteStore(state => state.isLoaded);
    const search = useAutoCompleteStore(state => state.search);
    const storeLoad = useAutoCompleteStore(state => state.loadAutocompletions);
    const autocompletionsQuery = useBackendAutocompletions({ enabled });

    const loadAutocompletions = useCallback(async () => {
        if (isLoaded || loadingRef.current) return;
        loadingRef.current = true;

        try {
            const result = await autocompletionsQuery.refetch();
            const autocompletions = normalizeAutocompletions(result.data);
            if (autocompletions.length > 0) {
                console.debug(`[useAutoComplete] Received ${autocompletions.length} entries`);
                storeLoad(autocompletions);
            } else {
                console.debug('[useAutoComplete] No autocompletions in user data. Make sure AutoCompletionsSource is configured in SwarmUI User Settings.');
            }
        } catch (error) {
            console.error('[useAutoComplete] Failed to load autocompletions:', error);
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

    // Auto-load on mount if not loaded
    useEffect(() => {
        if (enabled && !isLoaded) {
            loadAutocompletions();
        }
    }, [enabled, isLoaded, loadAutocompletions]);

    const handleInput = useCallback((text: string, cursorPos: number) => {
        if (!enabled || !isLoaded) {
            setSuggestions([]);
            setIsOpen(false);
            return;
        }

        const { start } = findWordBounds(text, cursorPos);
        const word = text.substring(start, cursorPos).trim();

        // Require at least 2 characters
        if (word.length < 2) {
            setSuggestions([]);
            setIsOpen(false);
            lastQueryRef.current = '';
            return;
        }

        // Use cached results if query is a refinement of last query
        let results: AutoCompleteEntry[];
        if (lastQueryRef.current && word.startsWith(lastQueryRef.current)) {
            // Filter from cached results for incremental search
            const wordLow = word.toLowerCase();
            results = lastResultsRef.current.filter(entry =>
                entry.low.includes(wordLow) || entry.alts.some(alt => alt.includes(wordLow))
            );
        } else {
            // Full search
            results = search(word, { sortMode, matchMode, maxResults });
        }

        lastQueryRef.current = word;
        lastResultsRef.current = results;

        setSuggestions(results);
        setSelectedIndex(0);
        setIsOpen(results.length > 0);
    }, [enabled, isLoaded, search, sortMode, matchMode, maxResults]);

    const getReplacementText = useCallback((
        entry: AutoCompleteEntry,
        currentText: string,
        cursorPos: number
    ): { newText: string; newCursorPos: number } => {
        const { start } = findWordBounds(currentText, cursorPos);

        // Build replacement
        const before = currentText.substring(0, start);
        const after = currentText.substring(cursorPos);
        const replacement = entry.clean || entry.name;

        const newText = before + replacement + after;
        const newCursorPos = start + replacement.length;

        return { newText, newCursorPos };
    }, []);

    const handleKeyDown = useCallback((e: React.KeyboardEvent): boolean => {
        if (!isOpen || suggestions.length === 0) {
            return false;
        }

        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                setSelectedIndex(prev => Math.min(prev + 1, suggestions.length - 1));
                return true;
            case 'ArrowUp':
                e.preventDefault();
                setSelectedIndex(prev => Math.max(prev - 1, 0));
                return true;
            case 'Tab':
            case 'Enter':
                if (suggestions[selectedIndex]) {
                    e.preventDefault();
                    return true; // Signal that a selection should happen
                }
                return false;
            case 'Escape':
                e.preventDefault();
                setIsOpen(false);
                return true;
            case 'PageDown':
                e.preventDefault();
                setSelectedIndex(prev => Math.min(prev + 5, suggestions.length - 1));
                return true;
            case 'PageUp':
                e.preventDefault();
                setSelectedIndex(prev => Math.max(prev - 5, 0));
                return true;
            default:
                return false;
        }
    }, [isOpen, suggestions, selectedIndex]);

    const close = useCallback(() => {
        setIsOpen(false);
        setSuggestions([]);
    }, []);

    return {
        suggestions,
        selectedIndex,
        setSelectedIndex,
        isOpen,
        handleInput,
        getReplacementText,
        handleKeyDown,
        close,
        isLoaded,
        loadAutocompletions,
    };
}
