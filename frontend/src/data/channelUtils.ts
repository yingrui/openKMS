/** Utilities for channel trees. No mock data - channels come from API. */

/** Field definition for schema editor (used when building JSON Schema). */
export interface ExtractionSchemaField {
  key: string;
  label: string;
  type: string;
  description?: string;
  required?: boolean;
  enum?: string[];
}

/** Display field for metadata (label, type for rendering). */
export interface ExtractionSchemaDisplayField {
  key: string;
  label: string;
  type: string;
  enum?: string[];
}

/** extraction_schema is stored as JSON Schema dict (type/object, properties, required, fieldOrder) or legacy array. */
export type ExtractionSchemaValue =
  | { type: 'object'; properties: Record<string, Record<string, unknown>>; required?: string[]; fieldOrder?: string[] }
  | ExtractionSchemaField[];

export interface ChannelNode {
  id: string;
  name: string;
  description?: string | null;
  pipeline_id?: string | null;
  auto_process?: boolean;
  extraction_model_id?: string | null;
  /** JSON Schema dict or legacy array. Dict format: { type, properties, required }. */
  extraction_schema?: ExtractionSchemaValue | null;
  children?: ChannelNode[];
}

/** Normalize extraction_schema (dict or legacy array) to display fields for DocumentDetail. */
export function normalizeExtractionSchemaToFields(
  schema: ExtractionSchemaValue | null | undefined
): ExtractionSchemaDisplayField[] {
  if (!schema) return [];
  if (Array.isArray(schema)) {
    return schema.map((f) => ({
      key: f.key,
      label: f.label || f.key,
      type: f.type || 'string',
    }));
  }
  const props = schema.properties;
  if (!props || typeof props !== 'object') return [];
  const required = new Set(schema.required || []);
  const order = schema.fieldOrder;
  const keys: string[] =
    order && Array.isArray(order)
      ? [...order.filter((k) => k in props), ...Object.keys(props).filter((k) => !order.includes(k))]
      : Object.keys(props);
  return keys.map((key) => {
    const prop = props[key] as Record<string, unknown>;
    const hasEnum = Array.isArray(prop?.enum);
    let type = hasEnum ? 'enum' : (prop?.type as string) || 'string';
    if (type === 'string' && prop?.format === 'date') type = 'date';
    return {
      key,
      label: (prop?.title as string) || key,
      type: type === 'array' ? 'array' : type,
      ...(hasEnum && { enum: prop.enum as string[] }),
    };
  });
}

/** Get ordered keys from extraction_schema for metadata display/edit. */
export function getExtractionSchemaKeys(
  schema: ExtractionSchemaValue | null | undefined
): string[] {
  const fields = normalizeExtractionSchemaToFields(schema);
  return fields.map((f) => f.key);
}

/** Convert stored extraction_schema to field list for schema editor. */
export function extractionSchemaToEditorFields(
  schema: ExtractionSchemaValue | null | undefined
): ExtractionSchemaField[] {
  if (!schema) return [];
  if (Array.isArray(schema)) return schema;
  const props = schema.properties;
  if (!props || typeof props !== 'object') return [];
  const required = new Set(schema.required || []);
  const order = schema.fieldOrder;
  const keys: string[] =
    order && Array.isArray(order)
      ? [...order.filter((k) => k in props), ...Object.keys(props).filter((k) => !order.includes(k))]
      : Object.keys(props);
  return keys.map((key) => {
    const p = props[key] as Record<string, unknown>;
    const hasEnum = Array.isArray(p?.enum);
    let type = hasEnum ? 'enum' : (p?.type as string) || 'string';
    if (type === 'string' && p?.format === 'date') type = 'date';
    return {
      key,
      label: (p?.title as string) || key,
      type,
      description: (p?.description as string) || '',
      required: required.has(key),
      enum: hasEnum ? (p.enum as string[]) : undefined,
    };
  });
}

