import { NavLink, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Box, Compass } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

type NavItem = {
  to: string;
  labelKey: string;
  icon: typeof Box;
  match: (pathname: string) => boolean;
  canPath: string;
};

const EXPLORER_NAV: NavItem[] = [
  {
    to: '/object-explorer/explorations',
    labelKey: 'exploreHome',
    icon: Box,
    match: (p) => p.startsWith('/object-explorer/explorations'),
    canPath: '/object-explorer/explorations',
  },
  {
    to: '/object-explorer/explore',
    labelKey: 'cypher',
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
    <aside className="filter-rail" aria-label={t('objectExplorerNav')}>
      <div className="filter-rail__head">
        <h2 className="filter-rail__title">{t('objectExplorer')}</h2>
      </div>
      <nav className="filter-rail__nav">
        {items.map((item) => {
          const Icon = item.icon;
          const active = item.match(location.pathname);
          return (
            <NavLink
              key={item.to}
              to={item.to}
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
