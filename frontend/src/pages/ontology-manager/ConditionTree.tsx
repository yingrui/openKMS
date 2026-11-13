/**
 * The condition editor draws the condition as the tree it actually is.
 *
 * A **group** (`all` / `any`) is a row with a mode toggle and an indented, guide-lined list of children;
 * a **comparison** is one row: a value (metric / dataset aggregate / ratio / difference), an operator and
 * a constant. Groups nest, so the drawing recurses — that is the whole editor, and it mirrors the JSON
 * one-to-one, which is why `conditionModel` can convert either way without loss.
 *
 * Rows are cheap: a comparison is one line, a group is one heading. That keeps a three-level condition
 * readable at the width of a page instead of a dialog.
 */

import { useTranslation } from 'react-i18next';
import { CopyPlus, Plus, Trash2 } from 'lucide-react';
import type { MetricResponse } from '../../data/metricsApi';
import type { DatasetResponse } from '../../data/datasetsApi';
import {
  AGG_FNS,
  BUILDER_OPS,
  makeComparison,
  makeGroup,
  makeLeafDataset,
  makeLeafMetric,
  type AggFn,
  type ConditionNode,
  type GroupNode,
  type LeafOperand,
  type OperandNode,
} from './conditionModel';

type Props = {
  value: GroupNode;
  onChange: (next: GroupNode) => void;
  metrics: MetricResponse[];
  datasets: DatasetResponse[];
};

function LeafPicker({
  value,
  onChange,
  metrics,
  datasets,
}: {
  value: LeafOperand;
  onChange: (next: LeafOperand) => void;
  metrics: MetricResponse[];
  datasets: DatasetResponse[];
}) {
  const { t } = useTranslation('ontology');
  const datasetLabel = (dataset: DatasetResponse) =>
    dataset.display_name || dataset.table_name || dataset.id.slice(0, 8);

  if (value.kind === 'metric') {
    return (
      <select
        className="ds-control condition-field"
        aria-label={t('rules.conditionKindMetric')}
        value={value.metricId}
        onChange={(e) => onChange({ ...value, metricId: e.target.value })}
      >
        {metrics.map((metric) => (
          <option key={metric.id} value={metric.id}>
            {metric.name}
          </option>
        ))}
      </select>
    );
  }

  return (
    <span className="condition-dataset-leaf">
      <select
        className="ds-control condition-field"
        aria-label={t('rules.conditionKindDataset')}
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
        className="ds-control condition-field condition-field--narrow"
        aria-label={t('rules.fieldAggregate')}
        value={value.fn}
        onChange={(e) => onChange({ ...value, fn: e.target.value as AggFn })}
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
          className="ds-control condition-field condition-field--narrow"
          aria-label={t('rules.fieldColumn')}
          value={value.column}
          onChange={(e) => onChange({ ...value, column: e.target.value })}
          placeholder={t('rules.fieldColumnPlaceholder')}
        />
      )}
    </span>
  );
}

/** Operand tree: a leaf, or `ratio`/`diff` of two operands (recursing, so nesting is visible). */
function OperandEditor({
  value,
  onChange,
  metrics,
  datasets,
  depth = 0,
}: {
  value: OperandNode;
  onChange: (next: OperandNode) => void;
  metrics: MetricResponse[];
  datasets: DatasetResponse[];
  depth?: number;
}) {
  const { t } = useTranslation('ontology');
  const leafOrPair = value.kind === 'ratio' || value.kind === 'diff';

  return (
    <span className={`condition-operand${leafOrPair ? ' condition-operand--pair' : ''}`}>
      <select
        className="ds-control condition-field condition-field--narrow"
        aria-label={t('rules.conditionOperandKind')}
        value={value.kind}
        onChange={(e) => {
          const kind = e.target.value as OperandNode['kind'];
          if (kind === 'metric') onChange(makeLeafMetric(metrics[0]?.id ?? ''));
          else if (kind === 'dataset_agg') onChange(makeLeafDataset(datasets[0]?.id ?? ''));
          else
            onChange({
              kind,
              left: makeLeafMetric(metrics[0]?.id ?? ''),
              right: makeLeafDataset(datasets[0]?.id ?? ''),
            });
        }}
      >
        <option value="metric">{t('rules.conditionOperandMetric')}</option>
        <option value="dataset_agg">{t('rules.conditionOperandDataset')}</option>
        {/* Deeper nesting stays expressible, but at some point the JSON view is the honest tool. */}
        {depth < 2 ? <option value="ratio">{t('rules.conditionOperandRatio')}</option> : null}
        {depth < 2 ? <option value="diff">{t('rules.conditionOperandDiff')}</option> : null}
      </select>

      {leafOrPair ? (
        <span className="condition-operand-pair">
          <OperandEditor
            value={value.left}
            onChange={(left) => onChange({ ...value, left })}
            metrics={metrics}
            datasets={datasets}
            depth={depth + 1}
          />
          <span className="condition-operand-sep" aria-hidden>
            {value.kind === 'ratio' ? '/' : '−'}
          </span>
          <OperandEditor
            value={value.right}
            onChange={(right) => onChange({ ...value, right })}
            metrics={metrics}
            datasets={datasets}
            depth={depth + 1}
          />
        </span>
      ) : (
        <LeafPicker value={value as LeafOperand} onChange={onChange} metrics={metrics} datasets={datasets} />
      )}
    </span>
  );
}

