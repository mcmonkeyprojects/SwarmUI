import type { GenerateParams, Model } from '../../../api/types';
import {
    analyzeParameterRanges,
    classifyModelFamily,
    summarizeCoachStatus,
    type QualityCoachIssue,
    type QualityCoachParameterHealth,
    type QualityCoachSeverity,
} from './qualityCoachKnowledge';

export type { QualityCoachIssue, QualityCoachParameterHealth, QualityCoachSeverity } from './qualityCoachKnowledge';

export interface QualityCoachAnalysis {
    issues: QualityCoachIssue[];
    mergedOverrides: Partial<GenerateParams>;
    summary: string;
    checked: string[];
    overallSeverity: QualityCoachSeverity;
    overallLabel: string;
    familyLabel: string;
    parameterHealth: QualityCoachParameterHealth[];
}

const PROMPT_STOPWORDS = new Set([
    'about', 'after', 'again', 'also', 'around', 'because', 'before', 'being', 'between', 'could',
    'every', 'from', 'into', 'just', 'like', 'only', 'over', 'render', 'scene', 'should', 'some',
    'than', 'that', 'their', 'there', 'these', 'this', 'those', 'very', 'with', 'without', 'would',
    'background', 'foreground', 'style', 'image', 'photo', 'illustration'
]);

function toNumber(value: unknown): number | null {
    if (value === null || value === undefined || value === '') {
        return null;
    }
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
}

function isBetweenZeroAndOne(value: number | null): value is number {
    return value !== null && value >= 0 && value <= 1;
}

function extractPromptTerms(text: string | undefined): string[] {
    const normalized = `${text ?? ''}`
        .toLowerCase()
        .replace(/<[^>]+>/g, ' ')
        .replace(/[^a-z0-9\s-]/g, ' ')
        .split(/\s+/)
        .filter((term) => term.length >= 4 && !PROMPT_STOPWORDS.has(term));
    return [...new Set(normalized)].slice(0, 32);
}

function pushIssue(issues: QualityCoachIssue[], issue: QualityCoachIssue): void {
    if (!issues.some((existing) => existing.id === issue.id)) {
        issues.push(issue);
    }
}

function severityRank(severity: QualityCoachSeverity): number {
    if (severity === 'high-risk') return 2;
    if (severity === 'caution') return 1;
    return 0;
}

function compareIssues(a: QualityCoachIssue, b: QualityCoachIssue): number {
    const severityDelta = severityRank(b.severity) - severityRank(a.severity);
    if (severityDelta !== 0) {
        return severityDelta;
    }
    return a.title.localeCompare(b.title);
}

