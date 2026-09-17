import { NavLink, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Boxes, History, Network } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import './OntologyNavRail.scss';

type NavItem = {
  to: string;
  labelKey: string;
  icon: typeof Network;
  match: (pathname: string) => boolean;
  canPath: string;
};

// 本体编排 = 只管「类型与规则」。实例/浏览器→知识图谱;问答→图谱图查询;工作流→审核发布;数据集→知识接入。
const ONTOLOGY_NAV: NavItem[] = [
  {
    to: '/ontology',
    labelKey: 'ontologyOverviewNav',
    icon: Network,
    match: (p) => p === '/ontology',
    canPath: '/ontology',
  },
  {
    to: '/ontology/workbench',
    labelKey: 'ontologyWorkbench',
    icon: Boxes,
    match: (p) => p.startsWith('/ontology/workbench'),
    canPath: '/ontology',
  },
  {
    to: '/ontology/versions',
    labelKey: 'ontologyVersions',
    icon: History,
    match: (p) => p.startsWith('/ontology/versions'),
    canPath: '/ontology',
  },
];

export function OntologyNavRail() {
  const { t } = useTranslation('layout');
  const location = useLocation();
  const { canAccessPath } = useAuth();
  const items = ONTOLOGY_NAV.filter((item) => canAccessPath(item.canPath));

  if (items.length === 0) return null;

  return (
    <aside className="ontology-nav-rail" aria-label={t('ontologyAppNav')}>
      <div className="ontology-nav-rail__title">{t('ontologyArrange')}</div>
      <nav className="ontology-nav-rail__nav">
        {items.map((item) => {
          const Icon = item.icon;
          const active = item.match(location.pathname);
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/ontology'}
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

export function isOntologyAppPath(pathname: string): boolean {
  // 只在本体模型面显示本体 rail;实例/浏览器已归属知识图谱 rail。
  return pathname.startsWith('/ontology');
}