function removeById(node: GroupNode, targetId: string): GroupNode {
  return {
    ...node,
    children: node.children
      .filter((child) => child.id !== targetId)
      .map((child) => (child.kind === 'group' ? removeById(child, targetId) : child)),
  };
}

function replaceById(node: GroupNode, targetId: string, next: ConditionNode): GroupNode {
  return {
    ...node,
    children: node.children.map((child) => {
      if (child.id === targetId) return next;
      return child.kind === 'group' ? replaceById(child, targetId, next) : child;
    }),
  };
}

function appendTo(node: GroupNode, groupId: string, child: ConditionNode): GroupNode {
  if (node.id === groupId) return { ...node, children: [...node.children, child] };
  return {
    ...node,
    children: node.children.map((entry) =>
      entry.kind === 'group' ? appendTo(entry, groupId, child) : entry,
    ),
  };
}

export function ConditionTree({ value, onChange, metrics, datasets }: Props) {
  const { t } = useTranslation('ontology');

  const renderNode = (node: ConditionNode, isRoot: boolean): React.ReactNode => {
    if (node.kind === 'cmp') {
      return (
        <li key={node.id} className="condition-node condition-node--cmp">
          <div className="condition-cmp">
            <OperandEditor
              value={node.operand}
              onChange={(operand) => onChange(replaceById(value, node.id, { ...node, operand }))}
              metrics={metrics}
              datasets={datasets}
            />
            <select
              className="ds-control condition-field condition-field--narrow"
              aria-label={t('rules.conditionOperator')}
              value={node.op}
              onChange={(e) => onChange(replaceById(value, node.id, { ...node, op: e.target.value }))}
            >
              {BUILDER_OPS.map((op) => (
                <option key={op} value={op}>
                  {op}
                </option>
              ))}
            </select>
            <input
              type="number"
              className="ds-control condition-field condition-field--narrow"
              aria-label={t('rules.conditionThreshold')}
              value={node.value}
              onChange={(e) => onChange(replaceById(value, node.id, { ...node, value: e.target.value }))}
            />
            <button
              type="button"
              className="condition-node-remove"
              aria-label={t('rules.conditionRemove')}
              title={t('rules.conditionRemove')}
              disabled={isRoot && value.children.length === 1}
              onClick={() => onChange(removeById(value, node.id))}
            >
              <Trash2 size={14} aria-hidden />
            </button>
          </div>
        </li>
      );
    }

    return (
      <li key={node.id} className={`condition-node condition-node--group${isRoot ? ' is-root' : ''}`}>
        <div className="condition-group-head">
          <select
            className="ds-control condition-field condition-field--narrow"
            aria-label={t('rules.conditionJoin')}
            value={node.mode}
            onChange={(e) =>
              onChange(replaceById(value, node.id, { ...node, mode: e.target.value as 'all' | 'any' }))
            }
          >
            <option value="all">{t('rules.conditionJoinAll')}</option>
            <option value="any">{t('rules.conditionJoinAny')}</option>
          </select>
          {!isRoot ? (
            <button
              type="button"
              className="condition-node-remove"
              aria-label={t('rules.conditionRemove')}
              title={t('rules.conditionRemove')}
              onClick={() => onChange(removeById(value, node.id))}
            >
              <Trash2 size={14} aria-hidden />
            </button>
          ) : (
            <span className="condition-group-hint">{t('rules.conditionTreeHint')}</span>
          )}
        </div>

        <ul className="condition-children">
          {node.children.map((child) => renderNode(child, false))}
          {node.children.length === 0 ? (
            <li className="condition-empty">{t('rules.conditionEmptyGroup')}</li>
          ) : null}
        </ul>

        <div className="condition-group-actions">
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() =>
              onChange(appendTo(value, node.id, makeComparison(makeLeafMetric(metrics[0]?.id ?? ''))))
            }
          >
            <Plus size={14} aria-hidden />
            {t('rules.conditionAddComparison')}
          </button>
          {isRoot || node.children.length === 0 ? (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => onChange(appendTo(value, node.id, makeGroup('all', [])))}
            >
              <CopyPlus size={14} aria-hidden />
              {t('rules.conditionAddGroup')}
            </button>
          ) : null}
        </div>
      </li>
    );
  };

  return <div className="condition-tree">{renderNode(value, true)}</div>;
}
