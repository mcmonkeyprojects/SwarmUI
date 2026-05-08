# React Frontend Investigation

Date: 2026-04-10

Purpose: documented investigation for splitting the remaining React frontend work into focused Codex threads.

Method: subagent-assisted read-only audit plus local source review. No files were executed or modified as part of the investigation beyond creating this handoff document.

## Executive Summary

The React frontend does not look broadly half-finished. The actual implementation backlog is concentrated in four mounted surfaces:

1. Roleplay character picker
2. Roleplay persona manager
3. Roleplay lorebook manager
4. Server trainer tab

Everything else that looked incomplete was mostly documentation drift rather than active UI gaps.

The app shell currently mounts six real top-level pages:

- `generate`
- `history`
- `queue`
- `workflows`
- `server`
- `roleplay`

Relevant source:

- `src/App.tsx`
- `src/routing/appRoute.ts`

## Recommended Thread Split

Create one Codex thread per item below:

1. `react-roleplay-picker`
2. `react-roleplay-persona-lorebook-crud`
3. `react-server-trainer-tab`
4. `react-docs-parity-cleanup`

Suggested execution order:

1. Roleplay picker
2. Persona and lorebook CRUD
3. Trainer tab
4. Docs parity cleanup

## Workstream 1: Roleplay Character Picker

### Goal

Replace the placeholder roleplay entry screen with a real character selection flow that lets the user:

- browse existing characters
- select a character and open the active chat/session
- create a new character
- edit an existing character

### Current Behavior

The `roleplay` route defaults to `showCharacterPicker = true`, then renders `CharacterSelectionPanel`, which is currently a placeholder with a single `Use Default Character` button.

At the same time, the app already has a substantial roleplay data model and a real `CharacterSidebar` with:

- character list
- active character profile
- session list
- create/edit/delete character actions

This means the missing work is mostly UI composition and entry-flow design, not missing state architecture.

Relevant source:

- `src/pages/RoleplayPage/index.tsx`
- `src/pages/RoleplayPage/CharacterSelectionPanel.tsx`
- `src/pages/RoleplayPage/CharacterSidebar.tsx`
- `src/stores/roleplayStore.ts`

Relevant prior docs:

- `docs/superpowers/plans/2026-03-18-roleplay-ui-overhaul.md`
- `docs/superpowers/specs/2026-03-17-roleplay-ui-overhaul-design.md`

### Desired Behavior

The first visible roleplay flow should be a real picker, not a stub. The user should be able to:

- see available characters immediately
- select one character and enter chat
- create a new character from the picker
- optionally edit or duplicate before entering chat
- avoid a dead-end placeholder state

### Recommended UX Direction

Recommended approach: keep the dedicated picker, but make it a lightweight library view rather than removing it entirely.

Why:

- the route already has a clear "choose character" concept in the header
- `CharacterSidebar` is optimized for in-session management, not first-run selection
- a picker can be optimized for browse/select/create without overloading the chat layout

Recommended picker content:

- searchable list or grid of characters
- avatar, name, personality/description summary
- primary action: `Open Chat`
- secondary actions: `Edit`, `Duplicate`, `New Character`
- empty state that launches `CharacterEditor`

### Store and Data Integration

Existing store support appears sufficient:

- `characters`
- `activeCharacterId`
- `setActiveCharacter`
- `getCharacterSessions`
- `createSession`
- `removeCharacter`

Potentially useful local additions:

- selector/helper for sorted characters
- helper to open most recent session for a selected character
- helper to create-and-open a first session when none exists

These helpers can live in `roleplayStore.ts` if needed, but no schema change appears required.

### Acceptance Criteria

- Opening `#/roleplay` no longer shows placeholder copy or a single stub button.
- The picker shows real characters from the roleplay store.
- Selecting a character enters chat and activates the correct character/session.
- Creating a character from the picker opens the existing character editor flow.
- Empty-state behavior is usable when there are no characters beyond defaults.
- The header toggle still works coherently with the new picker/chat behavior.

### Risks and Open Questions

- Decide whether the dedicated picker should stay or whether `roleplay` should land directly in chat/sidebar.
- Decide whether the default persona/default character behavior should still be special-cased.
- Decide whether duplication belongs in the picker or remains sidebar-only.

### File Touch List

- `src/pages/RoleplayPage/CharacterSelectionPanel.tsx`
  - Replace placeholder UI with real character library/select actions.
- `src/pages/RoleplayPage/index.tsx`
  - Rework the `showCharacterPicker` default and the transition between picker and chat.
- `src/pages/RoleplayPage/CharacterSidebar.tsx`
  - Optional reuse extraction if picker and sidebar should share character-card rendering.
