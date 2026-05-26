// Sampler, Scheduler, and Aspect Ratio Data Constants
// Extracted for performance and maintainability

export interface SamplingOptionDetails {
    value: string;
    label: string;
    description: string;
    whatItIs: string;
    goodAt: string;
    bestWith: string;
    recommendedStyles: string;
    notes?: string;
}

export type SamplerOption = SamplingOptionDetails;

export type SchedulerOption = SamplingOptionDetails;

export interface AspectRatioPreset {
    value: string;
    label: string;
    width: number;
    height: number;
    ratio: [number, number];
}

interface BaseSamplingOption {
    value: string;
    label: string;
    description: string;
}

interface SamplingHelpRecord {
    whatItIs: string;
    goodAt: string;
    bestWith: string;
    recommendedStyles: string;
    notes?: string;
}

const SAMPLING_DEFAULTS = {
    classicModels: 'SD1, SD2, SDXL, Pony, Illustrious, and most standard latent-diffusion checkpoints.',
    rectifiedModels: 'Rectified-flow families like FLUX, SD3-style workflows, and other non-randomizing pipelines.',
    turboModels: 'Turbo, lightning, LCM, and other distilled short-step models.',
    workflowSpecific: 'The exact model family or workflow that introduced it.',
    broadStyles: 'Photoreal, semi-realistic, anime, illustration, and most general-purpose looks.',
    realismStyles: 'Photoreal, semi-realistic, cinematic, portrait, product, and environment work.',
    stylizedStyles: 'Anime, painterly, concept art, fantasy illustration, and other stylized looks.',
    lowStepStyles: 'Anime, graphic illustration, simple concept passes, icons, and bold stylized looks.',
    lowCfgStyles: 'Prompt-sensitive anime, semi-realistic, illustration, and low-CFG stylized workflows.',
    workflowStyles: 'Whatever the matching workflow or model guide recommends; this choice is usually not style-driven.',
};

function createHelp(
    whatItIs: string,
    goodAt: string,
    bestWith: string,
    recommendedStyles: string,
    notes = '',
): SamplingHelpRecord {
    return { whatItIs, goodAt, bestWith, recommendedStyles, notes };
}

