/**
 * ContextMenu Component
 * 
 * A reusable right-click context menu that positions at the cursor.
 */

import React, { useEffect, useRef, useCallback, useState } from 'react';
import { Paper, Stack, Group, Text, Divider, Portal } from '@mantine/core';
import { Z_INDEX } from '../utils/zIndex';
import './context-menu.css';

export interface ContextMenuItem {
    /** Unique identifier */
    id: string;
    /** Display label */
    label: string;
    /** Optional icon component */
    icon?: React.ReactNode;
    /** Optional keyboard shortcut hint */
    shortcut?: string;
    /** Click handler */
    onClick: () => void;
    /** Whether the item is disabled */
    disabled?: boolean;
    /** Danger styling (red text) */
    danger?: boolean;
    /** Whether this is a divider */
    divider?: boolean;
    /** Submenu items (if this is a parent menu) */
    submenu?: ContextMenuItem[];
}

export interface ContextMenuProps {
    /** Position to show the menu */
    position: { x: number; y: number } | null;
    /** Menu items */
    items: ContextMenuItem[];
    /** Called when menu should close */
    onClose: () => void;
}

export function ContextMenu({ position, items, onClose }: ContextMenuProps) {
    const menuRef = useRef<HTMLDivElement>(null);
    const [adjustedPosition, setAdjustedPosition] = useState<{ x: number; y: number } | null>(position);

    // Close on click outside
    useEffect(() => {
        if (!position) return;

        const handleClickOutside = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                onClose();
            }
        };

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                onClose();
            }
        };

        // Delay to avoid immediate close from the triggering click
        const timeoutId = setTimeout(() => {
            document.addEventListener('click', handleClickOutside);
            document.addEventListener('contextmenu', handleClickOutside);
            document.addEventListener('keydown', handleKeyDown);
        }, 0);

        return () => {
            clearTimeout(timeoutId);
            document.removeEventListener('click', handleClickOutside);
            document.removeEventListener('contextmenu', handleClickOutside);
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [position, onClose]);

    useEffect(() => {
        if (!position) {
            queueMicrotask(() => {
                setAdjustedPosition(null);
            });
            return;
        }

        queueMicrotask(() => {
            if (!menuRef.current) {
                setAdjustedPosition(position);
                return;
            }

            const rect = menuRef.current.getBoundingClientRect();
            const viewportWidth = window.innerWidth;
            const viewportHeight = window.innerHeight;

            let { x, y } = position;

            // Adjust if menu would go off right edge
            if (x + rect.width > viewportWidth - 10) {
                x = viewportWidth - rect.width - 10;
            }

            // Adjust if menu would go off bottom edge
            if (y + rect.height > viewportHeight - 10) {
                y = viewportHeight - rect.height - 10;
            }

            setAdjustedPosition({ x: Math.max(10, x), y: Math.max(10, y) });
        });
    }, [position]);

    const handleItemClick = useCallback((item: ContextMenuItem) => {
        if (item.disabled) return;
        item.onClick();
        onClose();
    }, [onClose]);

    if (!position) return null;

    return (
        <Portal>
            <div
                className="context-menu-overlay"
                style={{ zIndex: Z_INDEX.modalNested }}>
                <Paper
                    ref={menuRef}
                    className="context-menu"
                    shadow="lg"
                    withBorder
                    style={{
                        left: adjustedPosition?.x ?? position.x,
                        top: adjustedPosition?.y ?? position.y,
                    }}
                >
                    <Stack gap={0}>
                        {items.map((item, index) => {
                            if (item.divider) {
                                return <Divider key={`divider-${index}`} my={4} />;
                            }

                            return (
                                <button
                                    key={item.id}
                                    className={`context-menu-item ${item.disabled ? 'disabled' : ''} ${item.danger ? 'danger' : ''}`}
                                    onClick={() => handleItemClick(item)}
                                    disabled={item.disabled}
                                >
                                    <Group gap="sm" wrap="nowrap" style={{ flex: 1 }}>
                                        {item.icon && (
                                            <span className="context-menu-icon">
                                                {item.icon}
                                            </span>
                                        )}
                                        <Text size="sm" style={{ flex: 1 }}>
                                            {item.label}
                                        </Text>
                                    </Group>
                                    {item.shortcut && (
                                        <Text size="xs" c="dimmed" className="context-menu-shortcut">
                                            {item.shortcut}
                                        </Text>
                                    )}
                                </button>
                            );
                        })}
                    </Stack>
                </Paper>
            </div>
        </Portal>
    );
}


/**
 * Hook to manage context menu state
 * Positions menu at the cursor location
 */
// eslint-disable-next-line react-refresh/only-export-components
export function useContextMenu() {
    const [position, setPosition] = React.useState<{ x: number; y: number } | null>(null);

    const open = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();

        // Position at cursor location
        setPosition({
            x: e.clientX,
            y: e.clientY
        });
    }, []);

    const close = useCallback(() => {
        setPosition(null);
    }, []);

    return { position, open, close, isOpen: position !== null };
}
