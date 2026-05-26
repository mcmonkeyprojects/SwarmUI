import type {
    InvokeAIBuiltGraph,
    InvokeAIGraph,
    InvokeAIGraphEdge,
    InvokeAIModelIdentifierField,
    InvokeAIModelRecord,
    InvokeAIRunParams,
} from './types';

interface UploadedInvokeImages {
    initImageName?: string;
    maskImageName?: string;
}

const VALID_SCHEDULERS = new Set([
    'ddim',
    'ddpm',
    'deis',
    'euler',
    'euler_k',
    'euler_a',
    'euler_a_k',
    'heun',
    'heun_k',
    'lms',
    'lms_k',
    'pndm',
    'dpmpp_2s',
    'dpmpp_2s_k',
    'dpmpp_2m',
    'dpmpp_2m_k',
    'dpmpp_2m_sde',
    'dpmpp_2m_sde_k',
    'dpmpp_3m',
    'dpmpp_3m_k',
    'dpmpp_sde',
    'dpmpp_sde_k',
    'unipc',
]);

const SCHEDULER_ALIASES: Record<string, string> = {
    'euler a': 'euler_a',
    'euler ancestral': 'euler_a',
    eulera: 'euler_a',
    euler_a: 'euler_a',
    euler: 'euler',
    ddim: 'ddim',
    ddpm: 'ddpm',
    heun: 'heun',
    lms: 'lms',
    pndm: 'pndm',
    deis: 'deis',
    unipc: 'unipc',
    'dpm++ 2m': 'dpmpp_2m',
    'dpm++ 2m karras': 'dpmpp_2m_k',
    'dpmpp 2m': 'dpmpp_2m',
    dpmpp_2m: 'dpmpp_2m',
    dpmpp_2m_k: 'dpmpp_2m_k',
    'dpm++ 2s': 'dpmpp_2s',
    'dpm++ 2s karras': 'dpmpp_2s_k',
    dpmpp_2s: 'dpmpp_2s',
    dpmpp_2s_k: 'dpmpp_2s_k',
    'dpm++ sde': 'dpmpp_sde',
    'dpm++ sde karras': 'dpmpp_sde_k',
    dpmpp_sde: 'dpmpp_sde',
    dpmpp_sde_k: 'dpmpp_sde_k',
};

function createInvokeId(prefix: string): string {
    return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function clampNumber(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}

function normalizeDimension(value: number): number {
    const rounded = Math.round(value || 512);
    return Math.max(64, rounded);
}

function normalizeSteps(value: number | undefined): number {
    return clampNumber(Math.round(value ?? 20), 1, 150);
}

function normalizeCfg(value: number | undefined): number {
    return clampNumber(Number(value ?? 7), 0, 30);
}

function normalizeClipSkip(value: number | undefined): number {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
        return 0;
    }
    return Math.round(value);
}

function normalizeDenoiseStrength(value: number | undefined): number {
    return clampNumber(Number(value ?? 0.75), 0, 1);
}

function normalizeCoherenceMode(value: string | undefined): string {
    if (value === 'Box Blur' || value === 'Staged') {
        return value;
    }
    return 'Gaussian Blur';
}

function resolveSeed(seed: number | null | undefined): number {
    if (typeof seed === 'number' && Number.isFinite(seed) && seed >= 0) {
        return Math.round(seed);
    }
    return Math.floor(Math.random() * 2147483647);
}

export function normalizeInvokeScheduler(value: string | undefined): string {
    const normalized = (value || '').trim().toLowerCase().replace(/[\s-]+/g, ' ');
    if (!normalized) {
        return 'euler';
    }
    const direct = normalized.replace(/\s+/g, '_');
    if (VALID_SCHEDULERS.has(direct)) {
        return direct;
    }
    return SCHEDULER_ALIASES[normalized] ?? 'euler';
}

export function toInvokeModelIdentifier(model: InvokeAIModelRecord): InvokeAIModelIdentifierField {
    if (!model.key || !model.hash || !model.name || !model.base || !model.type) {
        throw new Error('The selected InvokeAI model is missing identifier fields. Refresh the InvokeAI model list and select a main model.');
    }
    return {
        key: model.key,
        hash: model.hash,
        name: model.name,
        base: model.base,
        type: model.type,
        submodel_type: model.submodel_type ?? null,
    };
}

function edge(sourceNodeId: string, sourceField: string, destinationNodeId: string, destinationField: string): InvokeAIGraphEdge {
    return {
        source: {
            node_id: sourceNodeId,
            field: sourceField,
        },
        destination: {
            node_id: destinationNodeId,
            field: destinationField,
        },
    };
}

