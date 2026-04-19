import { useEffect, useRef } from 'react';
import { useImageProcessing } from './useImageProcessing';
import { useThemeStore } from '../store/themeStore';
import {
  adaptiveAccentCache,
  adaptiveAccentInflight,
  type AdaptiveAccentSample,
  useAdaptiveAccentStore,
} from '../store/adaptiveAccentStore';

interface RgbColor {
  r: number;
  g: number;
  b: number;
}

function normalizeHexColor(input: string | null | undefined, fallback: string): string {
  if (!input) {
    return fallback;
  }

  const trimmed = input.trim();
  if (!trimmed) {
    return fallback;
  }

  const normalized = trimmed.startsWith('#') ? trimmed : `#${trimmed}`;
  const shortMatch = /^#([0-9a-fA-F]{3})$/.exec(normalized);
  if (shortMatch) {
    const expanded = shortMatch[1].split('').map((value) => value + value).join('');
    return `#${expanded.toLowerCase()}`;
  }

  if (/^#([0-9a-fA-F]{6})$/.test(normalized)) {
    return normalized.toLowerCase();
  }

  return fallback;
}

function hexToRgb(input: string): RgbColor | null {
  const normalized = normalizeHexColor(input, '');
  if (!normalized) {
    return null;
  }

  const match = /^#([0-9a-f]{6})$/i.exec(normalized);
  if (!match) {
    return null;
  }

  return {
    r: Number.parseInt(match[1].slice(0, 2), 16),
    g: Number.parseInt(match[1].slice(2, 4), 16),
    b: Number.parseInt(match[1].slice(4, 6), 16),
  };
}

function relativeLuminance(color: string): number {
  const rgb = hexToRgb(color);
  if (!rgb) {
    return 0;
  }

  const normalizeChannel = (value: number): number => {
    const channel = value / 255;
    return channel <= 0.03928
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4;
  };

  const r = normalizeChannel(rgb.r);
  const g = normalizeChannel(rgb.g);
  const b = normalizeChannel(rgb.b);
  return (0.2126 * r) + (0.7152 * g) + (0.0722 * b);
}

function contrastRatio(first: string, second: string): number {
  const firstLum = relativeLuminance(first);
  const secondLum = relativeLuminance(second);
  const lighter = Math.max(firstLum, secondLum);
  const darker = Math.min(firstLum, secondLum);
  return (lighter + 0.05) / (darker + 0.05);
}

function colorDistance(first: string, second: string): number {
  const firstRgb = hexToRgb(first);
  const secondRgb = hexToRgb(second);
  if (!firstRgb || !secondRgb) {
    return Number.POSITIVE_INFINITY;
  }

  return Math.abs(firstRgb.r - secondRgb.r) + Math.abs(firstRgb.g - secondRgb.g) + Math.abs(firstRgb.b - secondRgb.b);
}

