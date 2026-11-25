/**
 * The Logic function draft: nodes, and the derivations the editor would otherwise ask people to type.
 *
 * Three things used to be authored by hand that are really consequences of the prompt:
 * the function's input schema, the node ids, and the output reference. Here they are computed, so the form can be
 * "write the prompt" and the rest of the UI can follow it.
 */

export type FieldType = 'string' | 'number' | 'integer' | 'boolean' | 'string[]';

export type OutputField = { name: string; type: FieldType; description: string };

export const FIELD_TYPES: FieldType[] = ['string', 'number', 'integer', 'boolean', 'string[]'];

export type OutputMode = 'text' | 'fields';

export type InputType = 'string' | 'number' | 'integer' | 'boolean' | 'object';

export type InputField = { name: string; type: InputType; description: string };

export const INPUT_TYPES: InputType[] = ['string', 'number', 'integer', 'boolean', 'object'];

export type NodeParam = { key: string; value: string };

export type BranchDraft = {
  /** Template that decides the branch; empty means the fallback (must be last). */
  when: string;
  nodes: ModelNode[];
};

export type ModelNode = {
  id: string;
  kind: 'model' | 'action' | 'condition';
  /** `condition` only: ordered branches, the fallback last. */
  branches: BranchDraft[];
  /** `action` only: the action type's api_name; its edits are composed, never applied here. */
  actionType: string;
  /** `action` only: parameters, each a template like `{{n1.summary}}`. */
  params: NodeParam[];
  /** Registry model id; empty means "the default chat model". */
  model_id: string;
  system: string;
  prompt: string;
  outputMode: OutputMode;
  fields: OutputField[];
  /** Raw JSON, kept for the escape hatch and to round-trip a spec the UI cannot express as fields. */
  outputSchema: string;
  tokenLimit: string;
  /** Tools this node may use: read objects, or call a published function. */
  tools: NodeTool[];
};

export type QueryTool = {
  id: string;
  kind: 'query_objects';
  object_type: string;
  /** Only these properties reach the model. Empty means "all of them", which is rarely what you want. */
  properties: string[];
  limit: number;
};

export type CallTool = {
  id: string;
  kind: 'call_function';
  /** api_name of a published function; its input schema becomes the tool's parameters. */
  function: string;
  description: string;
};

export type NodeTool = QueryTool | CallTool;

export type FlowDraft = {
  nodes: ModelNode[];
  /** Declared inputs, synced from the prompts but visible and typed — the board AIP Logic starts with. */
  inputs: InputField[];
  /** Which node answers, as `n1`; empty means the last one. */
  output: string;
};

export type FlowSpec = { nodes: Record<string, unknown>[]; output?: string };

const REFERENCE = /\{\{\s*([A-Za-z0-9_.]+)\s*\}\}/g;

export function newNode(index: number): ModelNode {
  return {
    id: `n${index + 1}`,
    kind: 'model',
    branches: [],
    actionType: '',
    params: [],
    model_id: '',
    system: '',
    prompt: '',
    outputMode: 'text',
    fields: [],
    outputSchema: '',
    tokenLimit: '',
    tools: [],
  };
}

export function emptyDraft(): FlowDraft {
  return { nodes: [newNode(0)], inputs: [], output: '' };
}

