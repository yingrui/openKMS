import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Dialog } from '../styles/design-system/Dialog';

export type ConfirmOptions = {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Destructive styling for the confirm button. */
  danger?: boolean;
};

type ConfirmFn = (opts: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

type Pending = ConfirmOptions & {
  resolve: (value: boolean) => void;
};

/** Provider for `useConfirm()`. Mount once under the app shell (e.g. MainLayout). */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null);
  const pendingRef = useRef<Pending | null>(null);

  const confirm = useCallback<ConfirmFn>((opts) => {
    return new Promise<boolean>((resolve) => {
      const next: Pending = { ...opts, resolve };
      pendingRef.current = next;
      setPending(next);
    });
  }, []);

  const settle = useCallback((value: boolean) => {
    const cur = pendingRef.current;
    pendingRef.current = null;
    setPending(null);
    cur?.resolve(value);
  }, []);

  const value = useMemo(() => confirm, [confirm]);

  return (
    <ConfirmContext.Provider value={value}>
      {children}
      <Dialog
        open={pending != null}
        onClose={() => settle(false)}
        title={pending?.title}
        size="sm"
        footer={
          pending ? (
            <>
              <button type="button" className="btn btn-secondary" onClick={() => settle(false)}>
                {pending.cancelLabel ?? 'Cancel'}
              </button>
              <button
                type="button"
                className={pending.danger ? 'btn btn-danger' : 'btn btn-primary'}
                onClick={() => settle(true)}
              >
                {pending.confirmLabel ?? 'Confirm'}
              </button>
            </>
          ) : null
        }
      >
        {pending ? <p className="ds-confirm-message">{pending.message}</p> : null}
      </Dialog>
    </ConfirmContext.Provider>
  );
}

/** Returns `confirm(opts) => Promise<boolean>`. Prefer over `window.confirm`. */
export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  if (!ctx) {
    throw new Error('useConfirm must be used within ConfirmProvider');
  }
  return ctx;
}
