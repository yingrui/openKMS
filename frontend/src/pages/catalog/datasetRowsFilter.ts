import type { DatasetRowFilter } from '../../data/datasetsApi';

/**
 * The Data tab's grid filters: one `column · operator · value` per condition, AND-ed.
 *
 * Kept out of the component so the rules are testable — the URL is user-editable, and a mismatch
 * between what the grid writes and what it reads is how the Playground crashed once.
 *
 * Operators come from the shared vocabulary (`= != > >= < <= like in between is_null is_not_null`);
 * `contains` / `starts with` / `ends with` are UI sugar over `like`, so the API never learns a new
 * operator.
 */

/** One editable condition. `id` is local (React key + focus), the rest is the query. */
export type FilterRow = {
  id: number;
  column: string;
  op: string;
  value: string;
  value2: string;
};

export type ColumnKind = 'text' | 'number' | 'date' | 'boolean';

export type OperatorDef = {
  /** Stable id: what the select shows and what the URL stores. */
  id: string;
  /** What the API receives. */
  apiOp: string;
  /** How many value inputs the row shows. */
  values: 'one' | 'two' | 'none' | 'list';
  /** For the sugar operators: how the value is wrapped before it becomes `like`. */
  like?: 'contains' | 'startsWith' | 'endsWith';
};

/** Every operator the grid offers, in the order a filter bar usually reads. */
export const OPERATORS: OperatorDef[] = [
  { id: '=', apiOp: '=', values: 'one' },
  { id: '!=', apiOp: '!=', values: 'one' },
  { id: 'contains', apiOp: 'like', values: 'one', like: 'contains' },
  { id: 'startsWith', apiOp: 'like', values: 'one', like: 'startsWith' },
  { id: 'endsWith', apiOp: 'like', values: 'one', like: 'endsWith' },
  { id: 'in', apiOp: 'in', values: 'list' },
  { id: '>', apiOp: '>', values: 'one' },
  { id: '>=', apiOp: '>=', values: 'one' },
  { id: '<', apiOp: '<', values: 'one' },
  { id: '<=', apiOp: '<=', values: 'one' },
  { id: 'between', apiOp: 'between', values: 'two' },
  { id: 'isNull', apiOp: 'is_null', values: 'none' },
  { id: 'isNotNull', apiOp: 'is_not_null', values: 'none' },
];

const BY_ID = new Map(OPERATORS.map((o) => [o.id, o]));

/** Operators that make sense for a column of this type — comparing text with `>` rarely helps. */
export function operatorsFor(kind: ColumnKind): OperatorDef[] {
  const ids: Record<ColumnKind, string[]> = {
    text: ['=', '!=', 'contains', 'startsWith', 'endsWith', 'in', 'isNull', 'isNotNull'],
    number: ['=', '!=', '>', '>=', '<', '<=', 'between', 'isNull', 'isNotNull'],
    date: ['=', 'between', '>', '>=', '<', '<=', 'isNull', 'isNotNull'],
    boolean: ['=', 'isNull', 'isNotNull'],
  };
  return ids[kind].map((id) => BY_ID.get(id)!).filter(Boolean);
}

export function operatorDef(id: string): OperatorDef {
  return BY_ID.get(id) ?? OPERATORS[0];
}

/** Column type → the browser's kind (anything unknown behaves like text). */
export function columnKind(ontologyType: string | null | undefined): ColumnKind {
  if (ontologyType === 'number') return 'number';
  if (ontologyType === 'date' || ontologyType === 'datetime') return 'date';
  if (ontologyType === 'boolean') return 'boolean';
  return 'text';
}

function likeValue(sugar: NonNullable<OperatorDef['like']>, value: string): string {
  if (sugar === 'contains') return `%${value}%`;
  if (sugar === 'startsWith') return `${value}%`;
  return `%${value}`;
}

/** The value a row currently carries, shaped for the API (or `undefined` when it is incomplete). */
function valueFor(def: OperatorDef, row: FilterRow): DatasetRowFilter['value'] | undefined {
  if (def.values === 'none') return undefined;
  if (def.values === 'two') return row.value && row.value2 ? [row.value, row.value2] : undefined;
  if (def.values === 'list') {
    const parts = row.value.split(',').map((v) => v.trim()).filter(Boolean);
    return parts.length > 0 ? parts : undefined;
  }
  if (def.like) return row.value ? likeValue(def.like, row.value) : undefined;
  return row.value ? row.value : undefined;
}

/**
 * Editor rows → the API's filters. A row is dropped until it is complete (a column and an operator
 * and, where the operator needs one, a value), so the grid never sends half a condition.
 */
export function toApiFilters(rows: FilterRow[]): DatasetRowFilter[] {
  const out: DatasetRowFilter[] = [];
  for (const row of rows) {
    if (!row.column || !row.op) continue;
    const def = operatorDef(row.op);
    const value = valueFor(def, row);
    if (def.values !== 'none' && value === undefined) continue;
    out.push(value === undefined ? { field: row.column, op: def.apiOp } : { field: row.column, op: def.apiOp, value });
  }
  return out;
}

/**
 * The filter set in the URL (short tuples: `[[column, operator, value, value2], …]`) and back.
 * Anything malformed is ignored rather than crashing the grid.
 */
export function filtersToParam(rows: FilterRow[]): string {
  const tuples = rows
    .filter((row) => row.column && row.op)
    .map((row) => [row.column, row.op, row.value, row.value2]);
  return JSON.stringify(tuples);
}

export function filtersFromParam(raw: string | null): FilterRow[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((entry): entry is unknown[] => Array.isArray(entry))
      .map((entry, index) => ({
        id: index,
        column: typeof entry[0] === 'string' ? entry[0] : '',
        op: typeof entry[1] === 'string' && BY_ID.has(entry[1]) ? entry[1] : '=',
        value: entry[2] === undefined || entry[2] === null ? '' : String(entry[2]),
        value2: entry[3] === undefined || entry[3] === null ? '' : String(entry[3]),
      }))
      .filter((row) => row.column !== '');
  } catch {
    return [];
  }
}

/** A fresh row for the "add filter" button. */
export function newFilterRow(id: number, column = ''): FilterRow {
  return { id, column, op: column ? '=' : '=', value: '', value2: '' };
}
