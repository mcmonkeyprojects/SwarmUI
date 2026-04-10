// ThemePreview Component - Compact visual QA card for theme selection
import { Box, Group, Stack, Text } from '@mantine/core';
import {
    getThemePersonalityLabel,
    resolveThemeStyle,
    type ThemeControlShape,
    type ThemePalette,
    type ThemeStyleFamily,
    type ThemeStyleMotif,
    type ThemeControlMode,
    type ThemeIconShape,
    type ThemeIconMode,
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

const ICON_LABELS: Record<ThemeIconMode, string> = {
    plain: 'Plain Icons',
    badge: 'Badge Icons',
    'glyph-outline': 'Glyph Icons',
};

const BUTTON_SHAPE_LABELS: Record<ThemeControlShape, string> = {
    rounded: 'Rounded',
    pill: 'Pill',
    square: 'Square',
};

const ICON_SHAPE_LABELS: Record<ThemeIconShape, string> = {
    rounded: 'Rounded',
    circle: 'Circle',
    square: 'Square',
};

export function ThemePreview({ theme, styleOverride }: ThemePreviewProps) {
    const { colors } = theme;
    const style = resolveThemeStyle(theme, styleOverride);
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
    const controlRadius = style.controlShape === 'pill' ? 999 : style.controlShape === 'square' ? 4 : 8;
    const iconRadius = style.iconShape === 'circle' ? 999 : style.iconShape === 'square' ? 3 : 6;
    const styleBadgeBg = style.family === 'glyph'
        ? `color-mix(in srgb, ${colors.accent} 16%, transparent)`
        : `color-mix(in srgb, ${colors.gray8} 78%, transparent)`;
    const styleBorder = style.family === 'glyph'
        ? `1px solid color-mix(in srgb, ${accent2} 28%, transparent)`
        : `1px solid ${colors.gray5}`;
    const motifLabel = style.motif === 'none' ? null : MOTIF_LABELS[style.motif];
    const previewBadges = [personalityLabel, FAMILY_LABELS[style.family], SURFACE_LABELS[style.surfaceMode], motifLabel].filter(
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

                <Group grow gap={4}>
                    {[
                        { label: 'Controls', value: CONTROL_LABELS[style.controlMode] },
                        { label: 'Icons', value: ICON_LABELS[style.iconMode] },
                        { label: 'Buttons', value: BUTTON_SHAPE_LABELS[style.controlShape] },
                        { label: 'Icon Shape', value: ICON_SHAPE_LABELS[style.iconShape] },
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
