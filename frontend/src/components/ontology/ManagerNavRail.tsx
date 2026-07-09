import { NavLink, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Box, Code2, FolderTree, Link2, Network, Table, Zap } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import './OntologyNavRail.scss';

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
    to: '/ontology-manager/actions',
    labelKey: 'ontologyActions',
    icon: Zap,
    match: (p) => p.startsWith('/ontology-manager/actions'),
    canPath: '/ontology-manager/actions',
  },
  {
    to: '/ontology-manager/datasets',
    labelKey: 'datasets',
    icon: Table,
    match: (p) => p.startsWith('/ontology-manager/datasets'),
    canPath: '/ontology-manager/datasets',
  },
];

export function ManagerNavRail() {
  const { t } = useTranslation('layout');
  const location = useLocation();
  const { canAccessPath } = useAuth();
  const items = MANAGER_NAV.filter((item) => canAccessPath(item.canPath));

  if (items.length === 0) return null;

  return (
    <aside className="ontology-nav-rail" aria-label={t('ontologyManagerNav')}>
      <div className="ontology-nav-rail__title">{t('ontologyManager')}</div>
      <nav className="ontology-nav-rail__nav">
        {items.map((item) => {
          const Icon = item.icon;
          const active = item.match(location.pathname);
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/ontology-manager'}
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
