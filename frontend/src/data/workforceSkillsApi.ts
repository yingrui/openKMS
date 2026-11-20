/**
 * Workforce skills — the registry digital employees install instruction packages from.
 *
 * Separate from `agentSkillsApi` (Agent Project's registry) on purpose: here a skill is written and
 * published inside the product, so it has a draft, versions and a lifecycle. Agent Project's skills
 * are uploaded archives and never appear in these calls.
 */

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const detail = body && typeof body.detail === 'string' ? body.detail : res.statusText;
    throw new Error(detail || `Request failed: ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/** Sends a JSON body. Serialised here so no call site carries an inline `JSON.stringify`. */
function send<T>(method: string, path: string, payload?: unknown): Promise<T> {
  const body = payload === undefined ? undefined : JSON.stringify(payload);
  return request<T>(path, { method, body });
}

export interface WorkforceSkillVersion {
  version: string;
  status: 'published' | 'deprecated' | 'draft';
  size_bytes: number;
  content_hash: string | null;
  entrypoint: string | null;
  subcommands: string[];
  published_at: string | null;
  published_by_name: string | null;
}

export interface WorkforceSkillListItem {
  id: string;
  name: string;
  description: string | null;
  latest_version: string | null;
  latest_status: 'published' | 'deprecated' | null;
  has_draft: boolean;
  updated_at: string | null;
}

export interface WorkforceSkillDetail {
  id: string;
  name: string;
  description: string | null;
  has_draft: boolean;
  draft_version: string;
  files: Record<string, string>;
  entrypoint: string | null;
  subcommands: string[];
  /** Publish refuses on these; the editor shows them above the versions. */
  blocking: string[];
  warnings: string[];
  versions: WorkforceSkillVersion[];
  updated_at: string | null;
}

export async function listWorkforceSkillRegistry(): Promise<WorkforceSkillListItem[]> {
  const body = await request<{ items: WorkforceSkillListItem[] }>('/api/workforce/skills');
  return body.items;
}

export function getWorkforceSkill(id: string): Promise<WorkforceSkillDetail> {
  return request<WorkforceSkillDetail>(`/api/workforce/skills/${encodeURIComponent(id)}`);
}

export function createWorkforceSkill(input: {
  id: string;
  name?: string;
  description?: string;
}): Promise<WorkforceSkillDetail> {
  return send<WorkforceSkillDetail>('POST', '/api/workforce/skills', input);
}

export function writeWorkforceSkillFile(
  id: string,
  path: string,
  content: string,
): Promise<WorkforceSkillDetail> {
  return send<WorkforceSkillDetail>(
    'PUT',
    `/api/workforce/skills/${encodeURIComponent(id)}/draft/file`,
    { path, content },
  );
}

export function deleteWorkforceSkillFile(id: string, path: string): Promise<WorkforceSkillDetail> {
  return send<WorkforceSkillDetail>(
    'DELETE',
    `/api/workforce/skills/${encodeURIComponent(id)}/draft/file`,
    { path },
  );
}

export function publishWorkforceSkill(id: string): Promise<WorkforceSkillDetail> {
  return request<WorkforceSkillDetail>(`/api/workforce/skills/${encodeURIComponent(id)}/publish`, {
    method: 'POST',
  });
}

export function deprecateWorkforceSkillVersion(
  id: string,
  version: string,
): Promise<WorkforceSkillDetail> {
  return request<WorkforceSkillDetail>(
    `/api/workforce/skills/${encodeURIComponent(id)}/versions/${encodeURIComponent(version)}/deprecate`,
    { method: 'POST' },
  );
}
