function identifierParts(name: string): string[] {
  return name
    .trim()
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean);
}

/**
 * PascalCase identifier for object/link types: `Stock.Daily Bar` → `StockDailyBar`.
 *
 * Backend mirrors this in `app/services/ontology/api_names.py`; the value is frozen at creation,
 * so this only has to produce a *candidate* the author can accept or edit.
 */
export function toPascalCaseApiName(name: string, fallback = 'ObjectType'): string {
  const parts = identifierParts(name);
  if (parts.length === 0) return fallback;
  const pascal = parts
    .map((p) => {
      const lower = p.toLowerCase();
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join('');
  if (!/^[a-zA-Z]/.test(pascal)) return `${fallback}${pascal}`.slice(0, 128);
  return pascal.slice(0, 128);
}

export function isValidApiName(value: string): boolean {
  return /^[a-zA-Z][a-zA-Z0-9_]{0,127}$/.test(value);
}

export function toCamelCaseApiName(name: string, fallback = 'action'): string {
  const parts = identifierParts(name);
  if (parts.length === 0) return fallback;
  const camel = parts
    .map((p, i) => {
      const lower = p.toLowerCase();
      if (i === 0) return lower;
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join('');
  if (!/^[a-zA-Z]/.test(camel)) return `${fallback}${camel}`.slice(0, 128);
  return camel.slice(0, 128);
}
export function actionApiName(prefix: string, objectTypeName: string, attempt = 0): string {
  const parts = identifierParts(objectTypeName);
  const pascal = parts
    .map((p) => {
      const lower = p.toLowerCase();
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join('');
  const base = `${prefix}${pascal || 'Object'}`.slice(0, 110);
  if (attempt === 0) return base;
  return `${base}${attempt}`.slice(0, 128);
}
