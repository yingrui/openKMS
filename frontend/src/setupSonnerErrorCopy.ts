/**
 * Adds a default "copy message" action to every Sonner error toast (string messages only).
 * Import once from main.tsx before App renders.
 */
import { createElement } from 'react';
import { Copy } from 'lucide-react';
import { toast } from 'sonner';

function plainMessage(message: Parameters<typeof toast.error>[0]): string {
  if (typeof message === 'string' || typeof message === 'number') return String(message);
  return '';
}

const g = toast as unknown as { __openkmsSonnerErrorWrapped?: boolean };
if (!g.__openkmsSonnerErrorWrapped) {
  g.__openkmsSonnerErrorWrapped = true;
  const originalError = toast.error.bind(toast);
  toast.error = (message, data) => {
    const text = plainMessage(message);
    const hasAction = data != null && data.action !== undefined && data.action !== null;
    return originalError(message, {
      duration: data?.duration ?? 14_000,
      ...data,
      action: hasAction
        ? data!.action
        : {
            label: createElement(
              'span',
              { style: { display: 'inline-flex', alignItems: 'center', gap: 6 } },
              createElement(Copy, { size: 16, strokeWidth: 2, 'aria-hidden': true }),
              createElement('span', { className: 'sr-only' }, 'Copy error message')
            ),
            onClick: (e) => {
              e.preventDefault();
              if (!text) return;
              void navigator.clipboard.writeText(text).then(() => {
                toast.success('Copied', { id: 'toast-copy-ack', duration: 2000 });
              });
            },
          },
    });
  };
}
