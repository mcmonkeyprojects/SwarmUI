import { useRef, useCallback } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';

export interface UseVirtualListOptions<T> {
    /** The array of items to virtualize */
    items: T[];
    /** Estimated size of each item in pixels */
    estimateSize: number;
    /** Number of items to render outside the visible area (overscan) */
    overscan?: number;
    /** Horizontal virtualization instead of vertical */
    horizontal?: boolean;
    /** Gap between items in pixels */
    gap?: number;
}

export interface UseVirtualListReturn {
    /** Ref to attach to the scrolling container */
    parentRef: React.RefObject<HTMLDivElement | null>;
    /** The virtualizer instance */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    virtualizer: any;
    /** Virtual items to render */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    virtualItems: any[];
    /** Total size of all items */
    totalSize: number;
    /** Check if an index is currently visible */
    isVisible: (index: number) => boolean;
    /** Scroll to a specific index */
    scrollToIndex: (index: number) => void;
}

/**
 * Custom hook for virtualizing lists with @tanstack/react-virtual
 * 
 * @example
 * ```tsx
 * const { parentRef, virtualItems, totalSize } = useVirtualList({
 *   items: myItems,
 *   estimateSize: 100,
 *   overscan: 5,
 * });
 * 
 * return (
 *   <div ref={parentRef} style={{ height: 400, overflow: 'auto' }}>
 *     <div style={{ height: totalSize, position: 'relative' }}>
 *       {virtualItems.map((virtualRow) => (
 *         <div
 *           key={virtualRow.key}
 *           style={{
 *             position: 'absolute',
 *             top: virtualRow.start,
 *             height: virtualRow.size,
 *           }}
 *         >
 *           {items[virtualRow.index]}
 *         </div>
 *       ))}
 *     </div>
 *   </div>
 * );
 * ```
 */
export function useVirtualList<T>({
    items,
    estimateSize,
    overscan = 5,
    horizontal = false,
    gap = 0,
}: UseVirtualListOptions<T>): UseVirtualListReturn {
    const parentRef = useRef<HTMLDivElement>(null);

    // TanStack Virtual returns imperative helpers that React Compiler intentionally skips.
    // eslint-disable-next-line react-hooks/incompatible-library
    const virtualizer = useVirtualizer({
        count: items.length,
        getScrollElement: () => parentRef.current,
        estimateSize: () => estimateSize + gap,
        overscan,
        horizontal,
    });

    const virtualItems = virtualizer.getVirtualItems();
    const totalSize = virtualizer.getTotalSize();

    const isVisible = useCallback(
        (index: number) => {
            const items = virtualizer.getVirtualItems();
            return items.some((item) => item.index === index);
        },
        [virtualizer]
    );

    const scrollToIndex = useCallback(
        (index: number) => {
            virtualizer.scrollToIndex(index, { align: 'center' });
        },
        [virtualizer]
    );

    return {
        parentRef,
        virtualizer,
        virtualItems,
        totalSize,
        isVisible,
        scrollToIndex,
    };
}

export interface UseVirtualGridOptions<T> {
    /** The array of items to virtualize */
    items: T[];
    /** Number of columns in the grid */
    columnCount: number;
    /** Height of each row in pixels */
    rowHeight: number;
    /** Number of rows to render outside the visible area */
    overscan?: number;
    /** Gap between items in pixels */
    gap?: number;
}

export interface UseVirtualGridReturn<T> {
    /** Ref to attach to the scrolling container */
    parentRef: React.RefObject<HTMLDivElement | null>;
    /** The virtualizer instance */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    virtualizer: any;
    /** Virtual rows to render */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    virtualRows: any[];
    /** Total height of all rows */
    totalHeight: number;
    /** Get the items for a specific row index */
    getRowItems: (rowIndex: number) => { item: T; index: number }[];
    /** Total number of rows */
    rowCount: number;
}

/**
 * Custom hook for virtualizing grids with @tanstack/react-virtual
 * 
 * @example
 * ```tsx
 * const { parentRef, virtualRows, totalHeight, getRowItems } = useVirtualGrid({
 *   items: myItems,
 *   columnCount: 4,
 *   rowHeight: 200,
 *   overscan: 2,
 * });
 * 
 * return (
 *   <div ref={parentRef} style={{ height: 400, overflow: 'auto' }}>
 *     <div style={{ height: totalHeight, position: 'relative' }}>
 *       {virtualRows.map((virtualRow) => (
 *         <div
 *           key={virtualRow.key}
 *           style={{
 *             position: 'absolute',
 *             top: virtualRow.start,
 *             height: virtualRow.size,
 *             display: 'grid',
 *             gridTemplateColumns: `repeat(${columnCount}, 1fr)`,
 *           }}
 *         >
 *           {getRowItems(virtualRow.index).map(({ item, index }) => (
 *             <ItemComponent key={index} item={item} />
 *           ))}
 *         </div>
 *       ))}
 *     </div>
 *   </div>
 * );
 * ```
 */
export function useVirtualGrid<T>({
    items,
    columnCount,
    rowHeight,
    overscan = 3,
    gap = 0,
}: UseVirtualGridOptions<T>): UseVirtualGridReturn<T> {
    const parentRef = useRef<HTMLDivElement>(null);

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

    const getRowItems = useCallback(
        (rowIndex: number): { item: T; index: number }[] => {
            const startIndex = rowIndex * columnCount;
            const rowItems: { item: T; index: number }[] = [];

            for (let i = 0; i < columnCount; i++) {
                const itemIndex = startIndex + i;
                if (itemIndex < items.length) {
                    rowItems.push({ item: items[itemIndex], index: itemIndex });
                }
            }

            return rowItems;
        },
        [items, columnCount]
    );

    return {
        parentRef,
        virtualizer,
        virtualRows,
        totalHeight,
        getRowItems,
        rowCount,
    };
}
