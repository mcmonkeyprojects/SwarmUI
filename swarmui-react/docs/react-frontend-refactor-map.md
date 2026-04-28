# React Frontend Architecture Map

This is the working architecture inventory for the React frontend. Keep it updated whenever routes, page ownership, runtime targets, API endpoints, state stores, feature modules, or refactor boundaries change.

## Purpose

- Capture what the React frontend currently does before large refactors change ownership boundaries.
- Make performance and maintainability work systematic: page by page, endpoint by endpoint, store by store.
- Preserve compatibility while refactoring: route shapes, localStorage keys, persisted Zustand schemas, query keys, backend API names, and wrapper integration points are compatibility boundaries.
- Record known hotspots and next refactor candidates so future work starts from the current map instead of rediscovering the codebase.

## Stack And Runtime Targets

- Core stack: Vite, React 19, TypeScript, Mantine, Zustand, React Query, React Compiler, PWA support, Electron, Tauri, Web Workers.
- Entry path: `src/main.tsx` mounts `src/App.tsx`.
- App shell: `src/App.tsx` owns providers, route lazy loading, session bootstrap, global modals, header actions, route prefetch, connection banner, PWA prompts, and performance session tracking.
- Runtime endpoint resolution:
  - `vite-proxy`: local Vite hosts on `localhost:51xx` or `127.0.0.1:51xx`, with `/API`, `/View`, `/Output`, and `/ComfyBackendDirect` proxied by Vite.
  - `same-origin`: production web build served from the SwarmUI backend origin.
  - `direct`: non-http/file contexts fall back to `http://localhost:7801`.
  - `custom-url`: `VITE_SWARMUI_URL` or a client override sets API, websocket, and asset base URLs.
- Runtime target detection:
  - `web` by default.
  - `electron` when `VITE_RUNTIME_TARGET=electron` or `window.electronAPI` exists.
- Feature flags live in `src/config/featureFlags.ts`. Current flags cover session sync, queue runner, history loader, virtualized browsers, dev render profiling, performance dashboard, bootstrap refresh/cooldown, TriggerRefresh cache, backend heartbeat, and deferred Generate data loading.

## App Shell And Routing

- Navigation store: `src/stores/navigationStore.ts`.
- Route parser/serializer: `src/routing/appRoute.ts`.
- Current pages:
  - `generate`
  - `history`
  - `queue`
  - `workflows`
  - `server`
  - `roleplay`
- Default route: `#/generate` with Generate mode `advanced`.
- Route persistence:
  - URL hash is the canonical route signal.
  - Last route is persisted under `swarmui-last-route-v1`.
  - Hash changes are synced globally by `navigationStore`.
- Header navigation:
  - `src/components/layout/AppHeader.tsx` renders segmented route navigation and global actions.
  - Header actions include command palette, model downloader, wrapper reload, logout, shutdown, appearance, and queue status.
- Route-level lazy chunks:
  - `GeneratePage`, `HistoryPage`, `QueuePage`, `WorkflowPage`, `ServerPage`, and `RoleplayPage` are lazy-loaded by `App.tsx`.
  - Global modal surfaces such as command palette, asset catalog, model downloader, and canvas workflow host are also lazy-loaded.

## Route State Schema

| Page | Route State | Default/Notes |
| --- | --- | --- |
| Generate | `mode`, `recipe`, `compare`, `restore` | `mode` defaults to `advanced`; modes are `quick`, `guided`, `advanced`, `video`. |
| History | `path`, `query`, `sortBy`, `sortReverse`, `starredOnly`, `mediaType`, `currentFolderOnly`, `image`, `viewId` | Supports folder/gallery views, search, sort, filtering, selected image, saved view. |
| Queue | `jobId`, `batchId`, `view` | `view` defaults to `all`; other values are `batches` and `scheduled`. |
| Workflows | `mode` | `wizard` default; `comfy` for embedded ComfyUI. |
| Server | `tab` | `backends` default; other tabs are `logs`, `resources`, `account`, `admin-tools`, `trainer`. |
| Roleplay | `characterId` | Syncs selected roleplay character into route state. |

