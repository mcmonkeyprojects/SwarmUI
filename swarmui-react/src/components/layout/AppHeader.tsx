import {
    Group,
    Menu,
    Text,
    Tooltip,
} from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import {
    IconDotsVertical,
    IconDownload,
    IconFolder,
    IconLogout,
    IconPower,
    IconReload,
    IconSearch,
} from '@tabler/icons-react';
import { AppearanceTrigger } from '../AppearanceTrigger';
import { QueueStatusBadge } from '../QueueStatusBadge';
import type { AppPage } from '../../stores/navigationStore';
import { SwarmActionIcon, SwarmSegmentedControl } from '../ui';

interface AppHeaderProps {
    currentPage: AppPage;
    onPageChange: (page: AppPage) => void;
    onPrefetchPage?: (page: AppPage) => void;
    onOpenCommandPalette: () => void;
    onOpenModelDownloader: () => void;
    onOpenProjects: () => void;
    onReloadWrapper: () => void;
    onLogout: () => void;
    onShutdown: () => void;
    onNavigateToQueue: () => void;
}

export function AppHeader({
    currentPage,
    onPageChange,
    onPrefetchPage,
    onOpenCommandPalette,
    onOpenModelDownloader,
    onOpenProjects,
    onReloadWrapper,
    onLogout,
    onShutdown,
    onNavigateToQueue,
}: AppHeaderProps) {
    const isWide = useMediaQuery('(min-width: 1366px)', true);
    const isCompact = useMediaQuery('(min-width: 1200px)', true);

    const layoutMode: 'full' | 'compact' | 'condensed' = isWide
        ? 'full'
        : isCompact
            ? 'compact'
            : 'condensed';

    const showOverflowActions = layoutMode === 'condensed';
    const navItems: { label: string; value: AppPage }[] = [
        { label: 'Generate', value: 'generate' },
        { label: 'History', value: 'history' },
        { label: 'Queue', value: 'queue' },
        { label: 'Workflows', value: 'workflows' },
        { label: 'Roleplay', value: 'roleplay' },
        { label: 'Server', value: 'server' },
    ];

    return (
        <div className="swarm-app-header" data-layout={layoutMode}>
            <Text size="lg" fw={700} className="swarm-app-header__title">
                {layoutMode === 'full' ? 'SwarmUI' : 'Swarm'}
            </Text>

            <div className="swarm-app-header__nav-wrap">
                <SwarmSegmentedControl
                    value={currentPage}
                    onChange={(value) => onPageChange(value as AppPage)}
                    data={navItems.map((item) => ({
                        value: item.value,
                        label: (
                            <span
                                onMouseEnter={() => onPrefetchPage?.(item.value)}
                                onFocus={() => onPrefetchPage?.(item.value)}
                            >
                                {item.label}
                            </span>
                        ),
                    }))}
                    size={layoutMode === 'full' ? 'sm' : 'xs'}
                    className="swarm-app-header__nav"
                />
            </div>

            <Group gap="xs" wrap="nowrap" className="swarm-app-header__actions">
                <QueueStatusBadge compact onNavigateToQueue={onNavigateToQueue} />
                <AppearanceTrigger />

                {showOverflowActions ? (
                    <Menu position="bottom-end" shadow="md" withArrow>
                        <Menu.Target>
                            <SwarmActionIcon
                                aria-label="Open header actions menu"
                                tone="secondary"
                                emphasis="ghost"
                                size="md"
                                className="swarm-app-header-action"
                            >
                                <IconDotsVertical size={18} />
                            </SwarmActionIcon>
                        </Menu.Target>
                        <Menu.Dropdown>
                            <Menu.Item leftSection={<IconSearch size={14} />} onClick={onOpenCommandPalette}>
                                Command Palette
                            </Menu.Item>
                            <Menu.Item leftSection={<IconDownload size={14} />} onClick={onOpenModelDownloader}>
                                Model Downloader
                            </Menu.Item>
                            <Menu.Item leftSection={<IconFolder size={14} />} onClick={onOpenProjects}>
                                Creative Projects
                            </Menu.Item>
                            <Menu.Item leftSection={<IconReload size={14} />} onClick={onReloadWrapper}>
                                Reload Desktop Wrapper
                            </Menu.Item>
                            <Menu.Item leftSection={<IconLogout size={14} />} onClick={onLogout}>
                                Log Out
                            </Menu.Item>
                            <Menu.Item color="red" leftSection={<IconPower size={14} />} onClick={onShutdown}>
                                Shutdown SwarmUI
                            </Menu.Item>
                        </Menu.Dropdown>
                    </Menu>
                ) : (
                    <>
                        <Tooltip label="Command palette">
                            <SwarmActionIcon
                                aria-label="Open command palette"
                                tone="secondary"
                                emphasis="ghost"
                                size="md"
                                onClick={onOpenCommandPalette}
                                className="swarm-app-header-action"
                            >
                                <IconSearch size={18} />
                            </SwarmActionIcon>
                        </Tooltip>
                        <Tooltip label="Model Downloader">
                            <SwarmActionIcon
                                aria-label="Open Model Downloader"
                                tone="secondary"
                                emphasis="ghost"
                                size="md"
                                onClick={onOpenModelDownloader}
                                className="swarm-app-header-action swarm-app-header-action--download"
                            >
                                <IconDownload size={18} />
                            </SwarmActionIcon>
                        </Tooltip>
                        <Tooltip label="Creative projects">
                            <SwarmActionIcon
                                aria-label="Open creative projects"
                                tone="secondary"
                                emphasis="ghost"
                                size="md"
                                onClick={onOpenProjects}
                                className="swarm-app-header-action"
                            >
                                <IconFolder size={18} />
                            </SwarmActionIcon>
                        </Tooltip>
                        <Tooltip label="Reload desktop wrapper">
                            <SwarmActionIcon
                                aria-label="Reload desktop wrapper"
                                tone="secondary"
                                emphasis="ghost"
                                size="md"
                                onClick={onReloadWrapper}
                                className="swarm-app-header-action swarm-app-header-action--reload"
                            >
                                <IconReload size={18} />
                            </SwarmActionIcon>
                        </Tooltip>
                        <Tooltip label="Log Out">
                            <SwarmActionIcon
                                aria-label="Log out"
                                tone="secondary"
                                emphasis="ghost"
                                size="md"
                                onClick={onLogout}
                                className="swarm-app-header-action swarm-app-header-action--logout"
                            >
                                <IconLogout size={18} />
                            </SwarmActionIcon>
                        </Tooltip>
                        <Tooltip label="Shutdown SwarmUI">
                            <SwarmActionIcon
                                aria-label="Shutdown SwarmUI"
                                tone="danger"
                                emphasis="ghost"
                                size="md"
                                onClick={onShutdown}
                                className="swarm-app-header-action swarm-app-header-action--shutdown"
                            >
                                <IconPower size={18} />
                            </SwarmActionIcon>
                        </Tooltip>
                    </>
                )}
            </Group>
        </div>
    );
}
