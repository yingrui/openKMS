import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import './GraphReadNotice.scss';

type Props = {
  /**
   * `error` — the read failed (no graph, graph unreachable); `notIndexed` — the type has rows to
   * index but the graph shows none. Both are states a table would otherwise render as "empty".
   */
  kind: 'error' | 'notIndexed';
  /** The message from the API, shown after the generic sentence. */
  detail?: string;
  /** Where "index it" lives for this kind of type. */
  managePath: string;
};

export function GraphReadNotice({ kind, detail, managePath }: Props) {
  const { t } = useTranslation('explore');

  return (
    <div className={`graph-read-notice graph-read-notice--${kind}`} role="status">
      {kind === 'notIndexed' ? (
        <>
          <span>{t('graphRead.notIndexed')}</span>
          <Link to={managePath} className="graph-read-notice__link">
            {t('graphRead.notIndexedCta')}
          </Link>
        </>
      ) : (
        <span>
          {t('graphRead.failed')}
          {detail ? ` ${detail}` : ''}
        </span>
      )}
    </div>
  );
}
