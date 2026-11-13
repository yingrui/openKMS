/**
 * The condition builder — the primary way to configure a rule condition.
 *
 * One row per comparison: left value (metric / dataset aggregate / ratio / difference), operator,
 * constant. Rows are joined by AND or OR. Everything the evaluator accepts for a rule author fits in
 * this shape, so JSON is only the *advanced* view for conditions the form declines to draw (see
 * `conditionModel.toBuilder`) — not a second, parallel way to author.
 */

import { useTranslation } from 'react-i18next';
import { Plus, Trash2 } from 'lucide-react';
import type { MetricResponse } from '../../data/metricsApi';
import type { DatasetResponse } from '../../data/datasetsApi';
import {
  AGG_FNS,
  BUILDER_OPS,
  emptyRow,
  type BuilderCondition,
  type BuilderOperand,
  type BuilderRow,
  type LeafOperand,
} from './conditionModel';

function LeafPicker({
  value,
  onChange,
  metrics,
  datasets,
  ariaLabel,
}: {
  value: LeafOperand;
  onChange: (next: LeafOperand) => void;
  metrics: MetricResponse[];
  datasets: DatasetResponse[];
  ariaLabel: string;
}) {
  const { t } = useTranslation('ontology');
  const datasetLabel = (dataset: DatasetResponse) =>
    dataset.display_name || dataset.table_name || dataset.id.slice(0, 8);

  return (
    <>
      <select
        className="ds-control"
        aria-label={`${ariaLabel} — ${t('rules.conditionValueKind')}`}
        value={value.kind}
        onChange={(e) => {
          const kind = e.target.value as LeafOperand['kind'];
          onChange(
            kind === 'metric'
              ? { kind: 'metric', metricId: metrics[0]?.id ?? '' }
              : { kind: 'dataset_agg', datasetId: datasets[0]?.id ?? '', fn: 'count', column: '' },
          );
        }}
      >
        <option value="metric">{t('rules.conditionKindMetric')}</option>
        <option value="dataset_agg">{t('rules.conditionKindDataset')}</option>
      </select>

      {value.kind === 'metric' ? (
        <select
          className="ds-control"
          aria-label={`${ariaLabel} — ${t('rules.conditionKindMetric')}`}
          value={value.metricId}
          onChange={(e) => onChange({ ...value, metricId: e.target.value })}
        >
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
            aria-label={`${ariaLabel} — ${t('rules.conditionKindDataset')}`}
            value={value.datasetId}
            onChange={(e) => onChange({ ...value, datasetId: e.target.value })}
          >
            {datasets.map((dataset) => (
              <option key={dataset.id} value={dataset.id}>
                {datasetLabel(dataset)}
              </option>
            ))}
          </select>
          <select
            className="ds-control"
            aria-label={`${ariaLabel} — ${t('rules.fieldAggregate')}`}
            value={value.fn}
            onChange={(e) => onChange({ ...value, fn: e.target.value })}
          >
            {AGG_FNS.map((fn) => (
              <option key={fn} value={fn}>
                {fn}
              </option>
            ))}
          </select>
          {value.fn === 'count' ? null : (
            <input
              type="text"
              className="ds-control"
              aria-label={`${ariaLabel} — ${t('rules.fieldColumn')}`}
              value={value.column}
              onChange={(e) => onChange({ ...value, column: e.target.value })}
              placeholder={t('rules.fieldColumnPlaceholder')}
            />
          )}
        </>
      )}
    </>
  );
}

