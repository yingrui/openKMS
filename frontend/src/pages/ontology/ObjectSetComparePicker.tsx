import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { GitCompareArrows } from 'lucide-react';
import type { ExplorationResponse } from '../../data/explorationsApi';

/**
 * Choosing what the charts are compared against.
 *
 * A number in isolation is a fact; a number next to last week's is a decision. Three baselines cover the questions
 * people bring: everyone (is this group unusual?), a saved exploration (is this scenario better?), or nothing.
 */
export function ObjectSetComparePicker({
  label,
  explorations,
  onChange,
}: {
  /** `null` when nothing is being compared; otherwise the baseline's name, shown on the button. */
  label: string | null;
  explorations: ExplorationResponse[];
  onChange: (target: string) => void;
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

  const pick = (next: string) => {
    setOpen(false);
    onChange(next);
  };

  return (
    <div className="object-set-compare" ref={rootRef}>
      <button
        type="button"
        className="btn btn-secondary btn-sm"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <GitCompareArrows size={14} aria-hidden />
        {label ? t('objectSet.compareWith', { name: label }) : t('objectSet.compare')}
      </button>
      {open ? (
        <div className="object-set-compare__panel" role="menu">
          <button type="button" role="menuitem" onClick={() => pick('')}>
            {t('objectSet.compareNone')}
          </button>
          <button type="button" role="menuitem" onClick={() => pick('all')}>
            {t('objectSet.compareAll')}
          </button>
          {explorations.length > 0 ? (
            <p className="object-set-compare__label">{t('objectSet.compareExplorations')}</p>
          ) : null}
          {explorations.map((row) => (
            <button key={row.id} type="button" role="menuitem" onClick={() => pick(row.id)}>
              <span className="object-set-compare__name">{row.name}</span>
              <span className="object-set-compare__meta">
                {row.object_type_name ?? row.object_type_id}
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
