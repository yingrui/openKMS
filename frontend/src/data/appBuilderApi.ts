import { config } from '../config';
import { ontologyFetch } from './ontologyFetch';

export type AppBuilderBindings = {
  objectTypes?: string[];
  actions?: string[];
  functions?: string[];
};

export type AppBuilderAppResponse = {
  id: string;
  name: string;
  api_name: string;
  description?: string | null;
  template_id: string;
  app_kind?: string;
  bindings: AppBuilderBindings;
  status: string;
  bindings_hash?: string | null;
  bindings_stale: boolean;
  missing_bindings: string[];
  created_by?: string | null;
  created_by_name?: string | null;
  created_at: string;
  updated_at: string;
  published_version?: number | null;
  has_draft: boolean;
  has_published: boolean;
};

export type AppBuilderComponent = {
  id: string;
  name: string;
  position: number;
  is_default: boolean;
  messages: Record<string, unknown>[];
};

export type AppBuilderDesignResponse = AppBuilderAppResponse & {
  components: AppBuilderComponent[];
};

export type AppBuilderRunResponse = AppBuilderAppResponse & {
  components: AppBuilderComponent[];
};

const base = `${config.apiUrl}/api/app-builder/apps`;

export async function listApps(params?: { status?: string }): Promise<AppBuilderAppResponse[]> {
  const qs = new URLSearchParams();
  if (params?.status) qs.set('status', params.status);
  const suffix = qs.toString() ? `?${qs}` : '';
  return ontologyFetch<AppBuilderAppResponse[]>(`${base}${suffix}`, undefined, 'Failed to list apps');
}

export async function createApp(body: {
  name: string;
  api_name: string;
  description?: string;
  template_id?: string;
  bindings?: AppBuilderBindings;
}): Promise<AppBuilderAppResponse> {
  return ontologyFetch<AppBuilderAppResponse>(
    base,
    { method: 'POST', body: JSON.stringify(body) },
    'Failed to create app',
  );
}

export async function fetchAppRun(appId: string): Promise<AppBuilderRunResponse> {
  return ontologyFetch<AppBuilderRunResponse>(`${base}/${appId}`, undefined, 'Failed to load app');
}

export async function fetchAppDesign(appId: string): Promise<AppBuilderDesignResponse> {
  return ontologyFetch<AppBuilderDesignResponse>(`${base}/${appId}/design`, undefined, 'Failed to load design');
}

export async function updateApp(
  appId: string,
  body: {
    name?: string;
    description?: string | null;
    bindings?: AppBuilderBindings;
    components?: AppBuilderComponent[];
  },
): Promise<AppBuilderAppResponse> {
  return ontologyFetch<AppBuilderAppResponse>(
    `${base}/${appId}`,
    { method: 'PATCH', body: JSON.stringify(body) },
    'Failed to update app',
  );
}

export async function deleteApp(appId: string): Promise<void> {
  await ontologyFetch<unknown>(`${base}/${appId}`, { method: 'DELETE' }, 'Failed to delete app');
}

export async function synthesizeApp(appId: string): Promise<AppBuilderDesignResponse> {
  return ontologyFetch<AppBuilderDesignResponse>(
    `${base}/${appId}/synthesize`,
    { method: 'POST', body: '{}' },
    'Failed to synthesize',
  );
}

export async function publishApp(
  appId: string,
  components?: AppBuilderComponent[],
): Promise<AppBuilderRunResponse> {
  return ontologyFetch<AppBuilderRunResponse>(
    `${base}/${appId}/publish`,
    {
      method: 'POST',
      body: JSON.stringify(components ? { components } : {}),
    },
    'Failed to publish',
  );
}

export async function unpublishApp(appId: string): Promise<AppBuilderAppResponse> {
  return ontologyFetch<AppBuilderAppResponse>(
    `${base}/${appId}/unpublish`,
    { method: 'POST', body: '{}' },
    'Failed to unpublish',
  );
}

export type AppBuilderVersion = {
  id: string;
  version: number;
  created_at: string;
  created_by_name?: string | null;
  is_current: boolean;
};

export async function listAppVersions(appId: string): Promise<AppBuilderVersion[]> {
  return ontologyFetch<AppBuilderVersion[]>(
    `${base}/${appId}/versions`,
    undefined,
    'Failed to list versions',
  );
}

export async function rollbackApp(appId: string, versionId: string): Promise<AppBuilderAppResponse> {
  return ontologyFetch<AppBuilderAppResponse>(
    `${base}/${appId}/versions/${encodeURIComponent(versionId)}/rollback`,
    { method: 'POST', body: '{}' },
    'Failed to rollback',
  );
}

export type DesignerNdjsonEvent =
  | { type: 'delta'; t: string }
  | { type: 'tool_start'; run_id: string; name: string; input: string }
  | { type: 'tool_end'; run_id: string; name: string; output: string }
  | {
      type: 'done';
      content: string;
      a2ui_messages?: Record<string, unknown>[];
      bindings?: AppBuilderBindings;
    }
  | { type: 'error'; message: string };

export type DesignerConversation = {
  id: string;
  title?: string | null;
  created_at: string;
  updated_at: string;
};

export async function listDesignerConversations(appId: string): Promise<DesignerConversation[]> {
  const res = await ontologyFetch<{ conversations: DesignerConversation[] }>(
    `${base}/${appId}/designer/conversations`,
    undefined,
    'Failed to list conversations',
  );
  return res.conversations || [];
}

export async function createDesignerConversation(appId: string): Promise<DesignerConversation> {
  return ontologyFetch<DesignerConversation>(
    `${base}/${appId}/designer/conversations`,
    { method: 'POST', body: '{}' },
    'Failed to create conversation',
  );
}

export async function deleteDesignerConversation(appId: string, conversationId: string): Promise<void> {
  await ontologyFetch(
    `${base}/${appId}/designer/conversations/${encodeURIComponent(conversationId)}`,
    { method: 'DELETE' },
    'Failed to delete conversation',
  );
}

export async function fetchDesignerSession(
  appId: string,
  conversationId?: string | null,
): Promise<{ conversation_id: string | null; messages: { id: string; role: string; content: string }[] }> {
  const qs = conversationId ? `?conversation_id=${encodeURIComponent(conversationId)}` : '';
  return ontologyFetch(
    `${base}/${appId}/designer/session${qs}`,
    undefined,
    'Failed to load session',
  );
}

export async function postDesignerChatStream(
  appId: string,
  messages: { role: string; content: string }[],
  onEvent: (ev: DesignerNdjsonEvent) => void,
  opts?: {
    workingA2uiMessages?: Record<string, unknown>[];
    conversationId?: string | null;
    componentId?: string | null;
    signal?: AbortSignal;
  },
): Promise<void> {
  const res = await fetch(`${base}/${appId}/designer/chat`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', Accept: 'application/x-ndjson' },
    body: JSON.stringify({
      messages,
      working_a2ui_messages: opts?.workingA2uiMessages,
      conversation_id: opts?.conversationId ?? undefined,
      component_id: opts?.componentId ?? undefined,
      stream: true,
    }),
    signal: opts?.signal,
  });
  if (!res.ok || !res.body) {
    throw new Error(`Designer chat failed (${res.status})`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop() || '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        onEvent(JSON.parse(trimmed) as DesignerNdjsonEvent);
      } catch {
        /* ignore partial */
      }
    }
  }
}
