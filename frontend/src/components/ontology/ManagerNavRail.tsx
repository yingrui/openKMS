import { NavLink, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Box, Code2, FolderTree, Link2, Network, Zap } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

type NavItem = {
  to: string;
  labelKey: string;
  icon: typeof Network;
  match: (pathname: string) => boolean;
  canPath: string;
};

const MANAGER_NAV: NavItem[] = [
  {
    to: '/ontology-manager',
    labelKey: 'ontologyOverview',
    icon: Network,
    match: (p) => p === '/ontology-manager',
    canPath: '/ontology-manager',
  },
  {
    to: '/ontology-manager/groups',
    labelKey: 'ontologyGroups',
    icon: FolderTree,
    match: (p) => p.startsWith('/ontology-manager/groups'),
    canPath: '/ontology-manager/groups',
  },
  {
    to: '/ontology-manager/object-types',
    labelKey: 'objectTypes',
    icon: Box,
    match: (p) => p.startsWith('/ontology-manager/object-types'),
    canPath: '/ontology-manager/object-types',
  },
  {
    to: '/ontology-manager/link-types',
    labelKey: 'linkTypes',
    icon: Link2,
    match: (p) => p.startsWith('/ontology-manager/link-types'),
    canPath: '/ontology-manager/link-types',
  },
  {
    to: '/ontology-manager/functions',
    labelKey: 'ontologyFunctions',
    icon: Code2,
    match: (p) => p.startsWith('/ontology-manager/functions'),
    canPath: '/ontology-manager/functions',
  },
  {
    to: '/ontology-manager/action-types',
    labelKey: 'ontologyActionTypes',
    icon: Zap,
    match: (p) =>
      p.startsWith('/ontology-manager/action-types') || p.startsWith('/ontology-manager/actions'),
    canPath: '/ontology-manager/action-types',
  },
];

export function ManagerNavRail() {
  const { t } = useTranslation('layout');
  const location = useLocation();
  const { canAccessPath } = useAuth();
  const items = MANAGER_NAV.filter((item) => canAccessPath(item.canPath));

  if (items.length === 0) return null;

  return (
    <aside className="filter-rail" aria-label={t('ontologyManagerNav')}>
      <div className="filter-rail__title">{t('ontologyManager')}</div>
      <nav className="filter-rail__nav">
        {items.map((item) => {
          const Icon = item.icon;
          const active = item.match(location.pathname);
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/ontology-manager'}
              className={`filter-rail__link${active ? ' filter-rail__link--active' : ''}`}
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
