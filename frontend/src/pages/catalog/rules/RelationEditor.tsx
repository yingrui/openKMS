/**
 * The relation editor: a target metric, weighted members, a tolerance.
 *
 * Extracted from the rule page because the page was 880 lines — and because this block is the one part
 * with no idea what a rule is: it edits an identity, renders what that identity says, and hands the value
 * back. Keeping it separate is also what makes the identity preview testable through `relationLabel`.
 */
import { useTranslation } from 'react-i18next';
import { Minus, Plus } from 'lucide-react';
import { FormField } from '../../../styles/design-system';
import { relationLabel } from './rulesLabels';
import { relationPayload, type RelationDraft, type RelationMemberDraft } from './relationDraft';
import type { MetricResponse } from '../../../data/metricsApi';


export function RelationEditor({
  value,
  onChange,
  metrics,
  metricName,
}: {
  value: RelationDraft;
  onChange: (next: RelationDraft) => void;
  metrics: MetricResponse[];
  metricName: (id: string) => string;
}) {
  const { t } = useTranslation('ontology');
  const patch = (next: Partial<RelationDraft>) => onChange({ ...value, ...next });
  const setMember = (index: number, next: Partial<RelationMemberDraft>) =>
    patch({
      members: value.members.map((row, rowIndex) =>
        rowIndex === index ? { ...row, ...next } : row,
      ),
    });

  return (
    <div className="rules-form">
      <p className="rules-hint">{t('rules.relationIntro')}</p>
      <FormField label={t('rules.relationTarget')} hint={t('rules.relationTargetHint')}>
        <select value={value.target} onChange={(e) => patch({ target: e.target.value })}>
          <option value="">{t('rules.relationPickMetric')}</option>
          {metrics.map((metric) => (
            <option key={metric.id} value={metric.id}>
              {metric.name}
            </option>
          ))}
        </select>
      </FormField>

      {value.members.map((member, index) => (
        <div key={index} className="rules-relation-member">
          <FormField label={index === 0 ? t('rules.relationMember') : ' '}>
            <select
              value={member.metricId}
              onChange={(e) => setMember(index, { metricId: e.target.value })}
            >
              <option value="">{t('rules.relationPickMetric')}</option>
              {metrics.map((metric) => (
                <option key={metric.id} value={metric.id}>
                  {metric.name}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label={index === 0 ? t('rules.relationWeight') : ' '}>
            <input
              type="number"
              step="any"
              value={member.weight}
              onChange={(e) => setMember(index, { weight: e.target.value })}
            />
          </FormField>
          <button
            type="button"
            className="btn btn-secondary btn-sm rules-relation-remove"
            aria-label={t('rules.relationRemoveMember')}
            title={t('rules.relationRemoveMember')}
            disabled={value.members.length <= 1}
            onClick={() =>
              patch({ members: value.members.filter((_, rowIndex) => rowIndex !== index) })
            }
          >
            <Minus size={14} aria-hidden />
          </button>
        </div>
      ))}

      <button
        type="button"
        className="btn btn-secondary btn-sm rules-relation-add"
        onClick={() => patch({ members: [...value.members, { metricId: '', weight: '1' }] })}
      >
        <Plus size={14} aria-hidden />
        {t('rules.relationAddMember')}
      </button>

      <FormField label={t('rules.relationTolerance')} hint={t('rules.relationToleranceHint')}>
        <div className="rules-relation-tolerance">
          <select
            value={value.toleranceKind}
            onChange={(e) =>
              patch({ toleranceKind: e.target.value as RelationDraft['toleranceKind'] })
            }
          >
            <option value="abs">{t('rules.toleranceAbs')}</option>
            <option value="rel">{t('rules.toleranceRel')}</option>
          </select>
          <input
            type="number"
            step="any"
            min="0"
            value={value.toleranceValue}
            onChange={(e) => patch({ toleranceValue: e.target.value })}
          />
        </div>
      </FormField>

      <p className="rules-condition-current">{relationLabel(relationPayload(value), metricName)}</p>
    </div>
  );
}
