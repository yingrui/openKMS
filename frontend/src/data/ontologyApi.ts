/** API for ontology (object types, link types, instances). */
import { config } from '../config';
import { getAuthHeaders } from './apiClient';

// --- Object Type ---

export interface PropertyDef {
  name: string;
  type: string;
  required: boolean;
}

export interface ObjectTypeResponse {
  id: string;
  name: string;
  description?: string | null;
  dataset_id?: string | null;
  dataset_name?: string | null;
  key_property?: string | null;
  is_master_data?: boolean;
  display_property?: string | null;
  properties: PropertyDef[];
  instance_count: number;
  created_at: string;
  updated_at: string;
}

export interface ObjectTypeListResponse {
  items: ObjectTypeResponse[];
  total: number;
}

export async function fetchObjectTypes(params?: { countFromNeo4j?: boolean; isMasterData?: boolean }): Promise<ObjectTypeListResponse> {
  const headers = await getAuthHeaders();
  const searchParams = new URLSearchParams();
  if (params?.countFromNeo4j) searchParams.set('count_from_neo4j', 'true');
  if (params?.isMasterData !== undefined) searchParams.set('is_master_data', String(params.isMasterData));
  const qs = searchParams.toString() ? `?${searchParams.toString()}` : '';
  const res = await fetch(`${config.apiUrl}/api/object-types${qs}`, {
    headers: { ...headers },
    credentials: 'include',
  });
  if (!res.ok) throw new Error(`Failed to fetch object types: ${res.status}`);
  return res.json();
}

export async function fetchObjectType(
  objectTypeId: string,
  params?: { countFromNeo4j?: boolean }
): Promise<ObjectTypeResponse> {
  const headers = await getAuthHeaders();
  const qs = params?.countFromNeo4j ? '?count_from_neo4j=true' : '';
  const res = await fetch(`${config.apiUrl}/api/object-types/${objectTypeId}${qs}`, {
    headers: { ...headers },
    credentials: 'include',
  });
  if (!res.ok) throw new Error(`Failed to fetch object type: ${res.status}`);
  return res.json();
}

export async function createObjectType(data: {
  name: string;
  description?: string;
  dataset_id?: string;
  key_property?: string;
  is_master_data?: boolean;
  display_property?: string;
  properties?: PropertyDef[];
}): Promise<ObjectTypeResponse> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${config.apiUrl}/api/object-types`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(data),
    credentials: 'include',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to create object type');
  }
  return res.json();
}

export async function updateObjectType(
  objectTypeId: string,
  data: { name?: string; description?: string; dataset_id?: string; key_property?: string; is_master_data?: boolean; display_property?: string; properties?: PropertyDef[] }
): Promise<ObjectTypeResponse> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${config.apiUrl}/api/object-types/${objectTypeId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(data),
    credentials: 'include',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to update object type');
  }
  return res.json();
}

export async function indexObjectTypesToNeo4j(neo4jDataSourceId: string): Promise<{
  object_types_indexed: number;
  nodes_created: number;
}> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${config.apiUrl}/api/object-types/index-to-neo4j`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ neo4j_data_source_id: neo4jDataSourceId }),
    credentials: 'include',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { detail?: string }).detail || 'Failed to index to Neo4j');
  }
  return res.json();
}

export async function executeCypherQuery(cypher: string): Promise<{ columns: string[]; rows: Record<string, unknown>[] }> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${config.apiUrl}/api/ontology/explore`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ cypher }),
    credentials: 'include',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { detail?: string }).detail || 'Failed to execute query');
  }
  return res.json();
}

export async function indexLinkTypesToNeo4j(neo4jDataSourceId: string): Promise<{
  link_types_indexed: number;
  relationships_created: number;
}> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${config.apiUrl}/api/link-types/index-to-neo4j`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ neo4j_data_source_id: neo4jDataSourceId }),
    credentials: 'include',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { detail?: string }).detail || 'Failed to index links to Neo4j');
  }
  return res.json();
}

export async function deleteObjectType(objectTypeId: string): Promise<void> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${config.apiUrl}/api/object-types/${objectTypeId}`, {
    method: 'DELETE',
    headers: { ...headers },
    credentials: 'include',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to delete object type');
  }
}

// --- Object Instance ---

export interface ObjectInstanceResponse {
  id: string;
  object_type_id: string;
  data: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface ObjectInstanceListResponse {
  items: ObjectInstanceResponse[];
  total: number;
}

export async function fetchObjectInstances(
  objectTypeId: string,
  params?: { search?: string }
): Promise<ObjectInstanceListResponse> {
  const headers = await getAuthHeaders();
  const qs = params?.search ? `?search=${encodeURIComponent(params.search)}` : '';
  const res = await fetch(`${config.apiUrl}/api/object-types/${objectTypeId}/objects${qs}`, {
    headers: { ...headers },
    credentials: 'include',
  });
  if (!res.ok) throw new Error(`Failed to fetch objects: ${res.status}`);
  return res.json();
}

export async function createObjectInstance(
  objectTypeId: string,
  data: Record<string, unknown>
): Promise<ObjectInstanceResponse> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${config.apiUrl}/api/object-types/${objectTypeId}/objects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ data }),
    credentials: 'include',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to create object');
  }
  return res.json();
}

export async function updateObjectInstance(
  objectTypeId: string,
  objectId: string,
  data: Record<string, unknown>
): Promise<ObjectInstanceResponse> {
  const headers = await getAuthHeaders();
  const res = await fetch(
    `${config.apiUrl}/api/object-types/${objectTypeId}/objects/${objectId}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({ data }),
      credentials: 'include',
    }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to update object');
  }
  return res.json();
}

