import { useMemo, useState } from 'react';
import {
  Badge,
  FileButton,
  Grid,
  Group,
  Modal,
  ScrollArea,
  Select,
  Stack,
  Text,
  TextInput,
} from '@mantine/core';
import { IconFileImport, IconPlus, IconSearch } from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { ROLEPLAY_CATALOG_CATEGORIES, ROLEPLAY_CATALOG_TEMPLATES } from '../../data/roleplayCatalog';
import { parseTavernCardFile } from '../../features/roleplay/tavernCard';
import { useRoleplayStore } from '../../stores/roleplayStore';
import type { RoleplayCatalogTemplate } from '../../types/roleplay';
import { ElevatedCard } from '../../components/ui/ElevatedCard';
import { SwarmButton } from '../../components/ui/SwarmButton';

interface RoleplayCatalogModalProps {
  opened: boolean;
  onClose: () => void;
}

function categoryLabel(category: string): string {
  return category
    .split('-')
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(' ');
}

function templateMatchesSearch(template: RoleplayCatalogTemplate, query: string): boolean {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return true;
  }
  return [
    template.name,
    template.category,
    template.shortDescription,
    template.description,
    template.scenario,
    ...template.tags,
  ]
    .join(' ')
    .toLowerCase()
    .includes(normalizedQuery);
}

