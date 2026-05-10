/**
 * QuickModeIndicator Component
 * 
 * Shows when a similar prompt is detected in cache, enabling "Quick Variation" mode
 * that can reuse cached computation for faster generation.
 */

import { memo, useMemo } from 'react';
import { Badge, Tooltip, Group } from '@mantine/core';
import { IconBolt, IconRefresh } from '@tabler/icons-react';
import { usePromptSimilarity } from '../hooks/usePromptSimilarity';
import { usePromptCacheStore } from '../stores/promptCacheStore';
import { SwarmActionIcon as ActionIcon } from './ui';

// ============================================================================
// Types
// ============================================================================

interface QuickModeIndicatorProps {
    /** Current prompt text */
    prompt: string;
    /** Current model name */
    model: string;
    /** Optional negative prompt */
    negativePrompt?: string;
    /** Callback when quick mode is toggled */
    onQuickModeChange?: (enabled: boolean) => void;
    /** Whether quick mode is currently enabled */
    quickModeEnabled?: boolean;
    /** Show compact version */
    compact?: boolean;
}

// ============================================================================
// Component
// ============================================================================

export const QuickModeIndicator = memo(function QuickModeIndicator({
    prompt,
    model,
    negativePrompt,
    onQuickModeChange,
    quickModeEnabled = false,
    compact = false,
}: QuickModeIndicatorProps) {

    const {
        hasSimilar,
        canQuickGenerate,
        similarity,
        diffSummary,
        addedTokens,
        removedTokens,
        isExactMatch,
        cachePrompt,
    } = usePromptSimilarity(prompt, model, negativePrompt);

    const cacheSize = usePromptCacheStore(state => Object.keys(state.entries).length);

    // Detailed tooltip content
    const tooltipContent = useMemo(() => {
        if (isExactMatch) {
            return 'Exact prompt match found in cache';
        }
        if (!hasSimilar) {
            return `No similar prompts cached (${cacheSize} entries)`;
        }

        const parts: string[] = [];
        parts.push(`Similarity: ${Math.round(similarity * 100)}%`);

        if (addedTokens.length > 0) {
            parts.push(`Added: ${addedTokens.slice(0, 3).join(', ')}${addedTokens.length > 3 ? '...' : ''}`);
        }
        if (removedTokens.length > 0) {
            parts.push(`Removed: ${removedTokens.slice(0, 3).join(', ')}${removedTokens.length > 3 ? '...' : ''}`);
        }

        if (canQuickGenerate) {
            parts.push('Quick mode available - minor changes detected');
        }

        return parts.join('\n');
    }, [hasSimilar, canQuickGenerate, similarity, addedTokens, removedTokens, isExactMatch, cacheSize]);

    // Don't render anything if no prompt
    if (!prompt.trim() || !model) {
        return null;
    }

    // Compact version - just a small indicator
    if (compact) {
        if (!hasSimilar && !isExactMatch) {
            return null;
        }

        return (
            <Tooltip label={tooltipContent} multiline w={300}>
                <Badge
                    size="xs"
                    color={canQuickGenerate ? 'green' : isExactMatch ? 'blue' : 'yellow'}
                    variant="light"
                    leftSection={<IconBolt size={10} />}
                >
                    {isExactMatch ? 'Cached' : canQuickGenerate ? 'Quick' : 'Similar'}
                </Badge>
            </Tooltip>
        );
    }

    // Full version with more details
    return (
        <Group gap="xs" wrap="nowrap">
            {/* Cache status badge */}
            <Tooltip label={tooltipContent} multiline w={300}>
                <Badge
                    size="sm"
                    color={
                        isExactMatch ? 'blue' :
                            canQuickGenerate ? 'green' :
                                hasSimilar ? 'yellow' :
                                    'gray'
                    }
                    variant={canQuickGenerate || isExactMatch ? 'filled' : 'light'}
                    leftSection={<IconBolt size={12} />}
                    style={{ cursor: 'help' }}
                >
                    {isExactMatch ? 'Exact Match' :
                        canQuickGenerate ? `Quick Mode (${diffSummary})` :
                            hasSimilar ? `Similar (${Math.round(similarity * 100)}%)` :
                                `Cache (${cacheSize})`}
                </Badge>
            </Tooltip>

            {/* Quick mode toggle (when available) */}
            {canQuickGenerate && onQuickModeChange && (
                <Tooltip label={quickModeEnabled ? 'Using quick mode' : 'Click to enable quick mode'}>
                    <ActionIcon
                        size="sm"
                        tone="success"
                        emphasis={quickModeEnabled ? 'solid' : 'soft'}
                        onClick={() => onQuickModeChange(!quickModeEnabled)}
                    >
                        <IconBolt size={14} />
                    </ActionIcon>
                </Tooltip>
            )}

            {/* Cache current prompt button (if not already cached) */}
            {!isExactMatch && !hasSimilar && (
                <Tooltip label="Cache this prompt for future quick variations">
                    <ActionIcon
                        size="sm"
                        tone="secondary"
                        emphasis="ghost"
                        onClick={cachePrompt}
                    >
                        <IconRefresh size={14} />
                    </ActionIcon>
                </Tooltip>
            )}
        </Group>
    );
});

QuickModeIndicator.displayName = 'QuickModeIndicator';

export default QuickModeIndicator;
