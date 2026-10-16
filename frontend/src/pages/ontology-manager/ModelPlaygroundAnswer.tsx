import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { SemanticModelQueryResponse } from '../../data/semanticModelsApi';
import { EntityViewPanel } from './EntityViewShell';
import { QueryFailureNotice, asQueryFailureKind } from '../../styles/design-system';

/** A failed run, as the query API classified it: who can fix it, what it said, and the source's words. */
export type RunError = { kind: string; message: string; detail?: string };

/**
 * The answer pane: a classified failure, or the result with its context (row count, cap, duration,
 * null share per column, why it is empty) and the generated SQL.
 */
export function ModelPlaygroundAnswer({
  result,
  runError,
  filtersApplied,
}: {
  result: SemanticModelQueryResponse | null;
  runError: RunError | null;
  filtersApplied: boolean;
}) {
  const { t } = useTranslation('ontology');
  const [showSql, setShowSql] = useState(false);

  /** Share of the returned rows that are null per column, so a thin result is readable. */
  const nullShare = useMemo(() => {
    const rows = result?.rows ?? [];
    const share: Record<string, number> = {};
    for (const column of result?.columns ?? []) {
      share[column] = rows.length
        ? rows.filter((row) => row[column] === null || row[column] === undefined).length / rows.length
        : 0;
    }
    return share;
  }, [result]);

  return (
    <div className="playground__answer">
      <EntityViewPanel title={t('dataModel.playgroundResult')}>
        {runError ? (
          <QueryFailureNotice
            kind={asQueryFailureKind(runError.kind)}
            title={
              runError.kind === 'definition'
                ? t('dataModel.playgroundErrorDefinition')
                : runError.kind === 'request'
                  ? t('dataModel.playgroundErrorRequest')
                  : runError.kind === 'data'
                    ? t('dataModel.playgroundErrorData')
                    : t('dataModel.playgroundRunFailed')
            }
            message={runError.message}
            detail={runError.detail}
            detailsLabel={t('dataModel.playgroundErrorDetails')}
          />
        ) : !result ? (
          <p className="entity-view__readonly">{t('dataModel.playgroundEmpty')}</p>
        ) : (
          <>
            <p className="page-subtitle">
              {t('dataModel.playgroundRowCount', { count: result.row_count })}
              {result.capped ? ` · ${t('dataModel.playgroundCapped')}` : ''}
              {` · ${result.duration_ms} ms`}
            </p>
            {result.rows.length === 0 ? (
              <p className="entity-view__readonly">
                {filtersApplied
                  ? t('dataModel.playgroundNoRowsFiltered')
                  : t('dataModel.playgroundNoRowsEmpty')}
              </p>
            ) : (
              <div className="ds-table-wrap ds-table-wrap--flush">
                <table className="console-table">
                  <thead>
                    <tr>
                      {result.columns.map((c) => (
                        <th key={c}>
                          {c}
                          {nullShare[c] > 0 ? (
                            <span className="playground__null-share">
                              {t('dataModel.playgroundNullShare', {
                                percent: Math.round(nullShare[c] * 100),
                              })}
                            </span>
                          ) : null}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {result.rows.map((row, i) => (
                      <tr key={i}>
                        {result.columns.map((c) => (
                          <td key={c}>
                            {row[c] === null || row[c] === undefined
                              ? t('datasets.dash')
                              : String(row[c])}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <button
              type="button"
              className="btn btn-secondary btn-sm playground__sql-toggle"
              onClick={() => setShowSql((v) => !v)}
            >
              {t('dataModel.playgroundSql')}
            </button>
            {showSql && <pre className="playground__sql">{result.sql}</pre>}
          </>
        )}
    </EntityViewPanel>
  </div>
  );
}
