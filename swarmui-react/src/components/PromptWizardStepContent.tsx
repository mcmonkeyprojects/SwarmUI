import { memo, useMemo, useState } from 'react';
import { Box, Group, ScrollArea, Stack, Text, Select, UnstyledButton } from '@mantine/core';
import { IconFilter } from '@tabler/icons-react';
import { SwarmBadge, ElevatedCard } from './ui';
import { PromptWizardTagChip } from './PromptWizardTagChip';
import { PromptWizardSuggestionStrip } from './PromptWizardSuggestionStrip';
import { usePromptWizardStore } from '../stores/promptWizardStore';
import type { PromptTag, StepMeta } from '../features/promptWizard/types';

interface PromptWizardStepContentProps {
  stepMeta: StepMeta;
  tags: PromptTag[];
  allTags: PromptTag[];
  selectedTagIds: Set<string>;
  manualNegativeTexts: string[];
  searchQuery: string;
  onToggleTag: (tagId: string) => void;
  onAddNegativePair: (text: string) => void;
  onFocusGroup: (groupKey: string) => void;
}

type SelectionFilter = 'all' | 'selected' | 'unselected';

interface MinorGroupData {
  name: string;
  order: number;
  tags: PromptTag[];
}

interface MajorGroupData {
  name: string;
  order: number;
  description: string;
  tone: string;
  minorGroups: MinorGroupData[];
  totalCount: number;
}

interface SubcategoryData {
  name: string;
  majorGroups: MajorGroupData[];
  totalCount: number;
}

// --- Mapping from step → majorGroup name → metadata ---

const STEP_GROUP_META: Record<
  string,
  Record<string, { description: string; tone: string; order: number }>
> = {
  subject: {
    'People & Roles': {
      description: 'Human-led subjects, professions, classes, and archetypes.',
      tone: 'info',
      order: 10,
    },
    'Creatures & Beings': {
      description: 'Animals, hybrids, mythic beings, and monsters.',
      tone: 'warning',
      order: 20,
    },
    'Objects & Props': {
      description: 'Weapons, tools, artifacts, vehicles, and object subjects.',
      tone: 'secondary',
      order: 30,
    },
    'Scenes & Themes': {
      description: 'Scene-led concepts, narrative themes, and content framing.',
      tone: 'secondary',
      order: 40,
    },
    'Explicit Content': {
      description: 'Adult tags, erotic concepts, and explicit content framing.',
      tone: 'danger',
      order: 50,
    },
  },
  appearance: {
    'Face & Hair': {
      description: 'Hair, eyes, facial styling, and head details.',
      tone: 'warning',
      order: 10,
    },
    'Body & Silhouette': {
      description: 'Build, proportions, skin, curves, and body finish.',
      tone: 'warning',
      order: 20,
    },
    'Clothing & Uniforms': {
      description: 'Outfits, uniforms, intimate wear, costumes, and armor.',
      tone: 'secondary',
      order: 30,
    },
    'Accessories & Finish': {
      description: 'Footwear, jewelry, headwear, and worn finishing details.',
      tone: 'secondary',
      order: 40,
    },
    'Explicit Appearance': {
      description: 'Nudity, revealing details, and adult appearance tags.',
      tone: 'danger',
      order: 50,
    },
  },
  action: {
    'Framing & View': {
      description: 'Shot framing, crop, point of view, and camera direction.',
      tone: 'success',
      order: 10,
    },
    'Pose & Stance': {
      description: 'Static pose families, posture, and presenting body language.',
      tone: 'warning',
      order: 20,
    },
    'Motion & Energy': {
      description: 'Locomotion, action beats, and movement-driven language.',
      tone: 'secondary',
      order: 30,
    },
    'Interaction & Expression': {
      description: 'Gestures, contact, and emotional or reactive cues.',
      tone: 'secondary',
      order: 40,
    },
    'Explicit Actions': {
      description: 'Adult interactions, intimacy, and explicit action tags.',
      tone: 'danger',
      order: 50,
    },
  },
  setting: {
    'Composition & Camera': {
      description: 'Camera language, shot construction, and perspective.',
      tone: 'primary',
      order: 10,
    },
    'Architecture & Urban': {
      description: 'Indoor spaces, city locations, travel spots, and interiors.',
      tone: 'warning',
      order: 20,
    },
    'Nature & Outdoor': {
      description: 'Landscape, terrain, coast, gardens, weather, and seasons.',
      tone: 'secondary',
      order: 30,
    },
    'Fantasy & Specialty': {
      description: 'Mythic, haunted, sacred, royal, and futuristic environments.',
      tone: 'secondary',
      order: 40,
    },
    'Scenes & Concepts': {
      description: 'Scene ideas, subject emphasis, scale cues, and conceptual framing.',
      tone: 'info',
      order: 50,
    },
  },
  style: {
    'Medium & Rendering': {
      description: 'Render medium, realism, digital production, and craft.',
      tone: 'danger',
      order: 10,
    },
    'Aesthetic & Genre': {
      description: 'Genre language, graphic aesthetics, retro looks, and mood.',
      tone: 'warning',
      order: 20,
    },
    'Artists & References': {
      description: 'Named artists, studios, franchises, and direct style references.',
      tone: 'secondary',
      order: 30,
    },
    'Surface & Finish': {
      description: 'Texture, color finish, abstract polish, and decorative treatment.',
      tone: 'secondary',
      order: 40,
    },
  },
  atmosphere: {
    Lighting: {
      description: 'Light quality, temperature, and illumination mood.',
      tone: 'warning',
      order: 10,
    },
    'Mood & Emotion': {
      description: 'Emotional tone, intimacy, tension, calm, and scene feeling.',
      tone: 'warning',
      order: 20,
    },
    'Color & Palette': {
      description: 'Palette shaping, stylized color direction, and tonal bias.',
      tone: 'secondary',
      order: 30,
    },
    'Scene Effects': {
      description: 'Fog, steam, particles, glow, and environmental atmosphere.',
      tone: 'secondary',
      order: 40,
    },
    'Intimacy & Explicit Tone': {
      description: 'Seductive, private, and adult-coded mood language.',
      tone: 'danger',
      order: 50,
    },
  },
  quality: {
    'Positive Quality': {
      description: 'Quality boosters, detail cues, and positive render guidance.',
      tone: 'secondary',
      order: 10,
    },
    'Cleanup & Negative': {
      description: 'Artifact cleanup, anatomy correction, and negative prompt cues.',
      tone: 'warning',
      order: 20,
    },
    Refinement: {
      description: 'Extra polish and prompt refinement helpers.',
      tone: 'secondary',
      order: 30,
    },
  },
};

