import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { TFunction } from 'i18next';
import { highlightSql } from '../../../components/quality/sqlHighlight';
import '../../../components/quality/SqlEditor.scss';
import type { CatalogDataQuery, SearchResult } from '../../../data/knowledgeBasesApi';
import { playgroundHrefFromDataQuery } from './chatPlaygroundHref';

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
  if (mode === 'metric') return t('chat.dataEvidenceModeMetric');
  if (mode === 'sql') return t('chat.dataEvidenceModeSql');
  if (mode === 'expression') return t('chat.dataEvidenceModeExpression');
  return t('chat.dataEvidenceModeQuery');
}

function evidenceTitle(s: SearchResult, t: TFunction): string {
  const name = (s.source_name || '').trim();
  if (name) return name;
  const dq = s.data_query;
  if (dq?.metric) return String(dq.metric);
  if (dq?.expression) return String(dq.expression);
  return t('chat.dataEvidenceUntitled');
}

function SqlReadonly({ sql }: { sql: string }) {
  return (
    <pre className="agent-chat-data-sql">
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
    <div className="ds-table-wrap agent-chat-data-table-host">
      <table className="agent-chat-data-table">
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
              <td colSpan={columns.length} className="agent-chat-data-table__empty">
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

export function ChatEvidenceCard({ s, t }: { s: SearchResult; t: TFunction }) {
  const dq = s.data_query ?? null;
  const [sqlOpen, setSqlOpen] = useState(false);
  const modelId = (dq?.model_id || s.document_id || '').trim();
  const rowCount = dq?.row_count ?? dq?.rows?.length ?? null;
  const sql = (dq?.sql || '').trim();

  return (
    <div className="agent-chat-data-card">
      <div className="agent-chat-data-card__head">
        <span className="agent-chat-data-card__mode">{modeLabel(dq, t)}</span>
        <span className="agent-chat-data-card__title">{evidenceTitle(s, t)}</span>
        {rowCount != null ? (
          <span className="agent-chat-data-card__meta">
            {t('chat.dataEvidenceRows', { count: rowCount })}
            {dq?.capped ? ` · ${t('chat.dataEvidenceCapped')}` : ''}
          </span>
        ) : null}
        {modelId ? (
          <Link className="agent-chat-data-card__link" to={playgroundHrefFromDataQuery(modelId, dq)}>
            {t('chat.dataEvidenceOpenPlayground')}
          </Link>
        ) : null}
      </div>

      {dq ? <ResultTable dq={dq} /> : null}

      {!dq && s.content ? <p className="agent-chat-data-card__fallback">{s.content}</p> : null}

      {sql ? (
        <div className="agent-chat-data-sql-block">
          <button
            type="button"
            className="agent-chat-sources-action-btn"
            aria-expanded={sqlOpen}
            onClick={() => setSqlOpen((v) => !v)}
          >
            {sqlOpen ? t('chat.dataEvidenceHideSql') : t('chat.dataEvidenceShowSql')}
          </button>
          {sqlOpen ? <SqlReadonly sql={sql} /> : null}
        </div>
      ) : null}
    </div>
  );
}
