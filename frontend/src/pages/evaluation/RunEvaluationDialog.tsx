import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import { fetchAllModels } from '../../data/modelsApi';
import { useAsyncData } from '../../hooks/useAsyncData';
import { Dialog, FormField } from '../../styles/design-system';

export interface RunOptions {
  /** Items to run. `null` runs the whole set. */
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
  itemsTotal,
  failedItemIds,
  busy,
  onCancel,
  onSubmit,
}: {
  open: boolean;
  itemsTotal: number;
  /** Items that did not pass the most recent run; empty when there is no earlier run. */
  failedItemIds: string[];
  busy: boolean;
  onCancel: () => void;
  onSubmit: (options: RunOptions) => void;
}) {
  const { t, i18n } = useTranslation('workspace');
  const failedCount = failedItemIds.length;
  // Mounted per opening, so this is this opening's default — no effect needed to reset it.
  const [scope, setScope] = useState<'all' | 'failed'>(() => (failedCount > 0 ? 'failed' : 'all'));
  const [judgeModelId, setJudgeModelId] = useState('');
  const [language, setLanguage] = useState<'en' | 'zh'>(() =>
    readLanguage(i18n.language.startsWith('zh') ? 'zh' : 'en'),
  );

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
            disabled={busy || (scope === 'failed' && failedCount === 0)}
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
            {failedCount === 0 ? ` · ${t('evaluationDetail.runScopeFailedNone')}` : ''}
          </span>
        </label>
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
