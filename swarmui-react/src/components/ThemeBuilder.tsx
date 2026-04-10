// ThemeBuilder Component - Visual theme creator with live preview
import { useState, useMemo } from 'react';
import {
    Modal, Stack, TextInput, Group, ColorInput,
    Select, Text, Accordion, Divider, Box, ScrollArea
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconDeviceFloppy, IconX, IconCopy, IconDownload } from '@tabler/icons-react';
import {
    resolveThemeStyle,
    useThemeStore,
    THEME_PALETTES,
    type ThemeCategory,
    type ThemeControlMode,
    type ThemeControlShape,
    type ThemeIconMode,
    type ThemeIconShape,
    type ThemePalette,
} from '../store/themeStore';
import { ThemePreview } from './ThemePreview';
import { SwarmButton } from './ui';

interface ThemeBuilderProps {
    opened: boolean;
    onClose: () => void;
    editThemeId?: string; // If provided, edit existing custom theme
}

const REQUIRED_COLORS = [
    { key: 'brand', label: 'Brand Color', description: 'Primary brand/accent color' },
    { key: 'accent', label: 'Accent Color', description: 'Secondary accent for highlights' },
] as const;

const GRAYSCALE_COLORS = [
    { key: 'gray0', label: 'Gray 0', description: 'Primary text (lightest in dark mode)' },
    { key: 'gray1', label: 'Gray 1', description: 'Secondary text' },
    { key: 'gray2', label: 'Gray 2', description: 'Tertiary text' },
    { key: 'gray3', label: 'Gray 3', description: 'Disabled/placeholder text' },
    { key: 'gray4', label: 'Gray 4', description: 'Border (lighter)' },
    { key: 'gray5', label: 'Gray 5', description: 'Border (darker)' },
    { key: 'gray6', label: 'Gray 6', description: 'Hover background' },
    { key: 'gray7', label: 'Gray 7', description: 'Card/panel background' },
    { key: 'gray8', label: 'Gray 8', description: 'Secondary background' },
    { key: 'gray9', label: 'Gray 9', description: 'Main background (darkest)' },
] as const;

const SEMANTIC_COLORS = [
    { key: 'success', label: 'Success', description: 'Success states and messages' },
    { key: 'warning', label: 'Warning', description: 'Warning states and messages' },
    { key: 'error', label: 'Error', description: 'Error states and messages' },
] as const;

const CATEGORY_OPTIONS = [
    { value: 'custom', label: 'Custom' },
    { value: 'game', label: 'Game-Inspired' },
    { value: 'color-scheme', label: 'Color Scheme' },
    { value: 'editor', label: 'Editor & IDE' },
    { value: 'app', label: 'App' },
    { value: 'aesthetic', label: 'Aesthetic' },
    { value: 'minimal', label: 'Minimal' },
] as const;

const CONTROL_MODE_OPTIONS: { value: ThemeControlMode; label: string }[] = [
    { value: 'default', label: 'Default Controls' },
    { value: 'filled', label: 'Filled Controls' },
    { value: 'outlined', label: 'Outlined Controls' },
];

const ICON_MODE_OPTIONS: { value: ThemeIconMode; label: string }[] = [
    { value: 'plain', label: 'Plain Icons' },
    { value: 'badge', label: 'Badge Icons' },
    { value: 'glyph-outline', label: 'Glyph Outline Icons' },
];

const CONTROL_SHAPE_OPTIONS: { value: ThemeControlShape; label: string }[] = [
    { value: 'rounded', label: 'Rounded Buttons' },
    { value: 'pill', label: 'Pill Buttons' },
    { value: 'square', label: 'Square Buttons' },
];

const ICON_SHAPE_OPTIONS: { value: ThemeIconShape; label: string }[] = [
    { value: 'rounded', label: 'Rounded Icons' },
    { value: 'circle', label: 'Circle Icons' },
    { value: 'square', label: 'Square Icons' },
];

