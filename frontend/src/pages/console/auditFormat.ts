/**
 * `object-types` → "Object types": the API reports the path segment, a rail should read like a place.
 *
 * Pure and free of i18n on purpose — these are identifiers from the route table, not copy. A feature that
 * wants a prettier name than its path can be taught here, once.
 */
export function resourceLabel(value: string): string {
  const spaced = value.replace(/[-_]+/g, ' ').trim();
  if (!spaced) return value;
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}
