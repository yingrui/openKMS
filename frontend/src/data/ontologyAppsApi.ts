import { config } from '../config';
import { ontologyFetch } from './ontologyFetch';

export type OntologyAppBindings = {
  objectType?: string;
  columnProperty?: string;
  columns?: string[];
  cardTitleProperty?: string;
  createAction?: string | null;
  updateAction?: string | null;
  setStatusAction?: string | null;
  deleteAction?: string | null;
  suggestFunction?: string | null;
};

export type OntologyAppResponse = {
  id: string;
  name: string;
  api_name: string;
  description?: string | null;
  template_id: string;
  bindings: OntologyAppBindings;
  status: string;
  bindings_hash?: string | null;
  bindings_stale: boolean;
  missing_bindings: string[];
  created_by?: string | null;
  created_by_name?: string | null;
  created_at: string;
  updated_at: string;
  has_draft: boolean;
  has_published: boolean;
};

export type OntologyAppDesignResponse = OntologyAppResponse & {
  a2ui_messages: Record<string, unknown>[];
};

export type OntologyAppRunResponse = OntologyAppResponse & {
  a2ui_messages: Record<string, unknown>[];
};

const base = `${config.apiUrl}/api/ontology/apps`;

export async function listOntologyApps(params?: { status?: string }): Promise<OntologyAppResponse[]> {
  const qs = new URLSearchParams();
  if (params?.status) qs.set('status', params.status);
  const suffix = qs.toString() ? `?${qs}` : '';
  return ontologyFetch<OntologyAppResponse[]>(`${base}${suffix}`, undefined, 'Failed to list apps');
}

export async function createOntologyApp(body: {
  name: string;
  api_name: string;
  description?: string;
  template_id?: string;
  bindings?: OntologyAppBindings;
}): Promise<OntologyAppResponse> {
  return ontologyFetch<OntologyAppResponse>(
    base,
    { method: 'POST', body: JSON.stringify(body) },
    'Failed to create app',
  );
}

export async function fetchOntologyAppRun(appId: string): Promise<OntologyAppRunResponse> {
  return ontologyFetch<OntologyAppRunResponse>(`${base}/${appId}`, undefined, 'Failed to load app');
}

export async function fetchOntologyAppDesign(appId: string): Promise<OntologyAppDesignResponse> {
  return ontologyFetch<OntologyAppDesignResponse>(`${base}/${appId}/design`, undefined, 'Failed to load design');
}

export async function updateOntologyApp(
  appId: string,
  body: {
    name?: string;
    description?: string;
    bindings?: OntologyAppBindings;
    draft_a2ui_messages?: Record<string, unknown>[];
  },
): Promise<OntologyAppResponse> {
  return ontologyFetch<OntologyAppResponse>(
    `${base}/${appId}`,
    { method: 'PATCH', body: JSON.stringify(body) },
    'Failed to update app',
  );
}

export async function deleteOntologyApp(appId: string): Promise<void> {
  await ontologyFetch<unknown>(`${base}/${appId}`, { method: 'DELETE' }, 'Failed to delete app');
}

export async function synthesizeOntologyApp(appId: string): Promise<OntologyAppDesignResponse> {
  return ontologyFetch<OntologyAppDesignResponse>(
    `${base}/${appId}/synthesize`,
    { method: 'POST', body: '{}' },
    'Failed to synthesize',
  );
}

export async function publishOntologyApp(
  appId: string,
  a2uiMessages?: Record<string, unknown>[],
): Promise<OntologyAppRunResponse> {
  return ontologyFetch<OntologyAppRunResponse>(
    `${base}/${appId}/publish`,
    {
      method: 'POST',
      body: JSON.stringify(a2uiMessages ? { a2ui_messages: a2uiMessages } : {}),
    },
    'Failed to publish',
  );
}

export async function unpublishOntologyApp(appId: string): Promise<OntologyAppResponse> {
  return ontologyFetch<OntologyAppResponse>(
    `${base}/${appId}/unpublish`,
    { method: 'POST', body: '{}' },
    'Failed to unpublish',
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
      bindings?: OntologyAppBindings;
    }
  | { type: 'error'; message: string };

export type DesignerConversation = {
  id: string;
  title?: string | null;
  created_at: string;
  updated_at: string;
};

export async function listOntologyAppDesignerConversations(
  appId: string,
): Promise<DesignerConversation[]> {
  const res = await ontologyFetch<{ conversations: DesignerConversation[] }>(
    `${base}/${appId}/designer/conversations`,
    undefined,
    'Failed to list conversations',
  );
  return res.conversations || [];
}

export async function createOntologyAppDesignerConversation(appId: string): Promise<DesignerConversation> {
  return ontologyFetch<DesignerConversation>(
    `${base}/${appId}/designer/conversations`,
    { method: 'POST', body: '{}' },
    'Failed to create conversation',
  );
}

export async function deleteOntologyAppDesignerConversation(
  appId: string,
  conversationId: string,
): Promise<void> {
  await ontologyFetch(
    `${base}/${appId}/designer/conversations/${encodeURIComponent(conversationId)}`,
    { method: 'DELETE' },
    'Failed to delete conversation',
  );
}

export async function fetchOntologyAppDesignerSession(
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

export async function postOntologyAppDesignerChatStream(
  appId: string,
  messages: { role: string; content: string }[],
  onEvent: (ev: DesignerNdjsonEvent) => void,
  opts?: {
    workingA2uiMessages?: Record<string, unknown>[];
    conversationId?: string | null;
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
