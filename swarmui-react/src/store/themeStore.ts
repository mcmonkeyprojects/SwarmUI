// Theme Store - Manages color palette themes with live switching
import { create } from 'zustand';
import { persist, devtools } from 'zustand/middleware';

export type ThemeCategory =
  | 'default'
  | 'app' // Discord, Spotify, Slack, etc.
  | 'editor' // VS Code, JetBrains, Sublime, etc.
  | 'color-scheme' // Nord, Dracula, Catppuccin, Gruvbox, etc.
  | 'aesthetic' // Cyberpunk, Synthwave, etc.
  | 'game' // Elden Ring, Dark Souls, etc.
  | 'minimal' // Monochrome, High Contrast
  | 'custom'; // User-created themes

export type ThemeMotionProfile = 'calm' | 'standard' | 'energetic';
export type ThemeRadiusScale = 'compact' | 'comfortable' | 'rounded';
export type ThemeStrokeStyle = 'subtle' | 'standard' | 'bold';
export type ThemeShadowDepth = 'soft' | 'normal' | 'dramatic';
export type ThemeStyleFamily = 'classic' | 'material' | 'glyph';
export type ThemeStyleMotif = 'none' | 'dot-grid' | 'glyph-field';
export type ThemeSurfaceMode = 'gradient' | 'tonal' | 'ornamented';
export type ThemeControlMode = 'default' | 'filled' | 'outlined';
export type ThemeIconMode = 'plain' | 'badge' | 'glyph-outline';
export type ThemeControlShape = 'rounded' | 'pill' | 'square';
export type ThemeIconShape = 'rounded' | 'circle' | 'square';

export interface ThemeStyle {
  family: ThemeStyleFamily;
  motif?: ThemeStyleMotif;
  motifIntensity?: number;
  surfaceMode?: ThemeSurfaceMode;
  controlMode?: ThemeControlMode;
  iconMode?: ThemeIconMode;
  controlShape?: ThemeControlShape;
  iconShape?: ThemeIconShape;
}

export interface ThemeShapeOverrides {
  controlShape?: ThemeControlShape | null;
  iconShape?: ThemeIconShape | null;
}

export interface ThemePalette {
  id: string;
  name: string;
  category: ThemeCategory;
  style?: ThemeStyle;
  colors: {
    // Primary brand color
    brand: string;
    // Gray scale (from dark to light)
    gray0: string; // Darkest (usually text)
    gray1: string;
    gray2: string;
    gray3: string;
    gray4: string;
    gray5: string; // Borders
    gray6: string;
    gray7: string;
    gray8: string; // Panels
    gray9: string; // Background
    // Accent colors
    accent: string;
    success: string;
    warning: string;
    error: string;
    // Additional accent channels for richer palettes
    secondaryAccent?: string;
    tertiaryAccent?: string;
    highlightAccent?: string;
    // Surface styling
    surfaceTint?: string;
    surfaceTintStrength?: number; // 0.04-0.35
    panelGradient?: string;
    borderStyle?: 'solid' | 'dashed' | 'double';
    borderWidth?: number;
    // Visual personality
    shadowDepth?: ThemeShadowDepth;
    glowStrength?: number; // 0-1.5
    blurStrength?: number; // px
    motionProfile?: ThemeMotionProfile;
    radiusScale?: ThemeRadiusScale;
    strokeStyle?: ThemeStrokeStyle;
    // UI Interaction Colors (optional - fallback to computed)
    selectionBg?: string;
    selectionBorder?: string;
    focusRing?: string;
    highlightBg?: string;
    lineHighlight?: string;
    linkUnderline?: string;
    bracketMatch?: string;
    // Scrollbar theming
    scrollbarThumb?: string;
    scrollbarTrack?: string;
    // Input/dropdown backgrounds
    inputBg?: string;
    dropdownBg?: string;
    // Semantic readability surfaces
    appBg?: string;
    panelBg?: string;
    cardBg?: string;
    raisedBg?: string;
    headerBg?: string;
    selectedSurface?: string;
    selectedSurfaceHover?: string;
    selectedText?: string;
    interactiveHoverBg?: string;
    interactiveActiveBg?: string;
    surfaceOverlayOpacity?: number;
    headerOverlayOpacity?: number;
    inputOverlayOpacity?: number;
    controlOverlayOpacity?: number;
    // Syntax highlighting (for prompt editor)
    syntaxKeyword?: string;
    syntaxString?: string;
    syntaxNumber?: string;
    syntaxComment?: string;
    // Gradient accents
    brandGradient?: string;
    // Semantic colors
    infoColor?: string; // Informational messages
    mutedText?: string; // Subdued text, placeholders
    disabledOpacity?: number; // Disabled element opacity (0.3-0.6)
    interactiveBg?: string; // Hover background for controls
    borderSubtle?: string; // Subtle borders
    // Shadow theming
    shadowColor?: string; // Shadow base color (rgba)
    shadowIntensity?: number; // Opacity multiplier (0.5-1.5)
    glowColor?: string; // Glow effect for brand elements
    // Animation theming
    animationCurve?: string; // Default easing function
    animationSpeed?: 'slow' | 'normal' | 'fast'; // Speed preference
    hoverLift?: boolean; // Lift effect on hover
    // Light mode gray overrides (optional - fallback to generic light grays)
    lightGray0?: string; // Light mode: primary text (darkest)
    lightGray1?: string;
    lightGray2?: string;
    lightGray3?: string;
    lightGray4?: string;
    lightGray5?: string; // Light mode: borders
    lightGray6?: string;
    lightGray7?: string;
    lightGray8?: string;
    lightGray9?: string; // Light mode: background (lightest)
    // Text hierarchy (Phase 5)
    textPrimary?: string; // Primary text color override (fallback to gray0)
    textSecondary?: string; // Secondary text color override (fallback to gray2)
    // Overlay customization (Phase 5)
    overlayColor?: string; // Overlay/backdrop color (rgba or hex with alpha)
    // Typography (Phase 5)
    fontFamily?: string; // Custom font family for the entire theme
    fontHeading?: string; // Heading/display font stack
    fontMono?: string; // Monospace/code font stack
  };
}

export const DEFAULT_THEME_STYLE: Required<ThemeStyle> = {
  family: 'classic',
  motif: 'none',
  motifIntensity: 0,
  surfaceMode: 'gradient',
  controlMode: 'default',
  iconMode: 'plain',
  controlShape: 'rounded',
  iconShape: 'rounded',
};

export function resolveThemeStyle(
  theme: ThemePalette,
  overrides: ThemeShapeOverrides = {}
): Required<ThemeStyle> {
  const family = theme.style?.family ?? DEFAULT_THEME_STYLE.family;
  const motif = theme.style?.motif ?? (family === 'glyph' ? 'dot-grid' : DEFAULT_THEME_STYLE.motif);
  const motifIntensity = clamp(theme.style?.motifIntensity ?? (motif === 'none' ? 0 : 0.58), 0, 1);

  return {
    family,
    motif,
    motifIntensity,
    surfaceMode:
      theme.style?.surfaceMode ??
      (family === 'material'
        ? 'tonal'
        : family === 'glyph'
          ? 'ornamented'
          : DEFAULT_THEME_STYLE.surfaceMode),
    controlMode:
      theme.style?.controlMode ??
      (family === 'material'
        ? 'filled'
        : family === 'glyph'
          ? 'outlined'
          : DEFAULT_THEME_STYLE.controlMode),
    iconMode:
      theme.style?.iconMode ??
      (family === 'material'
        ? 'badge'
        : family === 'glyph'
          ? 'glyph-outline'
          : DEFAULT_THEME_STYLE.iconMode),
    controlShape:
      overrides.controlShape ??
      theme.style?.controlShape ??
      (family === 'material'
        ? 'pill'
        : family === 'glyph'
          ? 'square'
          : DEFAULT_THEME_STYLE.controlShape),
    iconShape:
      overrides.iconShape ??
      theme.style?.iconShape ??
      (family === 'material'
        ? 'circle'
        : family === 'glyph'
          ? 'square'
          : DEFAULT_THEME_STYLE.iconShape),
  };
}

type ThemePersonality = 'editorial' | 'studio' | 'ornamental';