function normalizeImageUrl(imageUrl: string): string {
  const trimmed = imageUrl.trim();
  if (!trimmed) {
    return '';
  }

  try {
    return new URL(trimmed, window.location.href).href.replace(/#.*$/, '');
  } catch {
    return trimmed;
  }
}

function chooseSampledAccent(dominantColor: string, palette: string[], baseBrand: string): string {
  const candidates = [dominantColor, ...palette];
  let bestColor = normalizeHexColor(dominantColor, baseBrand);
  let bestScore = Number.NEGATIVE_INFINITY;

  for (const candidate of candidates) {
    const normalized = normalizeHexColor(candidate, '');
    if (!normalized) {
      continue;
    }

    const rgb = hexToRgb(normalized);
    if (!rgb) {
      continue;
    }

    const saturation = Math.max(rgb.r, rgb.g, rgb.b) - Math.min(rgb.r, rgb.g, rgb.b);
    const contrast = contrastRatio(normalized, baseBrand);
    const distance = colorDistance(normalized, baseBrand);
    const score = saturation + (contrast * 24) + (distance / 12);

    if (score > bestScore) {
      bestScore = score;
      bestColor = normalized;
    }
  }

  return bestColor;
}

function buildAdaptiveSample(
  sourceImageUrl: string,
  extracted: { dominant: string; palette: string[] },
  baseBrand: string
): AdaptiveAccentSample {
  const sampledAccent = chooseSampledAccent(extracted.dominant, extracted.palette, baseBrand);
  return {
    sourceImageUrl,
    dominantColor: normalizeHexColor(extracted.dominant, baseBrand),
    palette: extracted.palette.map((color) => normalizeHexColor(color, baseBrand)),
    sampledAccent,
  };
}

export function useAdaptiveAccentPipeline(): void {
  const imageProcessing = useImageProcessing();
  const sourceImageUrl = useAdaptiveAccentStore((state) => state.sourceImageUrl);
  const setSample = useAdaptiveAccentStore((state) => state.setSample);
  const setIsExtracting = useAdaptiveAccentStore((state) => state.setIsExtracting);
  const setLastError = useAdaptiveAccentStore((state) => state.setLastError);
  const clearAdaptiveAccent = useAdaptiveAccentStore((state) => state.clearAdaptiveAccent);
  const enabled = useThemeStore((state) => state.adaptiveImageAccentEnabled);
  const currentTheme = useThemeStore((state) => state.currentTheme);
  const resolvedColorScheme = useThemeStore((state) => state.resolvedColorScheme);
  const customAccent = useThemeStore((state) => state.customAccent);
  const setAdaptiveAccent = useThemeStore((state) => state.setAdaptiveAccent);
  const publishSignatureRef = useRef<string | null>(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    if (!enabled) {
      publishSignatureRef.current = null;
      clearAdaptiveAccent();
      setAdaptiveAccent(null);
      setLastError(null);
      return;
    }

    if (!sourceImageUrl) {
      publishSignatureRef.current = null;
      clearAdaptiveAccent();
      setAdaptiveAccent(null);
      setLastError(null);
      return;
    }

    const normalizedUrl = normalizeImageUrl(sourceImageUrl);
    if (!normalizedUrl) {
      return;
    }

    if (!imageProcessing.isReady) {
      return;
    }

    const themeStore = useThemeStore.getState();
    const theme = themeStore.getTheme();
    const baseBrand = normalizeHexColor(themeStore.customAccent || theme.colors.brand, theme.colors.brand);
    const signature = `${normalizedUrl}|${currentTheme}|${resolvedColorScheme}|${customAccent || ''}|${baseBrand}`;
    if (publishSignatureRef.current === signature) {
      return;
    }

    const publish = (sample: AdaptiveAccentSample) => {
      setSample(sample);
      setAdaptiveAccent(sample.sampledAccent);
      setLastError(null);
      publishSignatureRef.current = signature;
    };

    const cached = adaptiveAccentCache.get(normalizedUrl);
    if (cached) {
      publish(cached);
      return;
    }

    let cancelled = false;
    const requestId = ++requestIdRef.current;
    setIsExtracting(true);
    setLastError(null);

    const runExtraction = async () => {
      let samplePromise: Promise<AdaptiveAccentSample | null> | undefined;

      try {
        samplePromise = adaptiveAccentInflight.get(normalizedUrl);
        if (!samplePromise) {
          samplePromise = (async () => {
            const extracted = await imageProcessing.extractColors(normalizedUrl);
            const builtSample = buildAdaptiveSample(normalizedUrl, extracted, baseBrand);
            adaptiveAccentCache.set(normalizedUrl, builtSample);
            return builtSample;
          })();
          adaptiveAccentInflight.set(normalizedUrl, samplePromise);
        }

        const sample = await samplePromise;
        if (cancelled || requestId !== requestIdRef.current || !sample) {
          return;
        }

        publish(sample);
      } catch (error) {
        if (!cancelled && requestId === requestIdRef.current) {
          const message = error instanceof Error ? error.message : 'Failed to extract adaptive accent.';
          setLastError(message);
        }
      } finally {
        if (!cancelled && requestId === requestIdRef.current) {
          setIsExtracting(false);
        }
        const inFlight = adaptiveAccentInflight.get(normalizedUrl);
        if (inFlight && samplePromise && inFlight === samplePromise) {
          adaptiveAccentInflight.delete(normalizedUrl);
        }
      }
    };

    void runExtraction();

    return () => {
      cancelled = true;
    };
  }, [
    enabled,
    sourceImageUrl,
    currentTheme,
    resolvedColorScheme,
    customAccent,
    imageProcessing.isReady,
    clearAdaptiveAccent,
    setAdaptiveAccent,
    setIsExtracting,
    setLastError,
    setSample,
  ]);
}
