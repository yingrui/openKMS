import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { AppBuilderBindings } from '../../../data/appBuilderApi';

type Props = {
  bindings: AppBuilderBindings;
  objectTypeOptions: string[];
  actionOptions: string[];
  functionOptions: string[];
  saving?: boolean;
  onSave: (bindings: AppBuilderBindings) => void;
};

function MultiCheck({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: string[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const set = new Set(selected);
  return (
    <fieldset className="app-builder-settings-checks">
      <legend>{label}</legend>
      {options.length ? (
        <ul className="app-builder-settings-checks__list">
          {options.map((name) => (
            <li key={name}>
              <label className="app-builder-settings-checks__item">
                <input
                  type="checkbox"
                  checked={set.has(name)}
                  onChange={(e) => {
                    const next = new Set(selected);
                    if (e.target.checked) next.add(name);
                    else next.delete(name);
                    onChange([...next].sort());
                  }}
                />
                <span>{name}</span>
              </label>
            </li>
          ))}
        </ul>
      ) : (
        <p className="app-builder-page__muted">—</p>
      )}
    </fieldset>
  );
}

export function ResourcesEditor({
  bindings,
  objectTypeOptions,
  actionOptions,
  functionOptions,
  saving,
  onSave,
}: Props) {
  const { t } = useTranslation('appBuilder');
  const [objectTypes, setObjectTypes] = useState<string[]>(bindings.objectTypes || []);
  const [actions, setActions] = useState<string[]>(bindings.actions || []);
  const [functions, setFunctions] = useState<string[]>(bindings.functions || []);

  useEffect(() => {
    setObjectTypes(bindings.objectTypes || []);
    setActions(bindings.actions || []);
    setFunctions(bindings.functions || []);
  }, [bindings.objectTypes, bindings.actions, bindings.functions]);

  return (
    <div id="app-builder-resources" className="app-builder-settings-resources-editor">
      <p className="app-builder-page__muted">{t('resourcesEditHint')}</p>
      <div className="app-builder-settings-resources-grid">
        <MultiCheck
          label={t('resourcesObjectTypes')}
          options={[...new Set([...objectTypeOptions, ...objectTypes])].sort()}
          selected={objectTypes}
          onChange={setObjectTypes}
        />
        <MultiCheck
          label={t('resourcesActions')}
          options={[...new Set([...actionOptions, ...actions])].sort()}
          selected={actions}
          onChange={setActions}
        />
        <MultiCheck
          label={t('resourcesFunctions')}
          options={[...new Set([...functionOptions, ...functions])].sort()}
          selected={functions}
          onChange={setFunctions}
        />
      </div>
      <div className="settings-page-actions">
        <button
          type="button"
          className="btn btn-primary"
          disabled={saving}
          onClick={() =>
            onSave({
              objectTypes: objectTypes.length ? objectTypes : undefined,
              actions: actions.length ? actions : undefined,
              functions: functions.length ? functions : undefined,
            })
          }
        >
          {t('resourcesSave')}
        </button>
      </div>
    </div>
  );
}
