import { AlertTriangle } from 'lucide-react';
import type { QueryFailureKind } from './queryFailureKind';

export interface QueryFailureNoticeProps {
  /** The label for the cause, already localized by the caller. */
  title: string;
  /** The classified message; omitted when the title says it all. */
  message?: string | null;
  /** Driver/SQL detail — folded away, because it is for the person fixing the query. */
  detail?: string | null;
  kind?: QueryFailureKind;
  /** Label for the folded detail. */
  detailsLabel: string;
}

/**
 * A failed query, rendered the same way wherever a query can fail (Playground, Data Explorer).
 * The cause comes from the backend (`kind`), so a definition problem never reads like a data one.
 */
export function QueryFailureNotice({
  title,
  message,
  detail,
  kind = 'request',
  detailsLabel,
}: QueryFailureNoticeProps) {
  return (
    <div className={`query-failure query-failure--${kind}`} role="alert">
      <p className="query-failure__title">
        <AlertTriangle size={16} aria-hidden />
        {title}
      </p>
      {message ? <p className="query-failure__message">{message}</p> : null}
      {detail ? (
        <details className="query-failure__details">
          <summary>{detailsLabel}</summary>
          <pre>{detail}</pre>
        </details>
      ) : null}
    </div>
  );
}
