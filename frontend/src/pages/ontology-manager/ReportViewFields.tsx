import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { CheckList, CheckListItem, FormField } from '../../styles/design-system';
import { ExplorerChart } from './ExplorerChart';
import { ReportBarList } from './ReportBarList';
import { ReportMetric } from './ReportMetric';
import { ReportTracker } from './ReportTracker';
import { chartFits, chartSeries, viewFits } from './reportView';
import { viewSpec, type ViewChoice, type ViewDraft } from './reportDraft';

const NO_TREND = '';

/**
 * How a report is presented: the table, a trend, a number, a ranking or a strip — over the columns of
 * its result, previewed by the same components the dashboard draws with.
 *
 * Shared by "save this query" and "edit this report", because the question is identical in both.
 */
export function ReportViewFields({
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

  const chartLike = view.choice === 'line' || view.choice === 'bar';
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

  const toggleY = (column: string) => {
    onChange({
      ...view,
      y: view.y.includes(column) ? view.y.filter((c) => c !== column) : [...view.y, column],
    });
  };

  return (
    <>
      <FormField label={t('dataExplorer.viewKind')}>
        <select value={view.choice} onChange={(e) => choose(e.target.value as ViewChoice)}>
          <option value="none">{t('dataExplorer.viewTable')}</option>
          <option value="line">{t('dataExplorer.chartLine')}</option>
          <option value="bar">{t('dataExplorer.chartBar')}</option>
          <option value="metric">{t('dataExplorer.viewMetric')}</option>
          <option value="bar_list">{t('dataExplorer.viewBarList')}</option>
          <option value="tracker">{t('dataExplorer.viewTracker')}</option>
        </select>
      </FormField>
      {view.choice !== 'none' && (
        <>
          <FormField
            label={
              singleValue || view.choice === 'metric'
                ? t('dataExplorer.viewValueColumn')
                : t('dataExplorer.chartX')
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
            <FormField label={t('dataExplorer.chartY')}>
              <CheckList>
                {columns
                  .filter((c) => c !== view.axisColumn)
                  .map((c) => (
                    <CheckListItem key={c} checked={view.y.includes(c)} onChange={() => toggleY(c)}>
                      {c}
                    </CheckListItem>
                  ))}
              </CheckList>
            </FormField>
          )}
          {view.choice === 'metric' && (
            <FormField label={t('dataExplorer.viewTrendColumn')}>
              <select
                value={view.axisColumn === view.valueColumn ? NO_TREND : view.axisColumn}
                onChange={(e) => onChange({ ...view, axisColumn: e.target.value })}
              >
                <option value={NO_TREND}>{t('dataExplorer.viewNoTrend')}</option>
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
          {view.choice === 'tracker' && (
            <FormField label={t('dataExplorer.viewOrderColumn')}>
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
              <ReportMetric view={spec} rows={rows} />
            ) : spec.kind === 'bar_list' ? (
              <ReportBarList view={spec} rows={rows} />
            ) : spec.kind === 'tracker' ? (
              <ReportTracker view={spec} rows={rows} />
            ) : series ? (
              <ExplorerChart spec={spec} series={series} />
            ) : null
          ) : (
            <p className="entity-view__readonly">{t('dataExplorer.saveReportNoChart')}</p>
          )}
        </>
      )}
    </>
  );
}
