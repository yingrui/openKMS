/** Global agent skills registry and per-project installs. */
import { request } from './apiClient';

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
  return request<AgentSkill[]>('/api/agent-skills');
}

export async function fetchAgentSkill(skillId: string): Promise<AgentSkill> {
  return request<AgentSkill>(`/api/agent-skills/${encodeURIComponent(skillId)}`);
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
  return request<AgentSkill>('/api/agent-skills', { method: 'POST', body: form });
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
  return request<AgentSkill>('/api/agent-skills', { method: 'POST', body: form });
}

export async function patchAgentSkill(
  skillId: string,
  body: { display_name?: string; is_default?: boolean; default_version?: string | null },
): Promise<AgentSkill> {
  return request<AgentSkill>(`/api/agent-skills/${encodeURIComponent(skillId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export async function deleteAgentSkillVersion(skillId: string, version: string): Promise<void> {
  return request<void>(
    `/api/agent-skills/${encodeURIComponent(skillId)}/versions/${encodeURIComponent(version)}`,
    { method: 'DELETE' },
  );
}

export async function deleteAgentSkill(skillId: string): Promise<void> {
  return request<void>(`/api/agent-skills/${encodeURIComponent(skillId)}`, { method: 'DELETE' });
}

export async function listProjectSkills(projectId: string): Promise<ProjectInstalledSkill[]> {
  const data = await request<{ installed: ProjectInstalledSkill[] }>(`/api/projects/${projectId}/skills`);
  return data.installed ?? [];
}

export async function installProjectSkill(
  projectId: string,
  skillId: string,
  version?: string,
): Promise<ProjectInstalledSkill> {
  return request<ProjectInstalledSkill>(
    `/api/projects/${projectId}/skills/${encodeURIComponent(skillId)}/install`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ version: version ?? null }),
    },
  );
}

export async function uninstallProjectSkill(projectId: string, skillId: string): Promise<void> {
  return request<void>(`/api/projects/${projectId}/skills/${encodeURIComponent(skillId)}`, {
    method: 'DELETE',
  });
}

export function shortHash(hash: string): string {
  if (hash.length <= 12) return hash;
  return `${hash.slice(0, 8)}…`;
}
