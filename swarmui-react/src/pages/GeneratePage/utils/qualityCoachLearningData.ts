import type { GenerateParams } from '../../../api/types';
import type { QualityCoachSeverity } from './qualityCoach';

export type LearningDifficulty = 'beginner' | 'intermediate' | 'advanced';
export type MatrixBand = 'low' | 'mid' | 'high';

export interface QualityCoachParameterGuide {
    key: string;
    title: string;
    expandedName: string;
    description: string;
    sweetSpot: string;
    defaultStartingPoint: string;
    typicalRange: string;
    aliases?: string[];
    difficulty: LearningDifficulty;
    effects: Array<{
        range: string;
        visualResult: string;
    }>;
    teachingPoints: string[];
}

export interface QualityCoachFailureMode {
    id: string;
    name: string;
    term: string;
    severity: QualityCoachSeverity;
    whatItMeans: string;
    likelyCauses: string[];
    fix: string;
    symptomTags: string[];
    difficulty: LearningDifficulty;
}

export interface QualityCoachRecipe {
    id: string;
    name: string;
    goal: string;
    notes: string;
    difficulty: LearningDifficulty;
    params: Partial<GenerateParams>;
}

export interface QualityCoachDiagnosticSymptom {
    id: string;
    label: string;
}

export interface QualityCoachMatrixCell {
    cfgBand: MatrixBand;
    stepsBand: MatrixBand;
    title: string;
    description: string;
    severity: QualityCoachSeverity;
}

