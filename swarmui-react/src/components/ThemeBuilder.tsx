import { useCallback, useMemo, useState } from 'react';
import { Accordion, Box, ColorInput, Divider, Group, Modal, NumberInput, ScrollArea, Select, Stack, Text, Textarea, TextInput } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconCopy, IconDeviceFloppy, IconDownload, IconX } from '@tabler/icons-react';
import { THEME_PALETTES, resolveThemeStyle, type ThemeCategory, type ThemeControlMode, type ThemeControlShape, type ThemeIconMode, type ThemeIconShape, type ThemeOverlayBlend, type ThemePalette, useThemeStore } from '../store/themeStore';
import { sanitizeThemeId } from '../utils/themeValidation';
import { ThemePreview } from './ThemePreview';
import { SwarmButton, SwarmSwitch } from './ui';

interface ThemeBuilderProps { opened: boolean; onClose: () => void; editThemeId?: string; }
type ThemeEffectsBlock = { noiseIntensity?: number; scanlineIntensity?: number; meshIntensity?: number; meshAnimated?: boolean; overlayBlend?: ThemeOverlayBlend; };
type ThemeAdaptiveBlock = { imageReactiveStrength?: number; timeOfDayStrength?: number; contrastGuard?: boolean; };
type ThemeMetaBlock = { themeSet?: string; pairedModeThemeId?: string; recommendationIds?: string[]; tags?: string[]; };
type ExtendedThemePalette = ThemePalette & { effects?: ThemeEffectsBlock; adaptive?: ThemeAdaptiveBlock; meta?: ThemeMetaBlock; };

const CATEGORY_OPTIONS = [
    { value: 'custom', label: 'Custom' },
    { value: 'game', label: 'Game-Inspired' },
    { value: 'color-scheme', label: 'Color Scheme' },
    { value: 'editor', label: 'Editor & IDE' },
    { value: 'app', label: 'App' },
    { value: 'aesthetic', label: 'Aesthetic' },
    { value: 'art', label: 'Art' },
    { value: 'film', label: 'Film' },
    { value: 'music', label: 'Music' },
    { value: 'nature', label: 'Nature' },
    { value: 'minimal', label: 'Minimal' },
] as const;

const CONTROL_MODE_OPTIONS = [{ value: 'default', label: 'Default' }, { value: 'filled', label: 'Filled' }, { value: 'outlined', label: 'Outlined' }];
const ICON_MODE_OPTIONS = [{ value: 'plain', label: 'Plain' }, { value: 'badge', label: 'Badge' }, { value: 'glyph-outline', label: 'Glyph Outline' }];
const CONTROL_SHAPE_OPTIONS = [{ value: 'rounded', label: 'Rounded' }, { value: 'pill', label: 'Pill' }, { value: 'square', label: 'Square' }];
const ICON_SHAPE_OPTIONS = [{ value: 'rounded', label: 'Rounded' }, { value: 'circle', label: 'Circle' }, { value: 'square', label: 'Square' }];
const BLEND_OPTIONS = [{ value: 'normal', label: 'Normal' }, { value: 'overlay', label: 'Overlay' }, { value: 'soft-light', label: 'Soft Light' }, { value: 'screen', label: 'Screen' }, { value: 'multiply', label: 'Multiply' }];

const csv = (value: string) => value.split(',').map((item) => item.trim()).filter(Boolean);
const joinCsv = (value?: string[]) => value?.join(', ') || '';
const downloadText = (name: string, text: string, type: string) => {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
};

