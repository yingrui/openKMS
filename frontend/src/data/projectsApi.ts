/** Agent workspace projects API (`/api/projects`). */
import { config } from '../config';
import { request, requestRaw } from './apiClient';
import type { AgentConversationResponse, AgentMessageItem } from './agentApi';
import { readNdjsonStream } from './ndjsonStream';

function handleNetworkError(e: unknown): never {
  if (e instanceof TypeError && e.message === 'Failed to fetch') {
    throw new Error(`Cannot connect to backend at ${config.apiUrl}. Is it running?`);
  }
  throw e;
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

export interface ProjectListResponse {
  items: ProjectResponse[];
  total: number;
  limit: number;
  offset: number;
}

export async function listProjects(params?: {
  limit?: number;
  offset?: number;
}): Promise<ProjectListResponse> {
  return request<ProjectListResponse>('/api/projects', {
    query: { limit: params?.limit, offset: params?.offset },
  });
}

export async function listAllProjects(): Promise<ProjectResponse[]> {
  const merged: ProjectResponse[] = [];
  let offset = 0;
  const limit = 200;
  let total = 0;
  do {
    const page = await listProjects({ limit, offset });
    merged.push(...page.items);
    total = page.total;
    offset += limit;
  } while (offset < total);
  return merged;
}

export async function createProject(body: {
  name: string;
  description?: string;
  slug?: string;
}): Promise<ProjectResponse> {
  return request<ProjectResponse>('/api/projects', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export async function getProject(id: string): Promise<ProjectResponse> {
  return request<ProjectResponse>(`/api/projects/${id}`);
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
  return request<ProjectResponse>(`/api/projects/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export async function listProjectFiles(projectId: string, path = ''): Promise<{ path: string; entries: ProjectFileEntry[] }> {
  return request<{ path: string; entries: ProjectFileEntry[] }>(`/api/projects/${projectId}/files`, {
    query: { path: path || undefined },
  });
}

export async function getProjectFileContent(
  projectId: string,
  path: string,
): Promise<{ path: string; content: string | null; is_binary: boolean; size: number }> {
  return request<{ path: string; content: string | null; is_binary: boolean; size: number }>(
    `/api/projects/${projectId}/files/content`,
    { query: { path } },
  );
}

function joinProjectPath(dir: string, filePath: string): string {
  const d = dir.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
  const f = filePath.replace(/\\/g, '/').replace(/^\/+/, '');
  return d ? `${d}/${f}` : f;
}

/** Relative path for upload; folder picks keep the selected folder name and nested paths. */
export function projectUploadRelativePath(file: File, folderPick: boolean): string {
  const webkit =
    'webkitRelativePath' in file
      ? (file as File & { webkitRelativePath?: string }).webkitRelativePath
      : undefined;
  const raw = folderPick && webkit ? webkit : file.name;
  return raw.replace(/\\/g, '/').replace(/^\/+/, '');
}

export async function uploadProjectFileAtPath(
  projectId: string,
  file: File,
  relativePath: string,
): Promise<{ path: string }> {
  const fd = new FormData();
  fd.append('file', file, relativePath.replace(/\\/g, '/'));
  return request<{ path: string }>(`/api/projects/${projectId}/files/upload`, { method: 'POST', body: fd });
}

export async function uploadProjectFile(projectId: string, file: File, path = ''): Promise<{ path: string }> {
  const relativePath = joinProjectPath(path, projectUploadRelativePath(file, false));
  return uploadProjectFileAtPath(projectId, file, relativePath);
}

export async function uploadProjectFiles(
  projectId: string,
  files: readonly File[],
  cwd: string,
  folderPick: boolean,
): Promise<{ uploaded: number; failed: number }> {
  let uploaded = 0;
  let failed = 0;
  for (const file of files) {
    try {
      const relativePath = joinProjectPath(cwd, projectUploadRelativePath(file, folderPick));
      await uploadProjectFileAtPath(projectId, file, relativePath);
      uploaded += 1;
    } catch {
      failed += 1;
    }
  }
  return { uploaded, failed };
}

export async function deleteProjectFile(projectId: string, path: string): Promise<void> {
  return request<void>(`/api/projects/${projectId}/files`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path }),
  });
}

export async function listProjectConversations(projectId: string): Promise<AgentConversationResponse[]> {
  return request<AgentConversationResponse[]>(`/api/projects/${projectId}/conversations`);
}

export async function createProjectConversation(
  projectId: string,
  title?: string,
): Promise<AgentConversationResponse> {
  return request<AgentConversationResponse>(`/api/projects/${projectId}/conversations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: title ?? null }),
  });
}

export async function deleteProjectConversation(projectId: string, convId: string): Promise<void> {
  return request<void>(`/api/projects/${projectId}/conversations/${convId}`, { method: 'DELETE' });
}

