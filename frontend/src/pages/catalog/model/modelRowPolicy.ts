/**
 * Row-condition helpers shared by the data-resource list (create dialog) and the resource page.
 *
 * Kept out of the component file because `react-refresh/only-export-components` forbids a module
 * from exporting both a component and plain functions — and these are used by two pages.
 */
import type { RowPolicyCondition } from '../../../data/dataResourcesApi';

export type RowDraft = { column: string; op: string; value: string };

export const ROW_OPS = [
  '=',
  '!=',
  '>',
  '>=',
  '<',
  '<=',
  'like',
  'in',
  'is_null',
  'is_not_null',
];

/** Turn the row editor's strings into the policy the API validates. */
export function toPolicy(rows: RowDraft[]): RowPolicyCondition[] {
  return rows
    .filter((r) => r.column.trim())
    .map((r) => {
      if (r.op === 'is_null' || r.op === 'is_not_null') {
        return { column: r.column.trim(), op: r.op as RowPolicyCondition['op'] };
      }
      return {
        column: r.column.trim(),
        op: r.op as RowPolicyCondition['op'],
        value:
          r.op === 'in' ? r.value.split(',').map((v) => v.trim()).filter(Boolean) : r.value,
      };
    });
}

/** Persisted conditions back into the row editor's strings. */
export function toDrafts(policy: RowPolicyCondition[]): RowDraft[] {
  return policy.map((c) => ({
    column: c.column,
    op: c.op,
    value: Array.isArray(c.value)
      ? c.value.join(', ')
      : c.claim
        ? `claim:${c.claim}`
        : String(c.value ?? ''),
  }));
}

/** How a policy reads in a list: the one line a reviewer scans before clicking in. */
export function describePolicy(policy: RowPolicyCondition[]): string {
  return policy
    .map((c) => {
      const right = c.claim
        ? `claim:${c.claim}`
        : Array.isArray(c.value)
          ? c.value.join(', ')
          : String(c.value ?? '');
      return c.op === 'is_null' || c.op === 'is_not_null'
        ? `${c.column} ${c.op}`
        : `${c.column} ${c.op} ${right}`;
    })
    .join(' AND ');
}
