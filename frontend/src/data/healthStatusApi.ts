import { config } from '../config';
import { getAuthHeaders, authAwareFetch } from './apiClient';

export type HealthStatusKind = 'ok' | 'error' | 'skipped' | 'degraded';

export interface HealthComponent {
  id: string;
  label: string;
  status: HealthStatusKind;
  message: string | null;
  latency_ms: number | null;
}

export interface DataSourceHealthItem {
  id: string;
  name: string;
  kind: string;
  host: string;
  port: number | null;
  status: HealthStatusKind;
  message: string | null;
  latency_ms: number | null;
}

export interface ProcessInstanceHealth {
  role: 'worker' | 'scheduler';
  instance_id: string;
  label: string;
  status: HealthStatusKind;
  last_seen_at: string | null;
  message: string | null;
}

export interface HealthStatusResponse {
  checked_at: string;
  overall: HealthStatusKind;
  components: HealthComponent[];
  process_instances: ProcessInstanceHealth[];
  data_sources: DataSourceHealthItem[];
}

export async function fetchHealthStatus(): Promise<HealthStatusResponse> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(`${config.apiUrl}/api/admin/health-status`, {
    headers: { ...headers },
    credentials: 'include',
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch health status: ${res.status}`);
  }
  return res.json();
}
