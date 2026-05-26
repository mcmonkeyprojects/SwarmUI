export type AppPage = 'generate' | 'history' | 'queue' | 'workflows' | 'server' | 'roleplay';

export type GenerateWorkspaceMode = 'quick' | 'guided' | 'advanced' | 'video' | 'pipeline';

export interface GenerateRouteState {
    mode?: GenerateWorkspaceMode;
    recipe?: string | null;
    compare?: string | null;
    restore?: '1' | null;
}

export interface HistoryRouteState {
    path?: string | null;
    query?: string | null;
    sortBy?: 'Date' | 'Name';
    sortReverse?: boolean;
    starredOnly?: boolean;
    mediaType?: 'all' | 'image' | 'video' | 'audio' | 'html';
    currentFolderOnly?: boolean;
    image?: string | null;
    viewId?: string | null;
}

export interface QueueRouteState {
    jobId?: string | null;
    batchId?: string | null;
    view?: 'all' | 'batches' | 'scheduled';
}

export interface WorkflowRouteState {
    mode?: 'wizard' | 'comfy';
}

export interface ServerRouteState {
    tab?: 'backends' | 'updates' | 'logs' | 'client-logs' | 'resources' | 'account' | 'admin-tools' | 'trainer';
}

export interface RoleplayRouteState {
    characterId?: string | null;
}

export interface AppRoute {
    page: AppPage;
    generate?: GenerateRouteState;
    history?: HistoryRouteState;
    queue?: QueueRouteState;
    workflows?: WorkflowRouteState;
    server?: ServerRouteState;
    roleplay?: RoleplayRouteState;
}

const DEFAULT_ROUTE: AppRoute = {
    page: 'generate',
    generate: {
        mode: 'advanced',
    },
};

const DEFAULT_HISTORY_ROUTE_STATE: HistoryRouteState = {
    path: null,
    query: null,
    sortBy: 'Date',
    sortReverse: false,
    starredOnly: false,
    mediaType: 'all',
    currentFolderOnly: false,
    image: null,
    viewId: null,
};

function readBoolean(value: string | null): boolean | undefined {
    if (value === null) {
        return undefined;
    }

    return value === '1' || value.toLowerCase() === 'true';
}

function writeBoolean(params: URLSearchParams, key: string, value: boolean | undefined): void {
    if (value === undefined) {
        return;
    }

    params.set(key, value ? '1' : '0');
}

export function normalizeRoute(route: Partial<AppRoute> | null | undefined): AppRoute {
    const page = route?.page ?? DEFAULT_ROUTE.page;

    return {
        page,
        generate: {
            mode: route?.generate?.mode ?? DEFAULT_ROUTE.generate?.mode,
            recipe: route?.generate?.recipe ?? null,
            compare: route?.generate?.compare ?? null,
            restore: route?.generate?.restore ?? null,
        },
        history: normalizeHistoryRouteState(route?.history),
        queue: {
            jobId: route?.queue?.jobId ?? null,
            batchId: route?.queue?.batchId ?? null,
            view: route?.queue?.view ?? 'all',
        },
        workflows: {
            mode: route?.workflows?.mode ?? 'wizard',
        },
        server: {
            tab: route?.server?.tab ?? 'backends',
        },
        roleplay: {
            characterId: route?.roleplay?.characterId ?? null,
        },
    };
}

export function normalizeHistoryRouteState(route: Partial<HistoryRouteState> | null | undefined): HistoryRouteState {
    return {
        path: route?.path ?? DEFAULT_HISTORY_ROUTE_STATE.path,
        query: route?.query ?? DEFAULT_HISTORY_ROUTE_STATE.query,
        sortBy: route?.sortBy ?? DEFAULT_HISTORY_ROUTE_STATE.sortBy,
        sortReverse: route?.sortReverse ?? DEFAULT_HISTORY_ROUTE_STATE.sortReverse,
        starredOnly: route?.starredOnly ?? DEFAULT_HISTORY_ROUTE_STATE.starredOnly,
        mediaType: route?.mediaType ?? DEFAULT_HISTORY_ROUTE_STATE.mediaType,
        currentFolderOnly: route?.currentFolderOnly ?? DEFAULT_HISTORY_ROUTE_STATE.currentFolderOnly,
        image: route?.image ?? DEFAULT_HISTORY_ROUTE_STATE.image,
        viewId: route?.viewId ?? DEFAULT_HISTORY_ROUTE_STATE.viewId,
    };
}

export function serializeHistoryRouteState(route: Partial<HistoryRouteState> | null | undefined): string {
    return serializeRoute({
        page: 'history',
        history: normalizeHistoryRouteState(route),
    });
}

export function isHistoryRouteStateEqual(
    left: Partial<HistoryRouteState> | null | undefined,
    right: Partial<HistoryRouteState> | null | undefined
): boolean {
    return serializeHistoryRouteState(left) === serializeHistoryRouteState(right);
}

