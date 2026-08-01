/** API for glossary management (backend). */
import { request } from './apiClient';

// --- Types ---

export interface GlossaryResponse {
  id: string;
  name: string;
  description?: string | null;
  term_count: number;
  created_at: string;
  updated_at: string;
}

export interface GlossaryListResponse {
  items: GlossaryResponse[];
  total: number;
  limit: number;
  offset: number;
}

export interface GlossaryTermResponse {
  id: string;
  glossary_id: string;
  primary_en?: string | null;
  primary_cn?: string | null;
  definition?: string | null;
  synonyms_en: string[];
  synonyms_cn: string[];
  created_at: string;
  updated_at: string;
}

export interface GlossaryTermListResponse {
  items: GlossaryTermResponse[];
  total: number;
}

export interface GlossaryExportPayload {
  glossary_id: string;
  glossary_name: string;
  exported_at: string;
  terms: Array<{
    primary_en?: string | null;
    primary_cn?: string | null;
    definition?: string | null;
    synonyms_en: string[];
    synonyms_cn: string[];
  }>;
}

// --- Glossary CRUD ---

export async function fetchGlossaries(params?: {
  limit?: number;
  offset?: number;
}): Promise<GlossaryListResponse> {
  return request<GlossaryListResponse>('/api/glossaries', {
    query: { limit: params?.limit, offset: params?.offset },
  });
}

/** Full list for dropdowns. Paginates at API max page size (200). */
export async function fetchAllGlossaries(): Promise<GlossaryResponse[]> {
  const items: GlossaryResponse[] = [];
  let offset = 0;
  let total = 0;
  do {
    const page = await fetchGlossaries({ limit: 200, offset });
    items.push(...page.items);
    total = page.total;
    offset += page.items.length;
    if (page.items.length === 0) break;
  } while (offset < total);
  return items;
}

export async function fetchGlossary(glossaryId: string): Promise<GlossaryResponse> {
  return request<GlossaryResponse>(`/api/glossaries/${glossaryId}`);
}

export async function createGlossary(data: {
  name: string;
  description?: string;
}): Promise<GlossaryResponse> {
  return request<GlossaryResponse>('/api/glossaries', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export async function updateGlossary(
  glossaryId: string,
  data: { name?: string; description?: string }
): Promise<GlossaryResponse> {
  return request<GlossaryResponse>(`/api/glossaries/${glossaryId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export async function deleteGlossary(glossaryId: string): Promise<void> {
  return request<void>(`/api/glossaries/${glossaryId}`, { method: 'DELETE' });
}

// --- Glossary Terms ---

export async function fetchGlossaryTerms(
  glossaryId: string,
  params?: { search?: string }
): Promise<GlossaryTermListResponse> {
  return request<GlossaryTermListResponse>(`/api/glossaries/${glossaryId}/terms`, {
    query: { search: params?.search },
  });
}

export interface GlossaryTermSuggestResponse {
  primary_en: string;
  primary_cn: string;
  definition?: string;
  synonyms_en: string[];
  synonyms_cn: string[];
}

export async function suggestGlossaryTerm(
  glossaryId: string,
  data: { primary_en?: string; primary_cn?: string }
): Promise<GlossaryTermSuggestResponse> {
  return request<GlossaryTermSuggestResponse>(`/api/glossaries/${glossaryId}/terms/suggest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export async function createGlossaryTerm(
  glossaryId: string,
  data: {
    primary_en?: string;
    primary_cn?: string;
    definition?: string;
    synonyms_en?: string[];
    synonyms_cn?: string[];
  }
): Promise<GlossaryTermResponse> {
  return request<GlossaryTermResponse>(`/api/glossaries/${glossaryId}/terms`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      primary_en: data.primary_en || null,
      primary_cn: data.primary_cn || null,
      definition: data.definition || null,
      synonyms_en: data.synonyms_en || [],
      synonyms_cn: data.synonyms_cn || [],
    }),
  });
}

export async function updateGlossaryTerm(
  glossaryId: string,
  termId: string,
  data: {
    primary_en?: string;
    primary_cn?: string;
    definition?: string;
    synonyms_en?: string[];
    synonyms_cn?: string[];
  }
): Promise<GlossaryTermResponse> {
  return request<GlossaryTermResponse>(`/api/glossaries/${glossaryId}/terms/${termId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export async function deleteGlossaryTerm(
  glossaryId: string,
  termId: string
): Promise<void> {
  return request<void>(`/api/glossaries/${glossaryId}/terms/${termId}`, { method: 'DELETE' });
}

// --- Export ---

export async function exportGlossary(glossaryId: string): Promise<GlossaryExportPayload> {
  return request<GlossaryExportPayload>(`/api/glossaries/${glossaryId}/export`);
}

// --- Import ---

export async function importGlossary(
  glossaryId: string,
  payload: { terms: GlossaryExportPayload['terms']; mode: 'append' | 'replace' }
): Promise<GlossaryTermListResponse> {
  return request<GlossaryTermListResponse>(`/api/glossaries/${glossaryId}/import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}
