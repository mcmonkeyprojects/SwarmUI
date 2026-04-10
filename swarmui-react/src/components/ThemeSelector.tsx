// ThemeSelector Component - Enhanced theme picker with search and categories
import { useState, useMemo, lazy, Suspense } from 'react';
import {
    Group, Box, Text, Tooltip, Popover, Stack,
    Switch, ColorPicker, TextInput, ScrollArea,
    Accordion, UnstyledButton, Divider
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconPalette, IconSettings, IconDroplet, IconCheck, IconSearch, IconPlus, IconUpload } from '@tabler/icons-react';
import {
    getThemePersonalityLabel,
    useThemeStore,
    THEME_PALETTES,
    resolveThemeStyle,
    type ThemeCategory,
    type ThemeControlShape,
    type ThemePalette,
    type ThemeControlMode,
    type ThemeIconShape,
    type ThemeStyleFamily,
    type ThemeStyleMotif,
    type ThemeSurfaceMode
} from '../store/themeStore';
import {
    useAnimationStore,
    type AnimationSpeed,
    type EffectsIntensity,
    type HoverIntensity,
    type MotionPreset
} from '../store/animationStore';
import { logger } from '../utils/logger';
import { ThemePreview } from './ThemePreview';
import { SwarmActionIcon, SwarmBadge, SwarmSegmentedControl } from './ui';

const ThemeBuilder = lazy(() =>
    import('./ThemeBuilder').then((module) => ({ default: module.ThemeBuilder }))
);
const ThemeImporter = lazy(() =>
    import('./ThemeImporter').then((module) => ({ default: module.ThemeImporter }))
);

const CATEGORY_LABELS: Record<ThemeCategory, string> = {
    default: 'Default',
    app: 'Apps',
    editor: 'Editors & IDEs',
    'color-scheme': 'Color Schemes',
    aesthetic: 'Aesthetic',
    game: 'Game-Inspired',
    minimal: 'Minimal',
    custom: 'Custom'
};

const CATEGORY_META_LABELS: Record<ThemeCategory, string> = {
    default: 'Core',
    app: 'App',
    editor: 'IDE',
    'color-scheme': 'Scheme',
    aesthetic: 'Aesthetic',
    game: 'Game',
    minimal: 'Minimal',
    custom: 'Custom',
};

const CATEGORY_ORDER: ThemeCategory[] = [
    'default',
    'color-scheme',
    'app',
    'editor',
    'aesthetic',
    'game',
    'minimal',
    'custom'
];

const FAMILY_LABELS: Record<ThemeStyleFamily, string> = {
    classic: 'Classic',
    material: 'Material',
    glyph: 'Glyph',
};

const MOTIF_LABELS: Record<Exclude<ThemeStyleMotif, 'none'>, string> = {
    'dot-grid': 'Dot Grid',
    'glyph-field': 'Glyph Field',
};

const SURFACE_LABELS: Record<ThemeSurfaceMode, string> = {
    gradient: 'Gradient',
    tonal: 'Tonal',
    ornamented: 'Ornamented',
};

const CONTROL_LABELS: Record<ThemeControlMode, string> = {
    default: 'Default',
    filled: 'Filled',
    outlined: 'Outlined',
};

const CONTROL_SHAPE_LABELS: Record<ThemeControlShape, string> = {
    rounded: 'Rounded',
    pill: 'Pill',
    square: 'Square',
};

const ICON_SHAPE_LABELS: Record<ThemeIconShape, string> = {
    rounded: 'Rounded',
    circle: 'Circle',
    square: 'Square',
};

const MOTION_PRESET_LABELS: Record<MotionPreset, string> = {
    minimal: 'Minimal',
    calm: 'Calm',
    studio: 'Studio',
    expressive: 'Expressive',
};

const EFFECTS_INTENSITY_LABELS: Record<EffectsIntensity, string> = {
    off: 'Off',
    soft: 'Soft',
    full: 'Full',
};

interface ThemeSelectorProps {
    compact?: boolean;
}

interface MotionPreviewCardProps {
    reducedMotion: boolean;
    motionPreset: MotionPreset;
    pageTransitions: boolean;
    ambientMotion: boolean;
    hoverLiftEnabled: boolean;
    loadingAnimations: boolean;
    effectsIntensity: EffectsIntensity;
}

