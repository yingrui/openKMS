import { useTranslation } from 'react-i18next';
import { formatMeasure, type ChartChange } from './objectSetChartsModel';

/**
 * What the action changed, chart by chart — the loop closing.
 *
 * The comparison is against the numbers that were on screen **before** the action ran, so it answers the question the
 * caller had in mind when they ticked those rows. A chart whose bars did not move is left out; if no chart moved at
 * all, that is said out loud, because "nothing changed" is a result and silence is not.
 */
export function ObjectSetActionOutcome({
  actionName,
  changed,
  changes,
  onDismiss,
}: {
  actionName: string;
  /** How many objects the action succeeded on. */
  changed: number;
  changes: ChartChange[];
  onDismiss: () => void;
}) {
  const { t } = useTranslation('explore');
  return (
    <section className="object-set-outcome" aria-live="polite">
      <header className="object-set-outcome__head">
        <p className="object-set-outcome__title">
          {t('objectSet.outcomeTitle', { name: actionName, count: changed })}
        </p>
        <button type="button" className="object-set-outcome__dismiss" onClick={onDismiss}>
          {t('objectSet.outcomeDismiss')}
        </button>
      </header>
      {changes.length === 0 ? (
        <p className="object-set-outcome__empty">{t('objectSet.outcomeNothing')}</p>
      ) : (
        <ul className="object-set-outcome__list">
          {changes.map((change) => (
            <li key={change.prop}>
              <span className="object-set-outcome__prop">{change.prop}</span>
              <span className="object-set-outcome__moves">
                {change.moved.slice(0, 4).map((move) => (
                  <span key={move.value} className="object-set-outcome__move">
                    {move.value}
                    <span className="object-set-outcome__was">{formatMeasure(move.before)}</span>
                    <span aria-hidden>→</span>
                    <span className="object-set-outcome__now">{formatMeasure(move.after)}</span>
                  </span>
                ))}
                {change.moved.length > 4 ? (
                  <span className="object-set-outcome__move">
                    {t('objectSet.outcomeMore', { count: change.moved.length - 4 })}
                  </span>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
