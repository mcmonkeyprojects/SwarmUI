import { useMemo, useState } from 'react';
import { Accordion, Box, Group, ScrollArea, Stack, Text, Tooltip, UnstyledButton } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconCheck, IconPlus, IconUpload } from '@tabler/icons-react';
import { getThemePersonalityLabel, resolveThemeStyle, type ResolvedColorScheme, type ThemeCategory, type ThemeControlMode, type ThemePalette, type ThemeStyleFamily, type ThemeStyleMotif, type ThemeSurfaceMode, useThemeStore } from '../store/themeStore';
import { logger } from '../utils/logger';
import { ThemePreview } from './ThemePreview';
import { SwarmActionIcon, SwarmBadge, SwarmButton } from './ui';

type ExtendedTheme = ThemePalette & { meta?: { themeSet?: string; pairedModeThemeId?: string; recommendationIds?: string[]; tags?: string[] } };

const CATEGORY_LABELS: Record<ThemeCategory, string> = {
    default: 'Default', app: 'Apps', editor: 'Editors & IDEs', 'color-scheme': 'Color Schemes', aesthetic: 'Aesthetic', art: 'Art', film: 'Film', music: 'Music', nature: 'Nature', game: 'Game-Inspired', minimal: 'Minimal', custom: 'Custom',
};
const CATEGORY_META_LABELS: Record<ThemeCategory, string> = {
    default: 'Core', app: 'App', editor: 'IDE', 'color-scheme': 'Scheme', aesthetic: 'Aesthetic', art: 'Art', film: 'Film', music: 'Music', nature: 'Nature', game: 'Game', minimal: 'Minimal', custom: 'Custom',
};
const CATEGORY_ORDER: ThemeCategory[] = ['default', 'color-scheme', 'app', 'editor', 'aesthetic', 'art', 'film', 'music', 'nature', 'game', 'minimal', 'custom'];
const FAMILY_LABELS: Record<ThemeStyleFamily, string> = { classic: 'Classic', material: 'Material', glyph: 'Glyph' };
const MOTIF_LABELS: Record<Exclude<ThemeStyleMotif, 'none'>, string> = { 'dot-grid': 'Dot Grid', 'glyph-field': 'Glyph Field' };
const SURFACE_LABELS: Record<ThemeSurfaceMode, string> = { gradient: 'Gradient', tonal: 'Tonal', ornamented: 'Ornamented' };
const CONTROL_LABELS: Record<ThemeControlMode, string> = { default: 'Default', filled: 'Filled', outlined: 'Outlined' };

interface ThemeCatalogBrowserProps {
    targetScheme: ResolvedColorScheme;
    selectedThemeId: string;
    onOpenImporter: () => void;
    onOpenBuilder: () => void;
    onSelected?: (themeId: string) => void;
}