/** Build JSON Schema dict from editor fields for saving. Includes fieldOrder to preserve order (JSONB does not). */
export function editorFieldsToJsonSchema(
  fields: ExtractionSchemaField[]
): { type: 'object'; properties: Record<string, Record<string, unknown>>; required: string[]; fieldOrder: string[] } | null {
  if (fields.length === 0) return null;
  const properties: Record<string, Record<string, unknown>> = {};
  const required: string[] = [];
  const fieldOrder: string[] = [];
  for (const f of fields) {
    const key = f.key?.trim();
    if (!key) continue;
    fieldOrder.push(key);
    let prop: Record<string, unknown>;
    if (f.type === 'date') {
      prop = { type: 'string', format: 'date' };
    } else if (f.type === 'array') {
      prop = { type: 'array', items: { type: 'string' } };
    } else if (f.type === 'integer') {
      prop = { type: 'integer' };
    } else if (f.type === 'number') {
      prop = { type: 'number' };
    } else if (f.type === 'boolean') {
      prop = { type: 'boolean' };
    } else if (f.type === 'enum' && Array.isArray(f.enum) && f.enum.length > 0) {
      prop = { type: 'string', enum: f.enum };
    } else {
      prop = { type: 'string' };
    }
    if (f.label) prop.title = f.label;
    if (f.description) prop.description = f.description;
    properties[key] = prop;
    if (f.required) required.push(key);
  }
  if (Object.keys(properties).length === 0) return null;
  return { type: 'object', properties, required, fieldOrder };
}

/** Find a channel by ID in the tree. */
export function findChannel(nodes: ChannelNode[], targetId: string): ChannelNode | null {
  for (const node of nodes) {
    if (node.id === targetId) return node;
    if (node.children) {
      const found = findChannel(node.children, targetId);
      if (found) return found;
    }
  }
  return null;
}

/** Collect all leaf channel IDs under a channel (or the channel itself if it's a leaf) */
function collectLeafIds(nodes: ChannelNode[], targetId: string, found: string[]): boolean {
  for (const node of nodes) {
    if (node.id === targetId) {
      if (!node.children || node.children.length === 0) {
        found.push(node.id);
      } else {
        collectLeafIdsRec(node.children, found);
      }
      return true;
    }
    if (node.children && collectLeafIds(node.children, targetId, found)) {
      return true;
    }
  }
  return false;
}

function collectLeafIdsRec(nodes: ChannelNode[], found: string[]): void {
  for (const node of nodes) {
    if (!node.children || node.children.length === 0) {
      found.push(node.id);
    } else {
      collectLeafIdsRec(node.children, found);
    }
  }
}

export function getDocumentLeafChannelIds(channels: ChannelNode[], channelId: string): string[] {
  const found: string[] = [];
  collectLeafIds(channels, channelId, found);
  return found.length > 0 ? found : [channelId];
}

function findChannelName(nodes: ChannelNode[], targetId: string): string | null {
  for (const node of nodes) {
    if (node.id === targetId) return node.name;
    if (node.children) {
      const found = findChannelName(node.children, targetId);
      if (found) return found;
    }
  }
  return null;
}

export function getDocumentChannelName(channels: ChannelNode[], channelId: string): string {
  return findChannelName(channels, channelId) ?? channelId;
}

function findChannelDescription(nodes: ChannelNode[], targetId: string): string | null {
  for (const node of nodes) {
    if (node.id === targetId) return (node.description ?? '').trim() || null;
    if (node.children) {
      const found = findChannelDescription(node.children, targetId);
      if (found) return found;
    }
  }
  return null;
}

export function getDocumentChannelDescription(channels: ChannelNode[], channelId: string): string | null {
  return findChannelDescription(channels, channelId);
}

/** Get first leaf channel ID from tree (for default selection). Returns null if empty. */
export function getFirstLeafChannelId(channels: ChannelNode[]): string | null {
  for (const node of channels) {
    if (!node.children || node.children.length === 0) return node.id;
    const found = getFirstLeafChannelId(node.children);
    if (found) return found;
  }
  return null;
}

/** Flatten channel tree to list of { id, name, depth } for display. */
export function flattenChannels(
  nodes: ChannelNode[],
  depth = 0
): { id: string; name: string; depth: number }[] {
  const out: { id: string; name: string; depth: number }[] = [];
  for (const n of nodes) {
    out.push({ id: n.id, name: n.name, depth });
    if (n.children?.length) {
      out.push(...flattenChannels(n.children, depth + 1));
    }
  }
  return out;
}
