/** Built-in ontology Action rule types (no Function required). */

export const BUILTIN_OBJECT_RULE_TYPES = ['object_create', 'object_modify', 'object_delete'] as const;
export type BuiltinObjectRuleType = (typeof BUILTIN_OBJECT_RULE_TYPES)[number];
export const FUNCTION_RULE_TYPE = 'function' as const;

export type ActionIntentId = 'create' | 'edit' | 'delete' | 'custom';

export function isBuiltinObjectRule(ruleType: string | null | undefined): boolean {
  return (BUILTIN_OBJECT_RULE_TYPES as readonly string[]).includes(ruleType ?? '');
}

export function isRunnableAction(action: {
  status: string;
  rule_type: string;
  function_id?: string | null;
}): boolean {
  if (action.status !== 'active') return false;
  if (isBuiltinObjectRule(action.rule_type)) return true;
  return !!action.function_id;
}

export function intentToRuleType(intent: ActionIntentId): string {
  switch (intent) {
    case 'create':
      return 'object_create';
    case 'edit':
      return 'object_modify';
    case 'delete':
      return 'object_delete';
    default:
      return FUNCTION_RULE_TYPE;
  }
}

export function ruleTypeToIntent(ruleType: string): ActionIntentId | null {
  switch (ruleType) {
    case 'object_create':
      return 'create';
    case 'object_modify':
      return 'edit';
    case 'object_delete':
      return 'delete';
    default:
      return null;
  }
}

export function actionParametersDict(parameters: unknown): Record<string, unknown> {
  if (parameters && typeof parameters === 'object' && !Array.isArray(parameters)) {
    return parameters as Record<string, unknown>;
  }
  return {};
}

export function writableFieldsFromParameters(parameters: unknown): string[] {
  const fields = actionParametersDict(parameters).fields;
  if (!Array.isArray(fields)) return [];
  return fields.map((f) => String(f)).filter(Boolean);
}

export function inputSchemaFromObjectTypeProperties(
  properties: Array<{ name: string; type: string; required?: boolean }>,
  fieldNames: string[],
): Record<string, unknown> {
  const allowed = fieldNames.length
    ? new Set(fieldNames)
    : new Set(properties.map((p) => p.name));
  const props: Record<string, unknown> = {};
  const required: string[] = [];
  for (const p of properties) {
    if (!allowed.has(p.name)) continue;
    const jsonType =
      p.type === 'number' || p.type === 'integer' || p.type === 'boolean' ? p.type : 'string';
    props[p.name] = { type: jsonType };
    if (p.required) required.push(p.name);
  }
  const schema: Record<string, unknown> = { type: 'object', properties: props };
  if (required.length) schema.required = required;
  return schema;
}