function addNode(graph: InvokeAIGraph, node: Record<string, unknown> & { id: string }): void {
    graph.nodes[node.id] = node;
}

export function buildInvokeGraph(
    params: InvokeAIRunParams,
    model: InvokeAIModelRecord,
    uploadedImages: UploadedInvokeImages = {}
): InvokeAIBuiltGraph {
    const modelIdentifier = toInvokeModelIdentifier(model);
    const mode = params.mode;
    const isSdxl = modelIdentifier.base.toLowerCase() === 'sdxl';
    const isImageMode = mode === 'img2img' || mode === 'inpaint' || mode === 'outpaint';
    const isMaskMode = mode === 'inpaint' || mode === 'outpaint';

    if (isImageMode && !uploadedImages.initImageName) {
        throw new Error('InvokeAI image editing requires a source image.');
    }
    if (isMaskMode && !uploadedImages.maskImageName) {
        throw new Error('InvokeAI mask editing requires a mask image.');
    }

    const seed = resolveSeed(params.seed);
    const width = normalizeDimension(params.width);
    const height = normalizeDimension(params.height);
    const scheduler = normalizeInvokeScheduler(params.scheduler);
    const denoiseStrength = normalizeDenoiseStrength(params.denoiseStrength);
    const graph: InvokeAIGraph = {
        id: createInvokeId('swarm_invoke_graph'),
        nodes: {},
        edges: [],
    };

    const seedNodeId = 'swarm_invoke_seed';
    const promptNodeId = 'swarm_invoke_positive_prompt';
    const modelLoaderId = 'swarm_invoke_model_loader';
    const clipSkipId = 'swarm_invoke_clip_skip';
    const positiveCompelId = 'swarm_invoke_positive_compel';
    const positiveCollectId = 'swarm_invoke_positive_collect';
    const negativeCompelId = 'swarm_invoke_negative_compel';
    const negativeCollectId = 'swarm_invoke_negative_collect';
    const noiseId = 'swarm_invoke_noise';
    const denoiseId = 'swarm_invoke_denoise';
    const latentsToImageId = 'swarm_invoke_latents_to_image';

    addNode(graph, {
        id: seedNodeId,
        type: 'integer',
        value: seed,
        is_intermediate: true,
        use_cache: true,
    });
    addNode(graph, {
        id: promptNodeId,
        type: 'string',
        value: params.prompt,
        is_intermediate: true,
        use_cache: true,
    });
    addNode(graph, {
        id: modelLoaderId,
        type: isSdxl ? 'sdxl_model_loader' : 'main_model_loader',
        model: modelIdentifier,
        is_intermediate: true,
        use_cache: true,
    });
    if (!isSdxl) {
        addNode(graph, {
            id: clipSkipId,
            type: 'clip_skip',
            skipped_layers: normalizeClipSkip(params.clipSkip),
            is_intermediate: true,
            use_cache: true,
        });
    }
    addNode(graph, {
        id: positiveCompelId,
        type: isSdxl ? 'sdxl_compel_prompt' : 'compel',
        is_intermediate: true,
        use_cache: true,
    });
    addNode(graph, {
        id: positiveCollectId,
        type: 'collect',
        is_intermediate: true,
        use_cache: true,
    });
    addNode(graph, {
        id: negativeCompelId,
        type: isSdxl ? 'sdxl_compel_prompt' : 'compel',
        prompt: params.negativePrompt ?? '',
        style: isSdxl ? params.negativePrompt ?? '' : undefined,
        is_intermediate: true,
        use_cache: true,
    });
    addNode(graph, {
        id: negativeCollectId,
        type: 'collect',
        is_intermediate: true,
        use_cache: true,
    });
    addNode(graph, {
        id: noiseId,
        type: 'noise',
        width,
        height,
        use_cpu: false,
        is_intermediate: true,
        use_cache: true,
    });
    addNode(graph, {
        id: denoiseId,
        type: 'denoise_latents',
        cfg_scale: normalizeCfg(params.cfgScale),
        cfg_rescale_multiplier: 0,
        scheduler,
        steps: normalizeSteps(params.steps),
        denoising_start: isImageMode ? 1 - denoiseStrength : 0,
        denoising_end: 1,
        is_intermediate: true,
        use_cache: false,
    });
    addNode(graph, {
        id: latentsToImageId,
        type: 'l2i',
        fp32: false,
        is_intermediate: isMaskMode,
        use_cache: false,
    });

    graph.edges.push(edge(modelLoaderId, 'unet', denoiseId, 'unet'));
    if (isSdxl) {
        graph.edges.push(
            edge(modelLoaderId, 'clip', positiveCompelId, 'clip'),
            edge(modelLoaderId, 'clip', negativeCompelId, 'clip'),
            edge(modelLoaderId, 'clip2', positiveCompelId, 'clip2'),
            edge(modelLoaderId, 'clip2', negativeCompelId, 'clip2'),
            edge(promptNodeId, 'value', positiveCompelId, 'prompt'),
            edge(promptNodeId, 'value', positiveCompelId, 'style')
        );
    } else {
        graph.edges.push(
            edge(modelLoaderId, 'clip', clipSkipId, 'clip'),
            edge(clipSkipId, 'clip', positiveCompelId, 'clip'),
            edge(clipSkipId, 'clip', negativeCompelId, 'clip'),
            edge(promptNodeId, 'value', positiveCompelId, 'prompt')
        );
    }

    graph.edges.push(
        edge(positiveCompelId, 'conditioning', positiveCollectId, 'item'),
        edge(positiveCollectId, 'collection', denoiseId, 'positive_conditioning'),
        edge(negativeCompelId, 'conditioning', negativeCollectId, 'item'),
        edge(negativeCollectId, 'collection', denoiseId, 'negative_conditioning'),
        edge(seedNodeId, 'value', noiseId, 'seed'),
        edge(noiseId, 'noise', denoiseId, 'noise'),
        edge(denoiseId, 'latents', latentsToImageId, 'latents'),
        edge(modelLoaderId, 'vae', latentsToImageId, 'vae')
    );

    if (isImageMode && uploadedImages.initImageName) {
        const imageToLatentsId = 'swarm_invoke_image_to_latents';
        addNode(graph, {
            id: imageToLatentsId,
            type: 'i2l',
            image: {
                image_name: uploadedImages.initImageName,
            },
            fp32: false,
            is_intermediate: true,
            use_cache: false,
        });
        graph.edges.push(
            edge(modelLoaderId, 'vae', imageToLatentsId, 'vae'),
            edge(imageToLatentsId, 'latents', denoiseId, 'latents')
        );
    }

    if (isMaskMode && uploadedImages.initImageName && uploadedImages.maskImageName) {
        const gradientMaskId = 'swarm_invoke_gradient_mask';
        const expandedMaskId = 'swarm_invoke_expanded_mask';
        const blendId = 'swarm_invoke_output_blend';
        addNode(graph, {
            id: gradientMaskId,
            type: 'create_gradient_mask',
            image: {
                image_name: uploadedImages.initImageName,
            },
            mask: {
                image_name: uploadedImages.maskImageName,
            },
            coherence_mode: normalizeCoherenceMode(params.coherenceMode),
            minimum_denoise: clampNumber(Number(params.coherenceMinDenoise ?? 0), 0, 1),
            edge_radius: clampNumber(Math.round(params.coherenceEdgeSize ?? 16), 0, 256),
            fp32: false,
            is_intermediate: true,
            use_cache: false,
        });
        addNode(graph, {
            id: expandedMaskId,
            type: 'expand_mask_with_fade',
            fade_size_px: clampNumber(Math.round(params.maskBlur ?? 16), 0, 256),
            threshold: 0.5,
            is_intermediate: true,
            use_cache: false,
        });
        addNode(graph, {
            id: blendId,
            type: 'invokeai_img_blend',
            layer_base: {
                image_name: uploadedImages.initImageName,
            },
            blend_mode: 'Normal',
            opacity: 1,
            is_intermediate: false,
            use_cache: false,
        });
        graph.edges.push(
            edge(modelLoaderId, 'vae', gradientMaskId, 'vae'),
            edge(modelLoaderId, 'unet', gradientMaskId, 'unet'),
            edge(gradientMaskId, 'denoise_mask', denoiseId, 'denoise_mask'),
            edge(gradientMaskId, 'expanded_mask_area', expandedMaskId, 'mask'),
            edge(latentsToImageId, 'image', blendId, 'layer_upper'),
            edge(expandedMaskId, 'image', blendId, 'mask')
        );
        return {
            graph,
            outputNodeId: blendId,
            resolvedSeed: seed,
            scheduler,
        };
    }

    return {
        graph,
        outputNodeId: latentsToImageId,
        resolvedSeed: seed,
        scheduler,
    };
}
