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
  Download,
  FileText,
  Bot,
  Boxes,
  Network,
  ClipboardCheck,
  Layers,
  BarChart3,
  SlidersHorizontal,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';


import { isConsoleShellPath } from '../../config/appModules';
import { useVisibleConsolePlatformModules, useVisibleMainSidebarModules } from '../../hooks/useAppModules';
import { useAuth } from '../../contexts/AuthContext';
import './Sidebar.scss';

// 安利企业知识中枢 · 固定九大导航（对齐方案概念图）。
// 用户不区分文章/文档/媒体——「知识接入」是统一上传入口，「内容资产」是统一内容视图。
// requires = 该项依赖的模块 homePath；undefined 表示始终显示（首页/接入/系统治理）。
const AMWAY_NAV: { to: string; end?: boolean; icon: typeof HomeIcon; label: string; requires?: string }[] = [
  { to: '/', end: true, icon: HomeIcon, label: '首页' },
  { to: '/ingest', icon: Download, label: '知识接入' },
  { to: '/content', icon: FileText, label: '内容资产', requires: '/articles' },
  { to: '/ontology', icon: Boxes, label: '本体编排', requires: '/ontology' },
  { to: '/kg', icon: Network, label: '知识图谱' },
  { to: '/knowledge-bases', icon: Database, label: '知识库', requires: '/knowledge-bases' },
  { to: '/services', icon: Layers, label: '知识服务' },
  { to: '/agents', icon: Bot, label: '智能体项目', requires: '/agents' },
  { to: '/evaluations', icon: BarChart3, label: '评测运营', requires: '/evaluations' },
  { to: '/review', icon: ClipboardCheck, label: '审核发布' },
  { to: '/console', icon: SlidersHorizontal, label: '系统治理' },
];

export function Sidebar() {
  const { t } = useTranslation('layout');
  const location = useLocation();
  const consoleShell = isConsoleShellPath(location.pathname);
  const { canAccessConsole, canAccessPath } = useAuth();
  const consolePlatformModules = useVisibleConsolePlatformModules();
  // 安利固定九项导航仍要过权限：拿可见模块的 homePath 集合，过滤掉无权访问的项。
  // 首页与系统治理始终显示；其余按对应模块可见性过滤。
  const visibleModulePaths = new Set(useVisibleMainSidebarModules().map((m) => m.homePath));

  const showConsoleDataLabel =
    canAccessPath('/console/data-sources') ||
    canAccessPath('/console/storage') ||
    canAccessPath('/console/settings') ||
    canAccessPath('/console/users') ||
    canAccessPath('/console/feature-toggles');

  const showPlatformOpsLabel = consolePlatformModules.length > 0;

  const showConsoleNav = consoleShell && canAccessConsole;
  // 安利 demo：主导航展开显示文字（不折叠成图标窄栏）。
  const railCollapsed = false;

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
            {AMWAY_NAV.filter((item) => !item.requires || visibleModulePaths.has(item.requires)).map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={'end' in item ? item.end : undefined}
                  title={item.label}
                  className={({ isActive }) => `sidebar-link ${isActive ? 'sidebar-link-active' : ''}`}
                >
                  <Icon size={21} strokeWidth={1.9} />
                  <span>{item.label}</span>
                </NavLink>
              );
            })}
          </>
        )}
      </nav>
    </aside>
  );
}
