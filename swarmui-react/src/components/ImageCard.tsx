import { memo, type ReactNode } from 'react';
import { Card, Checkbox } from '@mantine/core';
import { IconStar, IconStarFilled, IconTrash, IconCopy, IconPhoto, IconUpload, IconRotate, IconMaximize } from '@tabler/icons-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { ImageListItem } from '../api/types';
import { LazyImage } from './LazyImage';
import { ContextMenu, useContextMenu, type ContextMenuItem } from './ContextMenu';
import { SwarmActionIcon, SwarmBadge } from './ui';

interface ImageCardProps {
    /** The image data */
    image: ImageListItem;
    /** Called when the card is clicked */
    onSelect: () => void;
    /** Called when star button is clicked */
    onToggleStar?: () => void;
    /** Called when delete button is clicked */
    onDelete?: () => void;
    /** Whether this card is currently hovered */
    isHovered: boolean;
    /** Mouse enter handler */
    onMouseEnter: () => void;
    /** Mouse leave handler */
    onMouseLeave: () => void;
    /** Image height (default: 200) */
    height?: number;
    /** Animation delay for staggered lists */
    animationDelay?: number;
    /** Whether selection mode is active */
    isSelectable?: boolean;
    /** Whether this card is selected */
    isSelected?: boolean;
    /** Called when selection checkbox is toggled */
    onSelectionToggle?: (event?: { shiftKey?: boolean }) => void;
    /** Called to use image as init image */
    onUseAsInitImage?: () => void;
    /** Called to reuse generation parameters */
    onReuseParams?: () => void;
    /** Called to open upscaler */
    onUpscale?: () => void;
    /** Called to copy image to clipboard */
    onCopyImage?: () => void;
    /** Whether Framer Motion wrappers and hover animation should be enabled */
    enableMotion?: boolean;
}

// Motion variants for the overlay
const overlayVariants = {
    hidden: { opacity: 0 },
    visible: {
        opacity: 1,
        transition: { duration: 0.1 }
    },
    exit: {
        opacity: 0,
        transition: { duration: 0.08 }
    }
};

// Motion variants for action buttons
const buttonVariants = {
    hidden: { scale: 0.8, opacity: 0 },
    visible: (i: number) => ({
        scale: 1,
        opacity: 1,
        transition: { delay: i * 0.03, duration: 0.1 }
    }),
    exit: { scale: 0.8, opacity: 0 }
};

/**
 * Reusable image card component with hover overlay.
 * Uses Framer Motion for smooth hover animations.
 * Memoized to prevent unnecessary re-renders.
 * Right-click for context menu with additional actions.
 */
