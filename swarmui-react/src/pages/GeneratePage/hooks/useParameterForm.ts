import { useState, useEffect, useCallback, useRef } from 'react';
import { useForm, type UseFormReturnType } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { logger } from '../../../utils/logger';
import type { GenerateParams, LoRASelection } from '../../../api/types';
import { usePresetsStore } from '../../../stores/presets';
import {
    useGenerationParams,
    useSelectedModel,
    useActiveLoras
} from '../../../store/generationStore';
import { useModelLoading } from '../../../hooks/useModelLoading';
import { useT2IParams } from '../../../hooks/useT2IParams';
import { usePromptEnhanceStore } from '../../../stores/promptEnhanceStore';
import { unloadLocalTextModelNow } from '../../../services/localModelVramCoordinator';

/**
 * Default form values for generation parameters.
 */
export const DEFAULT_FORM_VALUES: GenerateParams = {
    prompt: '',
    negativeprompt: '',
    images: 1,
    steps: 20,
    cfgscale: 7,
    seed: -1,
    width: 512,
    height: 512,
    model: '',
    sampler: 'euler',
    scheduler: 'normal',
    // Additional SwarmUI parameters
    batchsize: 1,
    initimage: undefined,
    maskimage: undefined,
    initimagecreativity: 0.6,
    variationseed: -1,
    variationseedstrength: 0,
    vae: 'Automatic',
    refinermodel: '',
    refinercontrol: 0,
    refinerupscale: 1,
    refinermethod: 'PostApply',
    refinervae: 'None',
    refinersteps: 40,              // Default per backend (toggleable)
    refinercfgscale: 7,            // Default per backend (toggleable)
    refinerdotiling: false,
    refinerupscalemethod: 'pixel-lanczos',
    seamlesstileable: '',
    coloradjust: '',
    removebackground: false,
    donotsave: false,
    dontsaveintermediates: false,
    nopreviews: false,
    // Video Generation
    videomodel: '',
    videoframes: 25,
    videosteps: 20,
    videocfg: 3.5,          // aligns with video model CFG expectations
    videofps: 24,
    videoformat: 'h264-mp4',
    videoboomerang: false,
    // Text2Video
    text2videoframes: 97,   // aligns with LTX-Video T2V recommended frame count
    text2videofps: 24,
    text2videoformat: 'h264-mp4',
    // ControlNet
    controlnetstrength: 1,
    controlnetstart: 0,
    controlnetend: 1,
    controlnettwostrength: 1,
    controlnettwostart: 0,
    controlnettwoend: 1,
    controlnetthreestrength: 1,
    controlnetthreestart: 0,
    controlnetthreeend: 1,
};

export interface UseParameterFormOptions {
    onModelLoadStart?: () => void;
    onModelLoadProgress?: (progress: number) => void;
    onModelLoadComplete?: (modelName: string) => void;
    onModelLoadError?: (error: string) => void;
}

/**
 * Hook for managing the generation parameter form.
 * Handles form state, preset loading/saving, model selection with progress.
 * Now uses WebSocket store for model loading state.
 */