const RAW_SAMPLER_OPTIONS: BaseSamplingOption[] = [
    { value: 'euler', label: 'Euler', description: 'Fast, dependable default for quick iteration and broad compatibility.' },
    { value: 'euler_ancestral', label: 'Euler Ancestral', description: 'Adds fresh noise each step for looser, more painterly variation.' },
    { value: 'euler_cfg_pp', label: 'Euler CFG++', description: 'Euler with CFG++ guidance, designed for low-CFG prompt control.' },
    { value: 'euler_ancestral_cfg_pp', label: 'Euler Ancestral CFG++', description: 'Ancestral Euler plus CFG++ for lively low-CFG stylized work.' },
    { value: 'heun', label: 'Heun', description: 'A slower second-order Euler-family solver focused on steadier denoising.' },
    { value: 'heunpp2', label: 'Heun++ 2', description: 'Enhanced Heun-style solver for careful, quality-first renders.' },
    { value: 'dpm_2', label: 'DPM-2', description: 'Classic DPM-2 solver with solid structure at the cost of speed.' },
    { value: 'dpm_2_ancestral', label: 'DPM-2 Ancestral', description: 'DPM-2 plus added noise for more variation and texture.' },
    { value: 'lms', label: 'LMS', description: 'Classic linear multi-step sampler with smooth legacy-friendly behavior.' },
    { value: 'dpm_fast', label: 'DPM Fast', description: 'A quicker DPM-family option for short exploratory runs.' },
    { value: 'dpm_adaptive', label: 'DPM Adaptive', description: 'Adaptive-step DPM solver that changes its effective stepping as it runs.' },
    { value: 'dpmpp_2s_ancestral', label: 'DPM++ 2S Ancestral', description: 'Second-order single-step DPM++ with extra texture and randomness.' },
    { value: 'dpmpp_2s_ancestral_cfg_pp', label: 'DPM++ 2S Ancestral CFG++', description: '2S Ancestral with CFG++ for creative low-CFG guidance.' },
    { value: 'dpmpp_sde', label: 'DPM++ SDE', description: 'Stochastic DPM++ path that leans into texture and organic detail.' },
    { value: 'dpmpp_sde_gpu', label: 'DPM++ SDE (GPU)', description: 'GPU-seeded DPM++ SDE with the same textured stochastic behavior.' },
    { value: 'dpmpp_2m', label: 'DPM++ 2M', description: 'High-quality deterministic all-rounder and one of the safest defaults.' },
    { value: 'dpmpp_2m_cfg_pp', label: 'DPM++ 2M CFG++', description: 'DPM++ 2M with CFG++ guidance for low-CFG quality-focused prompting.' },
    { value: 'dpmpp_2m_sde', label: 'DPM++ 2M SDE', description: 'Adds SDE-style stochastic texture on top of DPM++ 2M.' },
    { value: 'dpmpp_2m_sde_gpu', label: 'DPM++ 2M SDE (GPU)', description: 'GPU-seeded DPM++ 2M SDE for the same textured use case.' },
    { value: 'dpmpp_2m_sde_heun', label: 'DPM++ 2M SDE Heun', description: 'A hybrid quality-oriented variant of DPM++ 2M SDE.' },
    { value: 'dpmpp_2m_sde_heun_gpu', label: 'DPM++ 2M SDE Heun (GPU)', description: 'GPU-seeded hybrid DPM++ 2M SDE Heun sampler.' },
    { value: 'dpmpp_3m_sde', label: 'DPM++ 3M SDE', description: 'Higher-order DPM++ SDE focused on slower, detail-rich refinement.' },
    { value: 'dpmpp_3m_sde_gpu', label: 'DPM++ 3M SDE (GPU)', description: 'GPU-seeded 3M SDE for the same high-detail family.' },
    { value: 'ddim', label: 'DDIM', description: 'Legacy deterministic DDIM sampler kept mainly for compatibility.' },
    { value: 'ddpm', label: 'DDPM', description: 'Original probabilistic diffusion sampler with stable, legacy behavior.' },
    { value: 'uni_pc', label: 'UniPC', description: 'Unified predictor-corrector sampler with efficient low-to-mid step convergence.' },
    { value: 'uni_pc_bh2', label: 'UniPC BH2', description: 'UniPC variant with altered correction behavior for experimentation.' },
    { value: 'lcm', label: 'LCM', description: 'Latent Consistency sampler intended for extremely low-step distilled models.' },
    { value: 'res_multistep', label: 'Res MultiStep', description: 'Residual multistep sampler built for Cosmos-family workflows.' },
    { value: 'res_multistep_ancestral', label: 'Res MultiStep Ancestral', description: 'Cosmos-oriented residual multistep sampler with added randomness.' },
    { value: 'res_multistep_cfg_pp', label: 'Res MultiStep CFG++', description: 'Res MultiStep adapted for low-CFG CFG++ guidance.' },
    { value: 'res_multistep_ancestral_cfg_pp', label: 'Res MultiStep Ancestral CFG++', description: 'Ancestral Res MultiStep plus CFG++ for dynamic low-CFG workflows.' },
    { value: 'ipndm', label: 'iPNDM', description: 'Improved pseudo-numerical diffusion method with good short-run efficiency.' },
    { value: 'ipndm_v', label: 'iPNDM-V', description: 'Variable-step iPNDM variant for advanced experimentation.' },
    { value: 'deis', label: 'DEIS', description: 'Diffusion exponential integrator sampler with a mathematically efficient feel.' },
    { value: 'gradient_estimation', label: 'Gradient Estimation', description: 'Experimental solver emphasizing gradient-estimation behavior.' },
    { value: 'gradient_estimation_cfg_pp', label: 'Gradient Estimation CFG++', description: 'Gradient Estimation adapted for low-CFG CFG++ guidance.' },
    { value: 'er_sde', label: 'ER-SDE', description: 'ER-SDE solver usually paired with Align Your Steps style scheduling.' },
    { value: 'seeds_2', label: 'SEEDS 2', description: 'Experimental exponential SDE solver variant.' },
    { value: 'seeds_3', label: 'SEEDS 3', description: 'Later SEEDS-family SDE variant for experimentation.' },
    { value: 'sa_solver', label: 'SA-Solver', description: 'Stochastic Adams-family solver for advanced comparisons.' },
    { value: 'sa_solver_pece', label: 'SA-Solver PECE', description: 'PECE variant of SA-Solver with extra correction stages.' },
];