// Predefined theme palettes
const BASE_THEME_PALETTES: ThemePalette[] = [
  {
    id: 'invoke',
    name: 'InvokeAI (Default)',
    category: 'default',
    colors: {
      brand: '#7c3aed',
      gray0: '#ffffff',
      gray1: '#e5e5e5',
      gray2: '#c4c4c4',
      gray3: '#9ca3af',
      gray4: '#6b7280',
      gray5: '#4b5563',
      gray6: '#374151',
      gray7: '#1f2937',
      gray8: '#111827',
      gray9: '#0b0f14',
      accent: '#3b82f6',
      success: '#22c55e',
      warning: '#f59e0b',
      error: '#ef4444',
      secondaryAccent: '#6366f1',
      tertiaryAccent: '#14b8a6',
      highlightAccent: '#fbbf24',
      surfaceTint: 'rgba(124, 58, 237, 0.12)',
      surfaceTintStrength: 0.12,
      panelGradient: 'linear-gradient(180deg, color-mix(in srgb, #111827 92%, #7c3aed), #0b0f14)',
      borderStyle: 'solid',
      borderWidth: 1,
      motionProfile: 'standard',
      radiusScale: 'comfortable',
      strokeStyle: 'standard',
      shadowDepth: 'normal',
      glowStrength: 0.75,
      blurStrength: 4,
      selectionBg: 'rgba(124, 58, 237, 0.25)',
      lineHighlight: '#1e293b',
      linkUnderline: '#3b82f6',
      scrollbarThumb: '#4b5563',
      scrollbarTrack: '#111827',
      inputBg: '#111827',
      dropdownBg: '#1f2937',
      syntaxKeyword: '#c084fc',
      syntaxString: '#22c55e',
      syntaxNumber: '#f59e0b',
      syntaxComment: '#6b7280',
      brandGradient: 'linear-gradient(135deg, #7c3aed, #3b82f6)',
      // Semantic
      infoColor: '#3b82f6',
      mutedText: '#6b7280',
      disabledOpacity: 0.4,
      // Shadow
      shadowColor: 'rgba(0, 0, 0, 0.4)',
      shadowIntensity: 1.0,
      // Animation
      animationCurve: 'ease-out',
      animationSpeed: 'normal',
      hoverLift: true,
    },
  },
  {
    id: 'spotify',
    name: 'Spotify',
    category: 'app',
    colors: {
      brand: '#1db954',
      gray0: '#ffffff',
      gray1: '#b3b3b3',
      gray2: '#a3a3a3',
      gray3: '#727272',
      gray4: '#535353',
      gray5: '#404040',
      gray6: '#2a2a2a',
      gray7: '#1a1a1a',
      gray8: '#121212',
      gray9: '#0a0a0a',
      accent: '#1db954',
      success: '#1db954',
      warning: '#ffa500',
      error: '#ff5555',
      selectionBg: 'rgba(29, 185, 84, 0.20)',
      lineHighlight: '#1a1a1a',
      scrollbarThumb: '#535353',
      scrollbarTrack: '#121212',
      inputBg: '#121212',
      dropdownBg: '#1a1a1a',
      syntaxKeyword: '#1db954',
      syntaxString: '#1db954',
      syntaxNumber: '#ffa500',
      syntaxComment: '#535353',
      brandGradient: 'linear-gradient(135deg, #1db954, #1ed760)',
      // Semantic
      infoColor: '#1db954',
      mutedText: '#535353',
      disabledOpacity: 0.4,
      // Shadow
      shadowColor: 'rgba(0, 0, 0, 0.5)',
      shadowIntensity: 1.1,
      // Animation
      animationCurve: 'ease-out',
      animationSpeed: 'fast',
      hoverLift: true,
    },
  },
  {
    id: 'sith',
    name: 'Sith (Black & Red)',
    category: 'aesthetic',
    colors: {
      brand: '#dc2626',
      gray0: '#fef2f2',
      gray1: '#fee2e2',
      gray2: '#d4d4d4',
      gray3: '#a3a3a3',
      gray4: '#737373',
      gray5: '#525252',
      gray6: '#262626',
      gray7: '#171717',
      gray8: '#0d0d0d',
      gray9: '#050505',
      accent: '#b91c1c',
      success: '#dc2626',
      warning: '#f97316',
      error: '#ef4444',
      selectionBg: 'rgba(220, 38, 38, 0.25)',
      lineHighlight: '#1a0a0a',
      scrollbarThumb: '#525252',
      scrollbarTrack: '#0d0d0d',
      syntaxKeyword: '#ef4444',
      syntaxString: '#f97316',
      syntaxNumber: '#fbbf24',
      syntaxComment: '#737373',
      brandGradient: 'linear-gradient(135deg, #dc2626, #b91c1c)',
      // Semantic
      infoColor: '#b91c1c',
      mutedText: '#737373',
      disabledOpacity: 0.4,
      // Shadow - dramatic with red glow
      shadowColor: 'rgba(0, 0, 0, 0.6)',
      shadowIntensity: 1.2,
      glowColor: 'rgba(220, 38, 38, 0.3)',
      // Animation
      animationCurve: 'ease-in-out',
      animationSpeed: 'normal',
      hoverLift: true,
    },
  },
  {
    id: 'cappuccino',
    name: 'Cappuccino',
    category: 'aesthetic',
    colors: {
      brand: '#a67c52',
      gray0: '#fdfaf6',
      gray1: '#f5ebe0',
      gray2: '#dfd3c3',
      gray3: '#c7b7a3',
      gray4: '#967969',
      gray5: '#6b5344',
      gray6: '#4a3728',
      gray7: '#3d2e22',
      gray8: '#2a1f17',
      gray9: '#1a1410',
      accent: '#8b5a2b',
      success: '#6b8e23',
      warning: '#daa520',
      error: '#cd5c5c',
      selectionBg: 'rgba(166, 124, 82, 0.25)',
      lineHighlight: '#332517',
      scrollbarThumb: '#6b5344',
      scrollbarTrack: '#2a1f17',
      syntaxKeyword: '#8b5a2b',
      syntaxString: '#6b8e23',
      syntaxNumber: '#daa520',
      syntaxComment: '#967969',
      brandGradient: 'linear-gradient(135deg, #a67c52, #8b5a2b)',
      // Semantic - warm
      infoColor: '#8b5a2b',
      mutedText: '#967969',
      disabledOpacity: 0.45,
      // Shadow - warm brown
      shadowColor: 'rgba(26, 20, 16, 0.5)',
      shadowIntensity: 0.9,
      // Animation - smooth
      animationCurve: 'ease-in-out',
      animationSpeed: 'normal',
      hoverLift: true,
    },
  },
  {
    id: 'ocean',
    name: 'Ocean Blue',
    category: 'aesthetic',
    colors: {
      brand: '#0ea5e9',
      gray0: '#ffffff',
      gray1: '#e8e8e8',
      gray2: '#d0d0d0',
      gray3: '#a0a8b0',
      gray4: '#607080',
      gray5: '#0284c7',
      gray6: '#075985',
      gray7: '#0c4a6e',
      gray8: '#082f49',
      gray9: '#051e31',
      accent: '#06b6d4',
      success: '#10b981',
      warning: '#f59e0b',
      error: '#f43f5e',
      selectionBg: 'rgba(14, 165, 233, 0.25)',
      lineHighlight: '#0a3a55',
      scrollbarThumb: '#0284c7',
      scrollbarTrack: '#082f49',
      syntaxKeyword: '#06b6d4',
      syntaxString: '#10b981',
      syntaxNumber: '#f59e0b',
      syntaxComment: '#607080',
      brandGradient: 'linear-gradient(135deg, #0ea5e9, #06b6d4)',
    },
  },
  {
    id: 'forest',
    name: 'Forest Green',
    category: 'aesthetic',
    colors: {
      brand: '#22c55e',
      gray0: '#ffffff',
      gray1: '#e8e8e8',
      gray2: '#d0d0d0',
      gray3: '#a0a8a0',
      gray4: '#607060',
      gray5: '#16a34a',
      gray6: '#166534',
      gray7: '#14532d',
      gray8: '#0f3d21',
      gray9: '#0a2615',
      accent: '#10b981',
      success: '#22c55e',
      warning: '#eab308',
      error: '#ef4444',
      selectionBg: 'rgba(34, 197, 94, 0.25)',
      lineHighlight: '#0f4025',
      scrollbarThumb: '#16a34a',
      scrollbarTrack: '#0f3d21',
      syntaxKeyword: '#10b981',
      syntaxString: '#22c55e',
      syntaxNumber: '#eab308',
      syntaxComment: '#607060',
      brandGradient: 'linear-gradient(135deg, #22c55e, #10b981)',
    },
  },
  {
    id: 'cyberpunk',
    name: 'Cyberpunk',
    category: 'aesthetic',
    colors: {
      brand: '#f0f',
      gray0: '#fff',
      gray1: '#e0e0e0',
      gray2: '#c0c0c0',
      gray3: '#a0a0a0',
      gray4: '#808080',
      gray5: '#404040',
      gray6: '#202020',
      gray7: '#151515',
      gray8: '#0a0a0a',
      gray9: '#050505',
      accent: '#0ff',
      success: '#0f0',
      warning: '#ff0',
      error: '#f00',
      secondaryAccent: '#ff4dff',
      tertiaryAccent: '#22d3ee',
      highlightAccent: '#facc15',
      surfaceTint: 'rgba(255, 0, 255, 0.2)',
      surfaceTintStrength: 0.24,
      panelGradient: 'linear-gradient(180deg, color-mix(in srgb, #0a0a0a 84%, #ff00ff), #050505)',
      borderStyle: 'double',
      borderWidth: 1,
      motionProfile: 'energetic',
      radiusScale: 'compact',
      strokeStyle: 'bold',
      shadowDepth: 'dramatic',
      glowStrength: 1.3,
      blurStrength: 6,
      selectionBg: 'rgba(255, 0, 255, 0.25)',
      lineHighlight: '#1a0a1a',
      scrollbarThumb: '#f0f',
      scrollbarTrack: '#0a0a0a',
      syntaxKeyword: '#f0f',
      syntaxString: '#0ff',
      syntaxNumber: '#ff0',
      syntaxComment: '#808080',
      brandGradient: 'linear-gradient(135deg, #f0f, #0ff)',
      // Semantic
      infoColor: '#0ff',
      mutedText: '#808080',
      disabledOpacity: 0.5,
      // Shadow with glow
      shadowColor: 'rgba(0, 0, 0, 0.6)',
      shadowIntensity: 1.3,
      glowColor: 'rgba(255, 0, 255, 0.4)',
      // Animation - fast and springy
      animationCurve: 'cubic-bezier(0.175, 0.885, 0.32, 1.275)',
      animationSpeed: 'fast',
      hoverLift: true,
    },
  },
  {
    id: 'midnight',
    name: 'Midnight Purple',
    category: 'aesthetic',
    colors: {
      brand: '#a855f7',
      gray0: '#ffffff',
      gray1: '#e8e8e8',
      gray2: '#d0d0d0',
      gray3: '#a8a0b0',
      gray4: '#8070a0',
      gray5: '#7e22ce',
      gray6: '#581c87',
      gray7: '#3b0764',
      gray8: '#2e0554',
      gray9: '#1a0337',
      accent: '#c084fc',
      success: '#22c55e',
      warning: '#f59e0b',
      error: '#ef4444',
      selectionBg: 'rgba(168, 85, 247, 0.25)',
      lineHighlight: '#2a0550',
      scrollbarThumb: '#7e22ce',
      scrollbarTrack: '#2e0554',
      syntaxKeyword: '#c084fc',
      syntaxString: '#22c55e',
      syntaxNumber: '#f59e0b',
      syntaxComment: '#8070a0',
      brandGradient: 'linear-gradient(135deg, #a855f7, #c084fc)',
      // Semantic
      infoColor: '#c084fc',
      mutedText: '#8070a0',
      disabledOpacity: 0.45,
      // Shadow - purple glow
      shadowColor: 'rgba(26, 3, 55, 0.5)',
      shadowIntensity: 1.1,
      glowColor: 'rgba(168, 85, 247, 0.3)',
      // Animation
      animationCurve: 'ease-out',
      animationSpeed: 'normal',
      hoverLift: true,
    },
  },
  // ===== Popular App Themes =====
  {
    id: 'discord',
    name: 'Discord',
    category: 'app',
    colors: {
      brand: '#5865f2',
      gray0: '#ffffff',
      gray1: '#dcddde',
      gray2: '#b9bbbe',
      gray3: '#8e9297',
      gray4: '#72767d',
      gray5: '#4f545c',
      gray6: '#36393f',
      gray7: '#2f3136',
      gray8: '#202225',
      gray9: '#18191c',
      accent: '#5865f2',
      success: '#3ba55c',
      warning: '#faa61a',
      error: '#ed4245',
      selectionBg: 'rgba(88, 101, 242, 0.25)',
      lineHighlight: '#32353b',
      scrollbarThumb: '#4f545c',
      scrollbarTrack: '#202225',
      syntaxKeyword: '#5865f2',
      syntaxString: '#3ba55c',
      syntaxNumber: '#faa61a',
      syntaxComment: '#72767d',
      brandGradient: 'linear-gradient(135deg, #5865f2, #eb459e)',
      // Semantic
      infoColor: '#5865f2',
      mutedText: '#72767d',
      disabledOpacity: 0.45,
      // Shadow
      shadowColor: 'rgba(0, 0, 0, 0.45)',
      shadowIntensity: 1.0,
      // Animation - snappy Discord feel
      animationCurve: 'ease-out',
      animationSpeed: 'fast',
      hoverLift: true,
    },
  },
  {
    id: 'slack',
    name: 'Slack',
    category: 'app',
    colors: {
      brand: '#4a154b',
      gray0: '#ffffff',
      gray1: '#f8f8f8',
      gray2: '#e8e8e8',
      gray3: '#b5b5b5',
      gray4: '#868686',
      gray5: '#616061',
      gray6: '#3c3c3c',
      gray7: '#2c2c2c',
      gray8: '#1a1a1a',
      gray9: '#0f0f0f',
      accent: '#36c5f0',
      success: '#2eb67d',
      warning: '#ecb22e',
      error: '#e01e5a',
      selectionBg: 'rgba(74, 21, 75, 0.25)',
      lineHighlight: '#241525',
      scrollbarThumb: '#616061',
      scrollbarTrack: '#1a1a1a',
      syntaxKeyword: '#e01e5a',
      syntaxString: '#2eb67d',
      syntaxNumber: '#ecb22e',
      syntaxComment: '#868686',
      brandGradient: 'linear-gradient(135deg, #4a154b, #36c5f0)',
    },
  },
  {
    id: 'github',
    name: 'GitHub Dark',
    category: 'app',
    colors: {
      brand: '#238636',
      gray0: '#f0f6fc',
      gray1: '#c9d1d9',
      gray2: '#b1bac4',
      gray3: '#8b949e',
      gray4: '#6e7681',
      gray5: '#484f58',
      gray6: '#30363d',
      gray7: '#21262d',
      gray8: '#161b22',
      gray9: '#0d1117',
      accent: '#58a6ff',
      success: '#238636',
      warning: '#d29922',
      error: '#f85149',
      selectionBg: 'rgba(35, 134, 54, 0.25)',
      lineHighlight: '#161b22',
      scrollbarThumb: '#484f58',
      scrollbarTrack: '#161b22',
      syntaxKeyword: '#ff7b72',
      syntaxString: '#a5d6ff',
      syntaxNumber: '#79c0ff',
      syntaxComment: '#8b949e',
      brandGradient: 'linear-gradient(135deg, #238636, #58a6ff)',
    },
  },
  {
    id: 'vscode',
    name: 'VS Code Dark+',
    category: 'editor',
    colors: {
      brand: '#007acc',
      gray0: '#ffffff',
      gray1: '#d4d4d4',
      gray2: '#adadad',
      gray3: '#858585',
      gray4: '#6a6a6a',
      gray5: '#505050',
      gray6: '#3c3c3c',
      gray7: '#2d2d2d',
      gray8: '#1e1e1e',
      gray9: '#0e0e0e',
      accent: '#007acc',
      success: '#4ec9b0',
      warning: '#dcdcaa',
      error: '#f44747',
      selectionBg: 'rgba(0, 122, 204, 0.20)',
      lineHighlight: '#2a2d2e',
      focusRing: '#007acc',
      scrollbarThumb: '#505050',
      scrollbarTrack: '#1e1e1e',
      inputBg: '#3c3c3c',
      dropdownBg: '#2d2d2d',
      syntaxKeyword: '#569cd6',
      syntaxString: '#ce9178',
      syntaxNumber: '#b5cea8',
      syntaxComment: '#6a9955',
      brandGradient: 'linear-gradient(135deg, #007acc, #4ec9b0)',
    },
  },
  {
    id: 'netflix',
    name: 'Netflix',
    category: 'app',
    colors: {
      brand: '#e50914',
      gray0: '#ffffff',
      gray1: '#e5e5e5',
      gray2: '#b3b3b3',
      gray3: '#808080',
      gray4: '#666666',
      gray5: '#454545',
      gray6: '#2f2f2f',
      gray7: '#1f1f1f',
      gray8: '#141414',
      gray9: '#0a0a0a',
      accent: '#e50914',
      success: '#46d369',
      warning: '#f9a825',
      error: '#e50914',
      selectionBg: 'rgba(229, 9, 20, 0.25)',
      lineHighlight: '#1a1a1a',
      scrollbarThumb: '#454545',
      scrollbarTrack: '#141414',
      syntaxKeyword: '#e50914',
      syntaxString: '#46d369',
      syntaxNumber: '#f9a825',
      syntaxComment: '#666666',
      brandGradient: 'linear-gradient(135deg, #e50914, #b20710)',
      // Semantic
      infoColor: '#e50914',
      mutedText: '#666666',
      disabledOpacity: 0.45,
      // Shadow - dramatic red
      shadowColor: 'rgba(0, 0, 0, 0.5)',
      shadowIntensity: 1.2,
      glowColor: 'rgba(229, 9, 20, 0.25)',
      // Animation
      animationCurve: 'ease-in-out',
      animationSpeed: 'normal',
      hoverLift: true,
    },
  },
  {
    id: 'twitter',
    name: 'X (Twitter)',
    category: 'app',
    colors: {
      brand: '#1d9bf0',
      gray0: '#ffffff',
      gray1: '#e7e9ea',
      gray2: '#c4c9cc',
      gray3: '#9ea3a6',
      gray4: '#71767b',
      gray5: '#536471',
      gray6: '#38444d',
      gray7: '#202327',
      gray8: '#16181c',
      gray9: '#000000',
      accent: '#1d9bf0',
      success: '#00ba7c',
      warning: '#ffad1f',
      error: '#f4212e',
      selectionBg: 'rgba(29, 155, 240, 0.25)',
      lineHighlight: '#1d2226',
      scrollbarThumb: '#536471',
      scrollbarTrack: '#16181c',
      syntaxKeyword: '#1d9bf0',
      syntaxString: '#00ba7c',
      syntaxNumber: '#ffad1f',
      syntaxComment: '#71767b',
      brandGradient: 'linear-gradient(135deg, #1d9bf0, #0077b5)',
      // Semantic
      infoColor: '#1d9bf0',
      mutedText: '#71767b',
      disabledOpacity: 0.45,
      // Shadow
      shadowColor: 'rgba(0, 0, 0, 0.45)',
      shadowIntensity: 1.0,
      // Animation - snappy
      animationCurve: 'ease-out',
      animationSpeed: 'fast',
      hoverLift: true,
    },
  },
  {
    id: 'linear',
    name: 'Linear',
    category: 'app',
    colors: {
      brand: '#5e6ad2',
      gray0: '#f8fafc',
      gray1: '#e8ebf5',
      gray2: '#c6cce4',
      gray3: '#98a2c4',
      gray4: '#737b97',
      gray5: '#4a5169',
      gray6: '#2f3446',
      gray7: '#1f2331',
      gray8: '#171a24',
      gray9: '#0f1117',
      accent: '#8b5cf6',
      success: '#22c55e',
      warning: '#f59e0b',
      error: '#ef4444',
      selectionBg: 'rgba(94, 106, 210, 0.24)',
      lineHighlight: '#1b1f2c',
      scrollbarThumb: '#4a5169',
      scrollbarTrack: '#171a24',
      inputBg: '#191d2a',
      dropdownBg: '#202536',
      syntaxKeyword: '#a78bfa',
      syntaxString: '#4ade80',
      syntaxNumber: '#fbbf24',
      syntaxComment: '#737b97',
      brandGradient: 'linear-gradient(135deg, #5e6ad2, #8b5cf6)',
    },
  },
  {
    id: 'figma',
    name: 'Figma',
    category: 'app',
    colors: {
      brand: '#f24e1e',
      gray0: '#fff8f6',
      gray1: '#f1e6e3',
      gray2: '#d8c3bf',
      gray3: '#b49993',
      gray4: '#8e706b',
      gray5: '#66514e',
      gray6: '#433534',
      gray7: '#2d2525',
      gray8: '#211b1c',
      gray9: '#151112',
      accent: '#a259ff',
      success: '#0acf83',
      warning: '#ffcd29',
      error: '#ff7262',
      selectionBg: 'rgba(242, 78, 30, 0.22)',
      lineHighlight: '#261d1f',
      scrollbarThumb: '#66514e',
      scrollbarTrack: '#211b1c',
      inputBg: '#271f21',
      dropdownBg: '#31282b',
      syntaxKeyword: '#a259ff',
      syntaxString: '#0acf83',
      syntaxNumber: '#ffcd29',
      syntaxComment: '#8e706b',
      brandGradient: 'linear-gradient(135deg, #f24e1e, #a259ff)',
    },
  },
  {
    id: 'notion',
    name: 'Notion Dark',
    category: 'app',
    colors: {
      brand: '#e7e5e4',
      gray0: '#fafaf9',
      gray1: '#e7e5e4',
      gray2: '#d6d3d1',
      gray3: '#a8a29e',
      gray4: '#78716c',
      gray5: '#57534e',
      gray6: '#3f3b37',
      gray7: '#2b2825',
      gray8: '#1f1d1b',
      gray9: '#151413',
      accent: '#8b5cf6',
      success: '#22c55e',
      warning: '#f59e0b',
      error: '#ef4444',
      selectionBg: 'rgba(231, 229, 228, 0.16)',
      lineHighlight: '#262321',
      scrollbarThumb: '#57534e',
      scrollbarTrack: '#1f1d1b',
      inputBg: '#252220',
      dropdownBg: '#302c29',
      syntaxKeyword: '#c4b5fd',
      syntaxString: '#86efac',
      syntaxNumber: '#fcd34d',
      syntaxComment: '#78716c',
      brandGradient: 'linear-gradient(135deg, #e7e5e4, #8b5cf6)',
    },
  },
  {
    id: 'obsidian',
    name: 'Obsidian',
    category: 'app',
    colors: {
      brand: '#7c6cff',
      gray0: '#f5f3ff',
      gray1: '#ddd6fe',
      gray2: '#c4b5fd',
      gray3: '#a78bfa',
      gray4: '#7c6c9f',
      gray5: '#5a5371',
      gray6: '#3c354c',
      gray7: '#2b2637',
      gray8: '#1f1b27',
      gray9: '#141118',
      accent: '#8b5cf6',
      success: '#34d399',
      warning: '#fbbf24',
      error: '#fb7185',
      selectionBg: 'rgba(124, 108, 255, 0.22)',
      lineHighlight: '#252031',
      scrollbarThumb: '#5a5371',
      scrollbarTrack: '#1f1b27',
      inputBg: '#241f2e',
      dropdownBg: '#2d2738',
      syntaxKeyword: '#c4b5fd',
      syntaxString: '#6ee7b7',
      syntaxNumber: '#fcd34d',
      syntaxComment: '#7c6c9f',
      brandGradient: 'linear-gradient(135deg, #7c6cff, #8b5cf6)',
    },
  },
  {
    id: 'nord',
    name: 'Nord',
    category: 'color-scheme',
    colors: {
      brand: '#88c0d0',
      gray0: '#eceff4',
      gray1: '#e5e9f0',
      gray2: '#d8dee9',
      gray3: '#a4b1c4',
      gray4: '#7b88a1',
      gray5: '#4c566a',
      gray6: '#434c5e',
      gray7: '#3b4252',
      gray8: '#2e3440',
      gray9: '#242933',
      accent: '#81a1c1',
      success: '#a3be8c',
      warning: '#ebcb8b',
      error: '#bf616a',
      secondaryAccent: '#5e81ac',
      tertiaryAccent: '#88c0d0',
      highlightAccent: '#d8dee9',
      surfaceTint: 'rgba(136, 192, 208, 0.14)',
      surfaceTintStrength: 0.14,
      panelGradient: 'linear-gradient(180deg, color-mix(in srgb, #2e3440 90%, #88c0d0), #242933)',
      borderStyle: 'solid',
      borderWidth: 1,
      motionProfile: 'calm',
      radiusScale: 'rounded',
      strokeStyle: 'subtle',
      shadowDepth: 'soft',
      glowStrength: 0.5,
      blurStrength: 5,
      selectionBg: 'rgba(136, 192, 208, 0.20)',
      lineHighlight: '#3b4252',
      scrollbarThumb: '#4c566a',
      scrollbarTrack: '#2e3440',
      syntaxKeyword: '#81a1c1',
      syntaxString: '#a3be8c',
      syntaxNumber: '#b48ead',
      syntaxComment: '#616e88',
      brandGradient: 'linear-gradient(135deg, #88c0d0, #81a1c1)',
      // Semantic - calm
      infoColor: '#88c0d0',
      mutedText: '#616e88',
      disabledOpacity: 0.45,
      // Shadow - soft
      shadowColor: 'rgba(36, 41, 51, 0.4)',
      shadowIntensity: 0.8,
      // Animation - calm
      animationCurve: 'ease-out',
      animationSpeed: 'normal',
      hoverLift: true,
    },
  },
  {
    id: 'dracula',
    name: 'Dracula',
    category: 'color-scheme',
    colors: {
      brand: '#bd93f9',
      gray0: '#f8f8f2',
      gray1: '#e6e6e0',
      gray2: '#c8c8c2',
      gray3: '#a6a6a0',
      gray4: '#7f7f7a',
      gray5: '#6272a4',
      gray6: '#44475a',
      gray7: '#383a4a',
      gray8: '#282a36',
      gray9: '#1e1f29',
      accent: '#ff79c6',
      success: '#50fa7b',
      warning: '#f1fa8c',
      error: '#ff5555',
      selectionBg: 'rgba(189, 147, 249, 0.25)',
      lineHighlight: '#44475a',
      linkUnderline: '#ff79c6',
      scrollbarThumb: '#6272a4',
      scrollbarTrack: '#282a36',
      syntaxKeyword: '#ff79c6',
      syntaxString: '#f1fa8c',
      syntaxNumber: '#bd93f9',
      syntaxComment: '#6272a4',
      brandGradient: 'linear-gradient(135deg, #bd93f9, #ff79c6)',
      // Semantic
      infoColor: '#8be9fd',
      mutedText: '#6272a4',
      disabledOpacity: 0.5,
      // Shadow - purple glow
      shadowColor: 'rgba(30, 31, 41, 0.5)',
      shadowIntensity: 1.0,
      glowColor: 'rgba(189, 147, 249, 0.25)',
      // Animation
      animationCurve: 'ease-out',
      animationSpeed: 'normal',
      hoverLift: true,
    },
  },
  // ===== Monokai Pro Family =====
  {
    id: 'monokai-pro',
    name: 'Monokai Pro',
    category: 'color-scheme',
    colors: {
      brand: '#ffd866',
      gray0: '#fcfcfa',
      gray1: '#e3e3e1',
      gray2: '#c1c0c0',
      gray3: '#939293',
      gray4: '#727072',
      gray5: '#5b595c',
      gray6: '#403e41',
      gray7: '#2d2a2e',
      gray8: '#221f22',
      gray9: '#19181a',
      accent: '#78dce8',
      success: '#a9dc76',
      warning: '#fc9867',
      error: '#ff6188',
      // Extended UI interaction colors
      selectionBg: 'rgba(252, 252, 250, 0.12)',
      selectionBorder: '#ffd866',
      focusRing: '#ffd866',
      highlightBg: 'rgba(252, 152, 103, 0.25)',
      lineHighlight: '#3e3b3f',
      linkUnderline: '#78dce8',
      bracketMatch: 'rgba(255, 216, 102, 0.25)',
      // Scrollbar
      scrollbarThumb: '#5b595c',
      scrollbarTrack: '#221f22',
      // Input/dropdown
      inputBg: '#221f22',
      dropdownBg: '#2d2a2e',
      // Syntax colors (Monokai Pro signature colors)
      syntaxKeyword: '#ff6188', // Pink
      syntaxString: '#ffd866', // Yellow
      syntaxNumber: '#ab9df2', // Purple
      syntaxComment: '#727072', // Gray
      // Premium gradient
      brandGradient: 'linear-gradient(135deg, #ffd866, #fc9867)',
      // Semantic - Monokai warm
      infoColor: '#78dce8',
      mutedText: '#727072',
      disabledOpacity: 0.45,
      // Shadow - warm glow
      shadowColor: 'rgba(25, 24, 26, 0.5)',
      shadowIntensity: 1.1,
      glowColor: 'rgba(255, 216, 102, 0.3)',
      // Animation
      animationCurve: 'ease-in-out',
      animationSpeed: 'normal',
      hoverLift: true,
    },
  },
  {
    id: 'monokai-classic',
    name: 'Monokai Classic',
    category: 'color-scheme',
    colors: {
      brand: '#e6db74',
      gray0: '#f8f8f2',
      gray1: '#e8e8e2',
      gray2: '#c8c8c2',
      gray3: '#a8a8a2',
      gray4: '#75715e',
      gray5: '#49483e',
      gray6: '#3e3d32',
      gray7: '#272822',
      gray8: '#1e1f1c',
      gray9: '#141411',
      accent: '#66d9ef',
      success: '#a6e22e',
      warning: '#fd971f',
      error: '#f92672',
      selectionBg: 'rgba(248, 248, 242, 0.10)',
      lineHighlight: '#3e3d32',
      highlightBg: 'rgba(253, 151, 31, 0.25)',
      scrollbarThumb: '#49483e',
      scrollbarTrack: '#1e1f1c',
      syntaxKeyword: '#f92672',
      syntaxString: '#e6db74',
      syntaxNumber: '#ae81ff',
      syntaxComment: '#75715e',
      brandGradient: 'linear-gradient(135deg, #e6db74, #fd971f)',
      // Semantic
      infoColor: '#66d9ef',
      mutedText: '#75715e',
      disabledOpacity: 0.45,
      // Shadow
      shadowColor: 'rgba(20, 20, 17, 0.5)',
      shadowIntensity: 1.0,
      // Animation
      animationCurve: 'ease-in-out',
      animationSpeed: 'normal',
      hoverLift: true,
    },
  },
  {
    id: 'monokai-machine',
    name: 'Monokai Machine',
    category: 'color-scheme',
    colors: {
      brand: '#ffed72',
      gray0: '#f2fffc',
      gray1: '#d4e3e0',
      gray2: '#b8c9c6',
      gray3: '#8b9798',
      gray4: '#6b7678',
      gray5: '#545f62',
      gray6: '#3a4449',
      gray7: '#273136',
      gray8: '#1d2528',
      gray9: '#141819',
      accent: '#7cd5f1',
      success: '#a2e57b',
      warning: '#ffb270',
      error: '#ff6d7e',
      selectionBg: 'rgba(124, 213, 241, 0.15)',
      lineHighlight: '#2c3a40',
      scrollbarThumb: '#545f62',
      scrollbarTrack: '#1d2528',
      syntaxKeyword: '#ff6d7e',
      syntaxString: '#ffed72',
      syntaxNumber: '#baa0f8',
      syntaxComment: '#6b7678',
      brandGradient: 'linear-gradient(135deg, #ffed72, #7cd5f1)',
    },
  },
  {
    id: 'monokai-octagon',
    name: 'Monokai Octagon',
    category: 'color-scheme',
    colors: {
      brand: '#ffd76d',
      gray0: '#eaf2f1',
      gray1: '#d0d8d7',
      gray2: '#b5bdbc',
      gray3: '#888d8b',
      gray4: '#696e6c',
      gray5: '#535957',
      gray6: '#3a3f3e',
      gray7: '#282a3a',
      gray8: '#1e1f2d',
      gray9: '#161720',
      accent: '#72cada',
      success: '#9edc74',
      warning: '#f89860',
      error: '#ff657a',
      selectionBg: 'rgba(114, 202, 218, 0.15)',
      lineHighlight: '#2f3145',
      scrollbarThumb: '#535957',
      scrollbarTrack: '#1e1f2d',
      syntaxKeyword: '#ff657a',
      syntaxString: '#ffd76d',
      syntaxNumber: '#9f8df2',
      syntaxComment: '#696e6c',
      brandGradient: 'linear-gradient(135deg, #ffd76d, #72cada)',
    },
  },
  {
    id: 'monokai-ristretto',
    name: 'Monokai Ristretto',
    category: 'color-scheme',
    colors: {
      brand: '#f9cc6c',
      gray0: '#fff8f9',
      gray1: '#f1e1e3',
      gray2: '#d8c8ca',
      gray3: '#948a8b',
      gray4: '#72696a',
      gray5: '#5b5353',
      gray6: '#403838',
      gray7: '#2c2525',
      gray8: '#211c1c',
      gray9: '#191414',
      accent: '#85dacc',
      success: '#adda78',
      warning: '#f38d70',
      error: '#fd6883',
      selectionBg: 'rgba(133, 218, 204, 0.15)',
      lineHighlight: '#352d2d',
      scrollbarThumb: '#5b5353',
      scrollbarTrack: '#211c1c',
      syntaxKeyword: '#fd6883',
      syntaxString: '#f9cc6c',
      syntaxNumber: '#a89cf2',
      syntaxComment: '#72696a',
      brandGradient: 'linear-gradient(135deg, #f9cc6c, #85dacc)',
    },
  },
  {
    id: 'monokai-spectrum',
    name: 'Monokai Spectrum',
    category: 'color-scheme',
    colors: {
      brand: '#fce566',
      gray0: '#f7f1ff',
      gray1: '#e3dcec',
      gray2: '#c8c1d1',
      gray3: '#9490a0',
      gray4: '#716f7f',
      gray5: '#565466',
      gray6: '#3d3b4d',
      gray7: '#222034',
      gray8: '#191825',
      gray9: '#0f0e17',
      accent: '#7cd5f1',
      success: '#9bdc76',
      warning: '#fc9867',
      error: '#fc618d',
      selectionBg: 'rgba(124, 213, 241, 0.15)',
      lineHighlight: '#2a283c',
      scrollbarThumb: '#565466',
      scrollbarTrack: '#191825',
      syntaxKeyword: '#fc618d',
      syntaxString: '#fce566',
      syntaxNumber: '#ab9df2',
      syntaxComment: '#716f7f',
      brandGradient: 'linear-gradient(135deg, #fce566, #fc618d)',
      // Semantic
      infoColor: '#7cd5f1',
      mutedText: '#716f7f',
      disabledOpacity: 0.45,
      // Shadow
      shadowColor: 'rgba(15, 14, 23, 0.5)',
      shadowIntensity: 1.0,
      // Animation
      animationCurve: 'ease-in-out',
      animationSpeed: 'normal',
      hoverLift: true,
    },
  },
  {
    id: 'rosepine',
    name: 'Rosé Pine',
    category: 'color-scheme',
    colors: {
      brand: '#c4a7e7',
      gray0: '#f0eef8',
      gray1: '#e4e0f0',
      gray2: '#908caa',
      gray3: '#6e6a86',
      gray4: '#555169',
      gray5: '#403d52',
      gray6: '#2a273f',
      gray7: '#21202e',
      gray8: '#1f1d2e',
      gray9: '#191724',
      accent: '#ebbcba',
      success: '#9ccfd8',
      warning: '#f6c177',
      error: '#eb6f92',
      selectionBg: 'rgba(196, 167, 231, 0.20)',
      lineHighlight: '#26233a',
      linkUnderline: '#ebbcba',
      scrollbarThumb: '#403d52',
      scrollbarTrack: '#1f1d2e',
      syntaxKeyword: '#eb6f92',
      syntaxString: '#f6c177',
      syntaxNumber: '#c4a7e7',
      syntaxComment: '#6e6a86',
      brandGradient: 'linear-gradient(135deg, #c4a7e7, #ebbcba)',
      // Semantic - dreamy
      infoColor: '#9ccfd8',
      mutedText: '#6e6a86',
      disabledOpacity: 0.5,
      // Shadow - subtle rose glow
      shadowColor: 'rgba(25, 23, 36, 0.45)',
      shadowIntensity: 0.9,
      glowColor: 'rgba(196, 167, 231, 0.2)',
      // Animation - smooth
      animationCurve: 'ease-in-out',
      animationSpeed: 'normal',
      hoverLift: true,
    },
  },
  {
    id: 'catppuccin',
    name: 'Catppuccin Mocha',
    category: 'color-scheme',
    colors: {
      brand: '#cba6f7',
      gray0: '#e8ecfa',
      gray1: '#d8dcea',
      gray2: '#a6adc8',
      gray3: '#9399b2',
      gray4: '#7f849c',
      gray5: '#585b70',
      gray6: '#45475a',
      gray7: '#313244',
      gray8: '#1e1e2e',
      gray9: '#11111b',
      accent: '#89b4fa',
      success: '#a6e3a1',
      warning: '#f9e2af',
      error: '#f38ba8',
      selectionBg: 'rgba(203, 166, 247, 0.20)',
      lineHighlight: '#313244',
      linkUnderline: '#89b4fa',
      scrollbarThumb: '#585b70',
      scrollbarTrack: '#1e1e2e',
      syntaxKeyword: '#f38ba8',
      syntaxString: '#a6e3a1',
      syntaxNumber: '#fab387',
      syntaxComment: '#6c7086',
      brandGradient: 'linear-gradient(135deg, #cba6f7, #89b4fa)',
      // Semantic - pastel
      infoColor: '#89b4fa',
      mutedText: '#6c7086',
      disabledOpacity: 0.4,
      // Shadow - subtle purple glow
      shadowColor: 'rgba(17, 17, 27, 0.45)',
      shadowIntensity: 0.9,
      glowColor: 'rgba(203, 166, 247, 0.2)',
      // Animation
      animationCurve: 'ease-out',
      animationSpeed: 'normal',
      hoverLift: true,
    },
  },
  {
    id: 'catppuccin-latte',
    name: 'Catppuccin Latte',
    category: 'color-scheme',
    colors: {
      brand: '#8839ef',
      gray0: '#4c4f69',
      gray1: '#5c5f77',
      gray2: '#6c6f85',
      gray3: '#7c7f93',
      gray4: '#8c8fa1',
      gray5: '#acb0be',
      gray6: '#bcc0cc',
      gray7: '#ccd0da',
      gray8: '#e6e9ef',
      gray9: '#eff1f5',
      accent: '#1e66f5',
      success: '#40a02b',
      warning: '#df8e1d',
      error: '#d20f39',
      selectionBg: 'rgba(136, 57, 239, 0.20)',
      lineHighlight: '#ccd0da',
      linkUnderline: '#1e66f5',
      scrollbarThumb: '#acb0be',
      scrollbarTrack: '#e6e9ef',
      inputBg: '#e6e9ef',
      dropdownBg: '#ccd0da',
      syntaxKeyword: '#d20f39',
      syntaxString: '#40a02b',
      syntaxNumber: '#fe640b',
      syntaxComment: '#9ca0b0',
      brandGradient: 'linear-gradient(135deg, #8839ef, #1e66f5)',
      infoColor: '#1e66f5',
      mutedText: '#9ca0b0',
      disabledOpacity: 0.4,
      shadowColor: 'rgba(76, 79, 105, 0.15)',
      shadowIntensity: 0.7,
      glowColor: 'rgba(136, 57, 239, 0.15)',
      animationCurve: 'ease-out',
      animationSpeed: 'normal',
      hoverLift: true,
    },
  },
  {
    id: 'catppuccin-frappe',
    name: 'Catppuccin Frappé',
    category: 'color-scheme',
    colors: {
      brand: '#ca9ee6',
      gray0: '#e2e6f8',
      gray1: '#d4d8ec',
      gray2: '#a5adce',
      gray3: '#949cbb',
      gray4: '#838ba7',
      gray5: '#626880',
      gray6: '#51576d',
      gray7: '#414559',
      gray8: '#303446',
      gray9: '#232634',
      accent: '#8caaee',
      success: '#a6d189',
      warning: '#e5c890',
      error: '#e78284',
      selectionBg: 'rgba(202, 158, 230, 0.20)',
      lineHighlight: '#414559',
      linkUnderline: '#8caaee',
      scrollbarThumb: '#626880',
      scrollbarTrack: '#303446',
      inputBg: '#303446',
      dropdownBg: '#414559',
      syntaxKeyword: '#e78284',
      syntaxString: '#a6d189',
      syntaxNumber: '#ef9f76',
      syntaxComment: '#737994',
      brandGradient: 'linear-gradient(135deg, #ca9ee6, #8caaee)',
      infoColor: '#8caaee',
      mutedText: '#737994',
      disabledOpacity: 0.4,
      shadowColor: 'rgba(35, 38, 52, 0.45)',
      shadowIntensity: 0.9,
      glowColor: 'rgba(202, 158, 230, 0.2)',
      animationCurve: 'ease-out',
      animationSpeed: 'normal',
      hoverLift: true,
    },
  },
  {
    id: 'catppuccin-macchiato',
    name: 'Catppuccin Macchiato',
    category: 'color-scheme',
    colors: {
      brand: '#c6a0f6',
      gray0: '#e5e9f8',
      gray1: '#d5d9ec',
      gray2: '#a5adcb',
      gray3: '#939ab7',
      gray4: '#8087a2',
      gray5: '#5b6078',
      gray6: '#494d64',
      gray7: '#363a4f',
      gray8: '#24273a',
      gray9: '#181926',
      accent: '#8aadf4',
      success: '#a6da95',
      warning: '#eed49f',
      error: '#ed8796',
      selectionBg: 'rgba(198, 160, 246, 0.20)',
      lineHighlight: '#363a4f',
      linkUnderline: '#8aadf4',
      scrollbarThumb: '#5b6078',
      scrollbarTrack: '#24273a',
      inputBg: '#24273a',
      dropdownBg: '#363a4f',
      syntaxKeyword: '#ed8796',
      syntaxString: '#a6da95',
      syntaxNumber: '#f5a97f',
      syntaxComment: '#6e738d',
      brandGradient: 'linear-gradient(135deg, #c6a0f6, #8aadf4)',
      infoColor: '#8aadf4',
      mutedText: '#6e738d',
      disabledOpacity: 0.4,
      shadowColor: 'rgba(24, 25, 38, 0.45)',
      shadowIntensity: 0.9,
      glowColor: 'rgba(198, 160, 246, 0.2)',
      animationCurve: 'ease-out',
      animationSpeed: 'normal',
      hoverLift: true,
    },
  },
  {
    id: 'gruvbox',
    name: 'Gruvbox Dark',
    category: 'color-scheme',
    colors: {
      brand: '#d79921',
      gray0: '#f5eed8',
      gray1: '#e8dfc8',
      gray2: '#bdae93',
      gray3: '#a89984',
      gray4: '#928374',
      gray5: '#665c54',
      gray6: '#504945',
      gray7: '#3c3836',
      gray8: '#282828',
      gray9: '#1d2021',
      accent: '#83a598',
      success: '#b8bb26',
      warning: '#fabd2f',
      error: '#fb4934',
      selectionBg: 'rgba(215, 153, 33, 0.25)',
      lineHighlight: '#3c3836',
      linkUnderline: '#83a598',
      scrollbarThumb: '#665c54',
      scrollbarTrack: '#282828',
      syntaxKeyword: '#fb4934',
      syntaxString: '#b8bb26',
      syntaxNumber: '#d3869b',
      syntaxComment: '#928374',
      brandGradient: 'linear-gradient(135deg, #d79921, #fabd2f)',
      // Semantic - warm retro
      infoColor: '#83a598',
      mutedText: '#928374',
      disabledOpacity: 0.45,
      // Shadow - warm brown
      shadowColor: 'rgba(29, 32, 33, 0.5)',
      shadowIntensity: 1.0,
      // Animation
      animationCurve: 'ease-in-out',
      animationSpeed: 'normal',
      hoverLift: true,
    },
  },
  // ===== Bonus Themes =====
  {
    id: 'ayu',
    name: 'Ayu Mirage',
    category: 'color-scheme',
    colors: {
      brand: '#ffcc66',
      gray0: '#ffffff',
      gray1: '#e8e8e8',
      gray2: '#d0d0d0',
      gray3: '#a0a098',
      gray4: '#707068',
      gray5: '#4d5566',
      gray6: '#3d424d',
      gray7: '#2a2e38',
      gray8: '#1f2430',
      gray9: '#171b24',
      accent: '#73d0ff',
      success: '#bae67e',
      warning: '#ffcc66',
      error: '#ff6666',
      selectionBg: 'rgba(255, 204, 102, 0.20)',
      lineHighlight: '#242936',
      scrollbarThumb: '#4d5566',
      scrollbarTrack: '#1f2430',
      syntaxKeyword: '#ffa759',
      syntaxString: '#bae67e',
      syntaxNumber: '#ffcc66',
      syntaxComment: '#5c6773',
      brandGradient: 'linear-gradient(135deg, #ffcc66, #73d0ff)',
      // Semantic - warm
      infoColor: '#73d0ff',
      mutedText: '#5c6773',
      disabledOpacity: 0.45,
      // Shadow
      shadowColor: 'rgba(23, 27, 36, 0.45)',
      shadowIntensity: 1.0,
      // Animation
      animationCurve: 'ease-out',
      animationSpeed: 'normal',
      hoverLift: true,
    },
  },
  {
    id: 'onedark',
    name: 'One Dark Pro',
    category: 'color-scheme',
    colors: {
      brand: '#61afef',
      gray0: '#d4d8e4',
      gray1: '#c8ccd8',
      gray2: '#8b939e',
      gray3: '#747d8c',
      gray4: '#636e7b',
      gray5: '#4b5363',
      gray6: '#3e4451',
      gray7: '#2c313c',
      gray8: '#21252b',
      gray9: '#181a1f',
      accent: '#98c379',
      success: '#98c379',
      warning: '#e5c07b',
      error: '#e06c75',
      selectionBg: 'rgba(97, 175, 239, 0.20)',
      lineHighlight: '#2c313c',
      scrollbarThumb: '#4b5363',
      scrollbarTrack: '#21252b',
      syntaxKeyword: '#c678dd',
      syntaxString: '#98c379',
      syntaxNumber: '#d19a66',
      syntaxComment: '#5c6370',
      brandGradient: 'linear-gradient(135deg, #61afef, #98c379)',
    },
  },
  {
    id: 'synthwave',
    name: 'Synthwave 84',
    category: 'color-scheme',
    colors: {
      brand: '#ff7edb',
      gray0: '#ffffff',
      gray1: '#e0e0e0',
      gray2: '#bbbbbb',
      gray3: '#888888',
      gray4: '#666666',
      gray5: '#495495',
      gray6: '#34294f',
      gray7: '#2a2139',
      gray8: '#241b2f',
      gray9: '#1a1227',
      accent: '#72f1b8',
      success: '#72f1b8',
      warning: '#f97e72',
      error: '#fe4450',
      selectionBg: 'rgba(255, 126, 219, 0.25)',
      lineHighlight: '#2a2139',
      scrollbarThumb: '#495495',
      scrollbarTrack: '#241b2f',
      syntaxKeyword: '#ff7edb',
      syntaxString: '#72f1b8',
      syntaxNumber: '#f97e72',
      syntaxComment: '#848bbd',
      brandGradient: 'linear-gradient(135deg, #ff7edb, #72f1b8)',
      // Semantic
      infoColor: '#72f1b8',
      mutedText: '#848bbd',
      disabledOpacity: 0.5,
      // Shadow with glow
      shadowColor: 'rgba(26, 18, 39, 0.6)',
      shadowIntensity: 1.2,
      glowColor: 'rgba(255, 126, 219, 0.35)',
      // Animation - bouncy
      animationCurve: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
      animationSpeed: 'normal',
      hoverLift: true,
    },
  },
  // ===== New Themes =====
  {
    id: 'sunset',
    name: 'Sunset Warm',
    category: 'aesthetic',
    colors: {
      brand: '#f97316',
      gray0: '#fef7f0',
      gray1: '#fed7aa',
      gray2: '#fdba74',
      gray3: '#c4a38a',
      gray4: '#9a7d6a',
      gray5: '#6b5344',
      gray6: '#4a3728',
      gray7: '#3d2e22',
      gray8: '#2a1f17',
      gray9: '#1a1410',
      accent: '#fb923c',
      success: '#84cc16',
      warning: '#fbbf24',
      error: '#dc2626',
      selectionBg: 'rgba(249, 115, 22, 0.25)',
      lineHighlight: '#332517',
      scrollbarThumb: '#6b5344',
      scrollbarTrack: '#2a1f17',
      syntaxKeyword: '#fb923c',
      syntaxString: '#84cc16',
      syntaxNumber: '#fbbf24',
      syntaxComment: '#9a7d6a',
      brandGradient: 'linear-gradient(135deg, #f97316, #fbbf24)',
      // Semantic - warm sunset
      infoColor: '#fb923c',
      mutedText: '#9a7d6a',
      disabledOpacity: 0.45,
      // Shadow - warm orange
      shadowColor: 'rgba(26, 20, 16, 0.5)',
      shadowIntensity: 1.0,
      glowColor: 'rgba(249, 115, 22, 0.25)',
      // Animation
      animationCurve: 'ease-in-out',
      animationSpeed: 'normal',
      hoverLift: true,
    },
  },
  {
    id: 'monochrome',
    name: 'Monochrome',
    category: 'minimal',
    colors: {
      brand: '#a1a1aa',
      gray0: '#fafafa',
      gray1: '#f4f4f5',
      gray2: '#e4e4e7',
      gray3: '#a1a1aa',
      gray4: '#71717a',
      gray5: '#52525b',
      gray6: '#3f3f46',
      gray7: '#27272a',
      gray8: '#18181b',
      gray9: '#09090b',
      accent: '#71717a',
      success: '#52525b',
      warning: '#a1a1aa',
      error: '#3f3f46',
      selectionBg: 'rgba(161, 161, 170, 0.20)',
      lineHighlight: '#27272a',
      scrollbarThumb: '#52525b',
      scrollbarTrack: '#18181b',
      syntaxKeyword: '#a1a1aa',
      syntaxString: '#d4d4d8',
      syntaxNumber: '#e4e4e7',
      syntaxComment: '#71717a',
      brandGradient: 'linear-gradient(135deg, #a1a1aa, #71717a)',
      // Semantic - minimal
      infoColor: '#a1a1aa',
      mutedText: '#71717a',
      disabledOpacity: 0.35,
      // Shadow - subtle
      shadowColor: 'rgba(0, 0, 0, 0.3)',
      shadowIntensity: 0.7,
      // Animation - fast, no-frills
      animationCurve: 'ease',
      animationSpeed: 'fast',
      hoverLift: false,
    },
  },
  {
    id: 'highcontrast',
    name: 'High Contrast',
    category: 'minimal',
    colors: {
      brand: '#fbbf24',
      gray0: '#ffffff',
      gray1: '#ffffff',
      gray2: '#fafafa',
      gray3: '#d4d4d4',
      gray4: '#737373',
      gray5: '#525252',
      gray6: '#262626',
      gray7: '#171717',
      gray8: '#0a0a0a',
      gray9: '#000000',
      accent: '#22d3ee',
      success: '#22c55e',
      warning: '#fbbf24',
      error: '#ef4444',
      selectionBg: 'rgba(251, 191, 36, 0.30)',
      lineHighlight: '#171717',
      scrollbarThumb: '#fbbf24',
      scrollbarTrack: '#0a0a0a',
      syntaxKeyword: '#22d3ee',
      syntaxString: '#22c55e',
      syntaxNumber: '#fbbf24',
      syntaxComment: '#737373',
      brandGradient: 'linear-gradient(135deg, #fbbf24, #22d3ee)',
      // Semantic - high contrast
      infoColor: '#22d3ee',
      mutedText: '#737373',
      disabledOpacity: 0.5,
      // Shadow - sharp
      shadowColor: 'rgba(0, 0, 0, 0.7)',
      shadowIntensity: 1.5,
      glowColor: 'rgba(251, 191, 36, 0.3)',
      // Animation - fast, accessible
      animationCurve: 'linear',
      animationSpeed: 'fast',
      hoverLift: false,
    },
  },
  // ===== Additional Themes =====
  {
    id: 'hollowknight',
    name: 'Hollow Knight',
    category: 'aesthetic',
    colors: {
      brand: '#ffffff',
      gray0: '#d4e0ed',
      gray1: '#b8c9dc',
      gray2: '#9ab0c7',
      gray3: '#7090a8',
      gray4: '#5a7a94',
      gray5: '#3d5a70',
      gray6: '#2a4258',
      gray7: '#1e3245',
      gray8: '#142535',
      gray9: '#0a1520',
      accent: '#7ec8e3',
      success: '#8fdfaa',
      warning: '#ffd86b',
      error: '#ff6b6b',
      selectionBg: 'rgba(126, 200, 227, 0.25)',
      lineHighlight: '#1a2a3a',
      scrollbarThumb: '#3d5a70',
      scrollbarTrack: '#142535',
      syntaxKeyword: '#7ec8e3',
      syntaxString: '#8fdfaa',
      syntaxNumber: '#ffd86b',
      syntaxComment: '#5a7a94',
      brandGradient: 'linear-gradient(135deg, #7ec8e3, #ffffff)',
      // Semantic - mystical
      infoColor: '#7ec8e3',
      mutedText: '#5a7a94',
      disabledOpacity: 0.45,
      // Shadow - deep blue glow
      shadowColor: 'rgba(10, 21, 32, 0.5)',
      shadowIntensity: 1.0,
      glowColor: 'rgba(126, 200, 227, 0.25)',
      // Animation - smooth
      animationCurve: 'ease-out',
      animationSpeed: 'normal',
      hoverLift: true,
    },
  },
  {
    id: 'everforest',
    name: 'Everforest',
    category: 'color-scheme',
    colors: {
      brand: '#a7c080',
      gray0: '#d3c6aa',
      gray1: '#c5b99a',
      gray2: '#b5a98a',
      gray3: '#859289',
      gray4: '#657a6e',
      gray5: '#4f5d53',
      gray6: '#3d4841',
      gray7: '#323d35',
      gray8: '#272e2a',
      gray9: '#1e2321',
      accent: '#7fbbb3',
      success: '#a7c080',
      warning: '#dbbc7f',
      error: '#e67e80',
      selectionBg: 'rgba(167, 192, 128, 0.20)',
      lineHighlight: '#2d352f',
      scrollbarThumb: '#4f5d53',
      scrollbarTrack: '#272e2a',
      syntaxKeyword: '#e67e80',
      syntaxString: '#a7c080',
      syntaxNumber: '#d699b6',
      syntaxComment: '#859289',
      brandGradient: 'linear-gradient(135deg, #a7c080, #7fbbb3)',
      // Semantic - natural
      infoColor: '#7fbbb3',
      mutedText: '#859289',
      disabledOpacity: 0.45,
      // Shadow - soft green
      shadowColor: 'rgba(30, 35, 33, 0.4)',
      shadowIntensity: 0.8,
      // Animation - calm, slow
      animationCurve: 'ease-in-out',
      animationSpeed: 'slow',
      hoverLift: true,
    },
  },
  {
    id: 'palenight',
    name: 'Material Palenight',
    category: 'color-scheme',
    colors: {
      brand: '#c792ea',
      gray0: '#ffffff',
      gray1: '#e0e0e0',
      gray2: '#bfc7d5',
      gray3: '#a6accd',
      gray4: '#717cb4',
      gray5: '#676e95',
      gray6: '#444267',
      gray7: '#32374c',
      gray8: '#292d3e',
      gray9: '#1e2132',
      accent: '#82aaff',
      success: '#c3e88d',
      warning: '#ffcb6b',
      error: '#ff5370',
      selectionBg: 'rgba(199, 146, 234, 0.25)',
      lineHighlight: '#32374c',
      scrollbarThumb: '#676e95',
      scrollbarTrack: '#292d3e',
      syntaxKeyword: '#c792ea',
      syntaxString: '#c3e88d',
      syntaxNumber: '#f78c6c',
      syntaxComment: '#676e95',
      brandGradient: 'linear-gradient(135deg, #c792ea, #82aaff)',
      // Semantic - gentle purple
      infoColor: '#82aaff',
      mutedText: '#676e95',
      disabledOpacity: 0.45,
      // Shadow - subtle purple glow
      shadowColor: 'rgba(30, 33, 50, 0.45)',
      shadowIntensity: 1.0,
      glowColor: 'rgba(199, 146, 234, 0.2)',
      // Animation
      animationCurve: 'ease-out',
      animationSpeed: 'normal',
      hoverLift: true,
    },
  },
  {
    id: 'tokyonight',
    name: 'Tokyo Night',
    category: 'color-scheme',
    colors: {
      brand: '#7aa2f7',
      gray0: '#c0caf5',
      gray1: '#a9b1d6',
      gray2: '#9aa5ce',
      gray3: '#787c99',
      gray4: '#565f89',
      gray5: '#414868',
      gray6: '#343a52',
      gray7: '#24283b',
      gray8: '#1a1b26',
      gray9: '#13141c',
      accent: '#bb9af7',
      success: '#9ece6a',
      warning: '#e0af68',
      error: '#f7768e',
      selectionBg: 'rgba(122, 162, 247, 0.20)',
      lineHighlight: '#292e42',
      linkUnderline: '#bb9af7',
      scrollbarThumb: '#414868',
      scrollbarTrack: '#1a1b26',
      syntaxKeyword: '#bb9af7',
      syntaxString: '#9ece6a',
      syntaxNumber: '#ff9e64',
      syntaxComment: '#565f89',
      brandGradient: 'linear-gradient(135deg, #7aa2f7, #bb9af7)',
    },
  },
  {
    id: 'horizon',
    name: 'Horizon',
    category: 'color-scheme',
    colors: {
      brand: '#e95678',
      gray0: '#fdf0ed',
      gray1: '#fadad1',
      gray2: '#d5d4d6',
      gray3: '#9b9fa6',
      gray4: '#6c6f93',
      gray5: '#45474f',
      gray6: '#323542',
      gray7: '#272a36',
      gray8: '#1c1e26',
      gray9: '#16161c',
      accent: '#fab795',
      success: '#29d398',
      warning: '#fac29a',
      error: '#e95678',
      selectionBg: 'rgba(233, 86, 120, 0.25)',
      lineHighlight: '#21242e',
      scrollbarThumb: '#45474f',
      scrollbarTrack: '#1c1e26',
      syntaxKeyword: '#e95678',
      syntaxString: '#29d398',
      syntaxNumber: '#fab795',
      syntaxComment: '#6c6f93',
      brandGradient: 'linear-gradient(135deg, #e95678, #fab795)',
    },
  },
  {
    id: 'cobalt2',
    name: 'Cobalt 2',
    category: 'color-scheme',
    colors: {
      brand: '#ffc600',
      gray0: '#ffffff',
      gray1: '#e1efff',
      gray2: '#aabdd4',
      gray3: '#7f9db8',
      gray4: '#5f7e97',
      gray5: '#4a647b',
      gray6: '#234e6d',
      gray7: '#193549',
      gray8: '#122738',
      gray9: '#0d1c2a',
      accent: '#ff9d00',
      success: '#3ad900',
      warning: '#ffc600',
      error: '#ff628c',
      selectionBg: 'rgba(255, 198, 0, 0.25)',
      lineHighlight: '#1a3a50',
      scrollbarThumb: '#4a647b',
      scrollbarTrack: '#122738',
      syntaxKeyword: '#ff9d00',
      syntaxString: '#3ad900',
      syntaxNumber: '#ff628c',
      syntaxComment: '#5f7e97',
      brandGradient: 'linear-gradient(135deg, #ffc600, #ff9d00)',
    },
  },
  {
    id: 'draculapro',
    name: 'Dracula Pro',
    category: 'color-scheme',
    colors: {
      brand: '#ff79c6',
      gray0: '#f8f8f2',
      gray1: '#e9e9e4',
      gray2: '#d0d0cb',
      gray3: '#a0a098',
      gray4: '#7a7a72',
      gray5: '#5a5a54',
      gray6: '#414145',
      gray7: '#2d2f37',
      gray8: '#22212c',
      gray9: '#191a21',
      accent: '#bd93f9',
      success: '#50fa7b',
      warning: '#ffb86c',
      error: '#ff5555',
      selectionBg: 'rgba(255, 121, 198, 0.25)',
      lineHighlight: '#2d2f37',
      scrollbarThumb: '#5a5a54',
      scrollbarTrack: '#22212c',
      syntaxKeyword: '#ff79c6',
      syntaxString: '#f1fa8c',
      syntaxNumber: '#bd93f9',
      syntaxComment: '#6272a4',
      brandGradient: 'linear-gradient(135deg, #ff79c6, #bd93f9)',
    },
  },
  {
    id: 'poimandres',
    name: 'Poimandres',
    category: 'color-scheme',
    colors: {
      brand: '#5de4c7',
      gray0: '#e4f0fb',
      gray1: '#c8d4e8',
      gray2: '#a6b2c9',
      gray3: '#7a89a1',
      gray4: '#586d8c',
      gray5: '#3d4f67',
      gray6: '#303b52',
      gray7: '#252b37',
      gray8: '#1b1e28',
      gray9: '#14161e',
      accent: '#91b4d5',
      success: '#5de4c7',
      warning: '#fffac2',
      error: '#d0679d',
      selectionBg: 'rgba(93, 228, 199, 0.20)',
      lineHighlight: '#252b37',
      scrollbarThumb: '#3d4f67',
      scrollbarTrack: '#1b1e28',
      syntaxKeyword: '#a6accd',
      syntaxString: '#5de4c7',
      syntaxNumber: '#add7ff',
      syntaxComment: '#586d8c',
      brandGradient: 'linear-gradient(135deg, #5de4c7, #91b4d5)',
    },
  },
  {
    id: 'vesper',
    name: 'Vesper',
    category: 'color-scheme',
    colors: {
      brand: '#ffc799',
      gray0: '#ffffff',
      gray1: '#e8e8e8',
      gray2: '#c0c0c0',
      gray3: '#999999',
      gray4: '#666666',
      gray5: '#454545',
      gray6: '#333333',
      gray7: '#222222',
      gray8: '#181818',
      gray9: '#101010',
      accent: '#a6e3e9',
      success: '#b8e986',
      warning: '#ffd580',
      error: '#ff8080',
      selectionBg: 'rgba(255, 199, 153, 0.25)',
      lineHighlight: '#1e1e1e',
      scrollbarThumb: '#454545',
      scrollbarTrack: '#181818',
      syntaxKeyword: '#ffc799',
      syntaxString: '#b8e986',
      syntaxNumber: '#a6e3e9',
      syntaxComment: '#666666',
      brandGradient: 'linear-gradient(135deg, #ffc799, #a6e3e9)',
    },
  },
  {
    id: 'kanagawa',
    name: 'Kanagawa',
    category: 'color-scheme',
    colors: {
      brand: '#7e9cd8',
      gray0: '#dcd7ba',
      gray1: '#c8c3a6',
      gray2: '#a8a28b',
      gray3: '#727169',
      gray4: '#54546d',
      gray5: '#3d3d56',
      gray6: '#2d2d3f',
      gray7: '#252535',
      gray8: '#1f1f28',
      gray9: '#16161d',
      accent: '#957fb8',
      success: '#98bb6c',
      warning: '#e6c384',
      error: '#ff5d62',
      selectionBg: 'rgba(126, 156, 216, 0.25)',
      lineHighlight: '#2a2a37',
      scrollbarThumb: '#3d3d56',
      scrollbarTrack: '#1f1f28',
      syntaxKeyword: '#957fb8',
      syntaxString: '#98bb6c',
      syntaxNumber: '#d27e99',
      syntaxComment: '#727169',
      brandGradient: 'linear-gradient(135deg, #7e9cd8, #957fb8)',
    },
  },
  // ===== IDE & Editor Themes =====
  {
    id: 'atom-onedark',
    name: 'Atom One Dark',
    category: 'editor',
    colors: {
      brand: '#528bff',
      gray0: '#ffffff',
      gray1: '#abb2bf',
      gray2: '#9da5b4',
      gray3: '#7f848e',
      gray4: '#636d83',
      gray5: '#4b5263',
      gray6: '#3e4451',
      gray7: '#2c313c',
      gray8: '#21252b',
      gray9: '#181a1f',
      accent: '#61afef',
      success: '#98c379',
      warning: '#e5c07b',
      error: '#e06c75',
      selectionBg: 'rgba(82, 139, 255, 0.25)',
      lineHighlight: '#2c313c',
      scrollbarThumb: '#4b5263',
      scrollbarTrack: '#21252b',
      syntaxKeyword: '#c678dd',
      syntaxString: '#98c379',
      syntaxNumber: '#d19a66',
      syntaxComment: '#5c6370',
      brandGradient: 'linear-gradient(135deg, #528bff, #61afef)',
    },
  },
  {
    id: 'jetbrains-darcula',
    name: 'JetBrains Darcula',
    category: 'editor',
    colors: {
      brand: '#cc7832',
      gray0: '#ffffff',
      gray1: '#bbbbbb',
      gray2: '#a9b7c6',
      gray3: '#808080',
      gray4: '#606060',
      gray5: '#4e5254',
      gray6: '#3c3f41',
      gray7: '#313335',
      gray8: '#2b2b2b',
      gray9: '#1e1e1e',
      accent: '#6897bb',
      success: '#6a8759',
      warning: '#ffc66d',
      error: '#ff6b68',
    },
  },
  {
    id: 'jetbrains-light',
    name: 'JetBrains Light',
    category: 'editor',
    colors: {
      brand: '#4a86c7',
      gray0: '#000000',
      gray1: '#1a1a1a',
      gray2: '#333333',
      gray3: '#606060',
      gray4: '#909090',
      gray5: '#b0b0b0',
      gray6: '#d4d4d4',
      gray7: '#e8e8e8',
      gray8: '#f5f5f5',
      gray9: '#ffffff',
      accent: '#00627a',
      success: '#067d17',
      warning: '#9e880d',
      error: '#cf5b56',
    },
  },
  {
    id: 'sublime-mariana',
    name: 'Sublime Mariana',
    category: 'editor',
    colors: {
      brand: '#6699cc',
      gray0: '#ffffff',
      gray1: '#d8dee9',
      gray2: '#a6accd',
      gray3: '#8b939c',
      gray4: '#6d7782',
      gray5: '#47526d',
      gray6: '#3d4455',
      gray7: '#303841',
      gray8: '#272b33',
      gray9: '#1c1f26',
      accent: '#5fb3b3',
      success: '#99c794',
      warning: '#fac863',
      error: '#ec5f67',
    },
  },
  {
    id: 'webstorm',
    name: 'WebStorm',
    category: 'editor',
    colors: {
      brand: '#07c3f2',
      gray0: '#ffffff',
      gray1: '#c5c5c5',
      gray2: '#a9b7c6',
      gray3: '#7a8a99',
      gray4: '#5c6773',
      gray5: '#4c5259',
      gray6: '#3c3f41',
      gray7: '#2d2f31',
      gray8: '#1e1f22',
      gray9: '#161719',
      accent: '#07c3f2',
      success: '#59a869',
      warning: '#d9c767',
      error: '#f75464',
    },
  },
  {
    id: 'pycharm',
    name: 'PyCharm',
    category: 'editor',
    colors: {
      brand: '#21d789',
      gray0: '#ffffff',
      gray1: '#c5c5c5',
      gray2: '#a9b7c6',
      gray3: '#7a8a99',
      gray4: '#5c6773',
      gray5: '#4c5259',
      gray6: '#3c3f41',
      gray7: '#2d2f31',
      gray8: '#1e1f22',
      gray9: '#161719',
      accent: '#21d789',
      success: '#59a869',
      warning: '#d9c767',
      error: '#f75464',
    },
  },
  {
    id: 'eclipse-dark',
    name: 'Eclipse Dark',
    category: 'editor',
    colors: {
      brand: '#a082bd',
      gray0: '#ffffff',
      gray1: '#e0e0e0',
      gray2: '#b0b0b0',
      gray3: '#808080',
      gray4: '#606060',
      gray5: '#454545',
      gray6: '#383838',
      gray7: '#2d2d2d',
      gray8: '#222222',
      gray9: '#1a1a1a',
      accent: '#569cd6',
      success: '#57a64a',
      warning: '#dcdcaa',
      error: '#ff5555',
    },
  },
  {
    id: 'notepadpp-dark',
    name: 'Notepad++ Dark',
    category: 'editor',
    colors: {
      brand: '#80d4aa',
      gray0: '#d4d4d4',
      gray1: '#bfbfbf',
      gray2: '#a0a0a0',
      gray3: '#808080',
      gray4: '#606060',
      gray5: '#484848',
      gray6: '#383838',
      gray7: '#2d2d2d',
      gray8: '#1e1e1e',
      gray9: '#151515',
      accent: '#569cd6',
      success: '#6a9955',
      warning: '#d7ba7d',
      error: '#f44747',
    },
  },
  {
    id: 'vim-solarized',
    name: 'Vim Solarized Dark',
    category: 'editor',
    colors: {
      brand: '#268bd2',
      gray0: '#fdf6e3',
      gray1: '#eee8d5',
      gray2: '#93a1a1',
      gray3: '#839496',
      gray4: '#657b83',
      gray5: '#586e75',
      gray6: '#073642',
      gray7: '#002b36',
      gray8: '#001f27',
      gray9: '#00141a',
      accent: '#2aa198',
      success: '#859900',
      warning: '#b58900',
      error: '#dc322f',
    },
  },
  {
    id: 'emacs-zenburn',
    name: 'Emacs Zenburn',
    category: 'editor',
    colors: {
      brand: '#f0dfaf',
      gray0: '#dcdccc',
      gray1: '#c5c5b5',
      gray2: '#a0a090',
      gray3: '#7f7f6f',
      gray4: '#5f5f5f',
      gray5: '#4f4f4f',
      gray6: '#3f3f3f',
      gray7: '#333333',
      gray8: '#2a2a2a',
      gray9: '#1f1f1f',
      accent: '#8cd0d3',
      success: '#7f9f7f',
      warning: '#dfaf8f',
      error: '#cc9393',
    },
  },
  {
    id: 'zed-night',
    name: 'Zed Night',
    category: 'editor',
    colors: {
      brand: '#7d7aff',
      gray0: '#f4f7fb',
      gray1: '#dce4ee',
      gray2: '#b8c4d6',
      gray3: '#8d9ab0',
      gray4: '#68748b',
      gray5: '#475166',
      gray6: '#31394a',
      gray7: '#222836',
      gray8: '#171b26',
      gray9: '#0f1219',
      accent: '#34c8ff',
      success: '#3dd68c',
      warning: '#ffbe5c',
      error: '#ff6b81',
      selectionBg: 'rgba(125, 122, 255, 0.2)',
      lineHighlight: '#1e2430',
      focusRing: '#34c8ff',
      scrollbarThumb: '#475166',
      scrollbarTrack: '#171b26',
      inputBg: '#1d2230',
      dropdownBg: '#252c3b',
      syntaxKeyword: '#c084fc',
      syntaxString: '#4ade80',
      syntaxNumber: '#ffbe5c',
      syntaxComment: '#68748b',
      brandGradient: 'linear-gradient(135deg, #7d7aff, #34c8ff)',
    },
  },
  {
    id: 'fleet-dark',
    name: 'Fleet Dark',
    category: 'editor',
    colors: {
      brand: '#8b7dff',
      gray0: '#f7f7fb',
      gray1: '#dddff1',
      gray2: '#bec4dc',
      gray3: '#9199b5',
      gray4: '#6c7390',
      gray5: '#4b5268',
      gray6: '#343949',
      gray7: '#252937',
      gray8: '#1a1d29',
      gray9: '#11131a',
      accent: '#00c2ff',
      success: '#4fdc8d',
      warning: '#ffbf69',
      error: '#ff6b81',
      selectionBg: 'rgba(139, 125, 255, 0.2)',
      lineHighlight: '#202430',
      focusRing: '#00c2ff',
      scrollbarThumb: '#4b5268',
      scrollbarTrack: '#1a1d29',
      inputBg: '#202431',
      dropdownBg: '#282d3c',
      syntaxKeyword: '#a78bfa',
      syntaxString: '#4fdc8d',
      syntaxNumber: '#ffbf69',
      syntaxComment: '#6c7390',
      brandGradient: 'linear-gradient(135deg, #8b7dff, #00c2ff)',
    },
  },
  {
    id: 'xcode-dark',
    name: 'Xcode Midnight',
    category: 'editor',
    colors: {
      brand: '#5ac8fa',
      gray0: '#f5fbff',
      gray1: '#d9ecf7',
      gray2: '#b8d3e4',
      gray3: '#8aa7ba',
      gray4: '#657c8e',
      gray5: '#475a69',
      gray6: '#32424e',
      gray7: '#22303a',
      gray8: '#182127',
      gray9: '#0f1519',
      accent: '#0a84ff',
      success: '#32d74b',
      warning: '#ffd60a',
      error: '#ff453a',
      selectionBg: 'rgba(10, 132, 255, 0.18)',
      lineHighlight: '#1c2730',
      focusRing: '#5ac8fa',
      scrollbarThumb: '#475a69',
      scrollbarTrack: '#182127',
      inputBg: '#1d2830',
      dropdownBg: '#24323d',
      syntaxKeyword: '#c792ea',
      syntaxString: '#a6da95',
      syntaxNumber: '#eed49f',
      syntaxComment: '#7f8fa3',
      brandGradient: 'linear-gradient(135deg, #5ac8fa, #0a84ff)',
    },
  },
  {
    id: 'android-studio',
    name: 'Android Studio',
    category: 'editor',
    colors: {
      brand: '#3ddc84',
      gray0: '#f5fff9',
      gray1: '#d9f7e5',
      gray2: '#b6e8ca',
      gray3: '#85c8a3',
      gray4: '#5f9878',
      gray5: '#476d59',
      gray6: '#32493d',
      gray7: '#22342b',
      gray8: '#17251e',
      gray9: '#0f1713',
      accent: '#8ab4f8',
      success: '#3ddc84',
      warning: '#fbbc04',
      error: '#ea4335',
      selectionBg: 'rgba(61, 220, 132, 0.2)',
      lineHighlight: '#1c2d24',
      focusRing: '#8ab4f8',
      scrollbarThumb: '#476d59',
      scrollbarTrack: '#17251e',
      inputBg: '#1d2d25',
      dropdownBg: '#25372d',
      syntaxKeyword: '#8ab4f8',
      syntaxString: '#86efac',
      syntaxNumber: '#fbbc04',
      syntaxComment: '#5f9878',
      brandGradient: 'linear-gradient(135deg, #3ddc84, #8ab4f8)',
    },
  },
  // ===== Game-Inspired Themes =====
  {
    id: 'eldenring',
    name: 'Elden Ring',
    category: 'game',
    colors: {
      brand: '#d4af37', // Runes gold
      gray0: '#f5f0e1',
      gray1: '#ddd5c0',
      gray2: '#c4b898',
      gray3: '#9a8e6e',
      gray4: '#756a50',
      gray5: '#524a38',
      gray6: '#3a3428',
      gray7: '#2a261e',
      gray8: '#1a1814',
      gray9: '#0e0d0a',
      accent: '#c9a227',
      success: '#7ab85e',
      warning: '#e5a030',
      error: '#c73030',
      fontFamily: '"Palatino Linotype", "Book Antiqua", Palatino, serif',
      fontHeading: '"Garamond", "Times New Roman", serif',
      fontMono: '"Consolas", "Courier New", monospace',
    },
  },
  {
    id: 'hades',
    name: 'Hades',
    category: 'game',
    colors: {
      brand: '#ff4444', // Blood/fire red
      gray0: '#f5e6d3',
      gray1: '#e0c8a8',
      gray2: '#c9a87c',
      gray3: '#9a7a5a',
      gray4: '#6e5840',
      gray5: '#4a3d2e',
      gray6: '#352c22',
      gray7: '#271f18',
      gray8: '#1a1510',
      gray9: '#0d0a08',
      accent: '#ffa500', // Orange flames
      success: '#50c878',
      warning: '#ffd700',
      error: '#dc143c',
      fontFamily: '"Trebuchet MS", "Segoe UI", "Helvetica Neue", sans-serif',
      fontHeading: '"Arial Black", "Impact", sans-serif',
      fontMono: '"Consolas", "Lucida Console", monospace',
    },
  },
  {
    id: 'ori',
    name: 'Ori (Blind Forest)',
    category: 'game',
    colors: {
      brand: '#7dd3fc', // Ori's glow
      gray0: '#f0f9ff',
      gray1: '#e0f2fe',
      gray2: '#bae6fd',
      gray3: '#7dd3fc',
      gray4: '#38bdf8',
      gray5: '#0891b2',
      gray6: '#0e4966',
      gray7: '#0c3a52',
      gray8: '#082f42',
      gray9: '#051e2c',
      accent: '#a5f3fc',
      success: '#86efac',
      warning: '#fcd34d',
      error: '#fb7185',
      fontFamily: '"Segoe UI", "Gill Sans", "Trebuchet MS", sans-serif',
      fontHeading: '"Segoe UI Semibold", "Trebuchet MS", sans-serif',
      fontMono: '"Cascadia Code", "Consolas", monospace',
    },
  },
  {
    id: 'persona5',
    name: 'Persona 5',
    category: 'game',
    colors: {
      brand: '#ff0000', // P5 Red
      gray0: '#ffffff',
      gray1: '#f0f0f0',
      gray2: '#d0d0d0',
      gray3: '#a0a0a0',
      gray4: '#707070',
      gray5: '#404040',
      gray6: '#2a2a2a',
      gray7: '#1a1a1a',
      gray8: '#0f0f0f',
      gray9: '#050505',
      accent: '#ff2222',
      success: '#22ff22',
      warning: '#ffbb00',
      error: '#ff0000',
      fontFamily: '"Arial Black", "Segoe UI", "Helvetica Neue", sans-serif',
      fontHeading: '"Impact", "Haettenschweiler", "Arial Narrow Bold", sans-serif',
      fontMono: '"Consolas", "Lucida Console", monospace',
    },
  },
  {
    id: 'darksouls',
    name: 'Dark Souls',
    category: 'game',
    colors: {
      brand: '#ff6600', // Bonfire orange
      gray0: '#d4cfc7',
      gray1: '#b5aea4',
      gray2: '#968e82',
      gray3: '#6e675e',
      gray4: '#524d46',
      gray5: '#3a3633',
      gray6: '#282522',
      gray7: '#1e1c1a',
      gray8: '#141312',
      gray9: '#0a0908',
      accent: '#ffaa44',
      success: '#55aa55',
      warning: '#ddaa00',
      error: '#aa3333',
      fontFamily: '"Cambria", "Georgia", "Times New Roman", serif',
      fontHeading: '"Palatino Linotype", "Book Antiqua", "Times New Roman", serif',
      fontMono: '"Consolas", "Courier New", monospace',
    },
  },
  {
    id: 'finalfantasy',
    name: 'Final Fantasy VII',
    category: 'game',
    colors: {
      brand: '#36c5f0',
      gray0: '#e8f7ff',
      gray1: '#cce8f5',
      gray2: '#9cc7db',
      gray3: '#7aa0b2',
      gray4: '#5a7a88',
      gray5: '#435c67',
      gray6: '#2e414a',
      gray7: '#213138',
      gray8: '#17242b',
      gray9: '#0d161b',
      accent: '#7aa2ff',
      success: '#66d7a7',
      warning: '#f4c26b',
      error: '#f06d8f',
      fontFamily: '"Segoe UI", "Trebuchet MS", "Helvetica Neue", sans-serif',
      fontHeading: '"Georgia", "Times New Roman", serif',
      fontMono: '"Consolas", "Lucida Console", "Courier New", monospace',
    },
  },
  {
    id: 'zelda-totk',
    name: 'Zelda (Tears of the Kingdom)',
    category: 'game',
    colors: {
      brand: '#4ecb8b',
      gray0: '#f6f4e8',
      gray1: '#ded9c3',
      gray2: '#c3b99b',
      gray3: '#9f926f',
      gray4: '#7c7254',
      gray5: '#5a523b',
      gray6: '#413c2c',
      gray7: '#2f2b20',
      gray8: '#201d16',
      gray9: '#12110c',
      accent: '#d7c36b',
      success: '#74c68a',
      warning: '#e8b84d',
      error: '#bf5f43',
      fontFamily: '"Palatino Linotype", "Book Antiqua", Palatino, serif',
      fontHeading: '"Copperplate", "Times New Roman", serif',
      fontMono: '"Lucida Console", "Consolas", monospace',
    },
  },
  {
    id: 'doom-eternal',
    name: 'Doom Eternal',
    category: 'game',
    colors: {
      brand: '#ff4d2d',
      gray0: '#f9e7df',
      gray1: '#e8c8bb',
      gray2: '#d5a18d',
      gray3: '#ad7b67',
      gray4: '#855948',
      gray5: '#5f3d32',
      gray6: '#402923',
      gray7: '#2d1d1a',
      gray8: '#1c1311',
      gray9: '#0f0908',
      accent: '#ff9f1c',
      success: '#86d957',
      warning: '#ffd166',
      error: '#ff2d55',
      fontFamily: '"Arial Narrow", "Segoe UI", "Helvetica Neue", sans-serif',
      fontHeading: '"Impact", "Arial Black", sans-serif',
      fontMono: '"Consolas", "Roboto Mono", "Courier New", monospace',
    },
  },
  {
    id: 'minecraft',
    name: 'Minecraft',
    category: 'game',
    colors: {
      brand: '#6bc24a',
      gray0: '#f0f7e8',
      gray1: '#dce8cc',
      gray2: '#bdcfa7',
      gray3: '#99ad7f',
      gray4: '#778a61',
      gray5: '#586646',
      gray6: '#3e4b34',
      gray7: '#2d3828',
      gray8: '#1d251a',
      gray9: '#10140f',
      accent: '#4aa3d8',
      success: '#7ad957',
      warning: '#d4b05f',
      error: '#c76152',
      fontFamily: '"Verdana", "Tahoma", "Segoe UI", sans-serif',
      fontHeading: '"Trebuchet MS", "Verdana", sans-serif',
      fontMono: '"Courier New", "Lucida Console", monospace',
    },
  },
  {
    id: 'witcher3',
    name: 'The Witcher 3',
    category: 'game',
    colors: {
      brand: '#b7d4e7',
      gray0: '#eaf0f4',
      gray1: '#d3dde5',
      gray2: '#b6c5d1',
      gray3: '#8f9fab',
      gray4: '#6d7a84',
      gray5: '#4f5961',
      gray6: '#363e44',
      gray7: '#272d31',
      gray8: '#1a1f23',
      gray9: '#101316',
      accent: '#77a8c9',
      success: '#6ebd8a',
      warning: '#d6b56e',
      error: '#bf5f5f',
      fontFamily: '"Cambria", "Georgia", serif',
      fontHeading: '"Palatino Linotype", "Book Antiqua", serif',
      fontMono: '"Consolas", "Courier New", monospace',
    },
  },
  {
    id: 'material-slate',
    name: 'Material Slate',
    category: 'app',
    style: {
      family: 'material',
      motif: 'none',
      motifIntensity: 0,
      surfaceMode: 'tonal',
      controlMode: 'filled',
      iconMode: 'badge',
    },
    colors: {
      brand: '#82a8ff',
      gray0: '#f8fbff',
      gray1: '#dde6f3',
      gray2: '#bac7d9',
      gray3: '#8f9db2',
      gray4: '#69768a',
      gray5: '#4f5a6d',
      gray6: '#364052',
      gray7: '#252d3c',
      gray8: '#171f2c',
      gray9: '#0e141e',
      accent: '#5bd2ff',
      success: '#59d48a',
      warning: '#f7bc58',
      error: '#ff7676',
      secondaryAccent: '#a993ff',
      tertiaryAccent: '#7ce6d9',
      highlightAccent: '#c6d6ff',
      surfaceTint: 'rgba(130, 168, 255, 0.14)',
      surfaceTintStrength: 0.11,
      panelGradient: 'linear-gradient(180deg, color-mix(in srgb, #171f2c 93%, #82a8ff), #0e141e)',
      borderStyle: 'solid',
      borderWidth: 1,
      motionProfile: 'calm',
      radiusScale: 'comfortable',
      strokeStyle: 'standard',
      shadowDepth: 'soft',
      glowStrength: 0.42,
      blurStrength: 6,
      selectionBg: 'rgba(130, 168, 255, 0.22)',
      lineHighlight: '#222a38',
      scrollbarThumb: '#4f5a6d',
      scrollbarTrack: '#171f2c',
      inputBg: '#171f2c',
      dropdownBg: '#252d3c',
      brandGradient: 'linear-gradient(135deg, #82a8ff, #5bd2ff)',
      infoColor: '#5bd2ff',
      mutedText: '#8f9db2',
      disabledOpacity: 0.45,
      shadowColor: 'rgba(6, 11, 19, 0.42)',
      shadowIntensity: 0.92,
      hoverLift: true,
      fontFamily: '"Manrope", "Nunito Sans", "Segoe UI", sans-serif',
      fontHeading: '"Manrope", "Segoe UI Semibold", sans-serif',
      fontMono: '"JetBrains Mono", "Consolas", monospace',
    },
  },
  {
    id: 'material-paper',
    name: 'Material Paper',
    category: 'minimal',
    style: {
      family: 'material',
      motif: 'none',
      motifIntensity: 0,
      surfaceMode: 'tonal',
      controlMode: 'filled',
      iconMode: 'badge',
    },
    colors: {
      brand: '#c98b45',
      gray0: '#fbf5eb',
      gray1: '#eadfce',
      gray2: '#d5c5b2',
      gray3: '#b39f8a',
      gray4: '#8c7a67',
      gray5: '#6b5948',
      gray6: '#4e4034',
      gray7: '#372d26',
      gray8: '#251f1b',
      gray9: '#171210',
      accent: '#e0b46a',
      success: '#7dbb7a',
      warning: '#f0b458',
      error: '#dd7b72',
      secondaryAccent: '#8ca2d7',
      tertiaryAccent: '#b8d2c2',
      highlightAccent: '#f1d5ab',
      surfaceTint: 'rgba(201, 139, 69, 0.12)',
      surfaceTintStrength: 0.1,
      panelGradient: 'linear-gradient(180deg, color-mix(in srgb, #251f1b 94%, #c98b45), #171210)',
      borderStyle: 'solid',
      borderWidth: 1,
      motionProfile: 'calm',
      radiusScale: 'comfortable',
      strokeStyle: 'subtle',
      shadowDepth: 'soft',
      glowStrength: 0.22,
      blurStrength: 3,
      selectionBg: 'rgba(224, 180, 106, 0.2)',
      lineHighlight: '#2d2621',
      scrollbarThumb: '#6b5948',
      scrollbarTrack: '#251f1b',
      inputBg: '#251f1b',
      dropdownBg: '#372d26',
      brandGradient: 'linear-gradient(135deg, #c98b45, #e0b46a)',
      infoColor: '#8ca2d7',
      mutedText: '#b39f8a',
      disabledOpacity: 0.44,
      shadowColor: 'rgba(23, 18, 16, 0.36)',
      shadowIntensity: 0.86,
      hoverLift: true,
      lightGray0: '#2c241e',
      lightGray1: '#483a30',
      lightGray2: '#625145',
      lightGray3: '#7b6a5e',
      lightGray4: '#a99688',
      lightGray5: '#d7c7b8',
      lightGray6: '#e7ddd1',
      lightGray7: '#f1e9df',
      lightGray8: '#f7f1e8',
      lightGray9: '#fcfaf6',
      fontFamily: '"Manrope", "Nunito Sans", "Segoe UI", sans-serif',
      fontHeading: '"Manrope", "Segoe UI Semibold", sans-serif',
      fontMono: '"JetBrains Mono", "Consolas", monospace',
    },
  },
  {
    id: 'glyph-amber',
    name: 'Glyph Amber',
    category: 'aesthetic',
    style: {
      family: 'glyph',
      motif: 'dot-grid',
      motifIntensity: 0.72,
      surfaceMode: 'ornamented',
      controlMode: 'outlined',
      iconMode: 'glyph-outline',
    },
    colors: {
      brand: '#ffb347',
      gray0: '#fff2d9',
      gray1: '#efd8ab',
      gray2: '#dcb77c',
      gray3: '#bb8e4d',
      gray4: '#8c6630',
      gray5: '#674824',
      gray6: '#432f1b',
      gray7: '#2b1f14',
      gray8: '#19120d',
      gray9: '#0d0906',
      accent: '#ffd36d',
      success: '#90cf7c',
      warning: '#ffcf70',
      error: '#ff7b5c',
      secondaryAccent: '#ff8a3d',
      tertiaryAccent: '#ffe8a8',
      highlightAccent: '#fff1b8',
      surfaceTint: 'rgba(255, 179, 71, 0.18)',
      surfaceTintStrength: 0.16,
      panelGradient: 'linear-gradient(180deg, color-mix(in srgb, #19120d 90%, #ffb347), #0d0906)',
      borderStyle: 'double',
      borderWidth: 1,
      motionProfile: 'energetic',
      radiusScale: 'compact',
      strokeStyle: 'bold',
      shadowDepth: 'dramatic',
      glowStrength: 0.94,
      blurStrength: 4,
      selectionBg: 'rgba(255, 179, 71, 0.22)',
      lineHighlight: '#24190f',
      scrollbarThumb: '#674824',
      scrollbarTrack: '#19120d',
      inputBg: '#19120d',
      dropdownBg: '#2b1f14',
      brandGradient: 'linear-gradient(135deg, #ff8a3d, #ffcf70)',
      infoColor: '#ffd36d',
      mutedText: '#bb8e4d',
      disabledOpacity: 0.42,
      shadowColor: 'rgba(0, 0, 0, 0.5)',
      shadowIntensity: 1.12,
      glowColor: 'rgba(255, 179, 71, 0.28)',
      hoverLift: true,
      fontFamily: '"Nothing NType 82", "Space Grotesk", "Segoe UI", sans-serif',
      fontHeading: '"Nothing NType 82 Headline", "Nothing NType 82", "Space Grotesk", sans-serif',
      fontMono: '"Nothing NType 82 Mono", "JetBrains Mono", "Consolas", monospace',
    },
  },
  {
    id: 'glyph-cyan',
    name: 'Glyph Cyan',
    category: 'aesthetic',
    style: {
      family: 'glyph',
      motif: 'glyph-field',
      motifIntensity: 0.68,
      surfaceMode: 'ornamented',
      controlMode: 'outlined',
      iconMode: 'glyph-outline',
    },
    colors: {
      brand: '#53d7ff',
      gray0: '#dbfaff',
      gray1: '#bceaf2',
      gray2: '#95cfdb',
      gray3: '#6ea7b5',
      gray4: '#4d7c88',
      gray5: '#355866',
      gray6: '#233b48',
      gray7: '#162733',
      gray8: '#0d1822',
      gray9: '#070d12',
      accent: '#6ef3dd',
      success: '#78dba0',
      warning: '#f6ca6e',
      error: '#ff7f98',
      secondaryAccent: '#7aa8ff',
      tertiaryAccent: '#b7f4ff',
      highlightAccent: '#7be7ff',
      surfaceTint: 'rgba(83, 215, 255, 0.16)',
      surfaceTintStrength: 0.15,
      panelGradient: 'linear-gradient(180deg, color-mix(in srgb, #0d1822 90%, #53d7ff), #070d12)',
      borderStyle: 'double',
      borderWidth: 1,
      motionProfile: 'energetic',
      radiusScale: 'compact',
      strokeStyle: 'bold',
      shadowDepth: 'dramatic',
      glowStrength: 1.02,
      blurStrength: 5,
      selectionBg: 'rgba(83, 215, 255, 0.2)',
      lineHighlight: '#13202b',
      scrollbarThumb: '#355866',
      scrollbarTrack: '#0d1822',
      inputBg: '#0d1822',
      dropdownBg: '#162733',
      brandGradient: 'linear-gradient(135deg, #53d7ff, #6ef3dd)',
      infoColor: '#6ef3dd',
      mutedText: '#6ea7b5',
      disabledOpacity: 0.42,
      shadowColor: 'rgba(3, 8, 13, 0.55)',
      shadowIntensity: 1.08,
      glowColor: 'rgba(83, 215, 255, 0.28)',
      hoverLift: true,
      fontFamily: '"Nothing NType 82", "Sora", "Segoe UI", sans-serif',
      fontHeading: '"Nothing NType 82 Headline", "Nothing NType 82", "Sora", sans-serif',
      fontMono: '"Nothing NType 82 Mono", "JetBrains Mono", "Consolas", monospace',
    },
  },
  {
    id: 'nothing-signal',
    name: 'Nothing Signal',
    category: 'minimal',
    style: {
      family: 'glyph',
      motif: 'dot-grid',
      motifIntensity: 0.78,
      surfaceMode: 'ornamented',
      controlMode: 'outlined',
      iconMode: 'glyph-outline',
    },
    colors: {
      brand: '#f5f5f1',
      gray0: '#ffffff',
      gray1: '#e7e7e2',
      gray2: '#bdbdb7',
      gray3: '#8f8f89',
      gray4: '#6d6d67',
      gray5: '#4d4d48',
      gray6: '#32322f',
      gray7: '#20201e',
      gray8: '#151514',
      gray9: '#0a0a0a',
      accent: '#ff473d',
      success: '#82d98b',
      warning: '#ffb648',
      error: '#ff655c',
      secondaryAccent: '#d7d7d2',
      tertiaryAccent: '#ff857e',
      highlightAccent: '#faf9f4',
      surfaceTint: 'rgba(255, 255, 255, 0.08)',
      surfaceTintStrength: 0.08,
      panelGradient: 'linear-gradient(180deg, color-mix(in srgb, #151514 96%, #f5f5f1), #0a0a0a)',
      borderStyle: 'solid',
      borderWidth: 1,
      motionProfile: 'calm',
      radiusScale: 'compact',
      strokeStyle: 'bold',
      shadowDepth: 'soft',
      glowStrength: 0.2,
      blurStrength: 0,
      selectionBg: 'rgba(255, 71, 61, 0.18)',
      lineHighlight: '#1b1b19',
      scrollbarThumb: '#4d4d48',
      scrollbarTrack: '#151514',
      inputBg: '#151514',
      dropdownBg: '#20201e',
      brandGradient: 'linear-gradient(135deg, #f5f5f1, #d7d7d2)',
      infoColor: '#f5f5f1',
      mutedText: '#8f8f89',
      disabledOpacity: 0.4,
      shadowColor: 'rgba(0, 0, 0, 0.55)',
      shadowIntensity: 0.9,
      hoverLift: false,
      fontFamily:
        '"Nothing NType 82", "Space Grotesk", "Bahnschrift SemiCondensed", "Arial Narrow", sans-serif',
      fontHeading: '"Nothing NType 82 Headline", "Nothing NType 82", "Space Grotesk", sans-serif',
      fontMono: '"Nothing NType 82 Mono", "Cascadia Mono", "JetBrains Mono", "Consolas", monospace',
    },
  },
  // ── App Themes ──────────────────────────────────────────────────────────────
  {
    id: 'claude',
    name: 'Claude',
    category: 'app',
    colors: {
      brand: '#D97757',
      gray0: '#FAF7F5',
      gray1: '#E8E0D8',
      gray2: '#CEC4BA',
      gray3: '#A89E94',
      gray4: '#7E766C',
      gray5: '#5A534A',
      gray6: '#3E3830',
      gray7: '#2C2520',
      gray8: '#1C1916',
      gray9: '#0F0D0C',
      accent: '#8B7355',
      success: '#40C057',
      warning: '#FAB005',
      error: '#FA5252',
      motionProfile: 'calm',
    },
    style: {
      family: 'classic',
      surfaceMode: 'gradient',
    },
  },
  {
    id: 'arc',
    name: 'Arc Browser',
    category: 'app',
    colors: {
      brand: '#5B5BD6',
      gray0: '#F0F0FF',
      gray1: '#D4D4F0',
      gray2: '#B4B4D8',
      gray3: '#8E8EB4',
      gray4: '#686890',
      gray5: '#484870',
      gray6: '#30304E',
      gray7: '#1E1E38',
      gray8: '#141426',
      gray9: '#0C0C12',
      accent: '#E54D2E',
      success: '#40C057',
      warning: '#FAB005',
      error: '#FA5252',
      motionProfile: 'energetic',
    },
    style: {
      family: 'classic',
      surfaceMode: 'gradient',
    },
  },
  {
    id: 'vercel',
    name: 'Vercel',
    category: 'app',
    colors: {
      brand: '#0070F3',
      gray0: '#FFFFFF',
      gray1: '#D4D4D4',
      gray2: '#AAAAAA',
      gray3: '#808080',
      gray4: '#595959',
      gray5: '#3A3A3A',
      gray6: '#282828',
      gray7: '#1C1C1C',
      gray8: '#111111',
      gray9: '#000000',
      accent: '#7928CA',
      success: '#40C057',
      warning: '#FAB005',
      error: '#FA5252',
      motionProfile: 'calm',
    },
    style: {
      family: 'classic',
      surfaceMode: 'gradient',
    },
  },
  {
    id: 'raycast',
    name: 'Raycast',
    category: 'app',
    colors: {
      brand: '#E55A2B',
      gray0: '#F5F5F5',
      gray1: '#D0D0D0',
      gray2: '#AAAAAA',
      gray3: '#808080',
      gray4: '#5A5A5A',
      gray5: '#3C3C3C',
      gray6: '#2C2C2C',
      gray7: '#1E1E1E',
      gray8: '#121212',
      gray9: '#080808',
      accent: '#FF9F0A',
      success: '#40C057',
      warning: '#FAB005',
      error: '#FA5252',
      motionProfile: 'energetic',
    },
    style: {
      family: 'classic',
      surfaceMode: 'gradient',
    },
  },
  {
    id: 'warp',
    name: 'Warp Terminal',
    category: 'app',
    colors: {
      brand: '#7B4DFF',
      gray0: '#E8E8F0',
      gray1: '#C4C4D4',
      gray2: '#9898B0',
      gray3: '#70708C',
      gray4: '#52526C',
      gray5: '#3C3C50',
      gray6: '#28283A',
      gray7: '#1C1C2A',
      gray8: '#12121E',
      gray9: '#0A0A12',
      accent: '#00E5CC',
      success: '#40C057',
      warning: '#FAB005',
      error: '#FA5252',
    },
    style: {
      family: 'glyph',
    },
  },
  {
    id: 'supabase',
    name: 'Supabase',
    category: 'app',
    colors: {
      brand: '#3ECF8E',
      gray0: '#F8F8F8',
      gray1: '#D4D4D4',
      gray2: '#AEAEAE',
      gray3: '#888888',
      gray4: '#606060',
      gray5: '#404040',
      gray6: '#2C2C2C',
      gray7: '#222222',
      gray8: '#191919',
      gray9: '#0F0F0F',
      accent: '#24B47E',
      success: '#40C057',
      warning: '#FAB005',
      error: '#FA5252',
    },
  },
  {
    id: 'tailwind',
    name: 'Tailwind CSS',
    category: 'app',
    colors: {
      brand: '#06B6D4',
      gray0: '#F8FAFC',
      gray1: '#F1F5F9',
      gray2: '#E2E8F0',
      gray3: '#CBD5E1',
      gray4: '#94A3B8',
      gray5: '#64748B',
      gray6: '#475569',
      gray7: '#334155',
      gray8: '#1E293B',
      gray9: '#0F172A',
      accent: '#3B82F6',
      success: '#40C057',
      warning: '#FAB005',
      error: '#FA5252',
    },
  },
  {
    id: 'cursor',
    name: 'Cursor',
    category: 'app',
    colors: {
      brand: '#6366F1',
      gray0: '#F0F0F5',
      gray1: '#C8C8D4',
      gray2: '#A0A0B0',
      gray3: '#787888',
      gray4: '#585868',
      gray5: '#3C3C4E',
      gray6: '#2A2A3A',
      gray7: '#1E1E2C',
      gray8: '#14141E',
      gray9: '#0C0C10',
      accent: '#8B5CF6',
      success: '#40C057',
      warning: '#FAB005',
      error: '#FA5252',
      motionProfile: 'calm',
    },
  },
  // ── Game Themes ──────────────────────────────────────────────────────────────
  {
    id: 'bloodborne',
    name: 'Bloodborne',
    category: 'game',
    colors: {
      brand: '#8B0000',
      gray0: '#D4C5B0',
      gray1: '#B8A890',
      gray2: '#9A8C74',
      gray3: '#7A6E5A',
      gray4: '#5C5044',
      gray5: '#3E3430',
      gray6: '#2A1E1C',
      gray7: '#1E1410',
      gray8: '#140C0A',
      gray9: '#0A0505',
      accent: '#D4A017',
      success: '#D4A017',
      warning: '#C17F24',
      error: '#8B0000',
      motionProfile: 'calm',
      shadowDepth: 'dramatic',
      glowStrength: 0.4,
    },
    style: {
      family: 'classic',
      surfaceMode: 'gradient',
    },
  },
  {
    id: 'cyberpunk-2077',
    name: 'Cyberpunk 2077',
    category: 'game',
    colors: {
      brand: '#FCE300',
      gray0: '#E8E8F8',
      gray1: '#B4B4CC',
      gray2: '#8484A0',
      gray3: '#606078',
      gray4: '#424260',
      gray5: '#2C2C48',
      gray6: '#1C1C32',
      gray7: '#101020',
      gray8: '#060610',
      gray9: '#020204',
      accent: '#00D4FF',
      success: '#00D4FF',
      warning: '#FCE300',
      error: '#FF2D55',
      motionProfile: 'energetic',
      glowStrength: 0.9,
    },
    style: {
      family: 'glyph',
    },
  },
  {
    id: 'skyrim',
    name: 'Skyrim',
    category: 'game',
    colors: {
      brand: '#C0392B',
      gray0: '#E8E6E0',
      gray1: '#C8C4BC',
      gray2: '#A8A49C',
      gray3: '#88847C',
      gray4: '#686460',
      gray5: '#4C4844',
      gray6: '#343230',
      gray7: '#252320',
      gray8: '#181614',
      gray9: '#0D0D0F',
      accent: '#4A90D9',
      success: '#40C057',
      warning: '#FAB005',
      error: '#FA5252',
      secondaryAccent: '#D4C5A9',
    },
  },
  {
    id: 'stardew',
    name: 'Stardew Valley',
    category: 'game',
    colors: {
      brand: '#6AB04C',
      gray0: '#F5EDD8',
      gray1: '#E0D4B8',
      gray2: '#C4B898',
      gray3: '#A09878',
      gray4: '#80785C',
      gray5: '#5C5640',
      gray6: '#403C2C',
      gray7: '#302C20',
      gray8: '#221A14',
      gray9: '#1A1209',
      accent: '#F0A500',
      success: '#6AB04C',
      warning: '#F0A500',
      error: '#C0392B',
      motionProfile: 'calm',
      radiusScale: 'rounded',
    },
  },
  {
    id: 'baldursgate3',
    name: "Baldur's Gate 3",
    category: 'game',
    colors: {
      brand: '#7B3FB5',
      gray0: '#D8D0C8',
      gray1: '#B8B0A8',
      gray2: '#948C84',
      gray3: '#726A64',
      gray4: '#524C48',
      gray5: '#38342C',
      gray6: '#28241E',
      gray7: '#1C1818',
      gray8: '#120E14',
      gray9: '#0A070F',
      accent: '#C9A84C',
      success: '#40C057',
      warning: '#FAB005',
      error: '#FA5252',
      secondaryAccent: '#C9A84C',
    },
    style: {
      family: 'classic',
      surfaceMode: 'gradient',
    },
  },
  {
    id: 'masseffect',
    name: 'Mass Effect',
    category: 'game',
    colors: {
      brand: '#CC0000',
      gray0: '#D0D8E8',
      gray1: '#A8B4CC',
      gray2: '#8090B0',
      gray3: '#5C6C90',
      gray4: '#3C506C',
      gray5: '#253448',
      gray6: '#182430',
      gray7: '#10182A',
      gray8: '#090E1C',
      gray9: '#050810',
      accent: '#00B4D8',
      success: '#40C057',
      warning: '#FAB005',
      error: '#FA5252',
      secondaryAccent: '#FF6B35',
    },
  },
  {
    id: 'celeste',
    name: 'Celeste',
    category: 'game',
    colors: {
      brand: '#E040FB',
      gray0: '#EEE8FF',
      gray1: '#C8C0E8',
      gray2: '#A098C8',
      gray3: '#78709C',
      gray4: '#565078',
      gray5: '#3C3858',
      gray6: '#282440',
      gray7: '#1C1A30',
      gray8: '#121020',
      gray9: '#0A0A14',
      accent: '#40C4FF',
      success: '#40C057',
      warning: '#FAB005',
      error: '#FA5252',
      motionProfile: 'energetic',
    },
  },
  {
    id: 'portal',
    name: 'Portal',
    category: 'game',
    colors: {
      brand: '#FF6B00',
      gray0: '#D8DCE0',
      gray1: '#B4B8BC',
      gray2: '#909498',
      gray3: '#6C7074',
      gray4: '#4E5255',
      gray5: '#363A3D',
      gray6: '#262A2C',
      gray7: '#1C1E20',
      gray8: '#12141A',
      gray9: '#0A0C0E',
      accent: '#0090FF',
      success: '#40C057',
      warning: '#FAB005',
      error: '#FA5252',
    },
  },
];