Refactor rule: changing these types changes public navigation behavior and stored links. Treat route changes as product/API changes, not internal cleanup.

## Pages And Sections

### Generate

- Entry: `src/pages/GeneratePage/index.tsx`.
- Purpose: primary image/video generation workspace.
- Main sections:
  - Workspace experience deck: mode switch, recipes, issue summary, restore/promote workflow actions.
  - Sidebar surface:
    - `VideoSidebar` for video mode.
    - `WorkspaceSidebar` for advanced/video rail workflows.
    - `WorkspaceModeDeck` for quick/guided modes.
  - Stage surface:
    - `GenerateStageHeader` for mode/status/gallery/focus/action controls.
    - `LiveGenerationCanvasStage` for active image review, favorites, diagnostics, workspace action context.
  - Gallery surface:
    - Pinned side rail on wide advanced/video layouts.
    - Drawer on smaller layouts or quick/guided modes.
  - Modal/drawer surfaces:
    - LoRA browser, embedding browser, model browser, history drawer, schedule modal, diagnostics, assistant panel, image comparison, shortcuts, save preset.
- Current extracted support pieces:
  - `GeneratePerformanceMilestones`: records Generate shell/data/generation timing into `performanceSessionStore`.
  - `CanvasGenerationResultWatcher`: transfers generated output back to canvas workflow when a canvas generation request is awaiting a result.
  - `useGeneratePageController`: owns Generate render profiling, route entry time, supplemental-data readiness, and data scope policy.
  - `useGenerateDataScopes`: controls when VAEs, ControlNets, upscalers, embeddings, and wildcards are allowed to load.
  - `useGenerateTransientUiState`: groups page-local UI flags that should not persist globally.
  - `useSupplementalDataReady`: defers non-primary data until after the Generate shell can paint.
- Key data/state sources:
  - `generationStore`: persisted generation params, selected backend/model state, mode toggles, active LoRAs/wildcards, session images.
  - `generationProductStore`: current Generate workspace mode, recipes, preflight issues, session snapshots.
  - `layoutStore`: Generate sidebar/gallery dimensions, open modules, focus mode.
  - `websocketStore`: live generation phase, previews, images, errors, progress.
  - `canvasWorkflowStore`: canvas session, pending generation requests, fallback params, result handoff.
  - React Query via `useAllModelData`: model/backends plus deferred model-adjacent datasets.
- Refactor priority:
  - Continue separating orchestration hooks from render surfaces.
  - Pull modal shell into a presentational boundary.
  - Keep data loading scoped to visible or soon-visible controls.
  - Avoid persisted schema changes until component ownership is stable.

### History

- Entry: `src/pages/HistoryPage.tsx`.
- Purpose: browse, search, filter, select, compare, export, star, delete, and reuse generated media.
- Main sections:
  - Page scaffold and history controls.
  - Folder breadcrumbs and folder/gallery switching.
  - Infinite React Query loader using `listImagesV2`, with legacy fallback through `listImages`.
  - Virtualized grid through `VirtualGrid`.
  - Image detail, comparison, upscaler, lineage and selection actions.
  - Saved views/collections via `historyWorkspaceStore`.
- Key data/state sources:
  - React Query infinite query keyed by history query params.
  - `historyWorkspaceStore` for saved views and collections.
  - `generationStore` and `canvasWorkflowStore` for send-to-generate and canvas handoffs.
  - `sessionStore` permissions for star/delete/open/import/generate actions.
- Refactor priority:
  - Extract query construction and route sync.
  - Isolate image action command objects from render cards.
  - Keep V2/legacy fallback behavior stable.

### Queue

