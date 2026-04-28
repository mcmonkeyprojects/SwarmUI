# React Frontend Investigation

Date: 2026-04-10

Scope: `swarmui-react` only.

Method:
- Local source review of mounted routes and supporting stores/client code.
- Four explorer-agent passes: mounted placeholder surfaces, docs parity, explicit unfinished markers, and focused roleplay CRUD scoping.

This document is intended as a thread handoff for follow-on Codex work. Each section below is scoped so it can become its own focused implementation thread.

## Summary

The actual React backlog is smaller than the repo docs make it appear. The mounted, user-visible unfinished work is concentrated in:

1. Roleplay character entry flow
2. Roleplay persona manager
3. Roleplay lorebook manager
4. Server trainer tab
5. Docs/scope parity cleanup

The rest of the noise is mostly stale documentation.

Recommended thread split:

1. `react-roleplay-picker`
2. `react-roleplay-persona-lorebook-crud`
3. `react-server-trainer-tab`
4. `react-docs-parity-cleanup`

## Workstream 1: Roleplay Character Entry Flow

### Goal

Replace the placeholder `CharacterSelectionPanel` with a real character selection flow that matches the rest of the roleplay surface and uses the existing roleplay store.

### Current Behavior

- `RoleplayPage` defaults into a picker state before showing chat.
- `CharacterSelectionPanel` is a placeholder with a single `Use Default Character` button.
- `CharacterSidebar` already contains a real character list, active character display, create/edit/delete character actions, and session management.

### Desired Behavior

- Opening `Roleplay` should present a real entry flow.
- Users should be able to:
  - pick an existing character,
  - create a new character,
  - optionally jump into the most recent or default session for that character.
- The entry flow should stop duplicating logic that already exists in `CharacterSidebar`.

### Recommended Implementation Direction

Preferred direction:
- Keep the entry surface, but turn it into a proper character library view instead of a stub.

Reasoning:
- The page currently uses `showCharacterPicker` as a real route-level state gate.
- Removing the picker entirely would be simpler, but it would also remove a useful landing experience for first-use and multi-character workflows.
- The store already supports character and session operations, so this is mostly UI composition work.

Proposed UX:
- Replace the placeholder with:
  - searchable/selectable character cards,
  - a prominent `New Character` action,
  - `Continue` or `Open Chat` action on a selected character,
  - optional session summary for the selected character.
- If there is only one character and the user already has active sessions, consider auto-entering chat on revisit and reserving the picker for explicit `Choose Character`.

### Existing Store/Data Capabilities

Already present in `roleplayStore.ts`:
- character CRUD,
- avatar updates,
- session creation,
- session selection,
- character session lookup.

This means no major store architecture change is required for an MVP picker.

### Acceptance Criteria

- `Roleplay` no longer opens into a placeholder UI.
- Users can select any existing character from the picker.
- Users can create a new character from the picker.
- Selecting a character enters the normal chat layout with the correct active character and session.
- The picker does not regress the existing `CharacterSidebar` behavior.
- The flow is usable on first run and with multiple existing characters.

### Risks / Open Questions

- Whether the picker should remain as a dedicated landing surface or be removed in favor of opening directly into chat/sidebar.
- Whether the picker should create a new session automatically on selection or always land in the most recent session for that character.
- Whether to extract reusable list/card UI from `CharacterSidebar` to avoid duplicated rendering logic.

### Likely File Touch List

- `src/pages/RoleplayPage/CharacterSelectionPanel.tsx`
  - Replace placeholder UI with real selection/create flow.
- `src/pages/RoleplayPage/index.tsx`
  - Refine `showCharacterPicker` behavior and enter/exit rules.
- `src/pages/RoleplayPage/CharacterSidebar.tsx`
  - Optional extraction/reuse of character list rendering or session summary UI.
- `src/pages/RoleplayPage/CharacterEditor.tsx`
  - Likely reused as the create/edit entry point from the picker.
- `src/stores/roleplayStore.ts`
  - Probably minor helper additions only, if any.

## Workstream 2: Roleplay Persona Manager

### Goal

Replace `PersonaManagerModal` with a real persona CRUD surface backed by the existing store.

### Current Behavior

- The controls panel exposes persona selection for the current session.
- The persona modal itself is still placeholder-only.
- The store already contains persona data, CRUD methods, and active-session persona binding.

### Desired Behavior

- Users can create, edit, delete, and inspect personas from the modal.
- Users can see which persona is active for the current session.
- Persona-bound lorebook relationships remain visible and editable.

### Existing Store/Data Capabilities

Already present:
- `addPersona`
- `updatePersona`
- `removePersona`
- `setSessionActivePersona`
- persona normalization and change detection
- persona-bound lorebook id storage

This means the missing work is primarily UI and validation flow, not store architecture.

### Recommended MVP

- Left side:
  - persona list,
  - active persona marker,
  - create and delete actions.
- Right side:
  - editable persona form with name, description, notes, tags, avatar URL, bound lorebooks.
