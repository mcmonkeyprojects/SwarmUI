import { describe, expect, it } from 'vitest';
import { analyzeGenerateQuality } from './qualityCoach';
import { getCurrentMatrixCell } from './qualityCoachLearningData';

describe('quality coach learning engine', () => {
    it('flags the SDXL sweet spot as balanced in the matrix', () => {
        const cell = getCurrentMatrixCell(7, 28);

        expect(cell.title).toBe('Sweet spot');
        expect(cell.severity).toBe('balanced');
    });

    it('keeps stable CFG and step edges balanced in the matrix', () => {
        expect(getCurrentMatrixCell(4, 18).severity).toBe('balanced');
        expect(getCurrentMatrixCell(10, 45).severity).toBe('balanced');
    });

    it('flags high CFG with low steps as a high-risk bake state', () => {
        const cell = getCurrentMatrixCell(20, 8);

        expect(cell.title).toBe('Burnt outside, raw inside');
        expect(cell.severity).toBe('high-risk');
    });

    it('marks extreme SDXL settings as high risk', () => {
        const result = analyzeGenerateQuality(
            {
                model: 'sdxl-test',
                cfgscale: 27,
                steps: 1,
                width: 1024,
                height: 1024,
            },
            {
                name: 'sdxl-test',
                class: 'sdxl',
                architecture: 'sdxl',
            }
        );

        expect(result.overallSeverity).toBe('high-risk');
        expect(result.overallLabel).toBe('High Risk');
        expect(result.issues.some((issue) => issue.id === 'cfg-high')).toBe(true);
        expect(result.issues.some((issue) => issue.id === 'steps-low')).toBe(true);
    });

    it('does not warn on common native-area SDXL portrait and landscape sizes', () => {
        const portrait = analyzeGenerateQuality(
            {
                model: 'sdxl-test',
                cfgscale: 6.5,
                steps: 30,
                width: 896,
                height: 1152,
            },
            {
                name: 'sdxl-test',
                class: 'sdxl',
                architecture: 'sdxl',
            }
        );
        const wide = analyzeGenerateQuality(
            {
                model: 'sdxl-test',
                cfgscale: 6.5,
                steps: 30,
                width: 1344,
                height: 768,
            },
            {
                name: 'sdxl-test',
                class: 'sdxl',
                architecture: 'sdxl',
            }
        );

        expect(portrait.overallSeverity).toBe('balanced');
        expect(portrait.issues.some((issue) => issue.id === 'resolution-range')).toBe(false);
        expect(wide.overallSeverity).toBe('balanced');
        expect(wide.issues.some((issue) => issue.id === 'resolution-range')).toBe(false);
    });

    it('does not warn on stable SDXL CFG and step values near the edge of the normal range', () => {
        const result = analyzeGenerateQuality(
            {
                model: 'sdxl-test',
                cfgscale: 9,
                steps: 45,
                width: 1024,
                height: 1024,
            },
            {
                name: 'sdxl-test',
                class: 'sdxl',
                architecture: 'sdxl',
            }
        );

        expect(result.overallSeverity).toBe('balanced');
        expect(result.issues.some((issue) => issue.id === 'cfg-high')).toBe(false);
        expect(result.issues.some((issue) => issue.id === 'steps-high')).toBe(false);
    });

    it('ignores dormant refiner defaults when diffusion refinement is inactive', () => {
        const result = analyzeGenerateQuality(
            {
                model: 'sdxl-test',
                cfgscale: 6.5,
                steps: 30,
                width: 1024,
                height: 1024,
                refinermodel: '',
                refinercontrol: 0,
                refinercontrolpercentage: 0,
                refinersteps: 40,
                refinercfgscale: 7,
            },
            {
                name: 'sdxl-test',
                class: 'sdxl',
                architecture: 'sdxl',
            }
        );

        expect(result.overallSeverity).toBe('balanced');
        expect(result.issues.some((issue) => issue.category === 'refiner')).toBe(false);
    });

    it('checks refiner overrides when diffusion refinement is active', () => {
        const result = analyzeGenerateQuality(
            {
                model: 'sdxl-test',
                cfgscale: 6.5,
                steps: 30,
                width: 1024,
                height: 1024,
                refinermodel: 'sdxl-refiner',
                refinercontrol: 0.2,
                refinercontrolpercentage: 0.2,
                refinersteps: 40,
                refinercfgscale: 7,
            },
            {
                name: 'sdxl-test',
                class: 'sdxl',
                architecture: 'sdxl',
            }
        );

        expect(result.overallSeverity).toBe('high-risk');
        expect(result.issues.some((issue) => issue.id === 'refiner-steps-high')).toBe(true);
    });

    it('falls back unknown families to the illustrious profile', () => {
        const result = analyzeGenerateQuality(
            {
                model: 'mystery-checkpoint',
                cfgscale: 7,
                steps: 28,
                width: 1024,
                height: 1024,
            },
            {
                name: 'mystery-checkpoint',
            }
        );

        expect(result.familyLabel).toBe('Illustrious / SDXL Derivative');
    });
});