const RAW_SCHEDULER_OPTIONS: BaseSamplingOption[] = [
    { value: 'normal', label: 'Normal', description: 'Standard baseline sigma schedule and the safest general default.' },
    { value: 'karras', label: 'Karras', description: 'Popular detail-friendly schedule for mainstream SD samplers.' },
    { value: 'exponential', label: 'Exponential', description: 'Exponential sigma spacing for an alternate denoise cadence.' },
    { value: 'simple', label: 'Simple', description: 'Neutral, straightforward schedule mainly used for comparison and compatibility.' },
    { value: 'ddim_uniform', label: 'DDIM Uniform', description: 'Uniform DDIM-oriented spacing for legacy DDIM workflows.' },
    { value: 'sgm_uniform', label: 'SGM Uniform', description: 'Uniform SGM-style schedule for workflows that explicitly want it.' },
    { value: 'beta', label: 'Beta', description: 'Beta-based sigma schedule for advanced experimentation.' },
    { value: 'turbo', label: 'Turbo', description: 'Short-step distilled scheduler for turbo and lightning-style models.' },
    { value: 'align_your_steps', label: 'Align Your Steps', description: 'AYS schedule for workflows built around model-specific step alignment.' },
    { value: 'kl_optimal', label: 'KL Optimal', description: 'KL-optimal variant associated with Nvidia AYS-style workflows.' },
    { value: 'linear_quadratic', label: 'Linear Quadratic', description: 'Mochi-oriented schedule with linear-to-quadratic progression.' },
    { value: 'ltxv', label: 'LTX-Video', description: 'Scheduler tuned for LTX-Video workflows.' },
    { value: 'ltxv-image', label: 'LTXV-Image', description: 'Scheduler for image workflows based on the LTXV family.' },
    { value: 'flux2', label: 'Flux.2', description: 'Scheduler intended for Flux.2-style workflows.' },
    { value: 'linear', label: 'Linear', description: 'Pure linear decay schedule with predictable behavior.' },
    { value: 'cosine', label: 'Cosine', description: 'Cosine-based progression that tends to feel smoother and softer.' },
    { value: 'sqrt_linear', label: 'Sqrt Linear', description: 'Square-root linear schedule with gentler early-step changes.' },
    { value: 'sqrt', label: 'Sqrt', description: 'Square-root schedule with especially gentle progression.' },
    { value: 'ays', label: 'AYS', description: 'Short alias for Align Your Steps scheduling.' },
    { value: 'gits', label: 'GITS', description: 'Gradient-informed scheduling for advanced experimentation.' },
    { value: 'laplacian', label: 'Laplacian', description: 'Laplacian distribution schedule with unusual noise behavior.' },
];

