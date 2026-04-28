# React Frontend Thread Handoff

Date: 2026-04-15

Scope: `swarmui-react` only.

Purpose: canonical investigation handoff for opening new focused Codex threads.

Supersedes:
- `swarmui-react/docs/2026-04-10-react-investigation.md`
- `swarmui-react/docs/2026-04-10-react-frontend-investigation.md`

Method:
- local source review of mounted routes, roleplay flows, server tab flows, stores, and API client support
- prior explorer-agent passes for mounted placeholder surfaces, docs parity, and implementation scoping

## Conclusion

The React frontend is not broadly incomplete. The real mounted backlog is concentrated in four product areas:

1. Roleplay character picker
2. Roleplay persona and lorebook CRUD
3. Server trainer tab MVP
4. Docs parity and scope cleanup

The biggest source of confusion is documentation drift. Older docs still describe missing basics that are already mounted, while newer docs overstate completeness.

The mounted top-level routes in the current app shell are:

- `generate`
- `history`
- `queue`
- `workflows`
- `server`
- `roleplay`

Primary route sources:

- `src/App.tsx`
- `src/routing/appRoute.ts`

## Recommended Thread Split

Open one Codex thread per item:

1. `react-roleplay-picker`
2. `react-roleplay-persona-lorebook-crud`
3. `react-server-trainer-tab`
4. `react-docs-parity-cleanup`

Recommended execution order:

1. Roleplay picker
2. Persona and lorebook CRUD
3. Trainer tab MVP
4. Docs parity cleanup

Reasoning:
- The first three are user-visible mounted gaps.
- The docs pass should happen after product intent for roleplay and trainer is locked.

## Workstream 1: Roleplay Character Picker

### Goal

Replace the placeholder roleplay entry screen with a real character selection flow that uses the existing roleplay store and editor rather than introducing parallel state.

### Current Behavior

- `RoleplayPage` initializes `showCharacterPicker` to `true`, so the route starts in picker mode.
- `CharacterSelectionPanel` is placeholder-only and renders a single `Use Default Character` button.
- The app already has substantial real roleplay plumbing:
  - `CharacterSidebar` for character and session switching
  - `CharacterEditor` for full create/edit
  - character/session CRUD in `roleplayStore.ts`

### Recommended Direction

Keep the entry picker, but turn it into a real character library view instead of removing it.

Recommended picker behavior:

- show real characters from the store
- support search/filter by name and tags
- allow `Open Chat` for a selected character
- allow `New Character`
- allow `Edit`
- optionally allow `New Chat`
- show a strong empty state when no usable characters exist

Recommended route behavior:

- if there is already an active character and active session, default into chat on revisit
- keep the header-level `Choose Character` action as the way to reopen the picker intentionally

### Existing Store Support

Already present in `src/stores/roleplayStore.ts`:

- `characters`
- `activeCharacterId`
- `activeSessionId`
- `setActiveCharacter`
- `getCharacterSessions`
- `createSession`
- `removeCharacter`
- `addCharacter`
- `updateCharacter`

Important behavior already exists:

- `setActiveCharacter(id)` moves to the most recent session for that character
- `addCharacter()` creates an initial session and activates it
- `CharacterEditor` already performs real create/edit flows

### Acceptance Criteria

- `#/roleplay` no longer shows placeholder copy or a one-button stub
- the picker shows real characters from the store
- selecting a character enters chat with the correct active character and session
- creating a character from the picker routes through the existing editor flow
- empty-state behavior is usable
- sidebar behavior continues to work after picker implementation

### Risks / Open Questions

- whether the app should still ever default into the picker when an active character exists
- whether the picker should create a fresh session or open the most recent one by default
- whether picker and sidebar should share extracted character-card UI

### Likely File Touch List

- `src/pages/RoleplayPage/index.tsx`
  - change initial picker behavior and selection/create transitions
- `src/pages/RoleplayPage/CharacterSelectionPanel.tsx`
  - replace placeholder with real picker UI
- `src/pages/RoleplayPage/CharacterSidebar.tsx`
  - optional extraction of shared card/action rendering
- `src/pages/RoleplayPage/CharacterEditor.tsx`
  - likely minor callback/wiring changes only
- `src/stores/roleplayStore.ts`
  - optional helper selectors/actions only

## Workstream 2: Roleplay Persona and Lorebook CRUD

### Goal

Replace `PersonaManagerModal` and `LorebookManagerModal` with actual CRUD interfaces backed by the existing roleplay store.

### Current Behavior

The controls panel already exposes:

- a `Persona` select bound to `activeSession.activePersonaId`
- a `Manage` button that opens `PersonaManagerModal`
- a `Session Lorebooks` multiselect bound to `activeSession.boundLorebookIds`
- a `Lorebooks` button that opens `LorebookManagerModal`

Both modals are still placeholder-only.

### Existing Store Support

Already present in `src/stores/roleplayStore.ts`:

