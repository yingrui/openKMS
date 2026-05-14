import { render, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OidcCallback } from './OidcCallback';

const navigate = vi.fn();
const signinRedirectCallback = vi.fn();

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('../oidc/userManager', () => ({
  getUserManager: () => ({
    signinRedirectCallback,
  }),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => navigate,
  };
});

describe('OidcCallback', () => {
  beforeEach(() => {
    navigate.mockReset();
    signinRedirectCallback.mockReset();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('syncs the backend session before returning home', async () => {
    signinRedirectCallback.mockResolvedValue({ access_token: 'fresh-token' });
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    render(
      <MemoryRouter>
        <OidcCallback />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(signinRedirectCallback).toHaveBeenCalledOnce();
    });
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/sync-session', {
        method: 'POST',
        headers: { Authorization: 'Bearer fresh-token' },
        credentials: 'include',
      });
    });
    await waitFor(() => {
      expect(navigate).toHaveBeenCalledWith('/', { replace: true });
    });
  });

  it('shows a friendly error when the callback cannot be completed', async () => {
    signinRedirectCallback.mockRejectedValue(new Error('state mismatch'));
    vi.stubGlobal('fetch', vi.fn());

    render(
      <MemoryRouter>
        <OidcCallback />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(navigate).toHaveBeenCalledWith(
        '/?error=signin_callback&error_description=Could%20not%20finish%20sign-in.%20Please%20try%20again.',
        { replace: true },
      );
    });
    expect(console.error).toHaveBeenCalled();
  });
});
