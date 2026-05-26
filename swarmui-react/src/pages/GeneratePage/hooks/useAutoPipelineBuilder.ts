import { useEffect, useRef } from 'react';
import type { GenerateParams } from '../../../api/types';
import type { GenerateWorkspaceMode } from '../../../routing/appRoute';
import { usePipelineStore } from '../../../stores/pipelineStore';
import { createStageConfig } from '../../../types/pipeline';

interface UseAutoPipelineBuilderOptions {
    formValues: GenerateParams;
    enableHiResFix: boolean;
    enableUpscale: boolean;
    enableChainUpscale: boolean;
    currentMode: GenerateWorkspaceMode;
}

export function buildAutoPipelineStages(
    formValues: GenerateParams,
    enableHiResFix: boolean,
    enableUpscale: boolean,
    enableChainUpscale: boolean,
) {
    const stages = [];

    // Stage 1: Generate (always present)
    const generateStage = createStageConfig('generate');
    generateStage.settings = {
        model: formValues.model || '',
        prompt: formValues.prompt || '',
        negativeprompt: formValues.negativeprompt || '',
        steps: formValues.steps || 20,
        cfgscale: formValues.cfgscale || 7,
        width: formValues.width || 512,
        height: formValues.height || 512,
        seed: formValues.seed ?? -1,
        sampler: formValues.sampler || 'euler',
        scheduler: formValues.scheduler || 'normal',
        images: formValues.images || 1,
        batchsize: formValues.batchsize || 1,
        vae: formValues.vae || 'Automatic',
        loras: formValues.loras || '',
        loraweights: formValues.loraweights || '',
    };
    if (formValues.initimage) {
        generateStage.settings.initimage = formValues.initimage;
        generateStage.settings.initimagecreativity = formValues.initimagecreativity ?? 0.6;
    }
    if (formValues.controlnetmodel) {
        generateStage.settings.controlnetmodel = formValues.controlnetmodel;
        generateStage.settings.controlnetstrength = formValues.controlnetstrength ?? 1;
        if (formValues.controlnetimageinput) {
            generateStage.settings.controlnetimageinput = formValues.controlnetimageinput;
        }
    }
    if (formValues.variationseed) {
        generateStage.settings.variationseed = formValues.variationseed;
        generateStage.settings.variationseedstrength = formValues.variationseedstrength ?? 0;
    }
    stages.push(generateStage);

    // Stage 2: Refine (if Hi-Res Fix enabled)
    if (enableHiResFix) {
        const refineStage = createStageConfig('refine');
        refineStage.settings = {
            refinercontrolpercentage: formValues.refinercontrolpercentage ?? 0.3,
            refinermethod: formValues.refinermethod || 'PostApply',
        };
        if (formValues.refinermodel) {
            refineStage.settings.refinermodel = formValues.refinermodel;
        }
        if (formValues.refinersteps) {
            refineStage.settings.refinersteps = formValues.refinersteps;
        }
        if (formValues.refinercfgscale) {
            refineStage.settings.refinercfgscale = formValues.refinercfgscale;
        }
        if (formValues.refinervae && formValues.refinervae !== 'None') {
            refineStage.settings.refinervae = formValues.refinervae;
        }
        if (formValues.refinerdotiling) {
            refineStage.settings.refinerdotiling = formValues.refinerdotiling;
        }
        stages.push(refineStage);
    }

    // Stage 3: Upscale (if Upscale enabled)
    if (enableUpscale) {
        const upscaleValue = formValues.refinerupscale ?? 2;
        const upscaleMethod = formValues.refinerupscalemethod || 'pixel-lanczos';
        const isLatentMethod = upscaleMethod.startsWith('latent-') || upscaleMethod.startsWith('latentmodel-');
        const stageKind = isLatentMethod ? 'latent_upscale' : 'ai_upscale';

        const upscaleStage = createStageConfig(stageKind);
        upscaleStage.settings = {
            refinerupscale: upscaleValue,
            refinerupscalemethod: upscaleMethod,
            refinercontrolpercentage: 0,
            refinermethod: 'PostApply',
        };
        stages.push(upscaleStage);
    }

    // Stage 4: Chain Upscale (if Chain Upscale enabled)
    if (enableChainUpscale) {
        const chainUpscaleValue = formValues.chainupscalescale ?? 1.5;
        const chainUpscaleMethod = formValues.chainupscalemethod || 'model-remacri';
        const isLatentMethod = chainUpscaleMethod.startsWith('latent-') || chainUpscaleMethod.startsWith('latentmodel-');
        const stageKind = isLatentMethod ? 'latent_upscale' : 'ai_upscale';

        const chainUpscaleStage = createStageConfig(stageKind);
        chainUpscaleStage.label = 'Chain Upscale';
        chainUpscaleStage.settings = {
            refinerupscale: chainUpscaleValue,
            refinerupscalemethod: chainUpscaleMethod,
            refinercontrolpercentage: 0,
            refinermethod: 'PostApply',
        };
        stages.push(chainUpscaleStage);
    }

    return stages;
}

export function useAutoPipelineBuilder({
    formValues,
    enableHiResFix,
    enableUpscale,
    enableChainUpscale,
    currentMode,
}: UseAutoPipelineBuilderOptions) {
    const prevFormValuesRef = useRef<string>('');
    const prevHiResFixRef = useRef(enableHiResFix);
    const prevUpscaleRef = useRef(enableUpscale);
    const prevChainUpscaleRef = useRef(enableChainUpscale);
    const prevModeRef = useRef(currentMode);

    useEffect(() => {
        if (currentMode !== 'pipeline') {
            prevFormValuesRef.current = JSON.stringify(formValues);
            prevHiResFixRef.current = enableHiResFix;
            prevUpscaleRef.current = enableUpscale;
            prevChainUpscaleRef.current = enableChainUpscale;
            prevModeRef.current = currentMode;
            return;
        }

        const pipelineState = usePipelineStore.getState();
        if (!pipelineState.autoSync) {
            return;
        }

        const currentFormValues = JSON.stringify(formValues);
        const hasChanged =
            currentFormValues !== prevFormValuesRef.current
            || enableHiResFix !== prevHiResFixRef.current
            || enableUpscale !== prevUpscaleRef.current
            || enableChainUpscale !== prevChainUpscaleRef.current
            || currentMode !== prevModeRef.current;

        if (!hasChanged) {
            return;
        }

        const stages = buildAutoPipelineStages(formValues, enableHiResFix, enableUpscale, enableChainUpscale);

        usePipelineStore.setState({
            stages,
            isRunning: false,
            currentRun: null,
            currentStageIndex: 0,
            stageResults: {},
        });

        prevFormValuesRef.current = currentFormValues;
        prevHiResFixRef.current = enableHiResFix;
        prevUpscaleRef.current = enableUpscale;
        prevChainUpscaleRef.current = enableChainUpscale;
        prevModeRef.current = currentMode;
    }, [formValues, enableHiResFix, enableUpscale, enableChainUpscale, currentMode]);

    useEffect(() => {
        if (currentMode === 'pipeline') {
            usePipelineStore.setState({ autoSync: true });
        }
    }, [currentMode]);
}
