/** API for model / API provider registry (backend). */
import { request } from './apiClient';

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
  try {
    const data = await request<{ api_kinds?: ApiKindOption[] }>('/api/models/api-kinds');
    return data.api_kinds || [];
  } catch {
    return [];
  }
}

export async function fetchModelCapabilities(): Promise<CapabilityOption[]> {
  try {
    const data = await request<{ capabilities?: CapabilityOption[] }>('/api/models/capabilities');
    return data.capabilities || [];
  } catch {
    return [];
  }
}

export async function fetchModels(params?: {
  api_kind?: string;
  capability?: string;
  provider_id?: string;
  search?: string;
  limit?: number;
  offset?: number;
}): Promise<ApiModelListResponse> {
  return request<ApiModelListResponse>('/api/models', {
    query: {
      api_kind: params?.api_kind,
      capability: params?.capability,
      provider_id: params?.provider_id,
      search: params?.search,
      limit: params?.limit,
      offset: params?.offset,
    },
  });
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
  return request<ApiModelResponse>(`/api/models/${id}`);
}

export async function createModel(data: ApiModelCreate): Promise<ApiModelResponse> {
  return request<ApiModelResponse>('/api/models', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export async function updateModel(id: string, data: ApiModelUpdate): Promise<ApiModelResponse> {
  return request<ApiModelResponse>(`/api/models/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export async function deleteModel(id: string): Promise<void> {
  return request<void>(`/api/models/${id}`, { method: 'DELETE' });
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
  image_url?: string | null;
  video_url?: string | null;
}

export async function testModel(id: string, data: ModelTestRequest): Promise<ModelTestResponse> {
  return request<ModelTestResponse>(`/api/models/${id}/test`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}
