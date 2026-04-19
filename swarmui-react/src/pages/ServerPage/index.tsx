import { Suspense, lazy, useEffect } from 'react';
import {
    Box,
    Tabs,
    Loader,
    Center,
} from '@mantine/core';
import {
    IconActivityHeartbeat,
    IconServer,
    IconFileText,
    IconCpu,
    IconUser,
    IconTools,
} from '@tabler/icons-react';
import { PageScaffold } from '../../components/layout/PageScaffold';
import { SectionHero } from '../../components/ui';
import { BackendsTab } from './BackendsTab';
import { KohyaTrainerTab } from './KohyaTrainerTab';
import { useNavigationStore, type ServerRouteState } from '../../stores/navigationStore';

const LogsTab = lazy(() => import('./LogsTab').then(m => ({ default: m.LogsTab })));
const ResourcesTab = lazy(() => import('./ResourcesTab').then(m => ({ default: m.ResourcesTab })));
const AccountTab = lazy(() => import('./AccountTab').then(m => ({ default: m.AccountTab })));
const AdminToolsTab = lazy(() => import('./AdminToolsTab').then(m => ({ default: m.AdminToolsTab })));

const TabFallback = () => (
    <Center h={300}><Loader size="lg" /></Center>
);

interface ServerPageProps {
    routeState?: ServerRouteState;
}

export function ServerPage({ routeState }: ServerPageProps) {
    const navigateToServer = useNavigationStore((state) => state.navigateToServer);
    const activeTab = routeState?.tab || 'backends';
    const activeTabLabel = activeTab === 'backends'
        ? 'Backends'
        : activeTab === 'logs'
            ? 'Logs'
            : activeTab === 'resources'
                ? 'Resources'
                : activeTab === 'account'
                    ? 'Account'
                    : activeTab === 'trainer'
                        ? 'Trainer'
                    : 'Admin Tools';

    useEffect(() => {
        if (!routeState?.tab) {
            navigateToServer({ tab: 'backends' });
        }
    }, [navigateToServer, routeState?.tab]);

    return (
        <PageScaffold
            density="compact"
            className="swarm-server-page"
            header={
                <SectionHero
                    variant="subtle"
                    title="Server Control"
                    subtitle="Backend status, logs, resources, account access, and admin tooling in one calmer shell."
                    icon={<IconActivityHeartbeat size={18} color="var(--theme-accent-2)" className="fx-icon-float" />}
                    badges={[
                        { label: `${activeTabLabel} active`, tone: 'secondary' },
                    ]}
                />
            }
        >
            <Box p="md" style={{ flex: 1, minHeight: 0 }}>
                <Tabs
                    value={activeTab}
                    onChange={(value) => {
                        const nextTab = (value || 'backends') as NonNullable<ServerRouteState['tab']>;
                        if (nextTab !== activeTab) {
                            navigateToServer({ tab: nextTab });
                        }
                    }}
                    keepMounted={false}
                    className="swarm-server-tabs"
                >
                    <Tabs.List mb="md" className="swarm-server-tabs__list">
                        <Tabs.Tab value="backends" leftSection={<IconServer size={16} />}>
                            Backends
                        </Tabs.Tab>
                        <Tabs.Tab value="logs" leftSection={<IconFileText size={16} />}>
                            Logs
                        </Tabs.Tab>
                        <Tabs.Tab value="resources" leftSection={<IconCpu size={16} />}>
                            Resources
                        </Tabs.Tab>
                        <Tabs.Tab value="account" leftSection={<IconUser size={16} />}>
                            Account
                        </Tabs.Tab>
                        <Tabs.Tab value="trainer" leftSection={<IconTools size={16} />}>
                            Trainer
                        </Tabs.Tab>
                        <Tabs.Tab value="admin-tools" leftSection={<IconTools size={16} />}>
                            Admin Tools
                        </Tabs.Tab>
                    </Tabs.List>

                    <Tabs.Panel value="backends" className="swarm-server-panel">
                        <BackendsTab />
                    </Tabs.Panel>

                    <Tabs.Panel value="logs" className="swarm-server-panel">
                        <Suspense fallback={<TabFallback />}>
                            <LogsTab />
                        </Suspense>
                    </Tabs.Panel>

                    <Tabs.Panel value="resources" className="swarm-server-panel">
                        <Suspense fallback={<TabFallback />}>
                            <ResourcesTab />
                        </Suspense>
                    </Tabs.Panel>

                    <Tabs.Panel value="account" className="swarm-server-panel">
                        <Suspense fallback={<TabFallback />}>
                            <AccountTab />
                        </Suspense>
                    </Tabs.Panel>

                    <Tabs.Panel value="trainer" className="swarm-server-panel">
                        <KohyaTrainerTab />
                    </Tabs.Panel>

                    <Tabs.Panel value="admin-tools" className="swarm-server-panel">
                        <Suspense fallback={<TabFallback />}>
                            <AdminToolsTab />
                        </Suspense>
                    </Tabs.Panel>
                </Tabs>
            </Box>
        </PageScaffold>
    );
}
