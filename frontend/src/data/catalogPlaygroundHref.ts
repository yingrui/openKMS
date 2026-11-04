/** Minimal query seed for Catalog Playground deep-links (KB evidence, Insights findings, …). */
export type CatalogPlaygroundQuerySeed = {
  mode?: string | null;
  metric?: string | null;
  expression?: string | null;
  sql?: string | null;
};

/**
 * Deep-link into Catalog Playground with a query seed.
 * Prefer SQL Lab when SQL is present; otherwise seed Builder / Advanced.
 */
export function playgroundHrefFromDataQuery(
  modelId: string,
  dq: CatalogPlaygroundQuerySeed | null | undefined,
): string {
  const id = modelId.trim();
  if (!id) return '/data-model';
  const base = `/data-model/${encodeURIComponent(id)}/playground`;

  const sql = (dq?.sql || '').trim();
  if (sql) {
    const p = new URLSearchParams();
    p.set('mode', 'sql');
    p.set('sql', sql);
    return `${base}?${p.toString()}`;
  }

  const metric = (dq?.metric || '').trim();
  if (metric) {
    const p = new URLSearchParams();
    p.set('mode', 'builder');
    p.set('q', JSON.stringify({ metric }));
    return `${base}?${p.toString()}`;
  }

  const expression = (dq?.expression || '').trim();
  if (expression) {
    const p = new URLSearchParams();
    p.set('mode', 'advanced');
    p.set('q', JSON.stringify({ expression }));
    return `${base}?${p.toString()}`;
  }

  return base;
}
