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
