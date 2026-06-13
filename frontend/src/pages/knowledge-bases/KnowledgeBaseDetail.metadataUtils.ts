export function configValuesToMetadata(
  values: Record<string, string>,
  keys: string[] | null | undefined,
  isArray: Record<string, boolean>,
): Record<string, unknown> | null {
  if (!keys?.length) return null;
  const result: Record<string, unknown> = {};
  for (const k of keys) {
    const v = (values[k] ?? '').trim();
    if (v) {
      result[k] = isArray[k]
        ? v.split(',').map((s) => s.trim()).filter(Boolean)
        : v;
    }
  }
  return Object.keys(result).length ? result : null;
}

export function objToConfigValues(
  obj: Record<string, unknown> | null | undefined,
  keys: string[] | null | undefined,
): Record<string, string> {
  if (!keys?.length) return {};
  return Object.fromEntries(
    keys.map((k) => {
      const v = obj?.[k];
      return [k, Array.isArray(v) ? v.join(', ') : String(v ?? '')];
    }),
  );
}
