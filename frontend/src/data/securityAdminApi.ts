import { config } from '../config';
import { getAuthHeaders } from './apiClient';

export type PermissionCatalogEntry = {
  key: string;
  label: string;
  description: string;
  frontend_route_patterns: string[];
  backend_api_patterns: string[];
};

export type SecurityRoleOut = {
  id: string;
  name: string;
  description: string | null;
  permission_keys: string[];
  is_system_role?: boolean;
};

export type SecurityRolesPageResponse = {
  auth_mode: string;
  managed_in_console: boolean;
  idp_notice: string | null;
  roles: SecurityRoleOut[];
};

async function parseError(res: Response): Promise<string> {
  let msg = res.statusText;
  try {
    const j = await res.json();
    if (typeof j.detail === 'string') msg = j.detail;
  } catch {
    /* ignore */
  }
  return msg;
}

export type FrontendFeatureRef = {
  path_pattern: string;
  label: string;
  section: string;
  note?: string | null;
};

export type ApiOperationRef = {
  method: string;
  path: string;
  summary: string;
  tags: string[];
};

export type OperationKeyHintRef = {
  key: string;
  label: string;
  description: string;
  category: string;
};

export type PermissionReferenceResponse = {
  frontend_features: FrontendFeatureRef[];
  api_operations: ApiOperationRef[];
  operation_key_hints: OperationKeyHintRef[];
  hint: string;
};

