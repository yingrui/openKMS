import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { config } from '../config';
import { getUserManager } from '../oidc/userManager';

export function OidcCallback() {
  const { t } = useTranslation('auth');
  const navigate = useNavigate();
  useEffect(() => {
    void (async () => {
      try {
        const user = await getUserManager().signinRedirectCallback();
        if (user?.access_token) {
          try {
            await fetch(`${config.apiUrl}/sync-session`, {
              method: 'POST',
              headers: { Authorization: `Bearer ${user.access_token}` },
              credentials: 'include',
            });
          } catch {
            // Ignore sync failures; bearer requests can still work while auth state finishes loading.
          }
        }
        navigate('/', { replace: true });
      } catch (error) {
        console.error('OIDC signin callback failed:', error);
        navigate(
          '/?error=signin_callback&error_description=Could%20not%20finish%20sign-in.%20Please%20try%20again.',
          { replace: true },
        );
      }
    })();
  }, [navigate]);
  return (
    <div className="app-loading" aria-live="polite">
      {t('signingIn')}
    </div>
  );
}
