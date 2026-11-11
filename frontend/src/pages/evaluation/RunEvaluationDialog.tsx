import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import { fetchAllModels } from '../../data/modelsApi';
import { useAsyncData } from '../../hooks/useAsyncData';

export interface RunOptions {
  /** Items to run. `null` runs the whole set. */
  itemIds: string[] | null;
  /** Judge with this model instead of the knowledge base's own. `null` keeps the KB's choice. */
  judgeModelId: string | null;
}

/**
 * Before a run, two decisions that are worth making explicitly: how much of the set to run, and who judges.
 *
 * A full set costs minutes per item, so re-running all seventeen to check one fixed expectation is the common waste.
 * The judge is a model, and comparing answers under two of them is how a disagreement gets noticed.
 */
export function RunEvaluationDialog({
  itemsTotal,
  failedItemIds,
  busy,
  onCancel,
  onSubmit,
}: {
  itemsTotal: number;
  /** Items that did not pass the most recent run; empty when there is no earlier run. */
  failedItemIds: string[];
  busy: boolean;
  onCancel: () => void;
  onSubmit: (options: RunOptions) => void;
}) {
  const { t } = useTranslation('workspace');
  const failedCount = failedItemIds.length;
  // Mounted per opening, so the default below is this opening's default — no effect needed to reset it.
  const [scope, setScope] = useState<'all' | 'failed'>(() => (failedCount > 0 ? 'failed' : 'all'));
  const [judgeModelId, setJudgeModelId] = useState<string>('');
  // Loaded through the shared hook: it owns the effect, so this component never sets state in one.
  const chatModels = useAsyncData(() => fetchAllModels({ api_kind: 'chat-completions' }), []);
  const models = useMemo(() => chatModels.data ?? [], [chatModels.data]);
  const loadingModels = chatModels.loading;

  const selectedLabel = useMemo(
    () => models.find((m) => m.id === judgeModelId)?.name ?? null,
    [models, judgeModelId],
  );

  return (
    <div className="eval-dialog-overlay" onClick={busy ? undefined : onCancel}>
      <div className="eval-dialog" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="eval-dialog-header">
          <h2>{t('evaluationDetail.runDialogTitle')}</h2>
        </div>
        <div className="eval-dialog-body">
          <fieldset className="eval-run-scope">
            <legend>{t('evaluationDetail.runScope')}</legend>
            <label>
              <input type="radio" name="run-scope" checked={scope === 'all'} onChange={() => setScope('all')} />
              <span>{t('evaluationDetail.runScopeAll', { count: itemsTotal })}</span>
            </label>
            <label>
              <input
                type="radio"
                name="run-scope"
                checked={scope === 'failed'}
                disabled={failedCount === 0}
                onChange={() => setScope('failed')}
              />
              <span>
                {t('evaluationDetail.runScopeFailed', { count: failedCount })}
                {failedCount === 0 ? ` · ${t('evaluationDetail.runScopeFailedNone')}` : ''}
              </span>
            </label>
          </fieldset>

          <label className="eval-run-judge">
            <span>{t('evaluationDetail.runJudgeModel')}</span>
            <select
              className="ds-control"
              value={judgeModelId}
              onChange={(e) => setJudgeModelId(e.target.value)}
              disabled={loadingModels}
            >
              <option value="">{t('evaluationDetail.runJudgeDefault')}</option>
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
            <small>
              {loadingModels
                ? t('evaluationDetail.runJudgeLoading')
                : selectedLabel
                  ? t('evaluationDetail.runJudgeOverride', { model: selectedLabel })
                  : t('evaluationDetail.runJudgeDefaultHint')}
            </small>
          </label>

          <p className="eval-run-cost">
            {t('evaluationDetail.runCostHint', {
              count: scope === 'failed' ? failedCount : itemsTotal,
            })}
          </p>
        </div>
        <div className="eval-dialog-footer">
          <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={busy}>
            {t('evaluationDetail.cancel')}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy || (scope === 'failed' && failedCount === 0)}
            onClick={() =>
              onSubmit({
                itemIds: scope === 'failed' ? failedItemIds : null,
                judgeModelId: judgeModelId || null,
              })
            }
          >
            {busy ? <Loader2 size={16} className="animate-spin" /> : null}
            <span>{busy ? t('evaluationDetail.running') : t('evaluationDetail.runEvaluation')}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
