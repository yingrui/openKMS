import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { fetchExploration, filterTexts } from '../../data/explorationsApi';

export interface CompareSet {
  filters: string[];
  label: string;
}

/**
 * What the charts are compared against, read from `?vs=`.
 *
 * `all` is the widest baseline ("is this group unusual?"); an exploration id is the specific one ("is this scenario
 * better than last week's?"). The baseline is a set, not a filter — its conditions are its own, so the two sets may
 * overlap and an object in both counts in both.
 */
export function useObjectSetCompare(): { target: string; set: CompareSet | null } {
  const { t } = useTranslation('explore');
  const [searchParams] = useSearchParams();
  const target = searchParams.get('vs') ?? '';
  /* Only the fetched baseline is state: "everyone" is a fact about the URL, not something to store and keep in sync. */
  const [fetched, setFetched] = useState<{ id: string; set: CompareSet } | null>(null);

  useEffect(() => {
    if (!target || target === 'all') return;
    let cancelled = false;
    void fetchExploration(target)
      .then((row) => {
        if (!cancelled) {
          setFetched({ id: target, set: { filters: filterTexts(row.filters), label: row.name } });
        }
      })
      .catch(() => {
        if (!cancelled) setFetched(null);
      });
    return () => {
      cancelled = true;
    };
  }, [target]);

  if (!target) return { target, set: null };
  if (target === 'all') {
    return { target, set: { filters: [], label: t('objectSet.compareAll') } };
  }
  return { target, set: fetched?.id === target ? fetched.set : null };
}
