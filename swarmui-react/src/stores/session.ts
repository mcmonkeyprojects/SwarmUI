import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { swarmClient, type SessionChangeReason } from '../api/client';
import { swarmBackendAdapter } from '../api/backendAdapter';
import { useWebSocketStore } from './websocketStore';
import { resolveRuntimeEndpoints } from '../config/runtimeEndpoints';
import { featureFlags } from '../config/featureFlags';

interface SessionState {
  isInitialized: boolean;
  isInitializing: boolean;
  sessionId: string | null;
  userId: string | null;
  permissions: string[];
  initializeSession: () => Promise<void>;
  clearSession: () => void;
}

function syncSessionToWebSocket(
  sessionId: string,
  reason: SessionChangeReason = 'init'
): void {
  const wsBaseUrl = resolveRuntimeEndpoints().wsBaseUrl;
  const wsState = useWebSocketStore.getState();
  if (wsState.isInitialized) {
    wsState.updateSession(sessionId, reason);
    return;
  }
  wsState.initialize(wsBaseUrl, sessionId, reason);
}

function applySessionState(
  session: { session_id: string; user_id: string; permissions?: string[]; version?: string } | null
): void {
  if (!session) {
    useSessionStore.setState({
      isInitialized: false,
      isInitializing: false,
      sessionId: null,
      userId: null,
      permissions: [],
    });
    return;
  }

  useSessionStore.setState({
    isInitialized: true,
    isInitializing: false,
    sessionId: session.session_id,
    userId: session.user_id,
    permissions: session.permissions || [],
  });
}

export const useSessionStore = create<SessionState>()(
  devtools(
    (set, get) => ({
      isInitialized: false,
      isInitializing: false,
      sessionId: null,
      userId: null,
      permissions: [],

      initializeSession: async () => {
        if (get().isInitialized || get().isInitializing) {
          console.debug('[SessionStore] Session already initialized or initializing, skipping');
          return;
        }

        set({ isInitializing: true });

        try {
          const response = await swarmClient.initSession('init');
          swarmBackendAdapter.setSession(response);
          applySessionState(response);
          syncSessionToWebSocket(response.session_id, 'init');
          await swarmBackendAdapter.getBootstrap('startup');
          console.debug('[SessionStore] Session and WebSocket initialized');
        } catch (error) {
          set({ isInitializing: false });
          console.error('Failed to initialize session:', error);
          throw error;
        }
      },

      clearSession: () => {
        swarmBackendAdapter.setSession(null);
        set({
          isInitialized: false,
          isInitializing: false,
          sessionId: null,
          userId: null,
          permissions: [],
        });
      },
    }),
    { name: 'SessionStore' }
  )
);

const SESSION_LISTENER_KEY = '__swarmui_sync_session_v2_listener_registered__';

if (
  featureFlags.syncSessionV2 &&
  !(globalThis as Record<string, unknown>)[SESSION_LISTENER_KEY]
) {
  (globalThis as Record<string, unknown>)[SESSION_LISTENER_KEY] = true;
  swarmClient.onSessionChanged((session, reason) => {
    applySessionState(session);
    if (session?.session_id) {
      swarmBackendAdapter.setSession({
        session_id: session.session_id,
        user_id: session.user_id,
        output_append_user: false,
        version: '',
        server_id: '',
        permissions: session.permissions || [],
      });
    } else {
      swarmBackendAdapter.setSession(null);
    }
    if (!session?.session_id) {
      return;
    }
    syncSessionToWebSocket(session.session_id, reason);
    void swarmBackendAdapter.getBootstrap(reason === 'refresh' ? 'session-refresh' : 'manual');
  });
}
