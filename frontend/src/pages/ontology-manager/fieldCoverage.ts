/**
 * Reconcile a dataset's **columns** with the model's **fields** — pure, because this is a judgement.
 *
 * A field is more than a column (it can be a computed expression, carry a time role and AI context),
 * so the two lists drift: a table gains a column nobody has a field for, and a field can point at a
 * column that has been dropped. Only `column_name` decides the link — a column-backed field also
 * carries an expression (`"col"`), so "has an expression" is not the test.
 */

export interface FieldLike {
  name: string;
  column_name: string | null;
}

export interface FieldCoverage {
  /** Columns of the table that no field references — the work a refresh usually turns up. */
  columnsWithoutFields: string[];
  /** Fields that reference a column the table no longer has — these break silently otherwise. */
  fieldsWithoutColumn: FieldLike[];
}

export function fieldCoverage(columns: string[], fields: FieldLike[]): FieldCoverage {
  const known = new Set(columns);
  const covered = new Set(
    fields.map((field) => field.column_name).filter((name): name is string => Boolean(name)),
  );
  return {
    columnsWithoutFields: columns.filter((column) => !covered.has(column)),
    fieldsWithoutColumn: fields.filter(
      (field) => field.column_name !== null && !known.has(field.column_name),
    ),
  };
}
