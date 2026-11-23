import { chamberAppProxyUrl } from '../../data/chamberApi';

const PROBE_TIMEOUT_MS = 8000;

/** Why the app did not answer. The proxy already knows; until now that knowledge stopped at an HTTP status. */
export type ProbeFailure = 'unreachable' | 'bindings' | 'auth' | 'missing' | 'unknown';

export type Probe =
  | { kind: 'checking' }
  | { kind: 'ok' }
  | { kind: 'failed'; reason: ProbeFailure; status?: number };

/**
 * One `HEAD` through the proxy before the frame is trusted with the page.
 *
 * `HEAD` because the probe must not fetch (or render, or side-effect) the app: the proxy answers the app's own
 * status, so 405 still means "reachable". A 502/504 is the proxy saying it could not reach the Service, 400 is its
 * bindings check, 401/403 is this platform refusing the request, 404 is "not registered" — or the app's own 404 at
 * its root, which the message says out loud rather than guessing.
 */
export async function probeService(appId: string): Promise<Probe> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    const resp = await fetch(chamberAppProxyUrl(appId), {
      method: 'HEAD',
      credentials: 'same-origin',
      cache: 'no-store',
      signal: controller.signal,
    });
    return classifyProbeStatus(resp.status);
  } catch {
    // Timeout or network failure: the proxy never answered, so nothing is known about the app either way.
    return { kind: 'failed', reason: 'unknown' };
  } finally {
    window.clearTimeout(timer);
  }
}

/** The status → reason mapping, separated so it can be asserted without a network. */
export function classifyProbeStatus(status: number): Probe {
  if (status === 502 || status === 504) return { kind: 'failed', reason: 'unreachable', status };
  if (status === 400) return { kind: 'failed', reason: 'bindings', status };
  if (status === 401 || status === 403) return { kind: 'failed', reason: 'auth', status };
  if (status === 404) return { kind: 'failed', reason: 'missing', status };
  // Everything else, 405 included, means the Service answered: the app is reachable.
  return { kind: 'ok' };
}
