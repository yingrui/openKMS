/** API for glossary management (backend). */
import { config } from '../config';
import { getAuthHeaders } from './apiClient';

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

export async function fetchGlossaries(): Promise<GlossaryListResponse> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${config.apiUrl}/api/glossaries`, {
    headers: { ...headers },
    credentials: 'include',
  });
  if (!res.ok) throw new Error(`Failed to fetch glossaries: ${res.status}`);
  return res.json();
}

export async function fetchGlossary(glossaryId: string): Promise<GlossaryResponse> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${config.apiUrl}/api/glossaries/${glossaryId}`, {
    headers: { ...headers },
    credentials: 'include',
  });
  if (!res.ok) throw new Error(`Failed to fetch glossary: ${res.status}`);
  return res.json();
}

export async function createGlossary(data: {
  name: string;
  description?: string;
}): Promise<GlossaryResponse> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${config.apiUrl}/api/glossaries`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(data),
    credentials: 'include',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to create glossary');
  }
  return res.json();
}

export async function updateGlossary(
  glossaryId: string,
  data: { name?: string; description?: string }
): Promise<GlossaryResponse> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${config.apiUrl}/api/glossaries/${glossaryId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(data),
    credentials: 'include',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to update glossary');
  }
  return res.json();
}

export async function deleteGlossary(glossaryId: string): Promise<void> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${config.apiUrl}/api/glossaries/${glossaryId}`, {
    method: 'DELETE',
    headers: { ...headers },
    credentials: 'include',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to delete glossary');
  }
}

// --- Glossary Terms ---

export async function fetchGlossaryTerms(
  glossaryId: string,
  params?: { search?: string }
): Promise<GlossaryTermListResponse> {
  const headers = await getAuthHeaders();
  const query = new URLSearchParams();
  if (params?.search) query.set('search', params.search);
  const qs = query.toString() ? `?${query.toString()}` : '';
  const res = await fetch(`${config.apiUrl}/api/glossaries/${glossaryId}/terms${qs}`, {
    headers: { ...headers },
    credentials: 'include',
  });
  if (!res.ok) throw new Error(`Failed to fetch terms: ${res.status}`);
  return res.json();
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
  const headers = await getAuthHeaders();
  const res = await fetch(`${config.apiUrl}/api/glossaries/${glossaryId}/terms/suggest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(data),
    credentials: 'include',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to get AI suggestion');
  }
  return res.json();
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
  const headers = await getAuthHeaders();
  const res = await fetch(`${config.apiUrl}/api/glossaries/${glossaryId}/terms`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({
      primary_en: data.primary_en || null,
      primary_cn: data.primary_cn || null,
      definition: data.definition || null,
      synonyms_en: data.synonyms_en || [],
      synonyms_cn: data.synonyms_cn || [],
    }),
    credentials: 'include',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to create term');
  }
  return res.json();
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
  const headers = await getAuthHeaders();
  const res = await fetch(`${config.apiUrl}/api/glossaries/${glossaryId}/terms/${termId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(data),
    credentials: 'include',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to update term');
  }
  return res.json();
}

export async function deleteGlossaryTerm(
  glossaryId: string,
  termId: string
): Promise<void> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${config.apiUrl}/api/glossaries/${glossaryId}/terms/${termId}`, {
    method: 'DELETE',
    headers: { ...headers },
    credentials: 'include',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to delete term');
  }
}

// --- Export ---

export async function exportGlossary(glossaryId: string): Promise<GlossaryExportPayload> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${config.apiUrl}/api/glossaries/${glossaryId}/export`, {
    headers: { ...headers },
    credentials: 'include',
  });
  if (!res.ok) throw new Error(`Failed to export glossary: ${res.status}`);
  return res.json();
}

// --- Import ---

export async function importGlossary(
  glossaryId: string,
  payload: { terms: GlossaryExportPayload['terms']; mode: 'append' | 'replace' }
): Promise<GlossaryTermListResponse> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${config.apiUrl}/api/glossaries/${glossaryId}/import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(payload),
    credentials: 'include',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to import glossary');
  }
  return res.json();
}
