/** Events API — the read/triage side of the Rules app. Events live in the ontology (`Event` type). */
import { request } from './apiClient';

export type EventOut = {
  id: string;
  title: string | null;
  severity: string | null;
  intent: string | null;
  status: string | null;
  event_start_time: string | null;
  event_end_time: string | null;
  period_start: string | null;
  period_end: string | null;
  scope: string | null;
  description: string | null;
  evidence: string | null;
  rule_id: string | null;
  rule_version: number | null;
  subject_type: string | null;
  subject_id: string | null;
  assignee: string | null;
};

export type EventListResponse = { items: EventOut[]; total: number };

export type EventCount = { subject_id: string; total: number; open: number };

export async function fetchEvents(params: {
  subject_type?: 'metric' | 'dataset';
  subject_id?: string;
  rule_id?: string;
  status?: 'open' | 'acknowledged' | 'dismissed' | 'resolved';
  severity?: 'P0' | 'P1' | 'P2';
  open_only?: boolean;
  limit?: number;
  offset?: number;
} = {}): Promise<EventListResponse> {
  return request<EventListResponse>('/api/events', {
    query: {
      subject_type: params.subject_type,
      subject_id: params.subject_id,
      rule_id: params.rule_id,
      status: params.status,
      severity: params.severity,
      open_only: params.open_only ? 'true' : undefined,
      limit: params.limit,
      offset: params.offset,
    },
  });
}

export async function fetchEventSummary(
  subjectType: 'metric' | 'dataset',
): Promise<EventCount[]> {
  return request<EventCount[]>('/api/events/summary', { query: { subject_type: subjectType } });
}

export async function transitionEvent(
  eventId: string,
  payload: { status?: 'open' | 'acknowledged' | 'dismissed' | 'resolved'; assignee?: string | null; note?: string },
): Promise<EventOut> {
  return request<EventOut>(`/api/events/${eventId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}