export function RoleplayCatalogModal({ opened, onClose }: RoleplayCatalogModalProps) {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState(
    ROLEPLAY_CATALOG_TEMPLATES[0]?.id ?? ''
  );
  const createCharacterFromTemplate = useRoleplayStore((state) => state.createCharacterFromTemplate);
  const addCharacterWithLorebooks = useRoleplayStore((state) => state.addCharacterWithLorebooks);

  const templates = useMemo(
    () =>
      ROLEPLAY_CATALOG_TEMPLATES.filter((template) => {
        if (category && template.category !== category) {
          return false;
        }
        return templateMatchesSearch(template, search);
      }),
    [category, search]
  );
  const selectedTemplate =
    ROLEPLAY_CATALOG_TEMPLATES.find((template) => template.id === selectedTemplateId) ??
    templates[0] ??
    null;

  const handleCreate = (template: RoleplayCatalogTemplate) => {
    createCharacterFromTemplate(template);
    notifications.show({
      title: 'Character Created',
      message: `${template.name} is ready to chat.`,
      color: 'green',
    });
    onClose();
  };

  const handleImportTavernCard = async (file: File | null) => {
    if (!file) {
      return;
    }
    try {
      const result = await parseTavernCardFile(file);
      addCharacterWithLorebooks(result.character, result.lorebooks);
      notifications.show({
        title: 'Tavern Card Imported',
        message: `${result.character.name} was added to Roleplay.`,
        color: 'green',
      });
      onClose();
    } catch (error) {
      notifications.show({
        title: 'Import Failed',
        message: error instanceof Error ? error.message : 'Could not import Tavern card.',
        color: 'red',
      });
    }
  };

  return (
    <Modal opened={opened} onClose={onClose} title="Roleplay Catalog" size="95%">
      <Grid gutter="md">
        <Grid.Col span={{ base: 12, md: 4 }}>
          <Stack gap="xs">
            <TextInput
              leftSection={<IconSearch size={14} />}
              placeholder="Search templates, tags, scenes..."
              value={search}
              onChange={(event) => setSearch(event.currentTarget.value)}
            />
            <Group grow>
              <Select
                clearable
                placeholder="All categories"
                value={category}
                data={ROLEPLAY_CATALOG_CATEGORIES.map((entry) => ({
                  value: entry,
                  label: categoryLabel(entry),
                }))}
                onChange={setCategory}
              />
              <FileButton onChange={handleImportTavernCard} accept="application/json,image/png,.json,.png">
                {(props) => (
                  <SwarmButton
                    {...props}
                    tone="secondary"
                    emphasis="ghost"
                    size="sm"
                    leftSection={<IconFileImport size={14} />}
                  >
                    Import
                  </SwarmButton>
                )}
              </FileButton>
            </Group>
            <Text size="xs" c="dimmed">
              {ROLEPLAY_CATALOG_TEMPLATES.length} local templates. Tavern V1/V2 JSON and readable PNG cards are supported.
            </Text>
            <ScrollArea h={560}>
              <Stack gap="xs">
                {templates.map((template) => (
                  <ElevatedCard
                    key={template.id}
                    elevation={template.id === selectedTemplate?.id ? 'raised' : 'paper'}
                    tone={template.id === selectedTemplate?.id ? 'brand' : 'neutral'}
                    interactive
                    onClick={() => setSelectedTemplateId(template.id)}
                  >
                    <Stack gap={6}>
                      <Group justify="space-between" wrap="nowrap">
                        <Text size="sm" fw={700} truncate>
                          {template.name}
                        </Text>
                        <Badge size="xs" variant="light">
                          {categoryLabel(template.category)}
                        </Badge>
                      </Group>
                      <Text size="xs" c="dimmed" lineClamp={2}>
                        {template.shortDescription}
                      </Text>
                      <Group gap={4}>
                        {template.tags.slice(0, 4).map((tag) => (
                          <Badge key={tag} size="xs" variant="outline">
                            {tag}
                          </Badge>
                        ))}
                      </Group>
                    </Stack>
                  </ElevatedCard>
                ))}
              </Stack>
            </ScrollArea>
          </Stack>
        </Grid.Col>

        <Grid.Col span={{ base: 12, md: 8 }}>
          {selectedTemplate ? (
            <Stack gap="sm">
              <div
                className="roleplay-catalog-preview"
                style={{ background: selectedTemplate.thumbnail }}
              >
                <Stack gap="xs">
                  <Text size="xl" fw={800}>
                    {selectedTemplate.name}
                  </Text>
                  <Text size="sm">{selectedTemplate.shortDescription}</Text>
                  <Group gap={4}>
                    {selectedTemplate.tags.map((tag) => (
                      <Badge key={tag} size="xs" variant="filled">
                        {tag}
                      </Badge>
                    ))}
                  </Group>
                </Stack>
              </div>

              <Grid gutter="sm">
                <Grid.Col span={{ base: 12, sm: 6 }}>
                  <ElevatedCard elevation="floor">
                    <Stack gap={6}>
                      <Text size="xs" fw={700}>
                        Personality
                      </Text>
                      <Text size="sm" c="dimmed" style={{ whiteSpace: 'pre-wrap' }}>
                        {selectedTemplate.personality}
                      </Text>
                    </Stack>
                  </ElevatedCard>
                </Grid.Col>
                <Grid.Col span={{ base: 12, sm: 6 }}>
                  <ElevatedCard elevation="floor">
                    <Stack gap={6}>
                      <Text size="xs" fw={700}>
                        Scenario
                      </Text>
                      <Text size="sm" c="dimmed">
                        {selectedTemplate.scenario}
                      </Text>
                    </Stack>
                  </ElevatedCard>
                </Grid.Col>
                <Grid.Col span={12}>
                  <ElevatedCard elevation="floor">
                    <Stack gap={6}>
                      <Text size="xs" fw={700}>
                        Opening
                      </Text>
                      <Text size="sm" c="dimmed" style={{ whiteSpace: 'pre-wrap' }}>
                        {selectedTemplate.openingRoleplayMessage}
                      </Text>
                    </Stack>
                  </ElevatedCard>
                </Grid.Col>
              </Grid>

              <Group justify="flex-end">
                <SwarmButton
                  tone="brand"
                  emphasis="solid"
                  leftSection={<IconPlus size={16} />}
                  onClick={() => handleCreate(selectedTemplate)}
                >
                  Create Character
                </SwarmButton>
              </Group>
            </Stack>
          ) : (
            <Text size="sm" c="dimmed">
              No catalog templates match the current filter.
            </Text>
          )}
        </Grid.Col>
      </Grid>
    </Modal>
  );
}
