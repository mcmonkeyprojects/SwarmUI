import { useEffect, Suspense, lazy, useRef, useState, type ReactNode } from 'react';
import { MantineProvider, AppShell, Loader, Center } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { notifications } from '@mantine/notifications';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient, queryKeys } from './api/queryClient';
import { ConnectionBanner } from './components/ConnectionBanner';
import { prefetchRoute } from './components/PrefetchLink';
import { preloadCriticalData } from './utils/preloadCriticalData';
import { swarmClient } from './api/client';
import { swarmBackendAdapter } from './api/backendAdapter';
import { useSessionStore } from './stores/session';
import { useShallow } from 'zustand/react/shallow';
const GeneratePage = lazy(() => retryDynamicImport(() => import('./pages/GeneratePage').then(module => ({ default: module.GeneratePage }))));
const HistoryPage = lazy(() => retryDynamicImport(() => import('./pages/HistoryPage').then(module => ({ default: module.HistoryPage }))));
const QueuePage = lazy(() => retryDynamicImport(() => import('./pages/QueuePage').then(module => ({ default: module.QueuePage }))));
const WorkflowPage = lazy(() => retryDynamicImport(() => import('./pages/WorkflowPage').then(module => ({ default: module.WorkflowPage }))));
const ServerPage = lazy(() => retryDynamicImport(() => import('./pages/ServerPage').then(module => ({ default: module.ServerPage }))));
const RoleplayPage = lazy(() => retryDynamicImport(() => import('./pages/RoleplayPage').then(module => ({ default: module.RoleplayPage }))));
const AssetCatalogModal = lazy(() => retryDynamicImport(() => import('./components/AssetCatalogModal').then(module => ({ default: module.AssetCatalogModal }))));
const CommandPalette = lazy(() => retryDynamicImport(() => import('./components/CommandPalette').then(module => ({ default: module.CommandPalette }))));
const ModelDownloader = lazy(() => retryDynamicImport(() => import('./components/ModelDownloader').then(module => ({ default: module.ModelDownloader }))));
const CanvasWorkflowHost = lazy(() => retryDynamicImport(() => import('./components/canvas/CanvasWorkflowHost').then(module => ({ default: module.CanvasWorkflowHost }))));
const ProjectWorkspaceModal = lazy(() => retryDynamicImport(() => import('./components/projects/ProjectWorkspaceModal').then(module => ({ default: module.ProjectWorkspaceModal }))));
// Skeleton for instant visual feedback while GeneratePage lazy-loads
import { GeneratePageSkeleton } from './components/GeneratePageSkeleton';
// Performance Dashboard - development only, lazy loaded
const PerformanceDashboard = lazy(() => retryDynamicImport(() => import('./components/dev/PerformanceDashboard')));
import { theme } from './theme';
import { InstallPrompt, UpdateNotification } from './components/InstallPrompt';
import { initializeTheme, useThemeStore } from './store/themeStore';
import { useAdaptiveAccentPipeline } from './hooks/useAdaptiveAccentPipeline';
import { initializeAnimationSettings } from './store/animationStore';
import { useViewTransition } from './hooks/useViewTransition';
import { useNavigationStore, type AppPage, type AppRoute } from './stores/navigationStore';
import { AppHeader } from './components/layout/AppHeader';
import { useCanvasWorkflowStore } from './stores/canvasWorkflowStore';
import { usePromptCacheStore } from './stores/promptCacheStore';
import { usePerformanceSessionStore } from './stores/performanceSessionStore';
import { isWebRuntimeTarget } from './config/runtimeTarget';
import { featureFlags } from './config/featureFlags';
import type { BackendBootstrapSnapshot } from './api/types';

import '@mantine/core/styles.css';
import '@mantine/notifications/styles.css';
import './styles/animations.css';
import { ErrorBoundary } from './components/ErrorBoundary';

type ElectronAPI = {
  version: string;
  shutdownApp?: () => Promise<boolean>;
  reloadWrapper?: () => Promise<boolean>;
  writePerformanceMetrics?: (payload: string) => Promise<{ success: boolean; path: string; error?: string }>;
};

