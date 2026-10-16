import { useMemo, useState, type ReactNode } from 'react';
import { ChartLine, Download, ExternalLink, Table as TableIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import type { DatasetResponse } from '../../data/datasetsApi';
import type { DashboardReport } from '../../data/dashboardsApi';
import type { SemanticModelResponse } from '../../data/semanticModelsApi';
import { RichMarkdown } from '../../components/markdown/richMarkdown';
import { QueryFailureNotice, asQueryFailureKind } from '../../styles/design-system';
import { ExplorerChart } from './ExplorerChart';
import { ReportBarList } from './ReportBarList';
import { ReportMetric } from './ReportMetric';
import { absoluteTime, ageOf } from './reportAge';
import { csvFileName, downloadCsv, toCsv } from './reportCsv';
import {
  MAX_BAR_LIST_ROWS,
  MAX_CHART_SERIES,
  chartFits,
  chartSeries,
  parseView,
  viewFits,
} from './reportView';

/**
 * One **report** in a dashboard — a tile, not the document.
 *
 * It carries its own source and query, so it is labelled with where its numbers come from. A report
 * that carries a `chart` spec its result satisfies is drawn, with the table one click away;
 * anything else is the table.
 */
export function DashboardReportView({
  report,
  datasets,
  models,
  actions,
}: {
  report: DashboardReport;
  datasets: DatasetResponse[];
  models: SemanticModelResponse[];
  /** Edit / reorder / remove — owned by the page, rendered in the tile's header. */
  actions?: ReactNode;
}) {
  const { t } = useTranslation('ontology');
  const [showTable, setShowTable] = useState(false);

  const rows = report.rows ?? [];
  const columns = report.columns ?? (rows[0] ? Object.keys(rows[0]) : []);
  const view = useMemo(() => parseView(report.view), [report.view]);
  const canDraw = viewFits(view, columns);
  const series = useMemo(
    () => (view?.kind === 'chart' && chartFits(view, columns) ? chartSeries(rows, view) : null),
    [view, columns, rows],
  );

  const age = ageOf(report.ran_at);
  const ageLabel = age
    ? age.bucket === 'just_now'
      ? t('dataExplorer.ageJustNow')
      : t(`dataExplorer.age_${age.bucket}`, { count: age.count })
    : null;
  const isModel = report.source_kind === 'semantic_model';
  const source = isModel
    ? models.find((m) => m.id === report.semantic_model_id)
    : datasets.find((d) => d.id === report.dataset_id);
  const sourceName = source
    ? isModel
      ? (source as SemanticModelResponse).name
      : (source as DatasetResponse).display_name ||
        `${(source as DatasetResponse).schema_name}.${(source as DatasetResponse).table_name}`
    : t('dataExplorer.sourceMissing');
  const sourceHref = isModel
    ? report.semantic_model_id
      ? `/data-model/${report.semantic_model_id}`
      : null
    : report.dataset_id
      ? `/datasets/${report.dataset_id}`
      : null;

  return (
    <section className="explorer-report-chart">
      <div className="dashboard-report__head">
        <h3>{report.title ?? t('dataExplorer.report')}</h3>
        {actions && <div className="openkms-flex-row-gap">{actions}</div>}
      </div>
      <p className="dashboard-report__source">
        <span>
          {isModel ? t('dataExplorer.sourceModel') : t('dataExplorer.sourceDataset')}
          {': '}
          {sourceHref ? (
            <Link to={sourceHref}>
              {sourceName} <ExternalLink size={12} aria-hidden />
            </Link>
          ) : (
            sourceName
          )}
        </span>
      </p>
      {report.insight && (
        <RichMarkdown className="explorer-report-chart__insight">{report.insight}</RichMarkdown>
      )}
      {report.error ? (
        <QueryFailureNotice
          kind={asQueryFailureKind(report.error.kind)}
          title={t('dataExplorer.reportFailed')}
          message={report.error.message}
          detail={report.error.detail}
          detailsLabel={t('dataModel.playgroundErrorDetails')}
        />
      ) : !report.ran_at ? (
        <p className="entity-view__readonly">{t('dataExplorer.reportNotRun')}</p>
      ) : rows.length === 0 ? (
        <p className="entity-view__readonly">{t('dataExplorer.reportNoRows')}</p>
      ) : (
        <>
          <div className="explorer-block__toolbar">
            <p className="page-subtitle">
              {t('datasets.filterRows', { count: report.total ?? rows.length })}
              {report.capped ? ` · ${t('datasets.filterCapped')}` : ''}
              {report.duration_ms != null ? ` · ${report.duration_ms} ms` : ''}
              {/* As of *when* — never "the data has not changed", which nothing here can know. */}
              {ageLabel && (
                <>
                  {' · '}
                  <span title={absoluteTime(report.ran_at)}>
                    {t('dataExplorer.asOf', { age: ageLabel })}
                  </span>
                </>
              )}
            </p>
            <div className="openkms-flex-row-gap">
              {/* Exporting what is on screen is a reader's action, so it sits beside the view toggle. */}
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => downloadCsv(toCsv(columns, rows), csvFileName(report.title))}
                title={t('dataExplorer.exportCsv')}
              >
                <Download size={14} aria-hidden />
                <span>CSV</span>
              </button>
              {view && canDraw ? (
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
          </div>
          {view && canDraw && !showTable ? (
            <>
              {view.kind === 'metric' ? (
                <ReportMetric view={view} rows={rows} />
              ) : view.kind === 'bar_list' ? (
                <ReportBarList view={view} rows={rows} />
              ) : series ? (
                <ExplorerChart spec={view} series={series} />
              ) : null}
              {series?.truncated && (
                <p className="page-subtitle">
                  {t('dataExplorer.chartTruncated', { max: MAX_CHART_SERIES })}
                </p>
              )}
              {view.kind === 'bar_list' && rows.length > MAX_BAR_LIST_ROWS && (
                <p className="page-subtitle">
                  {t('dataExplorer.barListTruncated', { max: MAX_BAR_LIST_ROWS })}
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
