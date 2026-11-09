import { useTranslation } from 'react-i18next';
import { Plus, Trash2 } from 'lucide-react';
import { ROW_OPS, type RowDraft } from '../catalog/model/modelRowPolicy';

/**
 * The row-condition editor.
 *
 * A component of its own because both the create dialog and the resource page render it; the
 * label and hint around it differ per surface, so it deliberately owns neither.
 */
export function ResourceRowEditor({
  rows,
  onChange,
}: {
  rows: RowDraft[];
  onChange: (rows: RowDraft[]) => void;
}) {
  const { t } = useTranslation('ontology');

  return (
    <>
      {rows.map((row, idx) => (
        <div key={idx} className="model-scope-add">
          <input
            type="text"
            className="ds-control"
            aria-label={t('dataModel.resourceColumn')}
            placeholder={t('dataModel.resourceColumn')}
            value={row.column}
            onChange={(e) =>
              onChange(rows.map((r, i) => (i === idx ? { ...r, column: e.target.value } : r)))
            }
          />
          <select
            className="ds-control"
            aria-label={t('dataModel.resourceOperator')}
            value={row.op}
            onChange={(e) =>
              onChange(rows.map((r, i) => (i === idx ? { ...r, op: e.target.value } : r)))
            }
          >
            {ROW_OPS.map((op) => (
              <option key={op} value={op}>
                {op}
              </option>
            ))}
          </select>
          {row.op !== 'is_null' && row.op !== 'is_not_null' ? (
            <input
              type="text"
              className="ds-control"
              aria-label={t('dataModel.resourceValue')}
              placeholder={t('dataModel.resourceValue')}
              value={row.value}
              onChange={(e) =>
                onChange(rows.map((r, i) => (i === idx ? { ...r, value: e.target.value } : r)))
              }
            />
          ) : null}
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            aria-label={t('shared.delete')}
            onClick={() => onChange(rows.filter((_, i) => i !== idx))}
          >
            <Trash2 size={14} aria-hidden />
          </button>
        </div>
      ))}
      <button
        type="button"
        className="btn btn-secondary btn-sm"
        onClick={() => onChange([...rows, { column: '', op: '=', value: '' }])}
      >
        <Plus size={14} aria-hidden />
        {t('dataModel.resourceAddCondition')}
      </button>
    </>
  );
}