const DYNAMIC_IMPORT_RETRY_DELAYS_MS = [250, 750, 1500];

async function retryDynamicImport<T>(loader: () => Promise<T>): Promise<T> {
  let lastError: unknown = null;
  for (let attempt = 0; attempt <= DYNAMIC_IMPORT_RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      return await loader();
    } catch (error) {
      lastError = error;
      const delay = DYNAMIC_IMPORT_RETRY_DELAYS_MS[attempt];
      if (delay === undefined) {
        break;
      }
      await new Promise((resolve) => {
        window.setTimeout(resolve, delay);
      });
    }
  }
  throw lastError;
}

// Initialize theme on app load
initializeTheme();
initializeAnimationSettings();

function shouldSkipStartupPrefetch(): boolean {
  const nav = navigator as Navigator & {
    connection?: {
      saveData?: boolean;
      effectiveType?: string;
    };
  };

  const connection = nav.connection;
  if (!connection) return false;

  if (connection.saveData) return true;
  return connection.effectiveType === 'slow-2g' || connection.effectiveType === '2g';
}

function PageFrame({
  pageKey,
  children,
}: {
  pageKey: string;
  children: ReactNode;
}) {
  return (
    <div
      key={pageKey}
      className="gpu-accelerated page-enter-active"
      style={{ height: '100%' }}
    >
      {children}
    </div>
  );
}

function PageLoader() {
  return (
    <Center h="100%">
      <Loader size="lg" />
    </Center>
  );
}

function getUnknownErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message || error.name;
  }
  if (typeof error === 'string') {
    return error;
  }
  try {
    return JSON.stringify(error) ?? 'Unknown error';
  } catch {
    return 'Unknown error';
  }
}

function getUnknownErrorStack(error: unknown): string | null {
  return error instanceof Error && error.stack ? error.stack : null;
}