export async function updateProjectConversation(
  projectId: string,
  convId: string,
  body: { title: string },
): Promise<AgentConversationResponse> {
  return request<AgentConversationResponse>(`/api/projects/${projectId}/conversations/${convId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export async function suggestProjectConversationTitle(
  projectId: string,
  convId: string,
): Promise<AgentConversationResponse> {
  return request<AgentConversationResponse>(
    `/api/projects/${projectId}/conversations/${convId}/suggest-title`,
    { method: 'POST' },
  );
}

/** Remove this message and all later messages; user can resend from the input. */
export async function truncateProjectMessagesFromMessage(
  projectId: string,
  convId: string,
  messageId: string,
): Promise<{ deleted: number }> {
  return request<{ deleted: number }>(
    `/api/projects/${projectId}/conversations/${encodeURIComponent(convId)}/messages/from/${encodeURIComponent(messageId)}`,
    { method: 'DELETE' },
  );
}

export async function listProjectMessages(
  projectId: string,
  convId: string,
  opts?: { limit?: number; offset?: number },
): Promise<{ items: AgentMessageItem[]; total: number }> {
  const data = await request<{ items: AgentMessageItem[]; total: number }>(
    `/api/projects/${projectId}/conversations/${convId}/messages`,
    {
      query: {
        limit: opts?.limit ?? 50,
        offset: opts?.offset && opts.offset > 0 ? opts.offset : undefined,
      },
    },
  );
  return { items: data.items, total: data.total };
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
  | { type: 'error'; detail: string; message: AgentMessageItem }
  | { type: 'done'; assistant: AgentMessageItem };

export async function postProjectMessageStream(
  projectId: string,
  convId: string,
  content: string,
  opts?: { mode?: 'plan' | 'agent'; sessionId?: string },
  onEvent?: (ev: ProjectStreamEvent) => void,
): Promise<AgentMessageItem | null> {
  try {
    const res = await requestRaw(`/api/projects/${projectId}/conversations/${convId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content,
        stream: true,
        mode: opts?.mode ?? 'agent',
        session_id: opts?.sessionId ?? null,
      }),
    });
    if (!res.body) throw new Error('No response body');
    let assistant: AgentMessageItem | null = null;
    await readNdjsonStream<ProjectStreamEvent>(res.body, (ev) => {
      onEvent?.(ev);
      if (ev.type === 'done') assistant = ev.assistant;
      if (ev.type === 'error') assistant = ev.message;
    });
    return assistant;
  } catch (e) {
    handleNetworkError(e);
  }
}

export async function resumeProjectInterrupt(
  projectId: string,
  convId: string,
  body: { decision: string; edited_args?: Record<string, unknown>; message?: string },
  onEvent?: (ev: ProjectStreamEvent) => void,
): Promise<AgentMessageItem | null> {
  try {
    const res = await requestRaw(`/api/projects/${projectId}/conversations/${convId}/messages/resume`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.body) throw new Error('No response body');
    let assistant: AgentMessageItem | null = null;
    await readNdjsonStream<ProjectStreamEvent>(res.body, (ev) => {
      onEvent?.(ev);
      if (ev.type === 'done') assistant = ev.assistant;
      if (ev.type === 'error') assistant = ev.message;
    });
    return assistant;
  } catch (e) {
    handleNetworkError(e);
  }
}

export async function gitInit(projectId: string): Promise<void> {
  return request<void>(`/api/projects/${projectId}/git/init`, { method: 'POST' });
}

export async function gitStatus(projectId: string): Promise<{ entries: GitStatusEntry[]; branch: string | null }> {
  return request<{ entries: GitStatusEntry[]; branch: string | null }>(`/api/projects/${projectId}/git/status`);
}

export async function gitLog(projectId: string): Promise<{ entries: GitLogEntry[] }> {
  return request<{ entries: GitLogEntry[] }>(`/api/projects/${projectId}/git/log`);
}

export async function gitCommit(projectId: string, message: string, paths?: string[]): Promise<void> {
  return request<void>(`/api/projects/${projectId}/git/commit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, paths: paths ?? null }),
  });
}

export async function getProjectSettings(projectId: string): Promise<Record<string, unknown>> {
  return request<Record<string, unknown>>(`/api/projects/${projectId}/settings`);
}

export async function patchProjectSettings(
  projectId: string,
  patch: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  return request<Record<string, unknown>>(`/api/projects/${projectId}/settings`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
}

export async function listGitCredentials(): Promise<UserGitCredential[]> {
  return request<UserGitCredential[]>('/api/user/git-credentials');
}

export async function createGitCredential(body: {
  provider: string;
  label: string;
  username: string;
  token: string;
  scopes_hint?: string;
}): Promise<UserGitCredential> {
  return request<UserGitCredential>('/api/user/git-credentials', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export async function deleteGitCredential(id: string): Promise<void> {
  return request<void>(`/api/user/git-credentials/${id}`, { method: 'DELETE' });
}

export async function gitPull(projectId: string, credentialId: string): Promise<void> {
  return request<void>(`/api/projects/${projectId}/git/pull`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: '', credential_id: credentialId }),
  });
}

export async function gitPush(projectId: string, credentialId: string): Promise<void> {
  return request<void>(`/api/projects/${projectId}/git/push`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: '', credential_id: credentialId }),
  });
}
