import { useTranslation } from 'react-i18next';
import type { ConnectorKindInputFieldOut } from '../../data/connectorsApi';

export function PlaygroundParamField({
  field,
  value,
  onChange,
}: {
  field: ConnectorKindInputFieldOut;
  value: string;
  onChange: (next: string) => void;
}) {
  const { t } = useTranslation('console');
  const fieldId = `connector-playground-${field.key}`;

  if (field.field_type === 'boolean') {
    return (
      <div className="connector-playground-field">
        <label htmlFor={fieldId} className="connector-playground-field-label">
          <span className="connector-playground-field-name">{field.key}</span>
          <span className="connector-playground-field-type">boolean</span>
        </label>
        <select
          id={fieldId}
          className="console-form-control"
          value={value === 'true' || value === '1' ? 'true' : 'false'}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="false">{t('connectors.no')}</option>
          <option value="true">{t('connectors.yes')}</option>
        </select>
      </div>
    );
  }

  if (field.field_type === 'select' && (field.options?.length ?? 0) > 0) {
    return (
      <div className="connector-playground-field">
        <label htmlFor={fieldId} className="connector-playground-field-label">
          <span className="connector-playground-field-name">{field.key}</span>
          <span className="connector-playground-field-type">enum</span>
          {field.required ? (
            <span className="connector-playground-field-required">{t('connectors.playgroundRequired')}</span>
          ) : null}
        </label>
        <p className="connector-playground-field-desc">{field.label}</p>
        <select
          id={fieldId}
          className="console-form-control"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        >
          {field.options!.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      </div>
    );
  }

  return (
    <div className="connector-playground-field">
      <label htmlFor={fieldId} className="connector-playground-field-label">
        <span className="connector-playground-field-name">{field.key}</span>
        <span className="connector-playground-field-type">{field.field_type}</span>
        {field.required ? (
          <span className="connector-playground-field-required">{t('connectors.playgroundRequired')}</span>
        ) : null}
      </label>
      <p className="connector-playground-field-desc">{field.label}</p>
      <input
        id={fieldId}
        type={field.field_type === 'integer' ? 'number' : 'text'}
        className="console-form-control"
        value={value}
        placeholder={field.placeholder ?? undefined}
        min={field.field_type === 'integer' ? 1 : undefined}
        max={field.field_type === 'integer' ? 50 : undefined}
        onChange={(e) => onChange(e.target.value)}
        autoComplete="off"
      />
    </div>
  );
}
