import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronDown } from 'lucide-react';
import { fetchExplorations, type ExplorationResponse } from '../../data/explorationsApi';
import './ExplorerMenu.scss';

/**
 * The explorer's own menu, in the top-right of every page it owns.
 *
 * Two sections and a growing list of saved explorations do not need a rail or a tab strip: a 220px column or a
 * permanent row costs space to say "there are two pages". The menu holds the sections **and** the recent
 * explorations, which is what actually gets switched between once more than one exists.
 */
export function ExplorerMenu() {
  const { t } = useTranslation('explore');
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [recent, setRecent] = useState<ExplorationResponse[]>([]);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void fetchExplorations()
      .then((rows) => {
        if (!cancelled) setRecent(rows.slice(0, 6));
      })
      .catch(() => {
        if (!cancelled) setRecent([]);
      });
    const onDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      cancelled = true;
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const go = (to: string) => {
    setOpen(false);
    navigate(to);
  };

  return (
    <div className="explorer-menu" ref={rootRef}>
      <button
        type="button"
        className="btn btn-secondary btn-sm explorer-menu__trigger"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        {t('explorerSections.explorations')}
        <ChevronDown size={14} aria-hidden />
      </button>

      {open ? (
        <div className="explorer-menu__panel" role="menu">
          <button type="button" role="menuitem" onClick={() => go('/object-explorer/explorations')}>
            {t('explorerSections.allExplorations')}
          </button>
          <button type="button" role="menuitem" onClick={() => go('/object-explorer/explore')}>
            {t('explorerSections.query')}
          </button>
          {recent.length > 0 ? (
            <>
              <p className="explorer-menu__label">{t('explorerSections.recent')}</p>
              {recent.map((row) => (
                <Link
                  key={row.id}
                  role="menuitem"
                  className="explorer-menu__recent"
                  to={`/object-explorer/explorations/${row.object_type_id}?saved=${row.id}`}
                  onClick={() => setOpen(false)}
                >
                  <span className="explorer-menu__recent-name">{row.name}</span>
                  <span className="explorer-menu__recent-meta">
                    {row.object_type_name ?? row.object_type_id}
                  </span>
                </Link>
              ))}
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
