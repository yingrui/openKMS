import { NavLink, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Code2, List } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import './OntologyNavRail.scss';

export function FunctionEditorNavRail() {
  const { t } = useTranslation('layout');
  const location = useLocation();
  const { canAccessPath } = useAuth();

  if (!canAccessPath('/function-editor')) return null;

  const listActive =
    location.pathname === '/function-editor' || location.pathname === '/function-editor/';

  return (
    <aside className="ontology-nav-rail" aria-label={t('functionEditorNav')}>
      <div className="ontology-nav-rail__title">{t('functionEditor')}</div>
      <nav className="ontology-nav-rail__nav">
        <NavLink
          to="/function-editor"
          end
          className={`ontology-nav-rail__link${listActive ? ' ontology-nav-rail__link--active' : ''}`}
          title={t('allFunctions')}
        >
          <List size={16} strokeWidth={1.75} aria-hidden />
          <span>{t('allFunctions')}</span>
        </NavLink>
        <NavLink
          to="/function-editor/new"
          className={`ontology-nav-rail__link${location.pathname === '/function-editor/new' ? ' ontology-nav-rail__link--active' : ''}`}
          title={t('createFunction')}
        >
          <Code2 size={16} strokeWidth={1.75} aria-hidden />
          <span>{t('createFunction')}</span>
        </NavLink>
      </nav>
    </aside>
  );
}
