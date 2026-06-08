import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import './AgentsAreaNav.scss';

export function AgentsAreaNav() {
  const { t } = useTranslation('agents');

  return (
    <nav className="agents-area-nav" aria-label={t('nav.areaLabel')}>
      <NavLink to="/agents" end className={({ isActive }) => `agents-area-nav-link${isActive ? ' active' : ''}`}>
        {t('nav.projects')}
      </NavLink>
      <NavLink to="/agents/skills" className={({ isActive }) => `agents-area-nav-link${isActive ? ' active' : ''}`}>
        {t('nav.skills')}
      </NavLink>
    </nav>
  );
}
