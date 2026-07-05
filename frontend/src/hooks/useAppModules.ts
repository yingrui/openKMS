import { useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useFeatureToggles } from '../contexts/FeatureTogglesContext';
import {
  APP_MODULES,
  CONSOLE_PLATFORM_MODULES,
  sortSuiteApps,
  type AppModule,
} from '../config/appModules';

function isModuleVisible(
  module: AppModule,
  canAccessPath: (path: string) => boolean,
  toggles: import('../data/featureTogglesApi').FeatureToggles,
): boolean {
  if (module.featureToggle && !toggles[module.featureToggle]) {
    return false;
  }
  if (canAccessPath(module.homePath)) {
    return true;
  }
  return (module.accessPaths ?? []).some((p) => canAccessPath(p));
}

function filterVisibleSuiteModules(
  canAccessPath: (path: string) => boolean,
  toggles: import('../data/featureTogglesApi').FeatureToggles,
  surface: 'rail' | 'launcher',
): AppModule[] {
  const surfaceOk = surface === 'rail' ? (m: AppModule) => m.showInMainSidebar : (m: AppModule) => m.showInLauncher;
  return sortSuiteApps(
    APP_MODULES.filter((m) => surfaceOk(m) && isModuleVisible(m, canAccessPath, toggles)),
  );
}

/** App Rail — same order as Launcher / Home Apps (`order` in appModules.ts). */
export function useVisibleMainSidebarModules(): AppModule[] {
  const { canAccessPath } = useAuth();
  const { toggles } = useFeatureToggles();

  return useMemo(
    () => filterVisibleSuiteModules(canAccessPath, toggles, 'rail'),
    [canAccessPath, toggles],
  );
}

/** App Launcher + Home Apps grid — same order as App Rail. */
export function useVisibleLauncherModules(): AppModule[] {
  const { canAccessPath } = useAuth();
  const { toggles } = useFeatureToggles();

  return useMemo(
    () => filterVisibleSuiteModules(canAccessPath, toggles, 'launcher'),
    [canAccessPath, toggles],
  );
}

export function useVisibleConsolePlatformModules(): AppModule[] {
  const { canAccessPath } = useAuth();
  const { toggles } = useFeatureToggles();

  return useMemo(
    () => sortSuiteApps(CONSOLE_PLATFORM_MODULES.filter((m) => isModuleVisible(m, canAccessPath, toggles))),
    [canAccessPath, toggles],
  );
}