export function ThemeBuilder({ opened, onClose, editThemeId }: ThemeBuilderProps) {
    const { customThemes, addCustomTheme, updateCustomTheme, exportTheme, getAllThemes } = useThemeStore();

    // Find existing theme if editing
    const existingTheme = editThemeId ? customThemes.find(t => t.id === editThemeId) : null;
    const initialBaseThemeId = existingTheme?.id || 'dracula';
    const initialBaseTheme = getAllThemes().find((theme) => theme.id === initialBaseThemeId) || THEME_PALETTES[0];

    const [themeName, setThemeName] = useState(existingTheme?.name || '');
    const [category, setCategory] = useState<ThemeCategory>(existingTheme?.category || 'custom');
    const [baseTheme, setBaseTheme] = useState<string>(initialBaseThemeId);

    // Color states
    const [brand, setBrand] = useState(existingTheme?.colors.brand || '#7c3aed');
    const [accent, setAccent] = useState(existingTheme?.colors.accent || '#a78bfa');

    const [gray0, setGray0] = useState(existingTheme?.colors.gray0 || '#f8fafc');
    const [gray1, setGray1] = useState(existingTheme?.colors.gray1 || '#e2e8f0');
    const [gray2, setGray2] = useState(existingTheme?.colors.gray2 || '#cbd5e1');
    const [gray3, setGray3] = useState(existingTheme?.colors.gray3 || '#94a3b8');
    const [gray4, setGray4] = useState(existingTheme?.colors.gray4 || '#64748b');
    const [gray5, setGray5] = useState(existingTheme?.colors.gray5 || '#475569');
    const [gray6, setGray6] = useState(existingTheme?.colors.gray6 || '#334155');
    const [gray7, setGray7] = useState(existingTheme?.colors.gray7 || '#1e293b');
    const [gray8, setGray8] = useState(existingTheme?.colors.gray8 || '#0f172a');
    const [gray9, setGray9] = useState(existingTheme?.colors.gray9 || '#020617');

    const [success, setSuccess] = useState(existingTheme?.colors.success || '#22c55e');
    const [warning, setWarning] = useState(existingTheme?.colors.warning || '#f59e0b');
    const [error, setError] = useState(existingTheme?.colors.error || '#ef4444');

    // Phase 5: Additional tokens (optional)
    const [textPrimary, setTextPrimary] = useState(existingTheme?.colors.textPrimary || '');
    const [textSecondary, setTextSecondary] = useState(existingTheme?.colors.textSecondary || '');
    const [overlayColor, setOverlayColor] = useState(existingTheme?.colors.overlayColor || '');
    const [fontFamily, setFontFamily] = useState(existingTheme?.colors.fontFamily || '');
    const [fontHeading, setFontHeading] = useState(existingTheme?.colors.fontHeading || '');
    const [fontMono, setFontMono] = useState(existingTheme?.colors.fontMono || '');
    const [styleSeed, setStyleSeed] = useState<ThemePalette['style']>(resolveThemeStyle(existingTheme || initialBaseTheme));

    const updateStyleSeed = (updates: Partial<NonNullable<ThemePalette['style']>>) => {
        setStyleSeed((current) => ({
            ...current,
            ...updates,
        }));
    };

    // Load base theme colors when baseTheme changes
    const handleBaseThemeChange = (value: string | null) => {
        if (!value) return;
        setBaseTheme(value);

        const theme = getAllThemes().find(t => t.id === value);
        if (!theme) return;

        // Don't override if editing existing theme
        if (existingTheme) return;

        setBrand(theme.colors.brand);
        setAccent(theme.colors.accent);
        setGray0(theme.colors.gray0);
        setGray1(theme.colors.gray1);
        setGray2(theme.colors.gray2);
        setGray3(theme.colors.gray3);
        setGray4(theme.colors.gray4);
        setGray5(theme.colors.gray5);
        setGray6(theme.colors.gray6);
        setGray7(theme.colors.gray7);
        setGray8(theme.colors.gray8);
        setGray9(theme.colors.gray9);
        setSuccess(theme.colors.success);
        setWarning(theme.colors.warning);
        setError(theme.colors.error);
        setFontFamily(theme.colors.fontFamily || '');
        setFontHeading(theme.colors.fontHeading || '');
        setFontMono(theme.colors.fontMono || '');
        setStyleSeed(resolveThemeStyle(theme));
    };

    // Build preview theme
    const previewTheme: ThemePalette = useMemo(() => {
        const colors: ThemePalette['colors'] = {
            brand,
            accent,
            gray0,
            gray1,
            gray2,
            gray3,
            gray4,
            gray5,
            gray6,
            gray7,
            gray8,
            gray9,
            success,
            warning,
            error,
        };

        // Add optional Phase 5 properties if provided
        if (textPrimary) colors.textPrimary = textPrimary;
        if (textSecondary) colors.textSecondary = textSecondary;
        if (overlayColor) colors.overlayColor = overlayColor;
        if (fontFamily) colors.fontFamily = fontFamily;
        if (fontHeading) colors.fontHeading = fontHeading;
        if (fontMono) colors.fontMono = fontMono;

        return {
            id: editThemeId || 'preview',
            name: themeName || 'Preview',
            category,
            style: styleSeed,
            colors
        };
    }, [themeName, category, brand, accent, gray0, gray1, gray2, gray3, gray4, gray5, gray6, gray7, gray8, gray9, success, warning, error, textPrimary, textSecondary, overlayColor, fontFamily, fontHeading, fontMono, styleSeed, editThemeId]);

    const handleSave = () => {
        if (!themeName.trim()) {
            notifications.show({
                title: 'Validation Error',
                message: 'Please enter a theme name',
                color: 'red',
            });
            return;
        }

        const themeId = editThemeId || `custom-${themeName.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}`;

        const colors: ThemePalette['colors'] = {
            brand,
            accent,
            gray0,
            gray1,
            gray2,
            gray3,
            gray4,
            gray5,
            gray6,
            gray7,
            gray8,
            gray9,
            success,
            warning,
            error,
        };

        // Add optional Phase 5 properties if provided
        if (textPrimary) colors.textPrimary = textPrimary;
        if (textSecondary) colors.textSecondary = textSecondary;
        if (overlayColor) colors.overlayColor = overlayColor;
        if (fontFamily) colors.fontFamily = fontFamily;
        if (fontHeading) colors.fontHeading = fontHeading;
        if (fontMono) colors.fontMono = fontMono;

        const newTheme: ThemePalette = {
            id: themeId,
            name: themeName,
            category,
            style: styleSeed,
            colors
        };

        if (editThemeId) {
            updateCustomTheme(editThemeId, newTheme);
            notifications.show({
                title: 'Theme Updated',
                message: `"${themeName}" has been updated`,
                color: 'green',
            });
        } else {
            addCustomTheme(newTheme);
            notifications.show({
                title: 'Theme Created',
                message: `"${themeName}" has been saved`,
                color: 'green',
            });
        }

        onClose();
    };

    const handleExport = () => {
        const json = exportTheme(previewTheme.id);
        navigator.clipboard.writeText(json);

        notifications.show({
            title: 'Exported',
            message: 'Theme JSON copied to clipboard',
            color: 'blue',
            icon: <IconCopy size={16} />,
        });
    };

    const handleDownload = () => {
        const json = exportTheme(previewTheme.id);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${themeName || 'theme'}.json`;
        a.click();
        URL.revokeObjectURL(url);

        notifications.show({
            title: 'Downloaded',
            message: `${themeName || 'theme'}.json saved`,
            color: 'blue',
            icon: <IconDownload size={16} />,
        });
    };

    return (
        <Modal
            opened={opened}
            onClose={onClose}
            title={editThemeId ? 'Edit Custom Theme' : 'Create Custom Theme'}
            size="xl"
            styles={{
                body: { maxHeight: '70vh', overflow: 'hidden' },
                header: { borderBottom: '1px solid var(--theme-gray-5)' }
            }}
        >
            <Group align="flex-start" gap="md" style={{ height: '100%' }}>
                {/* Left: Form */}
                <Stack style={{ flex: '1 1 60%', minWidth: 0 }} gap="md">
                    <ScrollArea h="calc(70vh - 120px)" type="auto">
                        <Stack gap="md" pr="sm">
                            {/* Basic Info */}
                            <TextInput
                                label="Theme Name"
                                placeholder="My Awesome Theme"
                                value={themeName}
                                onChange={(e) => setThemeName(e.currentTarget.value)}
                                required
                            />

                            <Select
                                label="Category"
                                data={CATEGORY_OPTIONS}
                                value={category}
                                onChange={(v) => setCategory((v as ThemeCategory) || 'custom')}
                            />

                            {!editThemeId && (
                                <Select
                                    label="Base Theme"
                                    description="Start with colors from an existing theme"
                                    data={THEME_PALETTES.map(t => ({ value: t.id, label: t.name }))}
                                    value={baseTheme}
                                    onChange={handleBaseThemeChange}
                                    searchable
                                />
                            )}

                            <Divider />

                            <Text size="sm" fw={600}>Control Personality</Text>
                            <Text size="xs" c="dimmed">
                                These settings define the default control fill language and switchable button/icon shapes for this theme.
                            </Text>
                            <Select
                                label="Control Mode"
                                description="How standard buttons and badges are filled by default"
                                data={CONTROL_MODE_OPTIONS}
                                value={styleSeed.controlMode}
                                onChange={(value) => {
                                    if (!value) {
                                        return;
                                    }
                                    updateStyleSeed({ controlMode: value as ThemeControlMode });
                                }}
                            />
                            <Select
                                label="Icon Mode"
                                description="How icon buttons and badges are decorated"
                                data={ICON_MODE_OPTIONS}
                                value={styleSeed.iconMode}
                                onChange={(value) => {
                                    if (!value) {
                                        return;
                                    }
                                    updateStyleSeed({ iconMode: value as ThemeIconMode });
                                }}
                            />
                            <Select
                                label="Button Shape"
                                description="Default shape used by text-bearing buttons"
                                data={CONTROL_SHAPE_OPTIONS}
                                value={styleSeed.controlShape}
                                onChange={(value) => {
                                    if (!value) {
                                        return;
                                    }
                                    updateStyleSeed({ controlShape: value as ThemeControlShape });
                                }}
                            />
                            <Select
                                label="Icon Shape"
                                description="Default shape used by action icons"
                                data={ICON_SHAPE_OPTIONS}
                                value={styleSeed.iconShape}
                                onChange={(value) => {
                                    if (!value) {
                                        return;
                                    }
                                    updateStyleSeed({ iconShape: value as ThemeIconShape });
                                }}
                            />

                            <Divider />

                            {/* Primary Colors */}
                            <Text size="sm" fw={600}>Primary Colors</Text>
                            {REQUIRED_COLORS.map(({ key, label, description }) => (
                                <ColorInput
                                    key={key}
                                    label={label}
                                    description={description}
                                    value={key === 'brand' ? brand : accent}
                                    onChange={key === 'brand' ? setBrand : setAccent}
                                    format="hex"
                                    swatches={['#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899']}
                                />
                            ))}

                            <Divider />

                            {/* Grayscale Gradient */}
                            <Group justify="space-between">
                                <Text size="sm" fw={600}>Grayscale Palette</Text>
                                <Text size="xs" c="dimmed">(Light → Dark)</Text>
                            </Group>

                            {/* Visual gradient strip */}
                            <Group gap={2}>
                                {[gray0, gray1, gray2, gray3, gray4, gray5, gray6, gray7, gray8, gray9].map((color, i) => (
                                    <Box
                                        key={i}
                                        style={{
                                            flex: 1,
                                            height: 24,
                                            backgroundColor: color,
                                            border: '1px solid var(--theme-gray-5)',
                                            borderRadius: i === 0 ? '4px 0 0 4px' : i === 9 ? '0 4px 4px 0' : 0
                                        }}
                                    />
                                ))}
                            </Group>

                            <Accordion variant="contained">
                                <Accordion.Item value="grayscale">
                                    <Accordion.Control>
                                        <Text size="xs">Edit Individual Grays</Text>
                                    </Accordion.Control>
                                    <Accordion.Panel>
                                        <Stack gap="sm">
                                            {GRAYSCALE_COLORS.map(({ key, label, description }) => {
                                                const setters = [setGray0, setGray1, setGray2, setGray3, setGray4, setGray5, setGray6, setGray7, setGray8, setGray9];
                                                const values = [gray0, gray1, gray2, gray3, gray4, gray5, gray6, gray7, gray8, gray9];
                                                const index = parseInt(key.replace('gray', ''));

                                                return (
                                                    <ColorInput
                                                        key={key}
                                                        label={label}
                                                        description={description}
                                                        value={values[index]}
                                                        onChange={setters[index]}
                                                        format="hex"
                                                        size="xs"
                                                    />
                                                );
                                            })}
                                        </Stack>
                                    </Accordion.Panel>
                                </Accordion.Item>
                            </Accordion>

                            <Divider />

                            {/* Semantic Colors */}
                            <Text size="sm" fw={600}>Semantic Colors</Text>
                            {SEMANTIC_COLORS.map(({ key, label, description }) => {
                                const value = key === 'success' ? success : key === 'warning' ? warning : error;
                                const setter = key === 'success' ? setSuccess : key === 'warning' ? setWarning : setError;

                                return (
                                    <ColorInput
                                        key={key}
                                        label={label}
                                        description={description}
                                        value={value}
                                        onChange={setter}
                                        format="hex"
                                        swatches={
                                            key === 'success' ? ['#22c55e', '#10b981', '#059669'] :
                                            key === 'warning' ? ['#f59e0b', '#f97316', '#eab308'] :
                                            ['#ef4444', '#dc2626', '#b91c1c']
                                        }
                                    />
                                );
                            })}

                            <Divider />

                            {/* Advanced Options (Phase 5) */}
                            <Accordion variant="contained">
                                <Accordion.Item value="advanced">
                                    <Accordion.Control>
                                        <Text size="xs" fw={600}>Advanced Options (Optional)</Text>
                                    </Accordion.Control>
                                    <Accordion.Panel>
                                        <Stack gap="sm">
                                            <Text size="xs" c="dimmed">
                                                These optional settings provide fine-grained control over typography and visual effects
                                            </Text>

                                            {/* Text Hierarchy */}
                                            <ColorInput
                                                label="Primary Text Color"
                                                description="Override default text color (fallback: gray0)"
                                                value={textPrimary}
                                                onChange={setTextPrimary}
                                                format="hex"
                                                size="xs"
                                                placeholder="Leave empty for default"
                                            />

                                            <ColorInput
                                                label="Secondary Text Color"
                                                description="Override secondary/subdued text (fallback: gray2)"
                                                value={textSecondary}
                                                onChange={setTextSecondary}
                                                format="hex"
                                                size="xs"
                                                placeholder="Leave empty for default"
                                            />

                                            {/* Overlay Color */}
                                            <ColorInput
                                                label="Overlay/Backdrop Color"
                                                description="Color for modal overlays and backdrops (supports rgba)"
                                                value={overlayColor}
                                                onChange={setOverlayColor}
                                                format="rgba"
                                                size="xs"
                                                placeholder="Leave empty for default"
                                            />

                                            {/* Font Family */}
                                            <TextInput
                                                label="Custom Font Family"
                                                description='e.g., "Inter, system-ui, sans-serif"'
                                                value={fontFamily}
                                                onChange={(e) => setFontFamily(e.currentTarget.value)}
                                                size="xs"
                                                placeholder="Leave empty for system fonts"
                                            />

                                            <TextInput
                                                label="Heading Font Family"
                                                description='e.g., "Sora, Inter, sans-serif"'
                                                value={fontHeading}
                                                onChange={(e) => setFontHeading(e.currentTarget.value)}
                                                size="xs"
                                                placeholder="Leave empty to reuse primary font"
                                            />

                                            <TextInput
                                                label="Monospace Font Family"
                                                description='e.g., "JetBrains Mono, Consolas, monospace"'
                                                value={fontMono}
                                                onChange={(e) => setFontMono(e.currentTarget.value)}
                                                size="xs"
                                                placeholder="Leave empty for default mono stack"
                                            />
                                        </Stack>
                                    </Accordion.Panel>
                                </Accordion.Item>
                            </Accordion>
                        </Stack>
                    </ScrollArea>

                    {/* Actions */}
                    <Group justify="space-between" mt="md" style={{ borderTop: '1px solid var(--theme-gray-5)', paddingTop: 12 }}>
                        <Group gap="xs">
                            <SwarmButton
                                tone="secondary"
                                emphasis="ghost"
                                size="xs"
                                leftSection={<IconCopy size={14} />}
                                onClick={handleExport}
                            >
                                Copy JSON
                            </SwarmButton>
                            <SwarmButton
                                tone="secondary"
                                emphasis="ghost"
                                size="xs"
                                leftSection={<IconDownload size={14} />}
                                onClick={handleDownload}
                            >
                                Download
                            </SwarmButton>
                        </Group>
                        <Group gap="xs">
                            <SwarmButton
                                tone="secondary"
                                emphasis="ghost"
                                onClick={onClose}
                                leftSection={<IconX size={14} />}
                            >
                                Cancel
                            </SwarmButton>
                            <SwarmButton
                                tone="primary"
                                emphasis="solid"
                                onClick={handleSave}
                                leftSection={<IconDeviceFloppy size={14} />}
                            >
                                {editThemeId ? 'Update' : 'Save'} Theme
                            </SwarmButton>
                        </Group>
                    </Group>
                </Stack>

                {/* Right: Live Preview */}
                <Box style={{ flex: '0 0 200px' }}>
                    <Stack gap="xs">
                        <Text size="xs" fw={600} c="dimmed">Live Preview</Text>
                        <ThemePreview theme={previewTheme} />
                        <Text size="8px" c="dimmed" ta="center">
                            Preview updates in real-time as you edit colors, fills, and control shapes
                        </Text>
                    </Stack>
                </Box>
            </Group>
        </Modal>
    );
}
