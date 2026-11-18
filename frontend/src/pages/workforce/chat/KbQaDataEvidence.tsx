import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { TFunction } from 'i18next';
import { highlightSql } from '../../components/quality/sqlHighlight';
import '../../components/quality/SqlEditor.scss';
import type { CatalogDataQuery, SearchResult } from '../../data/knowledgeBasesApi';
import { playgroundHrefFromDataQuery } from './kbQaPlaygroundHref';

function cellText(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function modeLabel(dq: CatalogDataQuery | null | undefined, t: TFunction): string {
  const mode = (dq?.mode || '').toLowerCase();
  if (mode === 'metric') return t('detail.qaDataEvidenceModeMetric');
  if (mode === 'sql') return t('detail.qaDataEvidenceModeSql');
  if (mode === 'expression') return t('detail.qaDataEvidenceModeExpression');
  return t('detail.qaDataEvidenceModeQuery');
}

function evidenceTitle(s: SearchResult, t: TFunction): string {
  const name = (s.source_name || '').trim();
  if (name) return name;
  const dq = s.data_query;
  if (dq?.metric) return String(dq.metric);
  if (dq?.expression) return String(dq.expression);
  return t('detail.qaDataEvidenceUntitled');
}

function SqlReadonly({ sql }: { sql: string }) {
  return (
    <pre className="kb-qa-data-sql">
      {highlightSql(sql).map((token, index) => (
        <span key={index} className={`sql-editor__${token.kind}`}>
          {token.text}
        </span>
      ))}
    </pre>
  );
}

function ResultTable({ dq }: { dq: CatalogDataQuery }) {
  const columns =
    Array.isArray(dq.columns) && dq.columns.length > 0
      ? dq.columns
      : dq.rows && dq.rows[0]
        ? Object.keys(dq.rows[0])
        : [];
  const rows = Array.isArray(dq.rows) ? dq.rows : [];
  if (columns.length === 0) {
    return null;
  }
  return (
    <div className="ds-table-wrap kb-qa-data-table-host">
      <table className="kb-qa-data-table">
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="kb-qa-data-table__empty">
                —
              </td>
            </tr>
          ) : (
            rows.map((row, i) => (
              <tr key={i}>
                {columns.map((c) => (
                  <td key={c}>{cellText(row[c])}</td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

export function KbQaEvidenceCard({ s, t }: { s: SearchResult; t: TFunction }) {
  const dq = s.data_query ?? null;
  const [sqlOpen, setSqlOpen] = useState(false);
  const modelId = (dq?.model_id || s.document_id || '').trim();
  const rowCount = dq?.row_count ?? dq?.rows?.length ?? null;
  const sql = (dq?.sql || '').trim();

  return (
    <div className="kb-qa-data-card">
      <div className="kb-qa-data-card__head">
        <span className="kb-qa-data-card__mode">{modeLabel(dq, t)}</span>
        <span className="kb-qa-data-card__title">{evidenceTitle(s, t)}</span>
        {rowCount != null ? (
          <span className="kb-qa-data-card__meta">
            {t('detail.qaDataEvidenceRows', { count: rowCount })}
            {dq?.capped ? ` · ${t('detail.qaDataEvidenceCapped')}` : ''}
          </span>
        ) : null}
        {modelId ? (
          <Link className="kb-qa-data-card__link" to={playgroundHrefFromDataQuery(modelId, dq)}>
            {t('detail.qaDataEvidenceOpenPlayground')}
          </Link>
        ) : null}
      </div>

      {dq ? <ResultTable dq={dq} /> : null}

      {!dq && s.content ? <p className="kb-qa-data-card__fallback">{s.content}</p> : null}

      {sql ? (
        <div className="kb-qa-data-sql-block">
          <button
            type="button"
            className="kb-qa-sources-action-btn"
            aria-expanded={sqlOpen}
            onClick={() => setSqlOpen((v) => !v)}
          >
            {sqlOpen ? t('detail.qaDataEvidenceHideSql') : t('detail.qaDataEvidenceShowSql')}
          </button>
          {sqlOpen ? <SqlReadonly sql={sql} /> : null}
        </div>
      ) : null}
    </div>
  );
}