const SAMPLER_HELP_OVERRIDES: Record<string, SamplingHelpRecord> = {
    euler: createHelp(
        'A fast first-order sampler with predictable behavior.',
        'Quick previews, prompt iteration, and dependable general-purpose runs.',
        SAMPLING_DEFAULTS.classicModels,
        'Anime, semi-realistic, painterly previews, and broad general-purpose prompting.',
        'A very safe baseline when you want speed without surprises.',
    ),
    euler_ancestral: createHelp(
        'Euler with ancestral noise injection on every step.',
        'Looser painterly outputs, extra texture, and more variation per seed.',
        SAMPLING_DEFAULTS.classicModels,
        'Anime, painterly, fantasy illustration, concept art, and other textured stylized looks.',
        'Randomizing sampler; usually a poor fit for FLUX or other rectified-flow families.',
    ),
    heun: createHelp(
        'A second-order Euler-family solver that spends more work per step.',
        'Quality-first denoising when stability matters more than raw speed.',
        SAMPLING_DEFAULTS.classicModels,
        'Semi-realistic, photoreal, cinematic, and controlled illustration work.',
        'Often slower than Euler or DPM++ 2M but can feel more conservative.',
    ),
    dpmpp_2m: createHelp(
        'A deterministic second-order multi-step DPM++ sampler.',
        'High-quality all-purpose rendering with an excellent speed-to-detail balance.',
        SAMPLING_DEFAULTS.classicModels,
        'Photoreal, semi-realistic, cinematic, detailed illustration, and polished fantasy art.',
        'One of the strongest default choices, especially with Karras on SDXL-style models.',
    ),
    dpmpp_sde: createHelp(
        'A stochastic DPM++ SDE sampler.',
        'Texture-rich, organic-looking images and exploratory generations.',
        SAMPLING_DEFAULTS.classicModels,
        'Anime, painterly realism, fantasy illustration, concept art, and richly textured scenes.',
        'Randomizing; strong on classic diffusion families, weak on rectified-flow ones.',
    ),
    dpmpp_2m_sde: createHelp(
        'DPM++ 2M with SDE-style stochasticity.',
        'Sharper detail than plain 2M when you still want richer surface texture.',
        SAMPLING_DEFAULTS.classicModels,
        'Semi-realistic, painterly realism, textured illustration, and premium fantasy art.',
        'Still not a great fit for rectified-flow families despite being steadier than ancestral choices.',
    ),
    dpmpp_3m_sde: createHelp(
        'A higher-order DPM++ SDE sampler.',
        'Longer quality-focused runs that chase extra detail and smooth convergence.',
        SAMPLING_DEFAULTS.classicModels,
        'Painterly realism, cinematic illustration, fantasy scenes, and other detail-hungry styles.',
        'Usually worth it only when you intentionally want a slower premium pass.',
    ),
    ddim: createHelp(
        'A classic deterministic DDIM sampler.',
        'Legacy recipe compatibility and reproducible comparison runs.',
        SAMPLING_DEFAULTS.classicModels,
        'Legacy anime, older semi-realistic recipes, and compatibility-focused prompt styles.',
        'Mostly kept around for compatibility rather than as a default recommendation.',
    ),
    lcm: createHelp(
        'A latent consistency sampler built for very low-step inference.',
        'Extremely fast runs at 4 to 8 steps.',
        SAMPLING_DEFAULTS.turboModels,
        'Anime, graphic illustration, stickers, icons, and quick concept roughs more than ultra-detailed realism.',
        'Usually looks weak on standard non-distilled checkpoints.',
    ),
    res_multistep: createHelp(
        'A residual multistep sampler built for Cosmos-family workflows.',
        'Cosmos image and video pipelines that expect this residual formulation.',
        'Cosmos models and custom workflows that explicitly recommend Res MultiStep.',
        SAMPLING_DEFAULTS.workflowStyles,
        'Use it mainly when the workflow author points you at it.',
    ),
    res_multistep_ancestral: createHelp(
        'The ancestral version of Res MultiStep.',
        'Cosmos workflows where you want more variation and texture.',
        'Cosmos models and related custom workflows.',
        SAMPLING_DEFAULTS.workflowStyles,
        'Randomizing and highly workflow-specific.',
    ),
    er_sde: createHelp(
        'An exponential-runge style SDE solver.',
        'Align Your Steps style workflows and niche schedule-matched recipes.',
        SAMPLING_DEFAULTS.classicModels,
        'Style depends on the paired AYS recipe, but usually textured realism, illustration, or cinematic work.',
        'Usually paired with the Align Your Steps scheduler rather than used blindly.',
    ),
};

