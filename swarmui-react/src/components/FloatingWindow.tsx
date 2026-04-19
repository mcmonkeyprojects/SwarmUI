/**
 * FloatingWindow Component
 * 
 * A draggable and resizable window container that mimics desktop window behavior.
 * Uses react-draggable for drag functionality and custom resize handles.
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import Draggable from 'react-draggable';
import { Paper, Group, Text, Box } from '@mantine/core';
import { IconX, IconMaximize, IconMinimize } from '@tabler/icons-react';
import { Z_INDEX } from '../utils/zIndex';
import { SwarmActionIcon } from './ui';
import { useDebugTrace } from '../utils/debugTrace';
import './floating-window.css';

export interface FloatingWindowProps {
    /** Whether the window is open */
    opened: boolean;
    /** Called when the window is closed */
    onClose: () => void;
    /** Window title */
    title: string;
    /** Window content */
    children: React.ReactNode;
    /** Initial width */
    initialWidth?: number;
    /** Initial height */
    initialHeight?: number;
    /** Minimum width */
    minWidth?: number;
    /** Minimum height */
    minHeight?: number;
    /** Maximum width */
    maxWidth?: number;
    /** Maximum height */
    maxHeight?: number;
    /** Z-index for stacking */
    zIndex?: number;
    /** Whether to center the window initially */
    centered?: boolean;
    /** Custom class name */
    className?: string;
}

interface Size {
    width: number;
    height: number;
}

interface Position {
    x: number;
    y: number;
}

