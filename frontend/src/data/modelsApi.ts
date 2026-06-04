/** API for model / API provider registry (backend). */
import { config } from '../config';
import { getAuthHeaders, authAwareFetch } from './apiClient';

export interface ApiKindOption {
  id: string;
  label: string;
}

export interface CapabilityOption {
  id: string;
  label: string;
}

export interface ApiModelResponse {
  id: string;
  provider_id: string;
  provider_name: string;
  name: string;
  api_kind: string;
  capabilities: string[];
  is_default_in_category: boolean;
  base_url: string;
  api_key_set?: boolean;
  model_name?: string | null;
  config?: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface ApiModelListResponse {
  items: ApiModelResponse[];
  total: number;
  limit: number;
  offset: number;
}

export interface ApiModelCreate {
  provider_id: string;
  name: string;
  api_kind: string;
  capabilities?: string[];
  is_default_in_category?: boolean;
  model_name?: string | null;
  config?: Record<string, unknown> | null;
}

export interface ApiModelUpdate {
  provider_id?: string;
  name?: string;
  api_kind?: string;
  capabilities?: string[];
  is_default_in_category?: boolean;
  model_name?: string | null;
  config?: Record<string, unknown> | null;
}

export async function fetchApiKinds(): Promise<ApiKindOption[]> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(`${config.apiUrl}/api/models/api-kinds`, {
    headers: { ...headers },
    credentials: 'include',
  });
  if (!res.ok) return [];
  const data = await res.json();
  return data.api_kinds || [];
}

export async function fetchModelCapabilities(): Promise<CapabilityOption[]> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(`${config.apiUrl}/api/models/capabilities`, {
    headers: { ...headers },
    credentials: 'include',
  });
  if (!res.ok) return [];
  const data = await res.json();
  return data.capabilities || [];
}

export async function fetchModels(params?: {
  api_kind?: string;
  capability?: string;
  provider_id?: string;
  search?: string;
  limit?: number;
  offset?: number;
}): Promise<ApiModelListResponse> {
  const headers = await getAuthHeaders();
  const query = new URLSearchParams();
  if (params?.api_kind) query.set('api_kind', params.api_kind);
  if (params?.capability) query.set('capability', params.capability);
  if (params?.provider_id) query.set('provider_id', params.provider_id);
  if (params?.search) query.set('search', params.search);
  if (params?.limit != null) query.set('limit', String(params.limit));
  if (params?.offset != null) query.set('offset', String(params.offset));
  const qs = query.toString() ? `?${query.toString()}` : '';
  const res = await authAwareFetch(`${config.apiUrl}/api/models${qs}`, {
    headers: { ...headers },
    credentials: 'include',
  });
  if (!res.ok) throw new Error(`Failed to fetch models: ${res.status}`);
  return res.json();
}

/** Full list for dropdowns. Paginates at API max page size (200). */
export async function fetchAllModels(params?: {
  api_kind?: string;
  capability?: string;
  provider_id?: string;
  search?: string;
}): Promise<ApiModelResponse[]> {
  const items: ApiModelResponse[] = [];
  let offset = 0;
  let total = 0;
  do {
    const page = await fetchModels({ ...params, limit: 200, offset });
    items.push(...page.items);
    total = page.total;
    offset += page.items.length;
    if (page.items.length === 0) break;
  } while (offset < total);
  return items;
}

export async function fetchModelById(id: string): Promise<ApiModelResponse> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(`${config.apiUrl}/api/models/${id}`, {
    headers: { ...headers },
    credentials: 'include',
  });
  if (!res.ok) throw new Error(`Failed to fetch model: ${res.status}`);
  return res.json();
}

export async function createModel(data: ApiModelCreate): Promise<ApiModelResponse> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(`${config.apiUrl}/api/models`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(data),
    credentials: 'include',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to create model');
  }
  return res.json();
}

export async function updateModel(id: string, data: ApiModelUpdate): Promise<ApiModelResponse> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(`${config.apiUrl}/api/models/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(data),
    credentials: 'include',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to update model');
  }
  return res.json();
}

export async function deleteModel(id: string): Promise<void> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(`${config.apiUrl}/api/models/${id}`, {
    method: 'DELETE',
    headers: { ...headers },
    credentials: 'include',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to delete model');
  }
}

export interface ModelTestRequest {
  prompt: string;
  image?: string | null;
  max_tokens?: number;
  temperature?: number;
}

export interface ModelTestResponse {
  success: boolean;
  content?: string | null;
  error?: string | null;
  elapsed_ms: number;
}

export async function testModel(id: string, data: ModelTestRequest): Promise<ModelTestResponse> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(`${config.apiUrl}/api/models/${id}/test`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(data),
    credentials: 'include',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to test model');
  }
  return res.json();
}