export function parseHashRoute(hashValue: string): AppRoute {
    const rawHash = hashValue.startsWith('#') ? hashValue.slice(1) : hashValue;
    const hash = rawHash.startsWith('/') ? rawHash : `/${rawHash}`;
    const [pathname = '/generate', search = ''] = hash.split('?');
    const pageCandidate = pathname.replace(/^\/+/, '').split('/')[0] as AppPage;
    const page: AppPage = ['generate', 'history', 'queue', 'workflows', 'server', 'roleplay'].includes(pageCandidate)
        ? pageCandidate
        : 'generate';

    const params = new URLSearchParams(search);

    return normalizeRoute({
        page,
        generate: {
            mode: (params.get('mode') as GenerateWorkspaceMode | null) ?? undefined,
            recipe: params.get('recipe'),
            compare: params.get('compare'),
            restore: params.get('restore') === '1' ? '1' : null,
        },
        history: {
            path: params.get('path'),
            query: params.get('query'),
            sortBy: (params.get('sortBy') as 'Date' | 'Name' | null) ?? undefined,
            sortReverse: readBoolean(params.get('sortReverse')),
            starredOnly: readBoolean(params.get('starredOnly')),
            mediaType: (params.get('mediaType') as HistoryRouteState['mediaType']) ?? undefined,
            currentFolderOnly: readBoolean(params.get('currentFolderOnly')),
            image: params.get('image'),
            viewId: params.get('viewId'),
        },
        queue: {
            jobId: params.get('jobId'),
            batchId: params.get('batchId'),
            view: (params.get('view') as QueueRouteState['view']) ?? undefined,
        },
        workflows: {
            mode: (params.get('mode') as WorkflowRouteState['mode']) ?? undefined,
        },
        server: {
            tab: (params.get('tab') as ServerRouteState['tab']) ?? undefined,
        },
        roleplay: {
            characterId: params.get('characterId'),
        },
    });
}

export function serializeRoute(routeInput: Partial<AppRoute> | null | undefined): string {
    const route = normalizeRoute(routeInput);
    const params = new URLSearchParams();

    if (route.page === 'generate') {
        if (route.generate?.mode && route.generate.mode !== 'advanced') {
            params.set('mode', route.generate.mode);
        }
        if (route.generate?.recipe) {
            params.set('recipe', route.generate.recipe);
        }
        if (route.generate?.compare) {
            params.set('compare', route.generate.compare);
        }
        if (route.generate?.restore) {
            params.set('restore', route.generate.restore);
        }
    }

    if (route.page === 'history') {
        if (route.history?.path) {
            params.set('path', route.history.path);
        }
        if (route.history?.query) {
            params.set('query', route.history.query);
        }
        if (route.history?.sortBy && route.history.sortBy !== 'Date') {
            params.set('sortBy', route.history.sortBy);
        }
        writeBoolean(params, 'sortReverse', route.history?.sortReverse);
        writeBoolean(params, 'starredOnly', route.history?.starredOnly);
        if (route.history?.mediaType && route.history.mediaType !== 'all') {
            params.set('mediaType', route.history.mediaType);
        }
        writeBoolean(params, 'currentFolderOnly', route.history?.currentFolderOnly);
        if (route.history?.image) {
            params.set('image', route.history.image);
        }
        if (route.history?.viewId) {
            params.set('viewId', route.history.viewId);
        }
    }

    if (route.page === 'queue') {
        if (route.queue?.jobId) {
            params.set('jobId', route.queue.jobId);
        }
        if (route.queue?.batchId) {
            params.set('batchId', route.queue.batchId);
        }
        if (route.queue?.view && route.queue.view !== 'all') {
            params.set('view', route.queue.view);
        }
    }

    if (route.page === 'workflows' && route.workflows?.mode && route.workflows.mode !== 'wizard') {
        params.set('mode', route.workflows.mode);
    }

    if (route.page === 'server' && route.server?.tab && route.server.tab !== 'backends') {
        params.set('tab', route.server.tab);
    }

    if (route.page === 'roleplay' && route.roleplay?.characterId) {
        params.set('characterId', route.roleplay.characterId);
    }

    const query = params.toString();
    return `#/${route.page}${query ? `?${query}` : ''}`;
}

export function isRouteEqual(left: Partial<AppRoute> | null | undefined, right: Partial<AppRoute> | null | undefined): boolean {
    return serializeRoute(left) === serializeRoute(right);
}

export function getCurrentHashRoute(): AppRoute {
    if (typeof window === 'undefined') {
        return DEFAULT_ROUTE;
    }

    const hash = window.location.hash || serializeRoute(DEFAULT_ROUTE);
    return parseHashRoute(hash);
}