/** Open a stored spec in the editor. Kinds the editor cannot edit are dropped, never shown as editable shells. */
export function draftFromSpec(spec: unknown): FlowDraft {
  if (!spec || typeof spec !== 'object') return emptyDraft();
  const raw = (spec as FlowSpec).nodes;
  if (!Array.isArray(raw)) return emptyDraft();
  const nodes = raw
    .filter((node): node is Record<string, unknown> => Boolean(node) && typeof node === 'object')
    .filter((node) => node.kind === 'model' || node.kind === 'action' || node.kind === 'condition')
    .map((node, index) => {
      const fields = fieldsFromSchema(node.output_schema);
      const kind = (node.kind ?? 'model') as 'model' | 'action' | 'condition';
      return {
        id: String(node.id ?? `n${index + 1}`),
        kind,
        branches: kind === 'condition' ? branchesFromSpec(node.branches) : [],
        actionType: String(node.action_type ?? ''),
        params: Object.entries((node.params as Record<string, unknown>) ?? {}).map(([key, value]) => ({
          key,
          value: typeof value === 'string' ? value : JSON.stringify(value),
        })),
        model_id: String(node.model_id ?? ''),
        system: String(node.system ?? ''),
        prompt: String(node.prompt ?? ''),
        outputMode: (fields.length ? 'fields' : 'text') as OutputMode,
        fields,
        // Kept even when the fields table can express it, so opening and saving never narrows a hand-written schema.
        outputSchema: node.output_schema ? JSON.stringify(node.output_schema, null, 2) : '',
        tokenLimit: node.token_limit == null ? '' : String(node.token_limit),
        tools: toolsFromSpec(node.tools),
      };
    });
  const draft: FlowDraft = {
    nodes: nodes.length ? nodes : [newNode(0)],
    inputs: inputsFromSchema((spec as { input_schema?: unknown }).input_schema),
    output: typeof (spec as FlowSpec).output === 'string' ? String((spec as FlowSpec).output).replace(/[{}]/g, '').trim() : '',
  };
  return syncInputs(draft);
}

function inputsFromSchema(schema: unknown): InputField[] {
  if (!schema || typeof schema !== 'object') return [];
  const properties = (schema as { properties?: unknown }).properties;
  if (!properties || typeof properties !== 'object') return [];
  return Object.entries(properties as Record<string, unknown>).map(([name, definition]) => {
    const raw = definition && typeof definition === 'object' ? (definition as { type?: unknown; description?: unknown }) : {};
    const type = String(raw.type ?? 'string');
    return {
      name,
      type: (INPUT_TYPES as string[]).includes(type) ? (type as InputType) : 'string',
      description: String(raw.description ?? ''),
    };
  });
}

/**
 * Keep the input board honest: every variable a prompt mentions gets a row, and rows nothing mentions are marked —
 * not deleted, because an input can be intentional before the node that uses it exists.
 */
export function syncInputs(draft: FlowDraft): FlowDraft {
  const used = inputNames(draft);
  const next = (draft.inputs ?? []).map((field) => ({ ...field }));
  for (const name of used) {
    if (!next.some((field) => field.name.trim() === name)) {
      next.push({ name, type: 'string', description: '' });
    }
  }
  return { ...draft, inputs: next };
}

/** Input rows the prompts never reference. */
export function unusedInputs(draft: FlowDraft): string[] {
  const used = new Set(inputNames(draft));
  return (draft.inputs ?? []).map((field) => field.name.trim()).filter((name) => name && !used.has(name));
}

export type DraftResult = { spec: FlowSpec | null; errors: string[] };

/** Name a node's output can be referenced by, for the output picker. */
export function outputLabel(node: ModelNode, index: number): string {
  return `#${index + 1} · ${node.id || '—'}`;
}

