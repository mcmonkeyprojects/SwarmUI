import { Badge, Code, Group, Modal, ScrollArea, SimpleGrid, Stack, Text } from '@mantine/core';
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
  const blockTraceById = new Map(
    compiledPrompt?.blockTraces.map((trace) => [trace.blockId, trace]) ?? []
  );
  const blockById = new Map(compiledPrompt?.promptBlocks.map((block) => [block.id, block]) ?? []);

  return (
    <Modal opened={opened} onClose={onClose} title="Prompt Inspector" size="xl">
      <Stack gap="md">
        <Text size="sm" fw={600}>
          Prompt Blocks ({compiledPrompt?.promptBlocks.length ?? 0}) - Mode:{' '}
          {compiledPrompt?.generationMode ?? 'normal'} - Token Estimate:{' '}
          {compiledPrompt?.tokenEstimate ?? 0}
        </Text>
        {compiledPrompt ? (
          <Group gap={6} wrap="wrap">
            <Badge size="sm" variant="light">
              Context {compiledPrompt.contextBudget.maxContextTokens}
            </Badge>
            <Badge size="sm" variant="light">
              Reserve {compiledPrompt.contextBudget.reservedResponseTokens}
            </Badge>
            <Badge size="sm" variant="light">
              Blocks {compiledPrompt.contextBudget.promptBlockTokens}
            </Badge>
            <Badge size="sm" variant="light">
              History {compiledPrompt.contextBudget.historyTokens}/
              {compiledPrompt.contextBudget.historyBudgetTokens}
            </Badge>
            <Badge size="sm" variant="outline">
              Kept {compiledPrompt.contextBudget.includedHistoryMessages}/
              {compiledPrompt.contextBudget.totalHistoryMessages}
            </Badge>
            {compiledPrompt.contextBudget.droppedHistoryMessages > 0 ? (
              <Badge size="sm" color="orange" variant="light">
                Dropped {compiledPrompt.contextBudget.droppedHistoryMessages}
              </Badge>
            ) : null}
            {compiledPrompt.contextBudget.truncatedHistoryMessages > 0 ? (
              <Badge size="sm" color="orange" variant="light">
                Truncated {compiledPrompt.contextBudget.truncatedHistoryMessages}
              </Badge>
            ) : null}
            <Badge size="sm" variant="light">
              Budget {compiledPrompt.diagnostics.promptBudgetMode}
            </Badge>
            <Badge size="sm" variant="light">
              Memory {compiledPrompt.diagnostics.memoryTokens}
            </Badge>
            <Badge size="sm" variant="light">
              Lore {compiledPrompt.diagnostics.loreTokens}
            </Badge>
            <Badge size="sm" variant="light">
              Knowledge {compiledPrompt.diagnostics.retrievedKnowledgeTokens}
            </Badge>
            <Badge size="sm" variant="light">
              Vectors {compiledPrompt.diagnostics.retrievedKnowledgeVectorEntries}
            </Badge>
            {compiledPrompt.diagnostics.droppedLoreEntries > 0 ? (
              <Badge size="sm" color="orange" variant="light">
                Lore capped {compiledPrompt.diagnostics.droppedLoreEntries}
              </Badge>
            ) : null}
          </Group>
        ) : null}
        {compiledPrompt?.diagnostics.warnings.length ? (
          <Stack gap={4}>
            {compiledPrompt.diagnostics.warnings.map((warning) => (
              <Text key={warning} size="xs" c="orange">
                {warning}
              </Text>
            ))}
          </Stack>
        ) : null}
        <Text size="sm" fw={600}>
          Prompt Blocks
        </Text>
        <ScrollArea h={260}>
          <Stack gap="xs">
            {compiledPrompt?.promptBlocks.map((block) => (
              <div key={block.id}>
                <Group gap={4} mb={4}>
                  <Text size="xs" fw={600}>
                    {block.label}
                  </Text>
                  <Badge size="xs" variant="light">
                    {block.role}
                  </Badge>
                  <Badge size="xs" variant="outline">
                    {block.position}
                    {block.depth !== null ? `:${block.depth}` : ''}
                  </Badge>
                  <Badge size="xs" variant="dot">
                    {block.source}
                  </Badge>
                  <Badge
                    size="xs"
                    color={blockTraceById.get(block.id)?.included ? 'green' : 'orange'}
                    variant={blockTraceById.get(block.id)?.included ? 'light' : 'outline'}
                  >
                    {blockTraceById.get(block.id)?.included ? 'included' : 'excluded'}
                  </Badge>
                  <Text size="xs" c="dimmed">
                    ~{block.tokenEstimate} tokens
                  </Text>
                </Group>
                <Text size="xs" c="dimmed" mb={4}>
                  {blockTraceById.get(block.id)?.reason ?? 'No trace available.'}
                </Text>
                <Code block style={{ whiteSpace: 'pre-wrap', fontSize: '0.75rem' }}>
                  {block.content}
                </Code>
              </div>
            )) ?? (
              <Text size="xs" c="dimmed">
                No prompt blocks compiled.
              </Text>
            )}
          </Stack>
        </ScrollArea>

        <Text size="sm" fw={600}>
          API Messages With Source Blocks ({compiledPrompt?.apiMessageTraces.length ?? 0})
        </Text>
        <ScrollArea h={360}>
          <Stack gap="sm">
            {compiledPrompt?.apiMessageTraces.map((message, index) => (
              <SimpleGrid key={`${message.role}-${index}`} cols={{ base: 1, sm: 2 }} spacing="xs">
                <div>
                  <Group gap={4} mb={4}>
                    <Badge size="xs" color={message.role === 'user' ? 'blue' : 'green'}>
                      {message.role}
                    </Badge>
                    <Text size="xs" c="dimmed">
                      API message {index + 1}
                    </Text>
                  </Group>
                  <Code block style={{ whiteSpace: 'pre-wrap', fontSize: '0.75rem' }}>
                    {message.content}
                  </Code>
                </div>
                <Stack gap={6}>
                  {message.sourceBlockIds.map((blockId) => {
                    const block = blockById.get(blockId);
                    return (
                      <div key={blockId}>
                        <Group gap={4}>
                          <Badge size="xs" variant="outline">
                            {blockId.startsWith('history-') ? 'history' : (block?.source ?? 'block')}
                          </Badge>
                          <Text size="xs" fw={600}>
                            {block?.label ?? blockId}
                          </Text>
                        </Group>
                        {block ? (
                          <Text size="xs" c="dimmed">
                            {block.role} / {block.position}
                            {block.depth !== null ? `:${block.depth}` : ''} / ~
                            {block.tokenEstimate} tokens
                          </Text>
                        ) : null}
                      </div>
                    );
                  })}
                </Stack>
              </SimpleGrid>
            )) ?? (
              <Text size="xs" c="dimmed">
                No API messages to display.
              </Text>
            )}
          </Stack>
        </ScrollArea>

        <Text size="sm" fw={600}>
          Lore Scan Source
        </Text>
        <ScrollArea h={180}>
          <Code block style={{ whiteSpace: 'pre-wrap', fontSize: '0.75rem' }}>
            {compiledPrompt?.loreScanSource || 'No lore scan source.'}
          </Code>
        </ScrollArea>

        <Text size="sm" fw={600}>
          Budget Cuts / History Trace
        </Text>
        <ScrollArea h={220}>
          <Stack gap="xs">
            {compiledPrompt?.historyBudgetTrace.length ? (
              compiledPrompt.historyBudgetTrace.map((entry) => (
                <div key={entry.originalIndex}>
                  <Group gap={4} mb={3}>
                    <Badge
                      size="xs"
                      color={entry.included ? (entry.truncated ? 'orange' : 'green') : 'red'}
                      variant={entry.included ? 'light' : 'outline'}
                    >
                      {entry.included ? (entry.truncated ? 'truncated' : 'kept') : 'dropped'}
                    </Badge>
                    <Badge size="xs" variant="outline">
                      {entry.role}
                    </Badge>
                    <Text size="xs" c="dimmed">
                      turn {entry.originalIndex + 1} / ~{entry.tokenEstimate} tokens
                    </Text>
                  </Group>
                  <Text size="xs" c="dimmed">
                    {entry.reason}
                  </Text>
                  {entry.truncated && entry.finalContent ? (
                    <Code block style={{ whiteSpace: 'pre-wrap', fontSize: '0.75rem' }}>
                      {entry.finalContent}
                    </Code>
                  ) : null}
                </div>
              ))
            ) : (
              <Text size="xs" c="dimmed">
                No history budget trace available.
              </Text>
            )}
          </Stack>
        </ScrollArea>

        <Text size="sm" fw={600}>
          Retrieved Knowledge ({compiledPrompt?.retrievedKnowledgeEntries.length ?? 0})
        </Text>
        <ScrollArea h={140}>
          <Stack gap="xs">
            {compiledPrompt?.retrievedKnowledgeEntries.length ? (
              compiledPrompt.retrievedKnowledgeEntries.map((entry) => (
                <div key={entry.chunkId}>
                  <Group gap={4} mb={3}>
                    <Badge size="xs" variant="outline">
                      {entry.retrievalMode}
                    </Badge>
                    <Badge size="xs" variant="outline">
                      {entry.scope}
                    </Badge>
                    <Text size="xs" fw={600}>
                      {entry.documentTitle} / {entry.chunkTitle}
                    </Text>
                    <Text size="xs" c="dimmed">
                      score {entry.score.toFixed(2)} / ~{entry.tokenEstimate}
                    </Text>
                  </Group>
                  <Text size="xs" c="dimmed">
                    {entry.reason}
                  </Text>
                </div>
              ))
            ) : (
              <Text size="xs" c="dimmed">
                No knowledge chunks retrieved.
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
          Lore Activation Debug ({compiledPrompt?.loreActivationDebug.length ?? 0})
        </Text>
        <ScrollArea h={180}>
          <Stack gap="xs">
            {compiledPrompt?.loreActivationDebug.length ? (
              compiledPrompt.loreActivationDebug.map((entry, index) => (
                <div key={`${entry.entryId}-${entry.recursivePass}-${index}`}>
                  <Group gap={4} mb={2}>
                    <Text size="xs" fw={600}>
                      {entry.lorebookName} / {entry.entryTitle}
                    </Text>
                    <Badge
                      size="xs"
                      color={entry.activated ? 'green' : 'gray'}
                      variant={entry.activated ? 'light' : 'outline'}
                    >
                      {entry.activated ? 'fired' : 'skipped'}
                    </Badge>
                    <Badge size="xs" variant="outline">
                      pass {entry.recursivePass + 1}
                    </Badge>
                    <Badge size="xs" variant="outline">
                      depth {entry.scanDepth}
                    </Badge>
                    {!entry.includedLorebook ? (
                      <Badge size="xs" color="orange" variant="light">
                        unbound
                      </Badge>
                    ) : null}
                  </Group>
                  <Text size="xs" c="dimmed">
                    {entry.reason}
                  </Text>
                  <Group gap={4} mt={3}>
                    {entry.matchedKeywords.map((keyword) => (
                      <Badge key={`primary-${keyword}`} size="xs" variant="dot">
                        {keyword}
                      </Badge>
                    ))}
                    {entry.matchedSecondaryKeywords.map((keyword) => (
                      <Badge key={`secondary-${keyword}`} size="xs" color="blue" variant="dot">
                        secondary: {keyword}
                      </Badge>
                    ))}
                    {entry.matchedNegativeKeywords.map((keyword) => (
                      <Badge key={`negative-${keyword}`} size="xs" color="red" variant="dot">
                        blocked: {keyword}
                      </Badge>
                    ))}
                  </Group>
                </div>
              ))
            ) : (
              <Text size="xs" c="dimmed">
                No lore entries were evaluated.
              </Text>
            )}
          </Stack>
        </ScrollArea>

      </Stack>
    </Modal>
  );
}
