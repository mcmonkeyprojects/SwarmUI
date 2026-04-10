// ThemeImporter Component - Import themes from JSON
import { useState } from 'react';
import {
    Modal, Stack, Group, Textarea, FileButton,
    Text, Alert, Code
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconUpload, IconAlertCircle, IconCheck, IconFileUpload } from '@tabler/icons-react';
import { useThemeStore } from '../store/themeStore';
import { parseThemeJson, ensureUniqueId, sanitizeThemeId } from '../utils/themeValidation';
import { SwarmButton } from './ui';

interface ThemeImporterProps {
    opened: boolean;
    onClose: () => void;
}

export function ThemeImporter({ opened, onClose }: ThemeImporterProps) {
    const { getAllThemes, importTheme } = useThemeStore();
    const [jsonInput, setJsonInput] = useState('');
    const [validationErrors, setValidationErrors] = useState<string[]>([]);

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

        // Ensure unique ID
        const existingIds = getAllThemes().map(t => t.id);
        const sanitizedId = sanitizeThemeId(result.theme.name);
        const uniqueId = ensureUniqueId(`custom-${sanitizedId}`, existingIds);

        // Update theme with unique ID and ensure category is 'custom'
        const themeToImport = {
            ...result.theme,
            id: uniqueId,
            category: 'custom' as const
        };

        // Import using store method
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
        } else {
            setValidationErrors([importResult.error || 'Import failed']);
        }
    };

    const handleFileUpload = (file: File | null) => {
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            const content = e.target?.result as string;
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
        <Modal
            opened={opened}
            onClose={onClose}
            title="Import Custom Theme"
            size="lg"
        >
            <Stack gap="md">
                <Text size="sm" c="dimmed">
                    Import a theme by pasting JSON or uploading a .json file
                </Text>

                {/* File Upload */}
                <Group>
                    <FileButton
                        onChange={handleFileUpload}
                        accept=".json,application/json"
                    >
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

                {/* JSON Input */}
                <Textarea
                    label="Theme JSON"
                    placeholder={`{\n  "id": "my-theme",\n  "name": "My Theme",\n  "category": "custom",\n  "colors": {\n    "brand": "#7c3aed",\n    ...\n  }\n}`}
                    value={jsonInput}
                    onChange={(e) => {
                        setJsonInput(e.currentTarget.value);
                        setValidationErrors([]);
                    }}
                    minRows={12}
                    maxRows={20}
                    styles={{
                        input: {
                            fontFamily: 'monospace',
                            fontSize: '12px'
                        }
                    }}
                />

                {/* Validation Errors */}
                {validationErrors.length > 0 && (
                    <Alert
                        icon={<IconAlertCircle size={16} />}
                        title="Validation Errors"
                        color="red"
                        variant="light"
                    >
                        <Stack gap="xs">
                            {validationErrors.map((error, i) => (
                                <Text key={i} size="xs">
                                    - {error}
                                </Text>
                            ))}
                        </Stack>
                    </Alert>
                )}

                {/* Format Hint */}
                <Alert color="blue" variant="light" title="Required Format">
                    <Text size="xs">
                        Theme JSON must include <Code>id</Code>, <Code>name</Code>, <Code>category</Code>, and a <Code>colors</Code> object. Optional <Code>style</Code> fields can define control mode, icon mode, button shape, and icon shape.
                    </Text>
                </Alert>

                {/* Actions */}
                <Group justify="flex-end" mt="md">
                    <SwarmButton tone="secondary" emphasis="ghost" onClick={onClose}>
                        Cancel
                    </SwarmButton>
                    <SwarmButton tone="primary" emphasis="solid" onClick={handleImport} leftSection={<IconUpload size={16} />}>
                        Import Theme
                    </SwarmButton>
                </Group>
            </Stack>
        </Modal>
    );
}