export const QUALITY_COACH_PARAMETER_GUIDES: QualityCoachParameterGuide[] = [
    {
        key: 'cfgscale',
        title: 'CFG Scale',
        expandedName: 'Classifier-Free Guidance',
        description: 'Controls how aggressively the model tries to match your prompt. Higher values make the model listen harder; lower values give it more freedom.',
        sweetSpot: 'SDXL / Illustrious sweet spot: CFG 5.0-8.0',
        defaultStartingPoint: 'Start around CFG 7.0',
        typicalRange: 'Typical range: 1.0-30.0',
        difficulty: 'beginner',
        effects: [
            {
                range: 'CFG 1.0-3.0',
                visualResult: 'Soft, dreamy, muted, and often loose with prompt details.',
            },
            {
                range: 'CFG 4.0-6.0',
                visualResult: 'Balanced creativity and prompt adherence with natural colours.',
            },
            {
                range: 'CFG 7.0-9.0',
                visualResult: 'Sharper details, stronger prompt adherence, vivid colours.',
            },
            {
                range: 'CFG 10.0-15.0',
                visualResult: 'Oversaturation, harsh contrast, distorted fine detail, and crunchy textures.',
            },
            {
                range: 'CFG 15.0-30.0',
                visualResult: 'Severe artifacts, banding, background chaos, and warped faces.',
            },
        ],
        teachingPoints: [
            'The right CFG depends on both sampler and step count.',
            'Illustrious-family anime models often prefer slightly lower CFG than base SDXL.',
            'High CFG is one of the fastest ways to produce an overbaked or deep-fried image.',
        ],
    },
    {
        key: 'steps',
        title: 'Sampling Steps',
        expandedName: 'Sampling Steps',
        description: 'Each step is another refinement pass from noise toward the prompt. More steps add refinement until returns diminish.',
        sweetSpot: 'SDXL / Illustrious sweet spot: 20-35 steps',
        defaultStartingPoint: 'Start around 28 steps',
        typicalRange: 'Typical range: 1-150',
        difficulty: 'beginner',
        effects: [
            {
                range: 'Steps 1-5',
                visualResult: 'Blurry blobs and barely recognisable shapes.',
            },
            {
                range: 'Steps 6-15',
                visualResult: 'Basic structure but soft details and undercooked faces.',
            },
            {
                range: 'Steps 16-25',
                visualResult: 'Good quality for many uses with detail starting to lock in.',
            },
            {
                range: 'Steps 25-40',
                visualResult: 'Peak quality zone for many SDXL samplers.',
            },
            {
                range: 'Steps 40+',
                visualResult: 'Diminishing returns, more time cost, and possible drift or drying-out artifacts.',
            },
        ],
        teachingPoints: [
            'Steps and CFG must be taught together because they multiply each other.',
            'High CFG + low steps often gives a harsh unfinished image.',
            'High CFG + high steps is the classic deep-fried combination.',
        ],
    },
    {
        key: 'sampler',
        title: 'Sampler',
        expandedName: 'Sampling Method',
        description: 'The sampler decides how each denoising step is taken. Some converge quickly, some stay stochastic and exploratory.',
        sweetSpot: 'For SDXL / Illustrious, DPM++ 2M Karras is a strong default',
        defaultStartingPoint: 'Try DPM++ 2M with Karras scheduler',
        typicalRange: 'Common families: Euler, Euler a, DPM++ 2M, DPM++ SDE, UniPC, DDIM',
        difficulty: 'intermediate',
        effects: [
            {
                range: 'Fast / convergent',
                visualResult: 'Efficient, stable results in fewer steps.',
            },
            {
                range: 'Ancestral / stochastic',
                visualResult: 'More randomness, more variation, less convergence.',
            },
            {
                range: 'High-step samplers',
                visualResult: 'Can be excellent, but only if you give them enough passes.',
            },
        ],
        teachingPoints: [
            'Changing the sampler with the same seed still changes the image.',
            'Euler a is great for exploration, not for exact iterative matching.',
            'Aggressive samplers amplify high-CFG failure modes faster.',
        ],
    },
    {
        key: 'scheduler',
        title: 'Scheduler',
        expandedName: 'Noise Schedule',
        description: 'Controls how much denoising work happens early versus late in the process.',
        sweetSpot: 'Karras is the safest default for SDXL / Illustrious workflows',
        defaultStartingPoint: 'Try Karras unless a model or sampler strongly suggests otherwise',
        typicalRange: 'Normal, Karras, Exponential, SGM Uniform',
        difficulty: 'intermediate',
        effects: [
            {
                range: 'Normal',
                visualResult: 'Even work across the whole denoising run.',
            },
            {
                range: 'Karras',
                visualResult: 'Cleaner results with more useful early denoising and gentle fine-tuning later.',
            },
            {
                range: 'Exponential / aggressive',
                visualResult: 'Sharper early results that can miss subtle finishing detail.',
            },
        ],
        teachingPoints: [
            'Scheduler differences are subtler than sampler differences, but they still matter.',
            'Karras is the safest first pick for SDXL-style models.',
        ],
    },
    {
        key: 'resolution',
        title: 'Resolution',
        expandedName: 'Resolution and Aspect Ratio',
        description: 'Models are trained around native canvas sizes. Larger or stranger canvases can break composition instead of improving quality.',
        sweetSpot: 'SDXL native: 1024x1024 with about one megapixel total area',
        defaultStartingPoint: 'Generate near native size and upscale after',
        typicalRange: 'Common SDXL safe sizes include 1024x1024, 896x1152, 1152x896, 768x1344, 1344x768',
        difficulty: 'intermediate',
        effects: [
            {
                range: 'Too low',
                visualResult: 'Muddy details and painted-over features.',
            },
            {
                range: 'Native-ish',
                visualResult: 'Reliable anatomy, composition, and detail.',
            },
            {
                range: 'Too high or too extreme',
                visualResult: 'Double heads, repeated subjects, tiling, or warped anatomy.',
            },
        ],
        teachingPoints: [
            'Generate near native size first, then upscale.',
            '2048x2048 is not a quality shortcut for SDXL-family models.',
        ],
    },
    {
        key: 'initimagecreativity',
        title: 'Denoise Strength',
        expandedName: 'Denoise Strength for img2img and inpainting',
        description: 'Controls how much of the original image remains when doing img2img or inpainting.',
        sweetSpot: 'General sweet spot: 0.3-0.7',
        defaultStartingPoint: 'Start around 0.45-0.55 for controlled edits',
        typicalRange: 'Typical range: 0.0-1.0',
        aliases: ['Creativity'],
        difficulty: 'advanced',
        effects: [
            {
                range: '0.0-0.2',
                visualResult: 'Very subtle changes, often barely noticeable.',
            },
            {
                range: '0.3-0.5',
                visualResult: 'Structure preserved, details and style change cleanly.',
            },
            {
                range: '0.5-0.7',
                visualResult: 'Major changes while still keeping broad composition.',
            },
            {
                range: '0.7-1.0',
                visualResult: 'Near full regeneration with weak source retention.',
            },
        ],
        teachingPoints: [
            'High denoise turns img2img into almost txt2img with a colour guide.',
            'Low denoise can look like the prompt was ignored because the source dominates.',
        ],
    },
    {
        key: 'clipstopatlayer',
        title: 'CLIP Skip',
        expandedName: 'Contrastive Language-Image Pre-training skip',
        description: 'Changes how the text encoder interprets the prompt. Higher skip values make the interpretation broader and less literal.',
        sweetSpot: 'SDXL base often prefers -1, Illustrious / anime often prefers -2',
        defaultStartingPoint: 'Use -1 for SDXL realism, -2 for Illustrious/anime-style models',
        typicalRange: 'Typical SwarmUI range: -1 to about -4',
        aliases: ['CLIP Stop At Layer'],
        difficulty: 'advanced',
        effects: [
            {
                range: '-1',
                visualResult: 'Most literal prompt interpretation.',
            },
            {
                range: '-2',
                visualResult: 'More vibe-driven interpretation, often useful for anime-style finetunes.',
            },
            {
                range: '-3 and below',
                visualResult: 'Prompt specifics start getting lost or mushy.',
            },
        ],
        teachingPoints: [
            'Illustrious-family models often work better at clip skip 2 than base SDXL defaults.',
            'Extreme clip skip can make prompts less reliable rather than more powerful.',
        ],
    },
    {
        key: 'vae',
        title: 'VAE',
        expandedName: 'Variational Autoencoder',
        description: 'The VAE converts latent output into actual image colours. A mismatched or poor VAE can make an otherwise good image look washed out or broken.',
        sweetSpot: 'Use the VAE recommended by the model author, or a strong SDXL VAE for SDXL-family models',
        defaultStartingPoint: 'Stay with the model-recommended VAE unless colours look wrong',
        typicalRange: 'Model-dependent',
        difficulty: 'advanced',
        effects: [
            {
                range: 'Good match',
                visualResult: 'Healthy colours and clean gradients.',
            },
            {
                range: 'Mismatch',
                visualResult: 'Grey, washed-out, shifted, or sometimes black output.',
            },
        ],
        teachingPoints: [
            'Washed-out images are not always caused by CFG; VAE mismatch can be the real culprit.',
            'If colours suddenly look wrong, check the VAE before chasing sampler tweaks.',
        ],
    },
];

