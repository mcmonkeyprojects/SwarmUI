import { useCallback } from 'react';
import { notifications } from '@mantine/notifications';
import { useMediaQuery } from '@mantine/hooks';
import { Z_INDEX } from '../utils/zIndex';
import {
    Modal,
    Stack,
    Image,
    Group,
    Paper,
    Text,
    ScrollArea,
    Code,
    Center,
    SimpleGrid,
} from '@mantine/core';
import {
    IconStar,
    IconStarFilled,
    IconTrash,
    IconDownload,
    IconArrowsMaximize,
    IconPlayerPlay,
    IconBrush,
    IconPhotoPlus,
    IconCopy,
} from '@tabler/icons-react';
import type { ImageListItem } from '../api/types';
import { getHistoryMetadataSummary, getHistoryUpscalePreviewInfo, isImageMedia } from '../features/history/historyUtils';
import { SwarmActionIcon as ActionIcon, SwarmBadge as Badge, SwarmButton as Button } from './ui';

interface ImageDetailModalProps {
    /** The image to display (null to close modal) */
    image: ImageListItem | null;
    /** Called when modal is closed */
    onClose: () => void;
    /** Called when star is toggled */
    onToggleStar?: (image: ImageListItem) => void;
    /** Called when delete is clicked */
    onDelete?: (image: ImageListItem) => void;
    /** Called when upscale is clicked - receives imagePath and optional metadata */
    onUpscale?: (imagePath: string, metadata?: string | Record<string, unknown> | null) => void;
    /** Called when reuse params is clicked */
    onReuseParams?: (image: ImageListItem) => void;
    /** Called when edit/inpaint is clicked */
    onEdit?: (image: ImageListItem) => void;
    /** Called when use as init image is clicked */
    onUseAsInitImage?: (image: ImageListItem) => void;
    /** Whether to show debug URL info */
    showDebugUrl?: boolean;
}

