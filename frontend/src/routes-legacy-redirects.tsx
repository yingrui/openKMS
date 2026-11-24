/**
 * Legacy URL redirects: old paths that still arrive from bookmarks, emails and other products.
 *
 * They live outside `App.tsx` because that file has a line ratchet — the route table is what it should hold, and
 * one-line redirect components are not routes.
 */
import { Navigate, useLocation, useParams } from 'react-router-dom';

export function GroupMembersLegacyRedirect() {
  const { groupId = '' } = useParams<{ groupId: string }>();
  return <Navigate to={`/console/data-security/groups/${groupId}`} replace />;
}

export function LegacyJobRunRedirect() {
  const { jobId = '' } = useParams<{ jobId: string }>();
  return <Navigate to={`/job-runs/${jobId}`} replace />;
}

export function AgentProjectSettingsRedirect() {
  const { projectId = '' } = useParams<{ projectId: string }>();
  return <Navigate to={`/projects/${projectId}/settings`} replace />;
}

export function AgentProjectWorkspaceRedirect() {
  const { projectId = '' } = useParams<{ projectId: string }>();
  return <Navigate to={`/projects/${projectId}`} replace />;
}

export function LegacyConsoleDatasetRedirect() {
  const { id } = useParams();
  return <Navigate to={`/datasets/${id ?? ''}`} replace />;
}

export function LegacyOntologyDatasetRedirect() {
  const { '*': rest } = useParams();
  const location = useLocation();
  const suffix = rest ? `/${rest}` : '';
  return <Navigate to={`/datasets${suffix}${location.search}${location.hash}`} replace />;
}

export function LegacyOntologyActionsRedirect() {
  const { actionId = '', '*': rest } = useParams();
  const location = useLocation();
  const path = rest
    ? `/ontology-manager/action-types/${actionId}/${rest}`
    : `/ontology-manager/action-types/${actionId}`;
  return <Navigate to={`${path}${location.search}${location.hash}`} replace />;
}

export function LegacyExplorerObjectRedirect() {
  const { typeId = '' } = useParams();
  return <Navigate to={`/ontology-manager/object-types/${typeId}/instances`} replace />;
}

export function LegacyExplorerLinkRedirect() {
  const { typeId = '' } = useParams();
  return <Navigate to={`/ontology-manager/link-types/${typeId}`} replace />;
}

export function LegacyOntologyRedirect() {
  const location = useLocation();
  const rest = location.pathname.replace(/^\/ontology/, '') + location.search + location.hash;
  return <Navigate to={`/ontology-manager${rest || ''}`} replace />;
}

export function LegacyObjectsRedirect() {
  const location = useLocation();
  const rest = location.pathname.replace(/^\/objects/, '/objects') + location.search + location.hash;
  return <Navigate to={`/object-explorer${rest}`} replace />;
}

export function LegacyLinksRedirect() {
  const location = useLocation();
  const rest = location.pathname.replace(/^\/links/, '/links') + location.search + location.hash;
  return <Navigate to={`/object-explorer${rest}`} replace />;
}

export function LegacyChamberSettingsRedirect() {
  const { appId = '' } = useParams();
  const location = useLocation();
  return <Navigate to={`/chamber/${appId}/settings${location.search}${location.hash}`} replace />;
}

export function LegacyAppsRedirect() {
  const location = useLocation();
  const rest = location.pathname.replace(/^\/apps/, '') + location.search + location.hash;
  return <Navigate to={`/chamber${rest}`} replace />;
}

