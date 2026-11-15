/**
 * The calendar of a time dimension — what "one period" is in this field.
 *
 * Kept out of the (700-line-capped) fields section, and it is a coherent unit: the kind, and — for a custom
 * cycle — how a period is written. A run filters by the field's own vocabulary, so this is the declaration
 * that makes `2026-W46` mean something to a `cycle` column.
 */
import { useTranslation } from 'react-i18next';
import { FormField } from '../../../styles/design-system';
import type { SemanticModelFieldDimension } from '../../../data/semanticModelFieldsApi';

export type PeriodKind = NonNullable<SemanticModelFieldDimension['period_kind']>;

export function ModelFieldPeriodFields({
  kind,
  format,
  onChange,
}: {
  kind: PeriodKind;
  format: string;
  onChange: (next: { kind?: PeriodKind; format?: string }) => void;
}) {
  const { t } = useTranslation('ontology');
  return (
    <>
      <FormField label={t('dataModel.periodKind')} hint={t('dataModel.periodKindHint')}>
        <select
          className="ds-control"
          value={kind}
          onChange={(e) => onChange({ kind: e.target.value as PeriodKind })}
        >
          <option value="day">{t('dataModel.periodKindDay')}</option>
          <option value="week">{t('dataModel.periodKindWeek')}</option>
          <option value="month">{t('dataModel.periodKindMonth')}</option>
          <option value="quarter">{t('dataModel.periodKindQuarter')}</option>
          <option value="year">{t('dataModel.periodKindYear')}</option>
          <option value="custom">{t('dataModel.periodKindCustom')}</option>
        </select>
      </FormField>
      {kind === 'custom' ? (
        <FormField label={t('dataModel.periodFormat')} hint={t('dataModel.periodFormatHint')}>
          <input
            className="ds-control"
            type="text"
            value={format}
            onChange={(e) => onChange({ format: e.target.value })}
            placeholder={t('dataModel.periodFormatPlaceholder')}
          />
        </FormField>
      ) : null}
    </>
  );
}
