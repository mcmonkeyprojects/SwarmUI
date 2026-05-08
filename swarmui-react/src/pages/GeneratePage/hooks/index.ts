/**
 * GeneratePage Hooks
 * 
 * These hooks extract and consolidate state management from the monolithic
 * GeneratePage.tsx component for better maintainability and reusability.
 */

// Data loading (models, VAEs, backends, etc.)
export { useDataLoaders } from './useDataLoaders';
export type { DataLoaders } from './useDataLoaders';

// Modal/drawer state management
export { useModalState } from './useModalState';
export type { ModalState } from './useModalState';

// Panel collapse/resize state
export { usePanelState, DEFAULT_PANEL_CONFIG } from './usePanelState';
export type { PanelState, PanelConfig } from './usePanelState';

// Parameter form state and handlers
export { useParameterForm, DEFAULT_FORM_VALUES } from './useParameterForm';
export type { ParameterForm, FormInstance, UseParameterFormOptions } from './useParameterForm';

// Local-only Generate UI state
export { useGenerateTransientUiState } from './useGenerateTransientUiState';

// Deferred supplemental data gate
export { useSupplementalDataReady } from './useSupplementalDataReady';

// React Query data loading scope policy
export { useGenerateDataScopes } from './useGenerateDataScopes';

// Generate route/controller orchestration
export { useGeneratePageController } from './useGeneratePageController';
