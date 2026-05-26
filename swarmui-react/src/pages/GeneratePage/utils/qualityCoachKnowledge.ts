import type { GenerateParams, Model } from '../../../api/types';

export type QualityCoachSeverity = 'balanced' | 'caution' | 'high-risk';

export interface QualityCoachIssue {
    id: string;
    category: string;
    severity: QualityCoachSeverity;
    familyLabel: string;
    title: string;
    description: string;
    recommendation?: string;
    overrides: Partial<GenerateParams>;
    currentValue?: string;
    recommendedRange?: string;
    evidence?: string;
    symptoms?: string[];
}

export interface QualityCoachParameterHealth {
    key: string;
    label: string;
    severity: QualityCoachSeverity;
    currentValue: string;
    recommendedRange: string;
    note: string;
}

export interface QualityCoachFamilyProfile {
    id: string;
    label: string;
    nativeResolution: { width: number; height: number };
    cfg: {
        good: [number, number];
        caution: [number, number];
        target: number;
        recommendedRange: string;
        evidence: string;
    };
    steps: {
        good: [number, number];
        caution: [number, number];
        target: number;
        recommendedRange: string;
        evidence: string;
    };
    img2imgCreativity: {
        good: [number, number];
        caution: [number, number];
        target: number;
        recommendedRange: string;
        evidence: string;
    };
    samplerMode: 'classic' | 'rectified' | 'turbo';
    prefersNearZeroGuidance: boolean;
    prefersShortSteps: boolean;
    turboSchedulerExpected: boolean;
}

interface QualityCoachRangeAssessment {
    severity: QualityCoachSeverity;
    direction: 'low' | 'high' | null;
}

