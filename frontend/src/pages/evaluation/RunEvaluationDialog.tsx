import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import { getEvaluationRun, type EvaluationRunListItem } from '../../data/evaluationsApi';
import { fetchAllModels } from '../../data/modelsApi';
import { useAsyncData } from '../../hooks/useAsyncData';
import { Dialog, FormField } from '../../styles/design-system';

export interface RunOptions {
  /** Items to run; `null` runs the whole set. */
  itemIds: string[] | null;
  /** Judge with this model instead of the knowledge base's own. `null` keeps the KB's choice. */
  judgeModelId: string | null;
  /** Language for what a person reads: check reasons and the run report. */
  language: 'en' | 'zh';
}

const LANGUAGE_KEY = 'openkms_evaluation_run_language';

function readLanguage(fallback: 'en' | 'zh'): 'en' | 'zh' {
  try {
    const stored = localStorage.getItem(LANGUAGE_KEY);
    if (stored === 'en' || stored === 'zh') return stored;
  } catch {
    /* ignore */
  }
  return fallback;
}

/**
 * Before a run, the decisions worth making explicitly: how much of the set to run, who judges, and in which language
 * the judgement is written. A full set costs minutes per item, so re-running seventeen to check one fixed expectation is
 * the common waste; comparing answers under two judges is how a disagreement gets noticed; and a reader who does not read
 * English should get reasons in their own language.
 */
export function RunEvaluationDialog({
  open,
  evaluationId,
  itemsTotal,
  runs,
  busy,
  onCancel,
  onSubmit,
}: {
  open: boolean;
  evaluationId: string;
  itemsTotal: number;
  /** Recent runs, newest first: "run the failures" is about a run the reader picks, not only the latest one. */
  runs: EvaluationRunListItem[];
  busy: boolean;
  onCancel: () => void;
  onSubmit: (options: RunOptions) => void;
}) {
  const { t, i18n } = useTranslation('workspace');
  // Mounted per opening, so this is this opening's default — no effect needed to reset it.
  const [scope, setScope] = useState<'all' | 'failed'>(() => (runs.length > 0 ? 'failed' : 'all'));
  const [failedRunId, setFailedRunId] = useState<string>(() => runs[0]?.id ?? '');
  // Which items failed in the chosen run: read from its results, so any run can be the base.
  const chosenRun = useAsyncData(
    () => (failedRunId ? getEvaluationRun(evaluationId, failedRunId) : Promise.resolve(null)),
    [evaluationId, failedRunId],
  );
  const failedItemIds = useMemo(
    () => (chosenRun.data?.results ?? []).filter((r) => !r.pass).map((r) => r.item_id),
    [chosenRun.data],
  );
  const failedCount = failedItemIds.length;
  const [judgeModelId, setJudgeModelId] = useState('');
  const uiLanguage = (i18n.resolvedLanguage ?? i18n.language ?? 'en').toLowerCase().startsWith('zh') ? 'zh' : 'en';
  const [language, setLanguage] = useState<'en' | 'zh'>(() => readLanguage(uiLanguage));

  // Loaded through the shared hook: it owns the effect, so this component never sets state in one.
  const chatModels = useAsyncData(() => fetchAllModels({ api_kind: 'chat-completions' }), []);
  const models = useMemo(() => chatModels.data ?? [], [chatModels.data]);
  const judgeHint = chatModels.loading
    ? t('evaluationDetail.runJudgeLoading')
    : judgeModelId
      ? t('evaluationDetail.runJudgeOverride', {
          model: models.find((m) => m.id === judgeModelId)?.name ?? '',
        })
      : t('evaluationDetail.runJudgeDefaultHint');

  return (
    <Dialog
      open={open}
      onClose={() => !busy && onCancel()}
      closeDisabled={busy}
      title={t('evaluationDetail.runDialogTitle')}
      closeAriaLabel={t('shared.close')}
      size="sm"
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={busy}>
            {t('evaluationDetail.cancel')}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy || (scope === 'failed' && (chosenRun.loading || failedCount === 0))}
            onClick={() => {
              try {
                localStorage.setItem(LANGUAGE_KEY, language);
              } catch {
                /* ignore */
              }
              onSubmit({
                itemIds: scope === 'failed' ? failedItemIds : null,
                judgeModelId: judgeModelId || null,
                language,
              });
            }}
          >
            {busy ? <Loader2 size={16} className="animate-spin" aria-hidden /> : null}
            {busy ? t('evaluationDetail.running') : t('evaluationDetail.runEvaluation')}
          </button>
        </>
      }
    >
      <fieldset className="eval-run-scope">
        <legend className="ds-field__label">{t('evaluationDetail.runScope')}</legend>
        <label>
          <input type="radio" name="run-scope" checked={scope === 'all'} onChange={() => setScope('all')} />
          <span>{t('evaluationDetail.runScopeAll', { count: itemsTotal })}</span>
        </label>
        <label className={failedCount === 0 ? 'eval-run-scope-disabled' : undefined}>
          <input
            type="radio"
            name="run-scope"
            checked={scope === 'failed'}
            disabled={failedCount === 0}
            onChange={() => setScope('failed')}
          />
          <span>
            {t('evaluationDetail.runScopeFailed', { count: failedCount })}
            {failedCount === 0 && !chosenRun.loading ? ` · ${t('evaluationDetail.runScopeFailedNone')}` : ''}
          </span>
        </label>
        {scope === 'failed' && runs.length > 0 ? (
          <label>
            <span>{t('evaluationDetail.runScopeFailedFrom')}</span>
            <select
              className="ds-control"
              value={failedRunId}
              onChange={(e) => setFailedRunId(e.target.value)}
              disabled={busy || chosenRun.loading}
            >
              {runs.map((r) => (
                <option key={r.id} value={r.id}>
                  {t('evaluationDetail.runOption', {
                    id: r.id.slice(0, 8),
                    failed: Math.max(0, r.item_count - r.pass_count),
                    at: new Date(r.created_at).toLocaleString(),
                  })}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </fieldset>

      <FormField label={t('evaluationDetail.runJudgeModel')} hint={judgeHint}>
        <select
          className="ds-control"
          value={judgeModelId}
          onChange={(e) => setJudgeModelId(e.target.value)}
          disabled={chatModels.loading}
        >
          <option value="">{t('evaluationDetail.runJudgeDefault')}</option>
          {models.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </FormField>

      <FormField label={t('evaluationDetail.runLanguage')} hint={t('evaluationDetail.runLanguageHint')}>
        <select
          className="ds-control"
          value={language}
          onChange={(e) => setLanguage(e.target.value === 'zh' ? 'zh' : 'en')}
        >
          <option value="zh">{t('evaluationDetail.runLanguageZh')}</option>
          <option value="en">{t('evaluationDetail.runLanguageEn')}</option>
        </select>
      </FormField>

      <p className="eval-run-cost">
        {t('evaluationDetail.runCostHint', { count: scope === 'failed' ? failedCount : itemsTotal })}
      </p>
    </Dialog>
  );
}
