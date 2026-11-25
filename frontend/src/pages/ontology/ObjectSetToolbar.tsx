import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

export interface PivotOption {
  key: string;
  label: string;
  viaName: string;
  targetTypeId: string;
  link: string;
}

/**
 * The exploration's controls: take back the last change, search the set, or change its subject through a link.
 *
 * Undo sits first because it is the one control a reader reaches for mid-thought; the pivot menu is last because
 * changing the subject is a different question, not another filter.
 */
export function ObjectSetToolbar({
  search,
  onSearch,
  pivots,
  canPivot,
  pivotBlockedReason,
  onPivot,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
}: {
  search: string;
  onSearch: (next: string) => void;
  pivots: PivotOption[];
  canPivot: boolean;
  pivotBlockedReason: string;
  onPivot: (targetTypeId: string, link: string) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
}) {
  const { t } = useTranslation('explore');
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="object-set-toolbar">
      <div className="object-set-undo">
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          disabled={!canUndo}
          aria-label={t('objectSet.undo')}
          title={t('objectSet.undo')}
          onClick={onUndo}
        >
          ↶
        </button>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          disabled={!canRedo}
          aria-label={t('objectSet.redo')}
          title={t('objectSet.redo')}
          onClick={onRedo}
        >
          ↷
        </button>
      </div>
      <input
        className="ds-control object-set-toolbar__search"
        value={search}
        onChange={(event) => onSearch(event.target.value)}
        placeholder={t('objectSet.searchPlaceholder')}
        aria-label={t('objectSet.searchPlaceholder')}
      />
      {pivots.length > 0 ? (
        <div className="object-set-pivot" ref={rootRef}>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            aria-expanded={open}
            disabled={!canPivot}
            title={canPivot ? undefined : pivotBlockedReason}
            onClick={() => setOpen((value) => !value)}
          >
            {t('objectSet.pivot')}
          </button>
          {open && canPivot ? (
            <div className="object-set-pivot__panel" role="menu">
              {pivots.map((pivot) => (
                <button
                  key={pivot.key}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setOpen(false);
                    onPivot(pivot.targetTypeId, pivot.link);
                  }}
                >
                  <span>{pivot.label}</span>
                  <span className="object-set-pivot__via">
                    {t('objectSet.pivotVia', { name: pivot.viaName })}
                  </span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