/** Draft → spec. Returns errors instead of throwing, each named against the node it belongs to. */
export function specFromDraft(draft: FlowDraft): DraftResult {
  const errors: string[] = [];
  const seen = new Set<string>();
  const nodes: Record<string, unknown>[] = [];

  draft.nodes.forEach((node, index) => {
    const where = `#${index + 1}`;
    const id = node.id.trim();
    if (!id) errors.push(`${where}: an id is required`);
    else if (seen.has(id)) errors.push(`${where}: id "${id}" is used twice`);
    else seen.add(id);

    if (node.kind === 'condition') {
      if (!node.branches.length) {
        errors.push(`${where}: a condition needs at least one branch`);
      }
      const seenFallback = node.branches.findIndex((branch) => !branch.when.trim());
      if (seenFallback >= 0 && seenFallback !== node.branches.length - 1) {
        errors.push(`${where}: the fallback branch must be last`);
      }
      const branches = node.branches.map((branch, branchIndex) => {
        const nested = specFromDraft({ nodes: branch.nodes, inputs: [], output: '' });
        for (const error of nested.errors) {
          errors.push(`${where}.branch ${branchIndex + 1}${error.slice(error.indexOf(':'))}`);
        }
        return {
          ...(branch.when.trim() ? { when: branch.when } : {}),
          nodes: nested.spec?.nodes ?? [],
        };
      });
      nodes.push({ id, kind: 'condition', branches });
      return;
    }

    if (node.kind === 'action') {
      const actionType = node.actionType.trim();
      if (!actionType) errors.push(`${where}: an action type is required`);
      const params: Record<string, string> = {};
      for (const param of node.params) {
        const key = param.key.trim();
        if (!key) continue;
        params[key] = param.value;
      }
      nodes.push({ id, kind: 'action', action_type: actionType, params });
      return;
    }

    if (!node.prompt.trim()) errors.push(`${where}: a prompt is required`);

    const spec: Record<string, unknown> = { id, kind: 'model', prompt: node.prompt };
    if (node.model_id.trim()) spec.model_id = node.model_id.trim();
    if (node.system.trim()) spec.system = node.system;
    if (node.tokenLimit.trim()) {
      const limit = Number(node.tokenLimit);
      if (!Number.isInteger(limit) || limit <= 0) {
        errors.push(`${where}: token limit must be a positive integer`);
      } else spec.token_limit = limit;
    }

    const schema = outputSchemaFor(node, where, errors);
    if (schema) spec.output_schema = schema;
    const tools = toolsForSpec(node, where, errors);
    if (tools.length) spec.tools = tools;
    nodes.push(spec);
  });

  if (errors.length) return { spec: null, errors };
  const output = (draft.output ?? '').trim();
  return { spec: output ? { nodes, output: `{{${output}}}` } : { nodes }, errors: [] };
}

/** Raw JSON wins over the field table: it is the escape hatch, and it round-trips whatever was stored. */
function outputSchemaFor(
  node: ModelNode,
  where: string,
  errors: string[],
): Record<string, unknown> | null {
  if (node.outputSchema.trim()) {
    try {
      const parsed = JSON.parse(node.outputSchema) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
      errors.push(`${where}: output schema must be a JSON object`);
    } catch {
      errors.push(`${where}: output schema is not valid JSON`);
    }
    return null;
  }
  if (node.outputMode !== 'fields') return null;
  if (!node.fields.some((field) => field.name.trim())) {
    errors.push(`${where}: a structured output needs at least one named field`);
    return null;
  }
  const duplicate = duplicatedName(node.fields);
  if (duplicate) {
    errors.push(`${where}: field "${duplicate}" is used twice`);
    return null;
  }
  return schemaFromFields(node.fields);
}

function duplicatedName(fields: OutputField[]): string | null {
  const seen = new Set<string>();
  for (const field of fields) {
    const name = field.name.trim();
    if (!name) continue;
    if (seen.has(name)) return name;
    seen.add(name);
  }
  return null;
}

/** What a prompt can reference at this point: the function's inputs, and every earlier node. */
export function availableReferences(nodeIndex: number, nodes: ModelNode[]): string[] {
  return ['input', ...nodes.slice(0, nodeIndex).map((node) => node.id.trim()).filter(Boolean)];
}

/** References in a prompt that nothing before this node can resolve. */
export function unknownReferences(prompt: string, nodeIndex: number, nodes: ModelNode[]): string[] {
  const available = availableReferences(nodeIndex, nodes);
  const out: string[] = [];
  for (const match of prompt.matchAll(REFERENCE)) {
    const reference = match[1];
    const root = reference.split('.')[0];
    if (!available.includes(root) && !out.includes(reference)) out.push(reference);
  }
  return out;
}

/** Every `{{reference}}` in the draft's prompts, in the order they first appear. */
export function variablesInDraft(draft: FlowDraft): string[] {
  const out: string[] = [];
  for (const node of draft.nodes) {
    for (const match of node.prompt.matchAll(REFERENCE)) {
      if (!out.includes(match[1])) out.push(match[1]);
    }
  }
  return out;
}

