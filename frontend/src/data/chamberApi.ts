import { config } from '../config';
import { ontologyFetch } from './ontologyFetch';

export type ChamberBindings = {
  k8s?: {
    cluster_id: string;
    namespace: string;
    service: string;
    port: number;
    path?: string | null;
  };
};

export type ChamberAppResponse = {
  id: string;
  name: string;
  api_name: string;
  description?: string | null;
  template_id: 'module';
  bindings: ChamberBindings;
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

export type ChamberRunResponse = ChamberAppResponse;

const base = `${config.apiUrl}/api/chamber/apps`;

export async function listChamberApps(params?: { status?: string }): Promise<ChamberAppResponse[]> {
  const qs = new URLSearchParams();
  if (params?.status) qs.set('status', params.status);
  const suffix = qs.toString() ? `?${qs}` : '';
  return ontologyFetch<ChamberAppResponse[]>(`${base}${suffix}`, undefined, 'Failed to list Chamber apps');
}

export async function createChamberApp(body: {
  name: string;
  api_name: string;
  description?: string;
  template_id?: 'module';
  bindings?: ChamberBindings;
}): Promise<ChamberAppResponse> {
  return ontologyFetch<ChamberAppResponse>(
    base,
    { method: 'POST', body: JSON.stringify({ ...body, template_id: body.template_id || 'module' }) },
    'Failed to create Chamber app',
  );
}

export async function fetchChamberRun(appId: string): Promise<ChamberRunResponse> {
  return ontologyFetch<ChamberRunResponse>(`${base}/${appId}`, undefined, 'Failed to load Chamber app');
}

export function chamberAppProxyUrl(appId: string): string {
  return `${base}/${appId}/proxy/`;
}

export async function updateChamberApp(
  appId: string,
  body: {
    name?: string;
    description?: string | null;
    bindings?: ChamberBindings;
  },
): Promise<ChamberAppResponse> {
  return ontologyFetch<ChamberAppResponse>(
    `${base}/${appId}`,
    { method: 'PATCH', body: JSON.stringify(body) },
    'Failed to update Chamber app',
  );
}

export async function deleteChamberApp(appId: string): Promise<void> {
  await ontologyFetch<unknown>(`${base}/${appId}`, { method: 'DELETE' }, 'Failed to delete Chamber app');
}

export async function publishChamberApp(appId: string): Promise<ChamberRunResponse> {
  return ontologyFetch<ChamberRunResponse>(
    `${base}/${appId}/publish`,
    { method: 'POST', body: '{}' },
    'Failed to publish Chamber app',
  );
}

export async function unpublishChamberApp(appId: string): Promise<ChamberAppResponse> {
  return ontologyFetch<ChamberAppResponse>(
    `${base}/${appId}/unpublish`,
    { method: 'POST', body: '{}' },
    'Failed to unpublish Chamber app',
  );
}

export type ChamberVersion = {
  id: string;
  version: number;
  created_at: string;
  created_by_name?: string | null;
  is_current: boolean;
};

export async function listChamberVersions(appId: string): Promise<ChamberVersion[]> {
  return ontologyFetch<ChamberVersion[]>(
    `${base}/${appId}/versions`,
    undefined,
    'Failed to list Chamber versions',
  );
}
