import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { Box, Collapse, ColorPicker, Group, Modal, ScrollArea, Select, Stack, Text, UnstyledButton } from '@mantine/core';
import { IconChevronDown, IconChevronUp, IconDeviceDesktop, IconMoon, IconPlus, IconSun, IconUpload } from '@tabler/icons-react';
import { useShallow } from 'zustand/react/shallow';
import { type ResolvedColorScheme, type ThemeControlShape, type ThemeIconShape, type ThemeMode, type ThemePalette, useThemeStore } from '../store/themeStore';
import { useAnimationStore, type EffectsIntensity, type MotionPreset } from '../store/animationStore';
import { ThemeCatalogBrowser } from './ThemeCatalogBrowser';
import { SwarmButton, SwarmSegmentedControl, SwarmSwitch } from './ui';

const ThemeBuilder = lazy(() => import('./ThemeBuilder').then((module) => ({ default: module.ThemeBuilder })));
const ThemeImporter = lazy(() => import('./ThemeImporter').then((module) => ({ default: module.ThemeImporter })));

interface AppearanceModalProps { opened: boolean; onClose: () => void; }
interface ExportThemeInput { light: ThemePalette; dark: ThemePalette; customAccent: string | null; }

const loadBoolean = (key: string, fallback: boolean) => {
    if (typeof window === 'undefined') return fallback;
    try {
        const stored = window.localStorage.getItem(key);
        return stored === null ? fallback : stored === 'true';
    }
    catch {
        return fallback;
    }
};
const saveBoolean = (key: string, value: boolean) => {
    if (typeof window === 'undefined') return;
    try {
        window.localStorage.setItem(key, value ? 'true' : 'false');
    }
    catch {
        return;
    }
};
const getLocalScheme = (): ResolvedColorScheme => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
        return 'light';
    }
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};
const buildThemeCss = ({ light, dark, customAccent }: ExportThemeInput) => {
    const block = (theme: ThemePalette) => {
        const vars: Array<[string, string | number | undefined]> = [
            ['--theme-brand', theme.colors.brand], ['--theme-accent', theme.colors.accent], ['--theme-gray-0', theme.colors.gray0], ['--theme-gray-1', theme.colors.gray1], ['--theme-gray-2', theme.colors.gray2],
            ['--theme-gray-3', theme.colors.gray3], ['--theme-gray-4', theme.colors.gray4], ['--theme-gray-5', theme.colors.gray5], ['--theme-gray-6', theme.colors.gray6], ['--theme-gray-7', theme.colors.gray7],
            ['--theme-gray-8', theme.colors.gray8], ['--theme-gray-9', theme.colors.gray9], ['--theme-success', theme.colors.success], ['--theme-warning', theme.colors.warning], ['--theme-error', theme.colors.error],
            ['--theme-font-family', theme.colors.fontFamily], ['--theme-font-heading', theme.colors.fontHeading], ['--theme-font-mono', theme.colors.fontMono],
            ['--theme-secondary-accent', theme.colors.secondaryAccent], ['--theme-tertiary-accent', theme.colors.tertiaryAccent], ['--theme-highlight-accent', theme.colors.highlightAccent],
            ['--theme-surface-tint', theme.colors.surfaceTint], ['--theme-surface-tint-strength', theme.colors.surfaceTintStrength], ['--theme-panel-gradient', theme.colors.panelGradient],
        ];
        const extendedTheme = theme as ThemePalette & {
        effects?: { noiseIntensity?: number; scanlineIntensity?: number; meshIntensity?: number; meshAnimated?: boolean; overlayBlend?: string; };
        atmosphere?: { background?: string; texture?: string; motion?: string; intensity?: number; };
        adaptive?: { imageReactiveStrength?: number; timeOfDayStrength?: number; contrastGuard?: boolean; };
        };
        if (extendedTheme.effects?.noiseIntensity !== undefined) vars.push(['--theme-effects-noise-intensity', extendedTheme.effects.noiseIntensity]);
        if (extendedTheme.effects?.scanlineIntensity !== undefined) vars.push(['--theme-effects-scanline-intensity', extendedTheme.effects.scanlineIntensity]);
        if (extendedTheme.effects?.meshIntensity !== undefined) vars.push(['--theme-effects-mesh-intensity', extendedTheme.effects.meshIntensity]);
        if (extendedTheme.effects?.meshAnimated !== undefined) vars.push(['--theme-effects-mesh-animated', extendedTheme.effects.meshAnimated ? 1 : 0]);
        if (extendedTheme.effects?.overlayBlend) vars.push(['--theme-effects-overlay-blend', extendedTheme.effects.overlayBlend]);
        if (extendedTheme.atmosphere?.background) vars.push(['--theme-atmosphere-background-mode', extendedTheme.atmosphere.background]);
        if (extendedTheme.atmosphere?.texture) vars.push(['--theme-atmosphere-texture-mode', extendedTheme.atmosphere.texture]);
        if (extendedTheme.atmosphere?.motion) vars.push(['--theme-atmosphere-motion-mode', extendedTheme.atmosphere.motion]);
        if (extendedTheme.atmosphere?.intensity !== undefined) vars.push(['--theme-atmosphere-intensity', extendedTheme.atmosphere.intensity]);
        if (extendedTheme.adaptive?.imageReactiveStrength !== undefined) vars.push(['--theme-adaptive-image-reactive-strength', extendedTheme.adaptive.imageReactiveStrength]);
        if (extendedTheme.adaptive?.timeOfDayStrength !== undefined) vars.push(['--theme-adaptive-time-of-day-strength', extendedTheme.adaptive.timeOfDayStrength]);
        if (extendedTheme.adaptive?.contrastGuard !== undefined) vars.push(['--theme-adaptive-contrast-guard', extendedTheme.adaptive.contrastGuard ? 1 : 0]);
        return vars.filter(([, value]) => value !== undefined && value !== '').map(([key, value]) => `  ${key}: ${value};`).join('\n');
    };
    return [
        '/* SwarmUI appearance export */',
        ':root {',
        block(light),
        customAccent ? `  --theme-custom-accent: ${customAccent};` : '',
        '}',
        '@media (prefers-color-scheme: dark) {',
        '  :root {',
        block(dark),
        '  }',
        '}',
        '',
    ].filter(Boolean).join('\n');
};
const downloadText = (name: string, text: string, type: string) => { const blob = new Blob([text], { type }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = name; a.click(); URL.revokeObjectURL(url); };
const localDateKey = () => { const date = new Date(); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; };
const pickIndex = (seed: string, length: number) => { let hash = 0; for (let i = 0; i < seed.length; i += 1) hash = ((hash << 5) - hash) + seed.charCodeAt(i); return Math.abs(hash) % Math.max(1, length); };

export function AppearanceModal({ opened, onClose }: AppearanceModalProps) {
    const { themeMode, lightThemeId, darkThemeId, customAccent, adaptiveImageAccentEnabled, followSunEnabled, controlShapeOverride, iconShapeOverride, visitedThemeIds, setThemeMode, setThemeForScheme, applyThemePair, getThemeOfDay, setCustomAccent, setAdaptiveImageAccentEnabled, setFollowSunEnabled, setControlShapeOverride, setIconShapeOverride, getAllThemes } = useThemeStore(useShallow((state) => ({
        themeMode: state.themeMode, lightThemeId: state.lightThemeId, darkThemeId: state.darkThemeId, customAccent: state.customAccent, controlShapeOverride: state.controlShapeOverride, iconShapeOverride: state.iconShapeOverride,
        adaptiveImageAccentEnabled: state.adaptiveImageAccentEnabled, followSunEnabled: state.followSunEnabled, visitedThemeIds: state.visitedThemeIds,
        setThemeMode: state.setThemeMode, setThemeForScheme: state.setThemeForScheme, applyThemePair: state.applyThemePair, getThemeOfDay: state.getThemeOfDay, setCustomAccent: state.setCustomAccent, setAdaptiveImageAccentEnabled: state.setAdaptiveImageAccentEnabled, setFollowSunEnabled: state.setFollowSunEnabled, setControlShapeOverride: state.setControlShapeOverride, setIconShapeOverride: state.setIconShapeOverride, getAllThemes: state.getAllThemes,
    })));
    const { reducedMotion, motionPreset, effectsIntensity, setReducedMotion, setMotionPreset, setEffectsIntensity } = useAnimationStore(useShallow((state) => ({
        reducedMotion: state.reducedMotion, motionPreset: state.motionPreset, effectsIntensity: state.effectsIntensity, setReducedMotion: state.setReducedMotion, setMotionPreset: state.setMotionPreset, setEffectsIntensity: state.setEffectsIntensity,
    })));

    const [advancedOpen, setAdvancedOpen] = useState(false);
    const [builderOpen, setBuilderOpen] = useState(false);
    const [importerOpen, setImporterOpen] = useState(false);
    const [pairApplyEnabled, setPairApplyEnabled] = useState(loadBoolean('swarmui.appearance.pairApply', true));
    const [biasUnvisited, setBiasUnvisited] = useState(loadBoolean('swarmui.appearance.biasUnvisited', true));
    const [systemScheme, setSystemScheme] = useState<ResolvedColorScheme>(getLocalScheme());
    const [catalogScheme, setCatalogScheme] = useState<ResolvedColorScheme>(getLocalScheme());

    const allThemes = useMemo(() => getAllThemes(), [getAllThemes]);
    const lightTheme = allThemes.find((theme) => theme.id === lightThemeId) || allThemes[0];
    const darkTheme = allThemes.find((theme) => theme.id === darkThemeId) || allThemes[0];
    const activeScheme = themeMode === 'system' ? systemScheme : themeMode;
    const activeTheme = activeScheme === 'light' ? lightTheme : darkTheme;

    useEffect(() => { saveBoolean('swarmui.appearance.pairApply', pairApplyEnabled); }, [pairApplyEnabled]);
    useEffect(() => { saveBoolean('swarmui.appearance.biasUnvisited', biasUnvisited); }, [biasUnvisited]);
    useEffect(() => {
        if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
        const media = window.matchMedia('(prefers-color-scheme: dark)');
        const update = () => setSystemScheme(media.matches ? 'dark' : 'light');
        update();
        if (typeof media.addEventListener === 'function') {
            media.addEventListener('change', update);
            return () => media.removeEventListener('change', update);
        }
        if (typeof media.addListener === 'function') {
            media.addListener(update);
            return () => media.removeListener(update);
        }
        return;
    }, []);

    const setSchemeTheme = useCallback((scheme: ResolvedColorScheme, themeId: string) => {
        if (pairApplyEnabled) {
            applyThemePair(themeId, scheme);
        }
        else {
            setThemeForScheme(scheme, themeId);
        }
    }, [applyThemePair, pairApplyEnabled, setThemeForScheme]);

    const selectTheme = useCallback((themeId: string) => setSchemeTheme(activeScheme, themeId), [activeScheme, setSchemeTheme]);
    const catalogThemeId = catalogScheme === 'light' ? lightThemeId : darkThemeId;

    const pickTheme = useCallback((preferUnvisited: boolean) => {
        const visited = new Set(visitedThemeIds);
        const candidates = allThemes.filter((theme) => theme.id !== activeTheme.id && (!preferUnvisited || !visited.has(theme.id)));
        const pool = candidates.length ? candidates : allThemes.filter((theme) => theme.id !== activeTheme.id);
        return pool[pickIndex(localDateKey() + activeScheme + String(preferUnvisited), pool.length)] || activeTheme;
    }, [activeScheme, activeTheme, allThemes, visitedThemeIds]);
    const surpriseMe = () => selectTheme(pickTheme(biasUnvisited).id);
    const themeOfTheDay = () => selectTheme(getThemeOfDay().id);
    const exportCss = () => downloadText(`appearance-${activeScheme}.css`, buildThemeCss({ light: lightTheme, dark: darkTheme, customAccent }), 'text/css');

    const currentAccent = customAccent || activeTheme.colors.brand;

    return (
        <>
            <Modal opened={opened} onClose={onClose} title="Appearance" size={1120} centered scrollAreaComponent={ScrollArea.Autosize} className="appearance-modal" styles={{ body: { padding: '16px 20px 20px' }, header: { borderBottom: '1px solid var(--theme-gray-5)' }, title: { fontWeight: 700 } }} aria-label="Appearance settings">
                <Stack gap="lg">
                    <Stack gap={6}>
                        <Text size="xs" fw={700} tt="uppercase" c="dimmed">Mode</Text>
                        <SwarmSegmentedControl fullWidth value={themeMode} onChange={(value) => setThemeMode(value as ThemeMode)} data={[
                            { value: 'light', label: <Group gap={6} justify="center" wrap="nowrap"><IconSun size={14} /><span>Light</span></Group> },
                            { value: 'dark', label: <Group gap={6} justify="center" wrap="nowrap"><IconMoon size={14} /><span>Dark</span></Group> },
                            { value: 'system', label: <Group gap={6} justify="center" wrap="nowrap"><IconDeviceDesktop size={14} /><span>System</span></Group> },
                        ]} aria-label="Color scheme mode" />
                    </Stack>

                    <Stack gap={8}>
                        <Group justify="space-between" align="flex-end" wrap="wrap">
                            <Stack gap={2}>
                                <Text size="xs" fw={700} tt="uppercase" c="dimmed">Theme library</Text>
                                <Text size="xs" c="dimmed">Browse, preview, and apply themes directly from the modern catalog.</Text>
                            </Stack>
                            <Box className="appearance-scheme-target">
                                <SwarmSegmentedControl
                                    value={catalogScheme}
                                    onChange={(value) => setCatalogScheme(value as ResolvedColorScheme)}
                                    data={[
                                        { value: 'light', label: <Group gap={6} justify="center" wrap="nowrap"><IconSun size={14} /><span>Light slot</span></Group> },
                                        { value: 'dark', label: <Group gap={6} justify="center" wrap="nowrap"><IconMoon size={14} /><span>Dark slot</span></Group> },
                                    ]}
                                    aria-label="Theme slot to edit"
                                />
                            </Box>
                        </Group>
                        <Group gap="xs" wrap="wrap">
                            <Text size="xs" c="dimmed">Current:</Text>
                            <SwarmButton size="xs" tone={catalogScheme === 'light' ? 'brand' : 'secondary'} emphasis="ghost" onClick={() => setCatalogScheme('light')}>
                                Light: {lightTheme.name}
                            </SwarmButton>
                            <SwarmButton size="xs" tone={catalogScheme === 'dark' ? 'brand' : 'secondary'} emphasis="ghost" onClick={() => setCatalogScheme('dark')}>
                                Dark: {darkTheme.name}
                            </SwarmButton>
                        </Group>
                        <Box className="appearance-theme-library">
                            <ThemeCatalogBrowser
                                targetScheme={catalogScheme}
                                selectedThemeId={catalogThemeId}
                                onOpenImporter={() => setImporterOpen(true)}
                                onOpenBuilder={() => setBuilderOpen(true)}
                                onSelected={() => undefined}
                            />
                        </Box>
                    </Stack>

                    <Stack gap={8}>
                        <Text size="xs" fw={700} tt="uppercase" c="dimmed">Motion & Display</Text>
                        <Group justify="space-between" align="center"><Stack gap={2}><Text size="sm" fw={600}>Reduced motion</Text><Text size="xs" c="dimmed">Disable ambient animations and large transitions.</Text></Stack><SwarmSwitch size="md" checked={reducedMotion} onChange={(e) => setReducedMotion(e.currentTarget.checked)} /></Group>
                        <Stack gap={4}><Text size="xs" c="dimmed">Motion preset</Text><SwarmSegmentedControl fullWidth value={motionPreset} onChange={(v) => setMotionPreset(v as MotionPreset)} data={[{ value: 'minimal', label: 'Minimal' }, { value: 'calm', label: 'Calm' }, { value: 'studio', label: 'Studio' }, { value: 'expressive', label: 'Expressive' }]} disabled={reducedMotion} aria-label="Motion preset" /></Stack>
                        <Stack gap={4}><Text size="xs" c="dimmed">Effects intensity</Text><SwarmSegmentedControl fullWidth value={effectsIntensity} onChange={(v) => setEffectsIntensity(v as EffectsIntensity)} data={[{ value: 'off', label: 'Off' }, { value: 'soft', label: 'Soft' }, { value: 'full', label: 'Full' }]} disabled={reducedMotion} aria-label="Effects intensity" /></Stack>
                    </Stack>

                    <Stack gap={6}>
                        <UnstyledButton onClick={() => setAdvancedOpen((open) => !open)} aria-expanded={advancedOpen} aria-controls="appearance-advanced-panel" className="appearance-advanced-toggle" style={{ minHeight: 32, padding: '6px 4px', display: 'block', width: '100%' }}>
                            <Group justify="space-between" align="center" wrap="nowrap"><Text size="xs" fw={700} tt="uppercase" c="dimmed">Advanced customization</Text>{advancedOpen ? <IconChevronUp size={16} /> : <IconChevronDown size={16} />}</Group>
                        </UnstyledButton>
                        <Collapse expanded={advancedOpen}>
                            <Stack gap="md" id="appearance-advanced-panel">
                                <Stack gap={6}>
                                    <Text size="sm" fw={600}>Discovery</Text>
                                    <Text size="xs" c="dimmed">Bias random picks, apply paired themes, and jump to a deterministic theme of the day.</Text>
                                    <Group gap="xs">
                                        <SwarmButton size="sm" tone="primary" emphasis="soft" onClick={surpriseMe}>Surprise Me</SwarmButton>
                                        <SwarmButton size="sm" tone="secondary" emphasis="soft" onClick={themeOfTheDay}>Theme of the Day</SwarmButton>
                                    </Group>
                                    <Group justify="space-between">
                                        <Stack gap={2}><Text size="sm" fw={500}>Apply paired theme automatically</Text><Text size="xs" c="dimmed">Use explicit pair metadata when present.</Text></Stack>
                                        <SwarmSwitch checked={pairApplyEnabled} onChange={(e) => setPairApplyEnabled(e.currentTarget.checked)} />
                                    </Group>
                                    <Group justify="space-between">
                                        <Stack gap={2}><Text size="sm" fw={500}>Prefer unvisited themes</Text><Text size="xs" c="dimmed">Random picks favor themes you have not used in this session.</Text></Stack>
                                        <SwarmSwitch checked={biasUnvisited} onChange={(e) => setBiasUnvisited(e.currentTarget.checked)} />
                                    </Group>
                                </Stack>

                                <Stack gap={6}>
                                    <Text size="sm" fw={600}>Adaptive</Text>
                                    <Text size="xs" c="dimmed">Use generated imagery and local time to steer the custom accent while keeping contrast safe.</Text>
                                    <Group justify="space-between"><Stack gap={2}><Text size="sm" fw={500}>Image-reactive accent</Text><Text size="xs" c="dimmed">Samples the latest generated or selected image and blends it back through the active theme.</Text></Stack><SwarmSwitch checked={adaptiveImageAccentEnabled} onChange={(e) => setAdaptiveImageAccentEnabled(e.currentTarget.checked)} /></Group>
                                    <Group justify="space-between"><Stack gap={2}><Text size="sm" fw={500}>Follow-sun shifts</Text><Text size="xs" c="dimmed">Offsets derived accent and surface tints using your local browser time.</Text></Stack><SwarmSwitch checked={followSunEnabled} onChange={(e) => setFollowSunEnabled(e.currentTarget.checked)} /></Group>
                                    <Group justify="space-between"><Stack gap={2}><Text size="sm" fw={500}>Export CSS</Text><Text size="xs" c="dimmed">Download the current light/dark theme variables as CSS.</Text></Stack><SwarmButton size="sm" tone="secondary" emphasis="ghost" onClick={exportCss}>Download CSS</SwarmButton></Group>
                                </Stack>

                                <Stack gap={6}>
                                    <Text size="sm" fw={600}>Custom accent</Text>
                                    <Text size="xs" c="dimmed">Override the active theme's brand color.</Text>
                                    <ColorPicker size="sm" value={currentAccent} onChange={setCustomAccent} swatches={[lightTheme.colors.brand, darkTheme.colors.brand, '#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6']} aria-label="Custom accent color" />
                                    {customAccent && <SwarmButton size="xs" tone="secondary" emphasis="ghost" onClick={() => setCustomAccent(null)} aria-label="Reset accent color to theme default">Reset to theme default</SwarmButton>}
                                </Stack>

                                <Stack gap={6}>
                                    <Text size="sm" fw={600}>Button shape</Text>
                                    <Select value={controlShapeOverride || 'theme'} onChange={(value) => { if (value === 'theme') setControlShapeOverride(null); else if (value) setControlShapeOverride(value as ThemeControlShape); }} data={[{ value: 'theme', label: 'Theme' }, { value: 'rounded', label: 'Round' }, { value: 'pill', label: 'Pill' }, { value: 'square', label: 'Square' }, { value: 'chamfer', label: 'Chamfer' }, { value: 'slant', label: 'Slant' }, { value: 'bracket', label: 'Bracket' }]} aria-label="Button shape override" />
                                </Stack>
                                <Stack gap={6}>
                                    <Text size="sm" fw={600}>Icon shape</Text>
                                    <Select value={iconShapeOverride || 'theme'} onChange={(value) => { if (value === 'theme') setIconShapeOverride(null); else if (value) setIconShapeOverride(value as ThemeIconShape); }} data={[{ value: 'theme', label: 'Theme' }, { value: 'rounded', label: 'Round' }, { value: 'circle', label: 'Circle' }, { value: 'square', label: 'Square' }, { value: 'diamond', label: 'Diamond' }, { value: 'bracket', label: 'Bracket' }, { value: 'dot-square', label: 'Dot Square' }]} aria-label="Icon shape override" />
                                </Stack>

                                <Group gap="xs">
                                    <SwarmButton size="sm" tone="secondary" emphasis="outline" leftSection={<IconUpload size={14} />} onClick={() => setImporterOpen(true)}>Import JSON</SwarmButton>
                                    <SwarmButton size="sm" tone="primary" emphasis="soft" leftSection={<IconPlus size={14} />} onClick={() => setBuilderOpen(true)}>Create custom theme</SwarmButton>
                                </Group>
                            </Stack>
                        </Collapse>
                    </Stack>
                </Stack>
            </Modal>

            {builderOpen && <Suspense fallback={null}><ThemeBuilder opened={builderOpen} onClose={() => setBuilderOpen(false)} /></Suspense>}
            {importerOpen && <Suspense fallback={null}><ThemeImporter opened={importerOpen} onClose={() => setImporterOpen(false)} /></Suspense>}
        </>
    );
}
