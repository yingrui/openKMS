/** API for model / API provider registry (backend). */
import { config } from '../config';
import { getAuthHeaders } from './apiClient';

export interface ModelCategory {
  id: string;
  label: string;
}

export interface ApiModelResponse {
  id: string;
  name: string;
  provider: string;
  category: string;
  base_url: string;
  api_key_set: boolean;
  model_name?: string | null;
  config?: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface ApiModelListResponse {
  items: ApiModelResponse[];
  total: number;
}

export interface ApiModelCreate {
  name: string;
  provider: string;
  category: string;
  base_url: string;
  api_key?: string | null;
  model_name?: string | null;
  config?: Record<string, unknown> | null;
}

export interface ApiModelUpdate {
  name?: string;
  provider?: string;
  category?: string;
  base_url?: string;
  api_key?: string | null;
  model_name?: string | null;
  config?: Record<string, unknown> | null;
}

export async function fetchModelCategories(): Promise<ModelCategory[]> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${config.apiUrl}/api/models/categories`, {
    headers: { ...headers },
    credentials: 'include',
  });
  if (!res.ok) return [];
  const data = await res.json();
  return data.categories || [];
}

export async function fetchModels(params?: {
  category?: string;
  search?: string;
}): Promise<ApiModelListResponse> {
  const headers = await getAuthHeaders();
  const query = new URLSearchParams();
  if (params?.category) query.set('category', params.category);
  if (params?.search) query.set('search', params.search);
  const qs = query.toString() ? `?${query.toString()}` : '';
  const res = await fetch(`${config.apiUrl}/api/models${qs}`, {
    headers: { ...headers },
    credentials: 'include',
  });
  if (!res.ok) throw new Error(`Failed to fetch models: ${res.status}`);
  return res.json();
}

export async function fetchModelById(id: string): Promise<ApiModelResponse> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${config.apiUrl}/api/models/${id}`, {
    headers: { ...headers },
    credentials: 'include',
  });
  if (!res.ok) throw new Error(`Failed to fetch model: ${res.status}`);
  return res.json();
}

export async function createModel(data: ApiModelCreate): Promise<ApiModelResponse> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${config.apiUrl}/api/models`, {
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
  const res = await fetch(`${config.apiUrl}/api/models/${id}`, {
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
  const res = await fetch(`${config.apiUrl}/api/models/${id}`, {
    method: 'DELETE',
    headers: { ...headers },
    credentials: 'include',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to delete model');
  }
}
