/**
 * The condition editor: a flat list of comparisons, all of which must hold.
 *
 * Deliberately not a tree. A rule is "this number is above X", or two such statements that must both hold;
 * nesting and OR never occurred, and they doubled both the editor and the validation surface.
 */
import { useTranslation } from 'react-i18next';
import { Plus, Trash2 } from 'lucide-react';
import { FormField } from '../../../styles/design-system';
import type { MetricResponse } from '../../../data/metricsApi';
import type { DatasetResponse } from '../../../data/datasetsApi';
import { datasetLabel } from '../datasetLabel';
import { AGG_FNS, OPS, newRow, type ConditionRow } from './conditionRowsModel';

export function ConditionRows({
  rows,
  onChange,
  metrics,
  datasets,
  error,
}: {
  rows: ConditionRow[];
  onChange: (rows: ConditionRow[]) => void;
  metrics: MetricResponse[];
  datasets: DatasetResponse[];
  error: string | null;
}) {
  const { t } = useTranslation('ontology');
  const set = (index: number, next: Partial<ConditionRow>) =>
    onChange(rows.map((row, i) => (i === index ? { ...row, ...next } : row)));

  return (
    <div className="rules-conditions">
      {/* Two conditions are an AND. Say so once, then number them: a bare list of rows reads like
          alternatives, and this rule is a conjunction. */}
      {rows.length > 1 ? (
        <p className="rules-conditions__all">{t('rules.conditionAllOf')}</p>
      ) : null}
      {rows.map((row, index) => (
        <fieldset key={row.id} className="rules-conditions__row">
          <legend className="rules-conditions__legend">
            {t('rules.conditionRow', { index: index + 1 })}
          </legend>
          <FormField label={t('rules.conditionOperand')}>
            <div className="rules-conditions__operand">
              <select
                value={row.kind}
                onChange={(e) => set(index, { kind: e.target.value as ConditionRow['kind'] })}
                aria-label={t('rules.conditionOperandKind')}
              >
                <option value="metric">{t('rules.conditionKindMetric')}</option>
                <option value="dataset_agg">{t('rules.conditionKindDataset')}</option>
                <option value="ratio">{t('rules.conditionKindRatio')}</option>
              </select>

              {row.kind === 'metric' ? (
                <select
                  value={row.metricId}
                  onChange={(e) => set(index, { metricId: e.target.value })}
                  aria-label={t('rules.conditionMetric')}
                >
                  <option value="">{t('rules.conditionPick')}</option>
                  {metrics.map((metric) => (
                    <option key={metric.id} value={metric.id}>
                      {metric.name}
                    </option>
                  ))}
                </select>
              ) : null}

              {row.kind === 'dataset_agg' ? (
                <>
                  <select
                    value={row.datasetId}
                    onChange={(e) => set(index, { datasetId: e.target.value })}
                    aria-label={t('rules.conditionDataset')}
                  >
                    <option value="">{t('rules.conditionPick')}</option>
                    {datasets.map((dataset) => (
                      <option key={dataset.id} value={dataset.id}>
                        {datasetLabel(dataset)}
                      </option>
                    ))}
                  </select>
                  <select
                    value={row.aggFn}
                    onChange={(e) => set(index, { aggFn: e.target.value as ConditionRow['aggFn'] })}
                    aria-label={t('rules.conditionAgg')}
                  >
                    {AGG_FNS.map((fn) => (
                      <option key={fn} value={fn}>
                        {fn}
                      </option>
                    ))}
                  </select>
                  {row.aggFn !== 'count' ? (
                    <input
                      type="text"
                      value={row.aggColumn}
                      onChange={(e) => set(index, { aggColumn: e.target.value })}
                      placeholder={t('rules.conditionColumn')}
                      aria-label={t('rules.conditionColumn')}
                    />
                  ) : null}
                </>
              ) : null}

              {row.kind === 'ratio' ? (
                <>
                  <select
                    value={row.numeratorId}
                    onChange={(e) => set(index, { numeratorId: e.target.value })}
                    aria-label={t('rules.conditionNumerator')}
                  >
                    <option value="">{t('rules.conditionPick')}</option>
                    {metrics.map((metric) => (
                      <option key={metric.id} value={metric.id}>
                        {metric.name}
                      </option>
                    ))}
                  </select>
                  <span className="rules-conditions__sep" aria-hidden>
                    ÷
                  </span>
                  <select
                    value={row.denominatorId}
                    onChange={(e) => set(index, { denominatorId: e.target.value })}
                    aria-label={t('rules.conditionDenominator')}
                  >
                    <option value="">{t('rules.conditionPick')}</option>
                    {metrics.map((metric) => (
                      <option key={metric.id} value={metric.id}>
                        {metric.name}
                      </option>
                    ))}
                  </select>
                </>
              ) : null}
            </div>
          </FormField>

          <FormField label={t('rules.colComparison')}>
            <div className="rules-conditions__compare">
              <select value={row.op} onChange={(e) => set(index, { op: e.target.value })}>
                {OPS.map((op) => (
                  <option key={op} value={op}>
                    {op}
                  </option>
                ))}
              </select>
              <input
                type="number"
                step="any"
                value={row.value}
                onChange={(e) => set(index, { value: e.target.value })}
                aria-label={t('rules.conditionValue')}
              />
            </div>
          </FormField>

          <button
            type="button"
            className="btn btn-secondary btn-sm rules-conditions__remove"
            aria-label={t('rules.conditionRemove')}
            title={t('rules.conditionRemove')}
            disabled={rows.length <= 1}
            onClick={() => onChange(rows.filter((_, i) => i !== index))}
          >
            <Trash2 size={14} aria-hidden />
          </button>
        </fieldset>
      ))}

      <div className="rules-conditions__footer">
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => onChange([...rows, newRow()])}
        >
          <Plus size={14} aria-hidden />
          {t('rules.conditionAdd')}
        </button>
        <span className="settings-page-hint">{t('rules.conditionAllHint')}</span>
      </div>

      {error ? <p className="rules-condition-warning">{error}</p> : null}
    </div>
  );
}
