/**
 * The Logic function draft: a list of nodes and the small amount of structure around them.
 *
 * A draft is the UI's shape for `flow_spec`. Keeping the translation in one file means the editor never invents
 * fields the backend does not understand, and a spec written by an agent (or a future import) opens in the editor.
 */

export type ModelNode = {
  id: string;
  kind: 'model';
  /** Registry model id; empty means "the default chat model". */
  model_id: string;
  system: string;
  prompt: string;
  /** Raw JSON text so a half-typed object does not blow up the form. */
  outputSchema: string;
  tokenLimit: string;
};

export type FlowDraft = {
  nodes: ModelNode[];
  /** `{{n1}}` style; empty means "the last node's output". */
  output: string;
};

export type FlowSpec = {
  nodes: Record<string, unknown>[];
  output?: string;
};

const REFERENCE = /\{\{\s*([A-Za-z0-9_.]+)\s*\}\}/g;

export function newNode(index: number): ModelNode {
  return {
    id: `n${index + 1}`,
    kind: 'model',
    model_id: '',
    system: '',
    prompt: '',
    outputSchema: '',
    tokenLimit: '',
  };
}

export function emptyDraft(): FlowDraft {
  return { nodes: [newNode(0)], output: '' };
}

/** Open a stored spec in the editor. Unknown node kinds are dropped here, never shown as editable. */
export function draftFromSpec(spec: unknown): FlowDraft {
  if (!spec || typeof spec !== 'object') return emptyDraft();
  const raw = (spec as FlowSpec).nodes;
  if (!Array.isArray(raw)) return emptyDraft();
  const nodes = raw
    .filter((node): node is Record<string, unknown> => Boolean(node) && typeof node === 'object')
    .filter((node) => node.kind === 'model')
    .map((node, index) => ({
      id: String(node.id ?? `n${index + 1}`),
      kind: 'model' as const,
      model_id: String(node.model_id ?? ''),
      system: String(node.system ?? ''),
      prompt: String(node.prompt ?? ''),
      outputSchema: node.output_schema ? JSON.stringify(node.output_schema, null, 2) : '',
      tokenLimit: node.token_limit == null ? '' : String(node.token_limit),
    }));
  const output = typeof (spec as FlowSpec).output === 'string' ? String((spec as FlowSpec).output) : '';
  return { nodes: nodes.length ? nodes : [newNode(0)], output };
}

export type DraftResult = { spec: FlowSpec | null; errors: string[] };

/** Draft → spec. Returns errors instead of throwing, so the form can show them next to the node. */
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

    if (!node.prompt.trim()) errors.push(`${where}: a prompt is required`);

    const spec: Record<string, unknown> = { id, kind: 'model', prompt: node.prompt };
    if (node.model_id.trim()) spec.model_id = node.model_id.trim();
    if (node.system.trim()) spec.system = node.system;
    if (node.tokenLimit.trim()) {
      const limit = Number(node.tokenLimit);
      if (!Number.isInteger(limit) || limit <= 0) errors.push(`${where}: token limit must be a positive integer`);
      else spec.token_limit = limit;
    }
    if (node.outputSchema.trim()) {
      try {
        const parsed = JSON.parse(node.outputSchema);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          errors.push(`${where}: output schema must be a JSON object`);
        } else spec.output_schema = parsed;
      } catch {
        errors.push(`${where}: output schema is not valid JSON`);
      }
    }
    nodes.push(spec);
  });

  if (errors.length) return { spec: null, errors };
  return { spec: draft.output.trim() ? { nodes, output: draft.output.trim() } : { nodes }, errors: [] };
}

/** What a prompt can reference: the function's inputs, and every earlier node. */
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