const FAMILY_PROFILES: Record<string, QualityCoachFamilyProfile> = {
    'classic-sd': {
        id: 'classic-sd',
        label: 'Stable Diffusion 1.5 / 2.x',
        nativeResolution: { width: 512, height: 512 },
        cfg: {
            good: [4, 10],
            caution: [2.5, 14],
            target: 7,
            recommendedRange: 'CFG 4-10 (usually around 7)',
            evidence: 'Classic Stable Diffusion pipelines typically use moderate classifier-free guidance around the traditional 7-ish range.',
        },
        steps: {
            good: [16, 40],
            caution: [8, 60],
            target: 28,
            recommendedRange: '16-40 steps',
            evidence: 'Classic SD checkpoints usually converge in a normal multi-step denoising range rather than very short or extremely long runs.',
        },
        img2imgCreativity: {
            good: [0.25, 0.7],
            caution: [0.15, 0.85],
            target: 0.45,
            recommendedRange: 'Creativity 0.25-0.70',
            evidence: 'Img2img editing works best in a middle band where prompt changes are visible without fully discarding the source image.',
        },
        samplerMode: 'classic',
        prefersNearZeroGuidance: false,
        prefersShortSteps: false,
        turboSchedulerExpected: false,
    },
    sdxl: {
        id: 'sdxl',
        label: 'Stable Diffusion XL',
        nativeResolution: { width: 1024, height: 1024 },
        cfg: {
            good: [4, 9],
            caution: [2.5, 13],
            target: 6,
            recommendedRange: 'CFG 4-9',
            evidence: 'SDXL docs and common pipeline defaults center around moderate guidance with a native 1024 canvas.',
        },
        steps: {
            good: [18, 45],
            caution: [8, 60],
            target: 30,
            recommendedRange: '18-45 steps',
            evidence: 'SDXL generally benefits from a normal multi-step schedule, with diminishing returns once the step count gets very long.',
        },
        img2imgCreativity: {
            good: [0.25, 0.68],
            caution: [0.15, 0.82],
            target: 0.45,
            recommendedRange: 'Creativity 0.25-0.68',
            evidence: 'SDXL img2img tends to hold structure best when denoising stays in a moderate editing band.',
        },
        samplerMode: 'classic',
        prefersNearZeroGuidance: false,
        prefersShortSteps: false,
        turboSchedulerExpected: false,
    },
    illustrious: {
        id: 'illustrious',
        label: 'Illustrious / SDXL Derivative',
        nativeResolution: { width: 1024, height: 1024 },
        cfg: {
            good: [4, 8.5],
            caution: [2.5, 12],
            target: 5.5,
            recommendedRange: 'CFG 4-8.5',
            evidence: 'Illustrious-family checkpoints generally behave like SDXL derivatives and usually prefer moderate guidance over aggressive CFG.',
        },
        steps: {
            good: [18, 45],
            caution: [8, 60],
            target: 30,
            recommendedRange: '18-45 steps',
            evidence: 'Illustrious models generally follow SDXL-style multi-step denoising, with quality gains tapering off when runs get long.',
        },
        img2imgCreativity: {
            good: [0.22, 0.65],
            caution: [0.15, 0.8],
            target: 0.42,
            recommendedRange: 'Creativity 0.22-0.65',
            evidence: 'Moderate img2img denoising keeps the source structure while giving SDXL-style derivatives enough room to restyle.',
        },
        samplerMode: 'classic',
        prefersNearZeroGuidance: false,
        prefersShortSteps: false,
        turboSchedulerExpected: false,
    },
    pony: {
        id: 'pony',
        label: 'Pony / SDXL Derivative',
        nativeResolution: { width: 1024, height: 1024 },
        cfg: {
            good: [4, 8.5],
            caution: [2.5, 12],
            target: 5.5,
            recommendedRange: 'CFG 4-8.5',
            evidence: 'Pony-family checkpoints are commonly used like SDXL derivatives and usually respond best to moderate guidance.',
        },
        steps: {
            good: [18, 45],
            caution: [8, 60],
            target: 30,
            recommendedRange: '18-45 steps',
            evidence: 'Pony models are typically happiest in a standard SDXL-style denoising range rather than very short or very long runs.',
        },
        img2imgCreativity: {
            good: [0.22, 0.65],
            caution: [0.15, 0.8],
            target: 0.42,
            recommendedRange: 'Creativity 0.22-0.65',
            evidence: 'Moderate creativity keeps edits visible without collapsing the source structure.',
        },
        samplerMode: 'classic',
        prefersNearZeroGuidance: false,
        prefersShortSteps: false,
        turboSchedulerExpected: false,
    },
    sd3: {
        id: 'sd3',
        label: 'Stable Diffusion 3 / 3.5',
        nativeResolution: { width: 1024, height: 1024 },
        cfg: {
            good: [3, 8],
            caution: [2, 12],
            target: 5.5,
            recommendedRange: 'CFG 3-8',
            evidence: 'SD3-class models generally respond better to moderate guidance than the very high CFG values common in older workflows.',
        },
        steps: {
            good: [14, 45],
            caution: [8, 60],
            target: 28,
            recommendedRange: '14-45 steps',
            evidence: 'SD3-class pipelines still expect a standard denoising run, but overlong schedules are rarely the best tradeoff.',
        },
        img2imgCreativity: {
            good: [0.22, 0.65],
            caution: [0.15, 0.8],
            target: 0.42,
            recommendedRange: 'Creativity 0.22-0.65',
            evidence: 'Moderate img2img denoising preserves structure while leaving enough room for SD3 to restyle the image.',
        },
        samplerMode: 'rectified',
        prefersNearZeroGuidance: false,
        prefersShortSteps: false,
        turboSchedulerExpected: false,
    },
    'flux-guidance': {
        id: 'flux-guidance',
        label: 'FLUX Guidance-Distilled',
        nativeResolution: { width: 1024, height: 1024 },
        cfg: {
            good: [1, 5],
            caution: [0.2, 8],
            target: 2,
            recommendedRange: 'CFG 1-5',
            evidence: 'FLUX guidance-distilled models generally want much lower guidance than classic Stable Diffusion checkpoints.',
        },
        steps: {
            good: [14, 45],
            caution: [8, 60],
            target: 24,
            recommendedRange: '14-45 steps',
            evidence: 'Guidance-distilled FLUX models still use a normal denoising run, but benefit more from low guidance than from excessive steps.',
        },
        img2imgCreativity: {
            good: [0.2, 0.6],
            caution: [0.12, 0.78],
            target: 0.4,
            recommendedRange: 'Creativity 0.20-0.60',
            evidence: 'Lower guidance families usually hold edits together best with moderate img2img creativity.',
        },
        samplerMode: 'rectified',
        prefersNearZeroGuidance: false,
        prefersShortSteps: false,
        turboSchedulerExpected: false,
    },
    'flux-turbo': {
        id: 'flux-turbo',
        label: 'FLUX Timestep-Distilled / Turbo',
        nativeResolution: { width: 1024, height: 1024 },
        cfg: {
            good: [0, 1],
            caution: [0, 1.5],
            target: 0,
            recommendedRange: 'CFG 0-1',
            evidence: 'Turbo and timestep-distilled models are designed for near-zero guidance, not classic CFG-heavy workflows.',
        },
        steps: {
            good: [2, 8],
            caution: [1, 12],
            target: 4,
            recommendedRange: '2-8 steps',
            evidence: 'Distilled turbo-style models are built for very short denoising runs rather than standard long schedules.',
        },
        img2imgCreativity: {
            good: [0.18, 0.55],
            caution: [0.1, 0.75],
            target: 0.35,
            recommendedRange: 'Creativity 0.18-0.55',
            evidence: 'Short-step turbo editing works best when the source image is guided, not fully overwritten.',
        },
        samplerMode: 'turbo',
        prefersNearZeroGuidance: true,
        prefersShortSteps: true,
        turboSchedulerExpected: true,
    },
    lcm: {
        id: 'lcm',
        label: 'LCM / LCM-LoRA',
        nativeResolution: { width: 1024, height: 1024 },
        cfg: {
            good: [0, 2],
            caution: [0, 3],
            target: 1.2,
            recommendedRange: 'CFG 0-2',
            evidence: 'Latent Consistency Models are tuned for low guidance and very short inference schedules.',
        },
        steps: {
            good: [2, 8],
            caution: [1, 10],
            target: 4,
            recommendedRange: '2-8 steps',
            evidence: 'LCM workflows are intended to run in a short-step regime rather than traditional 20-40 step generation.',
        },
        img2imgCreativity: {
            good: [0.18, 0.55],
            caution: [0.1, 0.72],
            target: 0.35,
            recommendedRange: 'Creativity 0.18-0.55',
            evidence: 'LCM img2img is happiest with moderate denoising that preserves coarse layout while allowing quick restyling.',
        },
        samplerMode: 'turbo',
        prefersNearZeroGuidance: true,
        prefersShortSteps: true,
        turboSchedulerExpected: false,
    },
    generic: {
        id: 'generic',
        label: 'Generic Diffusion Model',
        nativeResolution: { width: 1024, height: 1024 },
        cfg: {
            good: [4, 10],
            caution: [2.5, 14],
            target: 7,
            recommendedRange: 'CFG 4-10',
            evidence: 'When model-specific guidance is unavailable, a moderate CFG range is the safest starting point for standard diffusion models.',
        },
        steps: {
            good: [16, 45],
            caution: [8, 60],
            target: 28,
            recommendedRange: '16-45 steps',
            evidence: 'Unknown checkpoints usually respond best to a standard denoising range until proven otherwise.',
        },
        img2imgCreativity: {
            good: [0.22, 0.68],
            caution: [0.12, 0.82],
            target: 0.42,
            recommendedRange: 'Creativity 0.22-0.68',
            evidence: 'Moderate img2img denoising is the most reliable default when the checkpoint has no stronger guidance.',
        },
        samplerMode: 'classic',
        prefersNearZeroGuidance: false,
        prefersShortSteps: false,
        turboSchedulerExpected: false,
    },
};