export function useParameterForm(options: UseParameterFormOptions = {}) {
    const {
        onModelLoadStart,
        onModelLoadProgress,
        onModelLoadComplete,
        onModelLoadError,
    } = options;

    // Get stored params from generation store
    const { params: storedParams, setParams } = useGenerationParams();
    const { selectedModel: storedSelectedModel, setSelectedModel: setStoreSelectedModel } = useSelectedModel();
    const { activeLoras, setLoras } = useActiveLoras();
    const enhanceEndpointUrl = usePromptEnhanceStore((state) => state.endpointUrl);
    const enhanceModelId = usePromptEnhanceStore((state) => state.modelId);
    const enhanceServerMode = usePromptEnhanceStore((state) => state.detectedServerMode);

    // Dynamic parameter data from backend
    const { paramDefaults, isLoaded: t2iParamsLoaded } = useT2IParams();
    const appliedServerDefaultsRef = useRef(false);

    // Preset store (now synced with backend)
    const { presets, addPreset, deletePreset: deleteStorePreset, duplicatePreset: duplicateStorePreset, getPreset } = usePresetsStore();

    // Model loading state via wrapper hook
    const {
        isLoading: loadingModel,
        progress: modelLoadProgress,
        loadingCount: modelLoadingCount,
        isProgressEstimated: modelLoadProgressEstimated,
        error: modelLoadError,
        modelName,
        loadModel
    } = useModelLoading();

    // Preset modal state
    const [presetName, setPresetName] = useState('');
    const [presetDescription, setPresetDescription] = useState('');

    // Init image state
    const [initImageFile, setInitImageFile] = useState<File | null>(null);
    const [initImagePreview, setInitImagePreview] = useState<string | null>(null);

    // Initialize form
    const form = useForm<GenerateParams>({
        initialValues: DEFAULT_FORM_VALUES,
    });

    // Sync form with stored params on mount
    useEffect(() => {
        if (storedParams && Object.keys(storedParams).length > 0) {
            form.setValues(storedParams);
        }
        if (storedSelectedModel) {
            form.setFieldValue('model', storedSelectedModel);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []); // Run only on mount

    // Apply server-provided defaults once when T2I params load.
    // Only overrides fields that are still at their hardcoded defaults
    // (i.e., the user hasn't manually changed them).
    useEffect(() => {
        if (!t2iParamsLoaded || appliedServerDefaultsRef.current) return;
        if (Object.keys(paramDefaults).length === 0) return;

        appliedServerDefaultsRef.current = true;

        const fieldsToCheck: (keyof GenerateParams)[] = [
            'steps', 'cfgscale', 'sampler', 'scheduler', 'width', 'height',
            'seed', 'clipstopatlayer',
        ];

        for (const field of fieldsToCheck) {
            const currentVal = form.values[field];
            const hardcodedDefault = DEFAULT_FORM_VALUES[field];
            const serverDefault = paramDefaults[field];

            // Only apply server default if:
            // 1. Server provides a default for this field
            // 2. Current value matches the hardcoded default (user hasn't changed it)
            if (serverDefault !== undefined && currentVal === hardcodedDefault && serverDefault !== hardcodedDefault) {
                form.setFieldValue(field as string, serverDefault);
            }
        }
    }, [t2iParamsLoaded, paramDefaults, form]);

    // Continuously sync form values to store (debounced)
    // This ensures state persists across tab switches
    useEffect(() => {
        const timeoutId = setTimeout(() => {
            // Only sync if values have actually changed
            const currentFormValues = form.values;
            if (currentFormValues.prompt !== storedParams.prompt ||
                currentFormValues.negativeprompt !== storedParams.negativeprompt ||
                currentFormValues.steps !== storedParams.steps ||
                currentFormValues.cfgscale !== storedParams.cfgscale ||
                currentFormValues.images !== storedParams.images ||
                currentFormValues.batchsize !== storedParams.batchsize ||
                currentFormValues.width !== storedParams.width ||
                currentFormValues.height !== storedParams.height ||
                currentFormValues.seed !== storedParams.seed ||
                currentFormValues.model !== storedSelectedModel) {
                setParams(currentFormValues);
                setStoreSelectedModel(currentFormValues.model || '');
            }
        }, 500); // 500ms debounce

        return () => clearTimeout(timeoutId);
    }, [form.values, storedParams, storedSelectedModel, setParams, setStoreSelectedModel]);

    // Sync form when store params change (e.g., from History "Reuse Parameters" or "Use as Init Image")
    useEffect(() => {
        if (storedParams && Object.keys(storedParams).length > 0) {
            const currentPrompt = form.values.prompt;
            const storedPrompt = storedParams.prompt;
            const currentModel = form.values.model;
            const storedModel = storedParams.model;
            const currentInitImage = form.values.initimage;
            const storedInitImage = storedParams.initimage;
            const currentMaskImage = form.values.maskimage;
            const storedMaskImage = storedParams.maskimage;

            const shouldSyncFullParams = Boolean((storedPrompt && storedPrompt !== currentPrompt)
                || (storedModel && storedModel !== currentModel)
                || (storedMaskImage && storedMaskImage !== currentMaskImage));

            // Sync full parameter changes from explicit handoffs like History reuse or Canvas edit setup.
            if (shouldSyncFullParams) {
                queueMicrotask(() => {
                    form.setValues(storedParams);
                    if (typeof storedInitImage === 'string' && storedInitImage) {
                        setInitImagePreview(storedInitImage);
                    }
                    notifications.show({
                        title: 'Parameters Loaded',
                        message: 'Form updated with loaded parameters',
                        color: 'blue',
                    });
                });
            }

            // Sync init image changes (Use as Init Image button)
            if (storedInitImage && storedInitImage !== currentInitImage) {
                queueMicrotask(() => {
                    form.setFieldValue('initimage', storedInitImage);
                    setInitImagePreview(storedInitImage);
                });
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [storedParams.prompt, storedParams.seed, storedParams.initimage, storedParams.maskimage, storedParams.model]);

    const handleLoadPreset = useCallback((presetId: string) => {
        const preset = getPreset(presetId);
        if (preset) {
            // Clone params and remove prompt fields (we don't want to overwrite user prompts)
            const params = { ...preset.params } as Partial<GenerateParams>;
            delete params.prompt;
            delete params.negativeprompt;
            Object.entries(params).forEach(([key, value]) => {
                if (value !== undefined) {
                    // Using type assertion since keys come from the same type
                    form.setFieldValue(key as string, value);
                }
            });
            notifications.show({
                title: 'Preset Loaded',
                message: `Applied "${preset.name}" settings`,
                color: 'blue',
            });
        }
    }, [form, getPreset]);

    // Handle preset saving (async - saves to backend)
    const handleSavePreset = useCallback(async () => {
        if (!presetName.trim()) {
            notifications.show({
                title: 'Error',
                message: 'Please enter a preset name',
                color: 'red',
            });
            return false;
        }

        // Clone form values and remove prompt fields for preset
        const paramsToSave = { ...form.values } as Partial<GenerateParams>;
        delete paramsToSave.prompt;
        delete paramsToSave.negativeprompt;

        const success = await addPreset({
            name: presetName,
            description: presetDescription,
            params: paramsToSave,
        });

        if (success) {
            notifications.show({
                title: 'Preset Saved',
                message: `"${presetName}" has been saved`,
                color: 'green',
            });
            setPresetName('');
            setPresetDescription('');
        } else {
            notifications.show({
                title: 'Save Failed',
                message: 'A preset with that name may already exist',
                color: 'red',
            });
        }

        return success;
    }, [addPreset, form.values, presetName, presetDescription]);

    // Handle preset deletion (async - deletes from backend)
    const handleDeletePreset = useCallback(async (presetId: string) => {
        const preset = getPreset(presetId);
        const success = await deleteStorePreset(presetId);
        if (success) {
            notifications.show({
                title: 'Preset Deleted',
                message: `"${preset?.name || presetId}" has been deleted`,
                color: 'blue',
            });
        } else {
            notifications.show({
                title: 'Delete Failed',
                message: 'Failed to delete preset',
                color: 'red',
            });
        }
        return success;
    }, [deleteStorePreset, getPreset]);

    // Handle preset duplication (async - duplicates on backend)
    const handleDuplicatePreset = useCallback(async (presetId: string) => {
        const success = await duplicateStorePreset(presetId);
        if (success) {
            notifications.show({
                title: 'Preset Duplicated',
                message: 'Preset has been duplicated',
                color: 'green',
            });
        } else {
            notifications.show({
                title: 'Duplicate Failed',
                message: 'Failed to duplicate preset',
                color: 'red',
            });
        }
        return success;
    }, [duplicateStorePreset]);

    // Subscribe to model loading state changes and trigger callbacks
    useEffect(() => {
        if (loadingModel) {
            onModelLoadStart?.();
        }
        if (modelLoadProgress > 0) {
            onModelLoadProgress?.(modelLoadProgress);
        }
        if (!loadingModel && modelLoadProgress === 100 && modelName) {
            onModelLoadComplete?.(modelName);
            notifications.show({
                title: 'Model Loaded',
                message: `Loaded ${modelName}`,
                color: 'green',
            });
        }
        if (modelLoadError) {
            onModelLoadError?.(modelLoadError);
            notifications.show({
                title: 'Model Load Failed',
                message: modelLoadError,
                color: 'red',
            });
        }
    }, [loadingModel, modelLoadProgress, modelLoadError, modelName, onModelLoadStart, onModelLoadProgress, onModelLoadComplete, onModelLoadError]);

    // Handle model selection via WebSocket store
    const handleModelSelect = useCallback(async (modelName: string | null) => {
        if (!modelName) {
            form.setFieldValue('model', '');
            setStoreSelectedModel('');
            return;
        }

        logger.info(`Starting model selection via WebSocket store: ${modelName}`);

        // Update form and store immediately
        form.setFieldValue('model', modelName);
        setStoreSelectedModel(modelName);

        const unloadResult = await unloadLocalTextModelNow({
            endpointUrl: enhanceEndpointUrl,
            modelId: enhanceModelId,
            serverMode: enhanceServerMode,
        });
        if (unloadResult.attempted && !unloadResult.success) {
            notifications.show({
                title: 'Assistant Model Still Loaded',
                message: unloadResult.error || 'The assistant model could not be unloaded before loading the image model.',
                color: 'yellow',
            });
        }

        // Trigger backend load via useModelLoading hook
        loadModel(modelName);
    }, [enhanceEndpointUrl, enhanceModelId, enhanceServerMode, form, setStoreSelectedModel, loadModel]);

    // Handle LoRA changes
    const handleLoraChange = useCallback((loras: LoRASelection[]) => {
        setLoras(loras);

        // Update form values
        const loraNames = loras.map(l => l.lora).join(',');
        const loraWeights = loras.map(l => l.weight).join(',');

        form.setFieldValue('loras', loraNames);
        form.setFieldValue('loraweights', loraWeights);
    }, [form, setLoras]);

    // Handle init image upload
    const handleInitImageUpload = useCallback(async (file: File | null) => {
        if (!file) {
            setInitImageFile(null);
            setInitImagePreview(null);
            form.setFieldValue('initimage', undefined);
            return;
        }

        setInitImageFile(file);

        const reader = new FileReader();
        reader.onload = (e) => {
            const result = e.target?.result as string;
            setInitImagePreview(result);
            form.setFieldValue('initimage', result);
        };
        reader.readAsDataURL(file);
    }, [form]);

    // Clear init image
    const clearInitImage = useCallback(() => {
        setInitImageFile(null);
        setInitImagePreview(null);
        form.setFieldValue('initimage', undefined);
    }, [form]);

    // Reset form to defaults
    const resetForm = useCallback(() => {
        form.reset();
        setInitImageFile(null);
        setInitImagePreview(null);
        notifications.show({
            title: 'Settings Reset',
            message: 'All parameters restored to defaults',
            color: 'blue',
        });
    }, [form]);

    // Save current settings
    const saveSettings = useCallback(() => {
        setParams(form.values);
        notifications.show({
            title: 'Settings Saved',
            message: 'Current parameters saved to session',
            color: 'green',
        });
    }, [form.values, setParams]);

    return {
        // Form instance
        form,

        // Model loading state from useModelLoading hook
        loadingModel,
        modelLoadProgress,
        modelLoadingCount,
        modelLoadProgressEstimated,
        modelLoadError,

        // Preset state
        presetName,
        setPresetName,
        presetDescription,
        setPresetDescription,
        presets,

        // Init image state
        initImageFile,
        initImagePreview,

        // LoRA state
        activeLoras,

        // Handlers
        handleLoadPreset,
        handleSavePreset,
        handleDeletePreset,
        handleDuplicatePreset,
        handleModelSelect,
        handleLoraChange,
        handleInitImageUpload,
        clearInitImage,
        resetForm,
        saveSettings,
    };
}

export type ParameterForm = ReturnType<typeof useParameterForm>;
export type FormInstance = UseFormReturnType<GenerateParams>;
