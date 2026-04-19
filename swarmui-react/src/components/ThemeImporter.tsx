// ThemeImporter Component - Import themes from JSON.
import { useMemo, useState } from 'react';
import {
    Alert,
    Code,
    FileButton,
    Group,
    Modal,
    Stack,
    Text,
    Textarea,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconAlertCircle, IconCheck, IconFileUpload, IconUpload } from '@tabler/icons-react';
import { useThemeStore, type ThemePalette } from '../store/themeStore';
import { ensureUniqueId, parseThemeJson, sanitizeThemeId } from '../utils/themeValidation';
import { SwarmButton } from './ui';

interface ThemeImporterProps {
    opened: boolean;
    onClose: () => void;
}

type ImportedTheme = ThemePalette & {
    effects?: {
        noiseIntensity?: number;
        scanlineIntensity?: number;
        meshIntensity?: number;
        meshAnimated?: boolean;
        overlayBlend?: string;
    };
    adaptive?: {
        imageReactiveStrength?: number;
        timeOfDayStrength?: number;
        contrastGuard?: boolean;
    };
    meta?: {
        themeSet?: string;
        pairedModeThemeId?: string;
        recommendationIds?: string[];
        tags?: string[];
    };
};

function listOptionalBlocks(theme: ImportedTheme): string[] {
    const blocks: string[] = [];
    if (theme.effects) blocks.push('effects');
    if (theme.adaptive) blocks.push('adaptive');
    if (theme.meta) blocks.push('meta');
    return blocks;
}

export function ThemeImporter({ opened, onClose }: ThemeImporterProps) {
    const { getAllThemes, importTheme } = useThemeStore();
    const [jsonInput, setJsonInput] = useState('');
    const [validationErrors, setValidationErrors] = useState<string[]>([]);

    const parsedPreview = useMemo(() => {
        if (!jsonInput.trim()) {
            return null;
        }
        const parsed = parseThemeJson(jsonInput);
        if (!parsed.success || !parsed.theme) {
            return null;
        }
        return parsed.theme as ImportedTheme;
    }, [jsonInput]);

    const importedBlocks = useMemo(() => {
        if (!parsedPreview) {
            return [];
        }
        return listOptionalBlocks(parsedPreview);
    }, [parsedPreview]);

    const handleImport = () => {
        if (!jsonInput.trim()) {
            setValidationErrors(['Please paste theme JSON']);
            return;
        }

        const result = parseThemeJson(jsonInput);

        if (!result.success || !result.theme) {
            setValidationErrors(result.errors || ['Unknown validation error']);
            return;
        }

        const existingIds = getAllThemes().map((theme) => theme.id);
        const themeData = result.theme as ImportedTheme;
        const sanitizedId = sanitizeThemeId(themeData.name);
        const uniqueId = ensureUniqueId(`custom-${sanitizedId}`, existingIds);

        const themeToImport: ImportedTheme = {
            ...themeData,
            id: uniqueId,
            category: 'custom',
        };

        const importResult = importTheme(JSON.stringify(themeToImport));

        if (importResult.success) {
            notifications.show({
                title: 'Theme Imported',
                message: `"${themeToImport.name}" has been imported successfully`,
                color: 'green',
                icon: <IconCheck size={16} />,
            });

            setJsonInput('');
            setValidationErrors([]);
            onClose();
            return;
        }

        setValidationErrors([importResult.error || 'Import failed']);
    };

    const handleFileUpload = (file: File | null) => {
        if (!file) {
            return;
        }

        const reader = new FileReader();
        reader.onload = (event) => {
            const content = event.target?.result as string;
            setJsonInput(content);
            setValidationErrors([]);
        };
        reader.onerror = () => {
            setValidationErrors(['Failed to read file']);
        };
        reader.readAsText(file);
    };

    const handlePaste = async () => {
        try {
            const text = await navigator.clipboard.readText();
            setJsonInput(text);
            setValidationErrors([]);

            notifications.show({
                title: 'Pasted',
                message: 'Theme JSON pasted from clipboard',
                color: 'blue',
            });
        } catch {
            notifications.show({
                title: 'Paste Failed',
                message: 'Could not read from clipboard',
                color: 'red',
            });
        }
    };

    return (
        <Modal opened={opened} onClose={onClose} title="Import Custom Theme" size="lg">
            <Stack gap="md">
                <Text size="sm" c="dimmed">
                    Import a theme by pasting JSON or uploading a `.json` file. Optional `effects`, `adaptive`, and
                    `meta` blocks are preserved as long as the required theme fields are present.
                </Text>

                <Group>
                    <FileButton onChange={handleFileUpload} accept=".json,application/json">
                        {(props) => (
                            <SwarmButton
                                {...props}
                                tone="secondary"
                                emphasis="soft"
                                leftSection={<IconFileUpload size={16} />}
                                size="sm"
                            >
                                Upload JSON File
                            </SwarmButton>
                        )}
                    </FileButton>

                    <SwarmButton
                        tone="secondary"
                        emphasis="soft"
                        leftSection={<IconUpload size={16} />}
                        size="sm"
                        onClick={handlePaste}
                    >
                        Paste from Clipboard
                    </SwarmButton>
                </Group>

                <Textarea
                    label="Theme JSON"
                    placeholder={`{\n  "id": "my-theme",\n  "name": "My Theme",\n  "category": "custom",\n  "colors": {\n    "brand": "#7c3aed",\n    ...\n  },\n  "effects": {\n    "noiseIntensity": 0.15\n  }\n}`}
                    value={jsonInput}
                    onChange={(event) => {
                        setJsonInput(event.currentTarget.value);
                        setValidationErrors([]);
                    }}
                    minRows={12}
                    maxRows={20}
                    styles={{
                        input: {
                            fontFamily: 'monospace',
                            fontSize: '12px',
                        },
                    }}
                />

                {validationErrors.length > 0 && (
                    <Alert icon={<IconAlertCircle size={16} />} title="Validation Errors" color="red" variant="light">
                        <Stack gap="xs">
                            {validationErrors.map((error, index) => (
                                <Text key={index} size="xs">
                                    - {error}
                                </Text>
                            ))}
                        </Stack>
                    </Alert>
                )}

                {parsedPreview && importedBlocks.length > 0 && (
                    <Alert title="Optional blocks detected" color="blue" variant="light">
                        <Text size="xs">
                            This import includes {importedBlocks.join(', ')}. They will be kept on import.
                        </Text>
                    </Alert>
                )}

                <Alert color="blue" variant="light" title="Required Format">
                    <Text size="xs">
                        Theme JSON must include <Code>id</Code>, <Code>name</Code>, <Code>category</Code>, and a
                        <Code>colors</Code> object. Optional <Code>style</Code>, <Code>effects</Code>,
                        <Code>adaptive</Code>, and <Code>meta</Code> blocks are supported.
                    </Text>
                </Alert>

                <Group justify="flex-end" mt="md">
                    <SwarmButton tone="secondary" emphasis="ghost" onClick={onClose}>
                        Cancel
                    </SwarmButton>
                    <SwarmButton
                        tone="primary"
                        emphasis="solid"
                        onClick={handleImport}
                        leftSection={<IconUpload size={16} />}
                    >
                        Import Theme
                    </SwarmButton>
                </Group>
            </Stack>
        </Modal>
    );
}