- `src/pages/RoleplayPage/CharacterEditor.tsx`
  - Likely no structural change, but picker should hook into its create/edit flows.
- `src/stores/roleplayStore.ts`
  - Optional helper selectors/actions for open-session behavior and sorting.

## Workstream 2: Roleplay Persona and Lorebook CRUD

### Goal

Replace the placeholder `PersonaManagerModal` and `LorebookManagerModal` with actual CRUD interfaces wired to the roleplay store.

### Current Behavior

The controls panel already exposes:

- a `Persona` select bound to `activeSession.activePersonaId`
- a `Manage` button that opens `PersonaManagerModal`
- a `Session Lorebooks` multiselect bound to `activeSession.boundLorebookIds`
- a `Lorebooks` button that opens `LorebookManagerModal`

Both modals are still placeholder text only.

Relevant source:

- `src/pages/RoleplayPage/ControlsPanel.tsx`
- `src/pages/RoleplayPage/PersonaManagerModal.tsx`
- `src/pages/RoleplayPage/LorebookManagerModal.tsx`
- `src/stores/roleplayStore.ts`
- `src/types/roleplay.ts`

### Existing Store Support

The store already supports the core data operations:

- `addPersona`
- `updatePersona`
- `removePersona`
- `setSessionActivePersona`
- `addLorebook`
- `updateLorebook`
- `removeLorebook`
- `setSessionBoundLorebooks`

The underlying data model also already exists:

- `RoleplayPersona`
- `RoleplayLorebook`
- `RoleplayLorebookEntry`

Important behavior already encoded in the store:

- default persona cannot be removed
- removing a persona resets sessions that use it back to the default persona
- removing a lorebook unbinds it from characters, personas, and sessions

This strongly suggests the missing work is UI/editor flow rather than state design.

### Desired Behavior

Persona manager should allow:

- list personas
- create persona
- edit persona metadata
- delete persona, except protected default persona
- bind lorebooks to a persona

Lorebook manager should allow:

- list lorebooks
- create lorebook
- edit lorebook metadata
- create/edit/delete lorebook entries
- set entry mode and keywords
- enable/disable entries
- delete lorebooks

### Recommended UX Direction

Build both managers as pragmatic CRUD modals rather than over-designing first pass.

Persona manager first pass:

- left column list of personas
- right pane edit form
- fields: name, description, notes, avatar, tags, bound lorebooks
- create, save, delete actions

Lorebook manager first pass:

- lorebook list
- selected lorebook metadata editor
- entries table/list
- entry editor drawer or inline card editor
- fields: title, content, keywords, mode, enabled

### Acceptance Criteria

- Persona manager can create, edit, and delete personas using persisted store state.
- Default persona cannot be deleted.
- Selecting a persona in the controls panel reflects persona-manager changes without refresh.
- Lorebook manager can create, edit, and delete lorebooks.
- Lorebook manager can create, edit, enable/disable, and delete lorebook entries.
- Deleting a lorebook removes bindings from character/persona/session state as the store already intends.
- Session lorebook multiselect reflects changes immediately.

### Risks and Open Questions

- Decide whether avatar upload for personas is in scope for v1 or whether text-only persona metadata is enough.
- Decide whether lorebook entry editing should be inline or modal-based.
- Decide whether persona-bound and character-bound lorebooks should be editable in the same manager or remain read-only summaries there.

### File Touch List

- `src/pages/RoleplayPage/PersonaManagerModal.tsx`
  - Replace placeholder content with persona list/editor CRUD UI.
- `src/pages/RoleplayPage/LorebookManagerModal.tsx`
  - Replace placeholder content with lorebook and entry CRUD UI.
- `src/pages/RoleplayPage/ControlsPanel.tsx`
  - Ensure modal-open flows, selection refresh, and derived summaries stay coherent.
- `src/stores/roleplayStore.ts`
  - Likely minor helper additions only; core CRUD already exists.
- `src/types/roleplay.ts`
  - Probably no change required unless extra editor metadata is introduced.
- Optional new files:
  - `src/pages/RoleplayPage/PersonaForm.tsx`
  - `src/pages/RoleplayPage/LorebookEntryEditor.tsx`
  - `src/pages/RoleplayPage/LorebookList.tsx`

## Workstream 3: Server Trainer Tab

### Goal

Turn the mounted placeholder `Trainer` tab into a usable training surface, or hide it if the team decides the product should not expose training yet.

### Current Behavior

The server page mounts a `Trainer` tab in normal navigation, but the tab body is only placeholder copy.

Relevant source:

- `src/pages/ServerPage/index.tsx`
- `src/pages/ServerPage/KohyaTrainerTab.tsx`