- Footer/header:
  - `New Persona`, `Save`, `Delete`, `Cancel`.

Do not over-scope the first pass:
- no import/export,
- no advanced media upload pipeline,
- no cross-page editor abstraction unless duplication becomes painful.

### Acceptance Criteria

- The placeholder text is gone.
- Users can create a persona and it persists through the store.
- Users can edit a persona and see changes reflected in the session controls.
- Users can delete non-default personas.
- Default persona protections remain intact.
- Bound lorebook ids are editable and persist correctly.

### Risks / Open Questions

- Whether persona editing should be optimistic or form-buffered until save.
- Whether avatar entry should stay as raw URL text for MVP.
- Whether the modal should allow quick `Set Active For Current Session`.

### Likely File Touch List

- `src/pages/RoleplayPage/PersonaManagerModal.tsx`
  - Full CRUD UI replacement.
- `src/pages/RoleplayPage/ControlsPanel.tsx`
  - Likely minor wiring only, possibly pass session context or add refresh/close behavior.
- `src/stores/roleplayStore.ts`
  - Likely helper additions only if the modal needs convenience selectors or duplicate operations.
- `src/types/roleplay.ts`
  - Only if UI requirements expose missing persona fields.

## Workstream 3: Roleplay Lorebook Manager

### Goal

Replace `LorebookManagerModal` with a real lorebook and lore entry CRUD surface.

### Current Behavior

- The controls panel exposes session-bound lorebook selection.
- The lorebook modal is still placeholder-only.
- The store already supports lorebook CRUD and stores lorebook entries inside each lorebook object.

### Desired Behavior

- Users can create, edit, and delete lorebooks.
- Users can add, edit, remove, and reorder lorebook entries.
- Users can manage entry triggers and content in one place.
- Existing session and persona lorebook bindings continue to work.

### Existing Store/Data Capabilities

Already present:
- `addLorebook`
- `updateLorebook`
- `removeLorebook`
- lorebook normalization and change detection
- automatic cleanup of deleted lorebook ids from characters, personas, and sessions
- session-bound lorebook selection from `ControlsPanel`

This is also mostly missing UI rather than missing store behavior.

### Recommended MVP

- Lorebook list pane:
  - lorebook name,
  - entry count,
  - create/delete actions.
- Lorebook editor pane:
  - name,
  - description,
  - editable entries list.
- Entry editor:
  - keys/triggers,
  - content/body,
  - enabled/priority flags if supported by the data model,
  - add/remove entry actions.

Keep the first pass focused on usability over automation.

### Acceptance Criteria

- The placeholder text is gone.
- Users can create and delete lorebooks.
- Users can add/edit/remove lorebook entries.
- Deleting a lorebook correctly removes its bindings from characters, personas, and sessions.
- Session lorebook selector in `ControlsPanel` reflects changes immediately.

### Risks / Open Questions

- Entry shape may need a clearer editor pattern if the existing type includes optional fields not currently surfaced.
- Reordering entries may require either explicit drag/drop or simple move up/down controls.
- Need to decide whether character-bound and persona-bound lorebook editing belongs inside this modal or remains elsewhere.

### Likely File Touch List

- `src/pages/RoleplayPage/LorebookManagerModal.tsx`
  - Full lorebook and entry CRUD UI.
- `src/pages/RoleplayPage/ControlsPanel.tsx`
  - Likely minor integration updates only.
- `src/stores/roleplayStore.ts`
  - Probably no major changes, but helper selectors or small utilities may help.
- `src/types/roleplay.ts`
  - Only if entry editing reveals missing or underspecified fields.

## Workstream 4: Server Trainer Tab

### Goal

Replace the placeholder trainer tab with a real training surface, or hide the tab if the product does not intend to ship trainer functionality yet.

### Current Behavior

- `ServerPage` mounts a `Trainer` tab.
- `KohyaTrainerTab.tsx` is still placeholder-only.
- The React client already contains substantial Kohya and LoRA training API support.

### Verified Existing Client Support

Already present in `src/api/client.ts` and `src/api/types.ts`:
- Kohya status
- Kohya training template
- Kohya datasets
- Kohya trained LoRAs
- LoRA projects
- batch plan generation and execution
- dataset review/approval
- trainable project listing
- training prepare/start/interrupt/status/history

This means the frontend is not starting from zero.

### Recommended Direction

Implement the tab, do not hide it.

Reasoning:
- The route is already mounted and user-visible.
- The client layer already exposes enough surface area to build a useful MVP.
- Hiding the tab would remove an already-signaled product surface without reducing the underlying complexity elsewhere.

### Recommended MVP Scope

Phase 1 inside one thread:
- setup/status panel,
- dataset and project inventory,
- trainable project list,
- job configuration form,
- launch preview,
- start/interrupt actions,
- live status and recent history.

Defer from MVP if needed:
- deep workflow authoring,
- advanced project creation wizards,
- dataset image review if it threatens scope,
- trained LoRA detail polish.

### Acceptance Criteria