function analyzeControlNetRange(
    issues: QualityCoachIssue[],
    familyLabel: string,
    prefix: '' | 'two' | 'three',
    strength: number | null,
    start: number | null,
    end: number | null
): void {
    const label = prefix === '' ? 'ControlNet' : `ControlNet ${prefix === 'two' ? '2' : '3'}`;
    const strengthKey = prefix === '' ? 'controlnetstrength' : prefix === 'two' ? 'controlnettwostrength' : 'controlnetthreestrength';
    const startKey = prefix === '' ? 'controlnetstart' : prefix === 'two' ? 'controlnettwostart' : 'controlnetthreestart';
    const endKey = prefix === '' ? 'controlnetend' : prefix === 'two' ? 'controlnettwoend' : 'controlnetthreeend';

    if (strength !== null && strength > 1.45) {
        pushIssue(issues, {
            id: `${label.toLowerCase().replace(/\s+/g, '-')}-strength-high`,
            category: 'controlnet',
            severity: strength > 1.7 ? 'high-risk' : 'caution',
            familyLabel,
            title: `${label} strength is unusually high`,
            description: 'Strong ControlNet values can overpower composition, texture, and prompt intent instead of gently steering the image.',
            recommendation: 'Pull the control strength back unless you intentionally want a very rigid guide.',
            overrides: { [strengthKey]: 1.0 } as Partial<GenerateParams>,
            currentValue: `${strength}`,
            recommendedRange: 'Around 0.5-1.2',
            evidence: 'ControlNet usually works best as guidance, not as a near-hard constraint.',
            symptoms: ['overconstrained framing', 'prompt suppression', 'rigid detail'],
        });
    }

    if (isBetweenZeroAndOne(start) && isBetweenZeroAndOne(end) && start >= end) {
        pushIssue(issues, {
            id: `${label.toLowerCase().replace(/\s+/g, '-')}-range-invalid`,
            category: 'controlnet',
            severity: 'high-risk',
            familyLabel,
            title: `${label} start/end range is inverted`,
            description: 'A start value that meets or exceeds the end value can make the control behave unpredictably or have almost no useful window.',
            recommendation: 'Use an early start and a later end so the guidance has room to operate.',
            overrides: { [startKey]: 0, [endKey]: 1 } as Partial<GenerateParams>,
            currentValue: `${start} -> ${end}`,
            recommendedRange: 'Start near 0, end near 1',
            evidence: 'Control windows need room to shape the denoising schedule.',
            symptoms: ['weak control', 'inconsistent behavior'],
        });
    }

    if (isBetweenZeroAndOne(start) && start > 0.35) {
        pushIssue(issues, {
            id: `${label.toLowerCase().replace(/\s+/g, '-')}-start-late`,
            category: 'controlnet',
            severity: 'caution',
            familyLabel,
            title: `${label} starts unusually late`,
            description: 'Starting guidance late can make the control feel weak or inconsistent because most of the structural work is already done.',
            recommendation: 'Let the control begin earlier if it is meant to shape layout or pose.',
            overrides: { [startKey]: 0.0 } as Partial<GenerateParams>,
            currentValue: `${start}`,
            recommendedRange: 'Start 0.0-0.35',
            evidence: 'Most structural guidance is strongest early in denoising.',
            symptoms: ['weak pose control', 'composition drift'],
        });
    }

    if (isBetweenZeroAndOne(end) && end < 0.65) {
        pushIssue(issues, {
            id: `${label.toLowerCase().replace(/\s+/g, '-')}-end-early`,
            category: 'controlnet',
            severity: 'caution',
            familyLabel,
            title: `${label} ends unusually early`,
            description: 'Stopping guidance too early can make the result drift away from the intended structure before the image resolves.',
            recommendation: 'Keep the end point later unless you want the control to influence only the earliest stage.',
            overrides: { [endKey]: 1.0 } as Partial<GenerateParams>,
            currentValue: `${end}`,
            recommendedRange: 'End 0.65-1.0',
            evidence: 'Ending the control very early often weakens its visible effect.',
            symptoms: ['late-stage drift', 'weaker structural lock'],
        });
    }
}

