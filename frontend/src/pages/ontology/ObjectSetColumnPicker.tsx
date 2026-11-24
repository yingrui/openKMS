import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Columns3 } from 'lucide-react';

/**
 * Which properties the results table shows, and in what order.
 *
 * A type can carry seventeen properties; a table showing all of them is a table nobody reads. The choice is part of
 * the layout, so it is saved with the exploration and comes back with it.
 */
export function ObjectSetColumnPicker({
  columns,
  properties,
  onChange,
}: {
  columns: string[];
  properties: string[];
  onChange: (next: string[]) => void;
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

  const toggle = (name: string) =>
    onChange(
      columns.includes(name) ? columns.filter((column) => column !== name) : [...columns, name]
    );

  const move = (name: string, direction: -1 | 1) => {
    const index = columns.indexOf(name);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= columns.length) return;
    const next = [...columns];
    next[index] = columns[target];
    next[target] = name;
    onChange(next);
  };

  return (
    <div className="object-set-columns" ref={rootRef}>
      <button
        type="button"
        className="btn btn-secondary btn-sm"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <Columns3 size={14} aria-hidden />
        {t('objectSet.columnsCount', { count: columns.length })}
      </button>
      {open ? (
        <div className="object-set-columns__panel">
          {properties.map((name) => {
            const rank = columns.indexOf(name);
            return (
              <div key={name} className="object-set-columns__row">
                <label className="object-set-columns__check">
                  <input
                    type="checkbox"
                    checked={rank >= 0}
                    onChange={() => toggle(name)}
                    aria-label={t('objectSet.columnShow', { name })}
                  />
                  <span>{name}</span>
                </label>
                {rank >= 0 ? (
                  <span className="object-set-columns__actions">
                    <button
                      type="button"
                      aria-label={t('objectSet.columnEarlier', { name })}
                      disabled={rank === 0}
                      onClick={() => move(name, -1)}
                    >
                      ‹
                    </button>
                    <button
                      type="button"
                      aria-label={t('objectSet.columnLater', { name })}
                      disabled={rank === columns.length - 1}
                      onClick={() => move(name, 1)}
                    >
                      ›
                    </button>
                  </span>
                ) : null}
              </div>
            );
          })}
          <button
            type="button"
            className="object-set-columns__all"
            onClick={() => onChange(properties)}
          >
            {t('objectSet.columnsAll')}
          </button>
        </div>
      ) : null}
    </div>
  );
}