function RowEditor({
  row,
  index,
  metrics,
  datasets,
  onChange,
  onRemove,
  removable,
}: {
  row: BuilderRow;
  index: number;
  metrics: MetricResponse[];
  datasets: DatasetResponse[];
  onChange: (next: BuilderRow) => void;
  onRemove: () => void;
  removable: boolean;
}) {
  const { t } = useTranslation('ontology');
  const operand = row.operand;
  const label = t('rules.conditionRow', { index: index + 1 });

  const setOperand = (next: BuilderOperand) => onChange({ ...row, operand: next });

  return (
    <li className="condition-row">
      <div className="condition-row-operand">
        <select
          className="ds-control"
          aria-label={`${label} — ${t('rules.conditionOperandKind')}`}
          value={operand.kind}
          onChange={(e) => {
            const kind = e.target.value as BuilderOperand['kind'];
            if (kind === 'metric') setOperand({ kind: 'metric', metricId: metrics[0]?.id ?? '' });
            else if (kind === 'dataset_agg')
              setOperand({ kind: 'dataset_agg', datasetId: datasets[0]?.id ?? '', fn: 'count', column: '' });
            else {
              const left: LeafOperand = { kind: 'metric', metricId: metrics[0]?.id ?? '' };
              const right: LeafOperand = {
                kind: 'dataset_agg',
                datasetId: datasets[0]?.id ?? '',
                fn: 'count',
                column: '',
              };
              setOperand({ kind, left, right });
            }
          }}
        >
          <option value="metric">{t('rules.conditionOperandMetric')}</option>
          <option value="dataset_agg">{t('rules.conditionOperandDataset')}</option>
          <option value="ratio">{t('rules.conditionOperandRatio')}</option>
          <option value="diff">{t('rules.conditionOperandDiff')}</option>
        </select>

        {operand.kind === 'ratio' || operand.kind === 'diff' ? (
          <div className="condition-row-pair">
            <LeafPicker
              ariaLabel={`${label} — ${t('rules.conditionPairLeft')}`}
              value={operand.left}
              onChange={(left) => setOperand({ ...operand, left })}
              metrics={metrics}
              datasets={datasets}
            />
            <span className="condition-row-sep" aria-hidden>
              {operand.kind === 'ratio' ? '/' : '−'}
            </span>
            <LeafPicker
              ariaLabel={`${label} — ${t('rules.conditionPairRight')}`}
              value={operand.right}
              onChange={(right) => setOperand({ ...operand, right })}
              metrics={metrics}
              datasets={datasets}
            />
          </div>
        ) : (
          <LeafPicker
            ariaLabel={label}
            value={operand as LeafOperand}
            onChange={setOperand}
            metrics={metrics}
            datasets={datasets}
          />
        )}
      </div>

      <div className="condition-row-compare">
        <select
          className="ds-control"
          aria-label={`${label} — ${t('rules.conditionOperator')}`}
          value={row.op}
          onChange={(e) => onChange({ ...row, op: e.target.value })}
        >
          {BUILDER_OPS.map((op) => (
            <option key={op} value={op}>
              {op}
            </option>
          ))}
        </select>
        <input
          type="number"
          className="ds-control"
          aria-label={`${label} — ${t('rules.conditionThreshold')}`}
          value={row.value}
          onChange={(e) => onChange({ ...row, value: e.target.value })}
        />
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={onRemove}
          disabled={!removable}
          aria-label={t('rules.conditionRemoveRow')}
          title={t('rules.conditionRemoveRow')}
        >
          <Trash2 size={14} aria-hidden />
        </button>
      </div>
    </li>
  );
}

export function ConditionBuilder({
  value,
  onChange,
  metrics,
  datasets,
}: {
  value: BuilderCondition;
  onChange: (next: BuilderCondition) => void;
  metrics: MetricResponse[];
  datasets: DatasetResponse[];
}) {
  const { t } = useTranslation('ontology');
  const updateRow = (index: number, row: BuilderRow) => {
    onChange({ ...value, rows: value.rows.map((current, i) => (i === index ? row : current)) });
  };

  return (
    <div className="condition-builder">
      {value.rows.length > 1 ? (
        <label className="condition-builder-mode">
          {t('rules.conditionJoin')}
          <select
            className="ds-control"
            value={value.mode}
            onChange={(e) => onChange({ ...value, mode: e.target.value as BuilderCondition['mode'] })}
          >
            <option value="all">{t('rules.conditionJoinAll')}</option>
            <option value="any">{t('rules.conditionJoinAny')}</option>
          </select>
        </label>
      ) : null}

      <ul className="condition-rows">
        {value.rows.map((row, index) => (
          <RowEditor
            key={index}
            row={row}
            index={index}
            metrics={metrics}
            datasets={datasets}
            removable={value.rows.length > 1}
            onChange={(next) => updateRow(index, next)}
            onRemove={() => onChange({ ...value, rows: value.rows.filter((_, i) => i !== index) })}
          />
        ))}
      </ul>

      <button
        type="button"
        className="btn btn-secondary btn-sm condition-builder-add"
        onClick={() =>
          onChange({
            ...value,
            rows: [...value.rows, emptyRow(metrics[0]?.id ?? '', datasets[0]?.id ?? '')],
          })
        }
      >
        <Plus size={14} aria-hidden />
        {t('rules.conditionAddRow')}
      </button>
    </div>
  );
}
