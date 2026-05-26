import React, { useMemo, useRef } from 'react';
import type { CSSProperties } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Box, Skeleton } from '@mantine/core';

export interface VirtualGridProps<T> {
    /** Items to render in the grid */
    items: T[];
    /** Render function for each item */
    renderItem: (item: T, index: number) => React.ReactNode;
    /** Number of columns (or responsive object) */
    columns: number | { base?: number; xs?: number; sm?: number; md?: number; lg?: number; xl?: number };
    /** Height of each row in pixels */
    rowHeight: number;
    /** Height of the scroll container */
    containerHeight: number | string;
    /** Gap between items in pixels */
    gap?: number;
    /** Number of rows to render outside visible area */
    overscan?: number;
    /** Empty state component */
    emptyState?: React.ReactNode;
    /** Loading state */
    loading?: boolean;
    /** Number of skeleton items to show when loading */
    skeletonCount?: number;
    /** Custom className for the container */
    className?: string;
    /** Custom style for the container */
    style?: CSSProperties;
}

/**
 * Get the number of columns based on window width and responsive config
 */
function resolveColumnCount(
    columns: number | { base?: number; xs?: number; sm?: number; md?: number; lg?: number; xl?: number },
    width: number
): number {
    if (typeof columns === 'number') {
        return columns;
    }

    let columnCount = columns.base || 1;
    if (width >= 1400 && columns.xl) columnCount = columns.xl;
    else if (width >= 1200 && columns.lg) columnCount = columns.lg;
    else if (width >= 992 && columns.md) columnCount = columns.md;
    else if (width >= 768 && columns.sm) columnCount = columns.sm;
    else if (width >= 576 && columns.xs) columnCount = columns.xs;

    return columnCount;
}

function useResponsiveColumns(
    columns: number | { base?: number; xs?: number; sm?: number; md?: number; lg?: number; xl?: number },
    containerRef: React.RefObject<HTMLElement | null>
): number {
    const [containerWidth, setContainerWidth] = React.useState<number>(() => {
        if (typeof window === 'undefined') return 1200;
        return window.innerWidth;
    });

    React.useEffect(() => {
        if (typeof columns === 'number') return;

        const element = containerRef.current;
        if (!element) return;

        const updateFromElement = () => {
            setContainerWidth(element.clientWidth || window.innerWidth);
        };

        updateFromElement();

        const observer = new ResizeObserver((entries) => {
            const entry = entries[0];
            if (!entry) return;
            setContainerWidth(entry.contentRect.width);
        });

        observer.observe(element);

        return () => observer.disconnect();
    }, [columns, containerRef]);

    return useMemo(
        () => resolveColumnCount(columns, containerWidth),
        [columns, containerWidth]
    );
}

/**
 * VirtualGrid - A virtualized grid component for rendering large lists efficiently
 * 
 * Only renders items that are visible in the viewport, significantly improving
 * performance for large collections.
 * 
 * @example
 * ```tsx
 * <VirtualGrid
 *   items={models}
 *   columns={{ base: 2, sm: 3, md: 4, lg: 6 }}
 *   rowHeight={200}
 *   containerHeight={500}
 *   gap={16}
 *   renderItem={(model, index) => (
 *     <ModelCard key={model.name} model={model} />
 *   )}
 * />
 * ```
 */
export function VirtualGrid<T>({
    items,
    renderItem,
    columns,
    rowHeight,
    containerHeight,
    gap = 16,
    overscan = 3,
    emptyState,
    loading = false,
    skeletonCount = 12,
    className,
    style,
}: VirtualGridProps<T>) {
    const parentRef = useRef<HTMLDivElement>(null);
    const columnCount = useResponsiveColumns(columns, parentRef);

    const rowCount = Math.ceil(items.length / columnCount);

    // TanStack Virtual returns imperative helpers that React Compiler intentionally skips.
    // eslint-disable-next-line react-hooks/incompatible-library
    const virtualizer = useVirtualizer({
        count: rowCount,
        getScrollElement: () => parentRef.current,
        estimateSize: () => rowHeight + gap,
        overscan,
    });

    const virtualRows = virtualizer.getVirtualItems();
    const totalHeight = virtualizer.getTotalSize();

    // Get items for a specific row
    const getRowItems = (rowIndex: number): { item: T; index: number }[] => {
        const startIndex = rowIndex * columnCount;
        const rowItems: { item: T; index: number }[] = [];

        for (let i = 0; i < columnCount; i++) {
            const itemIndex = startIndex + i;
            if (itemIndex < items.length) {
                rowItems.push({ item: items[itemIndex], index: itemIndex });
            }
        }

        return rowItems;
    };

    // Loading state with skeletons
    if (loading) {
        return (
            <Box
                ref={parentRef}
                style={{
                    height: containerHeight,
                    overflow: 'auto',
                    ...style,
                }}
                className={className}
            >
                <div
                    style={{
                        display: 'grid',
                        gridTemplateColumns: `repeat(${columnCount}, 1fr)`,
                        gap: `${gap}px`,
                        padding: gap,
                    }}
                >
                    {Array.from({ length: skeletonCount }).map((_, i) => (
                        <Skeleton key={i} height={rowHeight - gap} radius="md" />
                    ))}
                </div>
            </Box>
        );
    }

    // Empty state
    if (items.length === 0) {
        return (
            <Box
                style={{
                    height: containerHeight,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    ...style,
                }}
                className={className}
            >
                {emptyState || <div>No items to display</div>}
            </Box>
        );
    }

    return (
        <Box
            ref={parentRef}
            style={{
                height: containerHeight,
                overflowY: 'auto',
                overflowX: 'hidden',
                ...style,
            }}
            className={className}
        >
            <div
                style={{
                    height: totalHeight,
                    width: '100%',
                    position: 'relative',
                }}
            >
                {virtualRows.map((virtualRow) => {
                    const rowItems = getRowItems(virtualRow.index);

                    return (
                        <div
                            key={virtualRow.key}
                            style={{
                                position: 'absolute',
                                top: 0,
                                left: 0,
                                width: '100%',
                                height: virtualRow.size,
                                transform: `translateY(${virtualRow.start}px)`,
                            }}
                        >
                            <div
                                style={{
                                    display: 'grid',
                                    gridTemplateColumns: `repeat(${columnCount}, 1fr)`,
                                    gap: `${gap}px`,
                                    padding: `0 ${gap}px`,
                                    height: '100%',
                                    alignItems: 'start',
                                    maxWidth: '100%',
                                    boxSizing: 'border-box',
                                }}
                            >
                                {rowItems.map(({ item, index }) => (
                                    <div
                                        key={index}
                                        style={{
                                            minHeight: rowHeight,
                                            display: 'flex',
                                            flexDirection: 'column',
                                        }}
                                    >
                                        {renderItem(item, index)}
                                    </div>
                                ))}
                            </div>
                        </div>
                    );
                })}
            </div>
        </Box>
    );
}

