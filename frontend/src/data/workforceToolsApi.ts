/**
 * The runtime's tools, read from the service that owns them.
 *
 * A tool's name, description and parameters are the function-calling contract. This screen shows that contract
 * rather than a hand-written summary of it: a second copy in the UI is what drifts when a tool changes.
 */

export interface ToolParameter {
  type?: string;
  description?: string;
  anyOf?: { type?: string }[];
  default?: unknown;
}

export interface ToolParameterSchema {
  type?: string;
  properties?: Record<string, ToolParameter>;
  required?: string[];
}

export interface RuntimeTool {
  /** Stable id a stored selection names (`catalog.sql`). It survives a rename of the function. */
  id: string;
  /** The callable name — what appears in a tool call and in a trace. */
  name: string;
  /** A display name when the callable name is not the clearest heading (e.g. `Python` for `run_python`). */
  label?: string;
  description: string;
  parameters: ToolParameterSchema;
}

/** A capability grouped by what it touches. The order is the runtime's. */
export interface ToolGroup {
  id: string;
  name: string;
  name_zh?: string;
}

export interface ToolCapability {
  id: string;
  name: string;
  /** One line on what the capability is for. Display only — never sent to the model. */
  summary?: string;
  /** Which group it belongs to (`knowledge`, `data`, `files`, `runtime`). */
  group: string;
  /** What must be bound on the agent before it can do anything (`semantic_model`, `ontology_group`). */
  requires: string[];
  /** Enabled when the agent enables nothing. */
  core: boolean;
  tools: RuntimeTool[];
  /** Limits that belong to this capability (only code execution has them today). */
  policy?: CodeExecutionPolicy;
}

export interface CodeExecutionPolicy {
  cwd: string;
  writable: string;
  timeout_seconds: number;
  /** The command allow list constrains exactly the tools named here, not the whole capability. */
  allowlist: {
    /** `run_command` — `run_python` runs code, so no command allow list can constrain it. */
    tools: string[];
    builtin_allow: string[];
    /** An agent may extend the built-in set, never shrink it. */
    additive: boolean;
  };
}

export interface ToolCatalog {
  groups: ToolGroup[];
  capabilities: ToolCapability[];
}

export async function fetchToolCatalog(): Promise<ToolCatalog> {
  const res = await fetch('/api/workforce/tools', { credentials: 'include' });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const detail = body && typeof body.detail === 'string' ? body.detail : res.statusText;
    throw new Error(detail || `Request failed: ${res.status}`);
  }
  return (await res.json()) as ToolCatalog;
}
