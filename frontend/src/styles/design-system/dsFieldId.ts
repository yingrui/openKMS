import { useId } from 'react';

/** A stable id for a control that no `FormField` wraps yet (search fields, standalone selects). */
export function useDsFieldId(prefix: string): string {
  const id = useId();
  return `${prefix}-${id}`;
}
