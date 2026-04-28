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

const starterRecipes: GenerationRecipe[] = [
    {
        id: 'recipe-portrait-fast',
        name: 'Portrait Sprint',
        description: 'Quick portrait recipe for fast exploration.',
        mode: 'quick',
        promptTemplate: 'portrait photography, cinematic lighting',
        params: {
            width: 768,
            height: 1024,
            steps: 18,
            cfgscale: 6.5,
        },
        tags: ['portrait', 'fast-start'],
        createdAt: Date.now(),
        updatedAt: Date.now(),
    },
    {
        id: 'recipe-illustration-guided',
        name: 'Illustration Builder',
        description: 'Guided illustration setup with room for style blocks.',
        mode: 'guided',
        promptTemplate: 'detailed illustration, strong silhouette, clean composition',
        params: {
            width: 1024,
            height: 1024,
            steps: 24,
            cfgscale: 7,
        },
        tags: ['illustration', 'guided'],
        createdAt: Date.now(),
        updatedAt: Date.now(),
    },
    {
        id: 'recipe-cinematic-film',
        name: 'Cinematic Film',
        description: 'Atmospheric and highly detailed cinematic composition.',
        mode: 'advanced',
        promptTemplate: 'cinematic film still, 35mm, highly detailed, dramatic lighting, depth of field',
        params: {
            width: 1280,
            height: 720,
            steps: 30,
            cfgscale: 6,
        },
        tags: ['cinematic', 'realistic', '16:9'],
        createdAt: Date.now(),
        updatedAt: Date.now(),
    },
    {
        id: 'recipe-anime-cel',
        name: 'Anime Studio',
        description: 'Clean cel-shaded anime style with vibrant colors.',
        mode: 'guided',
        promptTemplate: 'anime artwork, cel shading, studio ghibli style, vibrant colors, highly detailed',
        params: {
            width: 1024,
            height: 1024,
            steps: 25,
            cfgscale: 7,
        },
        tags: ['anime', 'illustration'],
        createdAt: Date.now(),
        updatedAt: Date.now(),
    },
    {
        id: 'recipe-anime-shoujo',
        name: 'Shoujo Manga',
        description: 'Soft, ethereal, and emotive retro shoujo manga style.',
        mode: 'guided',
        promptTemplate: 'retro shoujo manga style, 90s anime aesthetic, soft pastel colors, sparkling eyes, emotional, highly detailed, watercolor wash',
        params: {
            width: 832,
            height: 1216,
            steps: 25,
            cfgscale: 6,
        },
        tags: ['anime', 'retro', 'shoujo', 'character'],
        createdAt: Date.now(),
        updatedAt: Date.now(),
    },
    {
        id: 'recipe-nsfw-pinup',
        name: 'Vintage Pin-Up',
        description: 'Classic 1950s pin-up art style, tasteful and expressive.',
        mode: 'advanced',
        promptTemplate: 'Gil Elvgren style vintage pin-up art, 1950s aesthetic, cheeky, expressive pose, retro illustration, highly detailed painted style',
        params: {
            width: 832,
            height: 1216,
            steps: 30,
            cfgscale: 6.5,
        },
        tags: ['nsfw', 'pin-up', 'vintage', 'illustration'],
        createdAt: Date.now(),
        updatedAt: Date.now(),
    },
    {
        id: 'recipe-nsfw-boudoir',
        name: 'Boudoir Photography',
        description: 'Intimate and moody boudoir photography style.',
        mode: 'advanced',
        promptTemplate: 'intimate boudoir photography, soft moody lighting, dramatic shadows, realistic textures, highly detailed, sensual atmosphere',
        params: {
            width: 832,
            height: 1216,
            steps: 35,
            cfgscale: 5,
        },
        tags: ['nsfw', 'photography', 'realistic', 'boudoir'],
        createdAt: Date.now(),
        updatedAt: Date.now(),
    },
    {
        id: 'recipe-nsfw-gravure',
        name: 'Idol Gravure',
        description: 'Bright and colorful Japanese idol gravure photography style.',
        mode: 'guided',
        promptTemplate: 'japanese photobook, gravure idol, beach swimsuit, bright sunlight, soft skin rendering, beautiful lighting, highly detailed photography, expressive pose',
        params: {
            width: 832,
            height: 1216,
            steps: 30,
            cfgscale: 6,
        },
        tags: ['nsfw', 'gravure', 'photography', 'idol'],
        createdAt: Date.now(),
        updatedAt: Date.now(),
    },
    {
        id: 'recipe-nsfw-hentai-classic',
        name: 'Classic Hentai',
        description: 'Traditional 90s/00s anime hentai aesthetic.',
        mode: 'quick',
        promptTemplate: '90s anime hentai style, classic adult anime, cel shading, expressive character design, detailed linework, stylized anatomy',
        params: {
            width: 832,
            height: 1216,
            steps: 25,
            cfgscale: 7.5,
        },
        tags: ['nsfw', 'anime', 'hentai', 'retro'],
        createdAt: Date.now(),
        updatedAt: Date.now(),
    },
    {
        id: 'recipe-nsfw-erotic-art',
        name: 'Erotic Oil Painting',
        description: 'Classically painted erotic fine art.',
        mode: 'advanced',
        promptTemplate: 'erotic oil painting, classical fine art style, renaissance lighting, masterful brushwork, sensual, highly detailed canvas texture',
        params: {
            width: 1024,
            height: 1024,
            steps: 40,
            cfgscale: 5.5,
        },
        tags: ['nsfw', 'art', 'traditional', 'painting'],
        createdAt: Date.now(),
        updatedAt: Date.now(),
    },
    {
        id: 'recipe-nsfw-latex',
        name: 'Latex & Leather',
        description: 'Focus on high-gloss latex, leather, and alternative fashion.',
        mode: 'advanced',
        promptTemplate: 'alternative fashion photoshoot, shiny black latex, tight leather, high gloss reflections, dramatic studio lighting, professional photography, hyper-realistic materials',
        params: {
            width: 832,
            height: 1216,
            steps: 35,
            cfgscale: 6,
        },
        tags: ['nsfw', 'fashion', 'latex', 'realistic'],
        createdAt: Date.now(),
        updatedAt: Date.now(),
    },
    {
        id: 'recipe-anime-mecha',
        name: 'Mecha Pilot',
        description: 'Highly detailed 80s/90s mecha anime aesthetic.',
        mode: 'guided',
        promptTemplate: '80s mecha anime style, detailed mechanical design, glowing thrusters, action pose, cel shaded, sci-fi battlefield',
        params: {
            width: 1280,
            height: 720,
            steps: 28,
            cfgscale: 7.5,
        },
        tags: ['anime', 'mecha', 'scifi', 'retro'],
        createdAt: Date.now(),
        updatedAt: Date.now(),
    },
    {
        id: 'recipe-3d-octane',
        name: '3D Masterpiece',
        description: 'High-end 3D render style akin to Octane or Unreal Engine.',
        mode: 'advanced',
        promptTemplate: '3D render, octane render, unreal engine 5, ray tracing, physically based rendering, ultra detailed',
        params: {
            width: 1024,
            height: 1024,
            steps: 35,
            cfgscale: 5.5,
        },
        tags: ['3d', 'octane', 'realistic'],
        createdAt: Date.now(),
        updatedAt: Date.now(),
    },
    {
        id: 'recipe-concept-environment',
        name: 'Concept Environment',
        description: 'Epic landscape and environment concept art.',
        mode: 'guided',
        promptTemplate: 'epic environment concept art, digital painting, majestic, breathtaking, atmospheric',
        params: {
            width: 1280,
            height: 720,
            steps: 25,
            cfgscale: 6.5,
        },
        tags: ['concept', 'environment', 'landscape'],
        createdAt: Date.now(),
        updatedAt: Date.now(),
    },
    {
        id: 'recipe-product-studio',
        name: 'Product Photography',
        description: 'Clean, studio-lit commercial product photography.',
        mode: 'advanced',
        promptTemplate: 'commercial product photography, studio lighting, clean background, sharp focus, high resolution',
        params: {
            width: 1024,
            height: 1024,
            steps: 30,
            cfgscale: 5,
        },
        tags: ['product', 'studio', 'realistic'],
        createdAt: Date.now(),
        updatedAt: Date.now(),
    },
    {
        id: 'recipe-arch-viz',
        name: 'Architectural Viz',
        description: 'Realistic architectural exterior/interior rendering.',
        mode: 'advanced',
        promptTemplate: 'architectural visualization, modern architecture, photorealistic, elegant lighting, clear sky',
        params: {
            width: 1280,
            height: 720,
            steps: 35,
            cfgscale: 6,
        },
        tags: ['architecture', 'exterior', 'realistic'],
        createdAt: Date.now(),
        updatedAt: Date.now(),
    },
    {
        id: 'recipe-dark-fantasy',
        name: 'Dark Fantasy',
        description: 'Gothic and atmospheric dark fantasy character or scene.',
        mode: 'guided',
        promptTemplate: 'dark fantasy art, gothic, moody lighting, highly detailed, expressive',
        params: {
            width: 832,
            height: 1216,
            steps: 28,
            cfgscale: 7,
        },
        tags: ['fantasy', 'dark', 'character'],
        createdAt: Date.now(),
        updatedAt: Date.now(),
    },
    {
        id: 'recipe-cyberpunk',
        name: 'Cyberpunk Streets',
        description: 'Neon-drenched sci-fi and cyberpunk aesthetics.',
        mode: 'guided',
        promptTemplate: 'cyberpunk city street, neon lights, rainy night, futuristic, sci-fi concept art',
        params: {
            width: 1280,
            height: 720,
            steps: 26,
            cfgscale: 7.5,
        },
        tags: ['scifi', 'cyberpunk', 'environment'],
        createdAt: Date.now(),
        updatedAt: Date.now(),
    },
    {
        id: 'recipe-macro-photo',
        name: 'Macro Wonders',
        description: 'Extreme close-up photography with shallow depth of field.',
        mode: 'advanced',
        promptTemplate: 'macro photography, extreme close up, bokeh, highly detailed, sharp focus on subject',
        params: {
            width: 1024,
            height: 1024,
            steps: 30,
            cfgscale: 6,
        },
        tags: ['macro', 'photography', 'nature'],
        createdAt: Date.now(),
        updatedAt: Date.now(),
    },
    {
        id: 'recipe-watercolor',
        name: 'Watercolor Dream',
        description: 'Soft and expressive traditional watercolor painting.',
        mode: 'quick',
        promptTemplate: 'watercolor painting, expressive brush strokes, soft edges, dreamy atmosphere, traditional media',
        params: {
            width: 1024,
            height: 1024,
            steps: 20,
            cfgscale: 7,
        },
        tags: ['traditional', 'watercolor'],
        createdAt: Date.now(),
        updatedAt: Date.now(),
    },
    {
        id: 'recipe-pixel-art',
        name: 'Retro Pixel Art',
        description: 'Nostalgic 16-bit era pixel art style.',
        mode: 'quick',
        promptTemplate: '16-bit pixel art, retro gaming style, clean pixels, limited palette',
        params: {
            width: 1024,
            height: 1024,
            steps: 20,
            cfgscale: 8,
        },
        tags: ['retro', 'pixel', 'gaming'],
        createdAt: Date.now(),
        updatedAt: Date.now(),
    },
    {
        id: 'recipe-neon-synthwave',
        name: 'Neon Synthwave',
        description: 'Vibrant 80s retro-futuristic vaporwave aesthetic.',
        mode: 'guided',
        promptTemplate: 'synthwave, vaporwave, retro 80s aesthetic, neon grid, glowing colors, vector art',
        params: {
            width: 1280,
            height: 720,
            steps: 24,
            cfgscale: 6.5,
        },
        tags: ['vaporwave', 'neon', '80s'],
        createdAt: Date.now(),
        updatedAt: Date.now(),
    },
    {
        id: 'recipe-claymation',
        name: 'Playful Claymation',
        description: 'Cute and tactile stop-motion clay animation style.',
        mode: 'guided',
        promptTemplate: 'claymation, stop motion animation style, plasticine, tactile, cute, studio lighting',
        params: {
            width: 1024,
            height: 1024,
            steps: 25,
            cfgscale: 6.5,
        },
        tags: ['3d', 'clay', 'style'],
        createdAt: Date.now(),
        updatedAt: Date.now(),
    },
    {
        id: 'recipe-fantasy-romance',
        name: 'Fantasy Romance',
        description: 'High-fantasy book cover aesthetic, dramatic and romantic.',
        mode: 'advanced',
        promptTemplate: 'high fantasy romance book cover, lush magical forest, dramatic lighting, detailed characters, muscular barbarian, elven romance, glowing magical atmosphere, epic composition',
        params: {
            width: 832,
            height: 1216,
            steps: 35,
            cfgscale: 6.5,
        },
        tags: ['nsfw', 'fantasy', 'romance', 'illustration'],
        createdAt: Date.now(),
        updatedAt: Date.now(),
    },
    {
        id: 'recipe-vintage-polaroid',
        name: 'Vintage Polaroid',
        description: 'Lo-fi, nostalgic aesthetic with light leaks and film grain.',
        mode: 'guided',
        promptTemplate: 'vintage polaroid photo, 1990s aesthetic, light leaks, heavy film grain, washed out colors, soft focus, nostalgic atmosphere, candid shot',
        params: {
            width: 1024,
            height: 1024,
            steps: 20,
            cfgscale: 6,
        },
        tags: ['photography', 'vintage', 'lofi', 'polaroid'],
        createdAt: Date.now(),
        updatedAt: Date.now(),
    },
    {
        id: 'recipe-street-photography',
        name: 'Urban Street Photo',
        description: 'Candid, gritty, urban documentary-style photography.',
        mode: 'advanced',
        promptTemplate: 'raw street photography, busy urban intersection, neon lights reflecting on wet pavement, candid, documentary style, fuji sensia, highly detailed, realistic',
        params: {
            width: 1024,
            height: 1024,
            steps: 30,
            cfgscale: 5,
        },
        tags: ['photography', 'street', 'urban', 'realistic'],
        createdAt: Date.now(),
        updatedAt: Date.now(),
    },
    {
        id: 'recipe-pop-art',
        name: 'Pop Art Comic',
        description: 'Bold, high-contrast flat color style with halftone patterns.',
        mode: 'quick',
        promptTemplate: 'pop art illustration, roy lichtenstein style, western comic book art, bold black outlines, vibrant flat colors, halftone dot pattern, dramatic expression',
        params: {
            width: 1024,
            height: 1024,
            steps: 20,
            cfgscale: 7.5,
        },
        tags: ['illustration', 'comic', 'pop-art', 'retro'],
        createdAt: Date.now(),
        updatedAt: Date.now(),
    },
    {
        id: 'recipe-oil-impasto',
        name: 'Thick Oil Painting',
        description: 'Heavy, thick brushstroke painting style with 3D texture.',
        mode: 'guided',
        promptTemplate: 'oil impasto painting, heavy thick palette knife strokes, thick physical paint texture, expressive, vibrant color mix, traditional art gallery piece',
        params: {
            width: 1024,
            height: 1024,
            steps: 30,
            cfgscale: 7,
        },
        tags: ['painting', 'traditional', 'art', 'texture'],
        createdAt: Date.now(),
        updatedAt: Date.now(),
    },
    {
        id: 'recipe-line-art',
        name: 'Clean Line Art',
        description: 'Clean sketch, ink drawing, or technical blueprint style.',
        mode: 'quick',
        promptTemplate: 'monochrome line art, clean precise ink drawing, detailed hatching, white background, technical illustration style, minimalist sketch',
        params: {
            width: 1024,
            height: 1024,
            steps: 18,
            cfgscale: 8,
        },
        tags: ['illustration', 'monochrome', 'sketch', 'line-art'],
        createdAt: Date.now(),
        updatedAt: Date.now(),
    },
    {
        id: 'recipe-origami-paper',
        name: 'Origami Papercraft',
        description: '3D style crafted from folded paper or cardboard cutouts.',
        mode: 'guided',
        promptTemplate: 'intricate origami papercraft, 3d scene made entirely of folded paper, layered cardboard cutouts, soft studio lighting, macro photography of paper art, highly detailed textures',
        params: {
            width: 1024,
            height: 1024,
            steps: 25,
            cfgscale: 6.5,
        },
        tags: ['3d', 'craft', 'paper', 'style'],
        createdAt: Date.now(),
        updatedAt: Date.now(),
    }
];

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
            version: 2,
            migrate: (persistedState: unknown, version: number) => {
                const state = typeof persistedState === 'object' && persistedState !== null
                    ? { ...persistedState } as Partial<GenerationProductState>
                    : {};
                if (version < 2 || !version) {
                    const existingRecipes = state.recipes || [];
                    const existingRecipeIds = new Set(existingRecipes.map((recipe) => recipe.id));
                    const newStarters = starterRecipes.filter((r) => !existingRecipeIds.has(r.id));
                    state.recipes = [...newStarters, ...existingRecipes];
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
