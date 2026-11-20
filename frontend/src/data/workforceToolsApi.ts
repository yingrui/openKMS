/**
 * The runtime's tools, read from the service that owns them.
 *
 * A tool's name, description and parameters are the function-calling contract. This screen shows that contract
 * rather than a hand-written summary of it: a second copy in the UI is what drifts when a tool changes.
 */

export interface ToolParameterSchema {
  type?: string;
  properties?: Record<string, { type?: string; description?: string }>;
  required?: string[];
}

export interface RuntimeTool {
  name: string;
  description: string;
  parameters: ToolParameterSchema;
}

export interface ToolCapability {
  id: string;
  name: string;
  /** Enabled when the agent enables nothing. */
  core: boolean;
  tools: RuntimeTool[];
}

export interface CodeExecutionPolicy {
  cwd: string;
  writable: string;
  builtin_allow: string[];
  timeout_seconds: number;
  /** `additive`: an agent may extend the built-in allow list, never shrink it. */
  allowlist: 'additive' | string;
}

export interface ToolCatalog {
  capabilities: ToolCapability[];
  environment: {
    id: string;
    name: string;
    tools: RuntimeTool[];
    policy: CodeExecutionPolicy;
  };
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
