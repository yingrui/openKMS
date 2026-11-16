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
import type { RuleArgument, RulesEvaluateResponse } from '../../../data/rulesApi';
import { valueRows, type LabelLookups } from './rulesLabels';

export type RunParams = {
  /** Values for the rule's declared arguments, by key — including the period, if the rule declares one. */
  values: Record<string, unknown>;
};

export function RunRulesDialog({
  open,
  busy,
  onClose,
  onRun,
  onTrial,
  trial = null,
  lookups,
  runArguments = [],
}: {
  open: boolean;
  busy: boolean;
  onClose: () => void;
  onRun: (params: RunParams) => void;
  /** Present on a single rule's page; absent where a trial has no subject (run all). */
  onTrial?: (params: RunParams) => void;
  trial?: RulesEvaluateResponse | null;
  lookups?: LabelLookups;
  /** The rule's declared arguments, as the server resolved them — the dialog asks for exactly these. */
  runArguments?: RuleArgument[];
}) {
  const { t } = useTranslation('ontology');
  const [values, setValues] = useState<Record<string, string>>({});
  const periodSpec = runArguments.find((argument) => argument.role === 'period') ?? null;
  const inputs = runArguments.filter((argument) => argument.role !== 'period');

  const params: RunParams = { values };

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
      <p className="rules-run-args__title">{t('rules.runValues')}</p>
      {periodSpec ? (
        <>
          <p className="settings-page-hint">
            {periodSpec.has_interval
              ? t('rules.runParamsRequired', {
                  formats: periodSpec.format ?? t('rules.runParamsCustomFormat'),
                })
              : t('rules.periodNoInterval')}
            {` — ${t('rules.runParamsFiltersOn', { dimensions: periodSpec.field })}`}
          </p>
          <FormField
            label={periodSpec.label ?? periodSpec.field}
            hint={t('rules.runPeriodHint', { field: periodSpec.field })}
          >
            <input
              type="text"
              value={values[periodSpec.key] ?? ''}
              onChange={(e) => setValues({ ...values, [periodSpec.key]: e.target.value })}
              // The format comes from the field's calendar; no example period is invented for it.
              placeholder={periodSpec.format ?? periodSpec.calendar ?? ''}
            />
          </FormField>
        </>
      ) : null}

      {inputs.map((argument) => (
        <FormField
          key={argument.key}
          label={argument.label ?? argument.field ?? argument.key}
          hint={
            argument.kind === 'key'
              ? t('rules.runArgKeyHint')
              : argument.required
                ? t('rules.runArgRequiredHint')
                : t('rules.runArgFilterHint')
          }
        >
          <input
            type="text"
            value={values[argument.key] ?? ''}
            onChange={(e) => setValues({ ...values, [argument.key]: e.target.value })}
            placeholder={argument.kind === 'key' ? t('rules.runArgKeyPlaceholder') : ''}
          />
        </FormField>
      ))}

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