/** The input field names the run panel must ask for: `input.x` → `x`, anything else is a node output. */
export function inputNames(draft: FlowDraft): string[] {
  const nodeIds = new Set(draft.nodes.map((node) => node.id.trim()));
  const out: string[] = [];
  for (const reference of variablesInDraft(draft)) {
    const [root, ...rest] = reference.split('.');
    // A reference to an earlier node is produced by the flow, so it is not something the run panel can ask for.
    if (nodeIds.has(root)) continue;
    const name = root === 'input' ? rest.join('.') : reference;
    if (!name || out.includes(name)) continue;
    out.push(name);
  }
  return out;
}

/**
 * The function's input schema follows the prompt.
 *
 * Declaring inputs twice — once as `{{email}}` in a prompt, once in an `input_schema` textarea — is what made the
 * first version feel like paperwork: type the variable, then be told the input it obviously needs is missing.
 */
export function inputSchemaFromDraft(draft: FlowDraft): Record<string, unknown> | null {
  const rows = (draft.inputs ?? [])
    .map((field) => ({ ...field, name: field.name.trim() }))
    .filter((field) => field.name);
  if (!rows.length) return null;
  const properties: Record<string, unknown> = {};
  for (const field of rows) {
    properties[field.name] = {
      type: field.type,
      ...(field.description.trim() ? { description: field.description.trim() } : {}),
    };
  }
  return { type: 'object', properties, required: rows.map((field) => field.name) };
}

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

function toolsFromSpec(raw: unknown): QueryTool[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((tool): tool is Record<string, unknown> => Boolean(tool) && typeof tool === 'object')
    .filter((tool) => tool.kind === 'query_objects')
    .map((tool, index) => ({
      id: `tool-${index}`,
      kind: 'query_objects' as const,
      object_type: String(tool.object_type ?? ''),
      properties: Array.isArray(tool.properties) ? tool.properties.map((p) => String(p)) : [],
      limit: typeof tool.limit === 'number' ? tool.limit : 5,
    }));
}

function toolsForSpec(node: ModelNode, where: string, errors: string[]): Record<string, unknown>[] {
  return node.tools.map((tool, index) => {
    if (tool.kind === 'call_function') {
      const fn = tool.function.trim();
      if (!fn) errors.push(`${where}: tool ${index + 1} needs a function`);
      return {
        kind: 'call_function',
        function: fn,
        ...(tool.description.trim() ? { description: tool.description.trim() } : {}),
      };
    }
    const objectType = tool.object_type.trim();
    if (!objectType) errors.push(`${where}: tool ${index + 1} needs an object type`);
    if (!tool.properties.some((prop) => prop.trim())) {
      errors.push(`${where}: tool ${index + 1} grants no properties (it would return whole objects)`);
    }
    if (!Number.isInteger(tool.limit) || tool.limit < 1 || tool.limit > 25) {
      errors.push(`${where}: tool ${index + 1} limit must be between 1 and 25`);
    }
    return {
      kind: 'query_objects',
      object_type: objectType,
      properties: tool.properties.map((prop) => prop.trim()).filter(Boolean),
      limit: tool.limit,
    };
  });
}

/** Input rows that the run panel cannot express as a single text field. */
export function objectInputs(draft: FlowDraft): string[] {
  return (draft.inputs ?? []).filter((field) => field.type === 'object').map((field) => field.name);
}

function branchesFromSpec(raw: unknown): BranchDraft[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((branch): branch is Record<string, unknown> => Boolean(branch) && typeof branch === 'object')
    .map((branch) => {
      const nested = draftFromSpec({ nodes: branch.nodes });
      return {
        when: typeof branch.when === 'string' ? branch.when : '',
        // A branch body cannot itself be a condition; drop anything deeper.
        nodes: nested.nodes.filter((node) => node.kind !== 'condition'),
      };
    });
}
