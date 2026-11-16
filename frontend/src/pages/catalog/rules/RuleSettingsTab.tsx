/** 设置: the rule's identity, and the one place it can be deleted — the same shape as a model's settings. */
import { Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useOutletContext } from 'react-router-dom';
import { EntityViewHeader, EntityViewPanel } from '../../shared/EntityViewShell';
import { RuleBasicsForm } from './RuleBasicsForm';
import { RuleCheckEditor } from './RuleCheckEditor';
import { RuleScopeForm } from './RuleScopeForm';
import { RuleAlertForm } from './RuleAlertForm';
import type { RuleDetailCtx } from './ruleDetailContext';

export function RuleSettingsTab() {
  const { t } = useTranslation('ontology');
  const ctx = useOutletContext<RuleDetailCtx>();
  const { form, setForm, saving, dirtyAll, saveAll, revert, remove } = ctx;

  return (
    <>
      <EntityViewHeader
        title={t('rules.navSettings')}
        actions={
          <>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={revert}
              disabled={!dirtyAll() || saving}
            >
              {t('shared.cancel')}
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={saveAll}
              disabled={!dirtyAll() || saving}
            >
              {saving ? t('rules.saving') : t('shared.save')}
            </button>
          </>
        }
      />
      <EntityViewPanel>
        <RuleBasicsForm
          value={{
            name: form.name,
            description: form.description,
            ruleId: form.ruleId,
            severity: form.severity,
            status: form.status,
          }}
          onChange={(next) => setForm({ ...form, ...next })}
        />
      </EntityViewPanel>

      {ctx.pickersMissing ? (
        <EntityViewPanel title={t('rules.navCheck')}>
          <p className="rules-condition-warning">{t('rules.pickersMissing')}</p>
        </EntityViewPanel>
      ) : (
      <EntityViewPanel
        title={t('rules.navCheck')}
        description={
          form.mode === 'relation' ? t('rules.panelRelationHint') : t('rules.panelConditionHint')
        }
      >
        <RuleCheckEditor
          value={{ mode: form.mode, relations: form.relations, groupField: form.groupField }}
          onChange={(next) => setForm({ ...form, ...next })}
          metrics={ctx.metrics}
          datasets={ctx.datasets}
          metricName={ctx.metricName}
          lookups={{
            metricName: ctx.metricName,
            datasetName: ctx.datasetName,
            ...ctx.joinerWords,
          }}
          rows={ctx.conditionRows}
          onRowsChange={ctx.setConditionRows}
          unrepresentable={ctx.conditionUnrepresentable}
          error={ctx.conditionError}
          onErrorClear={() => ctx.setConditionError(null)}
        />
      </EntityViewPanel>
      )}

      <EntityViewPanel
        title={t('rules.navRunParams')}
        description={t('rules.scopeHint')}
      >
        <RuleScopeForm
          value={{ groupField: form.groupField, runArgs: form.runArgs }}
          onChange={(next) => setForm({ ...form, ...next })}
          fields={ctx.paramCandidates}
          periodSpec={ctx.periodSpec}
        />
      </EntityViewPanel>

      <EntityViewPanel
        title={t('rules.navAlertCopy')}
        description={t('rules.panelMeaningHint')}
      >
        <RuleAlertForm
          value={{ conclusion: form.conclusion, suggestion: form.suggestion }}
          onChange={(next) => setForm({ ...form, ...next })}
        />
      </EntityViewPanel>

      <div className="ontology-danger-zone">
        <h2>{t('dataModel.dangerZone')}</h2>
        <p className="page-subtitle">{t('rules.deleteConfirmShort')}</p>
        <button type="button" className="btn btn-danger" onClick={() => void remove()}>
          <Trash2 size={16} aria-hidden />
          {t('rules.deleteRule')}
        </button>
      </div>
    </>
  );
}
