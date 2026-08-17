import { NavLink, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { LayoutTemplate, List, Plus } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import './OntologyNavRail.scss';

export function AppBuilderNavRail() {
  const { t } = useTranslation('layout');
  const location = useLocation();
  const { canAccessPath } = useAuth();

  if (!canAccessPath('/app-builder')) return null;

  const listActive =
    location.pathname === '/app-builder' || location.pathname === '/app-builder/';

  return (
    <aside className="ontology-nav-rail" aria-label={t('appBuilderNav')}>
      <div className="ontology-nav-rail__title">{t('appBuilder')}</div>
      <nav className="ontology-nav-rail__nav">
        <NavLink
          to="/app-builder"
          end
          className={`ontology-nav-rail__link${listActive ? ' ontology-nav-rail__link--active' : ''}`}
          title={t('allApps')}
        >
          <List size={16} strokeWidth={1.75} aria-hidden />
          <span>{t('allApps')}</span>
        </NavLink>
        <NavLink
          to="/app-builder/new"
          className={`ontology-nav-rail__link${location.pathname === '/app-builder/new' ? ' ontology-nav-rail__link--active' : ''}`}
          title={t('newApp')}
        >
          <Plus size={16} strokeWidth={1.75} aria-hidden />
          <span>{t('newApp')}</span>
        </NavLink>
        {/^\/app-builder\/[^/]+\/design$/.test(location.pathname) ? (
          <NavLink
            to={location.pathname}
            className="ontology-nav-rail__link ontology-nav-rail__link--active"
            title={t('designApp')}
          >
            <LayoutTemplate size={16} strokeWidth={1.75} aria-hidden />
            <span>{t('designApp')}</span>
          </NavLink>
        ) : null}
      </nav>
    </aside>
  );
}