const themeMeta = (theme: ThemePalette) => (theme as ExtendedTheme).meta || {};
export function ThemeCatalogBrowser({ targetScheme, selectedThemeId, onOpenImporter, onOpenBuilder, onSelected }: ThemeCatalogBrowserProps) {
    const { setThemeForScheme, getAllThemes, getThemeRecommendations, applyThemePair, controlShapeOverride, iconShapeOverride } = useThemeStore();
    const [previewThemeId, setPreviewThemeId] = useState<string | null>(null);

    const allThemes = getAllThemes();
    const selectedThemeData = allThemes.find((theme) => theme.id === selectedThemeId) || allThemes[0];
    const previewTheme = allThemes.find((theme) => theme.id === (previewThemeId || selectedThemeId)) || selectedThemeData;
    const previewStyle = resolveThemeStyle(previewTheme);
    const previewThemePersonality = getThemePersonalityLabel(previewTheme);
    const previewRecommendations = useMemo(
        () => getThemeRecommendations(previewTheme.id).slice(0, 3),
        [getThemeRecommendations, previewTheme.id]
    );

    const themesByCategory = useMemo(() => {
        const groups = new Map<ThemeCategory, ThemePalette[]>();
        for (const theme of allThemes) {
            const existing = groups.get(theme.category) || [];
            groups.set(theme.category, [...existing, theme]);
        }
        return groups;
    }, [allThemes]);

    const applyTheme = (themeId: string) => {
        setThemeForScheme(targetScheme, themeId);
        setPreviewThemeId(themeId);
        logger.debug('[ThemeCatalogBrowser] Theme set for scheme', targetScheme, themeId);
        notifications.show({
            title: targetScheme === 'light' ? 'Light theme saved' : 'Dark theme saved',
            message: `"${allThemes.find((theme) => theme.id === themeId)?.name || themeId}" will be used for the ${targetScheme} scheme.`,
            color: 'green',
            icon: <IconCheck size={16} />,
            autoClose: 2000,
        });
        onSelected?.(themeId);
    };

    const applyPair = (theme: ThemePalette) => {
        const meta = themeMeta(theme);
        const pair = meta.pairedModeThemeId ? allThemes.find((candidate) => candidate.id === meta.pairedModeThemeId) : null;
        applyThemePair(theme.id, targetScheme);
        setPreviewThemeId(theme.id);
        if (pair) {
            notifications.show({
                title: 'Paired theme applied',
                message: `"${pair.name}" was applied to the opposite scheme.`,
                color: 'blue',
            });
        }
    };

    return (
        <Stack gap={0} className="swarm-theme-catalog swarm-theme-catalog--viewer">
            <Box p="sm" className="swarm-theme-catalog__viewer-header">
                <Group justify="space-between" gap="sm" wrap="wrap">
                    <Stack gap={2}>
                        <Text size="sm" fw={700}>{targetScheme === 'light' ? 'Light theme viewer' : 'Dark theme viewer'}</Text>
                        <Text size="xs" c="dimmed">Hover to preview. Click a theme to apply it to this slot.</Text>
                    </Stack>
                    <Group gap="xs" wrap="nowrap">
                        <Tooltip label="Import theme from JSON">
                            <SwarmActionIcon size="md" tone="secondary" emphasis="ghost" label="Import theme from JSON" onClick={onOpenImporter}>
                                <IconUpload size={14} />
                            </SwarmActionIcon>
                        </Tooltip>
                        <Tooltip label="Create custom theme">
                            <SwarmActionIcon size="md" tone="primary" emphasis="soft" label="Create custom theme" onClick={onOpenBuilder}>
                                <IconPlus size={14} />
                            </SwarmActionIcon>
                        </Tooltip>
                    </Group>
                </Group>
            </Box>

            <Group gap={0} align="stretch" wrap="nowrap" className="swarm-theme-catalog__body">
                <ScrollArea h={400} type="auto" className="swarm-theme-catalog__list">
                    <Accordion multiple defaultValue={['default', 'color-scheme']} variant="separated" styles={{ item: { border: 'none', borderBottom: '1px solid var(--theme-gray-6)' }, control: { padding: '8px 12px' }, content: { padding: 0 } }}>
                        {CATEGORY_ORDER.map((category) => {
                            const themes = themesByCategory.get(category);
                            if (!themes?.length) return null;
                            return (
                                <Accordion.Item key={category} value={category}>
                                    <Accordion.Control>
                                        <Group gap="xs"><Text size="xs" fw={600}>{CATEGORY_LABELS[category]}</Text><SwarmBadge size="xs" tone="secondary" emphasis="soft">{themes.length}</SwarmBadge></Group>
                                    </Accordion.Control>
                                    <Accordion.Panel>
                                        <Stack gap={0}>
                                            {themes.map((theme) => (
                                                <ThemeItem
                                                    key={theme.id}
                                                    theme={theme as ExtendedTheme}
                                                    isActive={theme.id === selectedThemeId}
                                                    onClick={() => applyTheme(theme.id)}
                                                    onApplyPair={() => applyPair(theme)}
                                                    onMouseEnter={() => setPreviewThemeId(theme.id)}
                                                    onMouseLeave={() => setPreviewThemeId(selectedThemeId)}
                                                />
                                            ))}
                                        </Stack>
                                    </Accordion.Panel>
                                </Accordion.Item>
                            );
                        })}
                    </Accordion>
                </ScrollArea>

                <Box p="xs" className="swarm-theme-catalog__preview">
                    <Stack gap="xs">
                        <ThemePreview theme={previewTheme} styleOverride={{ controlShape: controlShapeOverride, iconShape: iconShapeOverride }} />
                        <Box className="surface-paper" style={{ padding: 10, borderRadius: 10 }}>
                            <Stack gap={6}>
                                <Group gap={6} wrap="wrap">
                                    <SwarmBadge size="xs" tone="secondary" emphasis="soft">{previewThemePersonality}</SwarmBadge>
                                    <SwarmBadge size="xs" tone={previewStyle.family === 'glyph' ? 'warning' : previewStyle.family === 'material' ? 'info' : 'secondary'} emphasis={previewStyle.family === 'glyph' ? 'outline' : 'soft'}>{FAMILY_LABELS[previewStyle.family]}</SwarmBadge>
                                    <SwarmBadge size="xs" tone="secondary" emphasis="outline">{SURFACE_LABELS[previewStyle.surfaceMode]}</SwarmBadge>
                                    <SwarmBadge size="xs" tone="secondary" emphasis="outline">{CONTROL_LABELS[previewStyle.controlMode]}</SwarmBadge>
                                    {themeMeta(previewTheme).themeSet && <SwarmBadge size="xs" tone="primary" emphasis="soft">Set: {themeMeta(previewTheme).themeSet}</SwarmBadge>}
                                </Group>
                                <Text size="xs" fw={600} className="swarm-theme-catalog__preview-title">{previewTheme.name}</Text>
                                <Text size="xs" c="dimmed" className="swarm-theme-catalog__preview-copy">{previewTheme.colors.fontHeading || previewTheme.colors.fontFamily || 'System heading'} heading paired with {previewTheme.colors.fontFamily || 'system UI'} UI text and {previewTheme.colors.fontMono || 'system mono'} mono accents.</Text>
                                {themeMeta(previewTheme).pairedModeThemeId && (
                                    <Group gap={6} wrap="wrap">
                                        <SwarmBadge size="xs" tone="secondary" emphasis="outline">Paired with {themeMeta(previewTheme).pairedModeThemeId}</SwarmBadge>
                                        <SwarmButton size="xs" tone="secondary" emphasis="ghost" onClick={() => applyPair(previewTheme)}>Apply pair</SwarmButton>
                                    </Group>
                                )}
                                {(themeMeta(previewTheme).tags?.length || previewRecommendations.length > 0) && (
                                    <Group gap={6} wrap="wrap">
                                        {(themeMeta(previewTheme).tags || []).slice(0, 4).map((tag) => <SwarmBadge key={tag} size="xs" tone="secondary" emphasis="soft">{tag}</SwarmBadge>)}
                                        {previewRecommendations.map((theme) => (
                                            <SwarmButton key={theme.id} size="xs" tone="secondary" emphasis="ghost" onClick={() => applyTheme(theme.id)}>
                                                Try {theme.name}
                                            </SwarmButton>
                                        ))}
                                    </Group>
                                )}
                            </Stack>
                        </Box>
                    </Stack>
                </Box>
            </Group>
        </Stack>
    );
}

