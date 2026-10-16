import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { CheckList, CheckListItem, FormField } from '../../styles/design-system';
import { ExplorerChart } from './ExplorerChart';
import { chartFits, chartSeries } from './explorerChartSpec';
import { chartSpec, type ChartChoice, type ChartDraft } from './reportDraft';

/**
 * How a report is drawn: a table, a line or bars, over columns of its result — with a preview drawn
 * by the same component the dashboard uses.
 *
 * Shared by "save this query" and "edit this report", because the question is identical in both.
 */
export function ReportChartFields({
  columns,
  rows,
  chart,
  onChange,
}: {
  columns: string[];
  rows: Array<Record<string, unknown>>;
  chart: ChartDraft;
  onChange: (next: ChartDraft) => void;
}) {
  const { t } = useTranslation('ontology');
  const spec = useMemo(() => chartSpec(chart), [chart]);
  const series = useMemo(
    () => (spec && chartFits(spec, columns) ? chartSeries(rows, spec) : null),
    [spec, columns, rows],
  );

  /** Choosing a chart picks a measure to draw, so the choice is never "a chart of nothing". */
  const choose = (choice: ChartChoice) => {
    if (choice === 'none') {
      onChange({ ...chart, choice });
      return;
    }
    const x = chart.x || columns[0] || '';
    const y = (chart.y.length > 0 ? chart.y : columns.filter((c) => c !== x).slice(0, 1)).filter(
      (c) => c !== x,
    );
    onChange({ choice, x, y });
  };

  const toggleY = (column: string) => {
    onChange({
      ...chart,
      y: chart.y.includes(column) ? chart.y.filter((c) => c !== column) : [...chart.y, column],
    });
  };

  return (
    <>
      <FormField label={t('dataExplorer.saveReportChart')}>
        <select value={chart.choice} onChange={(e) => choose(e.target.value as ChartChoice)}>
          <option value="none">{t('dataExplorer.viewTable')}</option>
          <option value="line">{t('dataExplorer.chartLine')}</option>
          <option value="bar">{t('dataExplorer.chartBar')}</option>
        </select>
      </FormField>
      {chart.choice !== 'none' && (
        <>
          <FormField label={t('dataExplorer.chartX')}>
            <select value={chart.x} onChange={(e) => onChange({ ...chart, x: e.target.value })}>
              {columns.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label={t('dataExplorer.chartY')}>
            <CheckList>
              {columns
                .filter((c) => c !== chart.x)
                .map((c) => (
                  <CheckListItem key={c} checked={chart.y.includes(c)} onChange={() => toggleY(c)}>
                    {c}
                  </CheckListItem>
                ))}
            </CheckList>
          </FormField>
          {series ? (
            <ExplorerChart spec={spec!} series={series} />
          ) : (
            <p className="entity-view__readonly">{t('dataExplorer.saveReportNoChart')}</p>
          )}
        </>
      )}
    </>
  );
}