export async function fetchPermissionReference(): Promise<PermissionReferenceResponse> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${config.apiUrl}/api/admin/permission-reference`, {
    headers: { ...headers },
    credentials: 'include',
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export type SecurityPermissionRowOut = {
  id: string;
  key: string;
  label: string;
  description: string | null;
  frontend_route_patterns: string[];
  backend_api_patterns: string[];
  sort_order: number;
  created_at: string | null;
};

export async function createSecurityPermission(body: {
  key: string;
  label: string;
  description?: string | null;
  frontend_route_patterns?: string[];
  backend_api_patterns?: string[];
}): Promise<SecurityPermissionRowOut> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${config.apiUrl}/api/admin/security-permissions`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({
      key: body.key,
      label: body.label,
      description: body.description ?? null,
      frontend_route_patterns: body.frontend_route_patterns ?? [],
      backend_api_patterns: body.backend_api_patterns ?? [],
    }),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function fetchSecurityPermissions(): Promise<SecurityPermissionRowOut[]> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${config.apiUrl}/api/admin/security-permissions`, {
    headers: { ...headers },
    credentials: 'include',
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function patchSecurityPermission(
  permissionId: string,
  body: {
    label?: string;
    description?: string | null;
    frontend_route_patterns?: string[];
    backend_api_patterns?: string[];
    sort_order?: number;
  }
): Promise<SecurityPermissionRowOut> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${config.apiUrl}/api/admin/security-permissions/${permissionId}`, {
    method: 'PATCH',
    headers: { ...headers, 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function deleteSecurityPermission(permissionId: string): Promise<void> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${config.apiUrl}/api/admin/security-permissions/${permissionId}`, {
    method: 'DELETE',
    headers: { ...headers },
    credentials: 'include',
  });
  if (!res.ok) throw new Error(await parseError(res));
}

export async function fetchPermissionCatalog(): Promise<PermissionCatalogEntry[]> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${config.apiUrl}/api/auth/permission-catalog`, {
    headers: { ...headers },
    credentials: 'include',
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function fetchSecurityRolesPage(): Promise<SecurityRolesPageResponse> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${config.apiUrl}/api/admin/security-roles`, {
    headers: { ...headers },
    credentials: 'include',
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function createSecurityRole(body: {
  name: string;
  description?: string | null;
}): Promise<SecurityRoleOut> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${config.apiUrl}/api/admin/security-roles`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function deleteSecurityRole(roleId: string): Promise<void> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${config.apiUrl}/api/admin/security-roles/${roleId}`, {
    method: 'DELETE',
    headers: { ...headers },
    credentials: 'include',
  });
  if (!res.ok) throw new Error(await parseError(res));
}

export async function putRolePermissions(roleId: string, permissionKeys: string[]): Promise<SecurityRoleOut> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${config.apiUrl}/api/admin/security-roles/${roleId}/permissions`, {
    method: 'PUT',
    headers: { ...headers, 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ permission_keys: permissionKeys }),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export type AccessGroupOut = { id: string; name: string; description: string | null };

export async function fetchAccessGroups(): Promise<AccessGroupOut[]> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${config.apiUrl}/api/admin/groups`, {
    headers: { ...headers },
    credentials: 'include',
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function createAccessGroup(body: {
  name: string;
  description?: string | null;
}): Promise<AccessGroupOut> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${config.apiUrl}/api/admin/groups`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function patchAccessGroup(
  id: string,
  body: { name?: string; description?: string | null }
): Promise<AccessGroupOut> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${config.apiUrl}/api/admin/groups/${id}`, {
    method: 'PATCH',
    headers: { ...headers, 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function deleteAccessGroup(id: string): Promise<void> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${config.apiUrl}/api/admin/groups/${id}`, {
    method: 'DELETE',
    headers: { ...headers },
    credentials: 'include',
  });
  if (!res.ok) throw new Error(await parseError(res));
}

export type LocalUserBrief = { id: string; email: string; username: string };

export async function fetchGroupMembers(groupId: string): Promise<{ users: LocalUserBrief[] }> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${config.apiUrl}/api/admin/groups/${groupId}/members`, {
    headers: { ...headers },
    credentials: 'include',
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function putGroupMembers(groupId: string, userIds: string[]) {
  const headers = await getAuthHeaders();
  const res = await fetch(`${config.apiUrl}/api/admin/groups/${groupId}/members`, {
    method: 'PUT',
    headers: { ...headers, 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ user_ids: userIds }),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json() as Promise<{ users: LocalUserBrief[] }>;
}

export type GroupScopesOut = {
  channel_ids: string[];
  knowledge_base_ids: string[];
  wiki_space_ids: string[];
  evaluation_dataset_ids: string[];
  dataset_ids: string[];
  object_type_ids: string[];
  link_type_ids: string[];
  data_resource_ids: string[];
};

export async function fetchGroupScopes(groupId: string): Promise<GroupScopesOut> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${config.apiUrl}/api/admin/groups/${groupId}/scopes`, {
    headers: { ...headers },
    credentials: 'include',
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export type DataResourceOut = {
  id: string;
  name: string;
  description: string | null;
  resource_kind: string;
  attributes: Record<string, unknown>;
  anchor_channel_id: string | null;
  anchor_knowledge_base_id: string | null;
};

export async function fetchDataResources(): Promise<DataResourceOut[]> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${config.apiUrl}/api/admin/data-resources`, {
    headers: { ...headers },
    credentials: 'include',
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function fetchResourceKinds(): Promise<string[]> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${config.apiUrl}/api/admin/data-resources/kinds`, {
    headers: { ...headers },
    credentials: 'include',
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function createDataResource(body: {
  name: string;
  description?: string | null;
  resource_kind: string;
  attributes?: Record<string, unknown>;
  anchor_channel_id?: string | null;
  anchor_knowledge_base_id?: string | null;
}): Promise<DataResourceOut> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${config.apiUrl}/api/admin/data-resources`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function patchDataResource(
  id: string,
  body: {
    name?: string;
    description?: string | null;
    resource_kind?: string;
    attributes?: Record<string, unknown>;
    anchor_channel_id?: string | null;
    anchor_knowledge_base_id?: string | null;
  }
): Promise<DataResourceOut> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${config.apiUrl}/api/admin/data-resources/${id}`, {
    method: 'PATCH',
    headers: { ...headers, 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function deleteDataResource(id: string): Promise<void> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${config.apiUrl}/api/admin/data-resources/${id}`, {
    method: 'DELETE',
    headers: { ...headers },
    credentials: 'include',
  });
  if (!res.ok) throw new Error(await parseError(res));
}

export async function putGroupScopes(groupId: string, body: Partial<GroupScopesOut>) {
  const headers = await getAuthHeaders();
  const res = await fetch(`${config.apiUrl}/api/admin/groups/${groupId}/scopes`, {
    method: 'PUT',
    headers: { ...headers, 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json() as Promise<GroupScopesOut>;
}
