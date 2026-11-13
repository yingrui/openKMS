/**
 * Run parameters for a rule (one rule, or all of them).
 *
 * The period is *not* a property of a rule — it is an argument of the run ("check 2026-W46"), which is
 * why it lives in this dialog rather than in the rule definition. The same dialog is used from the
 * list and from a rule's own page, so the parameters cannot drift between the two entry points.
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, FormField } from '../../styles/design-system';

export type RunParams = { period_start: string; period_end: string; scope: string };

export function RunRulesDialog({
  open,
  busy,
  onClose,
  onRun,
}: {
  open: boolean;
  busy: boolean;
  onClose: () => void;
  onRun: (params: RunParams) => void;
}) {
  const { t } = useTranslation('ontology');
  const [period, setPeriod] = useState('');
  const [scope, setScope] = useState('');

  const submit = () => {
    onRun({ period_start: period, period_end: period, scope });
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t('rules.runDialogTitle')}
      closeAriaLabel={t('shared.close')}
      size="sm"
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>
            {t('shared.cancel')}
          </button>
          <button type="button" className="btn btn-primary" onClick={submit} disabled={busy}>
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
      <FormField label={t('rules.runScope')} hint={t('rules.runScopeHint')}>
        <input
          type="text"
          value={scope}
          onChange={(e) => setScope(e.target.value)}
          placeholder={t('rules.runScopePlaceholder')}
        />
      </FormField>
    </Dialog>
  );
}
