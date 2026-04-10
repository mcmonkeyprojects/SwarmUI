import { memo } from 'react';
import { Box, Stack, Text, Tooltip, UnstyledButton } from '@mantine/core';
import { SwarmBadge } from './ui';
import type { BuilderStep, StepMeta, StepCompletion } from '../features/promptWizard/types';

interface PromptWizardStepsProps {
  steps: StepMeta[];
  activeStep: BuilderStep;
  tagCountsByStep: Record<BuilderStep, number>;
  completionByStep: Record<BuilderStep, StepCompletion>;
  onStepClick: (step: BuilderStep) => void;
  /** When true, render as horizontal strip instead of vertical rail */
  horizontal?: boolean;
}

export const PromptWizardSteps = memo(function PromptWizardSteps({
  steps,
  activeStep,
  tagCountsByStep,
  completionByStep,
  onStepClick,
  horizontal = false,
}: PromptWizardStepsProps) {
  if (horizontal) {
    return (
      <Box
        px="sm"
        py={6}
        style={{
          borderBottom: '1px solid var(--mantine-color-default-border)',
          overflowX: 'auto',
          flexShrink: 0,
        }}
      >
        <Box style={{ display: 'flex', gap: 4, flexWrap: 'nowrap' }}>
          {steps.map((meta, index) => {
            const isActive = meta.step === activeStep;
            const count = tagCountsByStep[meta.step] ?? 0;
            return (
              <UnstyledButton
                key={meta.step}
                className="swarm-control-no-select"
                onClick={() => onStepClick(meta.step)}
              >
                <Box
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 5,
                    padding: '6px 10px',
                    borderRadius: 'var(--mantine-radius-md)',
                    background: 'transparent',
                    border: isActive
                      ? `1px solid color-mix(in srgb, var(--mantine-color-${meta.tone}-filled) 22%, var(--theme-gray-4))`
                      : '1px solid transparent',
                    whiteSpace: 'nowrap',
                  }}
                >
                  <Text size="xs" c={isActive ? `${meta.tone}.6` : 'dimmed'} fw={700}>
                    {index + 1}
                  </Text>
                  <Text size="sm" fw={isActive ? 600 : 500}>
                    {meta.label}
                  </Text>
                  {count > 0 && (
                    <SwarmBadge
                      tone={isActive ? meta.tone : 'primary'}
                      emphasis="outline"
                      size="sm"
                    >
                      {count}
                    </SwarmBadge>
                  )}
                </Box>
              </UnstyledButton>
            );
          })}
        </Box>
      </Box>
    );
  }

  // Vertical nav rail
  return (
    <Box
      style={{
        width: 72,
        minWidth: 72,
        height: '100%',
        borderRight: '1px solid var(--mantine-color-default-border)',
        background: 'color-mix(in srgb, var(--elevation-raised) 70%, transparent)',
        flexShrink: 0,
        overflowY: 'auto',
        overflowX: 'hidden',
      }}
    >
      <Stack gap={2} py="sm" px={6} align="center">
        {steps.map((meta, index) => {
          const isActive = meta.step === activeStep;
          const count = tagCountsByStep[meta.step] ?? 0;
          const completion = completionByStep[meta.step] ?? 'empty';
          const completionTone =
            completion === 'strong'
              ? 'success'
              : completion === 'started'
                ? meta.tone
                : 'secondary';

          return (
            <Tooltip key={meta.step} label={meta.label} position="right" withArrow>
              <UnstyledButton
                className="swarm-control-no-select"
                onClick={() => onStepClick(meta.step)}
                aria-label={`${meta.label} step`}
                style={{ width: '100%' }}
              >
                <Box
                  style={{
                    padding: '8px 4px',
                    borderRadius: 'var(--mantine-radius-md)',
                    background: 'transparent',
                    border: isActive
                      ? `1px solid color-mix(in srgb, var(--mantine-color-${meta.tone}-filled) 24%, var(--mantine-color-default-border))`
                      : '1px solid transparent',
                    textAlign: 'center',
                    transition: 'background 150ms ease',
                  }}
                >
                  <Stack gap={2} align="center">
                    <Text size="xs" fw={700} c={isActive ? `${meta.tone}.6` : 'dimmed'}>
                      {index + 1}
                    </Text>
                    <Text
                      size="xs"
                      fw={isActive ? 700 : 500}
                      style={{
                        fontSize: 10,
                        lineHeight: 1.2,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        maxWidth: '100%',
                      }}
                    >
                      {meta.label}
                    </Text>
                    {count > 0 ? (
                      <SwarmBadge
                        tone={isActive ? meta.tone : completionTone}
                        emphasis="outline"
                        size="sm"
                      >
                        {count}
                      </SwarmBadge>
                    ) : (
                      <Box
                        style={{
                          width: 6,
                          height: 6,
                          borderRadius: '50%',
                          background:
                            completion === 'empty'
                              ? 'var(--mantine-color-default-border)'
                              : `var(--mantine-color-${completionTone}-filled)`,
                        }}
                      />
                    )}
                  </Stack>
                </Box>
              </UnstyledButton>
            </Tooltip>
          );
        })}
      </Stack>
    </Box>
  );
});
