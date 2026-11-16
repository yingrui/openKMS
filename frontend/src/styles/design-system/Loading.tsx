/**
 * The loading state of a page or panel: a spinner and a label, centred in whatever it is filling.
 *
 * Eight areas used to spell this out with `ds-loading` / `ds-loading__spinner` — a shared state
 * named after the console that first needed it. It is a design-system object: one component, one class.
 */
import { Loader2 } from 'lucide-react';

export function Loading({ label, className }: { label: string; className?: string }) {
  return (
    <div className={['ds-loading', className].filter(Boolean).join(' ')} role="status" aria-live="polite">
      <Loader2 className="ds-loading__spinner" size={32} aria-hidden />
      <p>{label}</p>
    </div>
  );
}
