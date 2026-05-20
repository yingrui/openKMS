import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  authAwareFetch,
  isRejectedJwtResponse,
  SESSION_EXPIRED_API_DETAIL,
  setSessionExpiredHandler,
  setSessionRetryProvider,
} from './apiClient';

describe('isRejectedJwtResponse', () => {
  it('returns false for non-401', () => {
    expect(isRejectedJwtResponse(403, '{"detail":"Invalid or expired token"}')).toBe(false);
  });

  it('detects FastAPI JSON detail for expired JWT', () => {
    expect(isRejectedJwtResponse(401, '{"detail":"Invalid or expired token"}')).toBe(true);
    expect(isRejectedJwtResponse(401, '{"detail": "Invalid token"}')).toBe(true);
  });

  it('detects plain-text body containing the phrase', () => {
    expect(isRejectedJwtResponse(401, 'Invalid or expired token')).toBe(true);
  });

  it('detects structured JSON detail for expired JWT', () => {
    expect(
      isRejectedJwtResponse(
        401,
        '{"detail":{"code":"INVALID_OR_EXPIRED_TOKEN","message":"令牌无效或已过期"}}',
      ),
    ).toBe(true);
    expect(
      isRejectedJwtResponse(
        401,
        '{"detail":{"code":"INVALID_CREDENTIALS","message":"Bad"}}',
      ),
    ).toBe(false);
  });

  it('detects OpenKMS i18n auth codes', () => {
    expect(
      isRejectedJwtResponse(
        401,
        '{"detail":{"code":"AUTHENTICATION_REQUIRED","message":"Sign in"}}',
      ),
    ).toBe(true);
    expect(
      isRejectedJwtResponse(
        401,
        '{"detail":{"code":"BEARER_TOKEN_REQUIRED","message":"Bearer required"}}',
      ),
    ).toBe(true);
  });

  it('returns false for other 401 reasons', () => {
    expect(isRejectedJwtResponse(401, '{"detail":"Not authenticated"}')).toBe(false);
    expect(isRejectedJwtResponse(401, '{"detail":"Invalid username or password"}')).toBe(false);
  });
});

describe('authAwareFetch', () => {
  beforeEach(() => {
    setSessionExpiredHandler(null);
    setSessionRetryProvider(null);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    setSessionExpiredHandler(null);
    setSessionRetryProvider(null);
  });

  it('passes through successful responses', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 })),
    );
    const res = await authAwareFetch('https://api.example/x');
    expect(res.status).toBe(200);
  });

  it('passes through 401 that is not a JWT mismatch', async () => {
    const handler = vi.fn();
    setSessionExpiredHandler(handler);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ detail: 'Forbidden' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );
    const res = await authAwareFetch('https://api.example/x');
    expect(handler).not.toHaveBeenCalled();
    const body = await res.json();
    expect(body.detail).toBe('Forbidden');
  });

  it('invokes session handler and returns user-facing detail for JWT rejection', async () => {
    const handler = vi.fn();
    setSessionExpiredHandler(handler);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ detail: 'Invalid or expired token' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );
    const res = await authAwareFetch('https://api.example/x');
    expect(handler).toHaveBeenCalledOnce();
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.detail).toBe(SESSION_EXPIRED_API_DETAIL);
  });

  it('invokes session handler for AUTHENTICATION_REQUIRED', async () => {
    const handler = vi.fn();
    setSessionExpiredHandler(handler);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ detail: { code: 'AUTHENTICATION_REQUIRED', message: 'Sign in' } }),
          { status: 401, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    );
    const res = await authAwareFetch('https://api.example/x');
    expect(handler).toHaveBeenCalledOnce();
    const body = await res.json();
    expect(body.detail).toBe(SESSION_EXPIRED_API_DETAIL);
  });

  it('retries once when session retry succeeds', async () => {
    const handler = vi.fn();
    setSessionExpiredHandler(handler);
    setSessionRetryProvider(vi.fn().mockResolvedValue(true));
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ detail: { code: 'AUTHENTICATION_REQUIRED', message: 'Sign in' } }),
          { status: 401, headers: { 'Content-Type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal('fetch', mockFetch);
    const res = await authAwareFetch('https://api.example/x', {
      headers: { Authorization: 'Bearer old' },
    });
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(handler).not.toHaveBeenCalled();
    expect(res.status).toBe(200);
  });

  it('invokes session handler when session retry returns false', async () => {
    const handler = vi.fn();
    setSessionExpiredHandler(handler);
    setSessionRetryProvider(vi.fn().mockResolvedValue(false));
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ detail: { code: 'INVALID_OR_EXPIRED_TOKEN', message: 'Bad token' } }),
          { status: 401, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    );
    const res = await authAwareFetch('https://api.example/x');
    expect(handler).toHaveBeenCalledOnce();
    const body = await res.json();
    expect(body.detail).toBe(SESSION_EXPIRED_API_DETAIL);
  });
});