function getGroupMeta(step: string, groupName: string) {
  return (
    STEP_GROUP_META[step]?.[groupName] ?? {
      description: '',
      tone: 'secondary',
      order: 90,
    }
  );
}

// --- Component ---

export const PromptWizardStepContent = memo(function PromptWizardStepContent({
  stepMeta,
  tags,
  allTags,
  selectedTagIds,
  manualNegativeTexts,
  searchQuery,
  onToggleTag,
  onAddNegativePair,
  onFocusGroup,
}: PromptWizardStepContentProps) {
  const [activeSubcategory, setActiveSubcategory] = useState<string | null>(null);
  const [selectionFilter, setSelectionFilter] = useState<SelectionFilter>('all');

  const { tagWeights, setTagWeight } = usePromptWizardStore();

  // Conflict / pairing sets from selected tags
  const selectedTags = useMemo(
    () => allTags.filter((tag) => selectedTagIds.has(tag.id)),
    [allTags, selectedTagIds]
  );
  const conflictSet = useMemo(() => {
    const set = new Set<string>();
    selectedTags.forEach((t) => t.conflictTagIds?.forEach((id) => set.add(id)));
    return set;
  }, [selectedTags]);
  const pairingSet = useMemo(() => {
    const set = new Set<string>();
    selectedTags.forEach((t) => t.pairingTagIds?.forEach((id) => set.add(id)));
    return set;
  }, [selectedTags]);

  const tagNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const tag of allTags) {
      map.set(tag.id, tag.text);
    }
    return map;
  }, [allTags]);

  // Search filtering
  const query = searchQuery.trim().toLowerCase();
  const queryTerms = useMemo(() => query.split(/\s+/).filter(Boolean), [query]);

  const filteredTags = useMemo(() => {
    if (!query) return tags;
    return tags.filter((tag) => {
      const candidates = [
        tag.text,
        ...(tag.aliases ?? []),
        tag.subcategory ?? '',
        tag.majorGroup ?? '',
        tag.minorGroup ?? '',
      ];
      return candidates.some((c) => {
        const lower = c.toLowerCase();
        return queryTerms.every((term) => lower.includes(term));
      });
    });
  }, [query, queryTerms, tags]);

  // Selection filtering
  const visibleTags = useMemo(() => {
    if (selectionFilter === 'selected') return filteredTags.filter((t) => selectedTagIds.has(t.id));
    if (selectionFilter === 'unselected')
      return filteredTags.filter((t) => !selectedTagIds.has(t.id));
    return filteredTags;
  }, [filteredTags, selectedTagIds, selectionFilter]);

  const selectionCounts = useMemo(() => {
    const selected = filteredTags.filter((t) => selectedTagIds.has(t.id)).length;
    return { all: filteredTags.length, selected, unselected: filteredTags.length - selected };
  }, [filteredTags, selectedTagIds]);

  // Build subcategory list
  const subcategories = useMemo(() => {
    const available = new Set<string>();
    for (const tag of visibleTags) {
      available.add(tag.subcategory || 'General');
    }
    const ordered = stepMeta.subcategories.filter((s) => available.has(s));
    // Add any extras not in stepMeta order
    for (const s of available) {
      if (!ordered.includes(s)) ordered.push(s);
    }
    return ordered;
  }, [visibleTags, stepMeta.subcategories]);

  const subcatCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const tag of visibleTags) {
      const key = tag.subcategory || 'General';
      counts[key] = (counts[key] ?? 0) + 1;
    }
    return counts;
  }, [visibleTags]);

  // Resolve active subcategory
  const resolvedSubcategory =
    activeSubcategory && subcategories.includes(activeSubcategory) ? activeSubcategory : null;

  // Build flat card data: subcategory → majorGroup → minorGroup → tags
  const subcategoryData = useMemo((): SubcategoryData[] => {
    const subcatNames = resolvedSubcategory ? [resolvedSubcategory] : subcategories;

    return subcatNames
      .map((subcatName): SubcategoryData => {
        const subcatTags = visibleTags
          .filter((t) => (t.subcategory || 'General') === subcatName)
          .sort((a, b) => {
            if ((a.groupOrder ?? 999) !== (b.groupOrder ?? 999))
              return (a.groupOrder ?? 999) - (b.groupOrder ?? 999);
            if ((a.minorOrder ?? 999) !== (b.minorOrder ?? 999))
              return (a.minorOrder ?? 999) - (b.minorOrder ?? 999);
            return a.text.localeCompare(b.text);
          });

        // Group by majorGroup
        const majorMap = new Map<string, PromptTag[]>();
        for (const tag of subcatTags) {
          const key = tag.majorGroup ?? 'Other';
          const arr = majorMap.get(key) ?? [];
          arr.push(tag);
          majorMap.set(key, arr);
        }

        const majorGroups: MajorGroupData[] = Array.from(majorMap.entries())
          .map(([name, groupTags]) => {
            const meta = getGroupMeta(stepMeta.step, name);

            // Group by minorGroup within major
            const minorMap = new Map<string, PromptTag[]>();
            for (const tag of groupTags) {
              const key = tag.minorGroup ?? 'General';
              const arr = minorMap.get(key) ?? [];
              arr.push(tag);
              minorMap.set(key, arr);
            }

            const minorGroups: MinorGroupData[] = Array.from(minorMap.entries())
              .map(([minorName, minorTags]) => ({
                name: minorName,
                order: Math.min(...minorTags.map((t) => t.minorOrder ?? 999)),
                tags: minorTags,
              }))
              .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));

            return {
              name,
              order: meta.order,
              description: meta.description,
              tone: meta.tone,
              minorGroups,
              totalCount: groupTags.length,
            };
          })
          .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));

        return {
          name: subcatName,
          majorGroups,
          totalCount: subcatTags.length,
        };
      })
      .filter((s) => s.totalCount > 0);
  }, [resolvedSubcategory, subcategories, visibleTags, stepMeta.step]);

  const selectionFilterOptions = useMemo(
    () => [
      { value: 'all', label: `All (${selectionCounts.all})` },
      { value: 'selected', label: `Selected (${selectionCounts.selected})` },
      { value: 'unselected', label: `Available (${selectionCounts.unselected})` },
    ],
    [selectionCounts]
  );

  return (
    <Box
      style={{
        display: 'flex',
        flexDirection: 'column',
        flex: 1,
        minHeight: 0,
        height: '100%',
        overflow: 'hidden',
      }}
    >
      {/* Step header bar */}
      <Box
        px="md"
        py={8}
        style={{
          borderBottom: '1px solid var(--mantine-color-default-border)',
          background: `linear-gradient(180deg, color-mix(in srgb, var(--mantine-color-${stepMeta.tone}-light) 40%, transparent), transparent)`,
          flexShrink: 0,
        }}
      >
        <Stack gap={6}>
          <Group justify="space-between" align="center">
            <Group gap="xs" align="center">
              <Text size="xs" tt="uppercase" fw={700} c={`${stepMeta.tone}.6`}>
                {stepMeta.label}
              </Text>
              <Text size="sm" c="dimmed">
                {stepMeta.description}
              </Text>
            </Group>
            <Group gap={6}>
              <SwarmBadge tone={stepMeta.tone} emphasis="soft">
                {selectionCounts.all} tags
              </SwarmBadge>
              {selectionCounts.selected > 0 && (
                <SwarmBadge tone="primary" emphasis="soft">
                  {selectionCounts.selected} selected
                </SwarmBadge>
              )}
            </Group>
          </Group>

          {/* Subcategory pills + filter */}
          <Group gap={6} align="center" wrap="wrap">
            {/* Subcategory pill tabs */}
            <UnstyledButton
              className="swarm-control-no-select"
              onClick={() => setActiveSubcategory(null)}
              style={{
                padding: '4px 10px',
                borderRadius: 'var(--mantine-radius-xl)',
                background:
                  resolvedSubcategory === null ? 'transparent' : 'var(--elevation-raised)',
                color:
                  resolvedSubcategory === null
                    ? `var(--mantine-color-${stepMeta.tone}-filled)`
                    : undefined,
                border:
                  resolvedSubcategory === null
                    ? `1px solid color-mix(in srgb, var(--mantine-color-${stepMeta.tone}-filled) 24%, var(--mantine-color-default-border))`
                    : '1px solid var(--mantine-color-default-border)',
                fontSize: 'var(--mantine-font-size-xs)',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              All ({selectionCounts.all})
            </UnstyledButton>
            {subcategories.map((name) => (
              <UnstyledButton
                className="swarm-control-no-select"
                key={name}
                onClick={() => {
                  setActiveSubcategory(name === resolvedSubcategory ? null : name);
                  onFocusGroup(`${stepMeta.label}: ${name}`);
                }}
                style={{
                  padding: '4px 10px',
                  borderRadius: 'var(--mantine-radius-xl)',
                  background:
                    resolvedSubcategory === name ? 'transparent' : 'var(--elevation-raised)',
                  color:
                    resolvedSubcategory === name
                      ? `var(--mantine-color-${stepMeta.tone}-filled)`
                      : undefined,
                  border:
                    resolvedSubcategory === name
                      ? `1px solid color-mix(in srgb, var(--mantine-color-${stepMeta.tone}-filled) 24%, var(--mantine-color-default-border))`
                      : '1px solid var(--mantine-color-default-border)',
                  fontSize: 'var(--mantine-font-size-xs)',
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
              >
                {name} ({subcatCounts[name] ?? 0})
              </UnstyledButton>
            ))}

            {/* Spacer */}
            <Box style={{ flex: 1 }} />

            {/* Selection filter */}
            <Select
              aria-label="Filter by selection"
              value={selectionFilter}
              onChange={(v) => v && setSelectionFilter(v as SelectionFilter)}
              data={selectionFilterOptions}
              size="xs"
              leftSection={<IconFilter size={14} />}
              style={{ width: 170 }}
            />
          </Group>
        </Stack>
      </Box>

      {/* Tag palette — flat card grid */}
      <ScrollArea offsetScrollbars scrollbarSize={8} style={{ flex: 1, minHeight: 0 }}>
        <Box p="md">
          <Stack gap="md">
            <PromptWizardSuggestionStrip
              stepMeta={stepMeta}
              allTags={allTags}
              visibleTags={visibleTags}
              selectedTagIds={selectedTagIds}
              manualNegativeTexts={manualNegativeTexts}
              onToggleTag={onToggleTag}
              onAddNegativePair={onAddNegativePair}
            />
            {subcategoryData.length === 0 ? (
              <ElevatedCard elevation="floor" withBorder>
                <Stack align="center" gap="sm" py="xl">
                  <Text fw={600} size="lg">
                    {query ? 'No tags match your search' : 'No tags match these filters'}
                  </Text>
                  <Text size="sm" c="dimmed">
                    {query
                      ? 'Try a different search term.'
                      : 'Try showing all tags or switching subcategories.'}
                  </Text>
                </Stack>
              </ElevatedCard>
            ) : (
              subcategoryData.map((subcat) => (
                <Stack key={subcat.name} gap="sm">
                  {/* Only show subcategory heading when viewing all subcategories */}
                  {resolvedSubcategory === null && subcategories.length > 1 && (
                    <Group gap="xs" align="center">
                      <SwarmBadge tone={stepMeta.tone} emphasis="soft" size="lg">
                        {subcat.name}
                      </SwarmBadge>
                      <Text size="xs" c="dimmed">
                        {subcat.totalCount} tags
                      </Text>
                    </Group>
                  )}

                  {/* Major group cards */}
                  {subcat.majorGroups.map((major) => (
                    <ElevatedCard
                      key={`${subcat.name}-${major.name}`}
                      elevation="floor"
                      withBorder
                      style={{
                        padding: '12px 16px',
                        borderColor: `color-mix(in srgb, var(--mantine-color-${major.tone}-filled) 16%, var(--mantine-color-default-border))`,
                      }}
                    >
                      <Stack gap="sm">
                        {/* Major group header */}
                        <Group justify="space-between" align="center" gap="sm">
                          <Group gap="xs" align="center">
                            <Text fw={700} size="sm">
                              {major.name}
                            </Text>
                            <Text size="xs" c="dimmed">
                              {major.totalCount}
                            </Text>
                          </Group>
                          {major.description && (
                            <Text size="xs" c="dimmed" style={{ maxWidth: 360 }} lineClamp={1}>
                              {major.description}
                            </Text>
                          )}
                        </Group>

                        {/* Minor groups as labeled rows */}
                        {major.minorGroups.map((minor) => (
                          <Box key={`${major.name}-${minor.name}`}>
                            {/* Only show minor label if there are multiple minor groups */}
                            {major.minorGroups.length > 1 && (
                              <Group gap={6} align="center" mb={4}>
                                <Text
                                  size="xs"
                                  fw={600}
                                  c="dimmed"
                                  style={{
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.03em',
                                  }}
                                >
                                  {minor.name}
                                </Text>
                                <Box
                                  style={{
                                    flex: 1,
                                    height: 1,
                                    background: 'var(--mantine-color-default-border)',
                                    opacity: 0.5,
                                  }}
                                />
                              </Group>
                            )}
                            <Group gap={6}>
                              {minor.tags.map((tag) => (
                                <PromptWizardTagChip
                                  key={tag.id}
                                  text={tag.text}
                                  selected={selectedTagIds.has(tag.id)}
                                  weight={tagWeights[tag.id]}
                                  onWeightChange={(w) => setTagWeight(tag.id, w)}
                                  isConflict={conflictSet.has(tag.id)}
                                  isPairing={pairingSet.has(tag.id)}
                                  onToggle={() => onToggleTag(tag.id)}
                                  aliases={tag.aliases}
                                  negativeText={tag.negativeText}
                                  conflictTagNames={tag.conflictTagIds
                                    ?.map((id) => tagNameById.get(id))
                                    .filter((n): n is string => Boolean(n))}
                                  pairingTagNames={tag.pairingTagIds
                                    ?.map((id) => tagNameById.get(id))
                                    .filter((n): n is string => Boolean(n))}
                                />
                              ))}
                            </Group>
                          </Box>
                        ))}
                      </Stack>
                    </ElevatedCard>
                  ))}
                </Stack>
              ))
            )}
          </Stack>
        </Box>
      </ScrollArea>
    </Box>
  );
});