function buildCss(theme: ExtendedThemePalette): string {
    const lines = ['/* theme export */', ':root {'];
    const vars: Array<[string, string | number | undefined]> = [
        ['--theme-brand', theme.colors.brand], ['--theme-accent', theme.colors.accent], ['--theme-gray-0', theme.colors.gray0], ['--theme-gray-1', theme.colors.gray1],
        ['--theme-gray-2', theme.colors.gray2], ['--theme-gray-3', theme.colors.gray3], ['--theme-gray-4', theme.colors.gray4], ['--theme-gray-5', theme.colors.gray5],
        ['--theme-gray-6', theme.colors.gray6], ['--theme-gray-7', theme.colors.gray7], ['--theme-gray-8', theme.colors.gray8], ['--theme-gray-9', theme.colors.gray9],
        ['--theme-success', theme.colors.success], ['--theme-warning', theme.colors.warning], ['--theme-error', theme.colors.error], ['--theme-font-family', theme.colors.fontFamily],
        ['--theme-font-heading', theme.colors.fontHeading], ['--theme-font-mono', theme.colors.fontMono], ['--theme-text-primary', theme.colors.textPrimary],
        ['--theme-text-secondary', theme.colors.textSecondary], ['--theme-overlay-color', theme.colors.overlayColor], ['--theme-surface-tint', theme.colors.surfaceTint],
        ['--theme-surface-tint-strength', theme.colors.surfaceTintStrength], ['--theme-panel-gradient', theme.colors.panelGradient], ['--theme-border-style', theme.colors.borderStyle],
        ['--theme-border-width', theme.colors.borderWidth], ['--theme-secondary-accent', theme.colors.secondaryAccent], ['--theme-tertiary-accent', theme.colors.tertiaryAccent],
        ['--theme-highlight-accent', theme.colors.highlightAccent],
    ];
    for (const [key, value] of vars) if (value !== undefined && value !== '') lines.push(`  ${key}: ${value};`);
    if (theme.effects) {
        if (theme.effects.noiseIntensity !== undefined) lines.push(`  --theme-effects-noise-intensity: ${theme.effects.noiseIntensity};`);
        if (theme.effects.scanlineIntensity !== undefined) lines.push(`  --theme-effects-scanline-intensity: ${theme.effects.scanlineIntensity};`);
        if (theme.effects.meshIntensity !== undefined) lines.push(`  --theme-effects-mesh-intensity: ${theme.effects.meshIntensity};`);
        if (theme.effects.meshAnimated !== undefined) lines.push(`  --theme-effects-mesh-animated: ${theme.effects.meshAnimated ? 1 : 0};`);
        if (theme.effects.overlayBlend) lines.push(`  --theme-effects-overlay-blend: ${theme.effects.overlayBlend};`);
    }
    if (theme.adaptive) {
        if (theme.adaptive.imageReactiveStrength !== undefined) lines.push(`  --theme-adaptive-image-reactive-strength: ${theme.adaptive.imageReactiveStrength};`);
        if (theme.adaptive.timeOfDayStrength !== undefined) lines.push(`  --theme-adaptive-time-of-day-strength: ${theme.adaptive.timeOfDayStrength};`);
        if (theme.adaptive.contrastGuard !== undefined) lines.push(`  --theme-adaptive-contrast-guard: ${theme.adaptive.contrastGuard ? 1 : 0};`);
    }
    if (theme.meta) {
        if (theme.meta.themeSet) lines.push(`  --theme-meta-theme-set: ${theme.meta.themeSet};`);
        if (theme.meta.pairedModeThemeId) lines.push(`  --theme-meta-paired-theme-id: ${theme.meta.pairedModeThemeId};`);
        if (theme.meta.recommendationIds?.length) lines.push(`  --theme-meta-recommendation-ids: ${theme.meta.recommendationIds.join(', ')};`);
        if (theme.meta.tags?.length) lines.push(`  --theme-meta-tags: ${theme.meta.tags.join(', ')};`);
    }
    lines.push('}');
    return `${lines.join('\n')}\n`;
}

