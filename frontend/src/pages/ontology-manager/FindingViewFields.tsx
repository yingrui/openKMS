import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { CheckList, CheckListItem, FormField } from '../../styles/design-system';
import { FindingChart } from './FindingChart';
import { FindingBarList } from './FindingBarList';
import { FindingMetric } from './FindingMetric';
import { FindingTracker } from './FindingTracker';
import { chartFits, chartSeries, viewFits } from './findingView';
import { viewSpec, type ViewChoice, type ViewDraft } from './findingDraft';

const NO_TREND = '';

/**
 * How far back a KPI compares, in **rows** — a count, not a date rule, so it can never silently mean
 * something else. Each option names the reading it assumes, because that is the part a person has to
 * get right (a monthly series compares 12 rows back for a year, a quarterly one 4).
 */
const COMPARE_CHOICES = [1, 4, 7, 12];

/**
 * How a finding is presented: the table, a trend, a number, a ranking or a strip — over the columns of
 * its result, previewed by the same components the story draws with.
 *
 * Shared by "save this query" and "edit this finding", because the question is identical in both.
 */
export function FindingViewFields({
  columns,
  rows,
  view,
  onChange,
}: {
  columns: string[];
  rows: Array<Record<string, unknown>>;
  view: ViewDraft;
  onChange: (next: ViewDraft) => void;
}) {
  const { t } = useTranslation('ontology');
  const spec = useMemo(() => viewSpec(view), [view]);
  const series = useMemo(
    () => (spec?.kind === 'chart' && chartFits(spec, columns) ? chartSeries(rows, spec) : null),
    [spec, columns, rows],
  );

  const chartLike =
    view.choice === 'line' || view.choice === 'bar' || view.choice === 'combo' || view.choice === 'scatter';
  const singleValue = view.choice === 'bar_list' || view.choice === 'tracker';

  /** Choosing a presentation picks the columns it needs, so the choice is never "a chart of nothing". */
  const choose = (choice: ViewChoice) => {
    const next: ViewDraft = { ...view, choice, y: chartLike && view.y.length > 0 ? view.y : view.y };
    if (choice === 'none') {
      onChange({ ...view, choice });
      return;
    }
    if (choice === 'line' || choice === 'bar') {
      const axis = view.axisColumn || columns[0] || '';
      const y = (view.y.length > 0 ? view.y : columns.slice(0, 1)).filter((c) => c !== axis);
      onChange({ ...next, axisColumn: axis, y, valueColumn: y[0] ?? view.valueColumn });
      return;
    }
    const value = view.valueColumn || columns[0] || '';
    // A metric's trend and a tracker's order are both "the column that orders/labels" — unused by
    // a ranking, which labels each row from the first column that is not its value.
    const axis =
      choice === 'bar_list' ? '' : view.axisColumn && view.axisColumn !== value ? view.axisColumn : (columns.find((c) => c !== value) ?? '');
    onChange({ ...next, valueColumn: value, axisColumn: axis, y: [] });
  };

  const toggleLines = (column: string) => {
    const lines = view.lines ?? [];
    onChange({
      ...view,
      lines: lines.includes(column) ? lines.filter((c) => c !== column) : [...lines, column],
    });
  };

  const toggleY = (column: string) => {
    onChange({
      ...view,
      y: view.y.includes(column) ? view.y.filter((c) => c !== column) : [...view.y, column],
    });
  };

  return (
    <>
      <FormField label={t('dataInsights.viewKind')}>
        <select value={view.choice} onChange={(e) => choose(e.target.value as ViewChoice)}>
          <option value="none">{t('dataInsights.viewTable')}</option>
          <option value="line">{t('dataInsights.chartLine')}</option>
          <option value="bar">{t('dataInsights.chartBar')}</option>
          <option value="combo">{t('dataInsights.chartCombo')}</option>
          <option value="scatter">{t('dataInsights.chartScatter')}</option>
          <option value="metric">{t('dataInsights.viewMetric')}</option>
          <option value="bar_list">{t('dataInsights.viewBarList')}</option>
          <option value="tracker">{t('dataInsights.viewTracker')}</option>
        </select>
      </FormField>
      {view.choice !== 'none' && (
        <>
          <FormField
            label={
              view.choice === 'scatter'
                ? t('dataInsights.chartXMeasure')
                : singleValue || view.choice === 'metric'
                  ? t('dataInsights.viewValueColumn')
                  : t('dataInsights.chartX')
            }
          >
            <select
              value={view.choice === 'metric' || singleValue ? view.valueColumn : view.axisColumn}
              onChange={(e) =>
                onChange(
                  view.choice === 'metric' || singleValue
                    ? { ...view, valueColumn: e.target.value }
                    : { ...view, axisColumn: e.target.value },
                )
              }
            >
              {columns.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </FormField>
          {chartLike && (
            <FormField
              label={
                view.choice === 'scatter'
                  ? t('dataInsights.chartYMeasure')
                  : view.choice === 'combo'
                    ? t('dataInsights.chartBars')
                    : t('dataInsights.chartY')
              }
            >
              {view.choice === 'scatter' ? (
                <select
                  value={view.y[0] ?? ''}
                  onChange={(e) => onChange({ ...view, y: e.target.value ? [e.target.value] : [] })}
                >
                  <option value="">{t('dataInsights.queryNoMetric')}</option>
                  {columns
                    .filter((c) => c !== view.axisColumn)
                    .map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                </select>
              ) : (
              <CheckList>
                {columns
                  .filter((c) => c !== view.axisColumn && !(view.lines ?? []).includes(c))
                  .map((c) => (
                    <CheckListItem key={c} checked={view.y.includes(c)} onChange={() => toggleY(c)}>
                      {c}
                    </CheckListItem>
                  ))}
              </CheckList>
              )}
            </FormField>
          )}
          {view.choice === 'combo' && (
            <FormField label={t('dataInsights.chartLines')}>
              <CheckList>
                {columns
                  .filter((c) => c !== view.axisColumn && !view.y.includes(c))
                  .map((c) => (
                    <CheckListItem
                      key={c}
                      checked={(view.lines ?? []).includes(c)}
                      onChange={() => toggleLines(c)}
                    >
                      {c}
                    </CheckListItem>
                  ))}
              </CheckList>
            </FormField>
          )}
          {view.choice === 'metric' && (
            <FormField label={t('dataInsights.viewTrendColumn')}>
              <select
                value={view.axisColumn === view.valueColumn ? NO_TREND : view.axisColumn}
                onChange={(e) => onChange({ ...view, axisColumn: e.target.value })}
              >
                <option value={NO_TREND}>{t('dataInsights.viewNoTrend')}</option>
                {columns
                  .filter((c) => c !== view.valueColumn)
                  .map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
              </select>
            </FormField>
          )}
          {view.choice === 'metric' && view.axisColumn !== view.valueColumn && (
            <FormField label={t('dataInsights.viewCompare')} hint={t('dataInsights.viewCompareHint')}>
              <select
                value={String(view.compare ?? 1)}
                onChange={(e) => onChange({ ...view, compare: Number(e.target.value) })}
              >
                {COMPARE_CHOICES.map((choice) => (
                  <option key={choice} value={String(choice)}>
                    {t(`dataInsights.viewCompare_${choice}`)}
                  </option>
                ))}
              </select>
            </FormField>
          )}
          {view.choice === 'tracker' && (
            <FormField label={t('dataInsights.viewOrderColumn')}>
              <select
                value={view.axisColumn}
                onChange={(e) => onChange({ ...view, axisColumn: e.target.value })}
              >
                {columns
                  .filter((c) => c !== view.valueColumn)
                  .map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
              </select>
            </FormField>
          )}
          {spec && viewFits(spec, columns) ? (
            spec.kind === 'metric' ? (
              <FindingMetric view={spec} rows={rows} />
            ) : spec.kind === 'bar_list' ? (
              <FindingBarList view={spec} rows={rows} />
            ) : spec.kind === 'tracker' ? (
              <FindingTracker view={spec} rows={rows} />
            ) : series ? (
              <FindingChart spec={spec} series={series} />
            ) : null
          ) : (
            <p className="entity-view__readonly">{t('dataInsights.saveFindingNoChart')}</p>
          )}
        </>
      )}
    </>
  );
}