const SCHEDULER_HELP_OVERRIDES: Record<string, SamplingHelpRecord> = {
    normal: createHelp(
        'The default sigma schedule.',
        'General-purpose sampling when no special schedule is required.',
        'Almost every standard sampler/model pair as a baseline.',
        'Photoreal, semi-realistic, anime, illustration, and nearly all broad style goals.',
        'The safest "just start here" scheduler.',
    ),
    karras: createHelp(
        'A Karras sigma schedule that redistributes effort toward the noisy end.',
        'Sharper detail and strong convergence in medium step counts.',
        'SD1, SDXL, and most mainstream samplers like DPM++ 2M or Euler.',
        'Photoreal, semi-realistic, cinematic, anime, and detailed illustration work.',
        'One of the most commonly recommended scheduler choices for classic image checkpoints.',
    ),
    turbo: createHelp(
        'A short-step scheduler for distilled inference.',
        'Very fast runs on models built for turbo-style generation.',
        SAMPLING_DEFAULTS.turboModels,
        'Anime, graphic illustration, bold stylization, and simple semi-realistic outputs at low steps.',
        'Usually keep step counts low; adding many steps often wastes time or hurts quality.',
    ),
    align_your_steps: createHelp(
        'A schedule derived from Align Your Steps style spacing.',
        'Model-specific workflows tuned around AYS behavior.',
        'Models or workflows that explicitly recommend AYS, often alongside ER-SDE.',
        'Depends heavily on the workflow; follow the recipe rather than treating it as style-agnostic.',
        'Not a universal upgrade over Normal or Karras.',
    ),
    kl_optimal: createHelp(
        'A KL-optimal schedule associated with Nvidia AYS-style work.',
        'Workflows tuned around KL-optimal spacing.',
        'Recipes that explicitly call for KL Optimal or Nvidia AYS behavior.',
        SAMPLING_DEFAULTS.workflowStyles,
        'Treat it as workflow-specific rather than a generic default.',
    ),
    linear_quadratic: createHelp(
        'A linear-to-quadratic schedule variant.',
        'Mochi-family workflows expecting this schedule shape.',
        'Mochi and related workflows.',
        SAMPLING_DEFAULTS.workflowStyles,
        'Specialized rather than general-purpose.',
    ),
    ltxv: createHelp(
        'An LTX-Video-specific scheduler.',
        'Native LTX-Video generation workflows.',
        'LTX-Video models.',
        SAMPLING_DEFAULTS.workflowStyles,
        'Use the matching family scheduler when working with LTX video models.',
    ),
    'ltxv-image': createHelp(
        'An LTXV-image-specific scheduler.',
        'Image generation workflows based on the LTXV family.',
        'LTXV image workflows.',
        SAMPLING_DEFAULTS.workflowStyles,
        'Specialized family scheduler.',
    ),
    flux2: createHelp(
        'A Flux.2-oriented scheduler.',
        'Matching the pacing expected by Flux.2-family workflows.',
        'Flux.2 and compatible rectified-flow workflows.',
        'Realistic, semi-realistic, clean commercial imagery, and other FLUX-style polished looks.',
        'Prefer non-randomizing samplers with FLUX-style families unless a recipe says otherwise.',
    ),
};

function createGenericHelp(kind: 'sampler' | 'scheduler', option: BaseSamplingOption): SamplingHelpRecord {
    const value = option.value.toLowerCase();

    if (kind === 'sampler') {
        if (value.includes('cfg_pp')) {
            return createHelp(
                'A CFG++ sampler variant.',
                'Low-CFG guidance workflows that want cleaner prompt adherence.',
                SAMPLING_DEFAULTS.classicModels,
                SAMPLING_DEFAULTS.lowCfgStyles,
                'CFG++ samplers usually want much lower CFG values than standard samplers.',
            );
        }
        if (value.includes('ancestral')) {
            return createHelp(
                'An ancestral sampler variant that injects fresh noise during denoising.',
                'Extra variation, texture, and livelier painterly results.',
                SAMPLING_DEFAULTS.classicModels,
                SAMPLING_DEFAULTS.stylizedStyles,
                'Randomizing and usually a poor fit for rectified-flow model families.',
            );
        }
        if (value.includes('sde')) {
            return createHelp(
                'An SDE-style stochastic sampler variant.',
                'Texture-rich exploratory generations and organic-looking detail.',
                SAMPLING_DEFAULTS.classicModels,
                'Semi-realistic, painterly realism, fantasy illustration, textured anime, and exploratory stylization.',
                'Avoid on FLUX-style rectified-flow models unless a workflow explicitly recommends it.',
            );
        }
        if (value.includes('gpu')) {
            return createHelp(
                'A GPU-seeded variant of a sampler family.',
                'Matching workflows that expect GPU-side randomness or seeding.',
                SAMPLING_DEFAULTS.classicModels,
                SAMPLING_DEFAULTS.broadStyles,
                'Choose it mainly for compatibility with the underlying sampler family.',
            );
        }
        if (value.includes('cosmos') || value.includes('res_multistep')) {
            return createHelp(
                'A workflow-specific sampler family.',
                'Specialized pipelines that expect its exact denoise behavior.',
                SAMPLING_DEFAULTS.workflowSpecific,
                SAMPLING_DEFAULTS.workflowStyles,
                'Prefer it only when the model guide points you there.',
            );
        }
        return createHelp(
            option.description,
            'General experimentation, solver comparisons, and compatibility testing.',
            SAMPLING_DEFAULTS.classicModels,
            SAMPLING_DEFAULTS.broadStyles,
            'If a model author recommends this sampler directly, follow that workflow first.',
        );
    }

    if (value.includes('turbo')) {
        return createHelp(
            'A scheduler meant for distilled short-step inference.',
            'Low-step turbo and lightning style generation.',
            SAMPLING_DEFAULTS.turboModels,
            SAMPLING_DEFAULTS.lowStepStyles,
            'Usually the wrong choice for standard non-distilled checkpoints.',
        );
    }
    if (value.includes('ays') || value.includes('align')) {
        return createHelp(
            'A schedule from the Align Your Steps family.',
            'Recipes tuned around specific step spacing behavior.',
            'AYS-oriented workflows and guides.',
            SAMPLING_DEFAULTS.workflowStyles,
            'Most helpful when the sampler and model guide already recommend it.',
        );
    }
    if (value.includes('linear') || value.includes('sqrt') || value.includes('cosine') || value.includes('laplacian')) {
        return createHelp(
            'A mathematical noise schedule variant.',
            'Comparing denoise pacing and fine-tuning how steps are distributed.',
            SAMPLING_DEFAULTS.classicModels,
            'Photoreal, semi-realistic, anime, and illustration work when you are intentionally tuning schedule behavior.',
            'More often used for experimentation than as a universal default.',
        );
    }

    return createHelp(
        option.description,
        'General scheduling comparisons and workflow tuning.',
        'The model family or workflow that explicitly recommends it, or standard diffusion checkpoints for testing.',
        SAMPLING_DEFAULTS.broadStyles,
        'If you are unsure, Normal or Karras are usually safer starting points.',
    );
}