function normalize(value: unknown): string {
    return `${value ?? ''}`.trim().toLowerCase();
}

function toNumber(value: unknown): number | null {
    if (value === null || value === undefined || value === '') {
        return null;
    }
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
}

function severityRank(severity: QualityCoachSeverity): number {
    if (severity === 'high-risk') return 2;
    if (severity === 'caution') return 1;
    return 0;
}

function worseSeverity(a: QualityCoachSeverity, b: QualityCoachSeverity): QualityCoachSeverity {
    return severityRank(a) >= severityRank(b) ? a : b;
}

function assessNumericRange(value: number | null, good: [number, number], caution: [number, number]): QualityCoachRangeAssessment {
    if (value === null) {
        return { severity: 'balanced', direction: null };
    }
    if (value >= good[0] && value <= good[1]) {
        return { severity: 'balanced', direction: null };
    }
    if (value >= caution[0] && value <= caution[1]) {
        return { severity: 'caution', direction: value < good[0] ? 'low' : 'high' };
    }
    return { severity: 'high-risk', direction: value < caution[0] ? 'low' : 'high' };
}

function formatValue(value: number | null, suffix = ''): string {
    if (value === null) {
        return 'Not set';
    }
    if (Number.isInteger(value)) {
        return `${value}${suffix}`;
    }
    return `${value.toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1')}${suffix}`;
}

