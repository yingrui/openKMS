import type { OntologySchemaFieldKind, OntologySchemaFieldRef } from './ontologyFunctionsApi';

export type EditableSchemaField = {
  key: string;
  kind: OntologySchemaFieldKind;
  typeName: string;
  jsonType: string;
  isArray: boolean;
  required: boolean;
};

const X = 'x-ontology';

export function fieldsFromRelations(
  fields: OntologySchemaFieldRef[] | undefined,
  side: 'input' | 'output',
  requiredKeys: string[] = [],
): EditableSchemaField[] {
  return (fields ?? [])
    .filter((f) => f.side === side)
    .map((f) => {
      const isArray = f.path.endsWith('[]');
      const key = isArray ? f.path.slice(0, -2) : f.path;
      return {
        key,
        kind: f.kind,
        typeName: f.type_name ?? '',
        jsonType: isArray
          ? 'string'
          : (f.json_type && !f.json_type.startsWith('array') ? f.json_type : 'string'),
        isArray,
        required: requiredKeys.includes(key),
      };
    });
}

export function requiredKeysFromSchema(schema: Record<string, unknown> | null | undefined): string[] {
  const req = schema?.required;
  return Array.isArray(req) ? req.filter((k): k is string => typeof k === 'string') : [];
}

export function buildIoSchema(fields: EditableSchemaField[]): Record<string, unknown> | null {
  if (fields.length === 0) return null;
  const properties: Record<string, unknown> = {};
  const required: string[] = [];
  for (const f of fields) {
    const key = f.key.trim();
    if (!key) continue;
    const xo =
      f.kind === 'primitive'
        ? { kind: 'primitive' }
        : { kind: f.kind, type_name: f.typeName.trim() };
    if (f.isArray || f.kind !== 'primitive') {
      if (f.isArray) {
        properties[key] = {
          type: 'array',
          items: { type: 'string', [X]: xo },
          [X]: xo,
        };
      } else {
        properties[key] = { type: 'string', [X]: xo };
      }
    } else {
      properties[key] = { type: f.jsonType || 'string', [X]: xo };
    }
    if (f.required) required.push(key);
  }
  if (Object.keys(properties).length === 0) return null;
  return {
    type: 'object',
    ...(required.length ? { required } : {}),
    properties,
  };
}

export function emptyField(): EditableSchemaField {
  return { key: '', kind: 'primitive', typeName: '', jsonType: 'string', isArray: false, required: false };
}
