import { Plus, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { PropertyDef } from '../../data/ontologyApi';

/** Keep in sync with backend ONTOLOGY_PROPERTY_TYPES. */
export const PROPERTY_TYPES = ['string', 'number', 'boolean', 'date', 'datetime', 'uuid'] as const;

export type FormProperty = PropertyDef & { enabled?: boolean };

/** Platform identity on Neo4j / Explorer — not a configurable schema property. */
export const SYSTEM_RID_PROPERTY_NAME = '__rid';

/** Names that must not appear in Manager property configuration. */
export function isReservedPropertyName(name: string): boolean {
  const n = name.trim();
  return n === SYSTEM_RID_PROPERTY_NAME || n === 'id';
}

/** Drop platform identity names from schema edits (legacy `id` + `__rid`). */
export function withoutReservedProperties(properties: FormProperty[]): FormProperty[] {
  return properties.filter((p) => p.name.trim() && !isReservedPropertyName(p.name));
}

/** Prefer ColumnMetadata.ontology_type from the API; fallback for older responses. */
export function ontologyTypeFromColumn(col: {
  ontology_type?: string;
  data_type: string;
}): string {
  if (col.ontology_type && (PROPERTY_TYPES as readonly string[]).includes(col.ontology_type)) {
    return col.ontology_type;
  }
  return 'string';
}

export function PropertyRow({
  prop,
  fromDataset,
  nameTypeReadOnly,
  isPrimaryKey,
  onPrimaryKeyChange,
  onChange,
  onRemove,
  onToggleEnabled,
}: {
  prop: FormProperty;
  fromDataset: boolean;
  nameTypeReadOnly: boolean;
  isPrimaryKey?: boolean;
  onPrimaryKeyChange?: () => void;
  onChange: (p: FormProperty) => void;
  onRemove: () => void;
  onToggleEnabled?: (enabled: boolean) => void;
}) {
  const { t } = useTranslation('ontology');
  return (
    <div className="console-obj-property-row">
      {fromDataset && onToggleEnabled && (
        <label className="console-obj-property-enabled" title={t('objectTypes.includeProperty')}>
          <input
            type="checkbox"
            className="ds-checkbox"
            checked={prop.enabled !== false}
            onChange={(e) => onToggleEnabled(e.target.checked)}
          />
        </label>
      )}
      {onPrimaryKeyChange ? (
        <label className="console-obj-property-primary" title={t('objectTypes.primaryKey')}>
          <input
            type="checkbox"
            className="ds-checkbox"
            checked={!!isPrimaryKey}
            onChange={() => onPrimaryKeyChange()}
          />
        </label>
      ) : null}
      <input
        type="text"
        placeholder={t('objectTypes.propertyName')}
        value={prop.name}
        onChange={(e) => onChange({ ...prop, name: e.target.value })}
        readOnly={fromDataset || nameTypeReadOnly}
      />
      <select
        value={prop.type}
        onChange={(e) => onChange({ ...prop, type: e.target.value })}
        disabled={nameTypeReadOnly}
      >
        {PROPERTY_TYPES.map((pt) => (
          <option key={pt} value={pt}>
            {pt}
          </option>
        ))}
      </select>
      <label className="console-obj-property-required">
        <input
          type="checkbox"
          className="ds-checkbox"
          checked={prop.required}
          onChange={(e) => onChange({ ...prop, required: e.target.checked })}
        />
        {t('objectTypes.required')}
      </label>
      {!fromDataset ? (
        <button type="button" onClick={onRemove} aria-label={t('objectTypes.removeProperty')}>
          <X size={14} />
        </button>
      ) : null}
    </div>
  );
}

export function PropertiesEditor({
  properties,
  fromDataset,
  nameTypeReadOnly,
  keyProperty,
  loadingMetadata,
  onAdd,
  onChange,
  onRemove,
  onToggleEnabled,
  onKeyPropertyChange,
}: {
  properties: FormProperty[];
  fromDataset: boolean;
  nameTypeReadOnly: boolean;
  keyProperty: string;
  loadingMetadata?: boolean;
  onAdd?: () => void;
  onChange: (idx: number, p: FormProperty) => void;
  onRemove: (idx: number) => void;
  onToggleEnabled?: (idx: number, enabled: boolean) => void;
  onKeyPropertyChange: (name: string) => void;
}) {
  const { t } = useTranslation('ontology');
  // Hand-created: never show platform __rid / legacy id in schema config.
  const displayProps = fromDataset ? properties : withoutReservedProperties(properties);

  return (
    <div className="console-modal-section">
      <div className="console-modal-section-header">
        <span>{t('objectTypes.properties')}</span>
        {!fromDataset && onAdd ? (
          <button type="button" className="btn btn-secondary btn-sm" onClick={onAdd}>
            <Plus size={14} />
            {t('objectTypes.addProperty')}
          </button>
        ) : null}
      </div>
      {loadingMetadata ? (
        <p className="console-modal-hint">{t('objectTypes.loadingColumns')}</p>
      ) : displayProps.length === 0 ? (
        <p className="console-modal-hint">
          {fromDataset ? t('objectTypes.noColumns') : t('objectTypes.propertiesHint')}
        </p>
      ) : (
        <div className="console-obj-properties-list">
          <p className="console-modal-hint">
            {fromDataset
              ? t('objectTypes.primaryKeyOptionalHint')
              : t('objectTypes.handCreatedIdentityHint')}
          </p>
          <div className="console-obj-property-header">
            {fromDataset ? <span className="console-obj-prop-col-enable" /> : null}
            <span className="console-obj-prop-col-pk" title={t('objectTypes.primaryKey')}>
              PK
            </span>
            <span className="console-obj-prop-col-name">{t('objectTypes.name')}</span>
            <span className="console-obj-prop-col-type">{t('objectTypes.type')}</span>
            <span className="console-obj-prop-col-required">{t('objectTypes.required')}</span>
          </div>
          {displayProps.map((p, i) => {
            const sourceIdx = fromDataset
              ? i
              : properties.findIndex((x) => x.name === p.name);
            return (
              <PropertyRow
                key={fromDataset ? p.name : `${p.name}-${i}`}
                prop={p}
                fromDataset={fromDataset}
                nameTypeReadOnly={nameTypeReadOnly}
                isPrimaryKey={keyProperty === p.name}
                onPrimaryKeyChange={() =>
                  onKeyPropertyChange(keyProperty === p.name ? '' : p.name)
                }
                onChange={(np) => {
                  if (sourceIdx < 0) return;
                  onChange(sourceIdx, np);
                }}
                onRemove={() => {
                  if (sourceIdx < 0) return;
                  onRemove(sourceIdx);
                }}
                onToggleEnabled={
                  fromDataset && onToggleEnabled
                    ? (enabled) => onToggleEnabled(i, enabled)
                    : undefined
                }
              />
            );
          })}
        </div>
      )}
    </div>
  );
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

/** Persistable properties for hand-created types: never store platform __rid / legacy id. */
export function toHandCreatedPropertyDefs(properties: FormProperty[]): PropertyDef[] {
  return toPropertyDefs(withoutReservedProperties(properties));
}
