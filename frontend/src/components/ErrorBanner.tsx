/**
 * Error banner for page-level / blocking errors.
 * Use for initial load failures or errors that block the main content.
 * Use toast.error() for transient errors (mutations, form validation).
 */
export function ErrorBanner({
  message,
  onDismiss,
}: {
  message: string;
  onDismiss?: () => void;
}) {
  return (
    <div role="alert" className="error-banner">
      <span>{message}</span>
      {onDismiss && (
        <button type="button" onClick={onDismiss} aria-label="Dismiss error" className="error-banner__dismiss">
          ×
        </button>
      )}
    </div>
  );
}
