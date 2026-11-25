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
  onChange,
  label,
  selected,
}: {
  spec: ObjectRefSpec;
  value: string;
  onChange: (next: { value: string; label: string } | null) => void;
  label: string;
  /** The ticked objects of this type — the answer is usually one of them. */
  selected?: { value: string; label: string }[];
}) {
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

  const title = useMemo(
    () => (value ? `${chosen || value} · ${spec.type_name}` : t('objectSet.actionRefPick', { type: spec.type_name })),
    [chosen, spec.type_name, t, value]
  );

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
                  setOpen(false);
                  onChange({ value: option.value, label: option.label });
                }}
              >
                <span>{option.label}</span>
                <span className="object-set-ref__meta">{option.value}</span>
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
