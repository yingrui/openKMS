import { Plus, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { PropertyDef } from '../../data/ontologyApi';

export const PROPERTY_TYPES = ['string', 'number', 'boolean'] as const;

export type FormProperty = PropertyDef & { enabled?: boolean };

/** Map PostgreSQL data_type to our property type */
export function mapPgTypeToPropType(dataType: string): string {
  const t = dataType.toLowerCase();
  if (
    t.includes('int') ||
    t.includes('numeric') ||
    t.includes('decimal') ||
    t.includes('real') ||
    t.includes('double') ||
    t.includes('float')
  ) {
    return 'number';
  }
  if (t.includes('bool')) return 'boolean';
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
            checked={prop.enabled !== false}
            onChange={(e) => onToggleEnabled(e.target.checked)}
          />
        </label>
      )}
      {onPrimaryKeyChange ? (
        <label className="console-obj-property-primary" title={t('objectTypes.primaryKey')}>
          <input
            type="radio"
            name="primary-key"
            checked={isPrimaryKey}
            onChange={onPrimaryKeyChange}
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
          checked={prop.required}
          onChange={(e) => onChange({ ...prop, required: e.target.checked })}
        />
        {t('objectTypes.required')}
      </label>
      {!fromDataset && (
        <button type="button" onClick={onRemove} aria-label={t('objectTypes.removeProperty')}>
          <X size={14} />
        </button>
      )}
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
      ) : properties.length === 0 ? (
        <p className="console-modal-hint">
          {fromDataset ? t('objectTypes.noColumns') : t('objectTypes.propertiesHint')}
        </p>
      ) : (
        <div className="console-obj-properties-list">
          <div className="console-obj-property-header">
            {fromDataset ? <span className="console-obj-prop-col-enable" /> : null}
            <span className="console-obj-prop-col-pk" title={t('objectTypes.primaryKey')}>
              PK
            </span>
            <span className="console-obj-prop-col-name">{t('objectTypes.name')}</span>
            <span className="console-obj-prop-col-type">{t('objectTypes.type')}</span>
            <span className="console-obj-prop-col-required">{t('objectTypes.required')}</span>
          </div>
          {properties.map((p, i) => (
            <PropertyRow
              key={fromDataset ? p.name : i}
              prop={p}
              fromDataset={fromDataset}
              nameTypeReadOnly={nameTypeReadOnly}
              isPrimaryKey={keyProperty === p.name}
              onPrimaryKeyChange={() => onKeyPropertyChange(p.name)}
              onChange={(np) => onChange(i, np)}
              onRemove={() => onRemove(i)}
              onToggleEnabled={
                fromDataset && onToggleEnabled ? (enabled) => onToggleEnabled(i, enabled) : undefined
              }
            />
          ))}
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
