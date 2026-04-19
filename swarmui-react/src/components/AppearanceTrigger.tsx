// AppearanceTrigger - Single header button that opens the AppearanceModal.
//
// Replaces the old header pair (ThemeSelector trigger + LightDarkToggle) with
// one consolidated control. The icon reflects the currently resolved color
// scheme so the user gets a quick visual confirmation; clicking opens the
// modal where mode (Light/Dark/System) and theme presets are configured.
import { lazy, Suspense, useState } from 'react';
import { Tooltip } from '@mantine/core';
import { IconDeviceDesktop, IconMoon, IconSun } from '@tabler/icons-react';
import { useThemeStore } from '../store/themeStore';
import { useShallow } from 'zustand/react/shallow';
import { SwarmActionIcon } from './ui';

const AppearanceModal = lazy(() =>
    import('./AppearanceModal').then((module) => ({ default: module.AppearanceModal }))
);

export function AppearanceTrigger() {
    const { themeMode, resolvedColorScheme } = useThemeStore(
        useShallow((state) => ({
            themeMode: state.themeMode,
            resolvedColorScheme: state.resolvedColorScheme,
        }))
    );
    const [opened, setOpened] = useState(false);

    const Icon =
        themeMode === 'system'
            ? IconDeviceDesktop
            : resolvedColorScheme === 'light'
            ? IconSun
            : IconMoon;

    const tooltipLabel =
        themeMode === 'system'
            ? `Appearance — following system (${resolvedColorScheme})`
            : `Appearance — ${resolvedColorScheme} mode`;

    return (
        <>
            <Tooltip label={tooltipLabel}>
                <SwarmActionIcon
                    aria-label="Open appearance settings"
                    aria-haspopup="dialog"
                    aria-expanded={opened}
                    tone="secondary"
                    emphasis="ghost"
                    size="md"
                    onClick={() => setOpened((v) => !v)}
                    className="swarm-app-header-action swarm-app-header-action--appearance"
                >
                    <Icon size={18} />
                </SwarmActionIcon>
            </Tooltip>
            <Suspense fallback={null}>
                <AppearanceModal opened={opened} onClose={() => setOpened(false)} />
            </Suspense>
        </>
    );
}
