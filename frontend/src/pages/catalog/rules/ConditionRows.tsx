/**
 * The condition editor: a flat list of comparisons, all of which must hold.
 *
 * Deliberately not a tree — but a row's left side is an *operand*, and the engine's operands are a metric,
 * a dataset aggregate, or a ratio / difference of two of those. Showing only a metric is how the real rule
 * `分货额度 ÷ 分货明细.sum(gap) > 1` became invisible.
 */
import { useTranslation } from 'react-i18next';
import { Plus, Trash2 } from 'lucide-react';
import { FormField } from '../../../styles/design-system';
import type { MetricResponse } from '../../../data/metricsApi';
import type { DatasetResponse } from '../../../data/datasetsApi';
import { datasetLabel } from '../datasetLabel';
import {
  AGG_FNS,
  OPS,
  newRow,
  type ConditionRow,
  type OperandDraft,
  type RowShape,
} from './conditionRowsModel';

function OperandPicker({
  value,
  onChange,
  metrics,
  datasets,
  ariaLabel,
}: {
  value: OperandDraft;
  onChange: (next: OperandDraft) => void;
  metrics: MetricResponse[];
  datasets: DatasetResponse[];
  ariaLabel: string;
}) {
  const { t } = useTranslation('ontology');
  return (
    <div className="rules-conditions__operand" aria-label={ariaLabel}>
      <select className="ds-control"
        value={value.kind}
        onChange={(e) => onChange({ ...value, kind: e.target.value as OperandDraft['kind'] })}
        aria-label={t('rules.conditionOperandKind')}
      >
        <option value="metric">{t('rules.conditionKindMetric')}</option>
        <option value="dataset_agg">{t('rules.conditionKindDataset')}</option>
      </select>
      {value.kind === 'metric' ? (
        <select
        className="ds-control"
          value={value.metricId}
          onChange={(e) => onChange({ ...value, metricId: e.target.value })}
          aria-label={t('rules.conditionMetric')}
        >
          <option value="">{t('rules.conditionPick')}</option>
          {metrics.map((metric) => (
            <option key={metric.id} value={metric.id}>
              {metric.name}
            </option>
          ))}
        </select>
      ) : (
        <>
          <select
        className="ds-control"
            value={value.datasetId}
            onChange={(e) => onChange({ ...value, datasetId: e.target.value })}
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
        className="ds-control"
            value={value.aggFn}
            onChange={(e) => onChange({ ...value, aggFn: e.target.value as OperandDraft['aggFn'] })}
            aria-label={t('rules.conditionAgg')}
          >
            {AGG_FNS.map((fn) => (
              <option key={fn} value={fn}>
                {fn}
              </option>
            ))}
          </select>
          {value.aggFn !== 'count' ? (
            <input className="ds-control"
              type="text"
              value={value.aggColumn}
              onChange={(e) => onChange({ ...value, aggColumn: e.target.value })}
              placeholder={t('rules.conditionColumn')}
              aria-label={t('rules.conditionColumn')}
            />
          ) : null}
        </>
      )}
    </div>
  );
}

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

          <FormField label={t('rules.conditionShape')}>
            <select className="ds-control"
              value={row.shape}
              onChange={(e) => set(index, { shape: e.target.value as RowShape })}
              aria-label={t('rules.conditionShape')}
            >
              <option value="single">{t('rules.conditionShapeSingle')}</option>
              <option value="ratio">{t('rules.conditionShapeRatio')}</option>
              <option value="diff">{t('rules.conditionShapeDiff')}</option>
            </select>
          </FormField>

          <FormField label={t('rules.conditionOperand')}>
            <OperandPicker
              value={row.left}
              onChange={(left) => set(index, { left })}
              metrics={metrics}
              datasets={datasets}
              ariaLabel={t('rules.conditionOperand')}
            />
          </FormField>

          {row.shape !== 'single' ? (
            <FormField label={t('rules.conditionOperandRight')}>
              <OperandPicker
                value={row.right}
                onChange={(right) => set(index, { right })}
                metrics={metrics}
                datasets={datasets}
                ariaLabel={t('rules.conditionOperandRight')}
              />
            </FormField>
          ) : null}

          <FormField label={t('rules.colComparison')}>
            <div className="rules-conditions__compare">
              <select className="ds-control" value={row.op} onChange={(e) => set(index, { op: e.target.value })}>
                {OPS.map((op) => (
                  <option key={op} value={op}>
                    {op}
                  </option>
                ))}
              </select>
              <input className="ds-control"
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
