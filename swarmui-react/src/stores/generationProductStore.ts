import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { GenerateParams } from '../api/types';
import { createIndexedDbStorage } from '../lib/indexedDbStorage';
import type {
    GenerationComparison,
    GenerationIssue,
    GenerationRecipe,
    WorkspaceSnapshot,
} from '../features/generation/productTypes';
import type { GenerateWorkspaceMode } from './navigationStore';

interface GenerationProductState {
    currentMode: GenerateWorkspaceMode;
    activeRecipeId: string | null;
    recipes: GenerationRecipe[];
    lastSnapshot: WorkspaceSnapshot | null;
    lastIssues: GenerationIssue[];
    comparison: GenerationComparison | null;
    setCurrentMode: (mode: GenerateWorkspaceMode) => void;
    saveRecipe: (input: {
        name: string;
        description?: string;
        mode: GenerateWorkspaceMode;
        params: Partial<GenerateParams>;
        promptTemplate?: string;
        tags?: string[];
    }) => string;
    applyRecipe: (recipeId: string) => GenerationRecipe | null;
    setActiveRecipe: (recipeId: string | null) => void;
    captureSnapshot: (snapshot: WorkspaceSnapshot) => void;
    clearSnapshot: () => void;
    setIssues: (issues: GenerationIssue[]) => void;
    setComparison: (comparison: GenerationComparison | null) => void;
}

const starterRecipeTimestamp = 0;

