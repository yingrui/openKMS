/** The condition vocabulary the object-set URL carries: `f=<prop>:<op>:<value>`. */

/** Operators the API accepts; `in` takes a comma-separated list. */
export const FILTER_OPS = ['eq', 'ne', 'contains', 'in', 'gt', 'ge', 'lt', 'le'] as const;
export type FilterOp = (typeof FILTER_OPS)[number];

export function formatFilter(prop: string, op: FilterOp, value: string): string {
  return `${prop}:${op}:${value}`;
}

/** `<prop>:<op>:<value>` → its three parts, or null when the text is not a condition we wrote. */
export function parseFilterText(
  text: string
): { prop: string; op: string; value: string } | null {
  const [prop, op, ...rest] = text.split(':');
  if (!prop || !op || rest.length === 0) return null;
  return { prop, op, value: rest.join(':') };
}