const THEME_FONT_STACKS: Record<
  ThemePersonality,
  Required<Pick<ThemePalette['colors'], 'fontFamily' | 'fontHeading' | 'fontMono'>>
> = {
  editorial: {
    fontFamily: '"Trebuchet MS", "Segoe UI", "Helvetica Neue", Arial, sans-serif',
    fontHeading: 'Georgia, "Palatino Linotype", "Times New Roman", serif',
    fontMono: '"IBM Plex Mono", "Cascadia Mono", "Consolas", monospace',
  },
  studio: {
    fontFamily:
      '"Aptos", "Segoe UI Variable Text", "Segoe UI", "Helvetica Neue", Arial, sans-serif',
    fontHeading: '"Bahnschrift SemiBold", "Segoe UI Variable Display", "Segoe UI", sans-serif',
    fontMono: '"Cascadia Code", "Consolas", "IBM Plex Mono", monospace',
  },
  ornamental: {
    fontFamily: '"Sora", "Space Grotesk", "Segoe UI", sans-serif',
    fontHeading: '"Space Grotesk", "Sora", "Segoe UI Semibold", sans-serif',
    fontMono: '"JetBrains Mono", "Cascadia Mono", "Consolas", monospace',
  },
};

const THEME_PERSONALITY_GROUPS: Record<ThemePersonality, Set<string>> = {
  editorial: new Set([
    'invoke',
    'spotify',
    'github',
    'ocean',
    'forest',
    'midnight',
    'nord',
    'dracula',
    'rosepine',
    'catppuccin',
    'catppuccin-latte',
    'catppuccin-frappe',
    'catppuccin-macchiato',
    'gruvbox',
    'everforest',
    'palenight',
    'tokyonight',
    'horizon',
    'poimandres',
    'kanagawa',
    'vesper',
    'monochrome',
    'highcontrast',
    'witcher3',
    'ori',
  ]),
  studio: new Set([
    'discord',
    'slack',
    'twitter',
    'vscode',
    'ayu',
    'onedark',
    'cobalt2',
    'atom-onedark',
    'jetbrains-darcula',
    'jetbrains-light',
    'sublime-mariana',
    'webstorm',
    'pycharm',
    'eclipse-dark',
    'notepadpp-dark',
    'vim-solarized',
    'emacs-zenburn',
    'material-slate',
    'material-paper',
    'minecraft',
  ]),
  ornamental: new Set([
    'sith',
    'cappuccino',
    'cyberpunk',
    'netflix',
    'synthwave',
    'sunset',
    'hollowknight',
    'draculapro',
    'eldenring',
    'hades',
    'persona5',
    'darksouls',
    'finalfantasy',
    'zelda-totk',
    'doom-eternal',
    'glyph-amber',
    'glyph-cyan',
    'nothing-signal',
  ]),
};

