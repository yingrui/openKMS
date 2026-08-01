/** Session review and lessons API (`/api/projects`). */
import { config } from '../config';
import { authAwareFetch, getAuthHeaders, request, requestRaw } from './apiClient';
import { readNdjsonStream } from './ndjsonStream';

export interface LessonEvent {
  type: 'error' | 'lesson' | 'pattern' | 'skill_candidate';
  severity: 'low' | 'medium' | 'high';
  context: string;
  what_went_wrong: string;
  what_fixed_it: string | null;
  message_ids: string[];
  occurrence_count?: number;
  session_ids?: string[];
  source_message_ids?: string[];
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
  const data = await request<{ events?: LessonEvent[] }>(
    `/api/projects/${projectId}/conversations/${convId}/review`,
    { method: 'POST' },
  );
  return data.events ?? [];
}

export async function getLessons(projectId: string): Promise<LessonEventWithState[]> {
  return request<LessonEventWithState[]>(`/api/projects/${projectId}/lessons`);
}

export async function putLessons(
  projectId: string,
  lessons: LessonEventWithState[],
): Promise<void> {
  return request<void>(`/api/projects/${projectId}/lessons`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(lessons),
  });
}

export interface ArtifactFile {
  path: string;
  content: string;
}

export async function getArtifacts(projectId: string): Promise<ArtifactFile[]> {
  const files: ArtifactFile[] = [];
  const headers = await getAuthHeaders();
  const base = `${config.apiUrl}/api/projects/${projectId}`;

  // AGENTS.md and MEMORY.md
  for (const path of ['AGENTS.md', 'MEMORY.md']) {
    try {
      const res = await authAwareFetch(
        `${base}/files/content?path=${encodeURIComponent(path)}`,
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

  // Skills from .openkms/skills/<name>/SKILL.md
  try {
    const listRes = await authAwareFetch(
      `${base}/files?path=${encodeURIComponent('.openkms/skills')}`,
      { headers, credentials: 'include' },
    );
    if (listRes.ok) {
      const listData = await listRes.json();
      const entries = (listData.entries ?? []) as { name: string; is_dir: boolean }[];
      for (const entry of entries) {
        if (!entry.is_dir) continue;
        const skillPath = `.openkms/skills/${entry.name}/SKILL.md`;
        try {
          const contentRes = await authAwareFetch(
            `${base}/files/content?path=${encodeURIComponent(skillPath)}`,
            { headers, credentials: 'include' },
          );
          if (contentRes.ok) {
            const contentData = await contentRes.json();
            files.push({ path: skillPath, content: contentData.content ?? '' });
          }
        } catch {
          // skill exists but SKILL.md not readable — skip
        }
      }
    }
  } catch {
    // skills dir doesn't exist — fine
  }

  return files;
}

export async function saveArtifact(
  projectId: string,
  path: string,
  content: string,
): Promise<void> {
  return request<void>(`/api/projects/${projectId}/files/content`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, content }),
  });
}

export async function chatImprovements(
  projectId: string,
  message: string,
): Promise<string> {
  const data = await request<{ response: string }>(`/api/projects/${projectId}/improvements/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message }),
  });
  return data.response;
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
  const res = await requestRaw(`/api/projects/${projectId}/improvements/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message }),
  });
  if (!res.body) throw new Error('No response body');
  await readNdjsonStream<ImprovementStreamEvent>(res.body, onEvent);
}

export async function mergeLessons(
  projectId: string,
  lessons: LessonEventWithState[],
  sessionId: string,
): Promise<LessonEventWithState[]> {
  const data = await request<{ events?: LessonEventWithState[] }>(
    `/api/projects/${projectId}/lessons/merge`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lessons, session_id: sessionId }),
    },
  );
  return data.events ?? [];
}

export async function generateSkill(
  projectId: string,
  event: LessonEvent,
): Promise<string> {
  const data = await request<{ content: string }>(`/api/projects/${projectId}/skills/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ event }),
  });
  return data.content;
}

let _idCounter = 0;

export function makeEventId(): string {
  return `ev-${Date.now().toString(36)}-${(_idCounter++).toString(36)}`;
}

/** Construct a session review path. */
export function sessionReviewPath(projectId: string, sessionId: string): string {
  return `/projects/${projectId}/sessions/${sessionId}/review`;
}
