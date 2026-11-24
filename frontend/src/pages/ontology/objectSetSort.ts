export interface SortTerm {
  prop: string;
  desc: boolean;
}

/** `"region,-tier"` → `[{region, asc}, {tier, desc}]`. The order is the precedence: first term sorts first. */
export function parseSortList(sort: string): SortTerm[] {
  return sort
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => ({
      prop: entry.startsWith('-') ? entry.slice(1) : entry,
      desc: entry.startsWith('-'),
    }))
    .filter((term) => term.prop.length > 0);
}

export function formatSortList(terms: SortTerm[]): string {
  return terms.map((term) => `${term.desc ? '-' : ''}${term.prop}`).join(',');
}

/**
 * Clicking a column header: absent → ascending, ascending → descending, descending → gone.
 *
 * Other columns keep their terms, so a second click builds a tie-breaker instead of throwing the first one away —
 * "region, then tier" is one thought, not two.
 */
export function toggleSortTerm(sort: string, prop: string): string {
  const terms = parseSortList(sort);
  const index = terms.findIndex((term) => term.prop === prop);
  if (index < 0) return formatSortList([...terms, { prop, desc: false }]);
  const term = terms[index];
  if (!term.desc) {
    terms[index] = { prop, desc: true };
  } else {
    terms.splice(index, 1);
  }
  return formatSortList(terms);
}

/** The `n` in "sorted by this, third" — 0 when the property is not part of the sort. */
export function sortRank(sort: string, prop: string): number {
  return parseSortList(sort).findIndex((term) => term.prop === prop) + 1;
}