### API and Client Support Assessment

The frontend appears to have more support than the placeholder tab suggests.

Existing Kohya-specific read support in `src/api/client.ts`:

- `getKohyaStatus()`
- `getKohyaTrainingTemplate()`
- `listKohyaDatasets()`
- `listKohyaTrainedLoras()`

Existing LoRA training workflow support in `src/api/client.ts`:

- `listLoraProjects()`
- `getLoraProject()`
- `saveLoraProject()`
- `generateLoraBatchPlan()`
- `listLoraBatchManifests()`
- `createLoraDatasetRecordsFromBatchPlan()`
- `executeLoraBatchPlan()`
- `getLoraBatchExecutionStatus()`
- `listLoraDataset()`
- `approveLoraDatasetImage()`
- `rejectLoraDatasetImage()`
- `listTrainableLoraProjects()`
- `prepareLoraTraining()`
- `startLoraTraining()`
- `interruptLoraTraining()`
- `getLoraTrainingStatus()`
- `listLoraTrainingHistory()`

Associated types already exist in `src/api/types.ts`:

- `KohyaStatusResponse`
- `KohyaTrainingTemplate`
- `KohyaDatasetInfo`
- `KohyaTrainedLoraInfo`
- `LoraTrainableProject`
- `LoraTrainingJob`
- `LoraTrainingStatus`
- related batch-plan and dataset types

Conclusion: the frontend already has enough client-level support to build a first trainer UI. The bigger question is product scope and how much of the training pipeline should ship in the first pass.

### Implementation Options

Option A: Build the trainer tab now

- Recommended if training is intended to be a real React surface.
- Lowest-risk version is a status-and-control dashboard, not a full workflow builder.

Phase 1 scope:

- Kohya installation/running status
- trainable projects list
- active training status
- recent jobs/history
- prepare/start/interrupt controls
- dataset summary and trained LoRA summary
- launch-preview visibility before start

Phase 2 scope:

- richer project editing
- advanced training-template editing
- full batch-plan and dataset curation workflow inside the tab

Option B: Hide the trainer tab for now

- Recommended if training should remain non-productized until the UX is designed.
- Cleaner than shipping a dead tab in main navigation.

### Recommended Next Step

Build Option A, Phase 1.

Reasoning:

- client support already exists
- the tab is already mounted publicly in navigation
- removing the placeholder without replacing it leaves a visible product gap
- Phase 1 can ship as an operational trainer dashboard without solving every training workflow at once

### Acceptance Criteria

- Trainer tab no longer shows placeholder-only content.
- Trainer tab can show Kohya install/running state.
- Trainer tab can load trainable projects and current/recent training status.
- Trainer tab can prepare and start a training job from an existing trainable project.
- Trainer tab can interrupt an active training job.
- Trainer tab can show recent trained LoRAs and dataset/project summary data.
- Error and empty states are explicit and recoverable.

### Risks and Open Questions

- Need product decision on whether Phase 1 should expose raw training controls or just status plus start/stop.
- Need confirmation that the backend/API behavior behind the existing client methods is stable enough for product UI.
- Need clarity on whether the React trainer should be Kohya-branded, LoRA-project-branded, or both.

### File Touch List

- `src/pages/ServerPage/KohyaTrainerTab.tsx`
  - Replace placeholder with actual trainer dashboard UI.
- `src/pages/ServerPage/index.tsx`
  - Only if tab label, visibility, or loading strategy changes.
- `src/api/client.ts`
  - Likely type cleanup or helper wrappers around existing training methods.
- `src/api/types.ts`
  - Likely explicit response interfaces for prepare/start/interrupt payloads instead of inline object shapes.
- Optional new files:
  - `src/pages/ServerPage/useKohyaTrainer.ts`
  - `src/pages/ServerPage/TrainerStatusCard.tsx`
  - `src/pages/ServerPage/TrainableProjectsPanel.tsx`
  - `src/pages/ServerPage/TrainingHistoryPanel.tsx`
  - `src/pages/ServerPage/TrainingLaunchPreview.tsx`

If the decision is to hide instead:

- `src/pages/ServerPage/index.tsx`
  - Remove or gate the `Trainer` tab.
- `src/pages/ServerPage/KohyaTrainerTab.tsx`
  - Leave as internal stub or remove entirely.
- `src/stores/navigationStore.ts`
  - Remove or gate the `trainer` route state if the tab should disappear from routing.

## Workstream 4: Docs Parity and Scope Cleanup

### Goal

Bring React docs back into alignment with the mounted app so future threads stop wasting time on stale or contradictory claims.

### Current State

The docs currently disagree with each other and with the codebase.

Observed drift:

- `README.md` and `FEATURES.md` list only five top-level surfaces and omit `roleplay`, even though `roleplay` is a mounted route in source.
- `QUICKSTART.md` still claims model selection, advanced parameters, and presets are missing, but the current Generate page mounts those surfaces.
- `ENHANCEMENTS-COMPLETE.md` and `DESIGN-SYSTEM.md` still list remaining styling and PromptEditor tasks that may now be stale.
- There are two similarly named quick-start docs: `QUICK_START.md` and `QUICKSTART.md`, with different scopes and different levels of staleness.

Relevant source:

- `src/App.tsx`
- `src/routing/appRoute.ts`
- `src/pages/GeneratePage/components/WorkspaceSidebar.tsx`
- `src/pages/GeneratePage/components/ParameterPanel/index.tsx`
- `src/components/PromptEditor.tsx`

Relevant docs:

- `README.md`
- `FEATURES.md`
- `QUICK_START.md`
- `QUICKSTART.md`
- `INTEGRATION_GUIDE.md`
- `INTEGRATION_SUMMARY.md`
- `ENHANCEMENTS-COMPLETE.md`
- `DESIGN-SYSTEM.md`

### Source of Truth Recommendation

Use this hierarchy:

1. `FEATURES.md` as the product-surface truth
2. `README.md` as the short marketing/overview summary
3. all other docs must defer to the route map and `FEATURES.md`

### PromptEditor Decision

`PromptEditor.tsx` exists but is not mounted anywhere in current source.

Recommended decision for the docs pass:

- treat `PromptEditor` as out of scope unless a separate product decision says it should ship
- remove or downgrade any doc language that implies it is an imminent Generate-page task

If the team wants it in scope, it should become a separate implementation thread rather than staying as ambiguous doc debt.

### Acceptance Criteria

- React docs enumerate the same mounted top-level routes as the app shell.
- No doc claims basic missing functionality that is already present in code.
- Remaining-work docs clearly distinguish between real backlog and historical notes.
- The quick-start story is consolidated so there is one current entrypoint per audience.
- PromptEditor is either documented as non-shipping/internal or promoted into a real planned work item.

### Risks and Open Questions

- Need to decide whether to preserve historical docs as archives or rewrite them in place.
- Need to decide whether both quick-start docs should survive.
- Need product clarity on whether trainer and roleplay should be documented as active surfaces or experimental ones until completed.

### File Touch List

- `swarmui-react/FEATURES.md`
  - Update route inventory and current product-surface status.
- `swarmui-react/README.md`
  - Update high-level surface summary to include mounted routes accurately.
- `swarmui-react/QUICKSTART.md`
  - Remove stale limitations or archive the file if it is obsolete.
- `swarmui-react/QUICK_START.md`
  - Confirm intended audience and reconcile with `QUICKSTART.md`.
- `swarmui-react/INTEGRATION_SUMMARY.md`
  - Remove overstatements like “no placeholders” if they are still false.
- `swarmui-react/ENHANCEMENTS-COMPLETE.md`
  - Convert stale remaining-work notes into archived context or current status.
- `swarmui-react/DESIGN-SYSTEM.md`
  - Remove or revise stale “remaining theme work” and PromptEditor claims.
- Optional:
  - add a short `swarmui-react/docs/README.md` describing which docs are canonical vs historical.

## Suggested Thread Prompts

These are ready-to-use thread openings.

### Thread 1

Task: implement the React roleplay character picker described in `swarmui-react/docs/2026-04-10-react-investigation.md`.

Focus:

- replace `CharacterSelectionPanel.tsx`
- update `RoleplayPage/index.tsx`
- keep scope to roleplay entry flow only
- do not work on persona/lorebook CRUD in this thread

### Thread 2

Task: implement React persona and lorebook CRUD described in `swarmui-react/docs/2026-04-10-react-investigation.md`.

Focus:

- `PersonaManagerModal.tsx`
- `LorebookManagerModal.tsx`
- any necessary `ControlsPanel.tsx` integration
- minimal store changes only

### Thread 3

Task: implement or explicitly hide the React server trainer tab described in `swarmui-react/docs/2026-04-10-react-investigation.md`.

Focus:

- evaluate existing `client.ts` training support first
- choose `build phase-1 trainer dashboard` or `hide tab`
- document that decision in code comments or follow-up docs if needed

### Thread 4

Task: perform the React docs parity cleanup described in `swarmui-react/docs/2026-04-10-react-investigation.md`.

Focus:

- make docs consistent with mounted routes and current feature surface
- resolve `QUICK_START.md` vs `QUICKSTART.md`
- explicitly decide how `PromptEditor` is documented