export function analyzeGenerateQuality(params: Partial<GenerateParams>, selectedModel: Model | null): QualityCoachAnalysis {
    const family = classifyModelFamily(selectedModel, params);
    const { issues, parameterHealth } = analyzeParameterRanges(params, family);
    const initCreativity = toNumber(params.initimagecreativity);
    const steps = toNumber(params.steps);
    const variationStrength = toNumber(params.variationseedstrength);
    const clipStopAtLayer = toNumber(params.clipstopatlayer);
    const refinerSteps = toNumber(params.refinersteps);
    const refinerCfgScale = toNumber(params.refinercfgscale);
    const refinerControl = toNumber(params.refinercontrolpercentage ?? params.refinercontrol);
    const hasInitImage = Boolean(params.initimage);
    const hasRefiner = refinerControl !== null && refinerControl > 0;
    const checked = [
        'Prompt',
        'Negative prompt',
        'Model family',
        'Resolution',
        'Steps',
        'CFG',
        'Sampler',
        'Scheduler',
        'Refiner',
        'CLIP',
        'ControlNet',
        'Variation',
        hasInitImage ? 'Img2Img' : 'Txt2Img',
    ];

    if (hasInitImage && steps !== null && initCreativity !== null && initCreativity > 0 && initCreativity < 1) {
        const effectiveSteps = steps * initCreativity;
        if (effectiveSteps < 12) {
            pushIssue(issues, {
                id: 'img2img-effective-steps',
                category: 'img2img',
                severity: effectiveSteps < 8 ? 'high-risk' : 'caution',
                familyLabel: family.label,
                title: 'Img2Img effective steps are running low',
                description: `At this creativity setting you are only getting about ${effectiveSteps.toFixed(1)} effective denoise steps.`,
                recommendation: 'Raise steps a little so the init image has enough room to resolve cleanly.',
                overrides: { steps: Math.max(steps, Math.ceil(12 / initCreativity)) },
                currentValue: `${effectiveSteps.toFixed(1)} effective steps`,
                recommendedRange: 'At least 12 effective denoise steps',
                evidence: 'Img2img needs enough effective denoising room for the edited image to fully resolve.',
                symptoms: ['muddy detail', 'under-resolved edits', 'partial prompt application'],
            });
        }
    }

    if (hasRefiner && refinerSteps !== null && refinerSteps > 25) {
        pushIssue(issues, {
            id: 'refiner-steps-high',
            category: 'refiner',
            severity: refinerSteps > 35 ? 'high-risk' : 'caution',
            familyLabel: family.label,
            title: 'Refiner step count is unusually high',
            description: 'Long refiner passes can overcook details, sharpen artifacts, or waste time without improving the image much.',
            recommendation: 'Keep the refiner pass short unless this workflow clearly benefits from extra refinement.',
            overrides: { refinersteps: 14 },
            currentValue: `${refinerSteps}`,
            recommendedRange: 'About 8-18 refiner steps',
            evidence: 'Refiners generally work best as a short second pass rather than a full second denoising run.',
            symptoms: ['overprocessed finish', 'brittle detail', 'longer runtimes'],
        });
    }

    if (hasRefiner && refinerCfgScale !== null && refinerCfgScale >= 10) {
        pushIssue(issues, {
            id: 'refiner-cfg-high',
            category: 'refiner',
            severity: refinerCfgScale >= 14 ? 'high-risk' : 'caution',
            familyLabel: family.label,
            title: 'Refiner CFG is set unusually high',
            description: 'High guidance in the refinement stage can harden fine detail and introduce a processed or brittle finish.',
            recommendation: 'Use a gentler CFG in the refiner unless you need a very assertive second pass.',
            overrides: { refinercfgscale: 6 },
            currentValue: `${refinerCfgScale}`,
            recommendedRange: 'About 4-7 refiner CFG',
            evidence: 'Refiner guidance usually works best below the kind of aggressive CFG values that already stress the base pass.',
            symptoms: ['crunchy detail', 'harsh edges', 'overbaked highlights'],
        });
    }

    if (hasRefiner && refinerControl !== null && refinerControl > 80) {
        pushIssue(issues, {
            id: 'refiner-control-high',
            category: 'refiner',
            severity: refinerControl > 90 ? 'high-risk' : 'caution',
            familyLabel: family.label,
            title: 'Refiner takeover is unusually aggressive',
            description: 'Letting the refiner dominate too much can replace good base-image structure with a heavier second-pass look.',
            recommendation: 'Dial the refiner control back if the final image feels overworked or drifts too far.',
            overrides: { refinercontrolpercentage: 50 },
            currentValue: `${refinerControl}%`,
            recommendedRange: 'About 25-70%',
            evidence: 'Refiner handoff usually works best as a blend rather than a full takeover.',
            symptoms: ['style drift', 'overworked finish', 'loss of base composition'],
        });
    }

    if (clipStopAtLayer !== null && Math.abs(clipStopAtLayer) >= 4) {
        pushIssue(issues, {
            id: 'clip-stop-extreme',
            category: 'clip',
            severity: Math.abs(clipStopAtLayer) >= 6 ? 'high-risk' : 'caution',
            familyLabel: family.label,
            title: 'CLIP stop at layer is set to an extreme value',
            description: 'Aggressive CLIP stop values can distort prompt interpretation and make results less stable or less faithful.',
            recommendation: 'Stay closer to the usual range unless you are intentionally using a model-specific CLIP skip trick.',
            overrides: { clipstopatlayer: clipStopAtLayer < 0 ? -2 : 2 },
            currentValue: `${clipStopAtLayer}`,
            recommendedRange: 'Usually around -2 to 2',
            evidence: 'Extreme CLIP stop values alter prompt encoding behavior and are rarely a general-purpose quality improvement.',
            symptoms: ['unusual prompt response', 'unstable style', 'less faithful composition'],
        });
    }

    analyzeControlNetRange(
        issues,
        family.label,
        '',
        toNumber(params.controlnetstrength),
        toNumber(params.controlnetstart),
        toNumber(params.controlnetend)
    );
    analyzeControlNetRange(
        issues,
        family.label,
        'two',
        toNumber(params.controlnettwostrength),
        toNumber(params.controlnettwostart),
        toNumber(params.controlnettwoend)
    );
    analyzeControlNetRange(
        issues,
        family.label,
        'three',
        toNumber(params.controlnetthreestrength),
        toNumber(params.controlnetthreestart),
        toNumber(params.controlnetthreeend)
    );

    if (variationStrength !== null && variationStrength > 0.45) {
        pushIssue(issues, {
            id: 'variation-strength-high',
            category: 'variation',
            severity: variationStrength > 0.7 ? 'high-risk' : 'caution',
            familyLabel: family.label,
            title: 'Variation seed strength is unusually high',
            description: 'Strong variation values can move so far from the seed that consistency drops and the run behaves more like a re-roll.',
            recommendation: 'Lower variation strength if you want the new image to stay meaningfully related to the original seed.',
            overrides: { variationseedstrength: 0.2 },
            currentValue: `${variationStrength}`,
            recommendedRange: 'Usually around 0.05-0.30',
            evidence: 'Variation strength is meant for controlled drift, not for replacing the seeded composition entirely.',
            symptoms: ['seed inconsistency', 'composition drift', 'weaker comparability'],
        });
    }

    const promptTerms = extractPromptTerms(params.prompt);
    const negativeTerms = new Set(extractPromptTerms(params.negativeprompt));
    const conflicts = promptTerms.filter((term) => negativeTerms.has(term)).slice(0, 5);
    if (conflicts.length > 0) {
        pushIssue(issues, {
            id: 'prompt-conflict',
            category: 'prompt',
            severity: conflicts.length >= 3 ? 'high-risk' : 'caution',
            familyLabel: family.label,
            title: 'Prompt and negative prompt are fighting each other',
            description: `These concepts appear in both: ${conflicts.join(', ')}.`,
            recommendation: 'Remove duplicate concepts from one side so the model is not getting contradictory guidance.',
            overrides: {},
            currentValue: conflicts.join(', '),
            recommendedRange: 'No direct prompt/negative overlap',
            evidence: 'Contradictory guidance makes prompt adherence less predictable.',
            symptoms: ['muddy concept rendering', 'weak adherence', 'composition uncertainty'],
        });
    }

    issues.sort(compareIssues);

    const mergedOverrides: Partial<GenerateParams> = {};
    for (const issue of issues) {
        Object.assign(mergedOverrides, issue.overrides);
    }

    const coachStatus = summarizeCoachStatus(issues);
    const summary = issues.length === 0
        ? `${coachStatus.summary} Family detected: ${family.label}.`
        : `${coachStatus.summary} Family detected: ${family.label}. Top issue${issues.length === 1 ? '' : 's'}: ${issues.slice(0, 2).map((issue) => issue.title).join('; ')}.`;

    return {
        issues,
        mergedOverrides,
        summary,
        checked,
        overallSeverity: coachStatus.overallSeverity,
        overallLabel: coachStatus.label,
        familyLabel: family.label,
        parameterHealth,
    };
}

