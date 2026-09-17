/**
 * 知识图谱导航 rail —— 承载「实际对象与关系」层(从本体模块移出的实例/浏览器)。
 * 图谱总览(/kg 可拖拽业务图)· 图谱问答(/graph-qa)· 图谱查询(/object-explorer 力导图)· 对象和实例(/objects)· 关联关系(/links)。
 * 镜像 OntologyNavRail 的结构与样式。
 */
import { NavLink, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Box, Compass, Link2, Network, MessagesSquare, Waypoints, DatabaseZap } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import '../ontology/OntologyNavRail.scss';

type NavItem = { to: string; labelKey: string; icon: typeof Network; match: (p: string) => boolean; canPath: string };

const GRAPH_NAV: NavItem[] = [
  { to: '/kg', labelKey: 'graphOverview', icon: Waypoints, match: (p) => p === '/kg', canPath: '/kg' },
  { to: '/graph-qa', labelKey: 'graphQa2', icon: MessagesSquare, match: (p) => p.startsWith('/graph-qa'), canPath: '/kg' },
  { to: '/object-explorer', labelKey: 'graphQueryQa', icon: Compass, match: (p) => p.startsWith('/object-explorer'), canPath: '/object-explorer' },
  { to: '/objects', labelKey: 'graphObjects', icon: Box, match: (p) => p.startsWith('/objects'), canPath: '/objects' },
  { to: '/links', labelKey: 'graphLinks', icon: Link2, match: (p) => p.startsWith('/links'), canPath: '/links' },
  { to: '/materialization', labelKey: 'graphMaterialization', icon: DatabaseZap, match: (p) => p.startsWith('/materialization'), canPath: '/kg' },
];

export function GraphNavRail() {
  const { t } = useTranslation('layout');
  const location = useLocation();
  const { canAccessPath } = useAuth();
  const items = GRAPH_NAV.filter((item) => canAccessPath(item.canPath));
  if (items.length === 0) return null;

  return (
    <aside className="ontology-nav-rail" aria-label={t('graphAppNav')}>
      <div className="ontology-nav-rail__title">{t('knowledgeMap')}</div>
      <nav className="ontology-nav-rail__nav">
        {items.map((item) => {
          const Icon = item.icon;
          const active = item.match(location.pathname);
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/kg'}
              className={`ontology-nav-rail__link${active ? ' ontology-nav-rail__link--active' : ''}`}
              title={t(item.labelKey)}
            >
              <Icon size={16} strokeWidth={1.75} aria-hidden />
              <span>{t(item.labelKey)}</span>
            </NavLink>
          );
        })}
      </nav>
    </aside>
  );
}

export function isGraphAppPath(pathname: string): boolean {
  return (
    pathname === '/kg' ||
    pathname.startsWith('/graph-qa') ||
    pathname.startsWith('/objects') ||
    pathname.startsWith('/links') ||
    pathname.startsWith('/object-explorer') ||
    pathname.startsWith('/materialization')
  );
}