export const QUALITY_COACH_MATRIX: QualityCoachMatrixCell[] = [
    {
        cfgBand: 'low',
        stepsBand: 'low',
        title: 'Blurry mush',
        description: 'Low CFG and low steps usually produce a raw, weakly guided image that barely locks onto the prompt.',
        severity: 'high-risk',
    },
    {
        cfgBand: 'mid',
        stepsBand: 'low',
        title: 'Half-baked',
        description: 'The image has structure, but it does not have enough passes to fully resolve details cleanly.',
        severity: 'caution',
    },
    {
        cfgBand: 'high',
        stepsBand: 'low',
        title: 'Burnt outside, raw inside',
        description: 'High CFG with too few steps forces the prompt hard without enough time to resolve it, causing harsh noisy unfinished results.',
        severity: 'high-risk',
    },
    {
        cfgBand: 'low',
        stepsBand: 'mid',
        title: 'Dreamy and soft',
        description: 'The image can look smooth and artistic, but may drift from the prompt or feel too generic.',
        severity: 'caution',
    },
    {
        cfgBand: 'mid',
        stepsBand: 'mid',
        title: 'Sweet spot',
        description: 'This is the balanced zone for SDXL / Illustrious workflows: prompt adherence, clean detail, and reliable colours.',
        severity: 'balanced',
    },
    {
        cfgBand: 'high',
        stepsBand: 'mid',
        title: 'Starting to overbake',
        description: 'Prompt adherence is strong, but colours and edges can start to become harsh or crunchy.',
        severity: 'caution',
    },
    {
        cfgBand: 'low',
        stepsBand: 'high',
        title: 'Smooth but drifting',
        description: 'The image can look polished, but the prompt may feel diluted or generic by the end of the run.',
        severity: 'caution',
    },
    {
        cfgBand: 'mid',
        stepsBand: 'high',
        title: 'Overheld',
        description: 'The image may still look good, but the extra time adds less value and can start drying the result out.',
        severity: 'caution',
    },
    {
        cfgBand: 'high',
        stepsBand: 'high',
        title: 'Deep-fried',
        description: 'Maximum overbaking risk: severe artifacts, colour banding, distorted faces, and hard noisy detail.',
        severity: 'high-risk',
    },
];

