import { useGenerationStore } from '../store/generationStore';
import { usePromptCacheStore } from '../stores/promptCacheStore';
import { useFavoritesStore } from '../stores/favoritesStore';

const LAST_ROUTE_KEY = 'swarmui-last-route-v1';

interface PersistStoreApi {
    persist?: {
        clearStorage?: () => void | Promise<void>;
    };
}

async function clearPersistedStore(store: PersistStoreApi): Promise<void> {
    await store.persist?.clearStorage?.();
}

/**
 * Clears volatile persisted UI state so a reload starts from a safer baseline.
 */
export async function recoverFromRuntimeCrash(): Promise<void> {
    if (typeof window === 'undefined') {
        return;
    }

    useGenerationStore.getState().reset();
    usePromptCacheStore.getState().clear();
    useFavoritesStore.setState({
        favoriteIds: [],
        _cachedFavorites: [],
        _favoritesCacheKey: null,
    });

    await Promise.allSettled([
        clearPersistedStore(useGenerationStore as PersistStoreApi),
        clearPersistedStore(usePromptCacheStore as PersistStoreApi),
        clearPersistedStore(useFavoritesStore as PersistStoreApi),
    ]);

    window.localStorage.removeItem(LAST_ROUTE_KEY);

    const safeUrl = `${window.location.pathname}${window.location.search}`;
    window.location.replace(safeUrl);
}