- `addPersona`
- `updatePersona`
- `removePersona`
- `setSessionActivePersona`
- `addLorebook`
- `updateLorebook`
- `removeLorebook`
- `setSessionBoundLorebooks`

Important behavior already encoded:

- default persona cannot be removed
- removing a persona resets sessions using it back to the default persona
- removing a lorebook removes bindings from characters, personas, and sessions

This means the missing work is mostly UI/editor flow, not state-model design.

### Recommended Direction

Implement both managers as pragmatic CRUD modals in one focused thread.

Persona manager MVP:

- persona list
- create/edit/delete actions
- editable form for:
  - name
  - description
  - notes
  - avatar URL
  - tags
  - bound lorebooks

Lorebook manager MVP:

- lorebook list
- create/edit/delete lorebooks
- entry list/editor per selected lorebook
- editable fields for:
  - name/title
  - description/content
  - keywords/triggers
  - mode or enabled state where supported

Keep the first pass focused:

- no import/export
- no media upload pipeline
- no extra route structure

### Acceptance Criteria

- both placeholder modals are replaced with usable CRUD UIs
- users can create, edit, and delete non-default personas
- users can create, edit, and delete lorebooks
- users can create, edit, enable/disable, and delete lorebook entries
- controls-panel persona and lorebook selectors reflect changes immediately
- deleting a lorebook correctly clears bindings through existing store behavior

### Risks / Open Questions

- whether persona editing should be optimistic or form-buffered until save
- whether persona avatar should remain URL-only for MVP
- whether lorebook entry editing should be inline, drawer-based, or modal-based
- whether character-bound and persona-bound lorebook editing belongs in this manager or remains summarized elsewhere

### Likely File Touch List

- `src/pages/RoleplayPage/PersonaManagerModal.tsx`
  - full persona CRUD UI
- `src/pages/RoleplayPage/LorebookManagerModal.tsx`
  - full lorebook and entry CRUD UI
- `src/pages/RoleplayPage/ControlsPanel.tsx`
  - minor integration and refresh behavior
- `src/stores/roleplayStore.ts`
  - likely helper additions only
- `src/types/roleplay.ts`
  - only if editor needs clearer entry/persona field typing
- optional new files:
  - `src/pages/RoleplayPage/PersonaForm.tsx`
  - `src/pages/RoleplayPage/LorebookEntryEditor.tsx`
  - `src/pages/RoleplayPage/LorebookList.tsx`

## Workstream 3: Server Trainer Tab MVP

### Goal

Replace the placeholder `Trainer` tab with a usable MVP trainer dashboard built around the client support that already exists.

### Current Behavior

- `ServerPage` mounts a visible `Trainer` tab
- `KohyaTrainerTab.tsx` is still placeholder-only

### Important Correction

This is not a blank-slate frontend integration.

The current client already has substantial training-related API support in `src/api/client.ts` and related types in `src/api/types.ts`, including:

- Kohya status
- training template
- datasets
- trained LoRAs
- LoRA projects
- batch plan generation/execution
- dataset review/approval
- trainable project listing
- training prepare/start/interrupt/status/history

The thread should start from: build an MVP UI around existing client capability, not from: first invent all training support.

### Recommended Direction

Implement the tab. Do not hide it by default.

Recommended Phase 1 scope:

- setup/status panel
- trainable project list
- dataset and project inventory
- launch preview
- start and interrupt controls
- active-job status
- recent job history

Defer from MVP if needed:

- deep workflow authoring
- advanced project creation wizards
- full dataset review UI if it threatens scope
- trained LoRA detail polish

### Acceptance Criteria

- the `Trainer` tab is no longer placeholder-only
- users can view Kohya install/running state
- users can view trainable projects and available datasets
- users can prepare a training job and inspect a launch preview
- users can start and interrupt a job
- users can see active training status and recent history
- missing-install and failure states are explicit

### Risks / Open Questions

- whether the product intent is generic `Trainer` or specifically `LoRA Trainer`
- whether dataset moderation belongs in the first trainer UI or later
- whether the MVP should be a dense dashboard or a multi-section workflow
- whether existing API shapes need small frontend wrapper cleanup for clearer usage

### Likely File Touch List

- `src/pages/ServerPage/KohyaTrainerTab.tsx`
  - full trainer MVP implementation
- `src/pages/ServerPage/index.tsx`
  - possible tab label or visibility adjustments
- `src/api/client.ts`
  - likely small helper wrappers only
- `src/api/types.ts`
  - type cleanup if richer UI shapes are needed
- optional new files:
  - `src/pages/ServerPage/useKohyaTrainer.ts`
  - `src/pages/ServerPage/TrainerStatusCard.tsx`
  - `src/pages/ServerPage/TrainableProjectsPanel.tsx`
  - `src/pages/ServerPage/TrainingHistoryPanel.tsx`
  - `src/pages/ServerPage/TrainingLaunchPreview.tsx`

