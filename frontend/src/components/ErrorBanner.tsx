/**
 * Error banner for page-level / blocking errors.
 * Use for initial load failures or errors that block the main content.
 * Use toast.error() for transient errors (mutations, form validation).
 */
import { useTranslation } from 'react-i18next';

export function ErrorBanner({
  message,
  onDismiss,
}: {
  message: string;
  onDismiss?: () => void;
}) {
  const { t } = useTranslation('common');
  return (
    <div role="alert" className="error-banner">
      <span>{message}</span>
      {onDismiss && (
        <button type="button" onClick={onDismiss} aria-label={t('dismissError')} className="error-banner__dismiss">
          ×
        </button>
      )}
    </div>
  );
}
