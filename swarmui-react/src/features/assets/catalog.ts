import type { Embedding, LoRA, Model, VAEModel } from '../../api/types';

type CatalogAssetShape = {
    name: string;
    title?: string;
    description?: string;
    preview?: string;
    preview_image?: string;
    path?: string;
    architecture?: string;
};

export type AssetCatalogKind = 'model' | 'lora' | 'embedding' | 'controlnet' | 'upscaler' | 'vae' | 'wildcard';

export interface AssetCatalogItem {
    id: string;
    kind: AssetCatalogKind;
    name: string;
    title: string;
    description?: string;
    path?: string;
    preview?: string | null;
    capabilities: string[];
    compatibility: {
        status: 'ready' | 'recommended' | 'partial';
        reason: string;
        score: number;
    };
}

interface CompatibilityContext {
    selectedModel: string;
    enableControlNet: boolean;
    enableVideo: boolean;
}

function buildCompatibility(kind: AssetCatalogKind, context: CompatibilityContext): AssetCatalogItem['compatibility'] {
    if (kind === 'controlnet') {
        return context.enableControlNet
            ? { status: 'recommended', reason: 'ControlNet is enabled in the current workspace.', score: 92 }
            : { status: 'partial', reason: 'Enable ControlNet to use this asset immediately.', score: 48 };
    }

    if (kind === 'upscaler') {
        return context.enableVideo
            ? { status: 'partial', reason: 'Upscalers are most useful in still-image workflows.', score: 55 }
            : { status: 'recommended', reason: 'Recommended for current image generation workflow.', score: 88 };
    }

    if (kind === 'model') {
        return context.selectedModel
            ? { status: 'ready', reason: 'Models can be swapped at any time.', score: 74 }
            : { status: 'recommended', reason: 'A model is required before generation can start.', score: 96 };
    }

    return context.selectedModel
        ? { status: 'recommended', reason: 'Works well with the active model workflow.', score: 82 }
        : { status: 'partial', reason: 'Select a base model first to use this asset confidently.', score: 42 };
}

function makeItem(
    kind: AssetCatalogKind,
    item: CatalogAssetShape,
    context: CompatibilityContext,
    extraCapabilities: string[] = [],
): AssetCatalogItem {
    const capabilities = [
        ...(item.architecture ? [String(item.architecture)] : []),
        ...extraCapabilities,
    ].filter(Boolean);

    return {
        id: `${kind}:${item.name}`,
        kind,
        name: item.name,
        title: item.title || item.name,
        description: item.description,
        path: item.path,
        preview: item.preview || item.preview_image || null,
        capabilities,
        compatibility: buildCompatibility(kind, context),
    };
}

export function buildAssetCatalog(input: {
    models: Model[];
    loras: LoRA[];
    vaes: VAEModel[];
    controlnets: Model[];
    upscalers: Model[];
    embeddings: Array<Embedding | Model>;
    wildcards: Model[];
    context: CompatibilityContext;
}): AssetCatalogItem[] {
    return [
        ...input.models.map((item) => makeItem('model', item, input.context, ['base-model'])),
        ...input.loras.map((item) => makeItem('lora', item, input.context, ['style-addon'])),
        ...input.vaes.map((item) => makeItem('vae', item, input.context, ['decoder'])),
        ...input.controlnets.map((item) => makeItem('controlnet', item, input.context, ['guidance'])),
        ...input.upscalers.map((item) => makeItem('upscaler', item, input.context, ['detail-enhancement'])),
        ...input.embeddings.map((item) => makeItem('embedding', item, input.context, ['textual-inversion'])),
        ...input.wildcards.map((item) => makeItem('wildcard', item, input.context, ['prompt-variation'])),
    ];
}