export async function deleteObjectInstance(
  objectTypeId: string,
  objectId: string
): Promise<void> {
  const headers = await getAuthHeaders();
  const res = await fetch(
    `${config.apiUrl}/api/object-types/${objectTypeId}/objects/${objectId}`,
    {
      method: 'DELETE',
      headers: { ...headers },
      credentials: 'include',
    }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to delete object');
  }
}

// --- Link Type ---

export const CARDINALITY_OPTIONS = ['one-to-one', 'one-to-many', 'many-to-one', 'many-to-many'] as const;

export type Cardinality = (typeof CARDINALITY_OPTIONS)[number];

export interface LinkTypeResponse {
  id: string;
  name: string;
  description?: string | null;
  source_object_type_id: string;
  target_object_type_id: string;
  source_object_type_name?: string | null;
  target_object_type_name?: string | null;
  cardinality: string;
  dataset_id?: string | null;
  dataset_name?: string | null;
  source_key_property?: string | null;
  target_key_property?: string | null;
  source_dataset_column?: string | null;
  target_dataset_column?: string | null;
  link_count: number;
  created_at: string;
  updated_at: string;
}

export interface LinkTypeListResponse {
  items: LinkTypeResponse[];
  total: number;
}

export async function fetchLinkTypes(params?: { countFromNeo4j?: boolean }): Promise<LinkTypeListResponse> {
  const headers = await getAuthHeaders();
  const qs = params?.countFromNeo4j ? '?count_from_neo4j=true' : '';
  const res = await fetch(`${config.apiUrl}/api/link-types${qs}`, {
    headers: { ...headers },
    credentials: 'include',
  });
  if (!res.ok) throw new Error(`Failed to fetch link types: ${res.status}`);
  return res.json();
}

export async function fetchLinkType(
  linkTypeId: string,
  params?: { countFromNeo4j?: boolean }
): Promise<LinkTypeResponse> {
  const headers = await getAuthHeaders();
  const qs = params?.countFromNeo4j ? '?count_from_neo4j=true' : '';
  const res = await fetch(`${config.apiUrl}/api/link-types/${linkTypeId}${qs}`, {
    headers: { ...headers },
    credentials: 'include',
  });
  if (!res.ok) throw new Error(`Failed to fetch link type: ${res.status}`);
  return res.json();
}

export async function createLinkType(data: {
  name: string;
  description?: string;
  source_object_type_id: string;
  target_object_type_id: string;
  cardinality?: string;
  dataset_id?: string;
  source_key_property?: string;
  target_key_property?: string;
  source_dataset_column?: string;
  target_dataset_column?: string;
}): Promise<LinkTypeResponse> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${config.apiUrl}/api/link-types`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(data),
    credentials: 'include',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to create link type');
  }
  return res.json();
}

export async function updateLinkType(
  linkTypeId: string,
  data: {
    name?: string;
    description?: string;
    source_object_type_id?: string;
    target_object_type_id?: string;
    cardinality?: string;
    dataset_id?: string;
    source_key_property?: string;
    target_key_property?: string;
    source_dataset_column?: string;
    target_dataset_column?: string;
  }
): Promise<LinkTypeResponse> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${config.apiUrl}/api/link-types/${linkTypeId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(data),
    credentials: 'include',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to update link type');
  }
  return res.json();
}

export async function deleteLinkType(linkTypeId: string): Promise<void> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${config.apiUrl}/api/link-types/${linkTypeId}`, {
    method: 'DELETE',
    headers: { ...headers },
    credentials: 'include',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to delete link type');
  }
}

// --- Link Instance ---

export interface LinkInstanceResponse {
  id: string;
  link_type_id: string;
  source_object_id: string;
  target_object_id: string;
  source_key_value?: string | null;  // FK value when from dataset junction table
  target_key_value?: string | null;  // FK value when from dataset junction table
  source_data?: Record<string, unknown> | null;
  target_data?: Record<string, unknown> | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface LinkInstanceListResponse {
  items: LinkInstanceResponse[];
  total: number;
}

export async function fetchLinkInstances(linkTypeId: string): Promise<LinkInstanceListResponse> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${config.apiUrl}/api/link-types/${linkTypeId}/links`, {
    headers: { ...headers },
    credentials: 'include',
  });
  if (!res.ok) throw new Error(`Failed to fetch links: ${res.status}`);
  return res.json();
}

export async function createLinkInstance(
  linkTypeId: string,
  data: { source_object_id: string; target_object_id: string }
): Promise<LinkInstanceResponse> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${config.apiUrl}/api/link-types/${linkTypeId}/links`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(data),
    credentials: 'include',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to create link');
  }
  return res.json();
}

export async function deleteLinkInstance(linkTypeId: string, linkId: string): Promise<void> {
  const headers = await getAuthHeaders();
  const res = await fetch(
    `${config.apiUrl}/api/link-types/${linkTypeId}/links/${linkId}`,
    {
      method: 'DELETE',
      headers: { ...headers },
      credentials: 'include',
    }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to delete link');
  }
}