export function FloatingWindow({
    opened,
    onClose,
    title,
    children,
    initialWidth = 1000,
    initialHeight = 700,
    minWidth = 400,
    minHeight = 300,
    maxWidth,
    maxHeight,
    zIndex = Z_INDEX.modal,
    centered = true,
    className = '',
}: FloatingWindowProps) {
    const nodeRef = useRef<HTMLDivElement>(null);
    const [size, setSize] = useState<Size>({ width: initialWidth, height: initialHeight });
    const [position, setPosition] = useState<Position>({ x: 0, y: 0 });
    const [isMaximized, setIsMaximized] = useState(false);
    const [preMaximizeState, setPreMaximizeState] = useState<{ size: Size; position: Position } | null>(null);
    const [isResizing, setIsResizing] = useState(false);
    const resizeRef = useRef<{ startX: number; startY: number; startWidth: number; startHeight: number; direction: string } | null>(null);

    useDebugTrace(`FloatingWindow:${title}`, {
        opened,
        centered,
        width: size.width,
        height: size.height,
        x: position.x,
        y: position.y,
        isMaximized,
        isResizing,
        hasPreMaximizeState: !!preMaximizeState,
    });

    // Center window on open
    useEffect(() => {
        if (opened && centered) {
            const x = Math.max(0, (window.innerWidth - size.width) / 2);
            const y = Math.max(0, (window.innerHeight - size.height) / 2);
            setPosition({ x, y });
        }
    }, [opened, centered]);

    // Handle maximize toggle
    const handleMaximize = useCallback(() => {
        if (isMaximized) {
            // Restore
            if (preMaximizeState) {
                setSize(preMaximizeState.size);
                setPosition(preMaximizeState.position);
            }
            setIsMaximized(false);
        } else {
            // Maximize
            setPreMaximizeState({ size, position });
            setSize({ width: window.innerWidth - 40, height: window.innerHeight - 40 });
            setPosition({ x: 20, y: 20 });
            setIsMaximized(true);
        }
    }, [isMaximized, size, position, preMaximizeState]);

    // Resize handlers
    const handleResizeStart = useCallback((e: React.MouseEvent, direction: string) => {
        e.preventDefault();
        e.stopPropagation();
        setIsResizing(true);
        resizeRef.current = {
            startX: e.clientX,
            startY: e.clientY,
            startWidth: size.width,
            startHeight: size.height,
            direction,
        };

        const handleMouseMove = (moveEvent: MouseEvent) => {
            if (!resizeRef.current) return;

            const { startX, startY, startWidth, startHeight, direction: dir } = resizeRef.current;
            const deltaX = moveEvent.clientX - startX;
            const deltaY = moveEvent.clientY - startY;

            let newWidth = startWidth;
            let newHeight = startHeight;
            let newX = position.x;
            let newY = position.y;

            // Handle different resize directions
            if (dir.includes('e')) {
                newWidth = Math.max(minWidth, startWidth + deltaX);
                if (maxWidth) newWidth = Math.min(maxWidth, newWidth);
            }
            if (dir.includes('w')) {
                const potentialWidth = startWidth - deltaX;
                if (potentialWidth >= minWidth && (!maxWidth || potentialWidth <= maxWidth)) {
                    newWidth = potentialWidth;
                    newX = position.x + deltaX;
                }
            }
            if (dir.includes('s')) {
                newHeight = Math.max(minHeight, startHeight + deltaY);
                if (maxHeight) newHeight = Math.min(maxHeight, newHeight);
            }
            if (dir.includes('n')) {
                const potentialHeight = startHeight - deltaY;
                if (potentialHeight >= minHeight && (!maxHeight || potentialHeight <= maxHeight)) {
                    newHeight = potentialHeight;
                    newY = position.y + deltaY;
                }
            }

            setSize({ width: newWidth, height: newHeight });
            if (dir.includes('w') || dir.includes('n')) {
                setPosition({ x: newX, y: newY });
            }
        };

        const handleMouseUp = () => {
            setIsResizing(false);
            resizeRef.current = null;
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
    }, [size, position, minWidth, minHeight, maxWidth, maxHeight]);

    // Handle drag stop
    const handleDragStop = useCallback((_e: any, data: { x: number; y: number }) => {
        setPosition({ x: data.x, y: data.y });
    }, []);

    if (!opened) return null;

    return (
        <div className="floating-window-overlay" style={{ zIndex }}>
            <Draggable
                nodeRef={nodeRef}
                handle=".floating-window-header"
                bounds="parent"
                position={position}
                onStop={handleDragStop}
                disabled={isResizing || isMaximized}
            >
                <Paper
                    ref={nodeRef}
                    className={`floating-window ${isMaximized ? 'maximized' : ''} ${className}`}
                    shadow="xl"
                    withBorder
                    style={{
                        width: size.width,
                        height: size.height,
                        position: 'absolute',
                        zIndex: zIndex + 1,
                    }}
                >
                    {/* Header - Drag Handle */}
                    <Group
                        className="floating-window-header"
                        justify="space-between"
                        wrap="nowrap"
                        p="sm"
                    >
                        <Text fw={600} size="sm" truncate style={{ flex: 1 }}>
                            {title}
                        </Text>
                        <Group gap="xs">
                            <SwarmActionIcon
                                size="sm"
                                tone="secondary"
                                emphasis="soft"
                                label={isMaximized ? 'Restore' : 'Maximize'}
                                onClick={handleMaximize}
                            >
                                {isMaximized ? <IconMinimize size={14} /> : <IconMaximize size={14} />}
                            </SwarmActionIcon>
                            <SwarmActionIcon
                                size="sm"
                                tone="danger"
                                emphasis="soft"
                                label="Close"
                                onClick={onClose}
                            >
                                <IconX size={14} />
                            </SwarmActionIcon>
                        </Group>
                    </Group>

                    {/* Content */}
                    <Box className="floating-window-content">
                        {children}
                    </Box>

                    {/* Resize Handles */}
                    {!isMaximized && (
                        <>
                            <div className="resize-handle resize-n" onMouseDown={(e) => handleResizeStart(e, 'n')} />
                            <div className="resize-handle resize-s" onMouseDown={(e) => handleResizeStart(e, 's')} />
                            <div className="resize-handle resize-e" onMouseDown={(e) => handleResizeStart(e, 'e')} />
                            <div className="resize-handle resize-w" onMouseDown={(e) => handleResizeStart(e, 'w')} />
                            <div className="resize-handle resize-ne" onMouseDown={(e) => handleResizeStart(e, 'ne')} />
                            <div className="resize-handle resize-nw" onMouseDown={(e) => handleResizeStart(e, 'nw')} />
                            <div className="resize-handle resize-se" onMouseDown={(e) => handleResizeStart(e, 'se')} />
                            <div className="resize-handle resize-sw" onMouseDown={(e) => handleResizeStart(e, 'sw')} />
                        </>
                    )}
                </Paper>
            </Draggable>
        </div>
    );
}
