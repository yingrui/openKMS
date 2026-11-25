import type { ObjectRefSpec } from './ObjectRefPicker';

export interface SelectionRow {
  id: string;
  data?: Record<string, unknown> | null;
}

export interface RefOption {
  value: string;
  label: string;
}

/**
 * The parameter asks for a property of another object; the selection already holds those objects.
 *
 * So "who is this about?" is answered from what the reader ticked, not by searching the type again — the exploration
 * already did that work. The value is the property the action declared; the label is the one the reader recognises.
 */
export function refOptionsFromSelection(
  spec: ObjectRefSpec,
  selectionTypeId: string,
  rows: SelectionRow[]
): RefOption[] {
  if (spec.type_id !== selectionTypeId) return [];
  return rows
    .map((row) => {
      const value = row.data?.[spec.property];
      if (value === null || value === undefined || value === '') return null;
      const label = row.data?.[spec.label_property] ?? value;
      return { value: String(value), label: String(label) };
    })
    .filter((option): option is RefOption => option !== null);
}

/**
 * A single-valued reference with exactly one ticked object is already answered.
 *
 * With several ticked, guessing would be the "which one did you mean?" problem the criteria work tried to remove —
 * so the picker lists them and the reader says which.
 */
export function refPrefillFromSelection(
  spec: ObjectRefSpec,
  selectionTypeId: string,
  rows: SelectionRow[]
): RefOption | null {
  const options = refOptionsFromSelection(spec, selectionTypeId, rows);
  return options.length === 1 ? options[0] : null;
}