const starterRecipes: GenerationRecipe[] = [
    {
        id: 'recipe-fast-draft',
        name: 'Fast Draft',
        description: 'Quick idea testing with light settings and practical framing.',
        mode: 'quick',
        promptTemplate: 'clear subject, simple composition',
        params: {
            width: 768,
            height: 768,
            steps: 16,
            cfgscale: 6,
        },
        tags: ['core', 'draft', 'quick'],
        createdAt: starterRecipeTimestamp,
        updatedAt: starterRecipeTimestamp,
    },
    {
        id: 'recipe-balanced-default',
        name: 'Balanced Default',
        description: 'Everyday text-to-image setup for regular prompting.',
        mode: 'guided',
        promptTemplate: 'well-composed image, balanced lighting, clear details',
        params: {
            width: 1024,
            height: 1024,
            steps: 24,
            cfgscale: 6.5,
        },
        tags: ['core', 'balanced', 'default'],
        createdAt: starterRecipeTimestamp,
        updatedAt: starterRecipeTimestamp,
    },
    {
        id: 'recipe-final-quality',
        name: 'Final Quality',
        description: 'Slower final-pass setup for cleaner, more resolved outputs.',
        mode: 'advanced',
        promptTemplate: 'high quality, refined details, polished composition',
        params: {
            width: 1216,
            height: 1216,
            steps: 36,
            cfgscale: 6,
        },
        tags: ['core', 'quality', 'final'],
        createdAt: starterRecipeTimestamp,
        updatedAt: starterRecipeTimestamp,
    },
    {
        id: 'recipe-portrait',
        name: 'Portrait',
        description: 'Vertical framing for faces, characters, and upper-body shots.',
        mode: 'guided',
        promptTemplate: 'portrait, expressive face, flattering lighting, detailed features',
        params: {
            width: 832,
            height: 1216,
            steps: 26,
            cfgscale: 6.5,
        },
        tags: ['core', 'portrait', 'vertical'],
        createdAt: starterRecipeTimestamp,
        updatedAt: starterRecipeTimestamp,
    },
    {
        id: 'recipe-landscape-environment',
        name: 'Landscape / Environment',
        description: 'Wide scene-first setup for locations, worlds, and vistas.',
        mode: 'guided',
        promptTemplate: 'wide landscape, strong composition, atmospheric environment, depth',
        params: {
            width: 1280,
            height: 720,
            steps: 26,
            cfgscale: 6.5,
        },
        tags: ['core', 'landscape', 'environment', 'wide'],
        createdAt: starterRecipeTimestamp,
        updatedAt: starterRecipeTimestamp,
    },
    {
        id: 'recipe-square-illustration',
        name: 'Square Illustration',
        description: 'General 1:1 artwork setup for illustrations, concepts, and social crops.',
        mode: 'guided',
        promptTemplate: 'detailed illustration, clear silhouette, clean composition',
        params: {
            width: 1024,
            height: 1024,
            steps: 26,
            cfgscale: 7,
        },
        tags: ['core', 'illustration', 'square'],
        createdAt: starterRecipeTimestamp,
        updatedAt: starterRecipeTimestamp,
    },
    {
        id: 'recipe-cinematic-16x9',
        name: 'Cinematic 16:9',
        description: 'Wide film-still setup with dramatic lighting and composition.',
        mode: 'advanced',
        promptTemplate: 'cinematic film still, dramatic lighting, strong composition, depth of field',
        params: {
            width: 1280,
            height: 720,
            steps: 30,
            cfgscale: 6,
        },
        tags: ['core', 'cinematic', 'wide'],
        createdAt: starterRecipeTimestamp,
        updatedAt: starterRecipeTimestamp,
    },
    {
        id: 'recipe-product-object-render',
        name: 'Product / Object Render',
        description: 'Clean subject presentation with sharp detail and controlled background.',
        mode: 'advanced',
        promptTemplate: 'commercial product render, clean background, sharp focus, studio lighting',
        params: {
            width: 1024,
            height: 1024,
            steps: 30,
            cfgscale: 5.5,
        },
        tags: ['core', 'product', 'object', 'studio'],
        createdAt: starterRecipeTimestamp,
        updatedAt: starterRecipeTimestamp,
    },
    {
        id: 'recipe-photoreal',
        name: 'Photoreal',
        description: 'Camera-like realism with restrained style language.',
        mode: 'advanced',
        promptTemplate: 'photorealistic, natural lighting, realistic textures, detailed photography',
        params: {
            width: 1024,
            height: 1024,
            steps: 30,
            cfgscale: 5,
        },
        tags: ['style', 'photoreal', 'realistic'],
        createdAt: starterRecipeTimestamp,
        updatedAt: starterRecipeTimestamp,
    },
    {
        id: 'recipe-anime-cel',
        name: 'Anime / Cel',
        description: 'Clean linework and cel-shaded character-friendly defaults.',
        mode: 'guided',
        promptTemplate: 'anime artwork, cel shading, clean linework, vibrant colors',
        params: {
            width: 1024,
            height: 1024,
            steps: 25,
            cfgscale: 7,
        },
        tags: ['style', 'anime', 'cel'],
        createdAt: starterRecipeTimestamp,
        updatedAt: starterRecipeTimestamp,
    },
    {
        id: 'recipe-painterly-concept-art',
        name: 'Painterly / Concept Art',
        description: 'Stylized composition-heavy setup for painterly or game-art direction.',
        mode: 'guided',
        promptTemplate: 'concept art, painterly digital painting, strong composition, expressive brushwork',
        params: {
            width: 1216,
            height: 832,
            steps: 30,
            cfgscale: 7,
        },
        tags: ['style', 'painterly', 'concept-art'],
        createdAt: starterRecipeTimestamp,
        updatedAt: starterRecipeTimestamp,
    },
    {
        id: 'recipe-graphic-logo',
        name: 'Graphic / Logo-ish',
        description: 'Simple shapes and clean presentation for graphic design-style output.',
        mode: 'quick',
        promptTemplate: 'clean graphic design, simple shapes, bold composition, minimal background',
        params: {
            width: 1024,
            height: 1024,
            steps: 20,
            cfgscale: 7.5,
        },
        tags: ['style', 'graphic', 'logo'],
        createdAt: starterRecipeTimestamp,
        updatedAt: starterRecipeTimestamp,
    }
];

