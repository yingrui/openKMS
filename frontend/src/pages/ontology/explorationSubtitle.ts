import type { ObjectTypeResponse } from '../../data/ontologyApi';

/**
 * The three facts a reader needs before trusting the screen: what the type is for, how large the set is, and how fresh
 * the mirror is. Written once so the page body is about behaviour, not string joining.
 */
export function explorationSubtitle(
  objectType: ObjectTypeResponse,
  total: number | null,
  t: (key: string, options?: Record<string, unknown>) => string
): string | undefined {
  /* The size of the set is stated exactly once, here: a second copy elsewhere is the same fact twice and readers
     start looking for the difference. */
  if (total === null) return objectType.description ?? undefined;
  const asOf = objectType.last_indexed_at
    ? t('objectSet.dataAsOf', { time: new Date(objectType.last_indexed_at).toLocaleString() })
    : t('objectSet.neverIndexed');
  return [objectType.description, t('objectSet.objectCount', { count: total }), asOf]
    .filter(Boolean)
    .join(' · ');
}