function truncateRuntimeTelemetryText(text: string | null, maxLength: number = 1800): string | null {
  if (!text) {
    return null;
  }
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, maxLength).trimEnd()}...`;
}

function AppRouteOutlet({
  currentPage,
  route,
}: {
  currentPage: AppPage;
  route: AppRoute;
}) {
  switch (currentPage) {
    case 'generate':
      return (
        <Suspense fallback={<GeneratePageSkeleton />}>
          <PageFrame pageKey="generate">
            <GeneratePage routeState={route.generate} />
          </PageFrame>
        </Suspense>
      );
    case 'history':
      return (
        <Suspense fallback={<PageLoader />}>
          <PageFrame pageKey="history">
            <HistoryPage routeState={route.history} />
          </PageFrame>
        </Suspense>
      );
    case 'queue':
      return (
        <Suspense fallback={<PageLoader />}>
          <PageFrame pageKey="queue">
            <QueuePage routeState={route.queue} />
          </PageFrame>
        </Suspense>
      );
    case 'workflows':
      return (
        <Suspense fallback={<PageLoader />}>
          <PageFrame pageKey="workflows">
            <WorkflowPage routeState={route.workflows} />
          </PageFrame>
        </Suspense>
      );
    case 'server':
      return (
        <Suspense fallback={<PageLoader />}>
          <PageFrame pageKey="server">
            <ServerPage routeState={route.server} />
          </PageFrame>
        </Suspense>
      );
    case 'roleplay':
      return (
        <Suspense fallback={<PageLoader />}>
          <PageFrame pageKey="roleplay">
            <RoleplayPage routeState={route.roleplay} />
          </PageFrame>
        </Suspense>
      );
    default:
      return null;
  }
}

function AppContent() {
  const { route, currentPage, setCurrentPage, syncFromLocation } = useNavigationStore(useShallow((state) => ({
    route: state.route,
    currentPage: state.currentPage,
    setCurrentPage: state.setCurrentPage,
    syncFromLocation: state.syncFromLocation,
  })));
  const { isSessionInitialized, isSessionInitializing } = useSessionStore(
    useShallow((state) => ({
      isSessionInitialized: state.isInitialized,
      isSessionInitializing: state.isInitializing,
    }))
  );
  const startNavigation = usePerformanceSessionStore((state) => state.startNavigation);
  const completeNavigation = usePerformanceSessionStore((state) => state.completeNavigation);
  const markSessionBootstrapped = usePerformanceSessionStore((state) => state.markSessionBootstrapped);
  const recordEventLoopLag = usePerformanceSessionStore((state) => state.recordEventLoopLag);
  const recordSessionEvent = usePerformanceSessionStore((state) => state.recordSessionEvent);
  const { startTransition } = useViewTransition();
  const electronAPI = (window as Window & { electronAPI?: ElectronAPI }).electronAPI;
  const [modelDownloaderOpen, setModelDownloaderOpen] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [assetCatalogOpen, setAssetCatalogOpen] = useState(false);
  const [projectWorkspaceOpen, setProjectWorkspaceOpen] = useState(false);
  const isCanvasWorkflowActive = useCanvasWorkflowStore((state) => state.isOpen || state.upscalerOpen);
  const appStartRef = useRef(0);

  // Get theme store state and sync function
  const { _hasHydrated, syncThemeCSS, currentTheme, resolvedColorScheme, customAccent } = useThemeStore(useShallow((state) => ({
    _hasHydrated: state._hasHydrated,
    syncThemeCSS: state.syncThemeCSS,
    currentTheme: state.currentTheme,
    resolvedColorScheme: state.resolvedColorScheme,
    customAccent: state.customAccent,
  })));

  // Sync theme CSS after Zustand hydration completes
  useEffect(() => {
    if (_hasHydrated) {
      // Re-apply theme CSS to ensure it's synced after hydration
      syncThemeCSS();
    }
  }, [_hasHydrated, syncThemeCSS]);

  // Also sync when theme values change (for good measure)
  useEffect(() => {
    syncThemeCSS();
  }, [currentTheme, resolvedColorScheme, customAccent, syncThemeCSS]);

  // Keep the transient adaptive accent layered on top of the base theme.
  useAdaptiveAccentPipeline();

  // Preload only Generate-adjacent data on idle to keep startup responsive.
  useEffect(() => {
    appStartRef.current = performance.now();
  }, []);

  useEffect(() => {
    if (shouldSkipStartupPrefetch()) {
      return;
    }

    let dataId: number | null = null;
    let dataTimer: number | null = null;

    const schedulePreload = () => {
      if ('requestIdleCallback' in window) {
        dataId = requestIdleCallback(() => preloadCriticalData(), { timeout: 5000 });
      } else {
        dataTimer = setTimeout(preloadCriticalData, 2500);
      }
    };

    const startDelay = setTimeout(schedulePreload, 1200);

    return () => {
      clearTimeout(startDelay);

      if (dataId !== null) {
        cancelIdleCallback(dataId);
      }
      if (dataTimer !== null) {
        clearTimeout(dataTimer);
      }
    };
  }, []);

  // Keep frontend and backend caches bounded for long-running sessions.
  useEffect(() => {
    const MAX_CACHE_AGE_MS = 24 * 60 * 60 * 1000;

    const pruneCaches = () => {
      usePromptCacheStore.getState().pruneOld(MAX_CACHE_AGE_MS);
    };

    pruneCaches();
    const intervalId = setInterval(pruneCaches, 30 * 60 * 1000);
    return () => clearInterval(intervalId);
  }, []);

  // Handle page changes with View Transitions API
  const handlePageChange = (newPage: AppPage) => {
    if (newPage === currentPage) return;

    startNavigation(newPage);

    // Use View Transitions if supported, otherwise just set directly
    startTransition(() => {
      setCurrentPage(newPage);
    });
  };

  const handleShutdown = async () => {
    if (!window.confirm('Shutdown SwarmUI?\n\nThis will:\n- Stop the backend server\n- Close the application\n\nAre you sure?')) {
      return;
    }

    try {
      notifications.show({
        title: 'Shutting Down',
        message: 'Stopping backend server...',
        color: 'orange',
        autoClose: 5000,
      });

      await swarmClient.shutdownServer();

      if (electronAPI?.shutdownApp) {
        await electronAPI.shutdownApp();
        return;
      }

      notifications.show({
        title: 'Server Stopped',
        message: 'SwarmUI backend is stopped. You can close this tab/window.',
        color: 'gray',
        autoClose: false,
      });
    } catch (error) {
      console.error('Shutdown failed:', error);
      notifications.show({
        title: 'Shutdown Failed',
        message: 'Could not shut down server. You may need admin permissions.',
        color: 'red',
      });
    }
  };

  const handleReloadWrapper = async () => {
    try {
      if (electronAPI?.reloadWrapper) {
        await electronAPI.reloadWrapper();
        return;
      }
      window.location.reload();
    } catch (error) {
      console.error('Wrapper reload failed:', error);
      notifications.show({
        title: 'Reload Failed',
        message: 'Could not reload desktop wrapper.',
        color: 'red',
      });
    }
  };

  const handleLogout = async () => {
    try {
      await swarmClient.logout();
      useSessionStore.getState().clearSession();
      window.location.reload();
    } catch (error) {
      console.error('Logout failed:', error);
      notifications.show({
        title: 'Logout Failed',
        message: 'Could not log out. Try refreshing the page.',
        color: 'red',
      });
    }
  };

  useEffect(() => {
    syncFromLocation();
  }, [syncFromLocation]);

  useEffect(() => {
    return swarmBackendAdapter.subscribe((event) => {
      if (event.type !== 'bootstrap:refreshed') {
        return;
      }

      const snapshot = event.data as BackendBootstrapSnapshot;

      queryClient.setQueryData(queryKeys.backend.bootstrap, snapshot);
      queryClient.setQueryData(queryKeys.backends.list(), snapshot.backendStatus);
    });
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setCommandPaletteOpen((value) => !value);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    if (!isSessionInitialized) {
      return;
    }

    markSessionBootstrapped(performance.now() - appStartRef.current);
  }, [isSessionInitialized, markSessionBootstrapped]);

  useEffect(() => {
    if (!isSessionInitialized) {
      return;
    }

    const routeName = route.page;
    const startedAt = performance.now();
    const settleTimer = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        completeNavigation(routeName, performance.now() - startedAt);
      });
    });

    return () => {
      cancelAnimationFrame(settleTimer);
    };
  }, [completeNavigation, isSessionInitialized, route.page]);

  useEffect(() => {
    if (!isSessionInitialized) {
      return;
    }

    const intervalMs = 5000;
    let expected = performance.now() + intervalMs;
    const intervalId = window.setInterval(() => {
      const now = performance.now();
      const lagMs = Math.max(0, now - expected);
      expected = now + intervalMs;
      if (document.visibilityState !== 'visible') {
        return;
      }
      if (lagMs > intervalMs * 3) {
        recordSessionEvent('event-loop:discarded-resume-sample', 'info', {
          lagMs,
          intervalMs,
          reason: 'visibility-or-sleep-resume',
        });
        return;
      }
      recordEventLoopLag(lagMs);
    }, intervalMs);

    const handleVisibilityChange = () => {
      expected = performance.now() + intervalMs;
      recordSessionEvent(
        document.visibilityState === 'visible'
          ? 'app:visibility-visible'
          : 'app:visibility-hidden',
        'info'
      );
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isSessionInitialized, recordEventLoopLag, recordSessionEvent]);

  useEffect(() => {
    const persistCrashTelemetry = () => {
      const api = (window as Window & { electronAPI?: ElectronAPI }).electronAPI;
      if (!api?.writePerformanceMetrics) {
        return;
      }
      try {
        void api.writePerformanceMetrics(usePerformanceSessionStore.getState().exportSession());
      } catch (error) {
        console.error('Failed to persist runtime crash telemetry:', error);
      }
    };

    const recordRuntimeFailure = (
      name: string,
      error: unknown,
      metadata?: Record<string, unknown>
    ) => {
      recordSessionEvent(
        name,
        'bad',
        {
          route: `${window.location.pathname}${window.location.search}${window.location.hash}`,
          message: truncateRuntimeTelemetryText(getUnknownErrorMessage(error)),
          stack: truncateRuntimeTelemetryText(getUnknownErrorStack(error)),
          ...metadata,
        }
      );
      persistCrashTelemetry();
    };

    const handleError = (event: ErrorEvent) => {
      recordRuntimeFailure('runtime:window-error', event.error || event.message, {
        source: event.filename || null,
        line: event.lineno || null,
        column: event.colno || null,
      });
    };

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      recordRuntimeFailure('runtime:unhandled-rejection', event.reason);
    };

    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleUnhandledRejection);

    return () => {
      window.removeEventListener('error', handleError);
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
    };
  }, [recordSessionEvent]);

  return (
    <>
      {/* Non-blocking connection status banner */}
      <ConnectionBanner autoHideDelay={2500} />

      {isWebRuntimeTarget && (
        <>
          <InstallPrompt position="bottom" />
          <UpdateNotification />
        </>
      )}

      <AppShell
        header={{ height: 'var(--app-header-height)' }}
        padding={0}
      >
        <AppShell.Header p="sm">
          <AppHeader
            currentPage={currentPage}
            onPageChange={handlePageChange}
            onPrefetchPage={(page) => {
              if (page !== currentPage) {
                prefetchRoute(page);
              }
            }}
            onOpenCommandPalette={() => setCommandPaletteOpen(true)}
            onOpenModelDownloader={() => setModelDownloaderOpen(true)}
            onOpenProjects={() => setProjectWorkspaceOpen(true)}
            onReloadWrapper={handleReloadWrapper}
            onLogout={handleLogout}
            onShutdown={handleShutdown}
            onNavigateToQueue={() => setCurrentPage('queue')}
          />
        </AppShell.Header>

        <AppShell.Main>
          {isSessionInitialized ? (
            <AppRouteOutlet currentPage={currentPage} route={route} />
          ) : (
            <Center h="100%">
              <Loader size="lg" />
              {!isSessionInitializing && (
                <span style={{ marginLeft: 12 }}>Connecting to SwarmUI...</span>
              )}
            </Center>
          )}
        </AppShell.Main>
      </AppShell>

      <Suspense fallback={null}>
        <CommandPalette
          opened={commandPaletteOpen}
          onClose={() => setCommandPaletteOpen(false)}
          onOpenAssetCatalog={() => {
            setCommandPaletteOpen(false);
            setAssetCatalogOpen(true);
          }}
        />
      </Suspense>

      <Suspense fallback={null}>
        <AssetCatalogModal
          opened={assetCatalogOpen}
          onClose={() => setAssetCatalogOpen(false)}
        />
      </Suspense>

      <Suspense fallback={null}>
        <ProjectWorkspaceModal
          opened={projectWorkspaceOpen}
          onClose={() => setProjectWorkspaceOpen(false)}
        />
      </Suspense>

      {/* Performance Dashboard - development only */}
      {import.meta.env.DEV && featureFlags.devPerformanceDashboard && (
        <Suspense fallback={null}>
          <PerformanceDashboard />
        </Suspense>
      )}

      {isCanvasWorkflowActive && (
        <Suspense fallback={null}>
          <CanvasWorkflowHost />
        </Suspense>
      )}

      <Suspense fallback={null}>
        <ModelDownloader
          opened={modelDownloaderOpen}
          onClose={() => setModelDownloaderOpen(false)}
        />
      </Suspense>
    </>
  );
}

function App() {
  const resolvedColorScheme = useThemeStore((state) => state.resolvedColorScheme);

  return (
    <QueryClientProvider client={queryClient}>
      <MantineProvider
        theme={theme}
        defaultColorScheme="dark"
        forceColorScheme={resolvedColorScheme}
      >
        <Notifications
          position="bottom-right"
          styles={() => ({
            root: {
              backgroundColor: 'var(--theme-gray-8)',
            },
            notification: {
              backgroundColor: 'var(--theme-gray-8)',
              borderLeft: '3px solid var(--theme-brand)',
            },
          })}
        />
        <ErrorBoundary>
          <AppContent />
        </ErrorBoundary>
      </MantineProvider>
    </QueryClientProvider>
  );
}

export default App;
