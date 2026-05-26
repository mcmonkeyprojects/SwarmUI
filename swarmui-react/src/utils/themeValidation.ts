// Theme Validation Utilities
import { type ThemePalette, type ThemeCategory } from '../store/themeStore';

const VALID_CATEGORIES: ThemeCategory[] = [
    'default', 'app', 'editor', 'color-scheme', 'aesthetic', 'game', 'art', 'film', 'music', 'nature', 'minimal', 'custom'
];

const VALID_STYLE_FAMILIES = ['classic', 'material', 'glyph'] as const;
const VALID_STYLE_MOTIFS = ['none', 'dot-grid', 'glyph-field'] as const;
const VALID_SURFACE_MODES = ['gradient', 'tonal', 'ornamented'] as const;
const VALID_CONTROL_MODES = ['default', 'filled', 'outlined'] as const;
const VALID_ICON_MODES = ['plain', 'badge', 'glyph-outline'] as const;
const VALID_CONTROL_SHAPES = ['rounded', 'pill', 'square'] as const;
const VALID_ICON_SHAPES = ['rounded', 'circle', 'square'] as const;
const VALID_OVERLAY_BLENDS = ['normal', 'screen', 'overlay', 'soft-light', 'multiply'] as const;
const VALID_ATMOSPHERE_BACKGROUNDS = ['mesh', 'aurora', 'spotlight', 'strata', 'grid', 'mist', 'none'] as const;
const VALID_ATMOSPHERE_TEXTURES = ['none', 'grain', 'paper', 'film', 'terminal'] as const;
const VALID_ATMOSPHERE_MOTIONS = ['still', 'drift', 'pulse', 'scan'] as const;

/**
 * Validates if a string is a valid hex color
 */
export function isValidHexColor(color: string): boolean {
    // Match #RGB, #RRGGBB, #RRGGBBAA formats
    const hexRegex = /^#([A-Fa-f0-9]{3}|[A-Fa-f0-9]{6}|[A-Fa-f0-9]{8})$/;
    return hexRegex.test(color);
}

/**
 * Validates if a string is a valid rgba() color
 */
export function isValidRgbaColor(color: string): boolean {
    const rgbaRegex = /^rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*(,\s*[\d.]+\s*)?\)$/;
    return rgbaRegex.test(color);
}

/**
 * Validates if a color string is valid (hex or rgba)
 */
export function isValidColor(color: string): boolean {
    return isValidHexColor(color) || isValidRgbaColor(color);
}

/**
 * Validates a theme palette object
 */