function getCombinedModelText(model: Model | null, params: Partial<GenerateParams>): string {
    return normalize([
        model?.name,
        model?.title,
        model?.class,
        model?.architecture,
        params.model,
        params.scheduler,
    ].filter(Boolean).join(' '));
}

export function classifyModelFamily(model: Model | null, params: Partial<GenerateParams>): QualityCoachFamilyProfile {
    const text = getCombinedModelText(model, params);
    if (text.includes('lcm')) {
        return FAMILY_PROFILES.lcm;
    }
    if (text.includes('illustrious') || text.includes('illustri') || text.includes('noobai')) {
        return FAMILY_PROFILES.illustrious;
    }
    if (text.includes('pony') || text.includes('autismmix') || text.includes('everclear')) {
        return FAMILY_PROFILES.pony;
    }
    if (text.includes('flux')) {
        if (text.includes('schnell') || text.includes('turbo') || text.includes('distilled')) {
            return FAMILY_PROFILES['flux-turbo'];
        }
        return FAMILY_PROFILES['flux-guidance'];
    }
    if (text.includes('sd3') || text.includes('stable-diffusion-3') || text.includes('3.5-medium') || text.includes('3.5-large')) {
        return FAMILY_PROFILES.sd3;
    }
    if (text.includes('sdxl') || text.includes('xl')) {
        if (text.includes('turbo')) {
            return FAMILY_PROFILES['flux-turbo'];
        }
        return FAMILY_PROFILES.sdxl;
    }
    if (text.includes('stable-diffusion-2') || text.includes('sd2') || text.includes('stable-diffusion-1') || text.includes('sd15') || text.includes('1.5')) {
        return FAMILY_PROFILES['classic-sd'];
    }
    return FAMILY_PROFILES.illustrious;
}

export function summarizeCoachStatus(issues: QualityCoachIssue[]): {
    overallSeverity: QualityCoachSeverity;
    label: string;
    summary: string;
} {
    const overallSeverity = issues.reduce<QualityCoachSeverity>(
        (current, issue) => worseSeverity(current, issue.severity),
        'balanced'
    );
    if (overallSeverity === 'high-risk') {
        return {
            overallSeverity,
            label: 'High Risk',
            summary: 'Current settings include one or more high-risk combinations that are likely to degrade image quality or waste generation time.',
        };
    }
    if (overallSeverity === 'caution') {
        return {
            overallSeverity,
            label: 'Caution',
            summary: 'Current settings are workable, but some values are outside the known-good range for this model family.',
        };
    }
    return {
        overallSeverity,
        label: 'Balanced',
        summary: 'Current settings are inside the known-good range for this model family.',
    };
}

