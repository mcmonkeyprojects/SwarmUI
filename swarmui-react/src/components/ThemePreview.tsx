// ThemePreview Component - Compact visual QA card for theme selection
import { Box, Group, Stack, Text } from '@mantine/core';
import {
    getThemePersonalityLabel,
    resolveThemeAtmosphere,
    resolveThemeStyle,
    type ThemeAtmosphereBackground,
    type ThemeAtmosphereMotion,
    type ThemeAtmosphereTexture,
    type ThemePalette,
    type ThemeStyleFamily,
    type ThemeStyleMotif,
    type ThemeControlMode,
    type ThemeDecalStyle,
    type ThemeShapeOverrides,
    type ThemeSurfaceMode,
} from '../store/themeStore';
import { ThemePreviewFrame } from './ThemePreviewFrame';

function getContrastTextColor(hexColor: string): string {
    const hex = hexColor.replace('#', '');
    const fullHex = hex.length === 3
        ? hex.split('').map((c) => c + c).join('')
        : hex;

    const r = parseInt(fullHex.substr(0, 2), 16);
    const g = parseInt(fullHex.substr(2, 2), 16);
    const b = parseInt(fullHex.substr(4, 2), 16);
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance > 0.5 ? '#000000' : '#ffffff';
}

interface ThemePreviewProps {
    theme: ThemePalette;
    styleOverride?: ThemeShapeOverrides;
}

const FAMILY_LABELS: Record<ThemeStyleFamily, string> = {
    classic: 'Classic',
    material: 'Material',
    glyph: 'Glyph',
};

const MOTIF_LABELS: Record<Exclude<ThemeStyleMotif, 'none'>, string> = {
    'dot-grid': 'Dot Grid',
    'glyph-field': 'Glyph Field',
    circuit: 'Circuit',
    'hud-corners': 'HUD Corners',
    'dot-matrix': 'Dot Matrix',
};

const DECAL_LABELS: Record<Exclude<ThemeDecalStyle, 'none'>, string> = {
    'corner-cuts': 'Corner Cuts',
    'scan-strips': 'Scan Strips',
    circuit: 'Circuit',
    hud: 'HUD',
};

const SURFACE_LABELS: Record<ThemeSurfaceMode, string> = {
    gradient: 'Gradient',
    tonal: 'Tonal',
    ornamented: 'Ornamented',
};

const CONTROL_LABELS: Record<ThemeControlMode, string> = {
    default: 'Default Controls',
    filled: 'Filled Controls',
    outlined: 'Outlined Controls',
};

const ATMOSPHERE_BACKGROUND_LABELS: Record<ThemeAtmosphereBackground, string> = {
    mesh: 'Mesh',
    aurora: 'Aurora',
    spotlight: 'Spotlight',
    strata: 'Strata',
    grid: 'Grid',
    mist: 'Mist',
    none: 'None',
};

const ATMOSPHERE_TEXTURE_LABELS: Record<ThemeAtmosphereTexture, string> = {
    none: 'Clean',
    grain: 'Grain',
    paper: 'Paper',
    film: 'Film',
    terminal: 'Terminal',
};

const ATMOSPHERE_MOTION_LABELS: Record<ThemeAtmosphereMotion, string> = {
    still: 'Still',
    drift: 'Drift',
    pulse: 'Pulse',
    scan: 'Scan',
};