const THEME_PERSONALITY_LABELS: Record<ThemePersonality, string> = {
  editorial: 'Editorial',
  studio: 'Studio',
  ornamental: 'Ornamental',
};

const THEME_PERSONALITY_OVERRIDES: Partial<
  Record<string, { style?: Partial<ThemeStyle>; colors?: Partial<ThemePalette['colors']> }>
> = {
  github: {
    colors: {
      fontFamily: '"Segoe UI", "Helvetica Neue", Arial, sans-serif',
      fontHeading: '"Segoe UI Semibold", "Trebuchet MS", sans-serif',
    },
  },
  discord: {
    colors: {
      glowStrength: 0.78,
      blurStrength: 7,
    },
  },
  synthwave: {
    style: {
      motif: 'glyph-field',
      motifIntensity: 0.62,
    },
    colors: {
      fontHeading: '"Bahnschrift Condensed", Impact, "Arial Narrow Bold", sans-serif',
    },
  },
  highcontrast: {
    style: {
      motif: 'none',
      controlMode: 'outlined',
    },
    colors: {
      fontFamily: '"Segoe UI", Arial, sans-serif',
      fontHeading: '"Segoe UI Semibold", Arial, sans-serif',
      fontMono: '"Cascadia Mono", "Consolas", monospace',
      blurStrength: 0,
      glowStrength: 0.12,
    },
  },
};

