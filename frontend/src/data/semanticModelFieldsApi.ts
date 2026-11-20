/** API for semantic-model fields (model-scoped: column ref / expression + role). */
import { request } from './apiClient';

export interface SemanticModelFieldDialect {
  dialect: string;
  expression: string;
}

/** The spec's `Dimension`: `{is_time}` and nothing else. */
export interface SemanticModelFieldDimension {
  /** Ours, not the spec's: the calendar this time dimension's periods belong to. */
  period_kind?: 'day' | 'week' | 'month' | 'quarter' | 'year' | 'custom';
  period_format?: string | null;
  is_time?: boolean;
}

/** The spec's `DataType` enum — the only values a field's `datatype` may take. */
export const OSSIE_DATATYPES = [
  'String',
  'Integer',
  'Decimal',
  'Float',
  'Boolean',
  'Date',
  'Time',
  'DateTime',
  'DateTimeTz',
  'Opaque',
] as const;

/**
 * A dataset column's canonical ontology type collapsed number to `number`; a field's `datatype` has to be one
 * of `OSSIE_DATATYPES`. The source type is what tells an integer from a decimal.
 */
export function fieldDatatypeForColumn(meta: {
  data_type: string;
  ontology_type: string;
}): (typeof OSSIE_DATATYPES)[number] {
  const ontology = meta.ontology_type.toLowerCase();
  const source = meta.data_type.toLowerCase();
  if (ontology === 'date') return 'Date';
  if (ontology === 'datetime') return /tz|timestamp with/.test(source) ? 'DateTimeTz' : 'DateTime';
  if (ontology === 'boolean') return 'Boolean';
  if (ontology === 'uuid') return 'String';
  if (ontology === 'number') {
    if (/int|serial|bigint|smallint/.test(source)) return 'Integer';
    if (/numeric|decimal|money/.test(source)) return 'Decimal';
    return 'Float';
  }
  return 'String';
}

/** Ossie datatypes that make a field a time dimension unless `is_time` says otherwise. */
export const TEMPORAL_DATATYPES = new Set([
  'date',
  'time',
  'datetime',
  'datetimetz',
  'timestamp',
  'timestamptz',
]);

export const isTemporalDatatype = (datatype?: string | null): boolean =>
  TEMPORAL_DATATYPES.has((datatype ?? '').trim().toLowerCase());

/** The effective time-dimension role. The server resolves it from the field's override, the datatype and the
 *  column's `time_format` — a `%G-W%V` text column is a week — so the client reads the answer instead of
 *  re-deriving it (the datatype fallback is only for payloads that predate the field). */
export const isTimeDimension = (field: {
  dimension: SemanticModelFieldDimension | null;
  datatype?: string | null;
  /** Effective role, resolved by the server (override → column `time_format` → datatype). */
  is_time?: boolean | null;
}): boolean => {
  if (typeof field.is_time === 'boolean') return field.is_time;
  const isTime = field.dimension?.is_time;
  return typeof isTime === 'boolean' ? isTime : isTemporalDatatype(field.datatype);
};

export interface SemanticModelFieldResponse {
  id: string;
  semantic_model_id: string;
  dataset_id: string;
  name: string;
  column_name: string | null;
  expression: { dialects?: SemanticModelFieldDialect[] } | null;
  datatype: string | null;
  label: string | null;
  description: string | null;
  dimension: SemanticModelFieldDimension | null
  /** Effective role, resolved by the server (override → column `time_format` → datatype). */
  is_time?: boolean
  period_kind?: string | null;
  ai_context: Record<string, unknown> | null;
  ordinal: number;
  created_at: string;
  updated_at: string;
}

export interface SemanticModelFieldListResponse {
  items: SemanticModelFieldResponse[];
  total: number;
}

export interface SemanticModelFieldPayload {
  dataset_id: string;
  name: string;
  column_name: string | null;
  expression: { dialects?: SemanticModelFieldDialect[] } | null;
  datatype: string | null;
  label: string | null;
  description: string | null;
  dimension: SemanticModelFieldDimension | null
  /** Effective role, resolved by the server (override → column `time_format` → datatype). */
  is_time?: boolean
  period_kind?: string | null;
  ai_context: Record<string, unknown> | null;
}

export async function fetchModelFields(modelId: string): Promise<SemanticModelFieldListResponse> {
  return request<SemanticModelFieldListResponse>(`/api/semantic-models/${modelId}/fields`);
}

export async function createModelField(
  modelId: string,
  data: SemanticModelFieldPayload,
): Promise<SemanticModelFieldResponse> {
  return request<SemanticModelFieldResponse>(`/api/semantic-models/${modelId}/fields`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export async function updateModelField(
  modelId: string,
  fieldId: string,
  data: Partial<SemanticModelFieldPayload>,
): Promise<SemanticModelFieldResponse> {
  return request<SemanticModelFieldResponse>(`/api/semantic-models/${modelId}/fields/${fieldId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export async function deleteModelField(modelId: string, fieldId: string): Promise<void> {
  return request<void>(`/api/semantic-models/${modelId}/fields/${fieldId}`, { method: 'DELETE' });
}

/** The ANSI_SQL fragment of a field expression, for display. */
export function fieldExpressionSql(field: SemanticModelFieldResponse): string {
  const d = field.expression?.dialects;
  if (Array.isArray(d)) return d.find((x) => x.dialect === 'ANSI_SQL')?.expression ?? field.column_name ?? '';
  return field.column_name ?? '';
}
