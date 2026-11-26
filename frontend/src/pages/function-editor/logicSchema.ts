/**
 * The structured-output field table and the JSON Schema it produces.
 *
 * Kept apart from the flow draft because the two answer different questions: what an author writes (fields with names,
 * types, descriptions) and what the model is held to (a schema). Only this file knows how the second is derived.
 */

export type FieldType = 'string' | 'number' | 'integer' | 'boolean' | 'string[]';

export type OutputField = { name: string; type: FieldType; description: string };

export const FIELD_TYPES: FieldType[] = ['string', 'number', 'integer', 'boolean', 'string[]'];

export function fieldsFromSchema(schema: unknown): OutputField[] {
  if (!schema || typeof schema !== 'object') return [];
  const properties = (schema as { properties?: unknown }).properties;
  if (!properties || typeof properties !== 'object') return [];
  return Object.entries(properties as Record<string, unknown>).map(([name, definition]) => ({
    name,
    type: jsonSchemaToType(definition),
    description:
      definition && typeof definition === 'object'
        ? String((definition as { description?: unknown }).description ?? '')
        : '',
  }));
}

export function schemaFromFields(fields: OutputField[]): Record<string, unknown> | null {
  const rows = fields.filter((field) => field.name.trim());
  if (!rows.length) return null;
  const properties: Record<string, unknown> = {};
  for (const field of rows) {
    properties[field.name.trim()] = {
      ...typeToJsonSchema(field.type),
      ...(field.description.trim() ? { description: field.description.trim() } : {}),
    };
  }
  return { type: 'object', properties, required: rows.map((field) => field.name.trim()) };
}

function typeToJsonSchema(type: FieldType): Record<string, unknown> {
  if (type === 'string[]') return { type: 'array', items: { type: 'string' } };
  return { type };
}

function jsonSchemaToType(schema: unknown): FieldType {
  if (!schema || typeof schema !== 'object') return 'string';
  const raw = schema as { type?: unknown };
  if (raw.type === 'array') return 'string[]';
  const primitive = String(raw.type ?? 'string');
  return (FIELD_TYPES as string[]).includes(primitive) ? (primitive as FieldType) : 'string';
}
