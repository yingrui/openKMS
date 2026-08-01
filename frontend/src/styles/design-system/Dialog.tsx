import {
  useCallback,
  useEffect,
  useId,
  useRef,
  type ReactNode,
  type MouseEvent as ReactMouseEvent,
} from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

export type DialogSize = 'sm' | 'md' | 'lg';

export type DialogProps = {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  /** Optional title shown in the header. Prefer with titleId for a11y. */
  title?: ReactNode;
  titleId?: string;
  size?: DialogSize;
  /** Extra class on the panel (e.g. feature-specific layout). */
  className?: string;
  /** Extra class on the scrollable body. */
  bodyClassName?: string;
  /** Optional footer below the body (actions row). */
  footer?: ReactNode;
  /** When true, Escape / overlay click / close button do nothing. */
  closeDisabled?: boolean;
  /** Hide the default header close button (e.g. custom chrome). */
  hideCloseButton?: boolean;
  /** Accessible name when title is not text / no titleId. */
  'aria-label'?: string;
  closeAriaLabel?: string;
};

const FOCUSABLE =
  'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

/**
 * Shared modal dialog: Escape / overlay dismiss, focus trap, body scroll lock,
 * viewport-safe width (`min(--dialog-w, 100vw - 2rem)`) and `max-height: 90dvh`.
 */
export function Dialog({
  open,
  onClose,
  children,
  title,
  titleId: titleIdProp,
  size = 'md',
  className,
  bodyClassName,
  footer,
  closeDisabled = false,
  hideCloseButton = false,
  'aria-label': ariaLabel,
  closeAriaLabel = 'Close',
}: DialogProps) {
  const autoId = useId();
  const titleId = titleIdProp ?? (title ? autoId : undefined);
  const panelRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  const requestClose = useCallback(() => {
    if (!closeDisabled) onClose();
  }, [closeDisabled, onClose]);
  const requestCloseRef = useRef(requestClose);
  requestCloseRef.current = requestClose;

  // Only run when `open` flips — not when onClose/closeDisabled identity changes
  // (parent re-renders on every keystroke would otherwise steal focus back to the
  // first focusable, usually the header close button).
  useEffect(() => {
    if (!open) return;
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const panel = panelRef.current;
    const preferred =
      panel?.querySelector<HTMLElement>(
        'input:not([disabled]):not([type="hidden"]):not([type="button"]):not([type="submit"]),textarea:not([disabled]),select:not([disabled])',
      ) ??
      panel?.querySelectorAll<HTMLElement>(FOCUSABLE)[0] ??
      panel;
    preferred?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        requestCloseRef.current();
        return;
      }
      if (e.key !== 'Tab' || !panel) return;
      const nodes = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => !el.hasAttribute('disabled') && el.tabIndex !== -1,
      );
      if (nodes.length === 0) {
        e.preventDefault();
        panel.focus();
        return;
      }
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      document.body.style.overflow = prevOverflow;
      previouslyFocused.current?.focus?.();
    };
  }, [open]);

  if (!open || typeof document === 'undefined') return null;

  const onOverlayClick = (e: ReactMouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) requestClose();
  };

  const panelClass = [
    'ds-dialog',
    size !== 'md' ? `ds-dialog--${size}` : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return createPortal(
    <div className="ds-dialog-overlay" role="presentation" onClick={onOverlayClick}>
      <div
        ref={panelRef}
        className={panelClass}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-label={titleId ? undefined : ariaLabel}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        {(title != null || !hideCloseButton) && (
          <div className="ds-dialog__header">
            {title != null ? (
              <h2 id={titleId} className="ds-dialog__title">
                {title}
              </h2>
            ) : (
              <span />
            )}
            {!hideCloseButton && (
              <button
                type="button"
                className="ds-dialog__close"
                onClick={requestClose}
                disabled={closeDisabled}
                aria-label={closeAriaLabel}
              >
                <X size={20} aria-hidden />
              </button>
            )}
          </div>
        )}
        <div className={['ds-dialog__body', bodyClassName].filter(Boolean).join(' ')}>{children}</div>
        {footer != null ? <div className="ds-dialog__footer">{footer}</div> : null}
      </div>
    </div>,
    document.body,
  );
}