export const QUALITY_COACH_FAILURE_MODES: QualityCoachFailureMode[] = [
    {
        id: 'overbaked',
        name: 'Overbaked',
        term: 'Overbaked',
        severity: 'caution',
        whatItMeans: 'Oversaturated colours, harsh contrast, and crunchy-looking textures.',
        likelyCauses: ['CFG above 10', 'CFG above 8 with a detail-heavy sampler', 'Too much prompt forcing for the chosen model'],
        fix: 'Reduce CFG into the 5-8 range first. If it still looks harsh, lower steps or switch to a gentler sampler.',
        symptomTags: ['overbaked', 'crunchy', 'oversaturated', 'harsh contrast'],
        difficulty: 'beginner',
    },
    {
        id: 'deep-fried',
        name: 'Deep Fried',
        term: 'Deep-fried',
        severity: 'high-risk',
        whatItMeans: 'Extreme version of overbaked: noisy, grainy, neon colours, artifact-heavy details.',
        likelyCauses: ['High CFG plus high steps', 'High CFG plus aggressive or ancestral sampler', 'Sampler noise stacked with strong prompt forcing'],
        fix: 'Cut CFG sharply, reduce steps, and avoid ancestral samplers until the image returns to a balanced state.',
        symptomTags: ['deep-fried', 'neon', 'grainy', 'crunchy', 'colour banding'],
        difficulty: 'beginner',
    },
    {
        id: 'mushy',
        name: 'Mushy / Undercooked',
        term: 'Mushy',
        severity: 'high-risk',
        whatItMeans: 'Blurry, undefined, and melted-looking features with weak edges.',
        likelyCauses: ['Too few steps', 'CFG too low', 'Low steps plus low CFG together'],
        fix: 'Raise steps first. If the prompt is still being ignored, raise CFG into the mid range.',
        symptomTags: ['mushy', 'undercooked', 'blurry', 'soft', 'unfinished'],
        difficulty: 'beginner',
    },
    {
        id: 'washed-out',
        name: 'Washed Out',
        term: 'Washed out',
        severity: 'caution',
        whatItMeans: 'Low contrast, pale colours, and flat-looking output.',
        likelyCauses: ['CFG below about 3', 'Wrong or weak VAE', 'Prompt drift from very low guidance'],
        fix: 'Raise CFG into a healthier range. If colours still look grey, test the model-recommended VAE.',
        symptomTags: ['washed out', 'grey', 'flat', 'pale'],
        difficulty: 'advanced',
    },
    {
        id: 'melted-faces',
        name: 'Melted Faces',
        term: 'Melted faces',
        severity: 'high-risk',
        whatItMeans: 'Asymmetric or uncanny faces with melted-looking features.',
        likelyCauses: ['High CFG', 'Wrong resolution or extreme aspect ratio', 'Model limitations in complex scenes'],
        fix: 'Reduce CFG, return to a safer native-ish resolution, and simplify the composition if needed.',
        symptomTags: ['melted faces', 'warped face', 'uncanny', 'distorted face'],
        difficulty: 'intermediate',
    },
    {
        id: 'double-vision',
        name: 'Double Vision',
        term: 'Double head / extra limbs',
        severity: 'high-risk',
        whatItMeans: 'Duplicated subjects, extra limbs, mirrored bodies, or repeated features.',
        likelyCauses: ['Resolution too high', 'Conflicting prompt instructions', 'Crowded composition'],
        fix: 'Return to a safer SDXL-native canvas and simplify the prompt structure before upscaling later.',
        symptomTags: ['double head', 'extra limbs', 'duplicated subject', 'double vision'],
        difficulty: 'intermediate',
    },
    {
        id: 'tiling',
        name: 'Tiling / Repeating Patterns',
        term: 'Tiling',
        severity: 'high-risk',
        whatItMeans: 'Backgrounds or textures repeat like wallpaper instead of staying coherent.',
        likelyCauses: ['Resolution far above training resolution', 'Too much canvas area for the model'],
        fix: 'Generate near native size and upscale after. Avoid directly jumping to huge canvases.',
        symptomTags: ['tiling', 'repeating patterns', 'wallpaper background'],
        difficulty: 'intermediate',
    },
    {
        id: 'prompt-bleed',
        name: 'Prompt Bleed',
        term: 'Prompt bleed',
        severity: 'caution',
        whatItMeans: 'Prompt concepts blend together in the wrong way, such as colours leaking across different objects.',
        likelyCauses: ['Weak prompt structure', 'Very low CFG', 'Long or conflicting prompt instructions'],
        fix: 'Strengthen prompt structure, raise CFG slightly if it is too low, and split conflicting concepts more clearly.',
        symptomTags: ['prompt bleed', 'merged concepts', 'wrong colours', 'prompt drift'],
        difficulty: 'advanced',
    },
];

