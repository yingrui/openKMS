import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, ChevronDown } from 'lucide-react';
import { SearchField } from '../../styles/design-system/ListToolbar';
import type { ScopeOption } from './ontologyScopeOption';

/**
 * The search's scope: which groups or object types the query looks at.
 *
 * A native dropdown cannot carry this — the trigger has to summarise a *set* ("Airline, Airport…"), the panel has
 * two kinds of thing in it (groups and types), and both need counts and their own search field. So it is a small
 * popover: one trigger, two tabs, checkboxes.
 */
export function OntologyScopePicker({
  groups,
  types,
  selected,
  inherited = [],
  onChange,
}: {
  groups: ScopeOption[];
  types: ScopeOption[];
  selected: string[];
  /** The scope the navigation implies when nothing is picked explicitly (the group being browsed). */
  inherited?: string[];
  onChange: (next: string[]) => void;
}) {
  const { t } = useTranslation('explore');
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'groups' | 'types'>('groups');
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

  const labelOf = useMemo(() => {
    const all = new Map([...groups, ...types].map((option) => [option.id, option.label]));
    return (id: string) => all.get(id) ?? id;
  }, [groups, types]);

  /* What the trigger shows: the explicit selection, or — when there is none — what the navigation implies. */
  const effective = selected.length > 0 ? selected : inherited;
  const chosen = effective.map(labelOf);

  const rows = (tab === 'groups' ? groups : types).filter(
    (option) =>
      !needle.trim() ||
      option.label.toLowerCase().includes(needle.trim().toLowerCase()) ||
      (option.detail ?? '').toLowerCase().includes(needle.trim().toLowerCase())
  );

  /* Toggling works on the **effective** set, which includes what the navigation inherits — otherwise the group
     shown as checked could not be unchecked at all. */
  const toggle = (id: string) =>
    onChange(effective.includes(id) ? effective.filter((x) => x !== id) : [...effective, id]);

  const findLabel = tab === 'groups' ? t('objects.scopeFindGroup') : t('objects.scopeFindType');

  return (
    <div className="ontology-scope" ref={rootRef}>
      <button
        type="button"
        className="ontology-scope__trigger"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        title={chosen.length > 0 ? chosen.join(', ') : t('objects.scopeAll')}
      >
        <span className="ontology-scope__value">
          {chosen.length === 0 ? t('objects.scopeAll') : chosen.join(', ')}
        </span>
        <ChevronDown size={14} aria-hidden />
      </button>

      {open ? (
        <div className="ontology-scope__panel" role="dialog" aria-label={t('objects.searchScope')}>
          <div className="ontology-scope__head">
            <span>
              {chosen.length === 0
                ? t('objects.scopeSearchingAll')
                : t('objects.scopeSearchingSelected')}
            </span>
            {effective.length > 0 ? (
              <button type="button" className="btn-link" onClick={() => onChange([])}>
                {t('objects.scopeRemoveAll')}
              </button>
            ) : null}
          </div>

          <div className="ontology-scope__tabs" role="tablist">
            {(['groups', 'types'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                role="tab"
                aria-selected={tab === mode}
                className="ontology-scope__tab"
                onClick={() => setTab(mode)}
              >
                {mode === 'groups' ? t('objects.scopeGroups') : t('objects.scopeTypes')}
              </button>
            ))}
          </div>

          <SearchField
            compact
            value={needle}
            onChange={setNeedle}
            className="ontology-scope__search"
            label={findLabel}
            placeholder={findLabel}
          />

          <ul className="ontology-scope__list">
            {rows.map((option) => {
              const active = effective.includes(option.id);
              return (
                <li key={option.id}>
                  <button
                    type="button"
                    className={`ontology-scope__row${active ? ' is-active' : ''}`}
                    aria-pressed={active}
                    onClick={() => toggle(option.id)}
                  >
                    <span className="ontology-scope__check">{active ? <Check size={13} aria-hidden /> : null}</span>
                    <span className="ontology-scope__label">
                      <span className="ontology-scope__name">{option.label}</span>
                      {option.detail ? (
                        <span className="ontology-scope__detail">{option.detail}</span>
                      ) : null}
                    </span>
                    <span className="ontology-scope__count">{option.count}</span>
                  </button>
                </li>
              );
            })}
            {rows.length === 0 ? (
              <li className="ontology-scope__empty">{t('objects.scopeNoMatch')}</li>
            ) : null}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