function getThemePersonality(theme: ThemePalette): ThemePersonality {
  for (const [personality, ids] of Object.entries(THEME_PERSONALITY_GROUPS) as Array<
    [ThemePersonality, Set<string>]
  >) {
    if (ids.has(theme.id)) {
      return personality;
    }
  }

  if (theme.category === 'editor' || theme.category === 'app') {
    return 'studio';
  }
  if (theme.category === 'aesthetic' || theme.category === 'game') {
    return 'ornamental';
  }
  return 'editorial';
}

export function getThemePersonalityLabel(theme: ThemePalette): string {
  return THEME_PERSONALITY_LABELS[getThemePersonality(theme)];
}

function buildThemePersonalityPreset(theme: ThemePalette): {
  style: Partial<ThemeStyle>;
  colors: Partial<ThemePalette['colors']>;
} {
  const personality = getThemePersonality(theme);
  const accent2 =
    theme.colors.secondaryAccent ||
    `color-mix(in srgb, ${theme.colors.accent} 64%, ${theme.colors.brand})`;
  const accent3 =
    theme.colors.tertiaryAccent ||
    `color-mix(in srgb, ${theme.colors.success} 52%, ${theme.colors.accent})`;
  const highlightAccent =
    theme.colors.highlightAccent ||
    `color-mix(in srgb, ${theme.colors.warning} 56%, ${theme.colors.brand})`;
  const surfaceTint =
    theme.colors.surfaceTint || `color-mix(in srgb, ${theme.colors.brand} 18%, transparent)`;
  const shadowColor =
    theme.colors.shadowColor || `color-mix(in srgb, ${theme.colors.gray9} 72%, transparent)`;
  const glowColor =
    theme.colors.glowColor || `color-mix(in srgb, ${theme.colors.brand} 32%, transparent)`;
  const panelGradient =
    theme.colors.panelGradient ||
    (personality === 'studio'
      ? `linear-gradient(180deg, color-mix(in srgb, ${theme.colors.gray7} 90%, ${theme.colors.brand}), color-mix(in srgb, ${theme.colors.gray9} 94%, ${accent2}))`
      : personality === 'ornamental'
        ? `linear-gradient(180deg, color-mix(in srgb, ${theme.colors.gray8} 84%, ${highlightAccent}), color-mix(in srgb, ${theme.colors.gray9} 94%, ${accent2}))`
        : `linear-gradient(180deg, color-mix(in srgb, ${theme.colors.gray8} 90%, ${theme.colors.brand}), color-mix(in srgb, ${theme.colors.gray9} 96%, ${theme.colors.accent}))`);
  const brandGradient =
    theme.colors.brandGradient ||
    (personality === 'ornamental'
      ? `linear-gradient(135deg, ${theme.colors.brand}, ${highlightAccent})`
      : `linear-gradient(135deg, ${theme.colors.brand}, ${accent2})`);

  if (personality === 'studio') {
    return {
      style: {
        family: 'material',
        motif: 'dot-grid',
        motifIntensity: 0.26,
        surfaceMode: 'tonal',
        controlMode: 'filled',
        iconMode: 'badge',
      },
      colors: {
        ...THEME_FONT_STACKS.studio,
        secondaryAccent: accent2,
        tertiaryAccent: accent3,
        highlightAccent,
        surfaceTint,
        surfaceTintStrength: 0.12,
        panelGradient,
        brandGradient,
        borderStyle: 'solid',
        borderWidth: 1,
        motionProfile: 'standard',
        radiusScale: 'comfortable',
        strokeStyle: 'standard',
        shadowDepth: 'normal',
        glowStrength: 0.62,
        blurStrength: 6,
        infoColor: accent2,
        mutedText: theme.colors.gray3,
        interactiveBg: `color-mix(in srgb, ${theme.colors.brand} 16%, transparent)`,
        borderSubtle: `color-mix(in srgb, ${theme.colors.brand} 20%, ${theme.colors.gray5})`,
        shadowColor,
        shadowIntensity: 1.02,
        glowColor,
        hoverLift: true,
      },
    };
  }

  if (personality === 'ornamental') {
    return {
      style: {
        family: 'glyph',
        motif: hashThemeId(theme.id) % 2 === 0 ? 'glyph-field' : 'dot-grid',
        motifIntensity: 0.24,
        surfaceMode: 'ornamented',
        controlMode: 'outlined',
        iconMode: 'glyph-outline',
      },
      colors: {
        ...THEME_FONT_STACKS.ornamental,
        secondaryAccent: accent2,
        tertiaryAccent: accent3,
        highlightAccent,
        surfaceTint,
        surfaceTintStrength: 0.14,
        panelGradient,
        brandGradient,
        borderStyle: 'double',
        borderWidth: 1,
        motionProfile: 'energetic',
        radiusScale: 'compact',
        strokeStyle: 'bold',
        shadowDepth: 'dramatic',
        glowStrength: 0.3,
        blurStrength: 1,
        infoColor: highlightAccent,
        mutedText: theme.colors.gray3,
        interactiveBg: `color-mix(in srgb, ${highlightAccent} 14%, transparent)`,
        borderSubtle: `color-mix(in srgb, ${highlightAccent} 28%, ${theme.colors.gray5})`,
        shadowColor,
        shadowIntensity: 0.88,
        glowColor,
        hoverLift: true,
      },
    };
  }

  return {
    style: {
      family: 'classic',
      motif: 'none',
      motifIntensity: 0,
      surfaceMode: 'gradient',
      controlMode: 'default',
      iconMode: 'plain',
    },
    colors: {
      ...THEME_FONT_STACKS.editorial,
      secondaryAccent: accent2,
      tertiaryAccent: accent3,
      highlightAccent,
      surfaceTint,
      surfaceTintStrength: 0.1,
      panelGradient,
      brandGradient,
      borderStyle: 'solid',
      borderWidth: 1,
      motionProfile: theme.category === 'minimal' ? 'calm' : 'standard',
      radiusScale: theme.category === 'minimal' ? 'compact' : 'comfortable',
      strokeStyle: theme.category === 'minimal' ? 'subtle' : 'standard',
      shadowDepth: theme.category === 'minimal' ? 'soft' : 'normal',
      glowStrength: theme.category === 'minimal' ? 0.22 : 0.58,
      blurStrength: theme.category === 'minimal' ? 1 : 3,
      infoColor: accent2,
      mutedText: theme.colors.gray3,
      interactiveBg: `color-mix(in srgb, ${theme.colors.brand} 10%, transparent)`,
      borderSubtle: `color-mix(in srgb, ${theme.colors.gray0} 10%, ${theme.colors.gray5})`,
      shadowColor,
      shadowIntensity: theme.category === 'minimal' ? 0.88 : 0.96,
      glowColor,
      hoverLift: theme.category !== 'minimal',
    },
  };
}

function applyBuiltInThemePersonality(theme: ThemePalette): ThemePalette {
  const preset = buildThemePersonalityPreset(theme);
  const override = THEME_PERSONALITY_OVERRIDES[theme.id];
  const mergedStyle: ThemeStyle = {
    family: preset.style.family ?? theme.style?.family ?? DEFAULT_THEME_STYLE.family,
    motif: preset.style.motif ?? theme.style?.motif,
    motifIntensity: preset.style.motifIntensity ?? theme.style?.motifIntensity,
    surfaceMode: preset.style.surfaceMode ?? theme.style?.surfaceMode,
    controlMode: preset.style.controlMode ?? theme.style?.controlMode,
    iconMode: preset.style.iconMode ?? theme.style?.iconMode,
    ...override?.style,
    ...theme.style,
  };
  const mergedColors: ThemePalette['colors'] = {
    ...preset.colors,
    ...override?.colors,
    ...theme.colors,
  };

  if (mergedStyle.family === 'glyph') {
    mergedStyle.motifIntensity = clamp(
      mergedStyle.motifIntensity ?? 0.22,
      0,
      theme.category === 'minimal' ? 0.14 : 0.24
    );
    mergedColors.glowStrength = Math.min(
      mergedColors.glowStrength ?? 0.26,
      theme.category === 'minimal' ? 0.12 : 0.28
    );
    mergedColors.blurStrength = Math.min(
      mergedColors.blurStrength ?? 0.9,
      theme.category === 'minimal' ? 0.35 : 0.8
    );
    mergedColors.shadowIntensity = Math.min(mergedColors.shadowIntensity ?? 0.88, 0.92);
    mergedColors.textPrimary = mergedColors.textPrimary || theme.colors.gray0;
    mergedColors.textSecondary =
      mergedColors.textSecondary ||
      `color-mix(in srgb, ${theme.colors.gray1} 62%, ${theme.colors.gray2})`;
    mergedColors.fontFamily = '"Sora", "Space Grotesk", "Segoe UI", sans-serif';
    mergedColors.fontHeading = '"Space Grotesk", "Sora", "Segoe UI Semibold", sans-serif';
    mergedColors.fontMono =
      mergedColors.fontMono || '"JetBrains Mono", "Cascadia Mono", "Consolas", monospace';
  }

  return {
    ...theme,
    style: mergedStyle,
    colors: mergedColors,
  };
}

export const THEME_PALETTES: ThemePalette[] = BASE_THEME_PALETTES.map(applyBuiltInThemePersonality);

/**
 * Curated theme presets surfaced by default in the AppearanceModal.
 * The full THEME_PALETTES catalog is still available via the Advanced section.
 */
export const CURATED_DARK_THEMES: readonly string[] = [
  'invoke',
  'ayu',
  'nord',
  'dracula',
  'linear',
  'highcontrast',
] as const;

export const CURATED_LIGHT_THEMES: readonly string[] = [
  'material-paper',
  'jetbrains-light',
  'catppuccin-latte',
  'monochrome',
] as const;

export type ThemeMode = 'light' | 'dark' | 'system';
export type ResolvedColorScheme = 'light' | 'dark';

const DEFAULT_DARK_THEME_ID = 'invoke';
const DEFAULT_LIGHT_THEME_ID = 'material-paper';

function detectSystemColorScheme(): ResolvedColorScheme {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return 'dark';
  }
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