## Workstream 4: Docs Parity and Scope Cleanup

### Goal

Make the React docs describe the current mounted app truthfully and stop contradicting one another.

### Current Problem

Docs currently drift in both directions:

- newer docs overstate completeness
- older docs still claim missing basics that are already mounted

Examples verified locally:

- `README.md` and `FEATURES.md` omit the mounted `roleplay` route
- `QUICKSTART.md` still says model selection and preset management are missing
- `ENHANCEMENTS-COMPLETE.md` and `DESIGN-SYSTEM.md` still describe remaining PromptEditor/theme work
- `PromptEditor.tsx` exists, but it does not appear to be mounted anywhere in current source

### Recommended Source of Truth

Use this hierarchy:

1. current mounted app shell and route map
2. `FEATURES.md` as product inventory
3. `README.md` as concise overview

Treat other docs as either:

- current operational docs that must be reconciled
- or historical docs that should be explicitly labeled as such

### PromptEditor Decision

Do not open a standalone PromptEditor implementation thread yet.

Recommended docs decision:

- treat PromptEditor as out of scope unless there is a separate product decision to ship it
- remove or downgrade any language that treats it as a near-term required task

### Acceptance Criteria

- `README.md` and `FEATURES.md` reflect the mounted route map, including `roleplay`
- no doc claims missing basics that are already present in code
- `INTEGRATION_SUMMARY.md`, `QUICKSTART.md`, `ENHANCEMENTS-COMPLETE.md`, and `DESIGN-SYSTEM.md` no longer contradict the current mounted surface
- the docs clearly distinguish live backlog from historical notes
- PromptEditor is documented intentionally, not ambiguously

### Risks / Open Questions

- whether some older docs should be archived rather than rewritten in place
- whether both `QUICK_START.md` and `QUICKSTART.md` should survive
- whether `trainer` and `roleplay` should be documented as live-but-incomplete or experimental until completed

### Likely File Touch List

- `README.md`
  - update product surface overview
- `FEATURES.md`
  - add `roleplay` and correct route inventory
- `QUICKSTART.md`
  - remove outdated limitation claims
- `QUICK_START.md`
  - reconcile audience and overlap with `QUICKSTART.md`
- `INTEGRATION_SUMMARY.md`
  - remove overstatements like `no placeholders` if still false
- `ENHANCEMENTS-COMPLETE.md`
  - archive, annotate as historical, or reconcile
- `DESIGN-SYSTEM.md`
  - remove stale remaining-work guidance if no longer current
- optional:
  - `docs/README.md`
    - short note on which docs are canonical vs historical

## Ready-to-Use Thread Prompts

### Thread 1: Roleplay Picker

Task: implement the React roleplay character picker described in `swarmui-react/docs/2026-04-15-react-thread-handoff.md`.

Focus:

- replace `src/pages/RoleplayPage/CharacterSelectionPanel.tsx`
- update `src/pages/RoleplayPage/index.tsx`
- keep scope to roleplay entry flow only
- do not work on persona/lorebook CRUD or trainer functionality in this thread

Done means:

- `roleplay` no longer starts on a placeholder picker
- users can select or create characters from a real picker flow
- the picker transitions cleanly into normal chat/sidebar behavior

### Thread 2: Roleplay Persona and Lorebook CRUD

Task: implement the React persona and lorebook CRUD work described in `swarmui-react/docs/2026-04-15-react-thread-handoff.md`.

Focus:

- `src/pages/RoleplayPage/PersonaManagerModal.tsx`
- `src/pages/RoleplayPage/LorebookManagerModal.tsx`
- any necessary `src/pages/RoleplayPage/ControlsPanel.tsx` integration
- minimal `roleplayStore.ts` changes only

Done means:

- both placeholder modals are replaced
- persona CRUD works
- lorebook and lorebook-entry CRUD works
- controls-panel selectors reflect updates immediately

### Thread 3: Server Trainer Tab MVP

Task: implement the React server trainer MVP described in `swarmui-react/docs/2026-04-15-react-thread-handoff.md`.

Focus:

- `src/pages/ServerPage/KohyaTrainerTab.tsx`
- supporting `src/api/client.ts` and `src/api/types.ts` adjustments only as needed
- prefer an MVP built around existing client capability before inventing new abstractions

Done means:

- the trainer tab is no longer placeholder-only
- users can inspect status, prepare/start/interrupt jobs, and view recent history

### Thread 4: Docs Parity Cleanup

Task: perform the React docs parity cleanup described in `swarmui-react/docs/2026-04-15-react-thread-handoff.md`.

Focus:

- reconcile docs against the current mounted app
- resolve `QUICK_START.md` vs `QUICKSTART.md`
- make an intentional PromptEditor documentation decision
- do not implement product UI in this thread

Done means:

- docs no longer contradict the mounted route map or basic existing feature surface
- canonical vs historical docs are clearly distinguishable
