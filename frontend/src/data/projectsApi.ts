/** Agent workspace projects API (`/api/projects`). */
import { config } from '../config';
import { getAuthHeaders, authAwareFetch } from './apiClient';
import type { AgentConversationResponse, AgentMessageItem } from './agentApi';

async function parseError(res: Response): Promise<string> {
  try {
    const j = await res.json();
    if (typeof j.detail === 'string') return j.detail;
  } catch {
    /* ignore */
  }
  return res.statusText;
}

export interface ProjectResponse {
  id: string;
  user_sub: string;
  name: string;
  description: string | null;
  slug: string;
  settings: Record<string, unknown>;
  git_initialized: boolean;
  created_at: string;
  updated_at: string;
}

export interface ProjectFileEntry {
  name: string;
  path: string;
  is_dir: boolean;
  size: number | null;
  modified_at: string | null;
}

export interface GitStatusEntry {
  path: string;
  status: string;
}

export interface GitLogEntry {
  hash: string;
  message: string;
  author: string;
  date: string;
}

export interface UserGitCredential {
  id: string;
  provider: string;
  label: string;
  username: string;
  scopes_hint: string | null;
  created_at: string;
  updated_at: string;
}

const CONV_KEY_PREFIX = 'openkms_project_agent_conversation_v1_';

export function getStoredProjectConversationId(projectId: string): string | null {
  if (typeof sessionStorage === 'undefined') return null;
  try {
    return sessionStorage.getItem(CONV_KEY_PREFIX + projectId);
  } catch {
    return null;
  }
}

export function setStoredProjectConversationId(projectId: string, convId: string | null): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    const key = CONV_KEY_PREFIX + projectId;
    if (convId) sessionStorage.setItem(key, convId);
    else sessionStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

/** SPA route for a project workspace, optionally with an active session. */
export function projectWorkspacePath(projectId: string, sessionId?: string | null): string {
  if (sessionId) return `/projects/${projectId}/sessions/${sessionId}`;
  return `/projects/${projectId}`;
}