function resolveScheme(mode: ThemeMode): ResolvedColorScheme {
  if (mode === 'light') return 'light';
  if (mode === 'dark') return 'dark';
  return detectSystemColorScheme();
}

function resolveActiveThemeId(
  mode: ThemeMode,
  lightThemeId: string,
  darkThemeId: string
): string {
  return resolveScheme(mode) === 'light' ? lightThemeId : darkThemeId;
}

interface ThemeStore {
  /** Persisted: how the active scheme is chosen — explicit light, explicit dark, or follow OS. */
  themeMode: ThemeMode;
  /** Persisted: theme ID active when the resolved scheme is light. */
  lightThemeId: string;
  /** Persisted: theme ID active when the resolved scheme is dark. */
  darkThemeId: string;
  /** Derived (not persisted): scheme actually rendered after resolving system preference. */
  resolvedColorScheme: ResolvedColorScheme;
  /**
   * Synchronized mirror of the currently active theme ID, kept in sync by every setter so
   * existing consumers that read `currentTheme` continue to work without a refactor.
   * Equivalent to `resolvedColorScheme === 'light' ? lightThemeId : darkThemeId`.
   */
  currentTheme: string;
  customAccent: string | null;
  controlShapeOverride: ThemeControlShape | null;
  iconShapeOverride: ThemeIconShape | null;
  customThemes: ThemePalette[];
  _hasHydrated: boolean;
  /** New canonical setters. */
  setThemeMode: (mode: ThemeMode) => void;
  setThemeForScheme: (scheme: ResolvedColorScheme, themeId: string) => void;
  /**
   * Reapplies whichever theme the active scheme currently selects. Acts as a backwards-compatible
   * alias for the old single-slot `setTheme(themeId)` API: it writes to the slot matching the
   * currently resolved scheme.
   */
  setTheme: (themeId: string) => void;
  /**
   * Backwards-compatible toggle. Cycles between explicit `light` and explicit `dark` modes.
   * Prefer `setThemeMode` directly — this exists only so legacy call sites can be migrated
   * incrementally and is removed in this same change as soon as the call sites are gone.
   */
  toggleLightMode: () => void;
  /** Internal: update resolvedColorScheme when the OS preference changes (system mode only). */
  _handleSystemSchemeChange: (scheme: ResolvedColorScheme) => void;
  setCustomAccent: (color: string | null) => void;
  setControlShapeOverride: (shape: ThemeControlShape | null) => void;
  setIconShapeOverride: (shape: ThemeIconShape | null) => void;
  getTheme: () => ThemePalette;
  syncThemeCSS: () => void;
  setHasHydrated: (hydrated: boolean) => void;
  // Custom theme methods
  addCustomTheme: (theme: ThemePalette) => void;
  updateCustomTheme: (themeId: string, updates: Partial<ThemePalette>) => void;
  deleteCustomTheme: (themeId: string) => void;
  exportTheme: (themeId: string) => string;
  importTheme: (json: string) => { success: boolean; theme?: ThemePalette; error?: string };
  getAllThemes: () => ThemePalette[];
}

const INITIAL_RESOLVED_SCHEME: ResolvedColorScheme = resolveScheme('dark');

export const useThemeStore = create<ThemeStore>()(
  persist(
    devtools(
      (set, get) => ({
        themeMode: 'dark',
        lightThemeId: DEFAULT_LIGHT_THEME_ID,
        darkThemeId: DEFAULT_DARK_THEME_ID,
        resolvedColorScheme: INITIAL_RESOLVED_SCHEME,
        currentTheme:
          INITIAL_RESOLVED_SCHEME === 'light' ? DEFAULT_LIGHT_THEME_ID : DEFAULT_DARK_THEME_ID,
        customAccent: null,
        controlShapeOverride: null,
        iconShapeOverride: null,
        customThemes: [],
        _hasHydrated: false,

        getAllThemes: () => {
          return [...THEME_PALETTES, ...get().customThemes];
        },

        setThemeMode: (mode: ThemeMode) => {
          const resolved = resolveScheme(mode);
          const { lightThemeId, darkThemeId } = get();
          const nextThemeId = resolveActiveThemeId(mode, lightThemeId, darkThemeId);
          set({
            themeMode: mode,
            resolvedColorScheme: resolved,
            currentTheme: nextThemeId,
          });
          const allThemes = get().getAllThemes();
          const theme = allThemes.find((t) => t.id === nextThemeId) || THEME_PALETTES[0];
          applyThemeToCSS(theme, resolved === 'light', get().customAccent, {
            controlShape: get().controlShapeOverride,
            iconShape: get().iconShapeOverride,
          });
        },

        setThemeForScheme: (scheme: ResolvedColorScheme, themeId: string) => {
          const updates: Partial<ThemeStore> =
            scheme === 'light' ? { lightThemeId: themeId } : { darkThemeId: themeId };
          set(updates);
          // Re-derive the active theme ID using the newly written slot.
          const { themeMode, lightThemeId, darkThemeId } = get();
          const nextThemeId = resolveActiveThemeId(themeMode, lightThemeId, darkThemeId);
          set({ currentTheme: nextThemeId });
          // Only re-apply CSS if the change affects the currently rendered scheme.
          if (scheme === get().resolvedColorScheme) {
            const allThemes = get().getAllThemes();
            const theme = allThemes.find((t) => t.id === nextThemeId) || THEME_PALETTES[0];
            applyThemeToCSS(theme, scheme === 'light', get().customAccent, {
              controlShape: get().controlShapeOverride,
              iconShape: get().iconShapeOverride,
            });
          }
        },

        setTheme: (themeId: string) => {
          // Compatibility shim for legacy single-slot API: writes the new themeId into the slot
          // matching the currently resolved scheme.
          const scheme = get().resolvedColorScheme;
          get().setThemeForScheme(scheme, themeId);
        },

        toggleLightMode: () => {
          // Compatibility shim: cycles between explicit light and explicit dark modes.
          // System mode is opt-in via setThemeMode('system'); toggling collapses it to an explicit choice.
          const next: ThemeMode = get().resolvedColorScheme === 'light' ? 'dark' : 'light';
          get().setThemeMode(next);
        },

        _handleSystemSchemeChange: (scheme: ResolvedColorScheme) => {
          if (get().themeMode !== 'system') return;
          const { lightThemeId, darkThemeId } = get();
          const nextThemeId = scheme === 'light' ? lightThemeId : darkThemeId;
          set({ resolvedColorScheme: scheme, currentTheme: nextThemeId });
          const allThemes = get().getAllThemes();
          const theme = allThemes.find((t) => t.id === nextThemeId) || THEME_PALETTES[0];
          applyThemeToCSS(theme, scheme === 'light', get().customAccent, {
            controlShape: get().controlShapeOverride,
            iconShape: get().iconShapeOverride,
          });
        },

        setCustomAccent: (color: string | null) => {
          set({ customAccent: color });
          const { currentTheme, resolvedColorScheme } = get();
          const allThemes = get().getAllThemes();
          const theme = allThemes.find((t) => t.id === currentTheme) || THEME_PALETTES[0];
          applyThemeToCSS(theme, resolvedColorScheme === 'light', color, {
            controlShape: get().controlShapeOverride,
            iconShape: get().iconShapeOverride,
          });
        },

        setControlShapeOverride: (shape: ThemeControlShape | null) => {
          set({ controlShapeOverride: shape });
          const { currentTheme, resolvedColorScheme } = get();
          const allThemes = get().getAllThemes();
          const theme = allThemes.find((t) => t.id === currentTheme) || THEME_PALETTES[0];
          applyThemeToCSS(theme, resolvedColorScheme === 'light', get().customAccent, {
            controlShape: shape,
            iconShape: get().iconShapeOverride,
          });
        },

        setIconShapeOverride: (shape: ThemeIconShape | null) => {
          set({ iconShapeOverride: shape });
          const { currentTheme, resolvedColorScheme } = get();
          const allThemes = get().getAllThemes();
          const theme = allThemes.find((t) => t.id === currentTheme) || THEME_PALETTES[0];
          applyThemeToCSS(theme, resolvedColorScheme === 'light', get().customAccent, {
            controlShape: get().controlShapeOverride,
            iconShape: shape,
          });
        },

        getTheme: () => {
          const { currentTheme } = get();
          const allThemes = get().getAllThemes();
          return allThemes.find((t) => t.id === currentTheme) || THEME_PALETTES[0];
        },

        syncThemeCSS: () => {
          const {
            currentTheme,
            resolvedColorScheme,
            customAccent,
            controlShapeOverride,
            iconShapeOverride,
          } = get();
          const allThemes = get().getAllThemes();
          const theme = allThemes.find((t) => t.id === currentTheme) || THEME_PALETTES[0];
          applyThemeToCSS(theme, resolvedColorScheme === 'light', customAccent, {
            controlShape: controlShapeOverride,
            iconShape: iconShapeOverride,
          });
        },

        setHasHydrated: (hydrated: boolean) => {
          set({ _hasHydrated: hydrated });
        },

        // Custom theme management
        addCustomTheme: (theme: ThemePalette) => {
          const { customThemes } = get();
          // Ensure unique ID
          let themeId = theme.id.startsWith('custom-') ? theme.id : `custom-${theme.id}`;
          let counter = 1;
          while (
            get()
              .getAllThemes()
              .some((t) => t.id === themeId)
          ) {
            themeId = `custom-${theme.id}-${counter}`;
            counter++;
          }
          const newTheme = { ...theme, id: themeId, category: 'custom' as ThemeCategory };
          set({ customThemes: [...customThemes, newTheme] });
        },

        updateCustomTheme: (themeId: string, updates: Partial<ThemePalette>) => {
          const { customThemes } = get();
          const updated = customThemes.map((t) => (t.id === themeId ? { ...t, ...updates } : t));
          set({ customThemes: updated });
          // Re-apply if this is the current theme
          if (get().currentTheme === themeId) {
            get().syncThemeCSS();
          }
        },

        deleteCustomTheme: (themeId: string) => {
          const { customThemes, lightThemeId, darkThemeId } = get();
          set({ customThemes: customThemes.filter((t) => t.id !== themeId) });
          // If the deleted theme was selected for either scheme, fall back to defaults.
          if (lightThemeId === themeId) {
            get().setThemeForScheme('light', DEFAULT_LIGHT_THEME_ID);
          }
          if (darkThemeId === themeId) {
            get().setThemeForScheme('dark', DEFAULT_DARK_THEME_ID);
          }
        },

        exportTheme: (themeId: string) => {
          const allThemes = get().getAllThemes();
          const theme = allThemes.find((t) => t.id === themeId);
          if (!theme) return JSON.stringify({ error: 'Theme not found' });
          return JSON.stringify(theme, null, 2);
        },

        importTheme: (json: string) => {
          try {
            const parsed = JSON.parse(json);

            // Validate required fields
            if (!parsed.id || !parsed.name || !parsed.colors) {
              return {
                success: false,
                error: 'Invalid theme format: missing required fields (id, name, colors)',
              };
            }

            // Validate required color fields
            const requiredColors = [
              'brand',
              'gray0',
              'gray1',
              'gray2',
              'gray3',
              'gray4',
              'gray5',
              'gray6',
              'gray7',
              'gray8',
              'gray9',
              'accent',
              'success',
              'warning',
              'error',
            ];
            for (const color of requiredColors) {
              if (!parsed.colors[color]) {
                return { success: false, error: `Missing required color: ${color}` };
              }
            }

            // Add the theme
            get().addCustomTheme(parsed);
            return { success: true, theme: parsed };
          } catch (error) {
            return { success: false, error: `Failed to parse JSON: ${error}` };
          }
        },
      }),
      { name: 'ThemeStore' }
    ),
    {
      name: 'swarmui-theme',
      version: 4,
      // Explicit storage configuration
      storage: {
        getItem: (name) => {
          const str = localStorage.getItem(name);
          console.debug('[ThemeStore] getItem:', name, str);
          return str ? JSON.parse(str) : null;
        },
        setItem: (name, value) => {
          console.debug('[ThemeStore] setItem:', name, value);
          localStorage.setItem(name, JSON.stringify(value));
        },
        removeItem: (name) => localStorage.removeItem(name),
      },
      // Migration for older versions
      migrate: (persistedState: Record<string, unknown>, version: number) => {
        let migratedState = persistedState;
        if (version < 2) {
          migratedState = { ...migratedState, customThemes: [] };
        }
        if (version < 3) {
          migratedState = {
            ...migratedState,
            controlShapeOverride: null,
            iconShapeOverride: null,
          };
        }
        if (version < 4) {
          // v3 → v4: collapse `isLightMode` + single `currentTheme` into themeMode +
          // separate light/dark slots so light and dark can each remember their own preset.
          const legacyIsLight = Boolean(migratedState.isLightMode);
          const legacyCurrentTheme =
            typeof migratedState.currentTheme === 'string'
              ? (migratedState.currentTheme as string)
              : DEFAULT_DARK_THEME_ID;
          const themeMode: ThemeMode = legacyIsLight ? 'light' : 'dark';
          const lightThemeId = legacyIsLight ? legacyCurrentTheme : DEFAULT_LIGHT_THEME_ID;
          const darkThemeId = legacyIsLight ? DEFAULT_DARK_THEME_ID : legacyCurrentTheme;
          migratedState = {
            ...migratedState,
            themeMode,
            lightThemeId,
            darkThemeId,
            currentTheme: legacyIsLight ? lightThemeId : darkThemeId,
          };
          // Drop the now-defunct flag so it doesn't shadow new state on reload.
          delete (migratedState as Record<string, unknown>).isLightMode;
        }
        return migratedState;
      },
      // Re-apply theme CSS after hydration from localStorage.
      onRehydrateStorage: () => (state, error) => {
        console.debug('[ThemeStore] onRehydrateStorage called, state:', state, 'error:', error);
        if (state && !error) {
          // Resolve the actual scheme now that the system preference is known.
          const resolved = resolveScheme(state.themeMode);
          const activeId = resolved === 'light' ? state.lightThemeId : state.darkThemeId;
          state.resolvedColorScheme = resolved;
          state.currentTheme = activeId;
          const allThemes = [...THEME_PALETTES, ...(state.customThemes || [])];
          const theme = allThemes.find((t) => t.id === activeId) || THEME_PALETTES[0];
          applyThemeToCSS(theme, resolved === 'light', state.customAccent, {
            controlShape: state.controlShapeOverride,
            iconShape: state.iconShapeOverride,
          });
          // Mark as hydrated
          state.setHasHydrated(true);
        }
      },
      // Exclude _hasHydrated and derived state from persistence.
      partialize: (state) =>
        ({
          themeMode: state.themeMode,
          lightThemeId: state.lightThemeId,
          darkThemeId: state.darkThemeId,
          customAccent: state.customAccent,
          controlShapeOverride: state.controlShapeOverride,
          iconShapeOverride: state.iconShapeOverride,
          customThemes: state.customThemes,
        }) as unknown as ThemeStore,
    }
  )
);

/**
 * Subscribe to OS color-scheme changes once. Only routes the change into the store when
 * the user has chosen `themeMode === 'system'`; explicit light/dark modes ignore the OS.
 *
 * Idempotent — safe to call from initializeTheme and from React effects.
 */
let _systemSchemeListenerAttached = false;
function attachSystemSchemeListener() {
  if (_systemSchemeListenerAttached) return;
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
  _systemSchemeListenerAttached = true;
  const mql = window.matchMedia('(prefers-color-scheme: light)');
  const handler = (event: MediaQueryListEvent) => {
    useThemeStore.getState()._handleSystemSchemeChange(event.matches ? 'light' : 'dark');
  };
  if (typeof mql.addEventListener === 'function') {
    mql.addEventListener('change', handler);
  } else if (typeof (mql as MediaQueryList & { addListener?: (cb: (e: MediaQueryListEvent) => void) => void }).addListener === 'function') {
    // Safari < 14 fallback.
    (mql as MediaQueryList & { addListener: (cb: (e: MediaQueryListEvent) => void) => void }).addListener(handler);
  }
}

interface RgbColor {
  r: number;
  g: number;
  b: number;
}

function normalizeHexColor(input: string | undefined | null, fallback: string): string {
  if (!input) {
    return fallback;
  }

  const trimmed = input.trim();
  const normalized = trimmed.startsWith('#') ? trimmed : `#${trimmed}`;
  const shortMatch = /^#([0-9a-fA-F]{3})$/.exec(normalized);
  if (shortMatch) {
    const expanded = shortMatch[1]
      .split('')
      .map((value) => value + value)
      .join('');
    return `#${expanded.toLowerCase()}`;
  }

  if (/^#([0-9a-fA-F]{6})$/.test(normalized)) {
    return normalized.toLowerCase();
  }

  return fallback;
}

function tryParseCssColorToRgb(input: string | undefined | null): RgbColor | null {
  if (!input) {
    return null;
  }

  const trimmed = input.trim();
  if (!trimmed) {
    return null;
  }

  const normalizedHex = normalizeHexColor(trimmed, '');
  if (normalizedHex) {
    return hexToRgb(normalizedHex);
  }

  const rgbaMatch = /^rgba?\(\s*([^)]+)\s*\)$/i.exec(trimmed);
  if (!rgbaMatch) {
    return null;
  }

  const components = rgbaMatch[1]
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  if (components.length < 3) {
    return null;
  }

  const red = Number.parseFloat(components[0]);
  const green = Number.parseFloat(components[1]);
  const blue = Number.parseFloat(components[2]);
  if ([red, green, blue].some((value) => Number.isNaN(value))) {
    return null;
  }

  return {
    r: clamp(Math.round(red), 0, 255),
    g: clamp(Math.round(green), 0, 255),
    b: clamp(Math.round(blue), 0, 255),
  };
}

function tryParseCssColorAlpha(input: string | undefined | null): number | null {
  if (!input) {
    return null;
  }

  const rgbaMatch = /^rgba\(\s*([^)]+)\s*\)$/i.exec(input.trim());
  if (!rgbaMatch) {
    return null;
  }

  const components = rgbaMatch[1]
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  if (components.length < 4) {
    return null;
  }

  const alpha = Number.parseFloat(components[3]);
  if (Number.isNaN(alpha)) {
    return null;
  }

  return clamp(alpha, 0, 1);
}

function hexToRgb(hexColor: string): RgbColor {
  const normalized = normalizeHexColor(hexColor, '#000000').replace('#', '');
  return {
    r: Number.parseInt(normalized.slice(0, 2), 16),
    g: Number.parseInt(normalized.slice(2, 4), 16),
    b: Number.parseInt(normalized.slice(4, 6), 16),
  };
}

function rgbToHex(color: RgbColor): string {
  const toHex = (value: number) => clamp(Math.round(value), 0, 255).toString(16).padStart(2, '0');
  return `#${toHex(color.r)}${toHex(color.g)}${toHex(color.b)}`;
}

function mixHexColors(colorA: string, colorB: string, weightA: number): string {
  const a = hexToRgb(colorA);
  const b = hexToRgb(colorB);
  const ratio = clamp(weightA, 0, 1);
  return rgbToHex({
    r: a.r * ratio + b.r * (1 - ratio),
    g: a.g * ratio + b.g * (1 - ratio),
    b: a.b * ratio + b.b * (1 - ratio),
  });
}