- The `Trainer` tab is no longer placeholder-only.
- The page can show Kohya install/running state.
- Users can view trainable projects and available datasets.
- Users can prepare a training job and inspect the launch preview.
- Users can start and interrupt a job.
- Users can view current training status and recent job history.
- Failure states and missing-install states are handled clearly.

### Risks / Open Questions

- Whether the product intent is generic “trainer” or explicitly “LoRA trainer”.
- Whether dataset moderation belongs in the first trainer UI or in a separate future page.
- Whether the tab should use a single dense panel or a multi-section workflow.
- Whether the current API shapes are stable enough, or if the UI should first be read-only around status and history.

### Likely File Touch List

- `src/pages/ServerPage/KohyaTrainerTab.tsx`
  - Full trainer UI implementation.
- `src/pages/ServerPage/index.tsx`
  - Possible tab label copy changes or conditional rendering decisions.
- `src/api/client.ts`
  - Likely small additions or convenience wrappers only, not foundational work.
- `src/api/types.ts`
  - Type adjustments if the UI needs richer response shapes.
- `src/components/ui/*`
  - Optional only if the trainer needs a reusable status card or execution timeline component.

## Workstream 5: Docs and Scope Parity Cleanup

### Goal

Make the React docs describe the current mounted app truthfully and stop contradicting one another.

### Current Problem

Docs currently conflict in two directions:
- newer docs overstate completeness,
- older docs still claim missing features that are already mounted in the app.

Examples:
- `README.md` and `FEATURES.md` omit the mounted `roleplay` route.
- `QUICKSTART.md` still says model selection, advanced parameters, pagination, and presets are missing.
- `ENHANCEMENTS-COMPLETE.md` still lists remaining theme and PromptEditor work.
- `PromptEditor` exists as a component but does not appear to be mounted anywhere.

### Recommended Source of Truth

Use:
- `src/App.tsx`
- `src/routing/appRoute.ts`
- current mounted page/component tree

Then reconcile docs to that.

Recommended canonical docs:
- `FEATURES.md` as product inventory
- `README.md` as concise overview

Treat older migration/progress docs as historical unless actively maintained.

### PromptEditor Decision

Do not give `PromptEditor` its own implementation thread yet.

Decision needed first:
- if it is intended to replace existing prompt textareas, scope that separately later,
- if not, remove or downgrade docs that still imply it is pending required work.

### Acceptance Criteria

- `README.md` and `FEATURES.md` reflect the mounted route map, including `roleplay`.
- Old claims about missing basics are removed or clearly marked historical.
- `INTEGRATION_SUMMARY.md`, `QUICKSTART.md`, `ENHANCEMENTS-COMPLETE.md`, and `DESIGN-SYSTEM.md` no longer contradict the shipped surface.
- `PromptEditor` is either documented as out-of-scope/not yet mounted, or given an intentional future-work note.

### Risks / Open Questions

- Whether some older docs are intended to be historical snapshots rather than live docs.
- Whether trainer and roleplay should be documented as live-but-incomplete or intentionally experimental.

### Likely File Touch List

- `README.md`
  - Update current product surfaces.
- `FEATURES.md`
  - Add `roleplay`, note current truth.
- `QUICKSTART.md`
  - Remove outdated limitation claims.
- `INTEGRATION_SUMMARY.md`
  - Remove “no placeholders” style claims if still present.
- `ENHANCEMENTS-COMPLETE.md`
  - Archive, annotate as historical, or reconcile.
- `DESIGN-SYSTEM.md`
  - Remove stale “remaining work” guidance if no longer current.

## Suggested Execution Order

1. Roleplay character entry flow
2. Persona and lorebook CRUD
3. Trainer tab MVP
4. Docs parity cleanup

Reasoning:
- The first three are visible product gaps.
- The docs pass should happen after scope decisions on roleplay/trainer are locked.

## Suggested Future Thread Prompts

### Thread 1

Implement the React roleplay character entry flow described in `swarmui-react/docs/2026-04-10-react-frontend-investigation.md`. Focus only on replacing the placeholder `CharacterSelectionPanel` with a real selection/create flow and wiring it through `RoleplayPage`. Do not expand scope into persona, lorebook, or trainer work.

### Thread 2

Implement the React persona and lorebook manager work described in `swarmui-react/docs/2026-04-10-react-frontend-investigation.md`. Focus only on replacing `PersonaManagerModal` and `LorebookManagerModal` with real CRUD UIs against the existing roleplay store. Do not change route structure or trainer functionality.

### Thread 3

Implement the React server trainer MVP described in `swarmui-react/docs/2026-04-10-react-frontend-investigation.md`. Focus on `KohyaTrainerTab` and supporting API/type wiring only. Prefer an MVP that uses existing client methods before inventing new abstractions.

### Thread 4

Perform the React docs parity cleanup described in `swarmui-react/docs/2026-04-10-react-frontend-investigation.md`. Reconcile README/FEATURES/QUICKSTART/INTEGRATION/ENHANCEMENTS/DESIGN-SYSTEM docs against the current mounted app. Do not implement product UI in this thread.