export function ImageDetailModal({
    image,
    onClose,
    onToggleStar,
    onDelete,
    onUpscale,
    onReuseParams,
    onEdit,
    onUseAsInitImage,
    showDebugUrl = false,
}: ImageDetailModalProps) {
    const isSmallScreen = useMediaQuery('(max-width: 768px)');

    const copyText = useCallback(async (label: string, value: string | null) => {
        if (!value) {
            notifications.show({
                title: 'Nothing to Copy',
                message: `No ${label.toLowerCase()} found for this item.`,
                color: 'yellow',
            });
            return;
        }

        try {
            await navigator.clipboard.writeText(value);
            notifications.show({
                title: 'Copied',
                message: `${label} copied to clipboard.`,
                color: 'green',
            });
        } catch (error) {
            console.error(`Failed to copy ${label}:`, error);
            notifications.show({
                title: 'Copy Failed',
                message: `Could not copy ${label.toLowerCase()}.`,
                color: 'red',
            });
        }
    }, []);

    if (!image) {
        return null;
    }

    const metadataSummary = getHistoryMetadataSummary(image);
    const upscaleInfo = getHistoryUpscalePreviewInfo(image);
    const canUseImageTools = isImageMedia(image);
    const primaryActionStyles = {
        root: {
            background: 'var(--theme-brand-gradient)',
            color: 'var(--theme-tone-primary-text)',
            border: '1px solid var(--theme-tone-primary-border)',
            boxShadow: '0 8px 18px color-mix(in srgb, var(--theme-tone-primary-glow) 26%, transparent)',
        },
    };
    const softActionStyles = {
        root: {
            background: 'color-mix(in srgb, var(--theme-gray-8) 84%, transparent)',
            color: 'var(--theme-text-primary)',
            border: '1px solid var(--theme-border-subtle)',
        },
    };
    const infoActionStyles = {
        root: {
            background: 'var(--theme-tone-info-soft)',
            color: 'var(--theme-text-primary)',
            border: '1px solid var(--theme-tone-info-border)',
        },
    };
    const successActionStyles = {
        root: {
            background: 'var(--theme-tone-success-soft)',
            color: 'var(--theme-text-primary)',
            border: '1px solid var(--theme-tone-success-border)',
        },
    };
    const dangerActionStyles = {
        root: {
            background: 'var(--theme-tone-danger-soft)',
            color: 'var(--theme-text-primary)',
            border: '1px solid var(--theme-tone-danger-border)',
        },
    };

    const renderPreview = () => {
        switch (image.media_type) {
            case 'video':
                return (
                    <video
                        src={image.src}
                        controls
                        poster={image.preview_src || undefined}
                        style={{
                            maxWidth: '100%',
                            maxHeight: 'min(60dvh, 60vh)',
                            borderRadius: 8,
                            background: 'color-mix(in srgb, var(--theme-gray-8) 88%, transparent)',
                        }}
                    />
                );
            case 'audio':
                return (
                    <Stack gap="md" w="100%" maw="640px">
                        <Image
                            src={image.preview_src || image.src}
                            alt="Audio preview"
                            fit="contain"
                            style={{ maxHeight: '40dvh' }}
                        />
                        <audio controls src={image.src} style={{ width: '100%' }}>
                            <track kind="captions" />
                        </audio>
                    </Stack>
                );
            case 'html':
                return (
                    <Stack gap="md" w="100%" maw="640px">
                        <Image
                            src={image.preview_src || image.src}
                            alt="HTML preview"
                            fit="contain"
                            style={{ maxHeight: '40dvh' }}
                        />
                        <Button
                            variant="light"
                            leftSection={<IconPlayerPlay size={16} />}
                            onClick={() => window.open(image.src, '_blank', 'noopener,noreferrer')}
                            styles={primaryActionStyles}
                        >
                            Open HTML
                        </Button>
                    </Stack>
                );
            default:
                return (
                    <Image
                        src={image.src}
                        alt="Full size"
                        fit="contain"
                        style={{ maxHeight: 'min(60dvh, 60vh)' }}
                    />
                );
        }
    };

    return (
        <Modal
            opened={image !== null}
            onClose={onClose}
            size={isSmallScreen ? '100%' : 'calc(100vw - 40px)'}
            fullScreen={isSmallScreen}
            title="History Item"
            zIndex={Z_INDEX.modal}
            withinPortal={true}
            portalProps={{ target: 'body' }}
            centered={!isSmallScreen}
            styles={{
                content: {
                    maxWidth: 'min(980px, calc(100vw - 40px))',
                    maxHeight: 'min(calc(100dvh - 40px), calc(100vh - 40px))',
                    background: 'var(--theme-panel-gradient)',
                    border: '1px solid var(--theme-border-subtle)',
                },
            }}
        >
            <Stack gap="md">
                <Center style={{ background: 'color-mix(in srgb, var(--theme-gray-8) 86%, transparent)', borderRadius: 8, padding: 20, border: '1px solid var(--theme-border-subtle)' }}>
                    {renderPreview()}
                </Center>

                {showDebugUrl && (
                    <Paper p="xs" radius="sm" withBorder style={{ background: 'color-mix(in srgb, var(--theme-gray-8) 82%, transparent)', borderColor: 'var(--theme-border-subtle)' }}>
                        <Text size="xs" c="var(--theme-text-secondary)" mb={4}>Debug Source URL</Text>
                        <Code block c="red.4" style={{ fontSize: '11px', wordBreak: 'break-all' }}>
                            {image.src}
                        </Code>
                    </Paper>
                )}

                <Group justify="space-between" align="flex-start">
                    <Group wrap="wrap">
                        {onToggleStar && (
                            <ActionIcon
                                variant="filled"
                                size="lg"
                                aria-label={image.starred ? 'Remove star from item' : 'Star item'}
                                onClick={() => onToggleStar(image)}
                                style={{
                                    background: image.starred
                                        ? 'linear-gradient(135deg, var(--theme-warning), color-mix(in srgb, var(--theme-warning) 78%, white))'
                                        : 'color-mix(in srgb, var(--theme-gray-7) 92%, transparent)',
                                    color: image.starred ? '#171717' : 'var(--theme-text-secondary)',
                                    border: image.starred
                                        ? '1px solid color-mix(in srgb, var(--theme-warning) 54%, transparent)'
                                        : '1px solid var(--theme-border-subtle)',
                                }}
                            >
                                {image.starred ? <IconStarFilled size={20} /> : <IconStar size={20} />}
                            </ActionIcon>
                        )}

                        {onReuseParams && canUseImageTools && (
                            <Button
                                variant="filled"
                                leftSection={<IconPlayerPlay size={16} />}
                                onClick={() => onReuseParams(image)}
                                styles={primaryActionStyles}
                            >
                                Reuse Params
                            </Button>
                        )}

                        {onUseAsInitImage && canUseImageTools && (
                            <Button
                                variant="filled"
                                leftSection={<IconPhotoPlus size={16} />}
                                onClick={() => onUseAsInitImage(image)}
                                styles={infoActionStyles}
                            >
                                Use as Init Image
                            </Button>
                        )}

                        {onEdit && canUseImageTools && (
                            <Button
                                variant="filled"
                                leftSection={<IconBrush size={16} />}
                                onClick={() => onEdit(image)}
                                styles={successActionStyles}
                            >
                                Edit / Inpaint
                            </Button>
                        )}

                        <Button
                            variant="light"
                            leftSection={<IconDownload size={16} />}
                            onClick={() => window.open(image.src, '_blank', 'noopener,noreferrer')}
                            styles={softActionStyles}
                        >
                            Download
                        </Button>

                        {onUpscale && canUseImageTools && (
                            <Button
                                variant="light"
                                leftSection={<IconArrowsMaximize size={16} />}
                                onClick={() => onUpscale(image.src, image.metadata)}
                                styles={infoActionStyles}
                            >
                                Upscale
                            </Button>
                        )}
                    </Group>

                    {onDelete && (
                        <Button
                            leftSection={<IconTrash size={16} />}
                            onClick={() => onDelete(image)}
                            styles={dangerActionStyles}
                        >
                            Delete
                        </Button>
                    )}
                </Group>

                {(metadataSummary.prompt || metadataSummary.model || metadataSummary.seed || metadataSummary.resolution || upscaleInfo) && (
                    <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
                        {metadataSummary.prompt && (
                            <Paper p="sm" radius="sm" withBorder style={{ background: 'color-mix(in srgb, var(--theme-gray-8) 80%, transparent)', borderColor: 'var(--theme-border-subtle)' }}>
                                <Text size="xs" fw={600} c="var(--theme-text-secondary)" mb={4} tt="uppercase">Prompt</Text>
                                <Text size="sm" c="var(--theme-text-primary)" lineClamp={4}>{metadataSummary.prompt}</Text>
                            </Paper>
                        )}
                        <Paper p="sm" radius="sm" withBorder style={{ background: 'color-mix(in srgb, var(--theme-gray-8) 80%, transparent)', borderColor: 'var(--theme-border-subtle)' }}>
                            <Text size="xs" fw={600} c="var(--theme-text-secondary)" mb={4} tt="uppercase">Details</Text>
                            {metadataSummary.model && <Text size="sm" c="var(--theme-text-primary)">Model: {metadataSummary.model}</Text>}
                            {metadataSummary.seed && <Text size="sm" c="var(--theme-text-primary)">Seed: {metadataSummary.seed}</Text>}
                            {metadataSummary.resolution && <Text size="sm" c="var(--theme-text-primary)">Resolution: {metadataSummary.resolution}</Text>}
                            {upscaleInfo && (
                                <Group gap="xs" mt={6} wrap="wrap">
                                    <Badge tone="info" emphasis="solid" size="sm">
                                        {upscaleInfo.badgeLabel}
                                    </Badge>
                                    {upscaleInfo.sourceResolution && (
                                        <Text size="sm" c="var(--theme-text-secondary)">
                                            Source: {upscaleInfo.sourceResolution}
                                        </Text>
                                    )}
                                    <Text size="sm" c="var(--theme-text-secondary)">
                                        Scale: {upscaleInfo.scale}x
                                    </Text>
                                    {upscaleInfo.method && (
                                        <Text size="sm" c="var(--theme-text-secondary)">
                                            Method: {upscaleInfo.method}
                                        </Text>
                                    )}
                                </Group>
                            )}
                        </Paper>
                    </SimpleGrid>
                )}

                {image.metadata && (
                    <Paper p="md" radius="sm" withBorder style={{ background: 'color-mix(in srgb, var(--theme-gray-8) 78%, transparent)', borderColor: 'var(--theme-border-subtle)' }}>
                        <Group justify="space-between" align="center" mb="xs">
                            <Text size="xs" fw={600} c="var(--theme-text-secondary)" tt="uppercase" style={{ letterSpacing: '0.5px' }}>
                                Metadata
                            </Text>
                            <Group gap="xs">
                                <Button
                                    variant="subtle"
                                    size="compact-sm"
                                    leftSection={<IconCopy size={14} />}
                                    onClick={() => copyText('Metadata', metadataSummary.metadataText)}
                                    styles={softActionStyles}
                                >
                                    Copy Raw
                                </Button>
                                <Button
                                    variant="subtle"
                                    size="compact-sm"
                                    leftSection={<IconCopy size={14} />}
                                    onClick={() => copyText('Prompt', metadataSummary.prompt)}
                                    styles={softActionStyles}
                                >
                                    Copy Prompt
                                </Button>
                                <Button
                                    variant="subtle"
                                    size="compact-sm"
                                    leftSection={<IconCopy size={14} />}
                                    onClick={() => copyText('Model', metadataSummary.model)}
                                    styles={softActionStyles}
                                >
                                    Copy Model
                                </Button>
                                <Button
                                    variant="subtle"
                                    size="compact-sm"
                                    leftSection={<IconCopy size={14} />}
                                    onClick={() => copyText('Seed', metadataSummary.seed)}
                                    styles={softActionStyles}
                                >
                                    Copy Seed
                                </Button>
                            </Group>
                        </Group>
                        <ScrollArea h={180}>
                            <Code block c="var(--theme-text-primary)" style={{ fontSize: '11px' }}>
                                {metadataSummary.metadataText}
                            </Code>
                        </ScrollArea>
                    </Paper>
                )}
            </Stack>
        </Modal>
    );
}