export function ThemePreview({ theme, styleOverride }: ThemePreviewProps) {
    const { colors } = theme;
    const style = resolveThemeStyle(theme, styleOverride);
    const atmosphere = resolveThemeAtmosphere(theme);
    const personalityLabel = getThemePersonalityLabel(theme);
    const accent2 = colors.secondaryAccent || `color-mix(in srgb, ${colors.accent} 66%, ${colors.brand})`;
    const accent3 = colors.tertiaryAccent || `color-mix(in srgb, ${colors.success} 58%, ${colors.accent})`;
    const mutedText = colors.mutedText || colors.gray3;
    const previewHeadingFont = colors.fontHeading || colors.fontFamily;
    const previewBodyFont = colors.fontFamily;
    const previewMonoFont = colors.fontMono;
    const surfaceBackground = `color-mix(in srgb, ${colors.gray8} 86%, ${colors.gray9})`;
    const primaryButton = `linear-gradient(135deg, ${colors.brand}, color-mix(in srgb, ${colors.brand} 72%, ${colors.accent}))`;
    const secondaryButton = `linear-gradient(135deg, ${accent2}, ${accent3})`;
    const panelRadius = style.family === 'material' ? 9 : style.family === 'glyph' ? 4 : 6;
    const controlRadius = style.controlShape === 'pill' ? 999 : style.controlShape === 'square' ? 4 : ['chamfer', 'bracket', 'slant'].includes(style.controlShape) ? 2 : 8;
    const controlClipPath = style.controlShape === 'chamfer'
        ? 'polygon(8px 0, 100% 0, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0 100%, 0 8px)'
        : style.controlShape === 'slant'
            ? 'polygon(10px 0, 100% 0, calc(100% - 10px) 100%, 0 100%)'
            : style.controlShape === 'bracket'
                ? 'polygon(6px 0, calc(100% - 6px) 0, 100% 6px, 100% calc(100% - 6px), calc(100% - 6px) 100%, 6px 100%, 0 calc(100% - 6px), 0 6px)'
                : undefined;
    const iconRadius = style.iconShape === 'circle' ? 999 : style.iconShape === 'square' ? 3 : ['diamond', 'bracket', 'dot-square'].includes(style.iconShape) ? 2 : 6;
    const iconClipPath = style.iconShape === 'diamond'
        ? 'polygon(50% 0, 100% 50%, 50% 100%, 0 50%)'
        : style.iconShape === 'bracket'
            ? 'polygon(5px 0, calc(100% - 5px) 0, 100% 5px, 100% calc(100% - 5px), calc(100% - 5px) 100%, 5px 100%, 0 calc(100% - 5px), 0 5px)'
            : style.iconShape === 'dot-square'
                ? 'polygon(3px 0, calc(100% - 3px) 0, 100% 3px, 100% calc(100% - 3px), calc(100% - 3px) 100%, 3px 100%, 0 calc(100% - 3px), 0 3px)'
                : undefined;
    const styleBadgeBg = style.family === 'glyph'
        ? `color-mix(in srgb, ${colors.accent} 16%, transparent)`
        : `color-mix(in srgb, ${colors.gray8} 78%, transparent)`;
    const styleBorder = style.family === 'glyph'
        ? `1px solid color-mix(in srgb, ${accent2} 28%, transparent)`
        : `1px solid ${colors.gray5}`;
    const motifLabel = style.motif === 'none' ? null : MOTIF_LABELS[style.motif];
    const decalLabel = style.decal === 'none' ? null : DECAL_LABELS[style.decal];
    const scanStripOverlay = `repeating-linear-gradient(110deg, color-mix(in srgb, ${colors.gray0} 18%, transparent) 0 6px, transparent 6px 11px)`;
    const railOverlay = `linear-gradient(90deg, transparent, color-mix(in srgb, ${colors.accent} 72%, transparent), color-mix(in srgb, ${colors.brand} 56%, transparent), transparent)`;
    const componentFrameOverlay = style.decal === 'hud' || style.decal === 'corner-cuts'
        ? `linear-gradient(90deg, ${accent2} 0 12px, transparent 12px calc(100% - 12px), ${colors.brand} calc(100% - 12px)) top / 100% 1px no-repeat, linear-gradient(180deg, ${accent2} 0 12px, transparent 12px calc(100% - 12px), ${colors.brand} calc(100% - 12px)) left / 1px 100% no-repeat`
        : style.decal === 'scan-strips'
            ? `${scanStripOverlay} 100% 0 / 52px 3px no-repeat`
            : style.decal === 'circuit'
                ? `linear-gradient(90deg, transparent 0 12px, ${accent2} 12px 13px, transparent 13px 100%) 0 4px / 34px 18px`
                : 'none';
    const previewBadges = [personalityLabel, FAMILY_LABELS[style.family], SURFACE_LABELS[style.surfaceMode], ATMOSPHERE_BACKGROUND_LABELS[atmosphere.background], motifLabel, decalLabel].filter(
        (label): label is string => Boolean(label)
    );

    return (
        <ThemePreviewFrame theme={theme}>
            <Stack gap={8} style={{ height: '100%' }}>
                <Group justify="space-between" align="center" wrap="nowrap">
                    <Text
                        size="9px"
                        fw={700}
                        tt="uppercase"
                        style={{
                            letterSpacing: '0.08em',
                            color: colors.gray0,
                            maxWidth: 122,
                            lineHeight: 1.2,
                            ...(previewHeadingFont ? { fontFamily: previewHeadingFont } : {}),
                        }}
                    >
                        {theme.name}
                    </Text>
                    <Group gap={4} wrap="wrap" justify="flex-end">
                        {previewBadges.map((label) => (
                            <Box
                                key={label}
                                style={{
                                    borderRadius: style.family === 'glyph' ? 4 : 999,
                                    padding: '2px 6px',
                                    border: styleBorder,
                                    background: styleBadgeBg,
                                }}
                            >
                                <Text
                                    size="7px"
                                    fw={600}
                                    style={{
                                        color: mutedText,
                                        letterSpacing: '0.07em',
                                        ...(previewBodyFont ? { fontFamily: previewBodyFont } : {}),
                                    }}
                                >
                                    {label}
                                </Text>
                            </Box>
                        ))}
                    </Group>
                </Group>

                <Box
                    style={{
                        borderRadius: panelRadius,
                        border: `1px solid ${colors.gray5}`,
                        background: surfaceBackground,
                        padding: 6,
                    }}
                >
                    <Stack gap={5}>
                        <Group gap={4} wrap="nowrap" align="center">
                            <Group gap={3} wrap="nowrap">
                                <Box
                                    style={{
                                        width: 6,
                                        height: 6,
                                        borderRadius: '50%',
                                        background: colors.error,
                                    }}
                                />
                                <Box
                                    style={{
                                        width: 6,
                                        height: 6,
                                        borderRadius: '50%',
                                        background: colors.warning,
                                    }}
                                />
                                <Box
                                    style={{
                                        width: 6,
                                        height: 6,
                                        borderRadius: '50%',
                                        background: colors.success,
                                    }}
                                />
                            </Group>
                            <Box
                                style={{
                                    flex: 1,
                                    height: 6,
                                    borderRadius: 999,
                                    background: `color-mix(in srgb, ${colors.gray7} 85%, ${colors.gray8})`,
                                    border: `1px solid color-mix(in srgb, ${colors.gray0} 10%, transparent)`,
                                }}
                            />
                        </Group>

                        <Group gap={5} wrap="nowrap" align="stretch">
                            <Stack
                                gap={3}
                                style={{
                                    width: '34%',
                                    minWidth: 40,
                                }}
                            >
                                <Box
                                    style={{
                                        height: 9,
                                        borderRadius: controlRadius,
                                        clipPath: controlClipPath,
                                        background: `color-mix(in srgb, ${colors.brand} 30%, ${colors.gray7})`,
                                        border: `1px solid color-mix(in srgb, ${colors.brand} 42%, transparent)`,
                                    }}
                                />
                                <Box
                                    style={{
                                        height: 7,
                                        borderRadius: 3,
                                        background: `color-mix(in srgb, ${colors.gray7} 88%, transparent)`,
                                    }}
                                />
                                <Box
                                    style={{
                                        height: 7,
                                        borderRadius: 3,
                                        background: `color-mix(in srgb, ${colors.gray7} 84%, transparent)`,
                                    }}
                                />
                                <Box
                                    style={{
                                        height: 7,
                                        borderRadius: 3,
                                        background: `color-mix(in srgb, ${colors.gray7} 80%, transparent)`,
                                    }}
                                />
                            </Stack>

                            <Stack gap={4} style={{ flex: 1 }}>
                                <Stack gap={2}>
                                    <Text
                                        size="9px"
                                        fw={700}
                                        style={{
                                            color: colors.gray0,
                                            lineHeight: 1.1,
                                            ...(previewHeadingFont ? { fontFamily: previewHeadingFont } : {}),
                                        }}
                                    >
                                        Theme identity
                                    </Text>
                                    <Text
                                        size="7px"
                                        style={{
                                            color: colors.gray2,
                                            lineHeight: 1.25,
                                            ...(previewBodyFont ? { fontFamily: previewBodyFont } : {}),
                                        }}
                                    >
                                        Surface, typography, and controls shift together.
                                    </Text>
                                </Stack>

                                <Group gap={4} wrap="nowrap">
                                    <Box
                                    style={{
                                        flex: 1,
                                        borderRadius: controlRadius,
                                        clipPath: controlClipPath,
                                        padding: '2px 6px',
                                        background: primaryButton,
                                        border: style.controlMode === 'outlined'
                                            ? `1px solid color-mix(in srgb, ${colors.gray0} 18%, transparent)`
                                            : undefined,
                                    }}
                                >
                                    <Text size="7px" fw={700} ta="center" style={{ color: getContrastTextColor(colors.brand) }}>
                                        Generate
                                        </Text>
                                    </Box>
                                    <Box
                                    style={{
                                        flex: 1,
                                        borderRadius: controlRadius,
                                        clipPath: controlClipPath,
                                        padding: '2px 6px',
                                        background: secondaryButton,
                                        border: `1px solid color-mix(in srgb, ${colors.gray0} 18%, transparent)`,
                                        }}
                                    >
                                        <Text size="7px" fw={700} ta="center" style={{ color: getContrastTextColor(colors.accent) }}>
                                            Queue
                                        </Text>
                                    </Box>
                                </Group>

                                <Group gap={3} wrap="nowrap">
                                    {[colors.success, colors.warning, colors.error].map((color, idx) => (
                                        <Box
                                            key={`${color}-${idx}`}
                                            style={{
                                                width: 12,
                                                height: 12,
                                                borderRadius: iconRadius,
                                                clipPath: iconClipPath,
                                                background: color,
                                                border: `1px solid color-mix(in srgb, ${colors.gray0} 10%, transparent)`,
                                            }}
                                        />
                                    ))}
                                    <Box
                                        style={{
                                            flex: 1,
                                            height: 8,
                                            borderRadius: style.family === 'glyph' ? 3 : 999,
                                            background: `linear-gradient(90deg, ${colors.brand}, ${accent2}, ${accent3})`,
                                            border: `1px solid color-mix(in srgb, ${colors.gray0} 14%, transparent)`,
                                        }}
                                    />
                                </Group>
                                <Box
                                    style={{
                                        marginTop: 1,
                                        height: 10,
                                        borderRadius: panelRadius - 2,
                                        border: `1px solid color-mix(in srgb, ${colors.gray0} 12%, transparent)`,
                                        background: `color-mix(in srgb, ${colors.gray8} 82%, transparent)`,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                    }}
                                >
                                    <Text
                                        size="6px"
                                        fw={600}
                                        style={{
                                            color: colors.gray2,
                                            letterSpacing: '0.06em',
                                            ...(previewMonoFont ? { fontFamily: previewMonoFont } : {}),
                                        }}
                                    >
                                        {previewMonoFont ? 'MONO TOKENS // 128-ALPHA' : 'CONTROL TOKENS // 128-ALPHA'}
                                    </Text>
                                </Box>
                            </Stack>
                        </Group>
                    </Stack>
                </Box>

                <Box
                    style={{
                        borderRadius: panelRadius,
                        border: `1px solid color-mix(in srgb, ${colors.gray0} 12%, transparent)`,
                        background: `color-mix(in srgb, ${colors.gray8} 80%, transparent)`,
                        padding: 5,
                    }}
                >
                    <Group gap={4} wrap="nowrap" align="center">
                        <Box
                            style={{
                                width: 42,
                                height: 14,
                                borderRadius: controlRadius,
                                clipPath: controlClipPath,
                                background: primaryButton,
                                boxShadow: `0 0 10px color-mix(in srgb, ${colors.brand} 24%, transparent)`,
                            }}
                        />
                        <Box
                            style={{
                                width: 16,
                                height: 16,
                                borderRadius: iconRadius,
                                clipPath: iconClipPath,
                                background: style.iconShape === 'dot-square'
                                    ? `radial-gradient(circle at 2px 2px, ${accent2} 0.72px, transparent 1px) 0 0 / 5px 5px, color-mix(in srgb, ${colors.gray7} 82%, transparent)`
                                    : secondaryButton,
                                border: `1px solid color-mix(in srgb, ${accent2} 42%, transparent)`,
                            }}
                        />
                        <Box
                            style={{
                                width: 34,
                                height: 12,
                                borderRadius: style.controlShape === 'pill' ? 999 : 3,
                                clipPath: style.controlShape === 'slant' ? controlClipPath : undefined,
                                background: `${scanStripOverlay}, color-mix(in srgb, ${colors.warning} 28%, ${colors.gray8})`,
                                border: `1px solid color-mix(in srgb, ${colors.warning} 46%, transparent)`,
                            }}
                        />
                        <Box
                            style={{
                                flex: 1,
                                height: 12,
                                minWidth: 44,
                                borderRadius: style.family === 'glyph' ? 3 : 999,
                                background: `color-mix(in srgb, ${colors.gray9} 72%, transparent)`,
                                border: `1px solid color-mix(in srgb, ${colors.accent} 30%, transparent)`,
                                overflow: 'hidden',
                            }}
                        >
                            <Box
                                style={{
                                    width: '68%',
                                    height: '100%',
                                    background: `${scanStripOverlay}, linear-gradient(90deg, ${colors.brand}, ${accent2})`,
                                }}
                            />
                        </Box>
                        <Box
                            style={{
                                width: 34,
                                height: 20,
                                borderRadius: panelRadius - 2,
                                border: `1px solid color-mix(in srgb, ${accent2} 38%, transparent)`,
                                background: `${componentFrameOverlay}, ${railOverlay}, color-mix(in srgb, ${colors.gray8} 82%, transparent)`,
                                backgroundBlendMode: 'screen, screen, normal',
                            }}
                        />
                    </Group>
                </Box>

                <Group grow gap={4}>
                    {[
                        { label: 'Controls', value: CONTROL_LABELS[style.controlMode] },
                        { label: 'Atmosphere', value: ATMOSPHERE_BACKGROUND_LABELS[atmosphere.background] },
                        { label: 'Texture', value: ATMOSPHERE_TEXTURE_LABELS[atmosphere.texture] },
                        { label: 'Motion', value: ATMOSPHERE_MOTION_LABELS[atmosphere.motion] },
                    ].map((item) => (
                        <Box
                            key={item.label}
                            style={{
                                borderRadius: style.family === 'glyph' ? 4 : 8,
                                border: `1px solid color-mix(in srgb, ${colors.gray0} 12%, transparent)`,
                                background: `color-mix(in srgb, ${colors.gray8} 86%, transparent)`,
                                padding: '5px 6px',
                            }}
                        >
                            <Text
                                size="6px"
                                fw={700}
                                tt="uppercase"
                                style={{
                                    color: mutedText,
                                    letterSpacing: '0.08em',
                                    ...(previewBodyFont ? { fontFamily: previewBodyFont } : {}),
                                }}
                            >
                                {item.label}
                            </Text>
                            <Text
                                size="7px"
                                fw={600}
                                style={{
                                    color: colors.gray0,
                                    lineHeight: 1.15,
                                    ...(previewBodyFont ? { fontFamily: previewBodyFont } : {}),
                                }}
                            >
                                {item.value}
                            </Text>
                        </Box>
                    ))}
                </Group>

                <Group gap={3} wrap="nowrap" style={{ marginTop: 'auto' }}>
                    {[colors.brand, colors.accent, accent2, accent3, colors.success, colors.warning, colors.error].map((color, idx) => (
                        <Box
                            key={`${color}-${idx}`}
                            style={{
                                flex: 1,
                                height: 8,
                                borderRadius: style.family === 'glyph' ? 1 : 2,
                                background: color,
                                border: `1px solid color-mix(in srgb, ${colors.gray0} 12%, transparent)`,
                            }}
                        />
                    ))}
                </Group>
            </Stack>
        </ThemePreviewFrame>
    );
}
