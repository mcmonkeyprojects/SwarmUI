import { Tooltip, type TooltipProps } from '@mantine/core';

export type SwarmTooltipProps = TooltipProps;

export function SwarmTooltip({ classNames, withArrow = true, ...props }: SwarmTooltipProps) {
    return (
        <Tooltip
            {...props}
            withArrow={withArrow}
            classNames={{
                ...classNames,
                tooltip: `swarm-tooltip ${classNames?.tooltip ?? ''}`.trim(),
                arrow: `swarm-tooltip__arrow ${classNames?.arrow ?? ''}`.trim(),
            }}
        />
    );
}