- Entry: `src/pages/QueuePage.tsx`.
- Purpose: schedule, inspect, reorder, filter, prioritize, run, pause, and compare queued generation jobs.
- Main sections:
  - Queue stats and status timeline.
  - Job table/list with selection, details modal, priority/move actions.
  - Batch and scheduled views.
  - Comparison modal for generated results.
- Key data/state sources:
  - `queueStore` for jobs, runner state, selected jobs, priorities, batch/schedule metadata.
  - `swarmClient.generateImage` for legacy direct queue execution.
  - `featureFlags.queueRunnerV2` controls runner behavior.
- Refactor priority:
  - Separate queue runner side effects from render logic.
  - Clarify queue V1/V2 ownership.
  - Keep job schema stable for stored or in-session jobs.

### Workflows

- Entry: `src/pages/WorkflowPage.tsx`.
- Purpose: choose and host guided wizard workflows or embedded ComfyUI workflows.
- Main sections:
  - Workspace selector cards.
  - Guided Wizard via `WizardWorkflow`.
  - Embedded ComfyUI via `ComfyUIView`.
  - Handoff from Generate/History through `workflowWorkspaceStore`.
- Key data/state sources:
  - `workflowWorkspaceStore`: last mode, last wizard template, Generate/History handoff context.
  - `navigationStore`: `workflows.mode`.
  - Comfy workflow API methods in `swarmClient`.
- Refactor priority:
  - Separate selection shell from active workspace host.
  - Stabilize handoff context type before adding more workflow sources.

### Server

- Entry: `src/pages/ServerPage/index.tsx`.
- Purpose: backend/server status and administration.
- Tabs:
  - `BackendsTab`: backend list, add/edit/toggle/restart/free memory.
  - `LogsTab`: log types and recent messages.
  - `ResourcesTab`: resource and server status.
  - `AccountTab`: user settings, password/API key/logout-adjacent account controls.
  - `KohyaTrainerTab`: LoRA project/dataset/training workflows.
  - `AdminToolsTab`: admin/users/roles/permissions/debug/update/extension tooling.
- Key data/state sources:
  - `swarmClient` server/admin/backend/kohya endpoints.
  - `navigationStore`: `server.tab`.
  - React Query where individual tabs opt in.
- Refactor priority:
  - Keep each tab isolated.
  - Move endpoint orchestration into tab-specific hooks.
  - Preserve admin/backend API names exactly.

### Roleplay

- Entry: `src/pages/RoleplayPage/index.tsx`.
- Purpose: character chat and scene generation with assistant/LLM integration.
- Main sections:
  - Character picker.
  - Character sidebar.
  - Chat panel.
  - Controls panel.
  - Resizable sidebar.
- Key data/state sources:
  - `roleplayStore`: active character, endpoint, connection status, detected server mode, model list, selected model.
  - `roleplayChatService`: assistant/LLM connection probing and chat request behavior.
  - `navigationStore`: `roleplay.characterId`.
- Refactor priority:
  - Separate external assistant connection state from UI panel state.
  - Avoid coupling scene generation callbacks through mutable refs long term.

## Shared Components And UI System

- Layout:
  - `PageScaffold`, `AppHeader`.
- Core UI primitives:
  - `SwarmButton`, `SwarmActionIcon`, `SwarmBadge`, `SwarmSegmentedControl`, `SwarmSlider`, `SwarmSwitch`, `ElevatedCard`, `SectionHero`, `StatusTimeline`, `ResizeHandle`.
- Headless primitives:
  - `HeadlessAutocomplete`, `HeadlessCombobox`, `HeadlessDialog`.
- Media surfaces:
  - `ImageCard`, `LazyImage`, `ImageLightbox`, `ImageDetailModal`, `ImageComparison`, `ImageUpscaler`, `GalleryPanel`.
- Asset/model surfaces:
  - `ModelBrowser`, `LoRABrowser`, `EmbeddingBrowser`, `AssetCatalogModal`, `ModelDetailModal`, `ModelDownloader`.
