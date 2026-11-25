import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { fetchObjectInstances } from '../../data/ontologyApi';

export interface ObjectRefSpec {
  type_id: string;
  type_name: string;
  /** The property whose value the action receives. */
  property: string;
  /** The property to show in the list. */
  label_property: string;
  /** The parameter takes a list of objects ("assign these six"), not one. */
  many?: boolean;
}

/**
 * A parameter that is another object.
 *
 * Typing a product code is a memory test; picking the product is not. The value sent is the property the action
 * declared (`code`), while the label shown is the one a reader recognises (`name`) — the two are different questions
 * and conflating them is how typos reach a downstream service.
 */
export function ObjectRefPicker({
  spec,
  value,
  values,
  onChange,
  onToggle,
  label,
  selected,
}: {
  spec: ObjectRefSpec;
  /** Single-valued: the chosen value. */
  value: string;
  /** List-valued: the chosen values, in the order they were added. */
  values?: string[];
  onChange: (next: { value: string; label: string } | null) => void;
  onToggle?: (next: { value: string; label: string }) => void;
  label: string;
  /** The ticked objects of this type — the answer is usually one of them. */
  selected?: { value: string; label: string }[];
}) {
  const isList = Boolean(spec.many);
  const { t } = useTranslation('explore');
  const [query, setQuery] = useState('');
  const [options, setOptions] = useState<{ value: string; label: string }[]>([]);
  const [open, setOpen] = useState(false);
  const [chosen, setChosen] = useState('');

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void fetchObjectInstances(spec.type_id, { search: query.trim() || undefined, limit: 20 })
      .then((res) => {
        if (cancelled) return;
        setOptions(
          res.items
            .map((row) => ({
              value: String(row.data?.[spec.property] ?? ''),
              label: String(row.data?.[spec.label_property] ?? row.data?.[spec.property] ?? ''),
            }))
            .filter((option) => option.value)
        );
      })
      .catch(() => {
        if (!cancelled) setOptions([]);
      });
    return () => {
      cancelled = true;
    };
  }, [open, query, spec.label_property, spec.property, spec.type_id]);

  const chosenValues = values ?? (value ? [value] : []);
  const title = useMemo(() => {
    if (isList) {
      return chosenValues.length > 0
        ? t('objectSet.actionRefChosen', { count: chosenValues.length, type: spec.type_name })
        : t('objectSet.actionRefPick', { type: spec.type_name });
    }
    return value
      ? `${chosen || value} · ${spec.type_name}`
      : t('objectSet.actionRefPick', { type: spec.type_name });
  }, [chosen, chosenValues.length, isList, spec.type_name, t, value]);

  return (
    <div className="object-set-ref">
      <input
        className="ds-control"
        aria-label={label}
        value={open ? query : title}
        placeholder={t('objectSet.actionRefPick', { type: spec.type_name })}
        onFocus={() => {
          setOpen(true);
          setQuery('');
        }}
        onChange={(e) => setQuery(e.target.value)}
      />
      {isList && chosenValues.length > 0 ? (
        <div className="object-set-ref__chips">
          {chosenValues.map((entry) => (
            <span key={entry} className="object-set-ref__chip">
              {entry}
              <button
                type="button"
                aria-label={t('objectSet.actionRefRemove', { name: entry })}
                onClick={() => onToggle?.({ value: entry, label: entry })}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      ) : null}
      {open ? (
        <div className="object-set-ref__panel" role="listbox">
          {selected && selected.length > 0 ? (
            <>
              <p className="object-set-ref__meta">{t('objectSet.actionRefSelected', { count: selected.length })}</p>
              {selected.map((option) => (
                <button
                  key={`sel-${option.value}`}
                  type="button"
                  role="option"
                  aria-selected={option.value === value}
                  onClick={() => {
                    setChosen(option.label);
                    setOpen(false);
                    onChange({ value: option.value, label: option.label });
                  }}
                >
                  <span>{option.label}</span>
                  <span className="object-set-ref__meta">{option.value}</span>
                </button>
              ))}
            </>
          ) : null}
          {options.length === 0 && (!selected || selected.length === 0) ? (
            <p className="object-set-ref__empty">{t('objectSet.actionRefEmpty')}</p>
          ) : (
            options.map((option) => (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={option.value === value}
                onClick={() => {
                  setChosen(option.label);
                  if (isList) {
                    onToggle?.({ value: option.value, label: option.label });
                    return;
                  }
                  setOpen(false);
                  onChange({ value: option.value, label: option.label });
                }}
              >
                <span>{option.label}</span>
                <span className="object-set-ref__meta">
                  {isList && chosenValues.includes(option.value) ? '✓' : option.value}
                </span>
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
