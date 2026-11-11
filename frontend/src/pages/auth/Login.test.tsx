import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Login } from './Login';

const navigate = vi.fn();

const authState = {
  authMode: 'oidc' as 'oidc' | 'local',
  authModeReady: true,
  allowSignup: false,
  completeLocalSession: vi.fn(),
  isAuthenticated: false,
  login: vi.fn(),
};

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => authState,
}));

vi.mock('react-i18next', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-i18next')>();
  return {
    ...actual,
    useTranslation: () => ({ t: (key: string) => key }),
  };
});

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => navigate,
  };
});

describe('Login', () => {
  beforeEach(() => {
    navigate.mockReset();
    authState.login.mockReset();
    authState.isAuthenticated = false;
    authState.authMode = 'oidc';
  });

  it('shows an explicit sign-in action instead of redirecting in OIDC mode', () => {
    render(
      <MemoryRouter initialEntries={['/login?notice=session_expired']}>
        <Login />
      </MemoryRouter>,
    );

    expect(screen.getByText('sessionExpired')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'signInButton' }));

    expect(authState.login).toHaveBeenCalledOnce();
    expect(navigate).not.toHaveBeenCalledWith('/', expect.anything());
  });

  it('leaves the login page when the session is already authenticated', async () => {
    authState.isAuthenticated = true;
    render(
      <MemoryRouter initialEntries={['/login']}>
        <Login />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(navigate).toHaveBeenCalledWith('/', { replace: true });
    });
  });
});
