import React, { useState, useEffect, useRef, useMemo, useCallback, forwardRef, useImperativeHandle } from 'react';
import { Textarea, TextInput, Text, Group, Tooltip, Popover, Stack, Switch, Select, Loader, Chip, Badge } from '@mantine/core';
import { IconSparkles, IconWand, IconClearAll, IconClipboard, IconTextCaption, IconArrowsUpDown, IconLanguage, IconSettings, IconBrain } from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { getTokenWarning } from '../utils/tokenCounter';
import { useTokenCount } from '../hooks/useTokenCount';
import { checkLanguage, applyCorrections, scanLanguageOffline, type LanguageMatch } from '../utils/languageCorrection';
import { autocorrectPromptText } from '../utils/promptTextTools';
import { registerPromptTargetHandlers, setActivePromptTarget, shouldUseNativePromptContextMenu } from '../utils/promptContextRegistry';
import { PromptSyntaxButton } from './PromptSyntaxButton';
import { SegmentSyntaxModal } from './modals/SegmentSyntaxModal';
import { RegionSyntaxModal } from './modals/RegionSyntaxModal';
import { HeadlessAutocomplete, type HeadlessAutocompleteHandle } from './headless/HeadlessAutocomplete';
import { type AutoCompleteEntry } from '../stores/autoCompleteStore';
import { ContextMenu, useContextMenu, type ContextMenuItem } from './ContextMenu';
import { usePromptEnhanceStore, PROMPT_STYLE_PRESETS } from '../stores/promptEnhanceStore';
import { enhancePrompt as enhancePromptApi, probeAssistantConnection } from '../services/magicPromptService';
import { useAssistantStore } from '../stores/assistantStore';
import { SwarmActionIcon as ActionIcon } from './ui';
import '../styles/autocomplete.css';

interface PromptInputProps {
    label: string;
    placeholder?: string;
    value: string;
    onChange: (value: string) => void;
    minRows?: number;
    maxRows?: number;
    required?: boolean;
    autosize?: boolean;
    /** Show the prompt syntax insertion button */
    showSyntaxButton?: boolean;
}

export interface PromptInputHandle {
    /** Insert text at the current cursor position */
    insertTextAtCursor: (text: string) => void;
}

