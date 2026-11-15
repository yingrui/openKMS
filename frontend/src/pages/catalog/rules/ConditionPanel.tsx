/**
 * The threshold editor: the condition tree, the sentence it reads as, and the advanced JSON view.
 *
 * Extracted from the rule page (which passed the 700-line guard) — and it belongs apart: the tree, the
 * JSON and the sentence are one editor with three faces, whereas the rest of the page is about a rule.
 */
import { useTranslation } from 'react-i18next';
import { FormField } from '../../../styles/design-system';
import { ConditionTree } from './ConditionTree';
import { conditionLabel, type LabelLookups } from './rulesLabels';
import { fromTree, type GroupNode } from './conditionModel';
import type { MetricResponse } from '../../../data/metricsApi';
import type { DatasetResponse } from '../../../data/datasetsApi';

export function ConditionPanel({
  tree,
  conditionText,
  conditionMode,
  conditionJson,
  conditionError,
  groupBy,
  metrics,
  datasets,
  scopeNote,
  lookups,
  onTreeChange,
  onJsonChange,
  onToggleJson,
}: {
  tree: GroupNode | null;
  /** The stored condition as a sentence, used when the builder cannot draw it. */
  conditionText: string;
  conditionMode: 'form' | 'json';
  conditionJson: string;
  conditionError: string | null;
  groupBy: { field: string; label?: string | null } | null;
  metrics: MetricResponse[];
  datasets: DatasetResponse[];
  scopeNote: string | null;
  lookups: LabelLookups;
  onTreeChange: (next: GroupNode) => void;
  onJsonChange: (text: string) => void;
  /** Leaving the JSON view adopts it into the builder, or refuses with a reason. */
  onToggleJson: () => void;
}) {
  const { t } = useTranslation('ontology');
  return (
    <>
      <p className="rules-condition-current">
        {tree ? conditionLabel(fromTree(tree), lookups, groupBy) : conditionText}
      </p>
      {tree ? (
        <ConditionTree
          value={tree}
          onChange={onTreeChange}
          metrics={metrics}
          datasets={datasets}
          scopeNote={scopeNote}
        />
      ) : (
        <p className="rules-condition-warning">{t('rules.conditionFormCannotRepresent')}</p>
      )}
      <details className="condition-advanced" open={conditionMode === 'json'}>
        <summary
          onClick={(event) => {
            event.preventDefault();
            onToggleJson();
          }}
        >
          {t('rules.conditionAdvanced')}
        </summary>
        {conditionMode === 'json' ? (
          <>
            <p className="settings-page-hint">{t('rules.conditionAdvancedHint')}</p>
            <FormField label={t('rules.conditionJson')} hint={t('rules.conditionJsonHint')}>
              <textarea
                rows={16}
                className="ds-control rules-json-editor"
                value={conditionJson}
                onChange={(event) => onJsonChange(event.target.value)}
              />
            </FormField>
          </>
        ) : null}
      </details>
      {conditionError ? <p className="rules-condition-warning">{conditionError}</p> : null}
    </>
  );
}
