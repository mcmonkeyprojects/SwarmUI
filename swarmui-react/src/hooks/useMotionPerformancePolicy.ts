import { useMemo } from 'react';
import { useReducedMotion } from 'framer-motion';
import { usePerformanceSessionStore } from '../stores/performanceSessionStore';

interface MotionPerformancePolicyOptions {
  isGenerating?: boolean;
  itemCount?: number;
  forceReduced?: boolean;
  largeListThreshold?: number;
  degradedLagThresholdMs?: number;
}

interface MotionPerformancePolicy {
  shouldReduceMotion: boolean;
  enableLayoutMotion: boolean;
  enableItemMotion: boolean;
  enableHoverMotion: boolean;
  reason: 'normal' | 'reduced-motion' | 'generating' | 'large-list' | 'event-loop';
}

export function useMotionPerformancePolicy({
  isGenerating = false,
  itemCount = 0,
  forceReduced = false,
  largeListThreshold = 32,
  degradedLagThresholdMs = 80,
}: MotionPerformancePolicyOptions = {}): MotionPerformancePolicy {
  const prefersReducedMotion = useReducedMotion();
  const lastLagMs = usePerformanceSessionStore((state) => state.eventLoop.lastLagMs);

  return useMemo(() => {
    const hasLargeList = itemCount >= largeListThreshold;
    const hasEventLoopPressure = lastLagMs >= degradedLagThresholdMs;
    const shouldReduceMotion = forceReduced
      || Boolean(prefersReducedMotion)
      || isGenerating
      || hasLargeList
      || hasEventLoopPressure;

    const reason: MotionPerformancePolicy['reason'] = forceReduced || prefersReducedMotion
      ? 'reduced-motion'
      : isGenerating
        ? 'generating'
        : hasLargeList
          ? 'large-list'
          : hasEventLoopPressure
            ? 'event-loop'
            : 'normal';

    return {
      shouldReduceMotion,
      enableLayoutMotion: !shouldReduceMotion,
      enableItemMotion: !shouldReduceMotion,
      enableHoverMotion: !shouldReduceMotion && itemCount < largeListThreshold,
      reason,
    };
  }, [
    degradedLagThresholdMs,
    forceReduced,
    isGenerating,
    itemCount,
    largeListThreshold,
    lastLagMs,
    prefersReducedMotion,
  ]);
}