export async function listProjects(): Promise<ProjectResponse[]> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(`${config.apiUrl}/api/projects`, { headers, credentials: 'include' });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function createProject(body: {
  name: string;
  description?: string;
  slug?: string;
}): Promise<ProjectResponse> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(`${config.apiUrl}/api/projects`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function getProject(id: string): Promise<ProjectResponse> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(`${config.apiUrl}/api/projects/${id}`, { headers, credentials: 'include' });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function updateProject(
  id: string,
  body: {
    name?: string;
    description?: string | null;
    slug?: string;
    settings?: Record<string, unknown>;
  },
): Promise<ProjectResponse> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(`${config.apiUrl}/api/projects/${id}`, {
    method: 'PATCH',
    headers: { ...headers, 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function listProjectFiles(projectId: string, path = ''): Promise<{ path: string; entries: ProjectFileEntry[] }> {
  const headers = await getAuthHeaders();
  const q = path ? `?path=${encodeURIComponent(path)}` : '';
  const res = await authAwareFetch(`${config.apiUrl}/api/projects/${projectId}/files${q}`, {
    headers,
    credentials: 'include',
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function getProjectFileContent(
  projectId: string,
  path: string,
): Promise<{ path: string; content: string | null; is_binary: boolean; size: number }> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(
    `${config.apiUrl}/api/projects/${projectId}/files/content?path=${encodeURIComponent(path)}`,
    { headers, credentials: 'include' },
  );
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function uploadProjectFile(projectId: string, file: File, path = ''): Promise<{ path: string }> {
  const headers = await getAuthHeaders();
  const fd = new FormData();
  fd.append('file', file);
  const q = path ? `?path=${encodeURIComponent(path)}` : '';
  const res = await authAwareFetch(`${config.apiUrl}/api/projects/${projectId}/files/upload${q}`, {
    method: 'POST',
    headers,
    credentials: 'include',
    body: fd,
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function listProjectConversations(projectId: string): Promise<AgentConversationResponse[]> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(`${config.apiUrl}/api/projects/${projectId}/conversations`, {
    headers,
    credentials: 'include',
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function createProjectConversation(
  projectId: string,
  title?: string,
): Promise<AgentConversationResponse> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(`${config.apiUrl}/api/projects/${projectId}/conversations`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ title: title ?? null }),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function deleteProjectConversation(projectId: string, convId: string): Promise<void> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(`${config.apiUrl}/api/projects/${projectId}/conversations/${convId}`, {
    method: 'DELETE',
    headers,
    credentials: 'include',
  });
  if (!res.ok) throw new Error(await parseError(res));
}

export async function updateProjectConversation(
  projectId: string,
  convId: string,
  body: { title: string },
): Promise<AgentConversationResponse> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(`${config.apiUrl}/api/projects/${projectId}/conversations/${convId}`, {
    method: 'PATCH',
    headers: { ...headers, 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function suggestProjectConversationTitle(
  projectId: string,
  convId: string,
): Promise<AgentConversationResponse> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(
    `${config.apiUrl}/api/projects/${projectId}/conversations/${convId}/suggest-title`,
    {
      method: 'POST',
      headers,
      credentials: 'include',
    },
  );
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function listProjectMessages(
  projectId: string,
  convId: string,
): Promise<AgentMessageItem[]> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(
    `${config.apiUrl}/api/projects/${projectId}/conversations/${convId}/messages?limit=500`,
    { headers, credentials: 'include' },
  );
  if (!res.ok) throw new Error(await parseError(res));
  const data = await res.json();
  return data.items as AgentMessageItem[];
}

export type ProjectStreamEvent =
  | { type: 'user'; message: AgentMessageItem }
  | { type: 'delta'; t: string }
  | { type: 'tool_start'; run_id: string; name: string; input: string }
  | { type: 'tool_end'; run_id: string; name: string; output: string }
  | { type: 'tool_error'; run_id: string; name: string; error: string }
  | { type: 'todo'; todos: unknown[] }
  | { type: 'interrupt'; interrupt: Record<string, unknown> }
  | { type: 'subagent_start'; name: string }
  | { type: 'subagent_end'; name: string }
  | { type: 'fatal'; message: string }
  | { type: 'done'; assistant: AgentMessageItem };

export async function postProjectMessageStream(
  projectId: string,
  convId: string,
  content: string,
  opts?: { mode?: 'plan' | 'agent'; sessionId?: string },
  onEvent?: (ev: ProjectStreamEvent) => void,
): Promise<AgentMessageItem | null> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(
    `${config.apiUrl}/api/projects/${projectId}/conversations/${convId}/messages`,
    {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        content,
        stream: true,
        mode: opts?.mode ?? 'agent',
        session_id: opts?.sessionId ?? null,
      }),
    },
  );
  if (!res.ok) throw new Error(await parseError(res));
  const reader = res.body?.getReader();
  if (!reader) throw new Error('No response body');
  const dec = new TextDecoder();
  let buf = '';
  let assistant: AgentMessageItem | null = null;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.trim()) continue;
      const ev = JSON.parse(line) as ProjectStreamEvent;
      onEvent?.(ev);
      if (ev.type === 'done') assistant = ev.assistant;
    }
  }
  return assistant;
}

export async function resumeProjectInterrupt(
  projectId: string,
  convId: string,
  body: { decision: string; edited_args?: Record<string, unknown>; message?: string },
  onEvent?: (ev: ProjectStreamEvent) => void,
): Promise<AgentMessageItem | null> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(
    `${config.apiUrl}/api/projects/${projectId}/conversations/${convId}/messages/resume`,
    {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(body),
    },
  );
  if (!res.ok) throw new Error(await parseError(res));
  const reader = res.body?.getReader();
  if (!reader) throw new Error('No response body');
  const dec = new TextDecoder();
  let buf = '';
  let assistant: AgentMessageItem | null = null;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.trim()) continue;
      const ev = JSON.parse(line) as ProjectStreamEvent;
      onEvent?.(ev);
      if (ev.type === 'done') assistant = ev.assistant;
    }
  }
  return assistant;
}

export async function gitInit(projectId: string): Promise<void> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(`${config.apiUrl}/api/projects/${projectId}/git/init`, {
    method: 'POST',
    headers,
    credentials: 'include',
  });
  if (!res.ok) throw new Error(await parseError(res));
}

export async function gitStatus(projectId: string): Promise<{ entries: GitStatusEntry[]; branch: string | null }> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(`${config.apiUrl}/api/projects/${projectId}/git/status`, {
    headers,
    credentials: 'include',
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function gitLog(projectId: string): Promise<{ entries: GitLogEntry[] }> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(`${config.apiUrl}/api/projects/${projectId}/git/log`, {
    headers,
    credentials: 'include',
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function gitCommit(projectId: string, message: string, paths?: string[]): Promise<void> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(`${config.apiUrl}/api/projects/${projectId}/git/commit`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ message, paths: paths ?? null }),
  });
  if (!res.ok) throw new Error(await parseError(res));
}

export async function getProjectSettings(projectId: string): Promise<Record<string, unknown>> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(`${config.apiUrl}/api/projects/${projectId}/settings`, {
    headers,
    credentials: 'include',
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function patchProjectSettings(
  projectId: string,
  patch: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(`${config.apiUrl}/api/projects/${projectId}/settings`, {
    method: 'PATCH',
    headers: { ...headers, 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function listGitCredentials(): Promise<UserGitCredential[]> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(`${config.apiUrl}/api/user/git-credentials`, {
    headers,
    credentials: 'include',
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function createGitCredential(body: {
  provider: string;
  label: string;
  username: string;
  token: string;
  scopes_hint?: string;
}): Promise<UserGitCredential> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(`${config.apiUrl}/api/user/git-credentials`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function deleteGitCredential(id: string): Promise<void> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(`${config.apiUrl}/api/user/git-credentials/${id}`, {
    method: 'DELETE',
    headers,
    credentials: 'include',
  });
  if (!res.ok) throw new Error(await parseError(res));
}

export async function gitPull(projectId: string, credentialId: string): Promise<void> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(`${config.apiUrl}/api/projects/${projectId}/git/pull`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ url: '', credential_id: credentialId }),
  });
  if (!res.ok) throw new Error(await parseError(res));
}

export async function gitPush(projectId: string, credentialId: string): Promise<void> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(`${config.apiUrl}/api/projects/${projectId}/git/push`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ url: '', credential_id: credentialId }),
  });
  if (!res.ok) throw new Error(await parseError(res));
}