- Prompt surfaces:
  - `PromptInput`, `PromptEditor`, `PromptWizard`, prompt wizard subcomponents, prompt builder stores/features.
- Refactor rule: shared UI components should stay presentation-focused. Page-specific orchestration should live in page hooks or feature modules, not shared components.

## Backend API Facade

- Facade entry: `src/api/client.ts`.
- Session model:
  - Most POST endpoints include `session_id`.
  - Sessionless endpoints: `GetNewSession`, `Login`, `RegisterBasic`, `RegisterOAuth`.
  - Invalid/missing sessions trigger session refresh and request retry.
- Generic request model:
  - Backend API calls are POST to `/API/{endpoint}`.
  - Some direct GET requests are used for non-API JSON paths.
  - Read-heavy endpoints are deduplicated through `requestDeduplicator`.
  - API timing is recorded through `perfDiagnostics` and `performanceProfiler`.
- Deduplicated read endpoints:
  - `ListModels`, `ListT2IParams`, `GetCurrentStatus`, `ListWildcardFiles`, `ListLoRAs`, `ListVAEs`, `ListControlNets`, `ListImages`, `ListImagesV2`, `TriggerRefresh`, `ListBackends`.
- Websocket endpoints:
  - `GenerateText2ImageWS`
  - `SelectModelWS`
  - `InstallConfirmWS`
  - `DoTensorRTCreateWS`
  - `DoLoraExtractionWS`
  - `DoModelDownloadWS`
- Endpoint groups currently wrapped by `SwarmUIClient`:
  - Session/auth: `GetNewSession`, `Login`, `RegisterBasic`, `RegisterOAuth`, `Logout`.
  - Generation: `ListT2IParams`, `GenerateText2ImageWS`, `InterruptAll`, `GetCurrentStatus`.
  - History/media: `ListImages`, `ListImagesV2`, `ExportHistoryZip`, `ToggleImageStarred`, `DeleteImage`, `OpenImageFolder`, `AddImageToHistory`.
  - Models/assets: `ListModels`, `TriggerRefresh`, `SelectModel`, `SelectModelWS`, `DescribeModel`, `DeleteModel`, `RenameModel`, `EditModelMetadata`, `ListLoadedModels`, `SetStarredModels`, `SetModelPreviewFromMetadataUrl`, `DeleteWildcard`, `EditWildcard`, `TestPromptFill`, metadata forwarding, model headers/hash, model folders, model downloader.
  - Presets/params: `GetUserPresets`, `AddNewPreset`, `DeletePreset`, `DuplicatePreset`, `SetPresetLinks`, `SetParamEdits`, `CountTokens`, `TokenizeInDetail`.
  - Backend/server: `ListBackends`, `ListBackendTypes`, `AddNewBackend`, `DeleteBackend`, `ToggleBackend`, `EditBackend`, `RestartBackends`, `FreeBackendMemory`, `ListLogTypes`, `ListRecentLogMessages`, `GetServerResourceInfo`, `ListServerSettings`, `ChangeServerSettings`, `CheckForUpdates`, `UpdateAndRestart`, `ShutdownServer`.
  - Account/admin: `GetMyUserData`, `GetUserSettings`, `ChangeUserSettings`, `ChangePassword`, `SetAPIKey`, `GetAPIKeyStatus`, user/role/permission admin endpoints, connected users, global status, debug endpoints.
  - Comfy workflows: `ComfyListWorkflows`, `ComfyReadWorkflow`, `ComfySaveWorkflow`, `ComfyDeleteWorkflow`, `ComfyGetGeneratedWorkflow`, `ComfyEnsureRefreshable`, `ComfyGetNodeTypesForBackend`, `ComfyInstallFeatures`.
  - Kohya/LoRA training: status/template/datasets/trained LoRAs, LoRA projects, batch manifests, dataset approval/rejection, training prepare/start/interrupt/status/history.
  - Cache: `GetCacheStatus`, `ClearCache`, `GetPromptCacheStats`, `AddPromptToCache`, `CheckPromptCache`, `PruneCaches`.