const replacedStarterRecipeIds = new Set<string>([
    'recipe-portrait-fast',
    'recipe-illustration-guided',
    'recipe-cinematic-film',
    'recipe-anime-cel',
    'recipe-anime-shoujo',
    'recipe-nsfw-pinup',
    'recipe-nsfw-boudoir',
    'recipe-nsfw-gravure',
    'recipe-nsfw-hentai-classic',
    'recipe-nsfw-erotic-art',
    'recipe-nsfw-latex',
    'recipe-anime-mecha',
    'recipe-3d-octane',
    'recipe-concept-environment',
    'recipe-product-studio',
    'recipe-arch-viz',
    'recipe-dark-fantasy',
    'recipe-cyberpunk',
    'recipe-macro-photo',
    'recipe-watercolor',
    'recipe-pixel-art',
    'recipe-neon-synthwave',
    'recipe-claymation',
    'recipe-fantasy-romance',
    'recipe-vintage-polaroid',
    'recipe-street-photography',
    'recipe-pop-art',
    'recipe-oil-impasto',
    'recipe-line-art',
    'recipe-origami-paper',
]);

const starterRecipeIds = new Set<string>(starterRecipes.map((recipe) => recipe.id));

function generateRecipeId(): string {
    return `recipe-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export const useGenerationProductStore = create<GenerationProductState>()(
    persist(
        (set, get) => ({
            currentMode: 'advanced',
            activeRecipeId: null,
            recipes: starterRecipes,
            lastSnapshot: null,
            lastIssues: [],
            comparison: null,

            setCurrentMode: (mode) => set({ currentMode: mode }),

            saveRecipe: (input) => {
                const id = generateRecipeId();
                const recipe: GenerationRecipe = {
                    id,
                    name: input.name,
                    description: input.description,
                    mode: input.mode,
                    params: input.params,
                    promptTemplate: input.promptTemplate,
                    tags: input.tags ?? [],
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                };

                set((state) => ({
                    recipes: [recipe, ...state.recipes],
                    activeRecipeId: id,
                }));

                return id;
            },

            applyRecipe: (recipeId) => {
                const recipe = get().recipes.find((item) => item.id === recipeId) ?? null;
                if (recipe) {
                    set({
                        activeRecipeId: recipe.id,
                        currentMode: recipe.mode,
                    });
                }
                return recipe;
            },

            setActiveRecipe: (recipeId) => set({ activeRecipeId: recipeId }),

            captureSnapshot: (snapshot) => set({ lastSnapshot: snapshot }),

            clearSnapshot: () => set({ lastSnapshot: null }),

            setIssues: (issues) => set({ lastIssues: issues }),

            setComparison: (comparison) => set({ comparison }),
        }),
        {
            name: 'swarmui-generation-product',
            storage: createJSONStorage(() => createIndexedDbStorage('swarmui-generation-product')),
            version: 3,
            migrate: (persistedState: unknown, version: number) => {
                const state = typeof persistedState === 'object' && persistedState !== null
                    ? { ...persistedState } as Partial<GenerationProductState>
                    : {};
                if (version < 3 || !version) {
                    const existingRecipes = state.recipes || [];
                    const customRecipes = existingRecipes.filter((recipe) => (
                        !replacedStarterRecipeIds.has(recipe.id) && !starterRecipeIds.has(recipe.id)
                    ));
                    state.recipes = [...starterRecipes, ...customRecipes];
                    if (state.activeRecipeId && replacedStarterRecipeIds.has(state.activeRecipeId)) {
                        state.activeRecipeId = null;
                    }
                }
                return state;
            },
            partialize: (state) => ({
                currentMode: state.currentMode,
                activeRecipeId: state.activeRecipeId,
                recipes: state.recipes,
                lastSnapshot: state.lastSnapshot,
                comparison: state.comparison,
            }),
        }
    )
);
