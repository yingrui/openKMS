/** Global agent skills registry and per-project installs. */
import { config } from '../config';
import { authAwareFetch, getAuthHeaders } from './apiClient';

async function parseError(res: Response): Promise<string> {
  try {
    const j = await res.json();
    if (typeof j.detail === 'string') return j.detail;
  } catch {
    /* ignore */
  }
  return res.statusText;
}

export interface AgentSkillVersion {
  id: string;
  version: string;
  uploaded_by: string | null;
  uploaded_by_name: string | null;
  content_hash: string;
  notes: string | null;
  created_at: string | null;
}

export interface AgentSkill {
  id: string;
  display_name: string;
  created_by: string | null;
  created_by_name: string | null;
  is_default: boolean;
  default_version: string | null;
  created_at: string | null;
  versions: AgentSkillVersion[];
}

export interface ProjectInstalledSkill {
  skill_id: string;
  version: string;
  content_hash: string;
  installed_at: string | null;
  installed_by: string | null;
  installed_by_name: string | null;
}

export async function listAgentSkills(): Promise<AgentSkill[]> {
  const res = await authAwareFetch(`${config.apiUrl}/api/agent-skills`, {
    headers: await getAuthHeaders(),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function fetchAgentSkill(skillId: string): Promise<AgentSkill> {
  const res = await authAwareFetch(
    `${config.apiUrl}/api/agent-skills/${encodeURIComponent(skillId)}`,
    { headers: await getAuthHeaders() },
  );
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function uploadAgentSkillZip(params: {
  skillId: string;
  version: string;
  displayName?: string;
  notes?: string;
  file: File;
}): Promise<AgentSkill> {
  const form = new FormData();
  form.append('skill_id', params.skillId);
  form.append('version', params.version);
  if (params.displayName) form.append('display_name', params.displayName);
  if (params.notes) form.append('notes', params.notes);
  form.append('archive', params.file);
  const res = await authAwareFetch(`${config.apiUrl}/api/agent-skills`, {
    method: 'POST',
    headers: await getAuthHeaders(),
    body: form,
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function uploadAgentSkillFolder(params: {
  skillId: string;
  version: string;
  displayName?: string;
  notes?: string;
  files: File[];
  relativePaths: string[];
}): Promise<AgentSkill> {
  const form = new FormData();
  form.append('skill_id', params.skillId);
  form.append('version', params.version);
  if (params.displayName) form.append('display_name', params.displayName);
  if (params.notes) form.append('notes', params.notes);
  for (let i = 0; i < params.files.length; i++) {
    form.append('files', params.files[i]);
    form.append('relative_paths', params.relativePaths[i] ?? params.files[i].name);
  }
  const res = await authAwareFetch(`${config.apiUrl}/api/agent-skills`, {
    method: 'POST',
    headers: await getAuthHeaders(),
    body: form,
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function patchAgentSkill(
  skillId: string,
  body: { display_name?: string; is_default?: boolean; default_version?: string | null },
): Promise<AgentSkill> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(`${config.apiUrl}/api/agent-skills/${encodeURIComponent(skillId)}`, {
    method: 'PATCH',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function deleteAgentSkillVersion(skillId: string, version: string): Promise<void> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(
    `${config.apiUrl}/api/agent-skills/${encodeURIComponent(skillId)}/versions/${encodeURIComponent(version)}`,
    { method: 'DELETE', headers },
  );
  if (!res.ok) throw new Error(await parseError(res));
}

export async function deleteAgentSkill(skillId: string): Promise<void> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(
    `${config.apiUrl}/api/agent-skills/${encodeURIComponent(skillId)}`,
    { method: 'DELETE', headers },
  );
  if (!res.ok) throw new Error(await parseError(res));
}

export async function listProjectSkills(projectId: string): Promise<ProjectInstalledSkill[]> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(`${config.apiUrl}/api/projects/${projectId}/skills`, { headers });
  if (!res.ok) throw new Error(await parseError(res));
  const data = (await res.json()) as { installed: ProjectInstalledSkill[] };
  return data.installed ?? [];
}

export async function installProjectSkill(
  projectId: string,
  skillId: string,
  version?: string,
): Promise<ProjectInstalledSkill> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(
    `${config.apiUrl}/api/projects/${projectId}/skills/${encodeURIComponent(skillId)}/install`,
    {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ version: version ?? null }),
    },
  );
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function uninstallProjectSkill(projectId: string, skillId: string): Promise<void> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(
    `${config.apiUrl}/api/projects/${projectId}/skills/${encodeURIComponent(skillId)}`,
    { method: 'DELETE', headers },
  );
  if (!res.ok) throw new Error(await parseError(res));
}

export function shortHash(hash: string): string {
  if (hash.length <= 12) return hash;
  return `${hash.slice(0, 8)}…`;
}
