import { useMemo, useState, type ReactNode } from 'react';
import { ChartLine, Download, ExternalLink, Table as TableIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import type { DatasetResponse } from '../../data/datasetsApi';
import type { StoryFinding } from '../../data/storiesApi';
import type { SemanticModelResponse } from '../../data/semanticModelsApi';
import { RichMarkdown } from '../../components/markdown/richMarkdown';
import { EntityViewPanel } from './EntityViewShell';
import { findingSource } from './findingSource';
import { QueryFailureNotice, asQueryFailureKind } from '../../styles/design-system';
import { FindingChart } from './FindingChart';
import { FindingBarList } from './FindingBarList';
import { FindingMetric } from './FindingMetric';
import { FindingTracker } from './FindingTracker';
import { absoluteTime, ageKey, ageOf } from './relativeAge';
import { csvFileName, downloadCsv, toCsv } from './findingCsv';
import {
  MAX_BAR_LIST_ROWS,
  MAX_CHART_SERIES,
  chartFits,
  chartSeries,
  parseView,
  viewFits,
} from './findingView';

/**
 * One **finding** in a story — a tile, not the document.
 *
 * It carries its own source and query, so it is labelled with where its numbers come from. A finding
 * that carries a `chart` spec its result satisfies is drawn, with the table one click away;
 * anything else is the table.
 */
export function StoryFindingView({
  id,
  finding,
  datasets,
  models,
  actions,
}: {
  /** The rail's table of contents links to this section by id. */
  id?: string;
  finding: StoryFinding;
  datasets: DatasetResponse[];
  models: SemanticModelResponse[];
  /** Edit / reorder / remove — owned by the page, rendered in the tile's header. */
  actions?: ReactNode;
}) {
  const { t } = useTranslation('ontology');
  const [showTable, setShowTable] = useState(false);

  const rows = finding.rows ?? [];
  const columns = finding.columns ?? (rows[0] ? Object.keys(rows[0]) : []);
  const view = useMemo(() => parseView(finding.view), [finding.view]);
  const canDraw = viewFits(view, columns);
  const series = useMemo(
    () => (view?.kind === 'chart' && chartFits(view, columns) ? chartSeries(rows, view) : null),
    [view, columns, rows],
  );

  const age = ageOf(finding.ran_at);
  const ageLabel = age
    ? age.bucket === 'just_now'
      ? t(ageKey('just_now'))
      : t(ageKey(age.bucket), { count: age.count })
    : null;
  const source = findingSource(finding, datasets, models, t('dataInsights.sourceMissing'));
  const isModel = source.kind === 'semantic_model';

  return (
    <EntityViewPanel
      id={id}
      title={finding.title ?? t('dataInsights.finding')}
      actions={actions}
      description={
        <>
          {finding.takeaway && (
            <RichMarkdown className="story-finding__takeaway">{finding.takeaway}</RichMarkdown>
          )}
          {/* Where the numbers come from — named, and linked when the reader may open the source. */}
          <span className="story-finding__source">
            {isModel ? t('dataInsights.sourceModel') : t('dataInsights.sourceDataset')}
            {': '}
            {source.href ? (
              <Link to={source.href}>
                {source.label} <ExternalLink size={12} aria-hidden />
              </Link>
            ) : (
              source.label
            )}
          </span>
        </>
      }
    >
      {finding.error ? (
        <QueryFailureNotice
          kind={asQueryFailureKind(finding.error.kind)}
          title={t('dataInsights.findingFailed')}
          message={finding.error.message}
          detail={finding.error.detail}
          detailsLabel={t('dataModel.playgroundErrorDetails')}
        />
      ) : !finding.ran_at ? (
        <p className="entity-view__readonly">{t('dataInsights.findingNotRun')}</p>
      ) : rows.length === 0 ? (
        <p className="entity-view__readonly">{t('dataInsights.findingNoRows')}</p>
      ) : (
        <>
          {/* Provenance: how much, how fresh, how slow — quieter than the takeaway above it. */}
          <p className="story-finding__meta">
            <span>{t('datasets.filterRows', { count: finding.total ?? rows.length })}</span>
            {finding.capped && <span>{t('datasets.filterCapped')}</span>}
            {finding.duration_ms != null && <span>{finding.duration_ms} ms</span>}
            {/* As of *when* — never "the data has not changed", which nothing here can know. */}
            {ageLabel && <span title={absoluteTime(finding.ran_at)}>{t('dataInsights.asOf', { age: ageLabel })}</span>}
          </p>
          <div className="story-finding__toolbar">
            <div className="openkms-flex-row-gap">
              {/* Exporting what is on screen is a reader's action, so it sits beside the view toggle. */}
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => downloadCsv(toCsv(columns, rows), csvFileName(finding.title))}
                title={t('dataInsights.exportCsv')}
              >
                <Download size={14} aria-hidden />
                <span>CSV</span>
              </button>
              {view && canDraw ? (
              <div className="ds-view-toggle" role="group" aria-label={t('dataInsights.viewModeAria')}>
                <button
                  type="button"
                  className={`ds-view-toggle__btn${showTable ? '' : ' active'}`}
                  onClick={() => setShowTable(false)}
                  title={t('dataInsights.chart')}
                >
                  <ChartLine size={16} aria-hidden />
                </button>
                <button
                  type="button"
                  className={`ds-view-toggle__btn${showTable ? ' active' : ''}`}
                  onClick={() => setShowTable(true)}
                  title={t('dataInsights.viewTable')}
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
                <FindingMetric view={view} rows={rows} />
              ) : view.kind === 'bar_list' ? (
                <FindingBarList view={view} rows={rows} />
              ) : view.kind === 'tracker' ? (
                <FindingTracker view={view} rows={rows} />
              ) : series ? (
                <FindingChart spec={view} series={series} />
              ) : null}
              {series?.truncated && (
                <p className="page-subtitle">
                  {t('dataInsights.chartTruncated', { max: MAX_CHART_SERIES })}
                </p>
              )}
              {view.kind === 'bar_list' && rows.length > MAX_BAR_LIST_ROWS && (
                <p className="page-subtitle">
                  {t('dataInsights.barListTruncated', { max: MAX_BAR_LIST_ROWS })}
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
    </EntityViewPanel>
  );
}
