import { Box } from '@mantine/core';
import type { ReactNode } from 'react';
import { resolveThemeAtmosphere, resolveThemeStyle, type ThemePalette } from '../store/themeStore';

interface ThemePreviewFrameProps {
    theme: ThemePalette;
    children: ReactNode;
    height?: number;
}

export function ThemePreviewFrame({ theme, children, height = 206 }: ThemePreviewFrameProps) {
    const { colors } = theme;
    const style = resolveThemeStyle(theme);
    const atmosphere = resolveThemeAtmosphere(theme);
    const accent2 = colors.secondaryAccent || `color-mix(in srgb, ${colors.accent} 66%, ${colors.brand})`;
    const accent3 = colors.tertiaryAccent || `color-mix(in srgb, ${colors.success} 58%, ${colors.accent})`;
    const motifOpacity = Math.max(0, Math.min(style.motifIntensity ?? 0, 1));
    const shellBackground = style.surfaceMode === 'tonal'
        ? `linear-gradient(180deg, color-mix(in srgb, ${colors.gray7} 92%, ${colors.gray8}), color-mix(in srgb, ${colors.gray8} 95%, ${colors.gray9}))`
        : `linear-gradient(180deg, color-mix(in srgb, ${colors.gray8} 84%, ${colors.gray9}), color-mix(in srgb, ${colors.gray9} 92%, #11111b))`;
    const ambientOverlay = style.family === 'material'
        ? `linear-gradient(180deg, color-mix(in srgb, ${colors.brand} 12%, transparent), transparent 62%), ` +
        `radial-gradient(circle at 78% 12%, color-mix(in srgb, ${accent2} 16%, transparent), transparent 46%), ` +
        `radial-gradient(circle at 18% 88%, color-mix(in srgb, ${accent3} 12%, transparent), transparent 54%)`
        : `radial-gradient(circle at 18% 8%, color-mix(in srgb, ${colors.brand} 22%, transparent), transparent 55%), ` +
        `radial-gradient(circle at 84% 10%, color-mix(in srgb, ${accent2} 20%, transparent), transparent 52%), ` +
        `radial-gradient(circle at 56% 92%, color-mix(in srgb, ${accent3} 18%, transparent), transparent 62%)`;
    const atmosphereOverlay = atmosphere.background === 'aurora'
        ? `linear-gradient(130deg, color-mix(in srgb, ${colors.brand} 20%, transparent), transparent 44%), radial-gradient(ellipse at 80% 8%, color-mix(in srgb, ${accent2} 20%, transparent), transparent 58%)`
        : atmosphere.background === 'spotlight'
            ? `radial-gradient(circle at 50% 0%, color-mix(in srgb, ${colors.brand} 26%, transparent), transparent 42%), radial-gradient(ellipse at 50% 110%, color-mix(in srgb, ${colors.accent} 16%, transparent), transparent 58%)`
            : atmosphere.background === 'strata'
                ? `linear-gradient(148deg, color-mix(in srgb, ${colors.brand} 18%, transparent) 0 14%, transparent 14% 34%, color-mix(in srgb, ${accent2} 14%, transparent) 34% 48%, transparent 48% 100%)`
                : atmosphere.background === 'grid'
                    ? `linear-gradient(90deg, color-mix(in srgb, ${colors.accent} 14%, transparent) 1px, transparent 1px) 0 0 / 18px 18px, linear-gradient(0deg, color-mix(in srgb, ${colors.brand} 10%, transparent) 1px, transparent 1px) 0 0 / 18px 18px`
                    : atmosphere.background === 'mist'
                        ? `radial-gradient(ellipse at 18% 10%, color-mix(in srgb, ${colors.brand} 16%, transparent), transparent 64%), radial-gradient(ellipse at 78% 24%, color-mix(in srgb, ${accent2} 14%, transparent), transparent 62%)`
                        : atmosphere.background === 'none'
                            ? 'none'
                            : ambientOverlay;
    const textureOverlay = atmosphere.texture === 'none'
        ? 'none'
        : atmosphere.texture === 'terminal'
            ? `repeating-linear-gradient(180deg, color-mix(in srgb, ${colors.accent} 8%, transparent) 0 1px, transparent 1px 4px)`
            : atmosphere.texture === 'film'
                ? `radial-gradient(circle at 1px 1px, color-mix(in srgb, ${colors.gray0} 7%, transparent) 0.7px, transparent 1px) 0 0 / 7px 7px`
                : atmosphere.texture === 'paper'
                    ? `repeating-linear-gradient(90deg, color-mix(in srgb, ${colors.gray0} 5%, transparent) 0 1px, transparent 1px 28px)`
                    : `radial-gradient(circle at 1px 1px, color-mix(in srgb, ${colors.gray0} 6%, transparent) 0.7px, transparent 1px) 0 0 / 8px 8px`;
    const motifOverlay = style.motif === 'dot-grid'
        ? `radial-gradient(circle at 1.5px 1.5px, color-mix(in srgb, ${accent2} ${3 + Math.round(motifOpacity * 10)}%, transparent) 0.82px, transparent 1.1px) 0 0 / 16px 16px, ` +
        `radial-gradient(circle at 50% 50%, color-mix(in srgb, ${colors.brand} ${2 + Math.round(motifOpacity * 7)}%, transparent) 0.45px, transparent 0.72px) 8px 8px / 16px 16px`
        : style.motif === 'glyph-field'
            ? `repeating-linear-gradient(135deg, color-mix(in srgb, ${accent2} ${4 + Math.round(motifOpacity * 9)}%, transparent) 0 1.4px, transparent 1.4px 20px), ` +
            `repeating-linear-gradient(90deg, color-mix(in srgb, ${colors.brand} ${2 + Math.round(motifOpacity * 6)}%, transparent) 0 1px, transparent 1px 28px)`
            : style.motif === 'circuit'
                ? `linear-gradient(90deg, color-mix(in srgb, ${accent2} ${5 + Math.round(motifOpacity * 12)}%, transparent) 1px, transparent 1px) 0 0 / 26px 26px, radial-gradient(circle at 5px 5px, color-mix(in srgb, ${colors.brand} ${6 + Math.round(motifOpacity * 12)}%, transparent) 0.9px, transparent 1.3px) 0 0 / 26px 26px`
                : style.motif === 'hud-corners'
                    ? `linear-gradient(90deg, color-mix(in srgb, ${accent2} ${6 + Math.round(motifOpacity * 12)}%, transparent) 0 18px, transparent 18px 100%) 0 0 / 72px 1px, linear-gradient(180deg, color-mix(in srgb, ${colors.brand} ${5 + Math.round(motifOpacity * 10)}%, transparent) 0 18px, transparent 18px 100%) 0 0 / 1px 72px`
                    : style.motif === 'dot-matrix'
                        ? `radial-gradient(circle at 2px 2px, color-mix(in srgb, ${accent2} ${8 + Math.round(motifOpacity * 18)}%, transparent) 0.68px, transparent 1px) 0 0 / 8px 8px`
            : 'none';
    const decalOpacity = Math.max(0, Math.min(style.decalIntensity ?? 0, 1));
    const decalOverlay = style.decal === 'corner-cuts'
        ? `linear-gradient(135deg, color-mix(in srgb, ${accent2} ${8 + Math.round(decalOpacity * 18)}%, transparent) 0 1px, transparent 1px 100%) 0 0 / 18px 18px no-repeat, linear-gradient(45deg, color-mix(in srgb, ${colors.brand} ${8 + Math.round(decalOpacity * 18)}%, transparent) 0 1px, transparent 1px 100%) 100% 100% / 18px 18px no-repeat`
        : style.decal === 'scan-strips'
            ? `repeating-linear-gradient(90deg, color-mix(in srgb, ${accent2} ${8 + Math.round(decalOpacity * 18)}%, transparent) 0 9px, transparent 9px 15px) 100% 0 / 80px 3px no-repeat`
            : style.decal === 'circuit'
                ? `linear-gradient(90deg, transparent 0 14px, color-mix(in srgb, ${accent2} ${6 + Math.round(decalOpacity * 16)}%, transparent) 14px 15px, transparent 15px 100%) 0 8px / 58px 32px, radial-gradient(circle at 14px 14px, color-mix(in srgb, ${colors.brand} ${8 + Math.round(decalOpacity * 18)}%, transparent) 0.85px, transparent 1.2px) 0 0 / 58px 42px`
                : style.decal === 'hud'
                    ? `linear-gradient(90deg, color-mix(in srgb, ${accent2} ${10 + Math.round(decalOpacity * 18)}%, transparent) 0 24px, transparent 24px 100%) 0 0 / 112px 2px no-repeat, linear-gradient(180deg, color-mix(in srgb, ${colors.brand} ${8 + Math.round(decalOpacity * 16)}%, transparent) 0 18px, transparent 18px 100%) 0 0 / 2px 80px no-repeat`
                    : 'none';
    const frameRadius = style.family === 'glyph' ? 6 : style.family === 'material' ? 12 : 8;
    const frameBorder = style.family === 'glyph'
        ? `1px solid color-mix(in srgb, ${accent2} 34%, transparent)`
        : style.family === 'material'
            ? `1px solid color-mix(in srgb, ${colors.brand} 18%, ${colors.gray5})`
            : `1px solid color-mix(in srgb, ${colors.gray5} 86%, transparent)`;
    const frameShadow = style.family === 'glyph'
        ? `inset 0 0 0 1px color-mix(in srgb, ${accent2} 12%, transparent), 0 14px 30px color-mix(in srgb, ${colors.gray9} 72%, transparent)`
        : style.family === 'material'
            ? `inset 0 1px 0 color-mix(in srgb, ${colors.gray0} 6%, transparent), 0 16px 34px color-mix(in srgb, ${colors.gray9} 70%, transparent)`
            : 'var(--elevation-shadow-sm)';

    return (
        <Box
            style={{
                width: '100%',
                height,
                background: shellBackground,
                padding: 10,
                borderRadius: frameRadius,
                border: frameBorder,
                boxShadow: frameShadow,
                overflow: 'hidden',
                position: 'relative',
            }}
        >
            <Box
                style={{
                    position: 'absolute',
                    inset: 0,
                    pointerEvents: 'none',
                    background: [atmosphereOverlay, textureOverlay, motifOverlay, decalOverlay]
                        .filter((layer) => layer !== 'none')
                        .join(', ') || 'none',
                    opacity: Math.min(0.94, (style.family === 'glyph' ? 0.46 : style.family === 'material' ? 0.72 : 0.9) * (0.68 + atmosphere.intensity * 0.44)),
                }}
            />
            <Box style={{ position: 'relative', zIndex: 1, height: '100%' }}>
                {children}
            </Box>
        </Box>
    );
}