function colorToRgbaString(hexColor: string, alpha: number): string {
  const rgb = hexToRgb(hexColor);
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${clamp(alpha, 0, 1).toFixed(3)})`;
}

function toLinearChannel(value: number): number {
  const normalized = value / 255;
  if (normalized <= 0.03928) {
    return normalized / 12.92;
  }
  return ((normalized + 0.055) / 1.055) ** 2.4;
}

function getRelativeLuminance(hexColor: string): number {
  const rgb = hexToRgb(hexColor);
  return (
    0.2126 * toLinearChannel(rgb.r) +
    0.7152 * toLinearChannel(rgb.g) +
    0.0722 * toLinearChannel(rgb.b)
  );
}

function getContrastRatio(foreground: string, background: string): number {
  const light = Math.max(getRelativeLuminance(foreground), getRelativeLuminance(background));
  const dark = Math.min(getRelativeLuminance(foreground), getRelativeLuminance(background));
  return (light + 0.05) / (dark + 0.05);
}

function pickAccessibleTextColor(
  background: string,
  preferredText: string,
  alternateText: string,
  minRatio: number = 4.5
): string {
  const preferredRatio = getContrastRatio(preferredText, background);
  if (preferredRatio >= minRatio) {
    return preferredText;
  }

  const alternateRatio = getContrastRatio(alternateText, background);
  if (alternateRatio >= minRatio) {
    return alternateText;
  }

  return preferredRatio >= alternateRatio ? preferredText : alternateText;
}

function pickAccessibleTextColorForSurfaces(
  backgrounds: string[],
  preferredText: string,
  alternateText: string,
  minRatio: number = 4.5
): string {
  const uniqueCandidates = Array.from(
    new Set([
      preferredText,
      alternateText,
      ...backgrounds.map((background) => getContrastTextColor(background)),
    ])
  );

  for (const candidate of uniqueCandidates) {
    if (backgrounds.every((background) => getContrastRatio(candidate, background) >= minRatio)) {
      return candidate;
    }
  }

  let bestCandidate = uniqueCandidates[0] ?? preferredText;
  let bestMinimumRatio = -1;
  for (const candidate of uniqueCandidates) {
    const minimumRatio = Math.min(
      ...backgrounds.map((background) => getContrastRatio(candidate, background))
    );
    if (minimumRatio > bestMinimumRatio) {
      bestMinimumRatio = minimumRatio;
      bestCandidate = candidate;
    }
  }

  return bestCandidate;
}

function constrainSurfaceForText(
  baseSurface: string,
  candidateSurface: string,
  textColor: string,
  minRatio: number = 4.5
): string {
  if (getContrastRatio(textColor, candidateSurface) >= minRatio) {
    return candidateSurface;
  }

  let best = candidateSurface;
  for (let candidateWeight = 0.9; candidateWeight >= -0.001; candidateWeight -= 0.05) {
    const adjusted = mixHexColors(candidateSurface, baseSurface, clamp(candidateWeight, 0, 1));
    best = adjusted;
    if (getContrastRatio(textColor, adjusted) >= minRatio) {
      return adjusted;
    }
  }

  return best;
}

function deriveReadableMutedText(
  baseText: string,
  surface: string,
  minRatio: number = 4.5
): string {
  let best = baseText;
  for (let weight = 0.72; weight <= 1.001; weight += 0.04) {
    const candidate = mixHexColors(baseText, surface, weight);
    if (getContrastRatio(candidate, surface) >= minRatio) {
      best = candidate;
      break;
    }
  }
  return best;
}

/**
 * Ensure a UI graphical color (focus ring, selected border, etc.) has at
 * least the requested non-text contrast ratio against every neighbouring
 * surface it can appear on. Used to honour WCAG 2.2 §1.4.11 and §2.4.13
 * even when the theme author picked a brand color whose unmodified value
 * is too close in luminance to one of the app/panel/card surfaces.
 *
 * Mixes the input toward black or white (whichever direction will
 * actually increase contrast against the average surface luminance) until
 * the minimum ratio is met, returning the closest passing color. Falls
 * back to the best-found candidate if no exact pass is reachable.
 */
function ensureNonTextContrast(
  fg: string,
  surfaces: string[],
  minRatio: number = 3.0
): string {
  if (surfaces.length === 0) {
    return fg;
  }

  const minRatioAcross = (color: string) =>
    Math.min(...surfaces.map((bg) => getContrastRatio(color, bg)));

  if (minRatioAcross(fg) >= minRatio) {
    return fg;
  }

  const avgSurfaceLuminance =
    surfaces.reduce((sum, bg) => sum + getRelativeLuminance(bg), 0) / surfaces.length;
  const target = avgSurfaceLuminance > 0.4 ? '#000000' : '#ffffff';

  let best = fg;
  let bestRatio = minRatioAcross(fg);
  for (let weight = 0.05; weight <= 1.0001; weight += 0.05) {
    const candidate = mixHexColors(target, fg, weight);
    const candidateRatio = minRatioAcross(candidate);
    if (candidateRatio > bestRatio) {
      best = candidate;
      bestRatio = candidateRatio;
    }
    if (candidateRatio >= minRatio) {
      return candidate;
    }
  }
  return best;
}

/**
 * Calculate the highest-contrast text color for a background using the W3C contrast formula.
 */
function getContrastTextColor(hexColor: string): string {
  const whiteContrast = getContrastRatio('#ffffff', hexColor);
  const blackContrast = getContrastRatio('#000000', hexColor);
  return whiteContrast >= blackContrast ? '#ffffff' : '#000000';
}

interface ThemeVisualProfile {
  motionProfile: ThemeMotionProfile;
  radiusScale: ThemeRadiusScale;
  strokeStyle: ThemeStrokeStyle;
  shadowDepth: ThemeShadowDepth;
  borderStyle: 'solid' | 'dashed' | 'double';
  surfaceTintStrength: number;
  blurStrength: number;
  glowStrength: number;
  shadowIntensity: number;
  highlightWeight: number;
}

const THEME_CATEGORY_PROFILES: Record<ThemeCategory, ThemeVisualProfile> = {
  default: {
    motionProfile: 'standard',
    radiusScale: 'comfortable',
    strokeStyle: 'standard',
    shadowDepth: 'normal',
    borderStyle: 'solid',
    surfaceTintStrength: 0.12,
    blurStrength: 4,
    glowStrength: 0.75,
    shadowIntensity: 1,
    highlightWeight: 45,
  },
  app: {
    motionProfile: 'standard',
    radiusScale: 'comfortable',
    strokeStyle: 'standard',
    shadowDepth: 'normal',
    borderStyle: 'solid',
    surfaceTintStrength: 0.1,
    blurStrength: 3,
    glowStrength: 0.65,
    shadowIntensity: 1.05,
    highlightWeight: 42,
  },
  editor: {
    motionProfile: 'calm',
    radiusScale: 'compact',
    strokeStyle: 'subtle',
    shadowDepth: 'soft',
    borderStyle: 'solid',
    surfaceTintStrength: 0.08,
    blurStrength: 2,
    glowStrength: 0.45,
    shadowIntensity: 0.92,
    highlightWeight: 34,
  },
  'color-scheme': {
    motionProfile: 'standard',
    radiusScale: 'rounded',
    strokeStyle: 'standard',
    shadowDepth: 'normal',
    borderStyle: 'solid',
    surfaceTintStrength: 0.15,
    blurStrength: 4,
    glowStrength: 0.85,
    shadowIntensity: 1.08,
    highlightWeight: 50,
  },
  aesthetic: {
    motionProfile: 'energetic',
    radiusScale: 'rounded',
    strokeStyle: 'bold',
    shadowDepth: 'dramatic',
    borderStyle: 'double',
    surfaceTintStrength: 0.2,
    blurStrength: 6,
    glowStrength: 1.1,
    shadowIntensity: 1.2,
    highlightWeight: 56,
  },
  game: {
    motionProfile: 'energetic',
    radiusScale: 'comfortable',
    strokeStyle: 'bold',
    shadowDepth: 'dramatic',
    borderStyle: 'double',
    surfaceTintStrength: 0.18,
    blurStrength: 5,
    glowStrength: 1,
    shadowIntensity: 1.18,
    highlightWeight: 54,
  },
  minimal: {
    motionProfile: 'calm',
    radiusScale: 'compact',
    strokeStyle: 'subtle',
    shadowDepth: 'soft',
    borderStyle: 'solid',
    surfaceTintStrength: 0.06,
    blurStrength: 1,
    glowStrength: 0.25,
    shadowIntensity: 0.84,
    highlightWeight: 28,
  },
  custom: {
    motionProfile: 'standard',
    radiusScale: 'comfortable',
    strokeStyle: 'standard',
    shadowDepth: 'normal',
    borderStyle: 'solid',
    surfaceTintStrength: 0.12,
    blurStrength: 4,
    glowStrength: 0.8,
    shadowIntensity: 1,
    highlightWeight: 45,
  },
};

const THEME_ID_PROFILE_OVERRIDES: Partial<Record<string, Partial<ThemeVisualProfile>>> = {
  invoke: { radiusScale: 'comfortable', strokeStyle: 'standard', glowStrength: 0.78 },
  cyberpunk: {
    motionProfile: 'energetic',
    borderStyle: 'double',
    glowStrength: 1.35,
    highlightWeight: 64,
  },
  synthwave: {
    motionProfile: 'energetic',
    radiusScale: 'rounded',
    glowStrength: 1.2,
    highlightWeight: 62,
  },
  dracula: { motionProfile: 'calm', radiusScale: 'rounded', glowStrength: 0.95 },
  nord: { motionProfile: 'calm', strokeStyle: 'subtle', glowStrength: 0.5 },
  gruvbox: { motionProfile: 'calm', shadowDepth: 'soft', surfaceTintStrength: 0.1 },
  highcontrast: { strokeStyle: 'bold', borderStyle: 'double', glowStrength: 0.35, blurStrength: 0 },
  eldenring: {
    shadowDepth: 'dramatic',
    borderStyle: 'double',
    glowStrength: 1.05,
    highlightWeight: 58,
  },
  persona5: {
    motionProfile: 'energetic',
    borderStyle: 'double',
    glowStrength: 1.15,
    highlightWeight: 60,
  },
  discord: { motionProfile: 'energetic', radiusScale: 'comfortable', glowStrength: 0.8 },
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function hashThemeId(themeId: string): number {
  let hash = 0;
  for (let i = 0; i < themeId.length; i += 1) {
    hash = (hash * 31 + themeId.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function getVisualProfile(theme: ThemePalette): ThemeVisualProfile {
  const categoryProfile =
    THEME_CATEGORY_PROFILES[theme.category] || THEME_CATEGORY_PROFILES.default;
  const idOverride = THEME_ID_PROFILE_OVERRIDES[theme.id] || {};
  return {
    ...categoryProfile,
    ...idOverride,
  };
}

function buildThemeMotifOverlay(
  motif: ThemeStyleMotif,
  motifIntensity: number,
  brand: string,
  accent: string,
  highlight: string,
  themeSeed: number,
  intensityScale: number = 1
): string {
  const scaledIntensity = clamp(motifIntensity * intensityScale, 0, 1);

  if (motif === 'none' || scaledIntensity <= 0.025) {
    return 'none';
  }

  const primaryWeight = 2 + Math.round(scaledIntensity * 16);
  const secondaryWeight = 1 + Math.round(scaledIntensity * 10);
  const offset = 1 + (themeSeed % 4);

  if (motif === 'dot-grid') {
    const majorDot = 0.7 + scaledIntensity * 0.6;
    const minorDot = 0.38 + scaledIntensity * 0.28;
    return [
      `radial-gradient(circle at ${offset + 1}px ${offset + 1}px, color-mix(in srgb, ${accent} ${primaryWeight}%, transparent) ${majorDot}px, transparent ${majorDot + 0.36}px) 0 0 / 18px 18px`,
      `radial-gradient(circle at 50% 50%, color-mix(in srgb, ${brand} ${secondaryWeight}%, transparent) ${minorDot}px, transparent ${minorDot + 0.3}px) 9px 9px / 18px 18px`,
    ].join(', ');
  }

  if (motif === 'glyph-field') {
    return [
      `repeating-linear-gradient(135deg, color-mix(in srgb, ${highlight} ${primaryWeight}%, transparent) 0 1.4px, transparent 1.4px 20px)`,
      `repeating-linear-gradient(90deg, color-mix(in srgb, ${brand} ${secondaryWeight}%, transparent) 0 1px, transparent 1px 28px)`,
      `linear-gradient(180deg, color-mix(in srgb, ${accent} ${Math.max(3, primaryWeight - 1)}%, transparent), transparent 48%)`,
    ].join(', ');
  }

  return 'none';
}

// Apply theme colors as CSS variables
export function applyThemeToCSS(
  theme: ThemePalette,
  isLightMode: boolean = false,
  customAccent: string | null = null,
  shapeOverrides: ThemeShapeOverrides = {}
) {
  const root = document.documentElement;
  const profile = getVisualProfile(theme);
  const style = resolveThemeStyle(theme, shapeOverrides);
  const themeSeed = hashThemeId(theme.id);

  root.setAttribute('data-theme-id', theme.id);
  root.setAttribute('data-theme-category', theme.category);
  root.setAttribute('data-theme-family', style.family);
  root.setAttribute('data-theme-motif', style.motif);
  root.setAttribute('data-theme-surface', style.surfaceMode);
  root.setAttribute('data-theme-control', style.controlMode);
  root.setAttribute('data-theme-icon', style.iconMode);
  root.setAttribute('data-theme-control-shape', style.controlShape);
  root.setAttribute('data-theme-icon-shape', style.iconShape);
  root.setAttribute('data-mantine-color-scheme', isLightMode ? 'light' : 'dark');

  // Determine the effective brand color
  const effectiveBrand = customAccent || theme.colors.brand;
  const surfaceTintStrength = clamp(
    theme.colors.surfaceTintStrength ?? profile.surfaceTintStrength,
    0.04,
    0.4
  );
  const borderStyle = theme.colors.borderStyle || profile.borderStyle;
  const borderWidth = Math.max(1, theme.colors.borderWidth ?? 1);
  const strokeStyle = theme.colors.strokeStyle || profile.strokeStyle;
  const blurStrength = clamp(theme.colors.blurStrength ?? profile.blurStrength, 0, 18);
  const shadowDepth = theme.colors.shadowDepth || profile.shadowDepth;
  const shadowIntensity = theme.colors.shadowIntensity ?? profile.shadowIntensity;
  const glowStrength = clamp(theme.colors.glowStrength ?? profile.glowStrength, 0, 1.8);
  const motionProfile = theme.colors.motionProfile || profile.motionProfile;
  const radiusScale = theme.colors.radiusScale || profile.radiusScale;
  const controlRadius =
    style.controlShape === 'pill'
      ? '999px'
      : style.controlShape === 'square'
        ? 'calc(7px * var(--theme-radius-multiplier))'
        : 'calc(12px * var(--theme-radius-multiplier))';
  const iconRadius =
    style.iconShape === 'circle'
      ? '999px'
      : style.iconShape === 'square'
        ? 'calc(8px * var(--theme-radius-multiplier))'
        : 'calc(12px * var(--theme-radius-multiplier))';
  const gray0 = isLightMode ? theme.colors.lightGray0 || '#000000' : theme.colors.gray0;
  const gray1 = isLightMode ? theme.colors.lightGray1 || '#1a1a1a' : theme.colors.gray1;
  const gray2 = isLightMode ? theme.colors.lightGray2 || '#333333' : theme.colors.gray2;
  const gray3 = isLightMode ? theme.colors.lightGray3 || '#555555' : theme.colors.gray3;
  const gray4 = isLightMode ? theme.colors.lightGray4 || '#777777' : theme.colors.gray4;
  const gray5 = isLightMode ? theme.colors.lightGray5 || '#bbbbbb' : theme.colors.gray5;
  const gray6 = isLightMode ? theme.colors.lightGray6 || '#d5d5d5' : theme.colors.gray6;
  const gray7 = isLightMode ? theme.colors.lightGray7 || '#e8e8e8' : theme.colors.gray7;
  const gray8 = isLightMode ? theme.colors.lightGray8 || '#efefef' : theme.colors.gray8;
  const gray9 = isLightMode ? theme.colors.lightGray9 || '#f5f5f5' : theme.colors.gray9;
  const appSurface = normalizeHexColor(theme.colors.appBg, gray9);
  const panelSurface = normalizeHexColor(
    theme.colors.panelBg,
    mixHexColors(gray8, appSurface, isLightMode ? 0.62 : 0.76)
  );
  const cardSurface = normalizeHexColor(
    theme.colors.cardBg,
    mixHexColors(gray7, panelSurface, isLightMode ? 0.34 : 0.42)
  );
  const raisedSurface = normalizeHexColor(
    theme.colors.raisedBg,
    mixHexColors(gray6, cardSurface, isLightMode ? 0.2 : 0.24)
  );
  const headerSurface = normalizeHexColor(
    theme.colors.headerBg,
    mixHexColors(panelSurface, appSurface, isLightMode ? 0.84 : 0.9)
  );
  const inputSurface = normalizeHexColor(
    theme.colors.inputBg,
    mixHexColors(raisedSurface, cardSurface, isLightMode ? 0.44 : 0.52)
  );
  const dropdownSurface = normalizeHexColor(
    theme.colors.dropdownBg,
    mixHexColors(cardSurface, panelSurface, isLightMode ? 0.68 : 0.74)
  );
  const textOnApp = pickAccessibleTextColor(appSurface, gray0, getContrastTextColor(appSurface));
  const textOnPanel = pickAccessibleTextColor(
    panelSurface,
    gray0,
    getContrastTextColor(panelSurface)
  );
  const textOnCard = pickAccessibleTextColor(
    cardSurface,
    textOnPanel,
    getContrastTextColor(cardSurface)
  );
  const textOnInput = pickAccessibleTextColor(
    inputSurface,
    textOnCard,
    getContrastTextColor(inputSurface)
  );
  const textOnDropdown = pickAccessibleTextColor(
    dropdownSurface,
    textOnCard,
    getContrastTextColor(dropdownSurface)
  );
  const textPrimaryCandidate = normalizeHexColor(theme.colors.textPrimary, textOnCard);
  const textPrimaryResolved = pickAccessibleTextColor(
    cardSurface,
    textPrimaryCandidate,
    textOnCard
  );
  const textSecondaryCandidate = normalizeHexColor(
    theme.colors.textSecondary,
    deriveReadableMutedText(textPrimaryResolved, cardSurface)
  );
  const textSecondaryResolved = pickAccessibleTextColor(
    cardSurface,
    textSecondaryCandidate,
    textPrimaryResolved
  );
  const selectedSurfaceCandidate = normalizeHexColor(
    theme.colors.selectedSurface,
    mixHexColors(effectiveBrand, cardSurface, isLightMode ? 0.18 : 0.34)
  );
  const selectedSurfaceHoverCandidate = normalizeHexColor(
    theme.colors.selectedSurfaceHover,
    mixHexColors(effectiveBrand, selectedSurfaceCandidate, isLightMode ? 0.3 : 0.18)
  );
  const selectedBorder = normalizeHexColor(theme.colors.selectionBorder, effectiveBrand);
  const selectedTextCandidate = normalizeHexColor(
    theme.colors.selectedText,
    pickAccessibleTextColorForSurfaces(
      [selectedSurfaceCandidate, selectedSurfaceHoverCandidate],
      textPrimaryResolved,
      getContrastTextColor(selectedSurfaceCandidate)
    )
  );
  const selectedSurface = constrainSurfaceForText(
    cardSurface,
    selectedSurfaceCandidate,
    selectedTextCandidate
  );
  const selectedSurfaceHoverCandidateResolved = constrainSurfaceForText(
    selectedSurface,
    selectedSurfaceHoverCandidate,
    selectedTextCandidate
  );
  const selectedText = pickAccessibleTextColorForSurfaces(
    [selectedSurface, selectedSurfaceHoverCandidateResolved],
    selectedTextCandidate,
    getContrastTextColor(selectedSurface)
  );
  const selectedSurfaceHover = constrainSurfaceForText(
    selectedSurface,
    selectedSurfaceHoverCandidateResolved,
    selectedText
  );
  const interactiveHoverSurface = normalizeHexColor(
    theme.colors.interactiveHoverBg,
    mixHexColors(theme.colors.accent, cardSurface, isLightMode ? 0.14 : 0.2)
  );
  const interactiveActiveSurface = normalizeHexColor(
    theme.colors.interactiveActiveBg,
    mixHexColors(effectiveBrand, cardSurface, isLightMode ? 0.12 : 0.18)
  );
  const interactiveText = pickAccessibleTextColor(
    interactiveActiveSurface,
    textPrimaryResolved,
    getContrastTextColor(interactiveActiveSurface)
  );
  const surfaceOverlayOpacity = clamp(
    theme.colors.surfaceOverlayOpacity ?? (style.surfaceMode === 'ornamented' ? 0.16 : 0.12),
    0.04,
    0.18
  );
  const headerOverlayOpacity = clamp(
    theme.colors.headerOverlayOpacity ?? Math.min(surfaceOverlayOpacity, 0.1),
    0.03,
    0.12
  );
  const inputOverlayOpacity = clamp(
    theme.colors.inputOverlayOpacity ?? Math.min(surfaceOverlayOpacity, 0.09),
    0.02,
    0.1
  );
  const controlOverlayOpacity = clamp(
    theme.colors.controlOverlayOpacity ?? Math.min(surfaceOverlayOpacity + 0.02, 0.14),
    0.04,
    0.16
  );
  const secondaryAccent =
    theme.colors.secondaryAccent ||
    `color-mix(in srgb, ${theme.colors.accent} ${64 + (themeSeed % 12)}%, ${effectiveBrand})`;
  const tertiaryAccent =
    theme.colors.tertiaryAccent ||
    `color-mix(in srgb, ${theme.colors.success} ${52 + (themeSeed % 12)}%, ${theme.colors.accent})`;
  const highlightAccent =
    theme.colors.highlightAccent ||
    `color-mix(in srgb, ${theme.colors.warning} ${profile.highlightWeight}%, ${effectiveBrand})`;
  const panelAngle = 162 + (themeSeed % 38);
  const panelBlend = 80 + (themeSeed % 14);
  const panelGradient =
    theme.colors.panelGradient ||
    `linear-gradient(${panelAngle}deg, color-mix(in srgb, ${gray8} ${panelBlend}%, ${effectiveBrand}), color-mix(in srgb, ${gray9} 92%, ${theme.colors.accent}))`;
  const brandGradient =
    theme.colors.brandGradient ||
    `linear-gradient(${124 + (themeSeed % 42)}deg, ${effectiveBrand}, color-mix(in srgb, ${effectiveBrand} 70%, ${theme.colors.accent}))`;
  const brandSoft = `color-mix(in srgb, ${effectiveBrand} 24%, transparent)`;
  const accentSoft = `color-mix(in srgb, ${theme.colors.accent} 22%, transparent)`;
  const successSoft = `color-mix(in srgb, ${theme.colors.success} 24%, transparent)`;
  const warningSoft = `color-mix(in srgb, ${theme.colors.warning} 24%, transparent)`;
  const errorSoft = `color-mix(in srgb, ${theme.colors.error} 24%, transparent)`;
  const highlightSoft = `color-mix(in srgb, ${highlightAccent} 28%, transparent)`;
  const meshOverlay =
    `radial-gradient(circle at ${12 + (themeSeed % 30)}% 14%, ${brandSoft}, transparent 56%), ` +
    `radial-gradient(circle at ${68 + (themeSeed % 18)}% 10%, ${accentSoft}, transparent 52%), ` +
    `radial-gradient(circle at ${34 + (themeSeed % 34)}% 80%, ${highlightSoft}, transparent 60%)`;
  const motifOverlay = buildThemeMotifOverlay(
    style.motif,
    style.motifIntensity,
    effectiveBrand,
    secondaryAccent,
    highlightAccent,
    themeSeed,
    style.family === 'glyph' ? 0.72 : 1
  );
  const motifOverlayPanel = buildThemeMotifOverlay(
    style.motif,
    style.motifIntensity,
    effectiveBrand,
    secondaryAccent,
    highlightAccent,
    themeSeed,
    style.family === 'glyph' ? 0.46 : 0.72
  );
  const motifOverlayInput = buildThemeMotifOverlay(
    style.motif,
    style.motifIntensity,
    effectiveBrand,
    secondaryAccent,
    highlightAccent,
    themeSeed,
    style.family === 'glyph' ? 0.14 : 0.22
  );
  const interactiveGradient = `linear-gradient(${92 + (themeSeed % 60)}deg, color-mix(in srgb, ${secondaryAccent} 36%, transparent), color-mix(in srgb, ${tertiaryAccent} 32%, transparent))`;

  // Set CSS custom properties for brand colors
  root.style.setProperty('--theme-seed', String(themeSeed));
  root.style.setProperty('--theme-style-family', style.family);
  root.style.setProperty('--theme-style-motif', style.motif);
  root.style.setProperty('--theme-style-motif-intensity', String(style.motifIntensity));
  root.style.setProperty('--theme-style-surface-mode', style.surfaceMode);
  root.style.setProperty('--theme-style-control-mode', style.controlMode);
  root.style.setProperty('--theme-style-icon-mode', style.iconMode);
  root.style.setProperty('--theme-style-control-shape', style.controlShape);
  root.style.setProperty('--theme-style-icon-shape', style.iconShape);
  root.style.setProperty('--theme-brand', effectiveBrand);
  root.style.setProperty('--theme-brand-text', getContrastTextColor(effectiveBrand));
  root.style.setProperty('--theme-accent', theme.colors.accent);
  root.style.setProperty('--theme-accent-2', secondaryAccent);
  root.style.setProperty('--theme-accent-3', tertiaryAccent);
  root.style.setProperty('--theme-highlight-accent', highlightAccent);
  root.style.setProperty(
    '--theme-surface-tint',
    theme.colors.surfaceTint ||
      `color-mix(in srgb, ${effectiveBrand} ${Math.round(surfaceTintStrength * 100)}%, transparent)`
  );
  root.style.setProperty('--theme-surface-tint-strength', String(surfaceTintStrength));
  root.style.setProperty('--theme-panel-gradient', panelGradient);
  root.style.setProperty('--theme-border-style', borderStyle);
  root.style.setProperty('--theme-border-width', `${borderWidth}px`);
  root.style.setProperty('--theme-stroke-style', strokeStyle);
  root.style.setProperty('--theme-brand-gradient', brandGradient);
  root.style.setProperty('--theme-brand-soft', brandSoft);
  root.style.setProperty('--theme-accent-soft', accentSoft);
  root.style.setProperty('--theme-success-soft', successSoft);
  root.style.setProperty('--theme-warning-soft', warningSoft);
  root.style.setProperty('--theme-error-soft', errorSoft);
  root.style.setProperty('--theme-highlight-soft', highlightSoft);
  root.style.setProperty('--theme-mesh-overlay', meshOverlay);
  root.style.setProperty('--theme-motif-overlay', motifOverlay);
  root.style.setProperty('--theme-motif-overlay-panel', motifOverlayPanel);
  root.style.setProperty('--theme-motif-overlay-input', motifOverlayInput);
  root.style.setProperty('--theme-interactive-gradient', interactiveGradient);
  root.style.setProperty('--theme-success', theme.colors.success);
  root.style.setProperty('--theme-warning', theme.colors.warning);
  root.style.setProperty('--theme-error', theme.colors.error);

  // Set UI interaction colors with smart fallbacks
  const selectionBg =
    theme.colors.selectionBg || `color-mix(in srgb, ${effectiveBrand} 25%, transparent)`;
  const selectionSourceColor = tryParseCssColorToRgb(selectionBg);
  const selectionColorHex = selectionSourceColor ? rgbToHex(selectionSourceColor) : effectiveBrand;
  const selectionWeight = clamp(
    tryParseCssColorAlpha(selectionBg) ??
      (theme.colors.selectionBg ? (isLightMode ? 0.18 : 0.24) : 0.25),
    0.12,
    0.36
  );
  const selectionText = pickAccessibleTextColorForSurfaces(
    [
      mixHexColors(selectionColorHex, appSurface, selectionWeight),
      mixHexColors(selectionColorHex, panelSurface, selectionWeight),
      mixHexColors(selectionColorHex, cardSurface, selectionWeight),
      mixHexColors(selectionColorHex, inputSurface, selectionWeight),
      mixHexColors(selectionColorHex, dropdownSurface, selectionWeight),
    ],
    textPrimaryResolved,
    getContrastTextColor(selectionColorHex)
  );
  // Ensure focus indicators and selection borders meet WCAG 2.2 §1.4.11
  // Non-text Contrast (3:1) and §2.4.13 Focus Appearance against every
  // neighbouring surface. The booster only nudges colors that originally
  // failed - high-contrast brand colors pass through untouched.
  const accessibleSelectedBorder = ensureNonTextContrast(
    selectedBorder,
    [appSurface, panelSurface, cardSurface],
    3.0
  );
  const focusRing = ensureNonTextContrast(
    theme.colors.focusRing || accessibleSelectedBorder,
    [appSurface, panelSurface, cardSurface],
    3.0
  );
  const highlightBg =
    theme.colors.highlightBg || `color-mix(in srgb, ${theme.colors.warning} 30%, transparent)`;
  const lineHighlight = theme.colors.lineHighlight || `color-mix(in srgb, ${gray6} 50%, ${gray7})`;
  const linkUnderline = theme.colors.linkUnderline || theme.colors.accent;
  const bracketMatch =
    theme.colors.bracketMatch || `color-mix(in srgb, ${effectiveBrand} 25%, transparent)`;

  root.style.setProperty('--theme-selection-bg', selectionBg);
  root.style.setProperty('--theme-selection-text', selectionText);
  root.style.setProperty('--theme-selection-border', accessibleSelectedBorder);
  root.style.setProperty('--theme-focus-ring', focusRing);
  root.style.setProperty('--theme-highlight-bg', highlightBg);
  root.style.setProperty('--theme-line-highlight', lineHighlight);
  root.style.setProperty('--theme-link-underline', linkUnderline);
  root.style.setProperty('--theme-bracket-match', bracketMatch);
  root.style.setProperty('--theme-surface-app', appSurface);
  root.style.setProperty('--theme-surface-panel', panelSurface);
  root.style.setProperty('--theme-surface-card', cardSurface);
  root.style.setProperty('--theme-surface-raised', raisedSurface);
  root.style.setProperty('--theme-surface-header', headerSurface);
  root.style.setProperty('--theme-surface-input', inputSurface);
  root.style.setProperty('--theme-surface-dropdown', dropdownSurface);
  root.style.setProperty('--theme-canvas-bg', appSurface);
  root.style.setProperty('--theme-text-on-app', textOnApp);
  root.style.setProperty('--theme-text-on-panel', textOnPanel);
  root.style.setProperty('--theme-text-on-card', textOnCard);
  root.style.setProperty('--theme-text-on-input', textOnInput);
  root.style.setProperty('--theme-text-on-dropdown', textOnDropdown);
  root.style.setProperty('--theme-selected-surface', selectedSurface);
  root.style.setProperty('--theme-selected-surface-hover', selectedSurfaceHover);
  root.style.setProperty('--theme-selected-text', selectedText);
  root.style.setProperty('--theme-selected-border', accessibleSelectedBorder);
  root.style.setProperty(
    '--theme-selected-scrim',
    colorToRgbaString(selectedSurface, isLightMode ? 0.16 : 0.24)
  );
  root.style.setProperty('--theme-interactive-hover-surface', interactiveHoverSurface);
  root.style.setProperty('--theme-interactive-active-surface', interactiveActiveSurface);
  root.style.setProperty('--theme-interactive-text', interactiveText);
  root.style.setProperty('--theme-surface-overlay-opacity', String(surfaceOverlayOpacity));
  root.style.setProperty('--theme-header-overlay-opacity', String(headerOverlayOpacity));
  root.style.setProperty('--theme-input-overlay-opacity', String(inputOverlayOpacity));
  root.style.setProperty('--theme-control-overlay-opacity', String(controlOverlayOpacity));
  root.style.setProperty('--theme-control-radius', controlRadius);
  root.style.setProperty('--theme-icon-radius', iconRadius);
  root.style.setProperty(
    '--theme-control-neutral-bg',
    `linear-gradient(180deg, color-mix(in srgb, ${raisedSurface} 94%, ${gray0}), color-mix(in srgb, ${cardSurface} 86%, ${gray7}))`
  );
  root.style.setProperty(
    '--theme-control-neutral-bg-hover',
    `linear-gradient(180deg, color-mix(in srgb, ${interactiveHoverSurface} 52%, ${raisedSurface}), color-mix(in srgb, ${cardSurface} 82%, ${interactiveHoverSurface}))`
  );
  root.style.setProperty(
    '--theme-control-neutral-bg-active',
    `linear-gradient(180deg, color-mix(in srgb, ${interactiveActiveSurface} 58%, ${raisedSurface}), color-mix(in srgb, ${cardSurface} 78%, ${interactiveActiveSurface}))`
  );
  root.style.setProperty(
    '--theme-control-border-strong',
    `color-mix(in srgb, ${gray4} 74%, ${gray5})`
  );
  root.style.setProperty(
    '--theme-control-border-soft',
    `color-mix(in srgb, ${gray4} 44%, ${gray5})`
  );
  root.style.setProperty(
    '--theme-control-highlight',
    `color-mix(in srgb, ${gray0} ${isLightMode ? 10 : 7}%, transparent)`
  );

  // Scrollbar theming
  const scrollbarThumb = theme.colors.scrollbarThumb || gray5;
  const scrollbarTrack = theme.colors.scrollbarTrack || gray8;
  root.style.setProperty('--theme-scrollbar-thumb', scrollbarThumb);
  root.style.setProperty('--theme-scrollbar-track', scrollbarTrack);

  // Input/dropdown backgrounds
  const inputBg = inputSurface;
  const dropdownBg = dropdownSurface;
  root.style.setProperty('--theme-input-bg', inputBg);
  root.style.setProperty('--theme-dropdown-bg', dropdownBg);

  // Syntax highlighting colors
  const syntaxKeyword = theme.colors.syntaxKeyword || theme.colors.accent;
  const syntaxString = theme.colors.syntaxString || theme.colors.success;
  const syntaxNumber = theme.colors.syntaxNumber || theme.colors.warning;
  const syntaxComment = theme.colors.syntaxComment || gray4;
  root.style.setProperty('--theme-syntax-keyword', syntaxKeyword);
  root.style.setProperty('--theme-syntax-string', syntaxString);
  root.style.setProperty('--theme-syntax-number', syntaxNumber);
  root.style.setProperty('--theme-syntax-comment', syntaxComment);

  // Gradient accent (for generate button, etc.) is applied above

  // Semantic colors
  const infoColor = theme.colors.infoColor || theme.colors.accent;
  const mutedText = normalizeHexColor(theme.colors.mutedText, textSecondaryResolved);
  const disabledOpacity = theme.colors.disabledOpacity ?? 0.45;
  const interactiveBg = normalizeHexColor(theme.colors.interactiveBg, interactiveHoverSurface);
  const borderSubtle =
    theme.colors.borderSubtle ||
    (isLightMode
      ? `color-mix(in srgb, ${gray4} 56%, ${gray5})`
      : `color-mix(in srgb, ${gray4} 42%, ${gray5})`);
  root.style.setProperty('--theme-info', infoColor);
  root.style.setProperty('--theme-muted-text', mutedText);
  root.style.setProperty('--theme-disabled-opacity', String(disabledOpacity));
  root.style.setProperty('--theme-interactive-bg', interactiveBg);
  root.style.setProperty('--theme-border-subtle', borderSubtle);
  const elevationMix = isLightMode
    ? strokeStyle === 'bold'
      ? 24
      : strokeStyle === 'subtle'
        ? 18
        : 21
    : strokeStyle === 'bold'
      ? 16
      : strokeStyle === 'subtle'
        ? 8
        : 12;
  root.style.setProperty(
    '--elevation-border',
    `${borderWidth}px ${borderStyle} color-mix(in srgb, var(--theme-gray-0) ${elevationMix}%, transparent)`
  );
  root.style.setProperty(
    '--elevation-border-subtle',
    `${borderWidth}px ${borderStyle} ${borderSubtle}`
  );

  // Overlay/backdrop color (Phase 5: allow custom override)
  const overlayColor = theme.colors.overlayColor || `color-mix(in srgb, ${gray9} 55%, transparent)`;
  root.style.setProperty('--theme-overlay', overlayColor);
  root.style.setProperty('--theme-overlay-blur', `${blurStrength}px`);
  root.style.setProperty('--theme-blur-strength', `${blurStrength}px`);

  // Computed contrast text colors for semantic backgrounds
  root.style.setProperty('--theme-success-text', getContrastTextColor(theme.colors.success));
  root.style.setProperty('--theme-warning-text', getContrastTextColor(theme.colors.warning));
  root.style.setProperty('--theme-error-text', getContrastTextColor(theme.colors.error));
  const tonePrimarySolid = mixHexColors(effectiveBrand, panelSurface, isLightMode ? 0.52 : 0.72);
  const tonePrimaryBg = `linear-gradient(${124 + (themeSeed % 42)}deg, color-mix(in srgb, ${effectiveBrand} ${Math.round(controlOverlayOpacity * 100)}%, transparent), transparent 62%), ${tonePrimarySolid}`;
  const tonePrimarySoft = `color-mix(in srgb, ${effectiveBrand} 22%, transparent)`;
  const tonePrimaryBorder = `color-mix(in srgb, ${effectiveBrand} 52%, transparent)`;
  const tonePrimaryGlow = `color-mix(in srgb, ${effectiveBrand} 40%, transparent)`;
  const toneSecondarySolid = mixHexColors(interactiveActiveSurface, panelSurface, 0.58);
  const toneSecondaryBg = `linear-gradient(135deg, color-mix(in srgb, ${theme.colors.accent} ${Math.round(controlOverlayOpacity * 72)}%, transparent), transparent 68%), ${toneSecondarySolid}`;
  const toneSecondarySoft = `color-mix(in srgb, ${gray5} 36%, transparent)`;
  const toneSecondaryBorder = `color-mix(in srgb, ${gray4} 68%, transparent)`;
  const toneSecondaryGlow = `color-mix(in srgb, ${gray4} 28%, transparent)`;
  const toneSuccessSolid = mixHexColors(
    theme.colors.success,
    panelSurface,
    isLightMode ? 0.42 : 0.62
  );
  const toneSuccessBg = `linear-gradient(135deg, color-mix(in srgb, ${theme.colors.success} ${Math.round(controlOverlayOpacity * 100)}%, transparent), transparent 62%), ${toneSuccessSolid}`;
  const toneSuccessSoft = `color-mix(in srgb, ${theme.colors.success} 24%, transparent)`;
  const toneSuccessBorder = `color-mix(in srgb, ${theme.colors.success} 56%, transparent)`;
  const toneSuccessGlow = `color-mix(in srgb, ${theme.colors.success} 42%, transparent)`;
  const toneWarningSolid = mixHexColors(
    theme.colors.warning,
    panelSurface,
    isLightMode ? 0.34 : 0.56
  );
  const toneWarningBg = `linear-gradient(135deg, color-mix(in srgb, ${theme.colors.warning} ${Math.round(controlOverlayOpacity * 100)}%, transparent), transparent 62%), ${toneWarningSolid}`;
  const toneWarningSoft = `color-mix(in srgb, ${theme.colors.warning} 24%, transparent)`;
  const toneWarningBorder = `color-mix(in srgb, ${theme.colors.warning} 56%, transparent)`;
  const toneWarningGlow = `color-mix(in srgb, ${theme.colors.warning} 42%, transparent)`;
  const toneDangerSolid = mixHexColors(theme.colors.error, panelSurface, isLightMode ? 0.36 : 0.58);
  const toneDangerBg = `linear-gradient(135deg, color-mix(in srgb, ${theme.colors.error} ${Math.round(controlOverlayOpacity * 100)}%, transparent), transparent 62%), ${toneDangerSolid}`;
  const toneDangerSoft = `color-mix(in srgb, ${theme.colors.error} 24%, transparent)`;
  const toneDangerBorder = `color-mix(in srgb, ${theme.colors.error} 56%, transparent)`;
  const toneDangerGlow = `color-mix(in srgb, ${theme.colors.error} 42%, transparent)`;
  const toneInfoSolid = mixHexColors(infoColor, panelSurface, isLightMode ? 0.42 : 0.62);
  const toneInfoBg = `linear-gradient(135deg, color-mix(in srgb, ${infoColor} ${Math.round(controlOverlayOpacity * 100)}%, transparent), transparent 62%), ${toneInfoSolid}`;
  const toneInfoSoft = `color-mix(in srgb, ${infoColor} 24%, transparent)`;
  const toneInfoBorder = `color-mix(in srgb, ${infoColor} 56%, transparent)`;
  const toneInfoGlow = `color-mix(in srgb, ${infoColor} 42%, transparent)`;
  root.style.setProperty('--theme-tone-primary-bg', tonePrimaryBg);
  root.style.setProperty('--theme-tone-primary-soft', tonePrimarySoft);
  root.style.setProperty('--theme-tone-primary-border', tonePrimaryBorder);
  root.style.setProperty(
    '--theme-tone-primary-text',
    pickAccessibleTextColor(
      tonePrimarySolid,
      textPrimaryResolved,
      getContrastTextColor(tonePrimarySolid)
    )
  );
  root.style.setProperty('--theme-tone-primary-glow', tonePrimaryGlow);
  root.style.setProperty('--theme-tone-secondary-bg', toneSecondaryBg);
  root.style.setProperty('--theme-tone-secondary-soft', toneSecondarySoft);
  root.style.setProperty('--theme-tone-secondary-border', toneSecondaryBorder);
  root.style.setProperty(
    '--theme-tone-secondary-text',
    pickAccessibleTextColor(
      toneSecondarySolid,
      textPrimaryResolved,
      getContrastTextColor(toneSecondarySolid)
    )
  );
  root.style.setProperty('--theme-tone-secondary-glow', toneSecondaryGlow);
  root.style.setProperty('--theme-tone-success-bg', toneSuccessBg);
  root.style.setProperty('--theme-tone-success-soft', toneSuccessSoft);
  root.style.setProperty('--theme-tone-success-border', toneSuccessBorder);
  root.style.setProperty(
    '--theme-tone-success-text',
    pickAccessibleTextColor(
      toneSuccessSolid,
      textPrimaryResolved,
      getContrastTextColor(toneSuccessSolid)
    )
  );
  root.style.setProperty('--theme-tone-success-glow', toneSuccessGlow);
  root.style.setProperty('--theme-tone-warning-bg', toneWarningBg);
  root.style.setProperty('--theme-tone-warning-soft', toneWarningSoft);
  root.style.setProperty('--theme-tone-warning-border', toneWarningBorder);
  root.style.setProperty(
    '--theme-tone-warning-text',
    pickAccessibleTextColor(
      toneWarningSolid,
      textPrimaryResolved,
      getContrastTextColor(toneWarningSolid)
    )
  );
  root.style.setProperty('--theme-tone-warning-glow', toneWarningGlow);
  root.style.setProperty('--theme-tone-danger-bg', toneDangerBg);
  root.style.setProperty('--theme-tone-danger-soft', toneDangerSoft);
  root.style.setProperty('--theme-tone-danger-border', toneDangerBorder);
  root.style.setProperty(
    '--theme-tone-danger-text',
    pickAccessibleTextColor(
      toneDangerSolid,
      textPrimaryResolved,
      getContrastTextColor(toneDangerSolid)
    )
  );
  root.style.setProperty('--theme-tone-danger-glow', toneDangerGlow);
  root.style.setProperty('--theme-tone-info-bg', toneInfoBg);
  root.style.setProperty('--theme-tone-info-soft', toneInfoSoft);
  root.style.setProperty('--theme-tone-info-border', toneInfoBorder);
  root.style.setProperty(
    '--theme-tone-info-text',
    pickAccessibleTextColor(toneInfoSolid, textPrimaryResolved, getContrastTextColor(toneInfoSolid))
  );
  root.style.setProperty('--theme-tone-info-glow', toneInfoGlow);

  // Progress system tokens (theme-specific, high-contrast)
  const progressTrackBg = `linear-gradient(180deg, color-mix(in srgb, ${gray8} 92%, ${gray7}), color-mix(in srgb, ${gray8} 84%, ${gray7}))`;
  const progressTrackBorder = `color-mix(in srgb, ${gray4} 62%, ${gray5})`;
  const progressTrackInset = `color-mix(in srgb, ${gray0} 10%, transparent)`;
  const progressFillStart = isLightMode
    ? `color-mix(in srgb, ${effectiveBrand} 58%, black)`
    : effectiveBrand;
  const progressFillEnd = isLightMode
    ? `color-mix(in srgb, ${theme.colors.accent} 56%, black)`
    : `color-mix(in srgb, ${effectiveBrand} 62%, ${theme.colors.accent})`;
  const progressFill = `linear-gradient(90deg, ${progressFillStart}, ${progressFillEnd})`;
  const progressFillComplete = isLightMode
    ? `linear-gradient(90deg, color-mix(in srgb, ${theme.colors.success} 58%, black), color-mix(in srgb, ${theme.colors.success} 52%, black))`
    : `linear-gradient(90deg, ${theme.colors.success}, color-mix(in srgb, ${theme.colors.success} 60%, ${theme.colors.accent}))`;
  const progressGlow = `color-mix(in srgb, ${effectiveBrand} 42%, transparent)`;
  const progressGlowComplete = `color-mix(in srgb, ${theme.colors.success} 42%, transparent)`;
  const progressStripeA = isLightMode
    ? `color-mix(in srgb, ${effectiveBrand} 70%, black)`
    : `color-mix(in srgb, ${effectiveBrand} 82%, ${theme.colors.accent})`;
  const progressStripeB = isLightMode
    ? `color-mix(in srgb, ${theme.colors.accent} 66%, black)`
    : `color-mix(in srgb, ${theme.colors.accent} 68%, ${effectiveBrand})`;
  const progressLabel = isLightMode
    ? `color-mix(in srgb, ${effectiveBrand} 56%, black)`
    : effectiveBrand;
  root.style.setProperty('--theme-progress-track-bg', progressTrackBg);
  root.style.setProperty('--theme-progress-track-border', progressTrackBorder);
  root.style.setProperty('--theme-progress-track-inset', progressTrackInset);
  root.style.setProperty('--theme-progress-fill', progressFill);
  root.style.setProperty('--theme-progress-fill-complete', progressFillComplete);
  root.style.setProperty('--theme-progress-glow', progressGlow);
  root.style.setProperty('--theme-progress-glow-complete', progressGlowComplete);
  root.style.setProperty('--theme-progress-stripe-a', progressStripeA);
  root.style.setProperty('--theme-progress-stripe-b', progressStripeB);
  root.style.setProperty('--theme-progress-label', progressLabel);

  // Shadow theming
  const shadowColor = theme.colors.shadowColor || 'rgba(0, 0, 0, 0.4)';
  const depthMultiplier = shadowDepth === 'soft' ? 0.8 : shadowDepth === 'dramatic' ? 1.3 : 1;
  const glowColor = theme.colors.glowColor || 'transparent';
  root.style.setProperty('--theme-shadow-color', shadowColor);
  root.style.setProperty('--theme-shadow-intensity', String(shadowIntensity));
  root.style.setProperty('--theme-shadow-depth', shadowDepth);
  root.style.setProperty('--theme-glow-color', glowColor);
  root.style.setProperty('--theme-glow-strength', String(glowStrength));
  const glowMix = Math.round(Math.max(0, Math.min(100, glowStrength * 75)));
  root.style.setProperty(
    '--theme-glow-color-strong',
    `color-mix(in srgb, ${glowColor} ${glowMix}%, transparent)`
  );
  // Apply shadow intensity to elevation shadows
  const shadowOpacity = 0.35 * shadowIntensity * depthMultiplier;
  root.style.setProperty(
    '--elevation-shadow-sm',
    `0 2px 4px color-mix(in srgb, ${shadowColor} ${shadowOpacity * 100}%, transparent)`
  );
  root.style.setProperty(
    '--elevation-shadow-md',
    `0 4px 12px color-mix(in srgb, ${shadowColor} ${shadowOpacity * 1.15 * 100}%, transparent)`
  );
  root.style.setProperty(
    '--elevation-shadow-lg',
    `0 8px 24px color-mix(in srgb, ${shadowColor} ${shadowOpacity * 1.4 * 100}%, transparent)`
  );

  // Animation theming
  const motionDefaults: {
    curve: string;
    speed: 'slow' | 'normal' | 'fast';
    multiplier: number;
    liftPx: number;
  } =
    motionProfile === 'calm'
      ? { curve: 'cubic-bezier(0.2, 0.8, 0.2, 1)', speed: 'slow', multiplier: 1.2, liftPx: 1 }
      : motionProfile === 'energetic'
        ? {
            curve: 'cubic-bezier(0.175, 0.885, 0.32, 1.275)',
            speed: 'fast',
            multiplier: 0.85,
            liftPx: 3,
          }
        : { curve: 'ease-out', speed: 'normal', multiplier: 1, liftPx: 2 };
  const animationCurve = theme.colors.animationCurve || motionDefaults.curve;
  const animationSpeed = theme.colors.animationSpeed || motionDefaults.speed;
  const hoverLift = theme.colors.hoverLift ?? true;
  const radiusMultiplier = radiusScale === 'compact' ? 0.88 : radiusScale === 'rounded' ? 1.22 : 1;
  root.style.setProperty('--theme-motion-profile', motionProfile);
  root.style.setProperty('--theme-motion-multiplier', String(motionDefaults.multiplier));
  root.style.setProperty(
    '--theme-hover-lift-distance',
    hoverLift ? `${motionDefaults.liftPx}px` : '0px'
  );
  root.style.setProperty('--theme-radius-scale', radiusScale);
  root.style.setProperty('--theme-radius-multiplier', String(radiusMultiplier));
  root.style.setProperty('--theme-animation-curve', animationCurve);
  root.style.setProperty('--theme-animation-speed', animationSpeed);
  root.style.setProperty('--theme-hover-lift', hoverLift ? '1' : '0');

  const activeGrayScale = [gray0, gray1, gray2, gray3, gray4, gray5, gray6, gray7, gray8, gray9];
  activeGrayScale.forEach((value, index) => {
    root.style.setProperty(`--theme-gray-${index}`, value);
    root.style.setProperty(`--mantine-color-invokeGray-${index}`, value);
  });

  const invokeGrayFilled = isLightMode ? gray5 : gray7;
  const invokeGrayFilledHover = isLightMode ? gray6 : gray6;
  root.style.setProperty('--mantine-color-invokeGray-filled', invokeGrayFilled);
  root.style.setProperty('--mantine-color-invokeGray-filled-hover', invokeGrayFilledHover);
  root.style.setProperty(
    '--mantine-color-invokeGray-light',
    `color-mix(in srgb, ${gray6} 36%, transparent)`
  );
  root.style.setProperty(
    '--mantine-color-invokeGray-light-hover',
    `color-mix(in srgb, ${gray6} 48%, transparent)`
  );
  root.style.setProperty('--mantine-color-invokeGray-light-color', gray0);
  root.style.setProperty('--mantine-color-invokeGray-outline', gray4);

  const invokeBrandScale = [
    `color-mix(in srgb, ${effectiveBrand} 8%, white)`,
    `color-mix(in srgb, ${effectiveBrand} 16%, white)`,
    `color-mix(in srgb, ${effectiveBrand} 28%, white)`,
    `color-mix(in srgb, ${effectiveBrand} 40%, white)`,
    `color-mix(in srgb, ${effectiveBrand} 56%, white)`,
    `color-mix(in srgb, ${effectiveBrand} 72%, black)`,
    effectiveBrand,
    `color-mix(in srgb, ${effectiveBrand} 84%, black)`,
    `color-mix(in srgb, ${effectiveBrand} 70%, black)`,
    `color-mix(in srgb, ${effectiveBrand} 56%, black)`,
  ];
  invokeBrandScale.forEach((value, index) => {
    root.style.setProperty(`--mantine-color-invokeBrand-${index}`, value);
  });
  root.style.setProperty('--mantine-color-invokeBrand-filled', effectiveBrand);
  root.style.setProperty(
    '--mantine-color-invokeBrand-filled-hover',
    `color-mix(in srgb, ${effectiveBrand} 86%, black)`
  );
  root.style.setProperty(
    '--mantine-color-invokeBrand-light',
    `color-mix(in srgb, ${effectiveBrand} 18%, transparent)`
  );
  root.style.setProperty(
    '--mantine-color-invokeBrand-light-hover',
    `color-mix(in srgb, ${effectiveBrand} 26%, transparent)`
  );
  root.style.setProperty('--mantine-color-invokeBrand-light-color', effectiveBrand);
  root.style.setProperty('--mantine-color-invokeBrand-outline', effectiveBrand);

  root.style.setProperty('--mantine-primary-color-filled', effectiveBrand);
  root.style.setProperty(
    '--mantine-primary-color-filled-hover',
    `color-mix(in srgb, ${effectiveBrand} 86%, black)`
  );
  root.style.setProperty(
    '--mantine-primary-color-light',
    `color-mix(in srgb, ${effectiveBrand} 18%, transparent)`
  );
  root.style.setProperty(
    '--mantine-primary-color-light-hover',
    `color-mix(in srgb, ${effectiveBrand} 26%, transparent)`
  );
  root.style.setProperty('--mantine-primary-color-light-color', effectiveBrand);
  root.style.setProperty('--mantine-primary-color-outline', effectiveBrand);
  root.style.setProperty('--mantine-primary-color-contrast', getContrastTextColor(effectiveBrand));

  root.style.setProperty('--mantine-color-text', textPrimaryResolved);
  root.style.setProperty('--mantine-color-dimmed', textSecondaryResolved);
  root.style.setProperty('--mantine-color-body', appSurface);

  root.style.setProperty('--theme-text-primary', textPrimaryResolved);
  root.style.setProperty('--theme-text-secondary', textSecondaryResolved);

  // Phase 5: Typography - theme font stacks
  const defaultFontFamily =
    style.family === 'glyph'
      ? '"Sora", "Space Grotesk", "Segoe UI", sans-serif'
      : style.family === 'material'
        ? '"Manrope", "Nunito Sans", "Segoe UI Variable Text", "Segoe UI", sans-serif'
        : '"Inter", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  const defaultFontHeading =
    style.family === 'glyph'
      ? '"Space Grotesk", "Sora", "Segoe UI Semibold", sans-serif'
      : style.family === 'material'
        ? '"Manrope", "Segoe UI Semibold", "Nunito Sans", sans-serif'
        : defaultFontFamily;
  const defaultFontMono =
    style.family === 'glyph'
      ? '"JetBrains Mono", "Cascadia Mono", "SF Mono", Consolas, monospace'
      : '"JetBrains Mono", "Fira Code", "SF Mono", Consolas, monospace';
  const fontFamily = theme.colors.fontFamily || defaultFontFamily;
  const fontHeading = theme.colors.fontHeading || defaultFontHeading;
  const fontMono = theme.colors.fontMono || defaultFontMono;
  const uiLetterSpacing =
    style.family === 'glyph' ? '0.045em' : style.family === 'material' ? '0.02em' : '0.04em';
  const uiTransform = 'none';
  const iconStrokeWidth =
    style.family === 'glyph' ? '2' : style.family === 'material' ? '1.85' : '1.75';
  root.style.setProperty('--theme-font-family', fontFamily);
  root.style.setProperty('--font-primary', fontFamily);
  root.style.setProperty('--font-heading', fontHeading);
  root.style.setProperty('--font-secondary', fontMono);
  root.style.setProperty('--theme-ui-letter-spacing', uiLetterSpacing);
  root.style.setProperty('--theme-ui-transform', uiTransform);
  root.style.setProperty('--theme-icon-stroke-width', iconStrokeWidth);
}

// Initialize theme on app load. Reads persisted state directly so the first paint can
// happen before Zustand finishes hydration. Also wires up the OS color-scheme listener.
export function initializeTheme() {
  attachSystemSchemeListener();
  const storedTheme = localStorage.getItem('swarmui-theme');
  if (storedTheme) {
    try {
      const parsed = JSON.parse(storedTheme);
      const state = parsed.state || {};
      const version = typeof parsed.version === 'number' ? parsed.version : 0;
      // Resolve the active theme ID under either schema (v3 single-slot or v4 dual-slot).
      let mode: ThemeMode;
      let lightId: string;
      let darkId: string;
      if (version >= 4) {
        mode = (state.themeMode as ThemeMode) || 'dark';
        lightId = (state.lightThemeId as string) || DEFAULT_LIGHT_THEME_ID;
        darkId = (state.darkThemeId as string) || DEFAULT_DARK_THEME_ID;
      } else {
        const legacyIsLight = Boolean(state.isLightMode);
        const legacyCurrent = (state.currentTheme as string) || DEFAULT_DARK_THEME_ID;
        mode = legacyIsLight ? 'light' : 'dark';
        lightId = legacyIsLight ? legacyCurrent : DEFAULT_LIGHT_THEME_ID;
        darkId = legacyIsLight ? DEFAULT_DARK_THEME_ID : legacyCurrent;
      }
      const resolved = resolveScheme(mode);
      const activeId = resolved === 'light' ? lightId : darkId;
      const theme = THEME_PALETTES.find((t) => t.id === activeId) || THEME_PALETTES[0];
      applyThemeToCSS(theme, resolved === 'light', state.customAccent || null, {
        controlShape: state.controlShapeOverride || null,
        iconShape: state.iconShapeOverride || null,
      });
    } catch {
      applyThemeToCSS(THEME_PALETTES[0], false, null);
    }
  } else {
    applyThemeToCSS(THEME_PALETTES[0], false, null);
  }
}