- Refactor rule: do not rename endpoint strings during frontend cleanup. Prefer adding typed wrapper methods and query hooks around the existing facade before moving endpoints.

## Backend Bootstrap And Realtime

- Backend adapter: `src/api/backendAdapter.ts`.
- Bootstrap snapshot includes:
  - model catalog for Stable Diffusion and VAE.
  - backend status.
  - user/session capability info.
  - current status.
  - runtime endpoint mode.
- Bootstrap behavior:
  - Deduplicates in-flight refreshes.
  - Reuses recent snapshots inside cooldown.
  - Records refresh/skip/reuse telemetry.
  - Refreshes on websocket open/reconnect/session recovery.
- Websocket manager: `src/api/ws/WebSocketManager.ts`.
- Websocket manager responsibilities:
  - Connection state tracking.
  - Reconnect and pending reconnect behavior.
  - Visibility/network-aware heartbeat behavior.
  - Session recovery.
  - Generation payload preflight, progress/image/error event normalization.
  - Event emitter dispatch to stores/adapter.
- Refactor priority:
  - Keep websocket event semantics stable.
  - Avoid adding page-specific behavior to the generic manager.
  - Consolidate generation-specific event interpretation in `websocketStore` or generation hooks.

## Data Loading And Query Ownership

- React Query client: `src/api/queryClient.ts`.
- Defaults:
  - `staleTime`: 5 minutes.
  - `gcTime`: 30 minutes.
  - retry: 2 for queries, 1 for mutations.
  - window focus refetch disabled in Electron.
  - previous data retained as placeholder.
- Query key families:
  - `backend`: bootstrap, t2i params.
  - `models`, `loras`, `vaes`, `backends`, `images`, `presets`, `controlnets`, `upscalers`, `embeddings`, `modelDownloader`, `comfy`, `wildcards`, `server`.
- Model data hooks:
  - `useModels` and `useVAEs` read from backend bootstrap.
  - `useBackends` can auto-refresh on an interval.
  - `useAllModelData` combines model-adjacent datasets and exposes legacy-compatible names.
- Refactor rule:
  - Server state belongs in React Query unless it is realtime websocket state.
  - Use stores for UI/session state and websocket-derived state, not as a replacement for backend cache.
  - Defer non-visible queries for heavy page surfaces.

## State Stores

- Two store folders exist: `src/store` and `src/stores`. Do not merge them casually; imported paths are compatibility within the codebase.
- Core stores:
  - `themeStore`: large persisted theme catalog/customization store.
  - `animationStore`, `adaptiveAccentStore`: motion and adaptive accent behavior.
  - `generationStore`: generation params and toggles.
  - `navigationStore`: route state and persistence.
  - `session`: session initialized/auth/permission state.
  - `websocketStore`: live generation, model/download websocket state.
  - `queue`: queued jobs and runner state.
  - `layoutStore`: Generate layout state.
  - `generationProductStore`: Generate modes, recipes, snapshots, issues.
  - `generationDiagnosticsStore`, `performanceStore`, `performanceSessionStore`: diagnostics and telemetry.
  - `canvasEditorStore`, `canvasWorkflowStore`: canvas editor/session/workflow handoff.
  - `historyStore`, `historyWorkspaceStore`: history UI/workspace state.
  - `workflowWorkspaceStore`, `workflows`: workflow state and handoff.
  - `roleplayStore`: roleplay character/chat configuration state.
  - `presetLibraryStore`, `presets`, `promptBuilderStore`, `promptCacheStore`, `promptEnhanceStore`, `promptWizardStore`, `autoCompleteStore`, `assistantStore`, `favoritesStore`, `initImageCacheStore`, `entityStore`.
