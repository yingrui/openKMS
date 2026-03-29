import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getUserManager } from '../oidc/userManager';

export function OidcCallback() {
  const navigate = useNavigate();
  useEffect(() => {
    void getUserManager()
      .signinRedirectCallback()
      .then(() => navigate('/', { replace: true }))
      .catch(() => navigate('/?error=signin_callback', { replace: true }));
  }, [navigate]);
  return (
    <div className="app-loading" aria-live="polite">
      Signing in…
    </div>
  );
}
