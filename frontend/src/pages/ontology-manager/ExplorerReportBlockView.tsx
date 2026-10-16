import { useMemo, useState } from 'react';
import { ChartLine, Table as TableIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { ExplorerReportBlock } from '../../data/explorerApi';
import { QueryFailureNotice, asQueryFailureKind } from '../../styles/design-system';
import { ExplorerChart } from './ExplorerChart';
import { MAX_CHART_SERIES, chartFits, chartSeries, parseChartSpec } from './explorerChartSpec';

/**
 * One block of a report: its title/insight, its failure if it failed, and its result.
 *
 * A block that carries a `chart` spec and whose result satisfies it is drawn, with the table one
 * click away; anything else is the table. The spec never changes what was queried — the rows come
 * from the server's last run.
 */
export function ExplorerReportBlockView({ block }: { block: ExplorerReportBlock }) {
  const { t } = useTranslation('ontology');
  const [showTable, setShowTable] = useState(false);

  const rows = block.rows ?? [];
  const columns = block.columns ?? (rows[0] ? Object.keys(rows[0]) : []);
  const spec = useMemo(() => parseChartSpec(block.chart), [block.chart]);
  const canChart = chartFits(spec, columns);
  const series = useMemo(() => (spec && canChart ? chartSeries(rows, spec) : null), [spec, canChart, rows]);

  return (
    <section className="explorer-report-chart">
      <h3>{block.title ?? t('dataExplorer.block')}</h3>
      {block.insight && <p className="explorer-report-chart__insight">{block.insight}</p>}
      {block.error ? (
        <QueryFailureNotice
          kind={asQueryFailureKind(block.error.kind)}
          title={t('dataExplorer.blockFailed')}
          message={block.error.message}
          detail={block.error.detail}
          detailsLabel={t('dataModel.playgroundErrorDetails')}
        />
      ) : !block.ran_at ? (
        <p className="entity-view__readonly">{t('dataExplorer.blockNotRun')}</p>
      ) : rows.length === 0 ? (
        <p className="entity-view__readonly">{t('dataExplorer.blockNoRows')}</p>
      ) : (
        <>
          <div className="explorer-block__toolbar">
            <p className="page-subtitle">
              {t('datasets.filterRows', { count: block.total ?? rows.length })}
              {block.capped ? ` · ${t('datasets.filterCapped')}` : ''}
              {block.duration_ms != null ? ` · ${block.duration_ms} ms` : ''}
            </p>
            {spec && canChart ? (
              <div className="ds-view-toggle" role="group" aria-label={t('dataExplorer.viewModeAria')}>
                <button
                  type="button"
                  className={`ds-view-toggle__btn${showTable ? '' : ' active'}`}
                  onClick={() => setShowTable(false)}
                  title={t('dataExplorer.chart')}
                >
                  <ChartLine size={16} aria-hidden />
                </button>
                <button
                  type="button"
                  className={`ds-view-toggle__btn${showTable ? ' active' : ''}`}
                  onClick={() => setShowTable(true)}
                  title={t('dataExplorer.viewTable')}
                >
                  <TableIcon size={16} aria-hidden />
                </button>
              </div>
            ) : null}
          </div>
          {spec && series && !showTable ? (
            <>
              <ExplorerChart spec={spec} series={series} />
              {series.truncated && (
                <p className="page-subtitle">
                  {t('dataExplorer.chartTruncated', { max: MAX_CHART_SERIES })}
                </p>
              )}
            </>
          ) : (
            <div className="ds-table-wrap">
              <table className="console-table">
                <thead>
                  <tr>
                    {columns.map((c) => (
                      <th key={c}>{c}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, ri) => (
                    <tr key={ri}>
                      {columns.map((c) => (
                        <td key={c}>
                          {row[c] === null || row[c] === undefined ? t('datasets.dash') : String(row[c])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  );
}
