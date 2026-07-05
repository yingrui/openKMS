import { NavLink, useLocation } from 'react-router-dom';
import {
  Home as HomeIcon,
  HardDrive,
  Database,
  LayoutDashboard,
  HeartPulse,
  Settings,
  Users,
  ToggleLeft,
  Shield,
  KeyRound,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { moduleTooltip, isConsoleShellPath } from '../../config/appModules';
import { useVisibleMainSidebarModules, useVisibleConsolePlatformModules } from '../../hooks/useAppModules';
import { useAuth } from '../../contexts/AuthContext';
import './Sidebar.scss';

export function Sidebar() {
  const { t } = useTranslation('layout');
  const location = useLocation();
  const consoleShell = isConsoleShellPath(location.pathname);
  const { canAccessConsole, canAccessPath } = useAuth();
  const appModules = useVisibleMainSidebarModules();
  const consolePlatformModules = useVisibleConsolePlatformModules();

  const showConsoleDataLabel =
    canAccessPath('/console/data-sources') ||
    canAccessPath('/console/storage') ||
    canAccessPath('/console/settings') ||
    canAccessPath('/console/users') ||
    canAccessPath('/console/feature-toggles');

  const showPlatformOpsLabel = consolePlatformModules.length > 0;

  const showConsoleNav = consoleShell && canAccessConsole;
  const railCollapsed = !showConsoleNav;

  return (
    <aside
      className={`sidebar ${railCollapsed ? 'sidebar--collapsed' : 'sidebar--console'}`}
      aria-label={showConsoleNav ? t('consoleNavigation') : t('mainNavigation')}
    >
      <nav
        id="sidebar-primary-nav"
        className={`sidebar-nav ${showConsoleNav ? 'sidebar-nav--console' : ''} ${railCollapsed ? 'sidebar-nav--collapsed' : ''}`}
      >
        {showConsoleNav ? (
          <div className="sidebar-nav-console-scroll">
            {canAccessPath('/console') && (
              <NavLink
                to="/console"
                end
                title={t('overview')}
                className={({ isActive }) => `sidebar-link ${isActive ? 'sidebar-link-active' : ''}`}
              >
                <LayoutDashboard size={18} strokeWidth={1.75} />
                <span>{t('overview')}</span>
              </NavLink>
            )}
            {canAccessPath('/console/health') && (
              <NavLink
                to="/console/health"
                title={t('health')}
                className={({ isActive }) => `sidebar-link ${isActive ? 'sidebar-link-active' : ''}`}
              >
                <HeartPulse size={18} strokeWidth={1.75} />
                <span>{t('health')}</span>
              </NavLink>
            )}
            {canAccessPath('/console/permission-management') && (
              <>
                <div className="sidebar-menu-label">{t('permissionManagement')}</div>
                <NavLink
                  to="/console/permission-management"
                  title={t('permissions')}
                  className={({ isActive }) => `sidebar-link ${isActive ? 'sidebar-link-active' : ''}`}
                >
                  <KeyRound size={18} strokeWidth={1.75} />
                  <span>{t('permissions')}</span>
                </NavLink>
              </>
            )}
            {(canAccessPath('/console/data-security/issues') ||
              canAccessPath('/console/data-security/groups')) && (
              <>
                <div className="sidebar-menu-label">{t('dataSecurity')}</div>
                {canAccessPath('/console/data-security/issues') && (
                  <NavLink
                    to="/console/data-security/issues"
                    title={t('dataSecurityIssues')}
                    className={({ isActive }) => `sidebar-link ${isActive ? 'sidebar-link-active' : ''}`}
                  >
                    <Shield size={18} strokeWidth={1.75} />
                    <span>{t('dataSecurityIssues')}</span>
                  </NavLink>
                )}
                {canAccessPath('/console/data-security/groups') && (
                  <NavLink
                    to="/console/data-security/groups"
                    title={t('accessGroups')}
                    className={({ isActive }) => `sidebar-link ${isActive ? 'sidebar-link-active' : ''}`}
                  >
                    <Users size={18} strokeWidth={1.75} />
                    <span>{t('accessGroups')}</span>
                  </NavLink>
                )}
              </>
            )}
            {showPlatformOpsLabel && (
              <div className="sidebar-menu-label">{t('platformOperations')}</div>
            )}
            {consolePlatformModules.map((mod) => {
              const Icon = mod.icon;
              return (
                <NavLink
                  key={mod.id}
                  to={mod.homePath}
                  title={t(mod.labelKey)}
                  className={({ isActive }) =>
                    `sidebar-link ${isActive || mod.isActive(location.pathname) ? 'sidebar-link-active' : ''}`
                  }
                >
                  <Icon size={18} strokeWidth={1.75} />
                  <span>{t(mod.labelKey)}</span>
                </NavLink>
              );
            })}
            {showConsoleDataLabel && <div className="sidebar-menu-label">{t('consoleSection')}</div>}
            {canAccessPath('/console/data-sources') && (
              <NavLink
                to="/console/data-sources"
                title={t('dataSources')}
                className={({ isActive }) => `sidebar-link ${isActive ? 'sidebar-link-active' : ''}`}
              >
                <Database size={18} strokeWidth={1.75} />
                <span>{t('dataSources')}</span>
              </NavLink>
            )}
            {canAccessPath('/console/storage') && (
              <NavLink
                to="/console/storage"
                title={t('objectStorage')}
                className={({ isActive }) => `sidebar-link ${isActive ? 'sidebar-link-active' : ''}`}
              >
                <HardDrive size={18} strokeWidth={1.75} />
                <span>{t('objectStorage')}</span>
              </NavLink>
            )}
            {canAccessPath('/console/settings') && (
              <NavLink
                to="/console/settings"
                title={t('systemSettings')}
                className={({ isActive }) => `sidebar-link ${isActive ? 'sidebar-link-active' : ''}`}
              >
                <Settings size={18} strokeWidth={1.75} />
                <span>{t('systemSettings')}</span>
              </NavLink>
            )}
            {canAccessPath('/console/users') && (
              <NavLink
                to="/console/users"
                title={t('usersAndRoles')}
                className={({ isActive }) => `sidebar-link ${isActive ? 'sidebar-link-active' : ''}`}
              >
                <Users size={18} strokeWidth={1.75} />
                <span>{t('usersAndRoles')}</span>
              </NavLink>
            )}
            {canAccessPath('/console/feature-toggles') && (
              <NavLink
                to="/console/feature-toggles"
                title={t('featureToggles')}
                className={({ isActive }) => `sidebar-link ${isActive ? 'sidebar-link-active' : ''}`}
              >
                <ToggleLeft size={18} strokeWidth={1.75} />
                <span>{t('featureToggles')}</span>
              </NavLink>
            )}
          </div>
        ) : (
          <>
            <NavLink
              to="/"
              end
              title={moduleTooltip(t('home'), t('appTaglineHome'))}
              className={({ isActive }) => `sidebar-link ${isActive ? 'sidebar-link-active' : ''}`}
            >
              <HomeIcon size={18} strokeWidth={1.75} />
              <span>{t('home')}</span>
            </NavLink>
            {appModules.map((mod) => {
              const Icon = mod.icon;
              const label = t(mod.labelKey);
              const tagline = t(mod.taglineKey);
              const active = mod.isActive(location.pathname);
              return (
                <NavLink
                  key={mod.id}
                  to={mod.homePath}
                  title={moduleTooltip(label, tagline)}
                  className={`sidebar-link ${active ? 'sidebar-link-active' : ''}`}
                >
                  <Icon size={18} strokeWidth={1.75} />
                  <span>{label}</span>
                </NavLink>
              );
            })}
          </>
        )}
      </nav>
    </aside>
  );
}
