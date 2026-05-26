import { describe, expect, it } from 'vitest';
import {
    appendPresetSectionsToPrompt,
    normalizePromptForGeneration,
    stripPresetLibraryBlocksForGeneration,
} from './promptTextTools';

describe('promptTextTools generation normalization', () => {
    it('renders preset library managed blocks as plain prompt text for backend requests', () => {
        const prompt = [
            '<comment:swarm-preset-library-start:v1>',
            '<comment:swarm-preset-section:quality>',
            'masterpiece, best quality',
            '<comment:swarm-preset-section:characters>',
            '1girl, solo',
            '<comment:swarm-preset-library-end>',
            '',
            'portrait',
        ].join('\n');

        expect(stripPresetLibraryBlocksForGeneration(prompt)).toBe([
            'masterpiece, best quality',
            '1girl, solo',
            '',
            'portrait',
        ].join('\n'));
    });

    it('normalizes React embedding aliases to the backend canonical embed tag', () => {
        expect(
            normalizePromptForGeneration(
                '<embedding:Smooth_Embeddings_-_Smooth_Pos-_Illustrious+.safetensors> masterpiece'
            )
        ).toBe('<embed:Smooth_Embeddings_-_Smooth_Pos-_Illustrious+.safetensors> masterpiece');
    });

    it('combines preset block rendering with embedding normalization', () => {
        const prompt = [
            '<embedding:folder/example.safetensors>',
            '<comment:swarm-preset-library-start:v1>',
            '<comment:swarm-preset-section:styles>',
            'oil painting, high contrast',
            '<comment:swarm-preset-library-end>',
        ].join('\n');

        expect(normalizePromptForGeneration(prompt)).toBe([
            '<embed:folder/example.safetensors>',
            '',
            'oil painting, high contrast',
        ].join('\n'));
    });

    it('appends preset sections as plain prompt text without managed comment markers', () => {
        expect(
            appendPresetSectionsToPrompt('portrait', [
                {
                    category: 'quality',
                    words: ['masterpiece', 'best quality'],
                    text: 'masterpiece, best quality',
                },
            ])
        ).toBe('masterpiece, best quality\n\nportrait');
    });
});
