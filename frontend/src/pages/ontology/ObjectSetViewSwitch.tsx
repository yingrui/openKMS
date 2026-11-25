import { useTranslation } from 'react-i18next';

/**
 * The same object set, drawn or listed.
 *
 * It reads "Charts / Table" rather than naming a perspective, because that is the choice in front of the reader —
 * and the count travels with the table so the two are not mistaken for different sets.
 */
export function ObjectSetViewSwitch({
  perspective,
  total,
  onChange,
}: {
  perspective: 'explore' | 'results';
  total: number | null;
  onChange: (next: 'explore' | 'results') => void;
}) {
  const { t } = useTranslation('explore');
  return (
    <>
      {(['explore', 'results'] as const).map((mode) => (
        <button
          key={mode}
          type="button"
          className="btn btn-secondary btn-sm object-set-viewbar__button"
          aria-pressed={perspective === mode}
          onClick={() => onChange(mode)}
        >
          {mode === 'explore'
            ? t('objectSet.viewExplore')
            : total === null
              ? t('objectSet.viewResults')
              : t('objectSet.viewResultsCount', { count: total })}
        </button>
      ))}
    </>
  );
}
