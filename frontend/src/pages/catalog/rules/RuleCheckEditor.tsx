/**
 * The check itself: a threshold, or one or more identities — and the sentence they add up to.
 *
 * Shared by the check tab and the create page, so the two ways of writing a check cannot drift apart.
 */
import { useTranslation } from 'react-i18next';
import { conditionLabel } from './rulesLabels';
import { ConditionRows } from './ConditionRows';
import { RelationEditor } from './RelationEditor';
import { conditionFromRows, type ConditionRow } from './conditionRowsModel';
import type { RelationDraft } from './relationDraft';
import type { MetricResponse } from '../../../data/metricsApi';
import type { DatasetResponse } from '../../../data/datasetsApi';
import type { LabelLookups } from './rulesLabels';

export type CheckEditorValue = {
  mode: 'condition' | 'relation';
  relations: RelationDraft[];
  groupField: string;
};

export function RuleCheckEditor({
  value,
  onChange,
  metrics,
  datasets,
  metricName,
  lookups,
  rows,
  onRowsChange,
  unrepresentable,
  error,
  onErrorClear,
}: {
  value: CheckEditorValue;
  onChange: (next: Partial<CheckEditorValue>) => void;
  metrics: MetricResponse[];
  datasets: DatasetResponse[];
  metricName: (id: string) => string;
  lookups: LabelLookups;
  rows: ConditionRow[];
  onRowsChange: (rows: ConditionRow[]) => void;
  unrepresentable: boolean;
  error: string | null;
  onErrorClear: () => void;
}) {
  const { t } = useTranslation('ontology');
  return (
    <>
      {/* Two kinds of check, one place: a threshold, or an identity between metrics. */}
      <div className="ds-view-toggle rules-mode" role="tablist" aria-label={t('rules.modeAria')}>
        <button
          type="button"
          role="tab"
          aria-selected={value.mode === 'condition'}
          className={`ds-view-toggle__btn ${value.mode === 'condition' ? 'active' : ''}`}
          onClick={() => onChange({ mode: 'condition' })}
        >
          {t('rules.modeCondition')}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={value.mode === 'relation'}
          className={`ds-view-toggle__btn ${value.mode === 'relation' ? 'active' : ''}`}
          onClick={() => onChange({ mode: 'relation' })}
        >
          {t('rules.modeRelation')}
        </button>
      </div>

      {value.mode === 'relation' ? (
        <RelationEditor
          value={value.relations}
          onChange={(relations) => onChange({ relations })}
          metrics={metrics}
          metricName={metricName}
        />
      ) : null}

      {value.mode === 'condition' ? (
        <>
          {/* The logic, in words, as the rows are edited — the editor shows fields, this shows the
              sentence a reader would have to reconstruct from them. */}
          <p className="rules-condition-current">
            {conditionLabel(
              conditionFromRows(rows),
              { ...lookups, metricName },
              value.groupField.trim() ? { field: value.groupField.trim() } : null,
            ) ?? t('rules.conditionIncomplete')}
          </p>
          {unrepresentable ? (
            <p className="rules-condition-warning">{t('rules.conditionUnrepresentable')}</p>
          ) : null}
          <ConditionRows
            rows={rows}
            onChange={(next) => {
              onRowsChange(next);
              onErrorClear();
            }}
            metrics={metrics}
            datasets={datasets}
            error={error}
          />
        </>
      ) : null}
    </>
  );
}
