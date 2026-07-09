import { NavLink, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Box, Compass, Link2 } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import './OntologyNavRail.scss';

type NavItem = {
  to: string;
  labelKey: string;
  icon: typeof Box;
  match: (pathname: string) => boolean;
  canPath: string;
};

const EXPLORER_NAV: NavItem[] = [
  {
    to: '/object-explorer/objects',
    labelKey: 'objects',
    icon: Box,
    match: (p) => p.startsWith('/object-explorer/objects'),
    canPath: '/object-explorer/objects',
  },
  {
    to: '/object-explorer/links',
    labelKey: 'links',
    icon: Link2,
    match: (p) => p.startsWith('/object-explorer/links'),
    canPath: '/object-explorer/links',
  },
  {
    to: '/object-explorer/explore',
    labelKey: 'explore',
    icon: Compass,
    match: (p) => p === '/object-explorer/explore' || p === '/object-explorer',
    canPath: '/object-explorer/explore',
  },
];

export function ExplorerNavRail() {
  const { t } = useTranslation('layout');
  const location = useLocation();
  const { canAccessPath } = useAuth();
  const items = EXPLORER_NAV.filter((item) => canAccessPath(item.canPath));

  if (items.length === 0) return null;

  return (
    <aside className="ontology-nav-rail" aria-label={t('objectExplorerNav')}>
      <div className="ontology-nav-rail__title">{t('objectExplorer')}</div>
      <nav className="ontology-nav-rail__nav">
        {items.map((item) => {
          const Icon = item.icon;
          const active = item.match(location.pathname);
          return (
            <NavLink
              key={item.to}
              to={item.to}
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
