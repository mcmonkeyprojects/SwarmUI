import { Code, Modal, ScrollArea, Stack, Text } from '@mantine/core';
import type { CompiledRoleplayPrompt } from '../../types/roleplay';

interface PromptInspectorModalProps {
  opened: boolean;
  onClose: () => void;
  compiledPrompt: CompiledRoleplayPrompt | null;
}

export function PromptInspectorModal({
  opened,
  onClose,
  compiledPrompt,
}: PromptInspectorModalProps) {
  return (
    <Modal opened={opened} onClose={onClose} title="Prompt Inspector" size="xl">
      <Stack gap="md">
        <Text size="sm" fw={600}>
          Segments ({compiledPrompt?.segments.length ?? 0}) · Token Estimate:{' '}
          {compiledPrompt?.tokenEstimate ?? 0}
        </Text>
        <ScrollArea h={220}>
          <Stack gap="xs">
            {compiledPrompt?.segments.map((segment) => (
              <div key={segment.key}>
                <Text size="xs" fw={600}>
                  {segment.label}
                </Text>
                <Code block style={{ whiteSpace: 'pre-wrap', fontSize: '0.75rem' }}>
                  {segment.content}
                </Code>
              </div>
            )) ?? (
              <Text size="xs" c="dimmed">
                No prompt segments compiled.
              </Text>
            )}
          </Stack>
        </ScrollArea>

        <Text size="sm" fw={600}>
          Activated Lore ({compiledPrompt?.activatedLoreEntries.length ?? 0})
        </Text>
        <ScrollArea h={120}>
          <Stack gap="xs">
            {compiledPrompt?.activatedLoreEntries.length ? (
              compiledPrompt.activatedLoreEntries.map((entry) => (
                <div key={entry.entryId}>
                  <Text size="xs" fw={600}>
                    {entry.lorebookName} / {entry.entryTitle}
                  </Text>
                  <Text size="xs" c="dimmed">
                    {entry.mode === 'always-on' ? 'Always on' : 'Keyword triggered'}
                  </Text>
                </div>
              ))
            ) : (
              <Text size="xs" c="dimmed">
                No lore entries activated.
              </Text>
            )}
          </Stack>
        </ScrollArea>

        <Text size="sm" fw={600}>
          API Messages ({compiledPrompt?.apiMessages.length ?? 0})
        </Text>
        <ScrollArea h={320}>
          <Stack gap="xs">
            {compiledPrompt?.apiMessages.map((message, index) => (
              <div key={`${message.role}-${index}`}>
                <Text size="xs" fw={600} c={message.role === 'user' ? 'blue' : 'green'}>
                  [{message.role}]
                </Text>
                <Code block style={{ whiteSpace: 'pre-wrap', fontSize: '0.75rem' }}>
                  {message.content}
                </Code>
              </div>
            )) ?? (
              <Text size="xs" c="dimmed">
                No API messages to display.
              </Text>
            )}
          </Stack>
        </ScrollArea>
      </Stack>
    </Modal>
  );
}