function MotionPreviewCard({
    reducedMotion,
    motionPreset,
    pageTransitions,
    ambientMotion,
    hoverLiftEnabled,
    loadingAnimations,
    effectsIntensity,
}: MotionPreviewCardProps) {
    return (
        <Box
            className="surface-paper"
            style={{
                padding: 10,
                borderRadius: 10,
                position: 'relative',
                overflow: 'hidden',
            }}
        >
            <Stack gap={8}>
                <Group justify="space-between" align="center" wrap="nowrap">
                    <Text size="9px" fw={700} tt="uppercase" style={{ letterSpacing: '0.1em' }}>
                        Motion Preview
                    </Text>
                    <Group gap={4} wrap="wrap" justify="flex-end">
                        <SwarmBadge size="xs" tone="secondary" emphasis="soft">
                            {MOTION_PRESET_LABELS[motionPreset]}
                        </SwarmBadge>
                        <SwarmBadge size="xs" tone={effectsIntensity === 'full' ? 'info' : 'secondary'} emphasis="outline">
                            {EFFECTS_INTENSITY_LABELS[effectsIntensity]}
                        </SwarmBadge>
                    </Group>
                </Group>

                <Box
                    className={!reducedMotion && ambientMotion ? 'fx-icon-float' : undefined}
                    style={{
                        width: 18,
                        height: 18,
                        borderRadius: 999,
                        background: 'var(--theme-brand-gradient)',
                        boxShadow: '0 0 18px var(--theme-tone-primary-glow)',
                        alignSelf: 'flex-end',
                    }}
                />

                <Box
                    className={[
                        !reducedMotion && pageTransitions ? 'fx-reveal' : '',
                        !reducedMotion && effectsIntensity !== 'off' ? 'fx-gradient-sweep' : '',
                    ].filter(Boolean).join(' ')}
                    style={{
                        borderRadius: 8,
                        padding: '8px 10px',
                        border: '1px solid color-mix(in srgb, var(--theme-brand) 20%, transparent)',
                        background: 'color-mix(in srgb, var(--theme-gray-7) 88%, var(--theme-gray-8))',
                    }}
                >
                    <Text size="xs" fw={600}>Stage transition sample</Text>
                    <Text size="10px" c="dimmed">Reveal timing, surface sweep, and family motion curve.</Text>
                </Box>

                <Group grow>
                    <Box
                        className={!reducedMotion && hoverLiftEnabled ? 'fx-hover-lift' : undefined}
                        data-hover-lift="true"
                        style={{
                            borderRadius: 8,
                            padding: '8px 10px',
                            border: '1px solid var(--theme-gray-5)',
                            background: 'color-mix(in srgb, var(--theme-gray-8) 82%, var(--theme-gray-9))',
                        }}
                    >
                        <Text size="10px" fw={700} tt="uppercase" style={{ letterSpacing: '0.08em' }}>
                            Hover Lift
                        </Text>
                        <Text size="10px" c="dimmed">Button and tile motion response.</Text>
                    </Box>
                    <Box
                        className={!reducedMotion && loadingAnimations ? 'fx-shimmer' : undefined}
                        style={{
                            borderRadius: 8,
                            padding: '8px 10px',
                            border: '1px solid var(--theme-gray-5)',
                            backgroundColor: 'color-mix(in srgb, var(--theme-gray-7) 90%, var(--theme-gray-8))',
                        }}
                    >
                        <Text size="10px" fw={700} tt="uppercase" style={{ letterSpacing: '0.08em' }}>
                            Loading
                        </Text>
                        <Text size="10px" c="dimmed">Shimmer and progress ambience.</Text>
                    </Box>
                </Group>
            </Stack>
        </Box>
    );
}