export function analyzeParameterRanges(
    params: Partial<GenerateParams>,
    profile: QualityCoachFamilyProfile
): {
    issues: QualityCoachIssue[];
    parameterHealth: QualityCoachParameterHealth[];
} {
    const sampler = normalize(params.sampler);
    const scheduler = normalize(params.scheduler);
    const width = toNumber(params.width);
    const height = toNumber(params.height);
    const steps = toNumber(params.steps);
    const cfgscale = toNumber(params.cfgscale);
    const initCreativity = toNumber(params.initimagecreativity);
    const hasInitImage = Boolean(params.initimage);
    const issues: QualityCoachIssue[] = [];
    const parameterHealth: QualityCoachParameterHealth[] = [];

    const cfgAssessment = assessNumericRange(cfgscale, profile.cfg.good, profile.cfg.caution);
    parameterHealth.push({
        key: 'cfg',
        label: 'CFG',
        severity: cfgAssessment.severity,
        currentValue: formatValue(cfgscale),
        recommendedRange: profile.cfg.recommendedRange,
        note: cfgAssessment.severity === 'balanced'
            ? 'Guidance is in the expected range for this family.'
            : cfgAssessment.direction === 'high'
                ? 'Guidance is high enough to risk prompt overconstraint and overbaked contrast.'
                : 'Guidance is low enough to weaken prompt adherence and image structure.',
    });
    if (cfgAssessment.severity !== 'balanced') {
        const highDirection = cfgAssessment.direction === 'high';
        issues.push({
            id: `cfg-${cfgAssessment.direction}`,
            category: 'cfg',
            severity: cfgAssessment.severity,
            familyLabel: profile.label,
            title: highDirection ? 'CFG is above the healthy range' : 'CFG is below the healthy range',
            description: highDirection
                ? 'High CFG can force the model too hard, which often produces crunchy detail, clipped lighting, and brittle textures.'
                : 'Low CFG can make the model drift away from the prompt, reducing detail, composition strength, and prompt adherence.',
            recommendation: `Move CFG toward ${profile.cfg.recommendedRange}.`,
            overrides: { cfgscale: profile.cfg.target },
            currentValue: formatValue(cfgscale),
            recommendedRange: profile.cfg.recommendedRange,
            evidence: profile.cfg.evidence,
            symptoms: highDirection
                ? ['overbaked textures', 'harsh contrast', 'stiff prompt interpretation']
                : ['weak prompt adherence', 'flatter composition', 'washed-out styling'],
        });
    }

    const stepsAssessment = assessNumericRange(steps, profile.steps.good, profile.steps.caution);
    parameterHealth.push({
        key: 'steps',
        label: 'Steps',
        severity: stepsAssessment.severity,
        currentValue: formatValue(steps),
        recommendedRange: profile.steps.recommendedRange,
        note: stepsAssessment.severity === 'balanced'
            ? 'Step count matches the usual convergence range for this family.'
            : stepsAssessment.direction === 'high'
                ? 'Step count is long enough that quality gains may stall while artifacts increase.'
                : 'Step count may be too short for the image to fully resolve.',
    });
    if (stepsAssessment.severity !== 'balanced') {
        const highDirection = stepsAssessment.direction === 'high';
        issues.push({
            id: `steps-${stepsAssessment.direction}`,
            category: 'steps',
            severity: stepsAssessment.severity,
            familyLabel: profile.label,
            title: highDirection ? 'Step count is above the healthy range' : 'Step count is below the healthy range',
            description: highDirection
                ? 'Once the denoising run goes too long, many models stop improving and instead drift into brittle detail or wasted time.'
                : 'Very low step counts often leave the image under-resolved, soft, or only loosely aligned to the prompt.',
            recommendation: `Move steps toward ${profile.steps.recommendedRange}.`,
            overrides: { steps: profile.steps.target },
            currentValue: formatValue(steps),
            recommendedRange: profile.steps.recommendedRange,
            evidence: profile.steps.evidence,
            symptoms: highDirection
                ? ['overworked detail', 'longer runtimes without benefit', 'possible drift']
                : ['mushy detail', 'incomplete rendering', 'weaker prompt response'],
        });
    }

    let resolutionSeverity: QualityCoachSeverity = 'balanced';
    let resolutionNote = 'Canvas is close to the family native resolution and aspect.';
    if (width !== null && height !== null) {
        const areaRatio = (width * height) / (profile.nativeResolution.width * profile.nativeResolution.height);
        const aspectRatio = width / Math.max(1, height);
        const nativeAspectRatio = profile.nativeResolution.width / profile.nativeResolution.height;
        const aspectDelta = Math.abs(aspectRatio - nativeAspectRatio) / nativeAspectRatio;
        const gridOff = width % 64 !== 0 || height % 64 !== 0;
        if (width > 2048 || height > 2048 || areaRatio < 0.55 || areaRatio > 1.9 || aspectDelta > 1.25) {
            resolutionSeverity = 'high-risk';
            resolutionNote = 'Canvas is far enough from the native size or aspect that composition and detail stability can degrade.';
        }
        else if (gridOff || areaRatio < 0.75 || areaRatio > 1.35 || aspectDelta > 0.85) {
            resolutionSeverity = 'caution';
            resolutionNote = gridOff
                ? 'Canvas is off the usual latent grid, which can cause avoidable resizing artifacts.'
                : 'Canvas is outside the normal native-size comfort zone for this family.';
        }

        if (resolutionSeverity !== 'balanced') {
            issues.push({
                id: 'resolution-range',
                category: 'resolution',
                severity: resolutionSeverity,
                familyLabel: profile.label,
                title: resolutionSeverity === 'high-risk'
                    ? 'Resolution is far from the healthy range'
                    : 'Resolution is drifting away from the native canvas',
                description: resolutionSeverity === 'high-risk'
                    ? 'Extreme canvas sizes or aspect ratios can weaken composition, duplicate detail, and make the checkpoint behave unpredictably.'
                    : 'A canvas that drifts from native size or aspect can still work, but it usually becomes less reliable than the family default.',
                recommendation: `Stay close to ${profile.nativeResolution.width}x${profile.nativeResolution.height} unless you are deliberately trading reliability for framing.`,
                overrides: { width: profile.nativeResolution.width, height: profile.nativeResolution.height },
                currentValue: `${width}x${height}`,
                recommendedRange: `${profile.nativeResolution.width}x${profile.nativeResolution.height} native, multiples of 64`,
                evidence: 'Model cards and diffusion docs usually anchor each family around a native training resolution, with reliability dropping as size and aspect drift further away.',
                symptoms: ['softened detail', 'awkward framing', 'repeated elements'],
            });
        }
    }
    parameterHealth.push({
        key: 'resolution',
        label: 'Resolution',
        severity: resolutionSeverity,
        currentValue: width !== null && height !== null ? `${width}x${height}` : 'Not set',
        recommendedRange: `${profile.nativeResolution.width}x${profile.nativeResolution.height} native`,
        note: resolutionNote,
    });

    let samplerSchedulerSeverity: QualityCoachSeverity = 'balanced';
    let samplerSchedulerNote = 'Sampler and scheduler fit the model family.';
    if (profile.samplerMode === 'rectified' && (sampler.includes('ancestral') || sampler.includes('sde'))) {
        samplerSchedulerSeverity = 'high-risk';
        samplerSchedulerNote = 'Rectified-flow families generally perform better with non-randomizing samplers.';
        issues.push({
            id: 'sampler-rectified-mismatch',
            category: 'sampler-scheduler',
            severity: 'high-risk',
            familyLabel: profile.label,
            title: 'Sampler is a poor fit for this model family',
            description: 'Rectified-flow style models usually become less stable with ancestral or SDE-style sampling.',
            recommendation: 'Use a steadier non-ancestral sampler for this family.',
            overrides: sampler.includes('euler_ancestral') ? { sampler: 'euler' } : sampler.includes('dpmpp_2s_ancestral') ? { sampler: 'dpmpp_2m' } : {},
            currentValue: sampler || 'Not set',
            recommendedRange: 'Non-ancestral / non-SDE samplers',
            evidence: 'Rectified-flow families such as SD3 and FLUX are typically documented and used with steadier sampler choices.',
            symptoms: ['instability', 'noisy detail', 'weaker consistency'],
        });
    }
    if (!profile.turboSchedulerExpected && scheduler.includes('turbo')) {
        samplerSchedulerSeverity = worseSeverity(samplerSchedulerSeverity, 'caution');
        samplerSchedulerNote = 'Turbo schedulers are usually meant for distilled short-step workflows, not standard denoising families.';
        issues.push({
            id: 'scheduler-turbo-mismatch',
            category: 'sampler-scheduler',
            severity: 'caution',
            familyLabel: profile.label,
            title: 'Turbo scheduler may not match this model family',
            description: 'Turbo schedulers are normally paired with distilled models that expect few steps and near-zero guidance.',
            recommendation: 'Use a standard scheduler unless this checkpoint specifically advertises turbo-style inference.',
            overrides: {},
            currentValue: scheduler || 'Not set',
            recommendedRange: profile.turboSchedulerExpected ? 'Turbo scheduler' : 'Standard scheduler',
            evidence: 'Distilled turbo workflows are designed around different guidance and step assumptions than normal diffusion checkpoints.',
            symptoms: ['reduced reliability', 'odd convergence', 'weaker quality consistency'],
        });
    }
    if ((profile.prefersNearZeroGuidance || profile.prefersShortSteps) && !scheduler.includes('turbo') && profile.turboSchedulerExpected) {
        samplerSchedulerSeverity = worseSeverity(samplerSchedulerSeverity, 'caution');
        samplerSchedulerNote = 'This family usually behaves best with its short-step distilled workflow.';
    }
    parameterHealth.push({
        key: 'sampler-scheduler',
        label: 'Sampler',
        severity: samplerSchedulerSeverity,
        currentValue: sampler || scheduler ? `${sampler || 'default'} / ${scheduler || 'default'}` : 'Defaults',
        recommendedRange: profile.samplerMode === 'rectified'
            ? 'Steady sampler, non-randomizing schedule'
            : profile.samplerMode === 'turbo'
                ? 'Short-step distilled workflow'
                : 'Standard sampler and scheduler',
        note: samplerSchedulerNote,
    });

    if (hasInitImage) {
        const creativityAssessment = assessNumericRange(initCreativity, profile.img2imgCreativity.good, profile.img2imgCreativity.caution);
        parameterHealth.push({
            key: 'img2img',
            label: 'Img2Img',
            severity: creativityAssessment.severity,
            currentValue: formatValue(initCreativity),
            recommendedRange: profile.img2imgCreativity.recommendedRange,
            note: creativityAssessment.severity === 'balanced'
                ? 'Creativity is in the normal editing band for this family.'
                : creativityAssessment.direction === 'high'
                    ? 'High creativity can overwhelm the source image and collapse back toward a re-roll.'
                    : 'Low creativity can keep the source so dominant that prompt changes barely land.',
        });
        if (creativityAssessment.severity !== 'balanced') {
            const highDirection = creativityAssessment.direction === 'high';
            issues.push({
                id: `img2img-${creativityAssessment.direction}`,
                category: 'img2img',
                severity: creativityAssessment.severity,
                familyLabel: profile.label,
                title: highDirection ? 'Img2Img creativity is too high' : 'Img2Img creativity is too low',
                description: highDirection
                    ? 'When creativity is too high, the source image loses its structure and the edit behaves more like a loosely seeded regeneration.'
                    : 'When creativity is too low, the model may not have enough denoising room to meaningfully apply the new prompt.',
                recommendation: `Move creativity toward ${profile.img2imgCreativity.recommendedRange}.`,
                overrides: { initimagecreativity: profile.img2imgCreativity.target },
                currentValue: formatValue(initCreativity),
                recommendedRange: profile.img2imgCreativity.recommendedRange,
                evidence: profile.img2imgCreativity.evidence,
                symptoms: highDirection
                    ? ['loss of original structure', 'uncontrolled edits', 'prompt drift']
                    : ['tiny visible change', 'source image dominates', 'weak prompt effect'],
            });
        }
    }

    return { issues, parameterHealth };
}
