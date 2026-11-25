import { useEffect, useRef, useState } from 'react';
import { Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';

/**
 * Adding a chart is a button in the section's header, not a card in the grid.
 *
 * A tile the size of a chart said "the grid has an empty slot", which is true of nothing: the grid holds charts, and
 * adding one is an action about the section. The picker lists the type's own properties and, under a heading, the
 * ones reachable through a link.
 */
export function ObjectSetChartAdd({
  options,
  onAdd,
}: {
  options: { value: string; label: string }[];
  onAdd: (prop: string) => void;
}) {
  const { t } = useTranslation('explore');
  const [open, setOpen] = useState(false);
  const [needle, setNeedle] = useState('');
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

  if (options.length === 0) return null;
  const needleLower = needle.trim().toLowerCase();
  const shown = needleLower
    ? options.filter((option) => option.label.toLowerCase().includes(needleLower))
    : options;

  return (
    <div className="object-set-chart-add" ref={rootRef}>
      <button
        type="button"
        className="btn btn-secondary btn-sm"
        aria-expanded={open}
        onClick={() => {
          setOpen((value) => !value);
          setNeedle('');
        }}
      >
        <Plus size={14} aria-hidden />
        {t('objectSet.chartAdd')}
      </button>
      {open ? (
        <div className="object-set-chart-add__panel" role="menu">
          <input
            className="ds-control ds-control--compact"
            value={needle}
            onChange={(event) => setNeedle(event.target.value)}
            placeholder={t('objectSet.chartAddPick')}
            aria-label={t('objectSet.chartAddPick')}
            autoFocus
          />
          {shown.length === 0 ? (
            <p className="object-set-chart-add__empty">{t('objectSet.chartAddNone')}</p>
          ) : (
            shown.map((option) => (
              <button
                key={option.value}
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  onAdd(option.value);
                }}
              >
                {option.label}
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
