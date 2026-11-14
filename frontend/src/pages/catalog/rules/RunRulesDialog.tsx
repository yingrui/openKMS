/**
 * Run parameters for a rule (one rule, or all of them).
 *
 * The period is *not* a property of a rule — it is an argument of the run ("check 2026-W46"), which is
 * why it lives in this dialog rather than in the rule definition. The same dialog is used from the
 * list and from a rule's own page, so the parameters cannot drift between the two entry points.
 *
 * A rule's own page also offers **试算** (dry run): the same numbers, the same guardrails, but nothing is
 * published and `last_*` stays untouched. Writing a condition is iterative — the first attempts are
 * wrong, and none of them belong in the inbox.
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, FormField, StatusChip } from '../../../styles/design-system';
import type { RulesEvaluateResponse } from '../../../data/rulesApi';
import { valueRows, type LabelLookups } from './rulesLabels';

export type RunParams = { period_start: string; period_end: string };

export function RunRulesDialog({
  open,
  busy,
  onClose,
  onRun,
  onTrial,
  trial = null,
  lookups,
}: {
  open: boolean;
  busy: boolean;
  onClose: () => void;
  onRun: (params: RunParams) => void;
  /** Present on a single rule's page; absent where a trial has no subject (run all). */
  onTrial?: (params: RunParams) => void;
  trial?: RulesEvaluateResponse | null;
  lookups?: LabelLookups;
}) {
  const { t } = useTranslation('ontology');
  const [period, setPeriod] = useState('');

  const params: RunParams = { period_start: period, period_end: period };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t('rules.runDialogTitle')}
      closeAriaLabel={t('shared.close')}
      size={trial ? 'md' : 'sm'}
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>
            {t('shared.cancel')}
          </button>
          {onTrial ? (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => onTrial(params)}
              disabled={busy}
              title={t('rules.trialHint')}
            >
              {t('rules.trial')}
            </button>
          ) : null}
          <button type="button" className="btn btn-primary" onClick={() => onRun(params)} disabled={busy}>
            {busy ? t('rules.running') : t('rules.run')}
          </button>
        </>
      }
    >
      <FormField label={t('rules.runPeriod')} hint={t('rules.runPeriodHint')}>
        <input
          type="text"
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
          placeholder={t('rules.periodPlaceholder')}
        />
      </FormField>

      {trial ? (
        <div className="rules-trial" aria-live="polite">
          <p className="rules-trial__summary">
            {t('rules.trialSummary', {
              count: trial.results.length,
              failed: trial.failed,
              unknown: trial.unknown,
            })}
          </p>
          <div className="ds-table-wrap ds-table-wrap--flush">
            <table className="console-table">
              <thead>
                <tr>
                  <th>{t('rules.trialGroup')}</th>
                  <th>{t('rules.trialStatus')}</th>
                  <th>{t('rules.trialValues')}</th>
                </tr>
              </thead>
              <tbody>
                {trial.results.map((result, index) => {
                  const rows = lookups ? valueRows(result.values, lookups) : [];
                  return (
                    <tr key={`${result.group?.value ?? 'all'}-${index}`}>
                      <td>{result.group ? String(result.group.value) : t('rules.trialNoGroup')}</td>
                      <td>
                        <StatusChip tone={result.status === 'fail' ? 'warn' : 'neutral'}>
                          {t(`rules.status.${result.status}`)}
                        </StatusChip>
                        {result.would_publish ? (
                          <p className="rules-trial__publish">{t('rules.trialWouldPublish')}</p>
                        ) : null}
                      </td>
                      <td>
                        {rows.length > 0 ? (
                          <ul className="rules-trial__values">
                            {rows.map((row) => (
                              <li key={row.label}>
                                <span>{row.label}</span>
                                <strong>{row.value}</strong>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <span className="rules-trial__empty">{result.reason ?? t('datasets.dash')}</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </Dialog>
  );
}