export function validateTheme(theme: unknown): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    if (typeof theme !== 'object' || theme === null) {
        return {
            valid: false,
            errors: ['Theme must be an object']
        };
    }

    const candidate = theme as Record<string, unknown>;

    // Check required fields
    if (!candidate.id || typeof candidate.id !== 'string') {
        errors.push('Theme must have a valid "id" string');
    }

    if (!candidate.name || typeof candidate.name !== 'string') {
        errors.push('Theme must have a valid "name" string');
    }

    if (!candidate.category || !VALID_CATEGORIES.includes(candidate.category as ThemeCategory)) {
        errors.push(`Theme category must be one of: ${VALID_CATEGORIES.join(', ')}`);
    }

    if (!candidate.colors || typeof candidate.colors !== 'object') {
        errors.push('Theme must have a "colors" object');
        return { valid: false, errors };
    }

    const colors = candidate.colors as Record<string, unknown>;

    // Check required colors
    const requiredColors = [
        'brand', 'accent',
        'gray0', 'gray1', 'gray2', 'gray3', 'gray4',
        'gray5', 'gray6', 'gray7', 'gray8', 'gray9',
        'success', 'warning', 'error'
    ];

    for (const colorKey of requiredColors) {
        const color = colors[colorKey];
        if (!color) {
            errors.push(`Missing required color: "${colorKey}"`);
        } else if (typeof color !== 'string' || !isValidColor(color)) {
            errors.push(`Invalid color format for "${colorKey}": ${color}`);
        }
    }

    // Validate optional light mode colors if present
    const optionalColors = [
        'lightGray0', 'lightGray1', 'lightGray2', 'lightGray3', 'lightGray4',
        'lightGray5', 'lightGray6', 'lightGray7', 'lightGray8', 'lightGray9'
    ];

    for (const colorKey of optionalColors) {
        const color = colors[colorKey];
        if (color && (typeof color !== 'string' || !isValidColor(color))) {
            errors.push(`Invalid color format for optional "${colorKey}": ${color}`);
        }
    }

    if (candidate.style !== undefined) {
        if (typeof candidate.style !== 'object' || candidate.style === null) {
            errors.push('Theme "style" must be an object when provided');
        } else {
            const style = candidate.style as Record<string, unknown>;

            if (style.family === undefined) {
                errors.push('Theme style must include a "family" value');
            }

            if (
                style.family !== undefined
                && !VALID_STYLE_FAMILIES.includes(style.family as typeof VALID_STYLE_FAMILIES[number])
            ) {
                errors.push(`Theme style family must be one of: ${VALID_STYLE_FAMILIES.join(', ')}`);
            }

            if (
                style.motif !== undefined
                && !VALID_STYLE_MOTIFS.includes(style.motif as typeof VALID_STYLE_MOTIFS[number])
            ) {
                errors.push(`Theme style motif must be one of: ${VALID_STYLE_MOTIFS.join(', ')}`);
            }

            if (
                style.surfaceMode !== undefined
                && !VALID_SURFACE_MODES.includes(style.surfaceMode as typeof VALID_SURFACE_MODES[number])
            ) {
                errors.push(`Theme surface mode must be one of: ${VALID_SURFACE_MODES.join(', ')}`);
            }

            if (
                style.controlMode !== undefined
                && !VALID_CONTROL_MODES.includes(style.controlMode as typeof VALID_CONTROL_MODES[number])
            ) {
                errors.push(`Theme control mode must be one of: ${VALID_CONTROL_MODES.join(', ')}`);
            }

            if (
                style.iconMode !== undefined
                && !VALID_ICON_MODES.includes(style.iconMode as typeof VALID_ICON_MODES[number])
            ) {
                errors.push(`Theme icon mode must be one of: ${VALID_ICON_MODES.join(', ')}`);
            }

            if (
                style.controlShape !== undefined
                && !VALID_CONTROL_SHAPES.includes(style.controlShape as typeof VALID_CONTROL_SHAPES[number])
            ) {
                errors.push(`Theme control shape must be one of: ${VALID_CONTROL_SHAPES.join(', ')}`);
            }

            if (
                style.iconShape !== undefined
                && !VALID_ICON_SHAPES.includes(style.iconShape as typeof VALID_ICON_SHAPES[number])
            ) {
                errors.push(`Theme icon shape must be one of: ${VALID_ICON_SHAPES.join(', ')}`);
            }

            if (
                style.motifIntensity !== undefined
                && (typeof style.motifIntensity !== 'number' || Number.isNaN(style.motifIntensity))
            ) {
                errors.push('Theme motif intensity must be a number between 0 and 1');
            } else if (
                typeof style.motifIntensity === 'number'
                && (style.motifIntensity < 0 || style.motifIntensity > 1)
            ) {
                errors.push('Theme motif intensity must be between 0 and 1');
            }
        }
    }

    if (candidate.effects !== undefined) {
        if (typeof candidate.effects !== 'object' || candidate.effects === null) {
            errors.push('Theme "effects" must be an object when provided');
        } else {
            const effects = candidate.effects as Record<string, unknown>;
            const numericKeys = ['noiseIntensity', 'scanlineIntensity', 'meshIntensity'];
            for (const key of numericKeys) {
                const value = effects[key];
                if (value !== undefined && (typeof value !== 'number' || Number.isNaN(value) || value < 0 || value > 1.2)) {
                    errors.push(`Theme effect "${key}" must be a number between 0 and 1.2`);
                }
            }
            if (effects.meshAnimated !== undefined && typeof effects.meshAnimated !== 'boolean') {
                errors.push('Theme effect "meshAnimated" must be a boolean');
            }
            if (
                effects.overlayBlend !== undefined &&
                !VALID_OVERLAY_BLENDS.includes(effects.overlayBlend as typeof VALID_OVERLAY_BLENDS[number])
            ) {
                errors.push(`Theme overlay blend must be one of: ${VALID_OVERLAY_BLENDS.join(', ')}`);
            }
        }
    }

    if (candidate.atmosphere !== undefined) {
        if (typeof candidate.atmosphere !== 'object' || candidate.atmosphere === null) {
            errors.push('Theme "atmosphere" must be an object when provided');
        } else {
            const atmosphere = candidate.atmosphere as Record<string, unknown>;
            if (
                atmosphere.background !== undefined &&
                !VALID_ATMOSPHERE_BACKGROUNDS.includes(atmosphere.background as typeof VALID_ATMOSPHERE_BACKGROUNDS[number])
            ) {
                errors.push(`Theme atmosphere background must be one of: ${VALID_ATMOSPHERE_BACKGROUNDS.join(', ')}`);
            }
            if (
                atmosphere.texture !== undefined &&
                !VALID_ATMOSPHERE_TEXTURES.includes(atmosphere.texture as typeof VALID_ATMOSPHERE_TEXTURES[number])
            ) {
                errors.push(`Theme atmosphere texture must be one of: ${VALID_ATMOSPHERE_TEXTURES.join(', ')}`);
            }
            if (
                atmosphere.motion !== undefined &&
                !VALID_ATMOSPHERE_MOTIONS.includes(atmosphere.motion as typeof VALID_ATMOSPHERE_MOTIONS[number])
            ) {
                errors.push(`Theme atmosphere motion must be one of: ${VALID_ATMOSPHERE_MOTIONS.join(', ')}`);
            }
            if (
                atmosphere.intensity !== undefined &&
                (typeof atmosphere.intensity !== 'number' || Number.isNaN(atmosphere.intensity))
            ) {
                errors.push('Theme atmosphere intensity must be a number between 0 and 1');
            } else if (
                typeof atmosphere.intensity === 'number' &&
                (atmosphere.intensity < 0 || atmosphere.intensity > 1)
            ) {
                errors.push('Theme atmosphere intensity must be between 0 and 1');
            }
        }
    }

    if (candidate.adaptive !== undefined) {
        if (typeof candidate.adaptive !== 'object' || candidate.adaptive === null) {
            errors.push('Theme "adaptive" must be an object when provided');
        } else {
            const adaptive = candidate.adaptive as Record<string, unknown>;
            const numericKeys = ['imageReactiveStrength', 'timeOfDayStrength'];
            for (const key of numericKeys) {
                const value = adaptive[key];
                if (value !== undefined && (typeof value !== 'number' || Number.isNaN(value) || value < 0 || value > 1)) {
                    errors.push(`Theme adaptive setting "${key}" must be a number between 0 and 1`);
                }
            }
            if (adaptive.contrastGuard !== undefined && typeof adaptive.contrastGuard !== 'boolean') {
                errors.push('Theme adaptive setting "contrastGuard" must be a boolean');
            }
        }
    }

    if (candidate.meta !== undefined) {
        if (typeof candidate.meta !== 'object' || candidate.meta === null) {
            errors.push('Theme "meta" must be an object when provided');
        } else {
            const meta = candidate.meta as Record<string, unknown>;
            const stringKeys = ['themeSet', 'pairedModeThemeId'];
            for (const key of stringKeys) {
                const value = meta[key];
                if (value !== undefined && typeof value !== 'string') {
                    errors.push(`Theme metadata "${key}" must be a string`);
                }
            }
            const listKeys = ['recommendationIds', 'tags'];
            for (const key of listKeys) {
                const value = meta[key];
                if (
                    value !== undefined &&
                    (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string'))
                ) {
                    errors.push(`Theme metadata "${key}" must be an array of strings`);
                }
            }
        }
    }

    return {
        valid: errors.length === 0,
        errors
    };
}

/**
 * Sanitizes a theme name to create a valid ID
 */
export function sanitizeThemeId(name: string): string {
    return name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

/**
 * Ensures a theme ID is unique by appending a number if needed
 */
export function ensureUniqueId(baseId: string, existingIds: string[]): string {
    let id = baseId;
    let counter = 1;

    while (existingIds.includes(id)) {
        id = `${baseId}-${counter}`;
        counter++;
    }

    return id;
}

/**
 * Parses and validates theme JSON
 */
export function parseThemeJson(json: string): {
    success: boolean;
    theme?: ThemePalette;
    errors?: string[];
} {
    try {
        const parsed = JSON.parse(json);
        const validation = validateTheme(parsed);

        if (!validation.valid) {
            return {
                success: false,
                errors: validation.errors
            };
        }

        return {
            success: true,
            theme: parsed as ThemePalette
        };
    } catch (error) {
        return {
            success: false,
            errors: ['Invalid JSON format: ' + (error instanceof Error ? error.message : 'Unknown error')]
        };
    }
}
