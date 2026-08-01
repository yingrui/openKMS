import { request } from './apiClient';

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
  return request<HealthStatusResponse>('/api/admin/health-status');
}
