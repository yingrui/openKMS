import { config } from '../config';
import { ontologyFetch } from './ontologyFetch';

export type AppBuilderBindings = {
  k8s?: {
    cluster_id: string;
    namespace: string;
    service: string;
    port: number;
    path?: string | null;
  };
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

export type AppBuilderRunResponse = AppBuilderAppResponse;

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
    { method: 'POST', body: JSON.stringify({ ...body, template_id: body.template_id || 'module' }) },
    'Failed to create app',
  );
}

export async function fetchAppRun(appId: string): Promise<AppBuilderRunResponse> {
  return ontologyFetch<AppBuilderRunResponse>(`${base}/${appId}`, undefined, 'Failed to load app');
}

export function moduleAppProxyUrl(appId: string): string {
  return `${base}/${appId}/proxy/`;
}

export async function updateApp(
  appId: string,
  body: {
    name?: string;
    description?: string | null;
    bindings?: AppBuilderBindings;
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

export async function publishApp(appId: string): Promise<AppBuilderRunResponse> {
  return ontologyFetch<AppBuilderRunResponse>(
    `${base}/${appId}/publish`,
    { method: 'POST', body: '{}' },
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
