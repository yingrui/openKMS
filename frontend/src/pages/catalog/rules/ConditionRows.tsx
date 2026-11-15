/**
 * The condition editor: a flat list of comparisons, all of which must hold.
 *
 * The shape of a row is the old one, because it was the readable one: **one line per comparison** —
 * `[operand] [op] [value] [×]` — and the operand editor is where the kind is chosen (metric, dataset
 * aggregate, a ratio of two operands, a difference of two). No separate "form" field: picking "ratio" there
 * and then having to fill two more selects was a step backwards for the one rule that is a ratio.
 *
 * Groups are not drawn (no nesting, no `any` — the engine rejects them); a flat list is the whole structure.
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
} from './conditionRowsModel';

const MAX_OPERAND_DEPTH = 2;

function OperandEditor({
  value,
  onChange,
  metrics,
  datasets,
  depth = 0,
}: {
  value: OperandDraft;
  onChange: (next: OperandDraft) => void;
  metrics: MetricResponse[];
  datasets: DatasetResponse[];
  depth?: number;
}) {
  const { t } = useTranslation('ontology');
  const paired = value.kind === 'ratio' || value.kind === 'diff';
  const leaf = value.kind === 'metric' || value.kind === 'dataset_agg' ? value : null;

  const changeKind = (kind: OperandDraft['kind']) => {
    if (kind === 'metric' || kind === 'dataset_agg') {
      onChange({
        kind,
        ...(kind === 'metric' ? { metricId: '' } : { datasetId: '', aggFn: 'count', aggColumn: '' }),
      } as OperandDraft);
      return;
    }
    onChange({ kind, left: { kind: 'metric', metricId: '' }, right: { kind: 'metric', metricId: '' } });
  };

  return (
    <span className="rules-conditions__operand">
      <select
        className="ds-control rules-conditions__op-kind"
        value={value.kind}
        onChange={(e) => changeKind(e.target.value as OperandDraft['kind'])}
        aria-label={t('rules.conditionKind')}
      >
        <option value="metric">{t('rules.conditionOperandMetric')}</option>
        <option value="dataset_agg">{t('rules.conditionOperandDataset')}</option>
        {depth < MAX_OPERAND_DEPTH ? (
          <option value="ratio">{t('rules.conditionOperandRatio')}</option>
        ) : null}
        {depth < MAX_OPERAND_DEPTH ? (
          <option value="diff">{t('rules.conditionOperandDiff')}</option>
        ) : null}
      </select>

      {paired ? (
        <span className="rules-conditions__pair">
          <OperandEditor
            value={value.left}
            onChange={(left) => onChange({ ...value, left })}
            metrics={metrics}
            datasets={datasets}
            depth={depth + 1}
          />
          <span className="rules-conditions__sep" aria-hidden>
            {value.kind === 'ratio' ? '÷' : '−'}
          </span>
          <OperandEditor
            value={value.right}
            onChange={(right) => onChange({ ...value, right })}
            metrics={metrics}
            datasets={datasets}
            depth={depth + 1}
          />
        </span>
      ) : null}

      {leaf?.kind === 'metric' ? (
        <select
          className="ds-control"
          value={leaf.metricId}
          onChange={(e) => onChange({ ...leaf, metricId: e.target.value })}
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

      {leaf?.kind === 'dataset_agg' ? (
        <>
          <select
            className="ds-control"
            value={leaf.datasetId}
            onChange={(e) => onChange({ ...leaf, datasetId: e.target.value })}
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
            className="ds-control rules-conditions__agg"
            value={leaf.aggFn}
            onChange={(e) => onChange({ ...leaf, aggFn: e.target.value as (typeof AGG_FNS)[number] })}
            aria-label={t('rules.conditionAgg')}
          >
            {AGG_FNS.map((fn) => (
              <option key={fn} value={fn}>
                {fn}
              </option>
            ))}
          </select>
          {leaf.aggFn !== 'count' ? (
            <input
              className="ds-control rules-conditions__column"
              type="text"
              value={leaf.aggColumn}
              onChange={(e) => onChange({ ...leaf, aggColumn: e.target.value })}
              placeholder={t('rules.conditionColumn')}
              aria-label={t('rules.conditionColumn')}
            />
          ) : null}
        </>
      ) : null}
    </span>
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
      {/* Two comparisons are an AND. Say it once; the rows themselves stay one line each. */}
      {rows.length > 1 ? (
        <p className="rules-conditions__all">{t('rules.conditionAllOf')}</p>
      ) : null}

      {rows.map((row, index) => (
        <div key={row.id} className="rules-conditions__row">
          {rows.length > 1 ? (
            <span className="rules-conditions__index">{index + 1}</span>
          ) : (
            <span className="rules-conditions__index" aria-hidden />
          )}
          <FormField label={index === 0 ? t('rules.conditionOperand') : ' '}>
            <OperandEditor
              value={row.operand}
              onChange={(operand) => set(index, { operand })}
              metrics={metrics}
              datasets={datasets}
            />
          </FormField>
          <FormField label={index === 0 ? t('rules.colComparison') : ' '}>
            <span className="rules-conditions__compare">
              <select
                className="ds-control"
                value={row.op}
                onChange={(e) => set(index, { op: e.target.value })}
                aria-label={t('rules.colComparison')}
              >
                {OPS.map((op) => (
                  <option key={op} value={op}>
                    {op}
                  </option>
                ))}
              </select>
              <input
                className="ds-control"
                type="number"
                step="any"
                value={row.value}
                onChange={(e) => set(index, { value: e.target.value })}
                aria-label={t('rules.conditionValue')}
              />
            </span>
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
        </div>
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
