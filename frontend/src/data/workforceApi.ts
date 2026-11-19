/** Workforce agents — Q&A services that put a knowledge base to work for external callers. */
import { request } from './apiClient';
import type { KbAgentConfig } from './knowledgeBasesApi';

export interface WorkforceAgentResponse {
  id: string;
  name: string;
  description?: string | null;
  status: 'active' | 'archived';
  owner_sub: string;
  owner_name?: string | null;
  /** Enabled skills; null means the qa-agent core set. */
  agent_skills?: string[] | null;
  /** The agent's half of the runtime configuration. `retrieval` is not here — it belongs to the source. */
  agent_config?: KbAgentConfig | null;
  origin_knowledge_base_id?: string | null;
  knowledge_base_count: number;
  semantic_model_count: number;
  ontology_group_count: number;
  credential_count: number;
  created_at: string;
  updated_at: string;
}

export interface WorkforceKbBinding {
  id: string;
  knowledge_base_id: string;
  knowledge_base_name?: string | null;
  label?: string | null;
  priority: number;
  created_at: string;
}

export interface WorkforceSemanticModelBinding {
  id: string;
  semantic_model_id: string;
  name: string;
  description?: string | null;
  created_at: string;
}

export interface WorkforceOntologyGroupBinding {
  id: string;
  ontology_group_id: string;
  display_name: string;
  description?: string | null;
  created_at: string;
}

export interface WorkforceAgentDetail extends WorkforceAgentResponse {
  knowledge_bases: WorkforceKbBinding[];
  semantic_models: WorkforceSemanticModelBinding[];
  ontology_groups: WorkforceOntologyGroupBinding[];
}

export interface WorkforceAgentListResponse {
  items: WorkforceAgentResponse[];
  total: number;
  limit: number;
  offset: number;
}

export interface WorkforceCredential {
  id: string;
  name: string;
  key_prefix: string;
  created_at: string;
  last_used_at?: string | null;
  revoked_at?: string | null;
}

export interface WorkforceCredentialCreated {
  id: string;
  name: string;
  /** Returned once. Only its hash is stored. */
  token: string;
  key_prefix: string;
  created_at: string;
}

type AgentConfigInput = Omit<KbAgentConfig, 'retrieval'>;

export async function fetchWorkforceAgents(params?: {
  limit?: number;
  offset?: number;
}): Promise<WorkforceAgentListResponse> {
  return request<WorkforceAgentListResponse>('/api/workforce/agents', {
    query: { limit: params?.limit, offset: params?.offset },
  });
}

export async function fetchWorkforceAgent(agentId: string): Promise<WorkforceAgentDetail> {
  return request<WorkforceAgentDetail>(`/api/workforce/agents/${agentId}`);
}

export async function createWorkforceAgent(data: {
  name: string;
  description?: string | null;
  agent_skills?: string[] | null;
  agent_config?: AgentConfigInput | null;
  knowledge_base_ids?: string[];
}): Promise<WorkforceAgentDetail> {
  return request<WorkforceAgentDetail>('/api/workforce/agents', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export async function updateWorkforceAgent(
  agentId: string,
  data: {
    name?: string;
    description?: string | null;
    agent_skills?: string[] | null;
    agent_config?: AgentConfigInput | null;
  },
): Promise<WorkforceAgentDetail> {
  return request<WorkforceAgentDetail>(`/api/workforce/agents/${agentId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export async function deleteWorkforceAgent(agentId: string): Promise<void> {
  return request<void>(`/api/workforce/agents/${agentId}`, { method: 'DELETE' });
}

export async function addWorkforceKb(
  agentId: string,
  data: { knowledge_base_id: string; label?: string | null; priority?: number },
): Promise<WorkforceKbBinding> {
  return request<WorkforceKbBinding>(`/api/workforce/agents/${agentId}/knowledge-bases`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export async function removeWorkforceKb(agentId: string, bindingId: string): Promise<void> {
  return request<void>(`/api/workforce/agents/${agentId}/knowledge-bases/${bindingId}`, {
    method: 'DELETE',
  });
}

export async function addWorkforceSemanticModel(
  agentId: string,
  semanticModelId: string,
): Promise<WorkforceSemanticModelBinding> {
  return request<WorkforceSemanticModelBinding>(`/api/workforce/agents/${agentId}/semantic-models`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ semantic_model_id: semanticModelId }),
  });
}

export async function removeWorkforceSemanticModel(
  agentId: string,
  bindingId: string,
): Promise<void> {
  return request<void>(`/api/workforce/agents/${agentId}/semantic-models/${bindingId}`, {
    method: 'DELETE',
  });
}

export async function addWorkforceOntologyGroup(
  agentId: string,
  ontologyGroupId: string,
): Promise<WorkforceOntologyGroupBinding> {
  return request<WorkforceOntologyGroupBinding>(
    `/api/workforce/agents/${agentId}/ontology-groups`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ontology_group_id: ontologyGroupId }),
    },
  );
}

export async function removeWorkforceOntologyGroup(
  agentId: string,
  bindingId: string,
): Promise<void> {
  return request<void>(`/api/workforce/agents/${agentId}/ontology-groups/${bindingId}`, {
    method: 'DELETE',
  });
}

export async function fetchWorkforceCredentials(
  agentId: string,
): Promise<{ items: WorkforceCredential[] }> {
  return request<{ items: WorkforceCredential[] }>(`/api/workforce/agents/${agentId}/credentials`);
}

export async function createWorkforceCredential(
  agentId: string,
  name: string,
): Promise<WorkforceCredentialCreated> {
  return request<WorkforceCredentialCreated>(`/api/workforce/agents/${agentId}/credentials`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
}

export async function revokeWorkforceCredential(
  agentId: string,
  credentialId: string,
): Promise<void> {
  return request<void>(`/api/workforce/agents/${agentId}/credentials/${credentialId}`, {
    method: 'DELETE',
  });
}