export const QUALITY_COACH_RECIPES: QualityCoachRecipe[] = [
    {
        id: 'quick-draft',
        name: 'Quick Draft',
        goal: 'Fast exploration and idea finding',
        notes: 'Good for rough exploration. Expect more variation and less precision.',
        difficulty: 'beginner',
        params: {
            sampler: 'euler_ancestral',
            steps: 15,
            cfgscale: 7,
            width: 1024,
            height: 1024,
        },
    },
    {
        id: 'quality-portrait',
        name: 'Quality Portrait',
        goal: 'Balanced character art or portraits',
        notes: 'A reliable SDXL-style portrait starting point with strong detail and controlled colours.',
        difficulty: 'beginner',
        params: {
            sampler: 'dpmpp_2m',
            scheduler: 'karras',
            steps: 30,
            cfgscale: 6.5,
            width: 896,
            height: 1152,
        },
    },
    {
        id: 'photorealistic',
        name: 'Photorealistic',
        goal: 'Detailed realism and skin texture',
        notes: 'Slower but more detailed. Best when realism matters more than speed.',
        difficulty: 'intermediate',
        params: {
            sampler: 'dpmpp_sde',
            scheduler: 'karras',
            steps: 35,
            cfgscale: 7.5,
            width: 1024,
            height: 1024,
        },
    },
    {
        id: 'creative-chaos',
        name: 'Creative Chaos',
        goal: 'Loose, artistic, exploratory results',
        notes: 'Great for finding surprising compositions, not for exact prompt control.',
        difficulty: 'intermediate',
        params: {
            sampler: 'euler_ancestral',
            steps: 20,
            cfgscale: 4,
            width: 1024,
            height: 1024,
        },
    },
    {
        id: 'illustrious-anime',
        name: 'Illustrious Anime',
        goal: 'Illustrious-family character art',
        notes: 'Tuned for Illustrious / anime derivatives. If it still looks hot, lower CFG to around 4.5-5.0.',
        difficulty: 'advanced',
        params: {
            sampler: 'dpmpp_2m',
            scheduler: 'karras',
            steps: 28,
            cfgscale: 5.5,
            width: 896,
            height: 1152,
            clipstopatlayer: -2,
        },
    },
];

