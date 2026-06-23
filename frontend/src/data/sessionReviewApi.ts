/** Session review and lessons API (`/api/projects`). */
import { config } from '../config';
import { authAwareFetch, getAuthHeaders } from './apiClient';
import { readNdjsonStream } from './ndjsonStream';

async function parseError(res: Response): Promise<string> {
  try {
    const j = await res.json();
    if (typeof j.detail === 'string') return j.detail;
  } catch {
    /* ignore */
  }
  return res.statusText;
}

export interface LessonEvent {
  type: 'error' | 'lesson' | 'pattern';
  severity: 'low' | 'medium' | 'high';
  context: string;
  what_went_wrong: string;
  what_fixed_it: string | null;
  message_ids: string[];
}

export interface LessonEventWithState extends LessonEvent {
  id: string;
  status: 'pending' | 'approved' | 'rejected';
  session_id: string;
  timestamp: string;
}

export async function reviewSession(
  projectId: string,
  convId: string,
): Promise<LessonEvent[]> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(
    `${config.apiUrl}/api/projects/${projectId}/conversations/${convId}/review`,
    { method: 'POST', headers, credentials: 'include' },
  );
  if (!res.ok) throw new Error(await parseError(res));
  const data = await res.json();
  return (data.events ?? []) as LessonEvent[];
}

export async function getLessons(projectId: string): Promise<LessonEventWithState[]> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(
    `${config.apiUrl}/api/projects/${projectId}/lessons`,
    { headers, credentials: 'include' },
  );
  if (!res.ok) throw new Error(await parseError(res));
  return (await res.json()) as LessonEventWithState[];
}

export async function putLessons(
  projectId: string,
  lessons: LessonEventWithState[],
): Promise<void> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(
    `${config.apiUrl}/api/projects/${projectId}/lessons`,
    {
      method: 'PUT',
      headers: { ...headers, 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(lessons),
    },
  );
  if (!res.ok) throw new Error(await parseError(res));
}

export interface ArtifactFile {
  path: string;
  content: string;
}

export async function getArtifacts(projectId: string): Promise<ArtifactFile[]> {
  // AGENTS.md and MEMORY.md are read via standard file content API
  const files: ArtifactFile[] = [];
  for (const path of ['AGENTS.md', 'MEMORY.md']) {
    try {
      const headers = await getAuthHeaders();
      const res = await authAwareFetch(
        `${config.apiUrl}/api/projects/${projectId}/files/content?path=${encodeURIComponent(path)}`,
        { headers, credentials: 'include' },
      );
      if (res.ok) {
        const data = await res.json();
        files.push({ path, content: data.content ?? '' });
      } else if (res.status === 404) {
        files.push({ path, content: '' });
      }
    } catch {
      files.push({ path, content: '' });
    }
  }
  return files;
}

export async function saveArtifact(
  projectId: string,
  path: string,
  content: string,
): Promise<void> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(
    `${config.apiUrl}/api/projects/${projectId}/files/content`,
    {
      method: 'PUT',
      headers: { ...headers, 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ path, content }),
    },
  );
  if (!res.ok) throw new Error(await parseError(res));
}

export async function chatImprovements(
  projectId: string,
  message: string,
): Promise<string> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(
    `${config.apiUrl}/api/projects/${projectId}/improvements/chat`,
    {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ message }),
    },
  );
  if (!res.ok) throw new Error(await parseError(res));
  const data = await res.json();
  return data.response as string;
}

export type ImprovementStreamEvent =
  | { type: 'delta'; t: string }
  | { type: 'tool_start'; run_id: string; name: string; input: string }
  | { type: 'tool_end'; run_id: string; name: string; output: string }
  | { type: 'tool_error'; run_id: string; name: string; error: string }
  | { type: 'error'; detail: string }
  | { type: 'done' };

export async function chatImprovementsStream(
  projectId: string,
  message: string,
  onEvent: (ev: ImprovementStreamEvent) => void,
): Promise<void> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(
    `${config.apiUrl}/api/projects/${projectId}/improvements/chat`,
    {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ message }),
    },
  );
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(errText || res.statusText);
  }
  if (!res.body) throw new Error('No response body');
  await readNdjsonStream<ImprovementStreamEvent>(res.body, onEvent);
}

let _idCounter = 0;

export function makeEventId(): string {
  return `ev-${Date.now().toString(36)}-${(_idCounter++).toString(36)}`;
}

/** Construct a session review path. */
export function sessionReviewPath(projectId: string, sessionId: string): string {
  return `/projects/${projectId}/sessions/${sessionId}/review`;
}