interface ThemeItemProps {
    theme: ExtendedTheme;
    isActive: boolean;
    onClick: () => void;
    onApplyPair: () => void;
    onMouseEnter?: () => void;
    onMouseLeave?: () => void;
}

function ThemeItem({ theme, isActive, onClick, onApplyPair, onMouseEnter, onMouseLeave }: ThemeItemProps) {
    const style = resolveThemeStyle(theme);
    const personalityLabel = getThemePersonalityLabel(theme);
    const meta = themeMeta(theme);
    const accent2 = theme.colors.secondaryAccent || `color-mix(in srgb, ${theme.colors.accent} 65%, ${theme.colors.brand})`;
    const accent3 = theme.colors.tertiaryAccent || `color-mix(in srgb, ${theme.colors.success} 55%, ${theme.colors.accent})`;
    const previewHeadingFont = theme.colors.fontHeading || theme.colors.fontFamily;
    const previewBodyFont = theme.colors.fontFamily;
    const familyTone = style.family === 'material' ? 'info' : style.family === 'glyph' ? 'warning' : 'secondary';
    const motifLabel = style.motif === 'none' ? null : MOTIF_LABELS[style.motif];

    return (
        <UnstyledButton onClick={onClick} className={`swarm-theme-item ${isActive ? 'swarm-theme-item--active' : ''}`.trim()} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave} aria-pressed={isActive}>
            <Group gap={2} className="swarm-theme-item__swatches">
                <Box style={{ width: 16, height: 16, borderRadius: 3, background: `linear-gradient(140deg, ${theme.colors.brand}, ${accent2})`, border: '1px solid var(--theme-gray-5)' }} />
                <Box style={{ width: 10, height: 16, borderRadius: 2, background: theme.colors.gray8 }} />
                <Box style={{ width: 10, height: 16, borderRadius: 2, background: theme.colors.accent }} />
                <Box style={{ width: 10, height: 16, borderRadius: 2, background: accent3 }} />
            </Group>
            <Box className="swarm-theme-item__content">
                <Text className="swarm-theme-item__title" size="sm" fw={700} truncate style={previewHeadingFont ? { fontFamily: previewHeadingFont } : undefined}>{theme.name}</Text>
                <Box className="swarm-theme-item__meta">
                    <Text c="dimmed" className="swarm-theme-item__meta-text" style={previewBodyFont ? { fontFamily: previewBodyFont } : undefined}>{CATEGORY_META_LABELS[theme.category]}</Text>
                    <Box className="swarm-theme-item__badge-row">
                        <SwarmBadge size="xs" tone="secondary" emphasis="soft" className="swarm-theme-item__style-badge">{personalityLabel}</SwarmBadge>
                        <SwarmBadge size="xs" tone={familyTone} emphasis={style.family === 'glyph' ? 'outline' : 'soft'} className="swarm-theme-item__style-badge">{FAMILY_LABELS[style.family]}</SwarmBadge>
                        <SwarmBadge size="xs" tone="secondary" emphasis="outline" className="swarm-theme-item__style-badge">{SURFACE_LABELS[style.surfaceMode]}</SwarmBadge>
                        {motifLabel && <SwarmBadge size="xs" tone="secondary" emphasis="outline" className="swarm-theme-item__style-badge">{motifLabel}</SwarmBadge>}
                        {meta.themeSet && <SwarmBadge size="xs" tone="primary" emphasis="soft" className="swarm-theme-item__style-badge">{meta.themeSet}</SwarmBadge>}
                        {meta.recommendationIds?.slice(0, 2).map((id) => <SwarmBadge key={id} size="xs" tone="secondary" emphasis="soft" className="swarm-theme-item__style-badge">Try {id}</SwarmBadge>)}
                    </Box>
                    {meta.tags?.length ? <Group gap={4} mt={4} wrap="wrap">{meta.tags.slice(0, 3).map((tag) => <SwarmBadge key={tag} size="xs" tone="secondary" emphasis="outline">{tag}</SwarmBadge>)}</Group> : null}
                    {meta.pairedModeThemeId ? <Group gap={4} mt={4}><SwarmBadge size="xs" tone="secondary" emphasis="soft">Pair: {meta.pairedModeThemeId}</SwarmBadge><SwarmButton size="xs" tone="secondary" emphasis="ghost" onClick={(e) => { e.stopPropagation(); onApplyPair(); }}>Apply pair</SwarmButton></Group> : null}
                </Box>
            </Box>
            {isActive && <IconCheck size={14} color="var(--theme-brand)" />}
        </UnstyledButton>
    );
}
