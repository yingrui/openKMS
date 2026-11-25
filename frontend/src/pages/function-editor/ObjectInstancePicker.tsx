import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Search } from 'lucide-react';
import { fetchObjectInstances, type ObjectInstanceResponse } from '../../data/ontologyApi';

export type PickedInstance = { id: string; data: Record<string, unknown> };

/**
 * Pick a real object instead of typing its JSON.
 *
 * An `object` input is bound to an object type, so the run panel can search that type and hand the function an
 * instance's properties. Typing the JSON by hand was the alternative: a person had to know the property names and get
 * the shape right before they could test one prompt.
 */
export function ObjectInstancePicker({
  objectTypeId,
  objectTypeName,
  picked,
  disabled,
  onPick,
}: {
  objectTypeId: string;
  objectTypeName: string;
  picked: PickedInstance | null;
  disabled: boolean;
  onPick: (instance: PickedInstance | null) => void;
}) {
  const { t } = useTranslation('ontology');
  const [search, setSearch] = useState('');
  const [rows, setRows] = useState<ObjectInstanceResponse[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const lookup = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchObjectInstances(objectTypeId, { search: search.trim(), limit: 10 });
      setRows(res.items);
    } catch (e: unknown) {
      setRows([]);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const label = (row: ObjectInstanceResponse) =>
    String(row.data.name ?? row.data.title ?? row.id) || row.id;

  return (
    <div className="logic-pick">
      <div className="logic-pick__head">
        <span className="logic-pick__type">{objectTypeName}</span>
        <input
          className="ds-control logic-pick__search"
          value={search}
          placeholder={t('editor.logicPickSearch')}
          aria-label={t('editor.logicPickSearch')}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void lookup();
          }}
          disabled={disabled}
        />
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => void lookup()} disabled={disabled || loading}>
          {loading ? <Loader2 size={14} className="spin" aria-hidden /> : <Search size={14} aria-hidden />}
          {t('editor.logicPickFind')}
        </button>
      </div>

      {error ? <p className="logic-pick__error">{error}</p> : null}

      {picked ? (
        <div className="logic-pick__picked">
          <span>{t('editor.logicPickSelected')}: <strong>{label({ id: picked.id, data: picked.data } as ObjectInstanceResponse)}</strong></span>
          <button type="button" className="ds-table-icon-link" onClick={() => onPick(null)} disabled={disabled}>
            {t('editor.logicPickClear')}
          </button>
        </div>
      ) : null}

      {rows && rows.length > 0 ? (
        <ul className="logic-pick__rows">
          {rows.map((row) => (
            <li key={row.id}>
              <button
                type="button"
                className="logic-pick__row"
                onClick={() => {
                  onPick({ id: row.id, data: row.data });
                  setRows(null);
                }}
                disabled={disabled}
              >
                <span>{label(row)}</span>
                <code>{Object.keys(row.data).slice(0, 4).join(', ')}</code>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {rows && rows.length === 0 && !loading ? (
        <p className="logic-pick__empty">{t('editor.logicPickEmpty')}</p>
      ) : null}
    </div>
  );
}