export const PromptInput = React.memo(forwardRef<PromptInputHandle, PromptInputProps>(({
    label,
    placeholder,
    value,
    onChange,
    minRows = 3,
    maxRows = 12,
    required = false,
    autosize = true,
    showSyntaxButton = false,
}, ref) => {
    const targetIdRef = useRef(`prompt-input-${Math.random().toString(36).slice(2)}`);

    // Local state for immediate typing feedback
    const [localValue, setLocalValue] = useState(value);
    const [autocompleteEnabled, setAutocompleteEnabled] = useState(true);

    // Modal states for syntax insertion
    const [segmentModalOpen, setSegmentModalOpen] = useState(false);
    const [regionModalOpen, setRegionModalOpen] = useState(false);

    // Refs
    const isTypingRef = useRef(false);
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const autocompleteRef = useRef<HeadlessAutocompleteHandle>(null);

    // Context menu for right-click options
    const contextMenu = useContextMenu();
    const [contextWordMatch, setContextWordMatch] = useState<LanguageMatch | null>(null);

    // Autocorrect: fix common prompt issues
    const autocorrectText = useCallback((text: string): string => {
        return autocorrectPromptText(text);
    }, []);

    // Handle autocorrect action
    const handleAutocorrect = useCallback(() => {
        const corrected = autocorrectText(localValue);
        setLocalValue(corrected);
        onChange(corrected);
    }, [localValue, onChange, autocorrectText]);

    // Handle clear action
    const handleClear = useCallback(() => {
        setLocalValue('');
        onChange('');
    }, [onChange]);

    // Handle paste from clipboard
    const handlePaste = useCallback(async () => {
        try {
            const text = await navigator.clipboard.readText();
            const textarea = textareaRef.current;
            if (!textarea) {
                const newValue = localValue + text;
                setLocalValue(newValue);
                onChange(newValue);
                return;
            }
            const start = textarea.selectionStart || 0;
            const end = textarea.selectionEnd || 0;
            const before = localValue.substring(0, start);
            const after = localValue.substring(end);
            const newValue = before + text + after;
            setLocalValue(newValue);
            onChange(newValue);
        } catch {
            // Clipboard access denied
        }
    }, [localValue, onChange]);

    // Handle lowercase conversion
    const handleLowercase = useCallback(() => {
        const lowered = localValue.toLowerCase();
        setLocalValue(lowered);
        onChange(lowered);
    }, [localValue, onChange]);

    // Handle swap lines (reverse line order)
    const handleSwapLines = useCallback(() => {
        const lines = localValue.split('\n');
        const reversed = lines.reverse().join('\n');
        setLocalValue(reversed);
        onChange(reversed);
    }, [localValue, onChange]);

    // Handle grammar check with offline-first language scanning
    const [isCheckingGrammar, setIsCheckingGrammar] = useState(false);

    const handleGrammarCheck = useCallback(async () => {
        if (!localValue.trim() || isCheckingGrammar) return;

        setIsCheckingGrammar(true);
        try {
            const result = await checkLanguage(localValue);
            const sourceLabel = result.source === 'languagetool-online'
                ? 'online language service'
                : 'offline spell scan';

            if (result.matches.length === 0) {
                notifications.show({
                    title: 'Grammar Check',
                    message: `No issues found (${sourceLabel}).`,
                    color: 'green',
                });
            } else {
                const corrected = applyCorrections(localValue, result.matches);
                setLocalValue(corrected);
                onChange(corrected);
                notifications.show({
                    title: 'Grammar Check',
                    message: `Fixed ${result.matches.length} issue(s) via ${sourceLabel}`,
                    color: 'blue',
                });
            }
        } catch {
            notifications.show({
                title: 'Grammar Check Failed',
                message: 'Language scan failed unexpectedly',
                color: 'red',
            });
        } finally {
            setIsCheckingGrammar(false);
        }
    }, [localValue, onChange, isCheckingGrammar]);

    // Prompt enhancement via MagicPrompt
    const enhanceEnabled = usePromptEnhanceStore((s) => s.enabled);
    const enhanceEndpointUrl = usePromptEnhanceStore((s) => s.endpointUrl);
    const enhanceModelId = usePromptEnhanceStore((s) => s.modelId);
    const enhanceSystemPrompt = usePromptEnhanceStore((s) => s.systemPrompt);
    const detectedServerMode = usePromptEnhanceStore((s) => s.detectedServerMode);
    const connectionStatus = usePromptEnhanceStore((s) => s.connectionStatus);
    const connectionMessage = usePromptEnhanceStore((s) => s.connectionMessage);
    const availableModels = usePromptEnhanceStore((s) => s.availableModels);
    const isEnhancing = usePromptEnhanceStore((s) => s.isEnhancing);
    const setEnhancing = usePromptEnhanceStore((s) => s.setEnhancing);
    const setEnhanceError = usePromptEnhanceStore((s) => s.setLastError);
    const setEnhanceEnabled = usePromptEnhanceStore((s) => s.setEnabled);
    const setEnhanceEndpointUrl = usePromptEnhanceStore((s) => s.setEndpointUrl);
    const setEnhanceModelId = usePromptEnhanceStore((s) => s.setModelId);
    const setEnhanceSystemPrompt = usePromptEnhanceStore((s) => s.setSystemPrompt);
    const assistantSystemPrompt = usePromptEnhanceStore((s) => s.assistantSystemPrompt);
    const setAssistantSystemPrompt = usePromptEnhanceStore((s) => s.setAssistantSystemPrompt);
    const setDetectedServerMode = usePromptEnhanceStore((s) => s.setDetectedServerMode);
    const setConnectionState = usePromptEnhanceStore((s) => s.setConnectionState);
    const setAvailableModels = usePromptEnhanceStore((s) => s.setAvailableModels);
    const setLastSuccessfulModelId = usePromptEnhanceStore((s) => s.setLastSuccessfulModelId);
    const activePresetKey = usePromptEnhanceStore((s) => s.activePresetKey);
    const applyPreset = usePromptEnhanceStore((s) => s.applyPreset);
    const setAssistantConnection = useAssistantStore((s) => s.setConnection);
    const setAssistantSelectedModelId = useAssistantStore((s) => s.setSelectedModelId);

    const [enhanceSettingsOpen, setEnhanceSettingsOpen] = useState(false);
    const [loadingModels, setLoadingModels] = useState(false);

    const loadModels = useCallback(async () => {
        setLoadingModels(true);
        setConnectionState({
            status: 'connecting',
            message: 'Checking assistant endpoint...',
            availableModels,
            detectedServerMode,
        });
        try {
            const probe = await probeAssistantConnection(enhanceEndpointUrl);
            const normalizedModels = probe.connection.models.map((model) => ({
                id: model.id,
                name: model.name,
            }));

            setAvailableModels(normalizedModels);
            setDetectedServerMode(probe.connection.serverMode);
            setConnectionState({
                status: probe.connection.state,
                message: probe.connection.message,
                availableModels: normalizedModels,
                detectedServerMode: probe.connection.serverMode,
            });
            setAssistantConnection(probe.connection);

            if (normalizedModels.length > 0) {
                const nextModelId = enhanceModelId && normalizedModels.some((model) => model.id === enhanceModelId)
                    ? enhanceModelId
                    : normalizedModels[0].id;
                setEnhanceModelId(nextModelId);
                setAssistantSelectedModelId(nextModelId);
                notifications.show({
                    title: 'Assistant Connected',
                    message: probe.connection.message || `Connected to ${enhanceEndpointUrl}.`,
                    color: 'teal',
                });
            } else {
                notifications.show({
                    title: 'Assistant Reachable',
                    message: probe.connection.message || 'Connected but no text models were found.',
                    color: 'yellow',
                });
            }
        } catch {
            setAvailableModels([]);
            setDetectedServerMode(null);
            const likelyCorsMessage = enhanceEndpointUrl.includes('localhost') || enhanceEndpointUrl.includes('127.0.0.1')
                ? `Could not connect to ${enhanceEndpointUrl}. Ensure your local LLM server is running.`
                : `Could not read ${enhanceEndpointUrl}. If this is a LAN endpoint, enable CORS on the LLM server.`;
            setConnectionState({
                status: 'unreachable',
                message: likelyCorsMessage,
                availableModels: [],
                detectedServerMode: null,
            });
            notifications.show({
                title: 'Connection Failed',
                message: likelyCorsMessage,
                color: 'red',
            });
        } finally {
            setLoadingModels(false);
        }
    }, [
        availableModels,
        detectedServerMode,
        enhanceEndpointUrl,
        enhanceModelId,
        setAssistantConnection,
        setAssistantSelectedModelId,
        setAvailableModels,
        setConnectionState,
        setDetectedServerMode,
        setEnhanceModelId,
    ]);

    const handleEnhancePrompt = useCallback(async () => {
        if (!localValue.trim() || isEnhancing || !enhanceModelId) return;

        setEnhancing(true);
        setEnhanceError(null);
        try {
            const result = await enhancePromptApi(
                localValue,
                enhanceModelId,
                enhanceSystemPrompt,
                enhanceEndpointUrl,
                detectedServerMode
            );
            if (result.success && result.response) {
                setLocalValue(result.response);
                onChange(result.response);
                setLastSuccessfulModelId(enhanceModelId);
                notifications.show({
                    title: 'Prompt Enhanced',
                    message: `Prompt successfully enhanced using "${enhanceModelId}".`,
                    color: 'green',
                });
            } else {
                const errMsg = result.error || 'Enhancement failed';
                setEnhanceError(errMsg);
                notifications.show({
                    title: 'Enhancement Failed',
                    message: errMsg,
                    color: 'red',
                });
            }
        } catch (err) {
            const errMsg = err instanceof Error ? err.message : 'Enhancement failed';
            setEnhanceError(errMsg);
            notifications.show({
                title: 'Enhancement Failed',
                message: errMsg,
                color: 'red',
            });
        } finally {
            setEnhancing(false);
        }
    }, [
        detectedServerMode,
        enhanceEndpointUrl,
        enhanceModelId,
        enhanceSystemPrompt,
        isEnhancing,
        localValue,
        onChange,
        setEnhanceError,
        setEnhancing,
        setLastSuccessfulModelId,
    ]);

    useEffect(() => {
        const unregister = registerPromptTargetHandlers(targetIdRef.current, {
            onAutocorrectFormat: () => {
                const corrected = autocorrectText(localValue);
                setLocalValue(corrected);
                onChange(corrected);
            },
            onGrammarCheck: () => {
                void handleGrammarCheck();
            },
        });

        return unregister;
    }, [autocorrectText, handleGrammarCheck, localValue, onChange]);

    const applyContextSuggestion = useCallback((replacement: string) => {
        if (!contextWordMatch) return;

        const before = localValue.substring(0, contextWordMatch.offset);
        const after = localValue.substring(contextWordMatch.offset + contextWordMatch.length);
        const updatedValue = before + replacement + after;

        setLocalValue(updatedValue);
        onChange(updatedValue);

        const newCursorPos = contextWordMatch.offset + replacement.length;
        setTimeout(() => {
            if (textareaRef.current) {
                textareaRef.current.focus();
                textareaRef.current.setSelectionRange(newCursorPos, newCursorPos);
            }
        }, 10);
    }, [contextWordMatch, localValue, onChange]);

    // Build context menu items
    const contextSuggestionItems: ContextMenuItem[] = useMemo(() => {
        if (!contextWordMatch || contextWordMatch.replacements.length === 0) {
            return [];
        }

        const uniqueSuggestions = Array.from(new Set(
            contextWordMatch.replacements
                .map(replacement => replacement.value)
                .filter(value => value && value.trim().length > 0)
        )).slice(0, 5);

        if (uniqueSuggestions.length === 0) {
            return [];
        }

        const word = localValue.substring(
            contextWordMatch.offset,
            contextWordMatch.offset + contextWordMatch.length
        );

        return [
            {
                id: 'suggestion-header',
                label: `Suggestions for "${word}"`,
                icon: <IconLanguage size={16} />,
                onClick: () => { },
                disabled: true,
            },
            ...uniqueSuggestions.map((suggestion, index) => ({
                id: `suggestion-${index}`,
                label: suggestion,
                icon: <IconWand size={16} />,
                onClick: () => applyContextSuggestion(suggestion),
            })),
            { id: 'divider-suggestions', label: '', divider: true, onClick: () => { } },
        ];
    }, [contextWordMatch, localValue, applyContextSuggestion]);

    const contextMenuItems: ContextMenuItem[] = useMemo(() => [
        ...contextSuggestionItems,
        ...(enhanceEnabled ? [{
            id: 'enhance-prompt',
            label: isEnhancing ? 'Enhancing...' : 'Enhance Prompt',
            icon: <IconBrain size={16} />,
            onClick: handleEnhancePrompt,
            disabled: !localValue.trim() || isEnhancing || !enhanceModelId,
        }] : []),
        {
            id: 'grammar-check',
            label: isCheckingGrammar ? 'Checking...' : 'Check & Fix Grammar',
            icon: <IconLanguage size={16} />,
            onClick: handleGrammarCheck,
            disabled: !localValue.trim() || isCheckingGrammar,
        },
        {
            id: 'autocorrect',
            label: 'Auto-correct Format',
            icon: <IconWand size={16} />,
            onClick: handleAutocorrect,
            disabled: !localValue.trim(),
        },
        { id: 'divider-1', label: '', divider: true, onClick: () => { } },
        {
            id: 'paste',
            label: 'Paste',
            icon: <IconClipboard size={16} />,
            shortcut: 'Ctrl+V',
            onClick: handlePaste,
        },
        {
            id: 'lowercase',
            label: 'Convert to Lowercase',
            icon: <IconTextCaption size={16} />,
            onClick: handleLowercase,
            disabled: !localValue.trim(),
        },
        {
            id: 'swap-lines',
            label: 'Reverse Line Order',
            icon: <IconArrowsUpDown size={16} />,
            onClick: handleSwapLines,
            disabled: !localValue.includes('\n'),
        },
        { id: 'divider-2', label: '', divider: true, onClick: () => { } },
        {
            id: 'clear',
            label: 'Clear All',
            icon: <IconClearAll size={16} />,
            danger: true,
            onClick: handleClear,
            disabled: !localValue.trim(),
        },
    ], [
        contextSuggestionItems,
        localValue,
        isCheckingGrammar,
        isEnhancing,
        enhanceEnabled,
        enhanceModelId,
        handleEnhancePrompt,
        handleGrammarCheck,
        handleAutocorrect,
        handlePaste,
        handleLowercase,
        handleSwapLines,
        handleClear,
    ]);

    // Handle context menu opening
    const handleContextMenu = useCallback((e: React.MouseEvent) => {
        if (shouldUseNativePromptContextMenu()) {
            return;
        }

        const textarea = e.currentTarget as HTMLTextAreaElement;
        const cursorPos = textarea.selectionStart ?? 0;
        const scanResult = scanLanguageOffline(localValue);

        const hoveredWordMatch = scanResult.matches.find(match =>
            cursorPos >= match.offset && cursorPos <= match.offset + match.length
        ) ?? null;

        setContextWordMatch(hoveredWordMatch);
        contextMenu.open(e);
    }, [contextMenu, localValue]);

    // Insert text at cursor position
    const insertTextAtCursor = useCallback((text: string) => {
        const textarea = textareaRef.current;
        if (!textarea) {
            // Fall back to appending
            const newValue = localValue + text;
            setLocalValue(newValue);
            onChange(newValue);
            return;
        }

        const start = textarea.selectionStart || 0;
        const end = textarea.selectionEnd || 0;
        const before = localValue.substring(0, start);
        const after = localValue.substring(end);
        const newValue = before + text + after;

        setLocalValue(newValue);
        onChange(newValue);

        // Position cursor after inserted text
        setTimeout(() => {
            if (textareaRef.current) {
                const newPos = start + text.length;
                textareaRef.current.focus();
                textareaRef.current.setSelectionRange(newPos, newPos);
            }
        }, 10);
    }, [localValue, onChange]);

    // Expose insertTextAtCursor via ref
    useImperativeHandle(ref, () => ({
        insertTextAtCursor,
    }), [insertTextAtCursor]);

    // Handle modal opening
    const handleOpenModal = useCallback((syntaxId: string) => {
        if (syntaxId === 'segment') {
            setSegmentModalOpen(true);
        } else if (syntaxId === 'region' || syntaxId === 'object') {
            setRegionModalOpen(true);
        }
    }, []);

    // Sync local state when parent value changes
    useEffect(() => {
        if (!isTypingRef.current && value !== localValue) {
            setLocalValue(value);
        }
    }, [value, localValue]);

    const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const newValue = e.currentTarget.value;
        const cursorPos = e.currentTarget.selectionStart || 0;

        setLocalValue(newValue);
        isTypingRef.current = true;

        // Update autocomplete suggestions via ref
        if (autocompleteEnabled) {
            autocompleteRef.current?.handleTextChange(newValue, cursorPos);
        }

        if (debounceRef.current) {
            clearTimeout(debounceRef.current);
        }

        debounceRef.current = setTimeout(() => {
            onChange(newValue);
            isTypingRef.current = false;
        }, 300);
    };

    // Handle suggestion selection
    const handleAutocompleteSelect = useCallback((_entry: AutoCompleteEntry, replacement: { newText: string; newCursorPos: number }) => {
        const { newText, newCursorPos } = replacement;

        setLocalValue(newText);
        onChange(newText);

        // Focus back and position cursor after the inserted word
        setTimeout(() => {
            if (textareaRef.current) {
                textareaRef.current.focus();
                textareaRef.current.setSelectionRange(newCursorPos, newCursorPos);
            }
        }, 10);
    }, [onChange]);

    // Handle keyboard navigation delegation
    const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        // Delegate to autocomplete if enabled
        if (autocompleteEnabled && autocompleteRef.current) {
            const handled = autocompleteRef.current.handleKeyDown(e);
            if (handled) return;
        }
    }, [autocompleteEnabled]);

    // Token counting: immediate local estimate, then accurate server count
    const { tokenCount, isEstimate } = useTokenCount(localValue, { debounceMs: 500, skipPromptSyntax: true });
    const tokenWarning = useMemo(() => getTokenWarning(tokenCount, 'sdxl'), [tokenCount]);

    const connectionTone = connectionStatus === 'connected'
        ? 'teal'
        : connectionStatus === 'reachable_no_models'
            ? 'yellow'
            : connectionStatus === 'connecting'
                ? 'blue'
                : connectionStatus === 'unreachable' || connectionStatus === 'error'
                    ? 'red'
                    : 'gray';

    const connectionLabel = connectionStatus === 'connected'
        ? 'Connected'
        : connectionStatus === 'reachable_no_models'
            ? 'Reachable'
            : connectionStatus === 'connecting'
                ? 'Checking'
                : connectionStatus === 'unreachable'
                    ? 'Offline'
                    : connectionStatus === 'error'
                        ? 'Error'
                        : 'Not checked';

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, position: 'relative' }}>
            <Textarea
                ref={textareaRef}
                spellCheck={true}
                label={
                    <Group justify="space-between" mb={4} style={{ width: '100%' }}>
                        <Group gap="xs">
                            <Text component="span" size="sm" fw={500}>{label}</Text>
                            {showSyntaxButton && (
                                <PromptSyntaxButton
                                    size="xs"
                                    onInsert={insertTextAtCursor}
                                    onOpenModal={handleOpenModal}
                                />
                            )}
                            <Tooltip label={
                                autocompleteEnabled
                                    ? `Disable autocomplete${autocompleteRef.current?.isLoaded ? '' : ' (loading...)'}`
                                    : 'Enable autocomplete'
                            }>
                                <ActionIcon
                                    size="xs"
                                    variant={autocompleteEnabled ? 'filled' : 'subtle'}
                                    color={autocompleteEnabled ? 'blue' : 'gray'}
                                    onClick={() => {
                                        const newState = !autocompleteEnabled;
                                        setAutocompleteEnabled(newState);
                                        if (!newState) {
                                            autocompleteRef.current?.close();
                                        }
                                    }}
                                >
                                    <IconSparkles size={12} />
                                </ActionIcon>
                            </Tooltip>
                            {/* Prompt Enhancement */}
                            {enhanceEnabled && (
                                <Tooltip label={isEnhancing ? 'Enhancing...' : (!enhanceModelId ? 'Select a model in settings' : 'Enhance prompt with AI')}>
                                    <ActionIcon
                                        size="xs"
                                        variant="filled"
                                        color="violet"
                                        onClick={handleEnhancePrompt}
                                        disabled={!localValue.trim() || isEnhancing || !enhanceModelId}
                                        loading={isEnhancing}
                                    >
                                        <IconBrain size={12} />
                                    </ActionIcon>
                                </Tooltip>
                            )}
                            <Popover
                                opened={enhanceSettingsOpen}
                                onChange={setEnhanceSettingsOpen}
                                position="bottom-start"
                                width={320}
                                shadow="md"
                            >
                                <Popover.Target>
                                    <Tooltip label="Prompt enhancement settings">
                                        <ActionIcon
                                            size="xs"
                                            variant={enhanceEnabled ? 'filled' : 'subtle'}
                                            color={enhanceEnabled ? 'violet' : 'gray'}
                                            onClick={() => {
                                                setEnhanceSettingsOpen((o) => !o);
                                                if (!enhanceSettingsOpen && availableModels.length === 0) {
                                                    void loadModels();
                                                }
                                            }}
                                        >
                                            <IconSettings size={12} />
                                        </ActionIcon>
                                    </Tooltip>
                                </Popover.Target>
                                <Popover.Dropdown>
                                    <Stack gap="sm">
                                        <Text size="sm" fw={600}>Prompt Enhancement</Text>
                                        <Switch
                                            label="Enable"
                                            checked={enhanceEnabled}
                                            onChange={(e) => setEnhanceEnabled(e.currentTarget.checked)}
                                        />
                                        <Group justify="space-between" align="center">
                                            <Badge color={connectionTone} variant="light">
                                                {connectionLabel}
                                            </Badge>
                                            {detectedServerMode && (
                                                <Text size="xs" c="dimmed">
                                                    {detectedServerMode === 'legacy-lmstudio' ? 'LM Studio legacy API' : 'OpenAI-compatible API'}
                                                </Text>
                                            )}
                                        </Group>
                                        {connectionMessage && (
                                            <Text size="xs" c="dimmed">
                                                {connectionMessage}
                                            </Text>
                                        )}
                                        <TextInput
                                            label="Assistant Server URL"
                                            placeholder="http://localhost:1234"
                                            value={enhanceEndpointUrl}
                                            onChange={(e) => setEnhanceEndpointUrl(e.currentTarget.value)}
                                            size="xs"
                                            rightSection={
                                                <Tooltip label="Refresh models">
                                                    <ActionIcon size="xs" variant="subtle" onClick={() => void loadModels()} loading={loadingModels}>
                                                        <IconSparkles size={12} />
                                                    </ActionIcon>
                                                </Tooltip>
                                            }
                                        />
                                        <Select
                                            label="Model"
                                            placeholder={loadingModels ? 'Loading models...' : 'Select LLM model'}
                                            data={availableModels.map((m) => ({ value: m.id, label: `${m.name || m.id} (${m.id})` }))}
                                            value={enhanceModelId || null}
                                            onChange={(val) => {
                                                setEnhanceModelId(val || '');
                                                setAssistantSelectedModelId(val || '');
                                                if (val) {
                                                    const selected = availableModels.find((m) => m.id === val);
                                                    notifications.show({
                                                        title: 'Model Connected',
                                                        message: `Now using "${selected?.name || val}" for prompt enhancement.`,
                                                        color: 'teal',
                                                    });
                                                }
                                            }}
                                            rightSection={loadingModels ? <Loader size={14} /> : undefined}
                                            searchable
                                            clearable
                                        />
                                        <div>
                                            <Text size="xs" fw={500} mb={4}>Style Preset</Text>
                                            <Chip.Group
                                                value={activePresetKey || ''}
                                                onChange={(val) => {
                                                    if (val && typeof val === 'string') {
                                                        applyPreset(val as any);
                                                    }
                                                }}
                                            >
                                                <Group gap={4}>
                                                    {PROMPT_STYLE_PRESETS.map((preset) => (
                                                        <Chip
                                                            key={preset.key}
                                                            value={preset.key}
                                                            size="xs"
                                                            variant="outline"
                                                            color="violet"
                                                        >
                                                            {preset.label}
                                                        </Chip>
                                                    ))}
                                                </Group>
                                            </Chip.Group>
                                        </div>
                                        <Textarea
                                            label="System Prompt"
                                            description={activePresetKey ? `Using ${PROMPT_STYLE_PRESETS.find((p) => p.key === activePresetKey)?.label} preset (editable)` : 'Custom instructions for the LLM'}
                                            placeholder="Instructions for the LLM..."
                                            value={enhanceSystemPrompt}
                                            onChange={(e) => setEnhanceSystemPrompt(e.currentTarget.value)}
                                            minRows={3}
                                            maxRows={6}
                                            autosize
                                        />
                                        <Textarea
                                            label="Assistant Chat Prompt"
                                            description="Instructions used by the docked prompt assistant panel."
                                            placeholder="How should the assistant help with prompt writing?"
                                            value={assistantSystemPrompt}
                                            onChange={(e) => setAssistantSystemPrompt(e.currentTarget.value)}
                                            minRows={3}
                                            maxRows={6}
                                            autosize
                                        />
                                    </Stack>
                                </Popover.Dropdown>
                            </Popover>
                        </Group>
                        <Text size="xs" c={tokenWarning ? 'orange' : 'dimmed'}>
                            {isEstimate ? '~' : ''}{tokenCount} tokens {tokenWarning && `(${tokenWarning})`}
                        </Text>
                    </Group>
                }
                placeholder={placeholder}
                value={localValue}
                onChange={handleChange}
                onKeyDown={handleKeyDown}
                onContextMenu={handleContextMenu}
                onFocus={() => setActivePromptTarget(targetIdRef.current)}
                onBlur={() => setActivePromptTarget(null)}
                minRows={minRows}
                maxRows={maxRows}
                required={required}
                autosize={autosize}
            />

            {/* Headless Autocomplete Dropdown */}
            <HeadlessAutocomplete
                ref={autocompleteRef}
                onSelect={handleAutocompleteSelect}
                options={{
                    enabled: autocompleteEnabled,
                    sortMode: 'Active',
                    matchMode: 'Bucketed',
                    maxResults: 50,
                }}
            />

            {/* Syntax Modals */}
            <SegmentSyntaxModal
                opened={segmentModalOpen}
                onClose={() => setSegmentModalOpen(false)}
                onSubmit={insertTextAtCursor}
            />
            <RegionSyntaxModal
                opened={regionModalOpen}
                onClose={() => setRegionModalOpen(false)}
                onSubmit={insertTextAtCursor}
            />

            {/* Context Menu */}
            <ContextMenu
                position={contextMenu.position}
                items={contextMenuItems}
                onClose={contextMenu.close}
            />
        </div>
    );
}));

PromptInput.displayName = 'PromptInput';
