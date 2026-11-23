import { describe, expect, it } from 'vitest';
import { classifyProbeStatus } from './chamberProbe';

describe('classifyProbeStatus', () => {
  it('reads the proxy failures as four different sentences', () => {
    expect(classifyProbeStatus(502)).toMatchObject({ reason: 'unreachable', status: 502 });
    expect(classifyProbeStatus(504)).toMatchObject({ reason: 'unreachable', status: 504 });
    expect(classifyProbeStatus(400)).toMatchObject({ reason: 'bindings' });
    expect(classifyProbeStatus(401)).toMatchObject({ reason: 'auth' });
    expect(classifyProbeStatus(403)).toMatchObject({ reason: 'auth' });
    expect(classifyProbeStatus(404)).toMatchObject({ reason: 'missing' });
  });

  it('treats any other answer as reachable — 405 included, since HEAD is not every app\'s method', () => {
    expect(classifyProbeStatus(200)).toEqual({ kind: 'ok' });
    expect(classifyProbeStatus(302)).toEqual({ kind: 'ok' });
    expect(classifyProbeStatus(405)).toEqual({ kind: 'ok' });
    expect(classifyProbeStatus(500)).toEqual({ kind: 'ok' });
  });

  it('keeps the status on a failure so the panel can show it', () => {
    const failed = classifyProbeStatus(504);
    expect(failed.kind).toBe('failed');
    expect(failed.kind === 'failed' && failed.status).toBe(504);
  });
});
