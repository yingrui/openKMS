import type { PropertyDef } from '../../data/ontologyApi';

/** Keep in sync with backend ONTOLOGY_PROPERTY_TYPES. */
export const PROPERTY_TYPES = ['string', 'number', 'boolean', 'date', 'datetime', 'uuid'] as const;

export type FormProperty = PropertyDef & { enabled?: boolean };

/** Platform identity on Neo4j / Explorer — not a configurable schema property. */
export const SYSTEM_RID_PROPERTY_NAME = '__rid';

/** Names that must not appear in Manager property configuration. */

/** Drop platform identity names from schema edits (legacy `id` + `__rid`). */

/** Prefer ColumnMetadata.ontology_type from the API; fallback for older responses. */


export function isReservedPropertyName(name: string): boolean {
  const n = name.trim();
  return n === SYSTEM_RID_PROPERTY_NAME || n === 'id';
}
export function withoutReservedProperties(properties: FormProperty[]): FormProperty[] {
  return properties.filter((p) => p.name.trim() && !isReservedPropertyName(p.name));
}
export function ontologyTypeFromColumn(col: {
  ontology_type?: string;
  data_type: string;
}): string {
  if (col.ontology_type && (PROPERTY_TYPES as readonly string[]).includes(col.ontology_type)) {
    return col.ontology_type;
  }
  return 'string';
}
export function toPropertyDefs(properties: FormProperty[]): PropertyDef[] {
  return properties
    .filter((p) => p.name.trim() && p.enabled !== false)
    .map((p) => {
      const { enabled, ...rest } = p;
      void enabled;
      return rest as PropertyDef;
    });
}
export function toHandCreatedPropertyDefs(properties: FormProperty[]): PropertyDef[] {
  return toPropertyDefs(withoutReservedProperties(properties));
}
