import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { getUserManager } from '../oidc/userManager';

export function OidcCallback() {
  const { t } = useTranslation('auth');
  const navigate = useNavigate();
  useEffect(() => {
    void getUserManager()
      .signinRedirectCallback()
      .then(() => navigate('/', { replace: true }))
      .catch(() => navigate('/?error=signin_callback', { replace: true }));
  }, [navigate]);
  return (
    <div className="app-loading" aria-live="polite">
      {t('signingIn')}
    </div>
  );
}
