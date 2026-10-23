import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { AuditLogPage } from './AuditLogPage';
import { fetchAuditEvents, fetchAuditFacets } from '../../data/auditApi';

vi.mock('../../data/auditApi', () => ({
  fetchAuditEvents: vi.fn(),
  fetchAuditFacets: vi.fn(),
}));

const event = (id: string) => ({
  id,
  at: '2026-10-23T11:00:00Z',
  actor_sub: 'u1',
  actor_name: 'someone@example.com',
  auth_mode: 'api_key',
  method: 'POST',
  path: '/api/stories',
  status_code: 201,
  resource_type: 'stories',
  resource_id: null,
  resource_label: 'A story',
  detail: null,
});

const mockPage = (total: number, items: ReturnType<typeof event>[]) => {
  vi.mocked(fetchAuditEvents).mockResolvedValue({ total, items });
  vi.mocked(fetchAuditFacets).mockResolvedValue({
    resource_types: [{ value: 'stories', label: null, count: total }],
    statuses: [{ value: 'ok', label: null, count: total }],
    actors: [],
    since: '2026-09-23T00:00:00Z',
  });
};

const pager = () => document.querySelector('.ds-pagination');

/**
 * The pager's *presence*, not its visibility: jsdom has no layout engine, so it cannot see the clip that made
 * this page's pager invisible (a flex column shrinking the card, whose `overflow-y: hidden` then cut the pager
 * off). What it can pin is the structural contract that broke twice — the pager must be inside the table card,
 * and it must survive an empty page, because it is the way back.
 */
describe('AuditLogPage pager', () => {
  it('sits inside the table card, as the Documents list has it', async () => {
    mockPage(478, Array.from({ length: 25 }, (_, i) => event(`e${i}`)));
    render(<AuditLogPage />);
    await waitFor(() => expect(screen.getAllByText(/someone@example\.com/).length).toBeGreaterThan(0));
    expect(pager()).not.toBeNull();
    expect(pager()?.closest('.ds-table-wrap')).not.toBeNull();
  });

  it('is absent when there is nothing at all to page', async () => {
    mockPage(0, []);
    render(<AuditLogPage />);
    await waitFor(() => expect(screen.queryAllByText(/someone@example\.com/)).toHaveLength(0));
    expect(pager()).toBeNull();
  });

  it('survives an empty page, because it is the way back', async () => {
    mockPage(478, []);
    render(<AuditLogPage />);
    await waitFor(() => expect(pager()).not.toBeNull());
  });
});
