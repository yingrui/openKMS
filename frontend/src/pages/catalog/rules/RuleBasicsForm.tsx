/**
 * A rule's own facts: what it is called, what it is about, how urgent, and the dimension it is checked per.
 *
 * Split out of the rule page (which was over the 700-line guard): these fields are plain form state and
 * have nothing to do with how the check itself is written.
 */
import { useTranslation } from 'react-i18next';
import { FormField } from '../../../styles/design-system';

export type BasicsValue = {
  name: string;
  ruleId: string;
  subjectKind: 'metric' | 'dataset';
  severity: 'P0' | 'P1' | 'P2';
  status: 'active' | 'paused';
  groupField: string;
};

export function RuleBasicsForm({
  value,
  onChange,
  fields,
}: {
  value: BasicsValue;
  onChange: (next: Partial<BasicsValue>) => void;
  /** Field names of the subject, offered as suggestions — the server validates them anyway. */
  fields: string[];
}) {
  const { t } = useTranslation('ontology');
  return (
    <div className="rules-form">
      <FormField label={t('rules.fieldName')}>
        <input
          type="text"
          value={value.name}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder={t('rules.fieldNamePlaceholder')}
        />
      </FormField>
      <FormField label={t('rules.fieldRuleId')} hint={t('rules.fieldRuleIdHint')}>
        <input
          type="text"
          value={value.ruleId}
          onChange={(e) => onChange({ ruleId: e.target.value })}
          placeholder={t('rules.fieldRuleIdPlaceholder')}
          autoComplete="off"
        />
      </FormField>
      <FormField label={t('rules.fieldSubject')} hint={t('rules.fieldSubjectHint')}>
        <select
          value={value.subjectKind}
          onChange={(e) => onChange({ subjectKind: e.target.value as BasicsValue['subjectKind'] })}
        >
          <option value="metric">{t('rules.subjectMetric')}</option>
          <option value="dataset">{t('rules.subjectDataset')}</option>
        </select>
      </FormField>
      <FormField label={t('rules.fieldSeverity')}>
        <select
          value={value.severity}
          onChange={(e) => onChange({ severity: e.target.value as BasicsValue['severity'] })}
        >
          {['P0', 'P1', 'P2'].map((severity) => (
            <option key={severity} value={severity}>
              {severity}
            </option>
          ))}
        </select>
      </FormField>
      <FormField label={t('rules.fieldStatus')}>
        <select
          value={value.status}
          onChange={(e) => onChange({ status: e.target.value as BasicsValue['status'] })}
        >
          <option value="active">{t('rules.active')}</option>
          <option value="paused">{t('rules.paused')}</option>
        </select>
      </FormField>
      <FormField label={t('rules.groupField')} hint={t('rules.groupFieldHint')}>
        <input
          type="text"
          value={value.groupField}
          onChange={(e) => onChange({ groupField: e.target.value })}
          placeholder="scenario_id"
          list="rule-group-fields"
        />
        <datalist id="rule-group-fields">
          {fields.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
      </FormField>
    </div>
  );
}
