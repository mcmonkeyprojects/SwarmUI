export interface VaeSelectOption {
    value: string;
    label: string;
    disabled?: boolean;
}

export const VAE_ALTERNATIVE_EMPTY_MESSAGE = 'No VAE alternatives detected. Add a decoder-compatible VAE alternative file to Models/VAE, then refresh models.';

const BASE_VAE_VALUES = new Set(['', 'Automatic', 'None']);
const SETUP_VALUE_PREFIX = '__setup:';
const VAE_ALTERNATIVE_TERMS = [
    'ssdd',
    'single step diffusion decoder',
    'single-step diffusion decoder',
    'flow matching decoder',
    'flow-matching decoder',
    'kl decoder',
    'consistency decoder',
    'pid',
    'pixel diffusion decoder',
];

const VAE_ALTERNATIVE_SETUP_OPTIONS: VaeSelectOption[] = [
    {
        value: `${SETUP_VALUE_PREFIX}ssdd`,
        label: 'SSDD decoder - setup required',
        disabled: true,
    },
    {
        value: `${SETUP_VALUE_PREFIX}consistency-decoder`,
        label: 'OpenAI Consistency Decoder - install GlifNodes',
        disabled: true,
    },
    {
        value: `${SETUP_VALUE_PREFIX}supir`,
        label: 'SUPIR - use upscale/restoration workflow',
        disabled: true,
    },
];

const VAE_ALTERNATIVE_OPTION_DESCRIPTIONS: Record<string, string> = {
    [`${SETUP_VALUE_PREFIX}ssdd`]: 'SSDD is a decoder replacement, but no verified Swarm/Comfy route is installed yet.',
    [`${SETUP_VALUE_PREFIX}consistency-decoder`]: 'Use GlifNodes or another compatible custom Comfy workflow for consistency decoder weights.',
    [`${SETUP_VALUE_PREFIX}supir`]: 'SUPIR is an upscale/restoration engine, not a VAE. Use it from a SUPIR Comfy workflow.',
};

export function isVaeAlternativeOption(option: VaeSelectOption): boolean {
    if (BASE_VAE_VALUES.has(option.value)) {
        return false;
    }

    if (option.value.startsWith(SETUP_VALUE_PREFIX)) {
        return true;
    }

    const haystack = `${option.value} ${option.label}`.toLowerCase();
    return VAE_ALTERNATIVE_TERMS.some((term) => haystack.includes(term));
}

export function splitVaeOptions(options: VaeSelectOption[]): {
    standardOptions: VaeSelectOption[];
    alternativeOptions: VaeSelectOption[];
} {
    const standardOptions: VaeSelectOption[] = [];
    const alternativeOptions: VaeSelectOption[] = [];

    for (const option of options) {
        if (isVaeAlternativeOption(option)) {
            alternativeOptions.push(option);
        }
        else {
            standardOptions.push(option);
        }
    }

    return {
        standardOptions,
        alternativeOptions,
    };
}

export function isVaeAlternativeValue(value: unknown, options: VaeSelectOption[]): boolean {
    if (typeof value !== 'string' || !value) {
        return false;
    }

    if (value.startsWith(SETUP_VALUE_PREFIX)) {
        return false;
    }

    return splitVaeOptions(options).alternativeOptions.some((option) => option.value === value);
}

export function getVaeAlternativeDisplayOptions(options: VaeSelectOption[]): VaeSelectOption[] {
    const optionValues = new Set(options.map((option) => option.value));
    const setupOptions = VAE_ALTERNATIVE_SETUP_OPTIONS.filter((option) => !optionValues.has(option.value));

    return [...options, ...setupOptions];
}

export function getVaeAlternativeOptionDescription(value: string): string {
    return VAE_ALTERNATIVE_OPTION_DESCRIPTIONS[value] || '';
}