- Store refactor rules:
  - Preserve persisted storage names and partialized schema unless doing an explicit migration.
  - Use selector hooks or `useShallow` instead of subscribing to whole stores.
  - Keep high-frequency websocket state isolated from broad page renders.
  - Do not move durable state into local component state unless reload/route persistence is not required.

## Feature Modules

- `assets`: asset catalog metadata helpers.
- `canvasWorkflow`: Generate/canvas compatibility patches and prompt building.
- `generation`: product type validation and preflight issue modeling.
- `history`: history preferences, normalization, merging, and item metadata helpers.
- `presetLibrary`: preset staging/types.
- `promptBuilder`: region/segment prompt compilation and managed block handling.
- `promptWizard`: prompt wizard assembly, migration, tag relationships, profiles, normalization, insights.
- `roleplay`: prompt compilation, memory, character prompting, roleplay bundles.
- Refactor rule: when business logic is shared by more than one page, move it into `features`. When logic is only page orchestration, keep it in page hooks.

## Workers And Expensive Work

- `imageProcessing.worker.ts`: image processing tasks.
- `listFilter.worker.ts`: list filtering.
- `useWorker`, `useImageProcessing`, `useDeferredSearch`, `useVirtualList`, and related hooks are the current worker/performance utilities.
- Refactor priority:
  - Move repeated large-list filtering and image processing out of render paths.
  - Keep worker interfaces typed and page-agnostic.

## Performance And Diagnostics

- Build-time:
  - `rollup-plugin-visualizer` emits `stats.html`.
  - Manual chunks split Mantine, icons, React, React Query, Zustand, framer-motion.
- Runtime:
  - `useRenderProfiler` tracks render timing in development when enabled.
  - `performanceStore` records component render metrics.
  - `performanceSessionStore` records route, query, event-loop, bootstrap, and custom timing events.
  - `perfDiagnostics` tracks long tasks, API calls, websocket reconnect/session recovery, and similar diagnostics.
  - `PerformanceDashboard` is development-only behind `featureFlags.devPerformanceDashboard`.
- Generate-specific telemetry:
  - shell ready.
  - prompt ready.
  - primary data ready.
  - supplemental data ready.
  - deferred dataset timings.
  - socket connected.
  - first progress.
  - first preview.
  - first image.
  - complete.
- Refactor rule:
  - Keep instrumentation while refactoring; do not remove timing events unless replacing them with equivalent or better measurements.

## Compatibility Boundaries

- Route hash format and state schema.
- Persisted localStorage keys:
  - `swarmui-last-route-v1`.
  - generation/theme/layout/history/prompt/queue store keys as defined in their stores.
- React Query key families in `queryClient.ts`.
- Backend endpoint strings.
- Electron preload contract on `window.electronAPI`.
- Asset path conventions: `/View`, `/Output`, `/ComfyBackendDirect`.
- Websocket event names and generation state shape.
- Permissions checked by UI pages.

## Hotspots And Refactor Backlog

### Highest Priority

- Continue GeneratePage split:
  - Modal shell.
  - Sidebar chooser.
  - Gallery shell.
  - Workflow/canvas handoff effects.
  - Generation command construction.
- Split `themeStore` into catalog, persistence, CSS sync, validation, and UI editing concerns.
- Split `api/client.ts` into typed endpoint groups while keeping `swarmClient` facade compatibility.
- Split `websocketStore` so high-frequency generation updates do not invalidate unrelated websocket consumers.

### Medium Priority

- History route/query/action extraction.
- Queue runner extraction and V1/V2 cleanup.
- ModelDownloader workflow decomposition.
- Roleplay connection and scene generation orchestration.
- Server tab endpoint hooks.

### Ongoing Rules

- Prefer medium-sized slices that are independently reviewable and manually testable.
- Prefer behavior-preserving moves before behavior changes.
- Add docs to this file as architecture changes are made.
- Agents may run lint/static checks, but not builds or automated tests in this repo.