export function ThemeSelector({ compact = false }: ThemeSelectorProps) {
    const {
        currentTheme,
        setTheme,
        customAccent,
        setCustomAccent,
        controlShapeOverride,
        iconShapeOverride,
        setControlShapeOverride,
        setIconShapeOverride,
        getAllThemes,
    } = useThemeStore();
    const {
        reducedMotion,
        speed,
        hoverIntensity,
        effectsEnabled,
        motionPreset,
        ambientMotion,
        pageTransitions,
        hoverLiftEnabled,
        loadingAnimations,
        effectsIntensity,
        setReducedMotion,
        setSpeed,
        setHoverIntensity,
        setEffectsEnabled,
        setMotionPreset,
        setAmbientMotion,
        setPageTransitions,
        setHoverLiftEnabled,
        setLoadingAnimations,
        setEffectsIntensity,
    } = useAnimationStore();
    const [colorOpen, setColorOpen] = useState(false);
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [themePickerOpen, setThemePickerOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [previewThemeId, setPreviewThemeId] = useState<string | null>(null);
    const [builderOpen, setBuilderOpen] = useState(false);
    const [importerOpen, setImporterOpen] = useState(false);

    const allThemes = getAllThemes();
    const currentThemeData = allThemes.find(t => t.id === currentTheme);
    const defaultPreviewTheme = currentThemeData || allThemes[0] || THEME_PALETTES[0];
    const previewTheme = useMemo(
        () => allThemes.find((theme) => theme.id === (previewThemeId || currentTheme)) || defaultPreviewTheme,
        [allThemes, previewThemeId, currentTheme, defaultPreviewTheme]
    );
    const displayColor = customAccent || currentThemeData?.colors.brand || THEME_PALETTES[0].colors.brand;
    const previewStyle = resolveThemeStyle(previewTheme);
    const previewThemePersonality = getThemePersonalityLabel(previewTheme);
    const controlShapeValue = controlShapeOverride || 'theme';
    const iconShapeValue = iconShapeOverride || 'theme';
    const accentSwatches = useMemo(
        () => Array.from(new Set(THEME_PALETTES.map((theme) => theme.colors.brand))).slice(0, 8),
        []
    );

    const handleThemePickerOpenChange = (opened: boolean) => {
        setThemePickerOpen(opened);
        setPreviewThemeId(null);
    };

    // Group themes by category
    const themesByCategory = useMemo(() => {
        const groups = new Map<ThemeCategory, ThemePalette[]>();

        allThemes.forEach(theme => {
            const existing = groups.get(theme.category) || [];
            groups.set(theme.category, [...existing, theme]);
        });

        return groups;
    }, [allThemes]);

    // Filter themes by search query
    const filteredThemesByCategory = useMemo(() => {
        if (!searchQuery.trim()) return themesByCategory;

        const query = searchQuery.toLowerCase();
        const filtered = new Map<ThemeCategory, ThemePalette[]>();

        themesByCategory.forEach((themes, category) => {
            const matchingThemes = themes.filter(theme =>
                theme.name.toLowerCase().includes(query) ||
                theme.id.toLowerCase().includes(query)
            );

            if (matchingThemes.length > 0) {
                filtered.set(category, matchingThemes);
            }
        });

        return filtered;
    }, [themesByCategory, searchQuery]);

    const handleThemeChange = (themeId: string) => {
        setTheme(themeId);
        setPreviewThemeId(themeId);
        setThemePickerOpen(false);

        const themeName = allThemes.find(t => t.id === themeId)?.name || themeId;

        logger.debug('[ThemeSelector] Theme changed to:', themeId);
        logger.debug('[ThemeSelector] localStorage after change:', localStorage.getItem('swarmui-theme'));

        notifications.show({
            title: 'Theme Saved',
            message: `Switched to "${themeName}" theme. This will persist on reload.`,
            color: 'green',
            icon: <IconCheck size={16} />,
            autoClose: 2000,
        });
    };

    return (
        <Group gap="xs">
            {/* Theme Picker Button */}
            <Popover
                opened={themePickerOpen}
                onChange={handleThemePickerOpenChange}
                position="bottom"
                withArrow
                width={640}
                shadow="md"
            >
                <Popover.Target>
                    <Tooltip label="Select color theme">
                        <UnstyledButton
                            onClick={() => setThemePickerOpen(o => !o)}
                            className={`swarm-theme-trigger ${compact ? 'swarm-theme-trigger--compact' : ''}`.trim()}
                            aria-label="Select color theme"
                        >
                            <IconPalette size={14} />
                            {!compact && <Text size="xs" style={{ minWidth: 100 }}>{currentThemeData?.name || 'Theme'}</Text>}
                        </UnstyledButton>
                    </Tooltip>
                </Popover.Target>
                <Popover.Dropdown p={0}>
                    <Stack gap={0}>
                        {/* Search Input & Action Buttons */}
                        <Box p="xs" style={{ borderBottom: '1px solid var(--theme-gray-5)' }}>
                            <Group gap="xs">
                                <TextInput
                                    size="xs"
                                    placeholder="Search themes..."
                                    leftSection={<IconSearch size={14} />}
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.currentTarget.value)}
                                    styles={{
                                        input: {
                                            backgroundColor: 'var(--theme-gray-7)',
                                            border: '1px solid var(--theme-gray-5)'
                                        }
                                    }}
                                    style={{ flex: 1 }}
                                />
                                <Tooltip label="Import theme from JSON">
                                    <SwarmActionIcon
                                        size="sm"
                                        tone="secondary"
                                        emphasis="ghost"
                                        label="Import theme from JSON"
                                        onClick={() => {
                                            setImporterOpen(true);
                                            setThemePickerOpen(false);
                                        }}
                                    >
                                        <IconUpload size={14} />
                                    </SwarmActionIcon>
                                </Tooltip>
                                <Tooltip label="Create custom theme">
                                    <SwarmActionIcon
                                        size="sm"
                                        tone="primary"
                                        emphasis="soft"
                                        label="Create custom theme"
                                        onClick={() => {
                                            setBuilderOpen(true);
                                            setThemePickerOpen(false);
                                        }}
                                    >
                                        <IconPlus size={14} />
                                    </SwarmActionIcon>
                                </Tooltip>
                            </Group>
                        </Box>

                        {/* Theme List with Preview */}
                        <Group gap={0} align="stretch" wrap="nowrap" style={{ width: '100%' }}>
                            {/* Theme List */}
                            <ScrollArea h={400} type="auto" style={{ flex: '0 0 310px' }}>
                            {searchQuery.trim() ? (
                                // Flat list when searching
                                <Stack gap={0} p="xs">
                                    {Array.from(filteredThemesByCategory.entries()).flatMap(([, themes]) =>
                                        themes.map(theme => (
                                            <ThemeItem
                                                key={theme.id}
                                                theme={theme}
                                                isActive={theme.id === currentTheme}
                                                onClick={() => handleThemeChange(theme.id)}
                                                onMouseEnter={() => setPreviewThemeId(theme.id)}
                                                onMouseLeave={() => setPreviewThemeId(currentTheme)}
                                            />
                                        ))
                                    )}
                                    {filteredThemesByCategory.size === 0 && (
                                        <Text size="xs" c="dimmed" ta="center" py="xl">
                                            No themes found matching "{searchQuery}"
                                        </Text>
                                    )}
                                </Stack>
                            ) : (
                                // Categorized accordion when not searching
                                <Accordion
                                    multiple
                                    defaultValue={['default', 'color-scheme']}
                                    variant="separated"
                                    styles={{
                                        item: {
                                            border: 'none',
                                            borderBottom: '1px solid var(--theme-gray-6)'
                                        },
                                        control: {
                                            padding: '8px 12px'
                                        },
                                        content: {
                                            padding: 0
                                        }
                                    }}
                                >
                                    {CATEGORY_ORDER.map(category => {
                                        const themes = themesByCategory.get(category);
                                        if (!themes || themes.length === 0) return null;

                                        return (
                                            <Accordion.Item key={category} value={category}>
                                                <Accordion.Control>
                                                    <Group gap="xs">
                                                        <Text size="xs" fw={600}>{CATEGORY_LABELS[category]}</Text>
                                                        <SwarmBadge size="xs" tone="secondary" emphasis="soft">{themes.length}</SwarmBadge>
                                                    </Group>
                                                </Accordion.Control>
                                                <Accordion.Panel>
                                                    <Stack gap={0}>
                                                        {themes.map(theme => (
                                                            <ThemeItem
                                                                key={theme.id}
                                                                theme={theme}
                                                                isActive={theme.id === currentTheme}
                                                                onClick={() => handleThemeChange(theme.id)}
                                                                onMouseEnter={() => setPreviewThemeId(theme.id)}
                                                                onMouseLeave={() => setPreviewThemeId(currentTheme)}
                                                            />
                                                        ))}
                                                    </Stack>
                                                </Accordion.Panel>
                                            </Accordion.Item>
                                        );
                                    })}
                                </Accordion>
                            )}
                            </ScrollArea>

                            {/* Preview Panel */}
                            <Box
                                p="xs"
                                style={{
                                    flex: 1,
                                    minWidth: 0,
                                    borderLeft: '1px solid var(--theme-gray-5)',
                                    backgroundColor: 'var(--theme-gray-8)'
                                }}
                            >
                                <Stack gap="xs">
                                    <ThemePreview
                                        theme={previewTheme}
                                        styleOverride={{
                                            controlShape: controlShapeOverride,
                                            iconShape: iconShapeOverride,
                                        }}
                                    />
                                    <Box
                                        className="surface-paper"
                                        style={{
                                            padding: 10,
                                            borderRadius: 10,
                                        }}
                                    >
                                        <Stack gap={6}>
                                            <Group gap={6} wrap="wrap">
                                                <SwarmBadge size="xs" tone="secondary" emphasis="soft">
                                                    {previewThemePersonality}
                                                </SwarmBadge>
                                                <SwarmBadge
                                                    size="xs"
                                                    tone={previewStyle.family === 'glyph' ? 'warning' : previewStyle.family === 'material' ? 'info' : 'secondary'}
                                                    emphasis={previewStyle.family === 'glyph' ? 'outline' : 'soft'}
                                                >
                                                    {FAMILY_LABELS[previewStyle.family]}
                                                </SwarmBadge>
                                                <SwarmBadge size="xs" tone="secondary" emphasis="outline">
                                                    {SURFACE_LABELS[previewStyle.surfaceMode]}
                                                </SwarmBadge>
                                                <SwarmBadge size="xs" tone="secondary" emphasis="outline">
                                                    {CONTROL_LABELS[previewStyle.controlMode]}
                                                </SwarmBadge>
                                                <SwarmBadge size="xs" tone="secondary" emphasis="outline">
                                                    {CONTROL_SHAPE_LABELS[controlShapeOverride || previewStyle.controlShape]}
                                                </SwarmBadge>
                                                <SwarmBadge size="xs" tone="secondary" emphasis="outline">
                                                    {ICON_SHAPE_LABELS[iconShapeOverride || previewStyle.iconShape]}
                                                </SwarmBadge>
                                            </Group>
                                            <Text size="xs" fw={600}>
                                                {previewTheme.name}
                                            </Text>
                                            <Text size="xs" c="dimmed">
                                                {previewTheme.colors.fontHeading || previewTheme.colors.fontFamily || 'System heading'} heading paired with{' '}
                                                {previewTheme.colors.fontFamily || 'system UI'} UI text and{' '}
                                                {previewTheme.colors.fontMono || 'system mono'} mono accents.
                                            </Text>
                                        </Stack>
                                    </Box>
                                </Stack>
                            </Box>
                        </Group>
                    </Stack>
                </Popover.Dropdown>
            </Popover>

            {!compact && (
                <>
                    {/* Custom Accent Color Button */}
                    <Popover opened={colorOpen} onChange={setColorOpen} position="bottom" withArrow>
                        <Popover.Target>
                            <Tooltip label={customAccent ? `Custom: ${customAccent}` : "Custom accent color"}>
                                <SwarmActionIcon
                                    size="sm"
                                    tone="info"
                                    emphasis={customAccent ? 'solid' : 'ghost'}
                                    label="Custom accent color"
                                    onClick={() => setColorOpen(o => !o)}
                                    style={{
                                        backgroundColor: customAccent || undefined,
                                        border: customAccent ? 'none' : undefined
                                    }}
                                >
                                    <IconDroplet size={14} />
                                </SwarmActionIcon>
                            </Tooltip>
                        </Popover.Target>
                        <Popover.Dropdown p="xs">
                            <Stack gap="xs">
                                <Text size="xs" fw={600}>Custom Accent</Text>
                                <ColorPicker
                                    size="sm"
                                    value={displayColor}
                                    onChange={(value) => setCustomAccent(value)}
                                    swatches={accentSwatches}
                                />
                                {customAccent && (
                                    <Text
                                        size="xs"
                                        c="dimmed"
                                        style={{ cursor: 'pointer' }}
                                        onClick={() => { setCustomAccent(null); setColorOpen(false); }}
                                    >
                                        Reset to theme default
                                    </Text>
                                )}
                            </Stack>
                        </Popover.Dropdown>
                    </Popover>

                    {/* Settings Button */}
                    <Popover opened={settingsOpen} onChange={setSettingsOpen} position="bottom-end" withArrow width={380}>
                        <Popover.Target>
                            <Tooltip label="Animation & display settings">
                                <SwarmActionIcon
                                    size="sm"
                                    tone="secondary"
                                    emphasis="ghost"
                                    label="Open animation and display settings"
                                    onClick={() => setSettingsOpen(o => !o)}
                                >
                                    <IconSettings size={14} />
                                </SwarmActionIcon>
                            </Tooltip>
                        </Popover.Target>
                        <Popover.Dropdown>
                            <Stack gap="md">
                                <Text size="xs" fw={600} tt="uppercase">Control Shapes</Text>
                                <Stack gap={4}>
                                    <Text size="xs">Button Shape</Text>
                                    <SwarmSegmentedControl
                                        fullWidth
                                        value={controlShapeValue}
                                        onChange={(value) => {
                                            if (value === 'theme') {
                                                setControlShapeOverride(null);
                                                return;
                                            }
                                            setControlShapeOverride(value as ThemeControlShape);
                                        }}
                                        data={[
                                            { value: 'theme', label: 'Theme' },
                                            { value: 'rounded', label: 'Round' },
                                            { value: 'pill', label: 'Pill' },
                                            { value: 'square', label: 'Square' },
                                        ]}
                                    />
                                </Stack>

                                <Stack gap={4}>
                                    <Text size="xs">Icon Shape</Text>
                                    <SwarmSegmentedControl
                                        fullWidth
                                        value={iconShapeValue}
                                        onChange={(value) => {
                                            if (value === 'theme') {
                                                setIconShapeOverride(null);
                                                return;
                                            }
                                            setIconShapeOverride(value as ThemeIconShape);
                                        }}
                                        data={[
                                            { value: 'theme', label: 'Theme' },
                                            { value: 'rounded', label: 'Round' },
                                            { value: 'circle', label: 'Circle' },
                                            { value: 'square', label: 'Square' },
                                        ]}
                                    />
                                </Stack>

                                <Divider />

                                <Text size="xs" fw={600} tt="uppercase">Animation Settings</Text>
                                <Stack gap={4}>
                                    <Text size="xs">Motion Preset</Text>
                                    <SwarmSegmentedControl
                                        fullWidth
                                        value={motionPreset}
                                        onChange={(v) => setMotionPreset(v as MotionPreset)}
                                        data={[
                                            { value: 'minimal', label: 'Minimal' },
                                            { value: 'calm', label: 'Calm' },
                                            { value: 'studio', label: 'Studio' },
                                            { value: 'expressive', label: 'Expressive' },
                                        ]}
                                        disabled={reducedMotion}
                                    />
                                </Stack>

                                <Group justify="space-between">
                                    <Text size="xs">Reduced Motion</Text>
                                    <Switch
                                        size="xs"
                                        checked={reducedMotion}
                                        onChange={(e) => setReducedMotion(e.currentTarget.checked)}
                                    />
                                </Group>

                                <Group justify="space-between">
                                    <Text size="xs">Visual Effects</Text>
                                    <Switch
                                        size="xs"
                                        checked={effectsEnabled}
                                        onChange={(e) => setEffectsEnabled(e.currentTarget.checked)}
                                        disabled={reducedMotion}
                                    />
                                </Group>

                                <Stack gap={4}>
                                    <Text size="xs">Effects Intensity</Text>
                                    <SwarmSegmentedControl
                                        fullWidth
                                        value={effectsIntensity}
                                        onChange={(v) => setEffectsIntensity(v as EffectsIntensity)}
                                        data={[
                                            { value: 'off', label: 'Off' },
                                            { value: 'soft', label: 'Soft' },
                                            { value: 'full', label: 'Full' },
                                        ]}
                                        disabled={reducedMotion || !effectsEnabled}
                                    />
                                </Stack>

                                <Stack gap={4}>
                                    <Text size="xs">Animation Speed</Text>
                                    <SwarmSegmentedControl
                                        fullWidth
                                        value={speed}
                                        onChange={(v) => setSpeed(v as AnimationSpeed)}
                                        data={[
                                            { value: 'slow', label: 'Slow' },
                                            { value: 'normal', label: 'Normal' },
                                            { value: 'fast', label: 'Fast' },
                                        ]}
                                        disabled={reducedMotion}
                                    />
                                </Stack>

                                <Stack gap={4}>
                                    <Text size="xs">Hover Intensity</Text>
                                    <SwarmSegmentedControl
                                        fullWidth
                                        value={hoverIntensity}
                                        onChange={(v) => setHoverIntensity(v as HoverIntensity)}
                                        data={[
                                            { value: 'subtle', label: 'Subtle' },
                                            { value: 'normal', label: 'Normal' },
                                            { value: 'pronounced', label: 'Bold' },
                                        ]}
                                        disabled={reducedMotion || !hoverLiftEnabled}
                                    />
                                </Stack>

                                <Divider />

                                <Text size="xs" fw={600} tt="uppercase">Motion Channels</Text>
                                <Group justify="space-between">
                                    <Text size="xs">Ambient Surfaces</Text>
                                    <Switch
                                        size="xs"
                                        checked={ambientMotion}
                                        onChange={(e) => setAmbientMotion(e.currentTarget.checked)}
                                        disabled={reducedMotion}
                                    />
                                </Group>
                                <Group justify="space-between">
                                    <Text size="xs">Page Transitions</Text>
                                    <Switch
                                        size="xs"
                                        checked={pageTransitions}
                                        onChange={(e) => setPageTransitions(e.currentTarget.checked)}
                                        disabled={reducedMotion}
                                    />
                                </Group>
                                <Group justify="space-between">
                                    <Text size="xs">Hover Lift</Text>
                                    <Switch
                                        size="xs"
                                        checked={hoverLiftEnabled}
                                        onChange={(e) => setHoverLiftEnabled(e.currentTarget.checked)}
                                        disabled={reducedMotion}
                                    />
                                </Group>
                                <Group justify="space-between">
                                    <Text size="xs">Loading Motion</Text>
                                    <Switch
                                        size="xs"
                                        checked={loadingAnimations}
                                        onChange={(e) => setLoadingAnimations(e.currentTarget.checked)}
                                        disabled={reducedMotion}
                                    />
                                </Group>

                                <MotionPreviewCard
                                    reducedMotion={reducedMotion}
                                    motionPreset={motionPreset}
                                    pageTransitions={pageTransitions}
                                    ambientMotion={ambientMotion}
                                    hoverLiftEnabled={hoverLiftEnabled}
                                    loadingAnimations={loadingAnimations}
                                    effectsIntensity={effectsIntensity}
                                />

                                <Text size="xs" fw={600} tt="uppercase" mt="xs">Display Info</Text>
                                <Group gap="xs">
                                    <SwarmBadge size="xs" tone="secondary" emphasis="soft">Theme: {currentThemeData?.name}</SwarmBadge>
                                    <SwarmBadge size="xs" tone="info" emphasis="soft">{MOTION_PRESET_LABELS[motionPreset]}</SwarmBadge>
                                    <SwarmBadge size="xs" tone="secondary" emphasis="outline">Buttons: {CONTROL_SHAPE_LABELS[controlShapeOverride || previewStyle.controlShape]}</SwarmBadge>
                                    <SwarmBadge size="xs" tone="secondary" emphasis="outline">Icons: {ICON_SHAPE_LABELS[iconShapeOverride || previewStyle.iconShape]}</SwarmBadge>
                                    {customAccent && <SwarmBadge size="xs" tone="info" emphasis="soft">Custom</SwarmBadge>}
                                    {!effectsEnabled && <SwarmBadge size="xs" tone="secondary" emphasis="outline">Effects Off</SwarmBadge>}
                                    {!pageTransitions && <SwarmBadge size="xs" tone="secondary" emphasis="outline">No Page FX</SwarmBadge>}
                                </Group>
                            </Stack>
                        </Popover.Dropdown>
                    </Popover>
                </>
            )}

            {/* Theme Builder Modal (loaded on demand) */}
            {builderOpen && (
                <Suspense fallback={null}>
                    <ThemeBuilder
                        opened={builderOpen}
                        onClose={() => setBuilderOpen(false)}
                    />
                </Suspense>
            )}

            {/* Theme Importer Modal (loaded on demand) */}
            {importerOpen && (
                <Suspense fallback={null}>
                    <ThemeImporter
                        opened={importerOpen}
                        onClose={() => setImporterOpen(false)}
                    />
                </Suspense>
            )}
        </Group>
    );
}

