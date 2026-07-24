import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { LayoutGrid } from 'lucide-react';
import { useVisibleLauncherModules } from '../../hooks/useAppModules';
import { AppCatalogGrid } from './AppCatalogGrid';
import './AppCatalogGrid.scss';
import './AppLauncher.scss';

export function AppLauncher() {
  const { t } = useTranslation('layout');
  const navigate = useNavigate();
  const launcherModules = useVisibleLauncherModules();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const hasApps = launcherModules.length > 0;
  if (!hasApps) return null;

  return (
    <div className="app-launcher" ref={rootRef}>
      <button
        type="button"
        className={`app-launcher-trigger${open ? ' app-launcher-trigger--open' : ''}`}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="true"
        aria-label={t('appLauncher')}
        title={t('appLauncher')}
      >
        <LayoutGrid size={20} strokeWidth={1.75} />
      </button>
      {open && (
        <>
          <button
            type="button"
            className="app-launcher-backdrop"
            aria-label={t('closeAppLauncher')}
            onClick={() => setOpen(false)}
          />
          <div className="app-launcher-panel" role="menu">
            <AppCatalogGrid
              variant="launcher"
              modules={launcherModules}
              onSelect={(mod) => {
                setOpen(false);
                void navigate(mod.homePath);
              }}
            />
          </div>
        </>
      )}
    </div>
  );
}