export const ImageCard = memo(function ImageCard({
    image,
    onSelect,
    onToggleStar,
    onDelete,
    isHovered,
    onMouseEnter,
    onMouseLeave,
    height = 200,
    animationDelay = 0,
    isSelectable = false,
    isSelected = false,
    onSelectionToggle,
    onUseAsInitImage,
    onReuseParams,
    onUpscale,
    onCopyImage,
    enableMotion = true,
}: ImageCardProps) {
    const contextMenu = useContextMenu();
    const previewSrc = image.preview_src || image.src;
    const mediaLabel = image.media_type && image.media_type !== 'image'
        ? image.media_type.charAt(0).toUpperCase() + image.media_type.slice(1)
        : null;

    // Build context menu items based on available actions
    const actionItems: ContextMenuItem[] = [
        ...(onUseAsInitImage ? [{
            id: 'init-image',
            label: 'Use as Init Image',
            icon: <IconPhoto size={16} />,
            onClick: onUseAsInitImage,
        }] : []),
        ...(onReuseParams ? [{
            id: 'reuse-params',
            label: 'Reuse Parameters',
            icon: <IconRotate size={16} />,
            onClick: onReuseParams,
        }] : []),
        ...(onUpscale ? [{
            id: 'upscale',
            label: 'Send to Upscaler',
            icon: <IconUpload size={16} />,
            onClick: onUpscale,
        }] : []),
        ...(onCopyImage ? [{
            id: 'copy',
            label: 'Copy Image',
            icon: <IconCopy size={16} />,
            onClick: onCopyImage,
        }] : []),
    ];

    const manageItems: ContextMenuItem[] = [
        ...(onToggleStar ? [{
            id: 'star',
            label: image.starred ? 'Unstar' : 'Star',
            icon: image.starred ? <IconStarFilled size={16} /> : <IconStar size={16} />,
            onClick: onToggleStar,
        }] : []),
        ...(onDelete ? [{
            id: 'delete',
            label: 'Delete',
            icon: <IconTrash size={16} />,
            danger: true,
            onClick: onDelete,
        }] : []),
    ];

    const contextMenuItems: ContextMenuItem[] = [
        {
            id: 'view',
            label: 'View Full Size',
            icon: <IconMaximize size={16} />,
            onClick: onSelect,
        },
        ...(actionItems.length > 0 ? [{ id: 'divider-1', label: '', divider: true, onClick: () => { } }] : []),
        ...actionItems,
        ...(manageItems.length > 0 ? [{ id: 'divider-2', label: '', divider: true, onClick: () => { } }] : []),
        ...manageItems,
    ];

    // Handle click: in selection mode, toggle selection; otherwise trigger onSelect
    const handleClick = (e: React.MouseEvent) => {
        if (isSelectable && onSelectionToggle) {
            e.stopPropagation();
            onSelectionToggle({ shiftKey: e.shiftKey });
        } else {
            onSelect();
        }
    };

    // Handle right-click for context menu
    const handleContextMenu = (e: React.MouseEvent) => {
        if (!isSelectable) {
            contextMenu.open(e);
        }
    };

    const overlayButtons = [
        ...(onToggleStar ? [{
            key: 'star',
            color: image.starred ? 'yellow' : 'invokeGray',
            icon: image.starred ? <IconStarFilled size={22} /> : <IconStar size={22} />,
            onClick: onToggleStar,
        }] : []),
        ...(onDelete ? [{
            key: 'delete',
            color: 'red',
            icon: <IconTrash size={22} />,
            onClick: onDelete,
        }] : []),
    ];

    const card = (
        <>
            <Card
                p={0}
                radius="sm"
                className="swarm-gallery-image-card swarm-selectable-card"
                data-selected={isSelected ? 'true' : undefined}
                style={{
                    overflow: 'hidden',
                    position: 'relative',
                    border: isSelected
                        ? '2px solid var(--theme-selected-border)'
                        : image.starred
                            ? '2px solid var(--theme-brand)'
                            : '1px solid var(--theme-border-subtle)',
                    boxShadow: isSelected
                        ? '0 0 0 2px color-mix(in srgb, var(--theme-selected-border) 35%, transparent), var(--elevation-shadow-md)'
                        : isHovered
                            ? 'var(--elevation-shadow-md)'
                            : 'none',
                    transition: 'box-shadow 200ms ease, border-color 150ms ease',
                }}
            >
                <LazyImage
                    src={previewSrc}
                    alt="Generated"
                    height={height}
                    fit="contain"
                    radius="sm"
                    rootMargin="200px"
                />

                {enableMotion ? (
                    <AnimatePresence>
                        {isHovered && overlayButtons.length > 0 ? (
                            <MotionOverlay>
                                {overlayButtons.map((button, index) => (
                                    <motion.div
                                        key={button.key}
                                        variants={buttonVariants}
                                        custom={index}
                                        initial="hidden"
                                        animate="visible"
                                        exit="exit"
                                    >
                                        <SwarmActionIcon
                                            size="xl"
                                            tone={button.key === 'delete' ? 'danger' : 'warning'}
                                            emphasis="solid"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                button.onClick();
                                            }}
                                            style={{
                                                transition: 'transform 100ms ease',
                                            }}
                                        >
                                            {button.icon}
                                        </SwarmActionIcon>
                                    </motion.div>
                                ))}
                            </MotionOverlay>
                        ) : null}
                    </AnimatePresence>
                ) : (
                    isHovered && overlayButtons.length > 0 ? (
                        <StaticOverlay>
                            {overlayButtons.map((button) => (
                                <SwarmActionIcon
                                    key={button.key}
                                    size="xl"
                                    tone={button.key === 'delete' ? 'danger' : 'warning'}
                                    emphasis="solid"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        button.onClick();
                                    }}
                                >
                                    {button.icon}
                                </SwarmActionIcon>
                            ))}
                        </StaticOverlay>
                    ) : null
                )}

                {enableMotion ? (
                    <AnimatePresence>
                        {isSelectable ? (
                            <motion.div
                                initial={{ scale: 0, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                exit={{ scale: 0, opacity: 0 }}
                                transition={{ type: 'spring', stiffness: 400, damping: 20 }}
                                style={{ position: 'absolute', top: 8, left: 8, zIndex: 5 }}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onSelectionToggle?.({ shiftKey: e.shiftKey });
                                }}
                            >
                                <SelectionCheckbox
                                    isSelected={isSelected}
                                    onSelectionToggle={onSelectionToggle}
                                />
                            </motion.div>
                        ) : null}
                    </AnimatePresence>
                ) : (
                    isSelectable ? (
                        <div
                            style={{ position: 'absolute', top: 8, left: 8, zIndex: 5 }}
                            onClick={(e) => {
                                e.stopPropagation();
                                onSelectionToggle?.({ shiftKey: e.shiftKey });
                            }}
                        >
                            <SelectionCheckbox
                                isSelected={isSelected}
                                onSelectionToggle={onSelectionToggle}
                            />
                        </div>
                    ) : null
                )}

                {enableMotion ? (
                    <AnimatePresence>
                        {image.starred && !isHovered && !isSelectable ? (
                            <motion.div
                                initial={{ scale: 0, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                exit={{ scale: 0, opacity: 0 }}
                                transition={{ type: 'spring', stiffness: 400, damping: 20 }}
                                style={{ position: 'absolute', top: 8, right: 8 }}
                            >
                                <SwarmBadge tone="warning" emphasis="solid" size="sm">
                                    <IconStarFilled size={12} />
                                </SwarmBadge>
                            </motion.div>
                        ) : null}
                    </AnimatePresence>
                ) : (
                    image.starred && !isHovered && !isSelectable ? (
                        <div style={{ position: 'absolute', top: 8, right: 8 }}>
                            <SwarmBadge tone="warning" emphasis="solid" size="sm">
                                <IconStarFilled size={12} />
                            </SwarmBadge>
                        </div>
                    ) : null
                )}

                {enableMotion ? (
                    <AnimatePresence>
                        {mediaLabel ? (
                            <motion.div
                                initial={{ scale: 0.9, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                exit={{ scale: 0.9, opacity: 0 }}
                                style={{ position: 'absolute', bottom: 8, right: 8 }}
                            >
                                <SwarmBadge tone="primary" emphasis="solid" size="sm">
                                    {mediaLabel}
                                </SwarmBadge>
                            </motion.div>
                        ) : null}
                    </AnimatePresence>
                ) : (
                    mediaLabel ? (
                        <div style={{ position: 'absolute', bottom: 8, right: 8 }}>
                            <SwarmBadge tone="primary" emphasis="solid" size="sm">
                                {mediaLabel}
                            </SwarmBadge>
                        </div>
                    ) : null
                )}
            </Card>

            <ContextMenu
                position={contextMenu.position}
                items={contextMenuItems}
                onClose={contextMenu.close}
            />
        </>
    );

    if (!enableMotion) {
        return (
            <div
                onClick={handleClick}
                onMouseEnter={onMouseEnter}
                onMouseLeave={onMouseLeave}
                style={{ width: '100%', cursor: 'pointer' }}
                onContextMenu={handleContextMenu}
            >
                {card}
            </div>
        );
    }

    return (
        <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: animationDelay * 0.7, duration: 0.18 }}
            onClick={handleClick}
            onMouseEnter={onMouseEnter}
            onMouseLeave={onMouseLeave}
            style={{ width: '100%', cursor: 'pointer' }}
            whileHover={{ scale: 1.02, y: -3 }}
            whileTap={{ scale: 0.98 }}
            onContextMenu={handleContextMenu}
        >
            {card}
        </motion.div>
    );
}, (prevProps: ImageCardProps, nextProps: ImageCardProps) => {
    // Custom comparison for better memoization
    return (
        prevProps.image.src === nextProps.image.src &&
        prevProps.image.starred === nextProps.image.starred &&
        prevProps.isHovered === nextProps.isHovered &&
        prevProps.height === nextProps.height &&
        prevProps.animationDelay === nextProps.animationDelay &&
        prevProps.isSelectable === nextProps.isSelectable &&
        prevProps.isSelected === nextProps.isSelected &&
        prevProps.enableMotion === nextProps.enableMotion
    );
});