// Theme item component with color swatch strip
interface ThemeItemProps {
    theme: ThemePalette;
    isActive: boolean;
    onClick: () => void;
    onMouseEnter?: () => void;
    onMouseLeave?: () => void;
}

function ThemeItem({ theme, isActive, onClick, onMouseEnter, onMouseLeave }: ThemeItemProps) {
    const style = resolveThemeStyle(theme);
    const personalityLabel = getThemePersonalityLabel(theme);
    const accent2 = theme.colors.secondaryAccent || `color-mix(in srgb, ${theme.colors.accent} 65%, ${theme.colors.brand})`;
    const accent3 = theme.colors.tertiaryAccent || `color-mix(in srgb, ${theme.colors.success} 55%, ${theme.colors.accent})`;
    const previewHeadingFont = theme.colors.fontHeading || theme.colors.fontFamily;
    const previewBodyFont = theme.colors.fontFamily;
    const familyTone = style.family === 'material' ? 'info' : style.family === 'glyph' ? 'warning' : 'secondary';
    const motifLabel = style.motif === 'none' ? null : MOTIF_LABELS[style.motif];

    return (
        <UnstyledButton
            onClick={onClick}
            className={`swarm-theme-item ${isActive ? 'swarm-theme-item--active' : ''}`.trim()}
            onMouseEnter={onMouseEnter}
            onMouseLeave={onMouseLeave}
        >
            {/* Color swatch strip */}
            <Group gap={2} className="swarm-theme-item__swatches">
                <Box
                    style={{
                        width: 16,
                        height: 16,
                        borderRadius: 3,
                        background: `linear-gradient(140deg, ${theme.colors.brand}, ${accent2})`,
                        border: '1px solid var(--theme-gray-5)'
                    }}
                />
                <Box
                    style={{
                        width: 10,
                        height: 16,
                        borderRadius: 2,
                        background: theme.colors.gray8
                    }}
                />
                <Box
                    style={{
                        width: 10,
                        height: 16,
                        borderRadius: 2,
                        background: theme.colors.accent
                    }}
                />
                <Box
                    style={{
                        width: 10,
                        height: 16,
                        borderRadius: 2,
                        background: accent3
                    }}
                />
            </Group>

            {/* Theme name */}
            <Box className="swarm-theme-item__content">
                <Text
                    className="swarm-theme-item__title"
                    size="sm"
                    fw={700}
                    truncate
                    style={previewHeadingFont ? { fontFamily: previewHeadingFont } : undefined}
                >
                    {theme.name}
                </Text>
                <Box className="swarm-theme-item__meta">
                    <Text
                        c="dimmed"
                        className="swarm-theme-item__meta-text"
                        style={previewBodyFont ? { fontFamily: previewBodyFont } : undefined}
                    >
                        {CATEGORY_META_LABELS[theme.category]}
                    </Text>
                    <Box className="swarm-theme-item__badge-row">
                        <SwarmBadge
                            size="xs"
                            tone="secondary"
                            emphasis="soft"
                            className="swarm-theme-item__style-badge"
                        >
                            {personalityLabel}
                        </SwarmBadge>
                        <SwarmBadge
                            size="xs"
                            tone={familyTone}
                            emphasis={style.family === 'glyph' ? 'outline' : 'soft'}
                            className="swarm-theme-item__style-badge"
                        >
                            {FAMILY_LABELS[style.family]}
                        </SwarmBadge>
                        <SwarmBadge
                            size="xs"
                            tone="secondary"
                            emphasis="outline"
                            className="swarm-theme-item__style-badge"
                        >
                            {SURFACE_LABELS[style.surfaceMode]}
                        </SwarmBadge>
                        {motifLabel && (
                            <SwarmBadge
                                size="xs"
                                tone="secondary"
                                emphasis="outline"
                                className="swarm-theme-item__style-badge"
                            >
                                {motifLabel}
                            </SwarmBadge>
                        )}
                    </Box>
                </Box>
            </Box>

            {/* Active indicator */}
            {isActive && <IconCheck size={14} color="var(--theme-brand)" />}
        </UnstyledButton>
    );
}
