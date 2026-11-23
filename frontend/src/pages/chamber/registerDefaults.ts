import type { KubernetesServiceItem } from '../../data/kubernetesClustersApi';

/** The identifier rule the backend enforces (`API_NAME_RE` in `api/ontology/deps.py`) — checked here first
 *  so a typo is a field message instead of a 400 after the user has left the form. */
export const API_NAME_RE = /^[a-zA-Z][a-zA-Z0-9_]*$/;

export function suggestApiName(service: string): string {
  const cleaned = service.replace(/[^a-zA-Z0-9_]/g, '_');
  const withLetter = /^[a-zA-Z]/.test(cleaned) ? cleaned : `svc_${cleaned}`;
  return withLetter.slice(0, 128);
}

export function firstPort(svc: KubernetesServiceItem): number {
  if (svc.port_numbers && svc.port_numbers.length > 0) return svc.port_numbers[0];
  const m = (svc.ports || '').match(/(\d+)/);
  return m ? Number(m[1]) : 80;
}
