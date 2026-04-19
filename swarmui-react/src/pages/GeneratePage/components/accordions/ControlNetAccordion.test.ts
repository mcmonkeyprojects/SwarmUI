import { describe, expect, it } from 'vitest';
import { PREPROCESSOR_OPTIONS } from './ControlNetAccordion';

describe('PREPROCESSOR_OPTIONS', () => {
    it('has Auto as the first option with empty string sentinel', () => {
        expect(PREPROCESSOR_OPTIONS[0].value).toBe('');
        expect(PREPROCESSOR_OPTIONS[0].label).toMatch(/auto/i);
    });

    it('includes None as an explicit option', () => {
        const none = PREPROCESSOR_OPTIONS.find((o: { value: string; label: string }) => o.value === 'None');
        expect(none).toBeDefined();
    });

    it('includes all expected backend preprocessor values', () => {
        const values = PREPROCESSOR_OPTIONS.map((o: { value: string; label: string }) => o.value);
        expect(values).toContain('Canny');
        expect(values).toContain('SDPoseDrawKeypoints');
        expect(values).toContain('SDPoseFaceBBoxes');
        expect(values).toContain('SDPoseKeypointExtractor');
        expect(values).toContain('CropByBBoxes');
    });

    it('has no duplicate values', () => {
        const values = PREPROCESSOR_OPTIONS.map((o: { value: string; label: string }) => o.value);
        expect(new Set(values).size).toBe(values.length);
    });
});
