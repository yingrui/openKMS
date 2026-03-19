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
    <div
      role="alert"
      className="error-banner"
      style={{
        padding: '0.75rem 1rem',
        background: 'var(--error-bg, #fef2f2)',
        color: 'var(--error-fg, #b91c1c)',
        borderRadius: '6px',
        marginBottom: '1rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '0.5rem',
      }}
    >
      <span>{message}</span>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss error"
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: '0.25rem',
            fontSize: '1rem',
          }}
        >
          ×
        </button>
      )}
    </div>
  );
}