export function formatCoachOverrideLabel(key: keyof GenerateParams, value: unknown, current: Partial<GenerateParams>): string {
    const labels: Partial<Record<keyof GenerateParams, string>> = {
        cfgscale: 'CFG Scale',
        steps: 'Steps',
        width: 'Width',
        height: 'Height',
        sampler: 'Sampler',
        scheduler: 'Scheduler',
        initimagecreativity: 'Creativity',
        refinersteps: 'Refiner Steps',
        refinercfgscale: 'Refiner CFG',
        refinercontrolpercentage: 'Refiner Control %',
        clipstopatlayer: 'CLIP Stop At Layer',
        controlnetstrength: 'ControlNet Strength',
        controlnetstart: 'ControlNet Start',
        controlnetend: 'ControlNet End',
        controlnettwostrength: 'ControlNet 2 Strength',
        controlnettwostart: 'ControlNet 2 Start',
        controlnettwoend: 'ControlNet 2 End',
        controlnetthreestrength: 'ControlNet 3 Strength',
        controlnetthreestart: 'ControlNet 3 Start',
        controlnetthreeend: 'ControlNet 3 End',
        variationseedstrength: 'Variation Strength',
    };
    const before = current[key];
    return `${labels[key] ?? key}: ${before ?? '(unset)'} -> ${value ?? '(unset)'}`;
}
