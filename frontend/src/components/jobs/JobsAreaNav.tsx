import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import './JobsAreaNav.scss';

export function JobsAreaNav() {
  const { t } = useTranslation('workspace');

  return (
    <nav className="jobs-area-nav" aria-label={t('jobs.nav.areaLabel')}>
      <NavLink to="/job-runs" end className={({ isActive }) => `jobs-area-nav-link${isActive ? ' active' : ''}`}>
        {t('jobs.nav.runs')}
      </NavLink>
      <NavLink
        to="/job-runs/schedules"
        className={({ isActive }) => `jobs-area-nav-link${isActive ? ' active' : ''}`}
      >
        {t('jobs.nav.schedules')}
      </NavLink>
    </nav>
  );
}
