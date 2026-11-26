import { useEffect, useState } from 'react';
import { fetchObjectInstances, type ObjectInstanceResponse } from '../../data/ontologyApi';

export interface CompareRows {
  label: string;
  rows: ObjectInstanceResponse[];
  total: number;
}

/**
 * The comparison set's rows.
 *
 * A comparison that only changes the charts leaves "and which objects are in the other set?" unanswered, so the table
 * shows both. The baseline is fetched with the same page size and search as the current set — the difference between
 * them is the conditions, and nothing else.
 */
export function useCompareRows({
  typeId,
  compareSet,
  search,
  limit,
}: {
  typeId: string;
  compareSet: { filters: string[]; label: string } | null;
  search: string;
  limit: number;
}): CompareRows | null {
  /* Keyed by what produced it, so "no comparison" is derived rather than set to null inside the effect — a
     synchronous setState in an effect body renders twice for no reason. */
  const [loaded, setLoaded] = useState<{ key: string; rows: CompareRows } | null>(null);
  const key = compareSet ? [typeId, limit, search, compareSet.label, ...compareSet.filters].join('|') : '';

  useEffect(() => {
    if (!typeId || !compareSet) return;
    let cancelled = false;
    void fetchObjectInstances(typeId, {
      search: search.trim() || undefined,
      filters: compareSet.filters,
      limit,
    })
      .then((res) => {
        if (!cancelled) {
          setLoaded({ key, rows: { label: compareSet.label, rows: res.items, total: res.total } });
        }
      })
      .catch(() => {
        if (!cancelled) setLoaded(null);
      });
    return () => {
      cancelled = true;
    };
  }, [compareSet, key, limit, search, typeId]);

  return loaded?.key === key ? loaded.rows : null;
}