export function ThemeBuilder({ opened, onClose, editThemeId }: ThemeBuilderProps) {
    const { customThemes, addCustomTheme, updateCustomTheme, getAllThemes } = useThemeStore();
    const existing = editThemeId ? (customThemes.find((theme) => theme.id === editThemeId) as ExtendedThemePalette | undefined) : undefined;
    const baseTheme = (getAllThemes().find((theme) => theme.id === (existing?.id || 'dracula')) || THEME_PALETTES[0]) as ExtendedThemePalette;
    const [themeName, setThemeName] = useState(existing?.name || '');
    const [category, setCategory] = useState<ThemeCategory>(existing?.category || 'custom');
    const [baseThemeId, setBaseThemeId] = useState(existing?.id || baseTheme.id);
    const [brand, setBrand] = useState(existing?.colors.brand || baseTheme.colors.brand);
    const [accent, setAccent] = useState(existing?.colors.accent || baseTheme.colors.accent);
    const [gray0, setGray0] = useState(existing?.colors.gray0 || baseTheme.colors.gray0);
    const [gray1, setGray1] = useState(existing?.colors.gray1 || baseTheme.colors.gray1);
    const [gray2, setGray2] = useState(existing?.colors.gray2 || baseTheme.colors.gray2);
    const [gray3, setGray3] = useState(existing?.colors.gray3 || baseTheme.colors.gray3);
    const [gray4, setGray4] = useState(existing?.colors.gray4 || baseTheme.colors.gray4);
    const [gray5, setGray5] = useState(existing?.colors.gray5 || baseTheme.colors.gray5);
    const [gray6, setGray6] = useState(existing?.colors.gray6 || baseTheme.colors.gray6);
    const [gray7, setGray7] = useState(existing?.colors.gray7 || baseTheme.colors.gray7);
    const [gray8, setGray8] = useState(existing?.colors.gray8 || baseTheme.colors.gray8);
    const [gray9, setGray9] = useState(existing?.colors.gray9 || baseTheme.colors.gray9);
    const [success, setSuccess] = useState(existing?.colors.success || baseTheme.colors.success);
    const [warning, setWarning] = useState(existing?.colors.warning || baseTheme.colors.warning);
    const [error, setError] = useState(existing?.colors.error || baseTheme.colors.error);
    const [textPrimary, setTextPrimary] = useState(existing?.colors.textPrimary || '');
    const [textSecondary, setTextSecondary] = useState(existing?.colors.textSecondary || '');
    const [overlayColor, setOverlayColor] = useState(existing?.colors.overlayColor || '');
    const [fontFamily, setFontFamily] = useState(existing?.colors.fontFamily || '');
    const [fontHeading, setFontHeading] = useState(existing?.colors.fontHeading || '');
    const [fontMono, setFontMono] = useState(existing?.colors.fontMono || '');
    const [styleSeed, setStyleSeed] = useState(resolveThemeStyle(existing || baseTheme));
    const [noiseIntensity, setNoiseIntensity] = useState<number | ''>(existing?.effects?.noiseIntensity ?? '');
    const [scanlineIntensity, setScanlineIntensity] = useState<number | ''>(existing?.effects?.scanlineIntensity ?? '');
    const [meshIntensity, setMeshIntensity] = useState<number | ''>(existing?.effects?.meshIntensity ?? '');
    const [meshAnimated, setMeshAnimated] = useState(existing?.effects?.meshAnimated ?? false);
    const [overlayBlend, setOverlayBlend] = useState(existing?.effects?.overlayBlend || 'normal');
    const [imageReactiveStrength, setImageReactiveStrength] = useState<number | ''>(existing?.adaptive?.imageReactiveStrength ?? '');
    const [timeOfDayStrength, setTimeOfDayStrength] = useState<number | ''>(existing?.adaptive?.timeOfDayStrength ?? '');
    const [contrastGuard, setContrastGuard] = useState(existing?.adaptive?.contrastGuard ?? true);
    const [themeSet, setThemeSet] = useState(existing?.meta?.themeSet || '');
    const [pairedModeThemeId, setPairedModeThemeId] = useState(existing?.meta?.pairedModeThemeId || '');
    const [recommendationIds, setRecommendationIds] = useState(joinCsv(existing?.meta?.recommendationIds));
    const [tags, setTags] = useState(joinCsv(existing?.meta?.tags));
    const themeOptions = useMemo(() => getAllThemes().map((theme) => ({ value: theme.id, label: `${theme.name} (${theme.id})` })), [getAllThemes]);

    const applyBaseTheme = (theme: ExtendedThemePalette) => {
        if (existing) return;
        setBrand(theme.colors.brand); setAccent(theme.colors.accent); setGray0(theme.colors.gray0); setGray1(theme.colors.gray1);
        setGray2(theme.colors.gray2); setGray3(theme.colors.gray3); setGray4(theme.colors.gray4); setGray5(theme.colors.gray5);
        setGray6(theme.colors.gray6); setGray7(theme.colors.gray7); setGray8(theme.colors.gray8); setGray9(theme.colors.gray9);
        setSuccess(theme.colors.success); setWarning(theme.colors.warning); setError(theme.colors.error); setTextPrimary(theme.colors.textPrimary || '');
        setTextSecondary(theme.colors.textSecondary || ''); setOverlayColor(theme.colors.overlayColor || ''); setFontFamily(theme.colors.fontFamily || '');
        setFontHeading(theme.colors.fontHeading || ''); setFontMono(theme.colors.fontMono || ''); setStyleSeed(resolveThemeStyle(theme));
        setNoiseIntensity(theme.effects?.noiseIntensity ?? ''); setScanlineIntensity(theme.effects?.scanlineIntensity ?? '');
        setMeshIntensity(theme.effects?.meshIntensity ?? ''); setMeshAnimated(theme.effects?.meshAnimated ?? false); setOverlayBlend(theme.effects?.overlayBlend || 'normal');
        setImageReactiveStrength(theme.adaptive?.imageReactiveStrength ?? ''); setTimeOfDayStrength(theme.adaptive?.timeOfDayStrength ?? '');
        setContrastGuard(theme.adaptive?.contrastGuard ?? true); setThemeSet(theme.meta?.themeSet || ''); setPairedModeThemeId(theme.meta?.pairedModeThemeId || '');
        setRecommendationIds(joinCsv(theme.meta?.recommendationIds)); setTags(joinCsv(theme.meta?.tags));
    };

    const makeTheme = useCallback((id: string): ExtendedThemePalette => {
        const effects: ThemeEffectsBlock = {};
        if (noiseIntensity !== '') effects.noiseIntensity = noiseIntensity;
        if (scanlineIntensity !== '') effects.scanlineIntensity = scanlineIntensity;
        if (meshIntensity !== '') effects.meshIntensity = meshIntensity;
        if (meshAnimated) effects.meshAnimated = true;
        if (overlayBlend && overlayBlend !== 'normal') effects.overlayBlend = overlayBlend as ThemeOverlayBlend;
        const adaptive: ThemeAdaptiveBlock = {};
        if (imageReactiveStrength !== '') adaptive.imageReactiveStrength = imageReactiveStrength;
        if (timeOfDayStrength !== '') adaptive.timeOfDayStrength = timeOfDayStrength;
        if (!contrastGuard) adaptive.contrastGuard = false;
        const meta: ThemeMetaBlock = {};
        if (themeSet.trim()) meta.themeSet = themeSet.trim();
        if (pairedModeThemeId.trim()) meta.pairedModeThemeId = pairedModeThemeId.trim();
        if (csv(recommendationIds).length) meta.recommendationIds = csv(recommendationIds);
        if (csv(tags).length) meta.tags = csv(tags);
        const colors: ExtendedThemePalette['colors'] = { brand, accent, gray0, gray1, gray2, gray3, gray4, gray5, gray6, gray7, gray8, gray9, success, warning, error };
        if (textPrimary) colors.textPrimary = textPrimary;
        if (textSecondary) colors.textSecondary = textSecondary;
        if (overlayColor) colors.overlayColor = overlayColor;
        if (fontFamily) colors.fontFamily = fontFamily;
        if (fontHeading) colors.fontHeading = fontHeading;
        if (fontMono) colors.fontMono = fontMono;
        return { id, name: themeName || 'Preview', category, style: styleSeed, colors, ...(Object.keys(effects).length ? { effects } : {}), ...(Object.keys(adaptive).length ? { adaptive } : {}), ...(Object.keys(meta).length ? { meta } : {}) };
    }, [accent, brand, category, contrastGuard, error, fontFamily, fontHeading, fontMono, gray0, gray1, gray2, gray3, gray4, gray5, gray6, gray7, gray8, gray9, imageReactiveStrength, meshAnimated, meshIntensity, noiseIntensity, overlayBlend, overlayColor, pairedModeThemeId, recommendationIds, scanlineIntensity, styleSeed, success, tags, textPrimary, textSecondary, themeName, themeSet, timeOfDayStrength, warning]);

    const previewTheme = useMemo(() => makeTheme(editThemeId || 'preview'), [editThemeId, makeTheme]);
    const handleBaseThemeChange = (value: string | null) => { if (!value) return; setBaseThemeId(value); const theme = getAllThemes().find((item) => item.id === value) as ExtendedThemePalette | undefined; if (theme) applyBaseTheme(theme); };
    const handleSave = () => {
        if (!themeName.trim()) return void notifications.show({ title: 'Validation Error', message: 'Please enter a theme name', color: 'red' });
        const id = editThemeId || `custom-${sanitizeThemeId(themeName)}-${Date.now()}`; const theme = makeTheme(id);
        if (editThemeId) { updateCustomTheme(editThemeId, theme as ThemePalette); notifications.show({ title: 'Theme Updated', message: `"${themeName}" has been updated`, color: 'green' }); }
        else { addCustomTheme(theme as ThemePalette); notifications.show({ title: 'Theme Created', message: `"${themeName}" has been saved`, color: 'green' }); }
        onClose();
    };
    const exportJson = () => { const text = JSON.stringify(makeTheme(editThemeId || `custom-${sanitizeThemeId(themeName || 'theme')}`), null, 2); navigator.clipboard.writeText(text); notifications.show({ title: 'Exported', message: 'Theme JSON copied to clipboard', color: 'blue', icon: <IconCopy size={16} /> }); };
    const downloadJson = () => { const id = editThemeId || `custom-${sanitizeThemeId(themeName || 'theme')}`; downloadText(`${sanitizeThemeId(themeName || 'theme') || 'theme'}.json`, JSON.stringify(makeTheme(id), null, 2), 'application/json'); notifications.show({ title: 'Downloaded', message: `${themeName || 'theme'}.json saved`, color: 'blue', icon: <IconDownload size={16} /> }); };
    const copyCss = () => { navigator.clipboard.writeText(buildCss(makeTheme(editThemeId || `custom-${sanitizeThemeId(themeName || 'theme')}`))); notifications.show({ title: 'Copied', message: 'Theme CSS copied to clipboard', color: 'blue', icon: <IconCopy size={16} /> }); };
    const downloadCss = () => { const id = editThemeId || `custom-${sanitizeThemeId(themeName || 'theme')}`; downloadText(`${sanitizeThemeId(themeName || 'theme') || 'theme'}.css`, buildCss(makeTheme(id)), 'text/css'); notifications.show({ title: 'Downloaded', message: `${themeName || 'theme'}.css saved`, color: 'blue', icon: <IconDownload size={16} /> }); };

    return (
        <Modal opened={opened} onClose={onClose} title={editThemeId ? 'Edit Custom Theme' : 'Create Custom Theme'} size="xl" styles={{ body: { maxHeight: '70vh', overflow: 'hidden' }, header: { borderBottom: '1px solid var(--theme-gray-5)' } }}>
            <Group align="flex-start" gap="md" style={{ height: '100%' }}>
                <Stack style={{ flex: '1 1 60%', minWidth: 0 }} gap="md">
                    <ScrollArea h="calc(70vh - 120px)" type="auto">
                        <Stack gap="md" pr="sm">
                            <TextInput label="Theme Name" placeholder="My Awesome Theme" value={themeName} onChange={(e) => setThemeName(e.currentTarget.value)} required />
                            <Select label="Category" data={CATEGORY_OPTIONS} value={category} onChange={(v) => setCategory((v as ThemeCategory) || 'custom')} />
                            {!editThemeId && <Select label="Base Theme" description="Start with colors from an existing theme" data={THEME_PALETTES.map((t) => ({ value: t.id, label: t.name }))} value={baseThemeId} onChange={handleBaseThemeChange} searchable />}
                            <Divider />
                            <Text size="sm" fw={600}>Control Personality</Text>
                            <Text size="xs" c="dimmed">Default control fills plus button and icon shapes.</Text>
                            <Select label="Control Mode" data={CONTROL_MODE_OPTIONS} value={styleSeed.controlMode} onChange={(v) => v && setStyleSeed((s) => ({ ...s, controlMode: v as ThemeControlMode }))} />
                            <Select label="Icon Mode" data={ICON_MODE_OPTIONS} value={styleSeed.iconMode} onChange={(v) => v && setStyleSeed((s) => ({ ...s, iconMode: v as ThemeIconMode }))} />
                            <Select label="Button Shape" data={CONTROL_SHAPE_OPTIONS} value={styleSeed.controlShape} onChange={(v) => v && setStyleSeed((s) => ({ ...s, controlShape: v as ThemeControlShape }))} />
                            <Select label="Icon Shape" data={ICON_SHAPE_OPTIONS} value={styleSeed.iconShape} onChange={(v) => v && setStyleSeed((s) => ({ ...s, iconShape: v as ThemeIconShape }))} />
                            <Divider />
                            <Text size="sm" fw={600}>Primary Colors</Text>
                            <ColorInput label="Brand Color" value={brand} onChange={setBrand} format="hex" swatches={['#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899']} />
                            <ColorInput label="Accent Color" value={accent} onChange={setAccent} format="hex" swatches={['#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899']} />
                            <Divider />
                            <Text size="sm" fw={600}>Grayscale Palette</Text>
                            <Group gap={2}>{[gray0, gray1, gray2, gray3, gray4, gray5, gray6, gray7, gray8, gray9].map((color, index) => <Box key={index} style={{ flex: 1, height: 24, backgroundColor: color, border: '1px solid var(--theme-gray-5)', borderRadius: index === 0 ? '4px 0 0 4px' : index === 9 ? '0 4px 4px 0' : 0 }} />)}</Group>
                            <Accordion variant="contained"><Accordion.Item value="grays"><Accordion.Control><Text size="xs">Edit Individual Grays</Text></Accordion.Control><Accordion.Panel><Stack gap="sm">{[['Gray 0', gray0, setGray0], ['Gray 1', gray1, setGray1], ['Gray 2', gray2, setGray2], ['Gray 3', gray3, setGray3], ['Gray 4', gray4, setGray4], ['Gray 5', gray5, setGray5], ['Gray 6', gray6, setGray6], ['Gray 7', gray7, setGray7], ['Gray 8', gray8, setGray8], ['Gray 9', gray9, setGray9]].map(([label, value, setter]) => <ColorInput key={label as string} label={label as string} value={value as string} onChange={setter as (value: string) => void} format="hex" size="xs" />)}</Stack></Accordion.Panel></Accordion.Item></Accordion>
                            <Divider />
                            <Text size="sm" fw={600}>Semantic Colors</Text>
                            <ColorInput label="Success" value={success} onChange={setSuccess} format="hex" />
                            <ColorInput label="Warning" value={warning} onChange={setWarning} format="hex" />
                            <ColorInput label="Error" value={error} onChange={setError} format="hex" />
                            <Divider />
                            <Text size="sm" fw={600}>Effects</Text>
                            <NumberInput label="Noise Intensity" value={noiseIntensity} min={0} max={1} step={0.05} decimalScale={2}onChange={(value) => setNoiseIntensity(typeof value === 'number' ? value : value === '' ? '' : Number(value))} />
                            <NumberInput label="Scanline Intensity" value={scanlineIntensity} min={0} max={1} step={0.05} decimalScale={2}onChange={(value) => setScanlineIntensity(typeof value === 'number' ? value : value === '' ? '' : Number(value))} />
                            <NumberInput label="Mesh Intensity" value={meshIntensity} min={0} max={1} step={0.05} decimalScale={2}onChange={(value) => setMeshIntensity(typeof value === 'number' ? value : value === '' ? '' : Number(value))} />
                            <Group justify="space-between"><Stack gap={2}><Text size="sm" fw={500}>Animate Mesh</Text><Text size="xs" c="dimmed">Enable motion for energetic themes.</Text></Stack><SwarmSwitch checked={meshAnimated} onChange={(e) => setMeshAnimated(e.currentTarget.checked)} /></Group>
                            <Select label="Overlay Blend Mode" data={BLEND_OPTIONS} value={overlayBlend} onChange={(v) => setOverlayBlend((v || 'normal') as ThemeOverlayBlend)} />
                            <Divider />
                            <Text size="sm" fw={600}>Adaptive</Text>
                            <NumberInput label="Image Reactive Strength" value={imageReactiveStrength} min={0} max={1} step={0.05} decimalScale={2}onChange={(value) => setImageReactiveStrength(typeof value === 'number' ? value : value === '' ? '' : Number(value))} />
                            <NumberInput label="Follow-Sun Strength" value={timeOfDayStrength} min={0} max={1} step={0.05} decimalScale={2}onChange={(value) => setTimeOfDayStrength(typeof value === 'number' ? value : value === '' ? '' : Number(value))} />
                            <Group justify="space-between"><Stack gap={2}><Text size="sm" fw={500}>Contrast Guard</Text><Text size="xs" c="dimmed">Bias derived accents toward WCAG-safe contrast.</Text></Stack><SwarmSwitch checked={contrastGuard} onChange={(e) => setContrastGuard(e.currentTarget.checked)} /></Group>
                            <Divider />
                            <Text size="sm" fw={600}>Metadata</Text>
                            <TextInput label="Theme Set" value={themeSet} onChange={(e) => setThemeSet(e.currentTarget.value)} placeholder="catppuccin, solarized, bauhaus" />
                            <Select label="Paired Theme ID" value={pairedModeThemeId} onChange={(v) => setPairedModeThemeId(v || '')} data={themeOptions} searchable clearable />
                            <Textarea label="Recommendation IDs" value={recommendationIds} onChange={(e) => setRecommendationIds(e.currentTarget.value)} minRows={2} autosize placeholder="dracula, nord, catppuccin-mocha" />
                            <Textarea label="Tags" value={tags} onChange={(e) => setTags(e.currentTarget.value)} minRows={2} autosize placeholder="cinematic, warm, minimal" />
                            <Divider />
                            <Accordion variant="contained"><Accordion.Item value="typography"><Accordion.Control><Text size="xs" fw={600}>Advanced Typography & Surface Tokens</Text></Accordion.Control><Accordion.Panel><Stack gap="sm"><ColorInput label="Primary Text Color" value={textPrimary} onChange={setTextPrimary} format="hex" size="xs" placeholder="Leave empty for default" /><ColorInput label="Secondary Text Color" value={textSecondary} onChange={setTextSecondary} format="hex" size="xs" placeholder="Leave empty for default" /><ColorInput label="Overlay/Backdrop Color" value={overlayColor} onChange={setOverlayColor} format="rgba" size="xs" placeholder="Leave empty for default" /><TextInput label="Custom Font Family" value={fontFamily} onChange={(e) => setFontFamily(e.currentTarget.value)} size="xs" placeholder='e.g. "Inter, system-ui, sans-serif"' /><TextInput label="Heading Font Family" value={fontHeading} onChange={(e) => setFontHeading(e.currentTarget.value)} size="xs" placeholder='e.g. "Sora, Inter, sans-serif"' /><TextInput label="Monospace Font Family" value={fontMono} onChange={(e) => setFontMono(e.currentTarget.value)} size="xs" placeholder='e.g. "JetBrains Mono, Consolas, monospace"' /></Stack></Accordion.Panel></Accordion.Item></Accordion>
                        </Stack>
                    </ScrollArea>
                    <Group justify="space-between" mt="md" style={{ borderTop: '1px solid var(--theme-gray-5)', paddingTop: 12 }}>
                        <Group gap="xs"><SwarmButton tone="secondary" emphasis="ghost" size="xs" leftSection={<IconCopy size={14} />} onClick={exportJson}>Copy JSON</SwarmButton><SwarmButton tone="secondary" emphasis="ghost" size="xs" leftSection={<IconDownload size={14} />} onClick={downloadJson}>Download JSON</SwarmButton><SwarmButton tone="secondary" emphasis="ghost" size="xs" leftSection={<IconCopy size={14} />} onClick={copyCss}>Copy CSS</SwarmButton><SwarmButton tone="secondary" emphasis="ghost" size="xs" leftSection={<IconDownload size={14} />} onClick={downloadCss}>Download CSS</SwarmButton></Group>
                        <Group gap="xs"><SwarmButton tone="secondary" emphasis="ghost" onClick={onClose} leftSection={<IconX size={14} />}>Cancel</SwarmButton><SwarmButton tone="primary" emphasis="solid" onClick={handleSave} leftSection={<IconDeviceFloppy size={14} />}>{editThemeId ? 'Update' : 'Save'} Theme</SwarmButton></Group>
                    </Group>
                </Stack>
                <Box style={{ flex: '0 0 220px' }}><Stack gap="xs"><Text size="xs" fw={600} c="dimmed">Live Preview</Text><ThemePreview theme={previewTheme} /><Text size="xs" c="dimmed" ta="center" className="theme-builder-preview-copy">Preview updates in real time as you edit colors, effects, adaptive values, metadata, and control shapes.</Text></Stack></Box>
            </Group>
        </Modal>
    );
}