export interface VirtualListProps<T> {
    /** Items to render in the list */
    items: T[];
    /** Render function for each item */
    renderItem: (item: T, index: number) => React.ReactNode;
    /** Height of each item in pixels */
    itemHeight: number;
    /** Height of the scroll container */
    containerHeight: number | string;
    /** Gap between items in pixels */
    gap?: number;
    /** Number of items to render outside visible area */
    overscan?: number;
    /** Empty state component */
    emptyState?: React.ReactNode;
    /** Loading state */
    loading?: boolean;
    /** Number of skeleton items to show when loading */
    skeletonCount?: number;
    /** Custom className for the container */
    className?: string;
    /** Custom style for the container */
    style?: CSSProperties;
}

/**
 * VirtualList - A virtualized list component for rendering large lists efficiently
 * 
 * @example
 * ```tsx
 * <VirtualList
 *   items={loras}
 *   itemHeight={60}
 *   containerHeight={400}
 *   gap={8}
 *   renderItem={(lora, index) => (
 *     <LoraListItem key={lora.name} lora={lora} />
 *   )}
 * />
 * ```
 */
export function VirtualList<T>({
    items,
    renderItem,
    itemHeight,
    containerHeight,
    gap = 8,
    overscan = 5,
    emptyState,
    loading = false,
    skeletonCount = 10,
    className,
    style,
}: VirtualListProps<T>) {
    const parentRef = useRef<HTMLDivElement>(null);

    // TanStack Virtual returns imperative helpers that React Compiler intentionally skips.
    // eslint-disable-next-line react-hooks/incompatible-library
    const virtualizer = useVirtualizer({
        count: items.length,
        getScrollElement: () => parentRef.current,
        estimateSize: () => itemHeight + gap,
        overscan,
    });

    const virtualItems = virtualizer.getVirtualItems();
    const totalHeight = virtualizer.getTotalSize();

    // Loading state
    if (loading) {
        return (
            <Box
                ref={parentRef}
                style={{
                    height: containerHeight,
                    overflow: 'auto',
                    ...style,
                }}
                className={className}
            >
                <div style={{ display: 'flex', flexDirection: 'column', gap, padding: gap }}>
                    {Array.from({ length: skeletonCount }).map((_, i) => (
                        <Skeleton key={i} height={itemHeight} radius="sm" />
                    ))}
                </div>
            </Box>
        );
    }

    // Empty state
    if (items.length === 0) {
        return (
            <Box
                style={{
                    height: containerHeight,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    ...style,
                }}
                className={className}
            >
                {emptyState || <div>No items to display</div>}
            </Box>
        );
    }

    return (
        <Box
            ref={parentRef}
            style={{
                height: containerHeight,
                overflow: 'auto',
                ...style,
            }}
            className={className}
        >
            <div
                style={{
                    height: totalHeight,
                    width: '100%',
                    position: 'relative',
                }}
            >
                {virtualItems.map((virtualItem) => (
                    <div
                        key={virtualItem.key}
                        style={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            width: '100%',
                            height: virtualItem.size,
                            transform: `translateY(${virtualItem.start}px)`,
                            padding: `0 ${gap}px`,
                        }}
                    >
                        {renderItem(items[virtualItem.index], virtualItem.index)}
                    </div>
                ))}
            </div>
        </Box>
    );
}
