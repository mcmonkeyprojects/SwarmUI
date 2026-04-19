import { create } from 'zustand';

export interface AdaptiveAccentSample {
  sourceImageUrl: string;
  dominantColor: string;
  palette: string[];
  sampledAccent: string;
}

interface AdaptiveAccentStore {
  sourceImageUrl: string | null;
  sample: AdaptiveAccentSample | null;
  isExtracting: boolean;
  lastError: string | null;
  setSourceImageUrl: (url: string | null) => void;
  setSample: (sample: AdaptiveAccentSample | null) => void;
  setIsExtracting: (isExtracting: boolean) => void;
  setLastError: (error: string | null) => void;
  clearAdaptiveAccent: () => void;
}

export const adaptiveAccentCache = new Map<string, AdaptiveAccentSample>();
export const adaptiveAccentInflight = new Map<string, Promise<AdaptiveAccentSample | null>>();

export const useAdaptiveAccentStore = create<AdaptiveAccentStore>()((set) => ({
  sourceImageUrl: null,
  sample: null,
  isExtracting: false,
  lastError: null,

  setSourceImageUrl: (url: string | null) => set({ sourceImageUrl: url }),
  setSample: (sample: AdaptiveAccentSample | null) => set({ sample }),
  setIsExtracting: (isExtracting: boolean) => set({ isExtracting }),
  setLastError: (error: string | null) => set({ lastError: error }),
  clearAdaptiveAccent: () => set({
    sample: null,
    isExtracting: false,
    lastError: null,
  }),
}));
