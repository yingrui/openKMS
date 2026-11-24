import { NavLink, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { List, Workflow } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

export function FunctionEditorNavRail() {
  const { t } = useTranslation('layout');
  const location = useLocation();
  const { canAccessPath } = useAuth();

  if (!canAccessPath('/function-editor')) return null;

  const listActive =
    location.pathname === '/function-editor' || location.pathname === '/function-editor/';
  const logicActive =
    location.pathname === '/function-editor/logic' ||
    location.pathname === '/function-editor/logic/';

  return (
    <aside className="filter-rail" aria-label={t('functionEditorNav')}>
      <div className="filter-rail__head">
        <h2 className="filter-rail__title">{t('functionEditor')}</h2>
      </div>
      <nav className="filter-rail__nav">
        <NavLink
          to="/function-editor"
          end
          className={`filter-rail__link${listActive ? ' filter-rail__link--active' : ''}`}
          title={t('allFunctions')}
        >
          <List size={16} strokeWidth={1.75} aria-hidden />
          <span>{t('allFunctions')}</span>
        </NavLink>
        <NavLink
          to="/function-editor/logic"
          className={`filter-rail__link${logicActive ? ' filter-rail__link--active' : ''}`}
          title={t('logicFunctions')}
        >
          <Workflow size={16} strokeWidth={1.75} aria-hidden />
          <span>{t('logicFunctions')}</span>
        </NavLink>
      </nav>
    </aside>
  );
}