function enrichOption<T extends BaseSamplingOption>(
    kind: 'sampler' | 'scheduler',
    option: T,
): T & SamplingHelpRecord {
    const help =
        (kind === 'sampler' ? SAMPLER_HELP_OVERRIDES[option.value] : SCHEDULER_HELP_OVERRIDES[option.value])
        ?? createGenericHelp(kind, option);

    return {
        ...option,
        ...help,
    };
}

export function humanizeSamplingValue(value: string): string {
    return value.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

export function createUnknownSamplingOption(kind: 'sampler' | 'scheduler', value: string, label?: string): SamplingOptionDetails {
    const base: BaseSamplingOption = {
        value,
        label: label || humanizeSamplingValue(value),
        description: `Backend-provided ${kind} option without local React help text yet.`,
    };
    return enrichOption(kind, base);
}

export const SAMPLER_OPTIONS: SamplerOption[] = RAW_SAMPLER_OPTIONS.map((option) => enrichOption('sampler', option));

export const SCHEDULER_OPTIONS: SchedulerOption[] = RAW_SCHEDULER_OPTIONS.map((option) => enrichOption('scheduler', option));

export const ASPECT_RATIO_PRESETS: AspectRatioPreset[] = [
    { value: 'custom', label: 'Custom', width: 0, height: 0, ratio: [0, 0] },
    { value: '1:1', label: '1:1', width: 1024, height: 1024, ratio: [1, 1] },
    { value: '4:3', label: '4:3', width: 1024, height: 768, ratio: [4, 3] },
    { value: '3:4', label: '3:4', width: 768, height: 1024, ratio: [3, 4] },
    { value: '16:9', label: '16:9', width: 1024, height: 576, ratio: [16, 9] },
    { value: '9:16', label: '9:16', width: 576, height: 1024, ratio: [9, 16] },
    { value: '3:2', label: '3:2', width: 1024, height: 683, ratio: [3, 2] },
    { value: '2:3', label: '2:3', width: 683, height: 1024, ratio: [2, 3] },
    { value: '21:9', label: '21:9', width: 1024, height: 439, ratio: [21, 9] },
];

// Helper to detect aspect ratio from dimensions
export function detectAspectRatio(width: number, height: number): string {
    for (const preset of ASPECT_RATIO_PRESETS) {
        if (preset.value === 'custom') continue;
        const [rw, rh] = preset.ratio;
        if (Math.abs(width / height - rw / rh) < 0.01) return preset.value;
    }
    return 'custom';
}

// Helper to get dimensions for aspect ratio
export function getDimensionsForRatio(ratio: string): [number, number] | null {
    const preset = ASPECT_RATIO_PRESETS.find((p) => p.value === ratio);
    if (!preset || preset.value === 'custom') return null;
    return [preset.width, preset.height];
}

// Greatest common divisor for ratio calculation
export function gcd(a: number, b: number): number {
    return b === 0 ? a : gcd(b, a % b);
}

// Calculate simplified ratio string
export function calculateRatioString(width: number, height: number): string {
    const d = gcd(width, height);
    return `${width / d}:${height / d}`;
}
