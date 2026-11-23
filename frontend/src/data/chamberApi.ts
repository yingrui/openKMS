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
  bindings_stale: boolean;
  missing_bindings: string[];
  created_by?: string | null;
  created_by_name?: string | null;
  created_at: string;
  updated_at: string;
};

const base = `${config.apiUrl}/api/chamber/apps`;

export async function listChamberApps(): Promise<ChamberAppResponse[]> {
  return ontologyFetch<ChamberAppResponse[]>(base, undefined, 'Failed to list Chamber apps');
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

export async function fetchChamberApp(appId: string): Promise<ChamberAppResponse> {
  return ontologyFetch<ChamberAppResponse>(`${base}/${appId}`, undefined, 'Failed to load Chamber app');
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