export const QUALITY_COACH_DIAGNOSTIC_SYMPTOMS: QualityCoachDiagnosticSymptom[] = [
    { id: 'overbaked', label: 'Oversaturated / overbaked' },
    { id: 'deep-fried', label: 'Deep-fried / neon / grainy' },
    { id: 'mushy', label: 'Mushy / undercooked / blurry' },
    { id: 'washed out', label: 'Washed out / grey / flat' },
    { id: 'melted faces', label: 'Melted or warped faces' },
    { id: 'double head', label: 'Double head / duplicated body parts' },
    { id: 'tiling', label: 'Repeating patterns / wallpaper background' },
    { id: 'prompt bleed', label: 'Prompt bleed / merged concepts' },
    { id: 'colour banding', label: 'Colour banding / ugly gradients' },
    { id: 'crunchy', label: 'Crunchy or too sharp everywhere' },
];

export const QUALITY_COACH_GLOSSARY = [
    { term: 'Overbaked', meaning: 'Oversaturated, harsh, crunchy-looking output.', typicalCause: 'CFG too high.' },
    { term: 'Deep-fried', meaning: 'Extreme overbaked look with neon colours and noise.', typicalCause: 'High CFG plus high steps or aggressive samplers.' },
    { term: 'Mushy', meaning: 'Blurry and under-resolved output.', typicalCause: 'Too few steps or guidance too low.' },
    { term: 'Washed out', meaning: 'Flat, pale, grey-looking result.', typicalCause: 'VAE mismatch or very low CFG.' },
    { term: 'Prompt bleed', meaning: 'Prompt concepts blur together and contaminate each other.', typicalCause: 'Weak prompt structure or overly loose guidance.' },
];

export function getLearningLevelLabel(level: LearningDifficulty): string {
    if (level === 'beginner') return 'Beginner';
    if (level === 'intermediate') return 'Intermediate';
    return 'Advanced';
}

export function getAllGuides(): QualityCoachParameterGuide[] {
    return QUALITY_COACH_PARAMETER_GUIDES;
}

export function getAllFailureModes(): QualityCoachFailureMode[] {
    return QUALITY_COACH_FAILURE_MODES;
}

export function getAllRecipes(): QualityCoachRecipe[] {
    return QUALITY_COACH_RECIPES;
}

export function getMatrixBandForCfg(cfg: number | null): MatrixBand {
    if (cfg === null) return 'mid';
    if (cfg < 4) return 'low';
    if (cfg <= 10) return 'mid';
    return 'high';
}

export function getMatrixBandForSteps(steps: number | null): MatrixBand {
    if (steps === null) return 'mid';
    if (steps < 18) return 'low';
    if (steps <= 45) return 'mid';
    return 'high';
}

export function getCurrentMatrixCell(cfg: number | null, steps: number | null): QualityCoachMatrixCell {
    const cfgBand = getMatrixBandForCfg(cfg);
    const stepsBand = getMatrixBandForSteps(steps);
    return QUALITY_COACH_MATRIX.find((cell) => cell.cfgBand === cfgBand && cell.stepsBand === stepsBand) ?? QUALITY_COACH_MATRIX[4];
}

export function getMatchedFailureModes(selectedSymptoms: string[]): Array<QualityCoachFailureMode & { matchCount: number }> {
    const selected = new Set(selectedSymptoms);
    return QUALITY_COACH_FAILURE_MODES
        .map((mode) => ({
            ...mode,
            matchCount: mode.symptomTags.filter((tag) => selected.has(tag)).length,
        }))
        .filter((mode) => mode.matchCount > 0)
        .sort((a, b) => b.matchCount - a.matchCount);
}
