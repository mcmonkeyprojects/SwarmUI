import { useState, useEffect, useRef } from 'react';
import { swarmClient } from '../api/client';
import { estimateTokenCount } from '../utils/tokenCounter';
import { useSessionStore } from '../stores/session';

interface UseTokenCountOptions {
  debounceMs?: number;
  skipPromptSyntax?: boolean;
  tokenset?: string;
  weighting?: boolean;
}

interface UseTokenCountReturn {
  tokenCount: number;
  isEstimate: boolean;
  isLoading: boolean;
}

const TOKEN_COUNT_CACHE_LIMIT = 128;
const tokenCountCache = new Map<string, number>();
const tokenCountInflight = new Map<string, Promise<number>>();

function buildTokenCountCacheKey(
  text: string,
  skipPromptSyntax: boolean,
  tokenset: string,
  weighting: boolean
): string {
  return JSON.stringify([text, skipPromptSyntax, tokenset, weighting]);
}

function readCachedTokenCount(key: string): number | null {
  const value = tokenCountCache.get(key);
  if (value === undefined) {
    return null;
  }

  tokenCountCache.delete(key);
  tokenCountCache.set(key, value);
  return value;
}

function writeCachedTokenCount(key: string, value: number): void {
  tokenCountCache.set(key, value);
  if (tokenCountCache.size <= TOKEN_COUNT_CACHE_LIMIT) {
    return;
  }

  const oldestKey = tokenCountCache.keys().next().value;
  if (oldestKey) {
    tokenCountCache.delete(oldestKey);
  }
}

function requestTokenCount(
  key: string,
  params: {
    text: string;
    skipPromptSyntax: boolean;
    tokenset: string;
    weighting: boolean;
  }
): Promise<number> {
  const cached = readCachedTokenCount(key);
  if (cached !== null) {
    return Promise.resolve(cached);
  }

  const existing = tokenCountInflight.get(key);
  if (existing) {
    return existing;
  }

  const request = swarmClient.countTokens(params)
    .then((result) => {
      writeCachedTokenCount(key, result.count);
      return result.count;
    })
    .finally(() => {
      tokenCountInflight.delete(key);
    });

  tokenCountInflight.set(key, request);
  return request;
}

export function useTokenCount(
  text: string,
  options: UseTokenCountOptions = {}
): UseTokenCountReturn {
  const {
    debounceMs = 500,
    skipPromptSyntax = false,
    tokenset = 'clip',
    weighting = true,
  } = options;

  const isInitialized = useSessionStore((state) => state.isInitialized);
  const [serverCount, setServerCount] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestIdRef = useRef(0);

  const localEstimate = estimateTokenCount(text);
  const cacheKey = buildTokenCountCacheKey(text, skipPromptSyntax, tokenset, weighting);

  useEffect(() => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;

    if (!text.trim() || !isInitialized) {
      queueMicrotask(() => {
        setIsLoading(false);
        setServerCount(0);
      });
      return;
    }

    const cachedCount = readCachedTokenCount(cacheKey);
    if (cachedCount !== null) {
      queueMicrotask(() => {
        setIsLoading(false);
        setServerCount(cachedCount);
      });
      return;
    }

    queueMicrotask(() => {
      setServerCount(null);
    });

    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }

    timerRef.current = setTimeout(async () => {
      setIsLoading(true);
      try {
        const count = await requestTokenCount(cacheKey, {
          text,
          skipPromptSyntax,
          tokenset,
          weighting,
        });
        if (requestIdRef.current === requestId) {
          setServerCount(count);
        }
      } catch {
        // Silently fall back to local estimate
      } finally {
        if (requestIdRef.current === requestId) {
          setIsLoading(false);
        }
      }
    }, debounceMs);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
      if (requestIdRef.current === requestId) {
        setIsLoading(false);
      }
    };
  }, [cacheKey, text, debounceMs, skipPromptSyntax, tokenset, weighting, isInitialized]);

  return {
    tokenCount: serverCount ?? localEstimate,
    isEstimate: serverCount === null,
    isLoading,
  };
}
