/**
 * Whether one row may be edited in place.
 *
 * The backend decides this when it runs the action; the table needs the same answer *before* the pen appears, and it
 * already holds the row — so the condition is evaluated here as well. The two must agree on the grammar, which is why
 * this supports exactly the operators an object-set filter does.
 */
type Comparison = (actual: unknown, expected: string) => boolean;

const asNumber = (value: unknown): number | null => {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const OPS: Record<string, Comparison> = {
  eq: (actual, expected) => String(actual ?? '') === expected,
  ne: (actual, expected) => String(actual ?? '') !== expected,
  gt: (actual, expected) => {
    const left = asNumber(actual);
    const right = asNumber(expected);
    return left !== null && right !== null && left > right;
  },
  ge: (actual, expected) => {
    const left = asNumber(actual);
    const right = asNumber(expected);
    return left !== null && right !== null && left >= right;
  },
  lt: (actual, expected) => {
    const left = asNumber(actual);
    const right = asNumber(expected);
    return left !== null && right !== null && left < right;
  },
  le: (actual, expected) => {
    const left = asNumber(actual);
    const right = asNumber(expected);
    return left !== null && right !== null && left <= right;
  },
  in: (actual, expected) =>
    expected.split(',').map((entry) => entry.trim()).includes(String(actual ?? '')),
  contains: (actual, expected) => String(actual ?? '').includes(expected),
  is_null: (actual) => actual === null || actual === undefined || actual === '',
  is_not_null: (actual) => !(actual === null || actual === undefined || actual === ''),
};

/**
 * `status:eq:proposed` against a row's data. An empty condition list means "no restriction" — an action without
 * criteria applies to every row, which is the same answer the backend gives.
 */
export function rowSatisfies(row: Record<string, unknown>, criteria: string[]): boolean {
  return criteria.every((text) => {
    const [prop, op, ...rest] = text.split(':');
    const compare = OPS[op ?? ''];
    if (!prop || !compare) return true;
    const expected = rest.join(':');
    return compare(row[prop], expected);
  });
}
