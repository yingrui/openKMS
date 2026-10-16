/** Why a query failed — the three causes the backend classifies, kept apart on screen. */
export type QueryFailureKind = 'definition' | 'request' | 'data';

/** Narrow a backend-reported cause into the set the notice renders. */
export function asQueryFailureKind(value: string | null | undefined): QueryFailureKind | undefined {
  return value === 'definition' || value === 'request' || value === 'data' ? value : undefined;
}