function MotionOverlay({ children }: { children: ReactNode }) {
    return (
        <motion.div
            variants={overlayVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                background: 'color-mix(in srgb, var(--theme-surface-app) 78%, transparent)',
                backdropFilter: 'blur(2px)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '12px',
            }}
        >
            {children}
        </motion.div>
    );
}

function StaticOverlay({ children }: { children: ReactNode }) {
    return (
        <div
            style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                background: 'color-mix(in srgb, var(--theme-surface-app) 78%, transparent)',
                backdropFilter: 'blur(2px)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '12px',
            }}
        >
            {children}
        </div>
    );
}

function SelectionCheckbox({
    isSelected,
    onSelectionToggle,
}: {
    isSelected: boolean;
    onSelectionToggle?: (event?: { shiftKey?: boolean }) => void;
}) {
    return (
        <Checkbox
            checked={isSelected}
            onChange={(event) => onSelectionToggle?.({ shiftKey: (event.nativeEvent as MouseEvent).shiftKey })}
            size="md"
            color="green"
            styles={{
                input: {
                    backgroundColor: isSelected
                        ? 'var(--theme-selected-border)'
                        : 'color-mix(in srgb, var(--theme-surface-raised) 88%, transparent)',
                    borderColor: isSelected
                        ? 'var(--theme-selected-border)'
                        : 'var(--theme-border-subtle)',
                    cursor: 'pointer',
                },
            }}
        />
    );
}

ImageCard.displayName = 'ImageCard';
