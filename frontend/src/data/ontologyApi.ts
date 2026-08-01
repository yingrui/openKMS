/** API for ontology (object types, link types, instances). */
import { request } from './apiClient';

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
  return request<ObjectTypeListResponse>('/api/object-types', {
    query: {
      count_from_neo4j: params?.countFromNeo4j ? true : undefined,
      is_master_data: params?.isMasterData,
    },
  });
}

export async function fetchObjectType(
  objectTypeId: string,
  params?: { countFromNeo4j?: boolean }
): Promise<ObjectTypeResponse> {
  return request<ObjectTypeResponse>(`/api/object-types/${objectTypeId}`, {
    query: { count_from_neo4j: params?.countFromNeo4j ? true : undefined },
  });
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
  return request<ObjectTypeResponse>('/api/object-types', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export async function updateObjectType(
  objectTypeId: string,
  data: { name?: string; description?: string; dataset_id?: string; key_property?: string; is_master_data?: boolean; display_property?: string; properties?: PropertyDef[] }
): Promise<ObjectTypeResponse> {
  return request<ObjectTypeResponse>(`/api/object-types/${objectTypeId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export async function indexObjectTypesToNeo4j(neo4jDataSourceId: string): Promise<{
  object_types_indexed: number;
  nodes_created: number;
}> {
  return request<{ object_types_indexed: number; nodes_created: number }>('/api/object-types/index-to-neo4j', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ neo4j_data_source_id: neo4jDataSourceId }),
  });
}

export async function indexObjectTypeToNeo4j(
  objectTypeId: string,
  neo4jDataSourceId: string
): Promise<{ object_types_indexed: number; nodes_created: number }> {
  return request<{ object_types_indexed: number; nodes_created: number }>(
    `/api/object-types/${encodeURIComponent(objectTypeId)}/index-to-neo4j`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ neo4j_data_source_id: neo4jDataSourceId }),
    }
  );
}

export async function generateCypherFromQuestion(question: string): Promise<{ cypher: string; explanation: string }> {
  return request<{ cypher: string; explanation: string }>('/api/ontology/text-to-cypher', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question }),
  });
}

export async function summarizeAnswer(payload: {
  question: string;
  cypher: string;
  columns: string[];
  rows: Record<string, unknown>[];
}): Promise<{ answer: string }> {
  return request<{ answer: string }>('/api/ontology/answer', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export async function executeCypherQuery(cypher: string): Promise<{ columns: string[]; rows: Record<string, unknown>[] }> {
  return request<{ columns: string[]; rows: Record<string, unknown>[] }>('/api/ontology/explore', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cypher }),
  });
}

export async function indexLinkTypesToNeo4j(neo4jDataSourceId: string): Promise<{
  link_types_indexed: number;
  relationships_created: number;
}> {
  return request<{ link_types_indexed: number; relationships_created: number }>('/api/link-types/index-to-neo4j', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ neo4j_data_source_id: neo4jDataSourceId }),
  });
}

export async function indexLinkTypeToNeo4j(
  linkTypeId: string,
  neo4jDataSourceId: string
): Promise<{ link_types_indexed: number; relationships_created: number }> {
  return request<{ link_types_indexed: number; relationships_created: number }>(
    `/api/link-types/${encodeURIComponent(linkTypeId)}/index-to-neo4j`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ neo4j_data_source_id: neo4jDataSourceId }),
    }
  );
}

export async function deleteObjectType(objectTypeId: string): Promise<void> {
  return request<void>(`/api/object-types/${objectTypeId}`, { method: 'DELETE' });
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
  return request<ObjectInstanceListResponse>(`/api/object-types/${objectTypeId}/objects`, {
    query: { search: params?.search },
  });
}

export async function createObjectInstance(
  objectTypeId: string,
  data: Record<string, unknown>
): Promise<ObjectInstanceResponse> {
  return request<ObjectInstanceResponse>(`/api/object-types/${objectTypeId}/objects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data }),
  });
}

export async function updateObjectInstance(
  objectTypeId: string,
  objectId: string,
  data: Record<string, unknown>
): Promise<ObjectInstanceResponse> {
  return request<ObjectInstanceResponse>(`/api/object-types/${objectTypeId}/objects/${objectId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data }),
  });
}

export async function deleteObjectInstance(
  objectTypeId: string,
  objectId: string
): Promise<void> {
  return request<void>(`/api/object-types/${objectTypeId}/objects/${objectId}`, { method: 'DELETE' });
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
  return request<LinkTypeListResponse>('/api/link-types', {
    query: { count_from_neo4j: params?.countFromNeo4j ? true : undefined },
  });
}

export async function fetchLinkType(
  linkTypeId: string,
  params?: { countFromNeo4j?: boolean }
): Promise<LinkTypeResponse> {
  return request<LinkTypeResponse>(`/api/link-types/${linkTypeId}`, {
    query: { count_from_neo4j: params?.countFromNeo4j ? true : undefined },
  });
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
  return request<LinkTypeResponse>('/api/link-types', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
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
  return request<LinkTypeResponse>(`/api/link-types/${linkTypeId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export async function deleteLinkType(linkTypeId: string): Promise<void> {
  return request<void>(`/api/link-types/${linkTypeId}`, { method: 'DELETE' });
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
  return request<LinkInstanceListResponse>(`/api/link-types/${linkTypeId}/links`);
}

export async function createLinkInstance(
  linkTypeId: string,
  data: { source_object_id: string; target_object_id: string }
): Promise<LinkInstanceResponse> {
  return request<LinkInstanceResponse>(`/api/link-types/${linkTypeId}/links`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export async function deleteLinkInstance(linkTypeId: string, linkId: string): Promise<void> {
  return request<void>(`/api/link-types/${linkTypeId}/links/${linkId}`, { method: 'DELETE' });
}
