import { NavLink, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Box,
  Compass,
  Link2,
  Network,
  Table,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import './OntologyNavRail.scss';

type NavItem = {
  to: string;
  labelKey: string;
  icon: typeof Network;
  match: (pathname: string) => boolean;
  canPath: string;
};

const ONTOLOGY_NAV: NavItem[] = [
  {
    to: '/ontology',
    labelKey: 'ontologyOverview',
    icon: Network,
    match: (p) => p === '/ontology',
    canPath: '/ontology',
  },
  {
    to: '/ontology/datasets',
    labelKey: 'datasets',
    icon: Table,
    match: (p) => p.startsWith('/ontology/datasets'),
    canPath: '/ontology/datasets',
  },
  {
    to: '/ontology/object-types',
    labelKey: 'objectTypes',
    icon: Box,
    match: (p) => p.startsWith('/ontology/object-types'),
    canPath: '/ontology/object-types',
  },
  {
    to: '/ontology/link-types',
    labelKey: 'linkTypes',
    icon: Link2,
    match: (p) => p.startsWith('/ontology/link-types'),
    canPath: '/ontology/link-types',
  },
  {
    to: '/objects',
    labelKey: 'objects',
    icon: Box,
    match: (p) => p.startsWith('/objects'),
    canPath: '/objects',
  },
  {
    to: '/links',
    labelKey: 'links',
    icon: Link2,
    match: (p) => p.startsWith('/links'),
    canPath: '/links',
  },
  {
    to: '/object-explorer',
    labelKey: 'objectExplorer',
    icon: Compass,
    match: (p) => p.startsWith('/object-explorer'),
    canPath: '/object-explorer',
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
      <div className="ontology-nav-rail__title">{t('ontology')}</div>
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
  return (
    pathname.startsWith('/ontology') ||
    pathname.startsWith('/objects') ||
    pathname.startsWith('/links') ||
    pathname.startsWith('/object-explorer')
  );
}
