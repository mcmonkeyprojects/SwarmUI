/**
 * PrefetchLink Component
 * 
 * Navigation component that prefetches route on hover.
 * Works with the app's SegmentedControl navigation.
 */

import { memo, useCallback, useRef } from 'react';
import { Box } from '@mantine/core';
import type { ReactNode } from 'react';

// Lazy import map for route prefetching
const routeImports = {
    generate: () => import('../pages/GeneratePage'),
    history: () => import('../pages/HistoryPage'),
    queue: () => import('../pages/QueuePage'),
    workflows: () => import('../pages/WorkflowPage'),
    server: () => import('../pages/ServerPage'),
    roleplay: () => import('../pages/RoleplayPage'),
} as const;

type RouteName = keyof typeof routeImports;

// Track prefetched routes
const prefetchedRoutes = new Set<RouteName>();

interface PrefetchLinkProps {
    /** Route to prefetch */
    route: RouteName;
    /** Child content */
    children: ReactNode;
    /** Delay before prefetch triggers (ms) */
    delay?: number;
    /** Click handler */
    onClick?: () => void;
    /** Additional class name */
    className?: string;
}

/**
 * Link wrapper that prefetches route code on hover
 */
export const PrefetchLink = memo(function PrefetchLink({
    route,
    children,
    delay = 100,
    onClick,
    className,
}: PrefetchLinkProps) {
    const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const handleMouseEnter = useCallback(() => {
        // Skip if already prefetched
        if (prefetchedRoutes.has(route)) return;

        timeoutRef.current = setTimeout(() => {
            const importFn = routeImports[route];
            if (importFn) {
                importFn()
                    .then(() => {
                        prefetchedRoutes.add(route);
                    })
                    .catch(() => {
                        // Silently fail - prefetch is best-effort
                    });
            }
        }, delay);
    }, [route, delay]);

    const handleMouseLeave = useCallback(() => {
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
        }
    }, []);

    return (
        <Box
            component="span"
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            onClick={onClick}
            className={className}
            style={{ display: 'inline-flex', cursor: 'pointer' }}
        >
            {children}
        </Box>
    );
});

PrefetchLink.displayName = 'PrefetchLink';

/**
 * Prefetch a route imperatively
 */
// eslint-disable-next-line react-refresh/only-export-components
export function prefetchRoute(route: RouteName): void {
    if (prefetchedRoutes.has(route)) return;

    const importFn = routeImports[route];
    if (importFn) {
        importFn()
            .then(() => {
                prefetchedRoutes.add(route);
            })
            .catch(() => {
                // Silently fail
            });
    }
}

/**
 * Prefetch all routes (call on idle)
 */
// eslint-disable-next-line react-refresh/only-export-components
export function prefetchAllRoutes(): void {
    Object.keys(routeImports).forEach((route) => {
        prefetchRoute(route as RouteName);
    });
}

/**
 * Check if route is prefetched
 */
// eslint-disable-next-line react-refresh/only-export-components
export function isRoutePrefetched(route: RouteName): boolean {
    return prefetchedRoutes.has(route);
}

export default PrefetchLink;
