import { applyCorrections, scanLanguageOffline } from './languageCorrection';
import {
    PRESET_PROMPT_SECTION_ORDER,
    type PresetCategory,
    type PresetPromptSection,
} from '../features/presetLibrary/types';

const PRESET_LIBRARY_BLOCK_START = '<comment:swarm-preset-library-start:v1>';
const PRESET_LIBRARY_BLOCK_END = '<comment:swarm-preset-library-end>';
const PRESET_SECTION_COMMENT_PREFIX = '<comment:swarm-preset-section:';
const PRESET_SECTION_COMMENT_SUFFIX = '>';

export function prependPromptText(currentValue: string | undefined, nextText: string): string {
    const trimmedCurrent = currentValue?.trim() ?? '';
    const trimmedNext = nextText.trim();

    if (!trimmedNext) {
        return trimmedCurrent;
    }

    return trimmedCurrent ? `${trimmedNext}, ${trimmedCurrent}` : trimmedNext;
}

function dedupePromptWords(words: string[]): string[] {
    const seen = new Set<string>();
    const deduped: string[] = [];

    for (const word of words) {
        const trimmedWord = word.trim();
        const key = trimmedWord.toLowerCase();
        if (!key || seen.has(key)) {
            continue;
        }

        seen.add(key);
        deduped.push(trimmedWord);
    }

    return deduped;
}

function splitPromptWords(text: string): string[] {
    return dedupePromptWords(text.split(',').map((word) => word.trim()));
}

function sectionText(words: string[]): string {
    return dedupePromptWords(words).join(', ');
}

export function formatPresetSectionsForPrompt(sections: PresetPromptSection[]): string {
    const sectionByCategory = new Map<PresetCategory, string[]>();

    for (const section of sections) {
        const existingWords = sectionByCategory.get(section.category) ?? [];
        sectionByCategory.set(
            section.category,
            dedupePromptWords([...existingWords, ...section.words])
        );
    }

    const lines: string[] = [];
    for (const category of PRESET_PROMPT_SECTION_ORDER) {
        const words = sectionByCategory.get(category) ?? [];
        if (words.length > 0) {
            lines.push(sectionText(words));
        }
    }

    return lines.join('\n');
}

function extractPresetLibraryBlock(
    prompt: string
): { start: number; end: number; inner: string } | null {
    const start = prompt.indexOf(PRESET_LIBRARY_BLOCK_START);
    if (start === -1) {
        return null;
    }

    const endTokenPos = prompt.indexOf(
        PRESET_LIBRARY_BLOCK_END,
        start + PRESET_LIBRARY_BLOCK_START.length
    );
    if (endTokenPos === -1) {
        return null;
    }

    return {
        start,
        end: endTokenPos + PRESET_LIBRARY_BLOCK_END.length,
        inner: prompt.slice(start + PRESET_LIBRARY_BLOCK_START.length, endTokenPos).trim(),
    };
}

function parsePresetLibraryBlock(inner: string): PresetPromptSection[] {
    const sections: PresetPromptSection[] = [];
    let activeCategory: PresetCategory | null = null;

    for (const line of inner.split('\n')) {
        const trimmedLine = line.trim();
        if (!trimmedLine) {
            continue;
        }

        if (
            trimmedLine.startsWith(PRESET_SECTION_COMMENT_PREFIX) &&
            trimmedLine.endsWith(PRESET_SECTION_COMMENT_SUFFIX)
        ) {
            const category = trimmedLine
                .slice(PRESET_SECTION_COMMENT_PREFIX.length, -PRESET_SECTION_COMMENT_SUFFIX.length)
                .trim() as PresetCategory;
            activeCategory = PRESET_PROMPT_SECTION_ORDER.includes(category) ? category : null;
            continue;
        }

        if (!activeCategory) {
            continue;
        }

        const words = splitPromptWords(trimmedLine);
        if (words.length > 0) {
            sections.push({
                category: activeCategory,
                words,
                text: sectionText(words),
            });
        }
    }

    return sections;
}

function renderManagedPresetLibraryBlock(sections: PresetPromptSection[]): string {
    const sectionByCategory = new Map<PresetCategory, string[]>();

    for (const section of sections) {
        const existingWords = sectionByCategory.get(section.category) ?? [];
        sectionByCategory.set(
            section.category,
            dedupePromptWords([...existingWords, ...section.words])
        );
    }

    const lines = [PRESET_LIBRARY_BLOCK_START];
    for (const category of PRESET_PROMPT_SECTION_ORDER) {
        const words = sectionByCategory.get(category) ?? [];
        if (words.length === 0) {
            continue;
        }

        lines.push(`${PRESET_SECTION_COMMENT_PREFIX}${category}${PRESET_SECTION_COMMENT_SUFFIX}`);
        lines.push(sectionText(words));
    }
    lines.push(PRESET_LIBRARY_BLOCK_END);

    return lines.join('\n');
}

export function appendPresetSectionsToPrompt(
    currentValue: string | undefined,
    sections: PresetPromptSection[]
): string {
    const trimmedCurrent = currentValue?.trim() ?? '';
    if (sections.length === 0) {
        return trimmedCurrent;
    }

    const existingBlock = extractPresetLibraryBlock(trimmedCurrent);
    const existingSections = existingBlock ? parsePresetLibraryBlock(existingBlock.inner) : [];
    const managedBlock = renderManagedPresetLibraryBlock([...existingSections, ...sections]);

    if (!trimmedCurrent) {
        return managedBlock;
    }

    if (existingBlock) {
        const before = trimmedCurrent.slice(0, existingBlock.start).trim();
        const after = trimmedCurrent.slice(existingBlock.end).trim();
        return [before, managedBlock, after].filter(Boolean).join('\n\n');
    }

    return `${managedBlock}\n\n${trimmedCurrent}`;
}

/**
 * Prompt-focused text cleanup and conservative spelling correction.
 */
export function autocorrectPromptText(text: string): string {
    let corrected = text;

    corrected = corrected.replace(/  +/g, ' ');
    corrected = corrected.replace(/,+/g, ',');
    corrected = corrected.replace(/,\s*,/g, ',');
    corrected = corrected.replace(/\s+,/g, ',');
    corrected = corrected.replace(/,([^\s)])/g, ', $1');
    corrected = corrected.split('\n').map(line => line.trim()).join('\n');
    corrected = corrected.replace(/\n{3,}/g, '\n\n');
    corrected = corrected.replace(/,\s*\n/g, '\n');
    corrected = corrected.replace(/\(\s+/g, '(');
    corrected = corrected.replace(/\s+\)/g, ')');

    const scanResult = scanLanguageOffline(corrected);
    if (scanResult.matches.length > 0) {
        corrected = applyCorrections(corrected, scanResult.matches);
    }

    return corrected.trim();
}
