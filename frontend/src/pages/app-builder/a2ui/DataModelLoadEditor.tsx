import { useEffect, useState, type ChangeEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { OntoObjectListBinding } from './dataModelInspect';

type Props = {
  bindings: OntoObjectListBinding[];
  objectTypeOptions: string[];
  onSave: (binding: OntoObjectListBinding) => void;
  onRemove: (componentId: string) => void;
  onAdd: (binding: OntoObjectListBinding) => void;
};

const emptyDraft = (): OntoObjectListBinding => ({
  componentId: '',
  objectType: '',
  dataPath: '',
  titleProperty: 'title',
  filterProperty: '',
  filterValue: '',
  rowFields: '',
});

function LoaderForm({
  initial,
  objectTypeOptions,
  submitLabel,
  onSubmit,
  onCancel,
  onRemove,
}: {
  initial: OntoObjectListBinding;
  objectTypeOptions: string[];
  submitLabel: string;
  onSubmit: (b: OntoObjectListBinding) => void;
  onCancel?: () => void;
  onRemove?: () => void;
}) {
  const { t } = useTranslation('appBuilder');
  const [draft, setDraft] = useState(initial);
  useEffect(() => {
    setDraft(initial);
  }, [initial]);

  const set =
    (key: keyof OntoObjectListBinding) =>
    (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      setDraft((prev) => ({ ...prev, [key]: e.target.value }));
    };

  return (
    <form
      className="app-builder-design__loader-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (!draft.objectType.trim() || !draft.dataPath.trim()) return;
        onSubmit({
          ...draft,
          objectType: draft.objectType.trim(),
          dataPath: draft.dataPath.trim().startsWith('/')
            ? draft.dataPath.trim()
            : `/${draft.dataPath.trim()}`,
          titleProperty: (draft.titleProperty || 'title').trim(),
          filterProperty: (draft.filterProperty || '').trim(),
          filterValue: (draft.filterValue || '').trim(),
          rowFields: (draft.rowFields || '').trim(),
        });
      }}
    >
      {initial.componentId ? (
        <p className="app-builder-design__loader-id">
          <code>{initial.componentId}</code>
        </p>
      ) : null}
      <label>
        <span>{t('dataModelFieldObjectType')}</span>
        {objectTypeOptions.length ? (
          <select value={draft.objectType} onChange={set('objectType')} required>
            <option value="">{t('dataModelSelectObjectType')}</option>
            {objectTypeOptions.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        ) : (
          <input value={draft.objectType} onChange={set('objectType')} required />
        )}
      </label>
      <label>
        <span>{t('dataModelFieldDataPath')}</span>
        <input
          value={draft.dataPath}
          onChange={set('dataPath')}
          placeholder="/lists/items"
          required
        />
      </label>
      <label>
        <span>{t('dataModelFieldTitleProperty')}</span>
        <input value={draft.titleProperty || ''} onChange={set('titleProperty')} placeholder="title" />
      </label>
      <label>
        <span>{t('dataModelFieldRowFields')}</span>
        <input
          value={draft.rowFields || ''}
          onChange={set('rowFields')}
          placeholder="title,status,priority"
        />
      </label>
      <label>
        <span>{t('dataModelFieldFilterProperty')}</span>
        <input
          value={draft.filterProperty || ''}
          onChange={set('filterProperty')}
          placeholder="status"
        />
      </label>
      <label>
        <span>{t('dataModelFieldFilterValue')}</span>
        <input value={draft.filterValue || ''} onChange={set('filterValue')} placeholder="To Do" />
      </label>
      <div className="app-builder-design__loader-actions">
        <button type="submit" className="btn btn-primary">
          {submitLabel}
        </button>
        {onCancel ? (
          <button type="button" className="btn btn-secondary" onClick={onCancel}>
            {t('cancel')}
          </button>
        ) : null}
        {onRemove ? (
          <button type="button" className="btn btn-secondary" onClick={onRemove}>
            {t('dataModelRemoveLoader')}
          </button>
        ) : null}
      </div>
    </form>
  );
}

export function DataModelLoadEditor({ bindings, objectTypeOptions, onSave, onRemove, onAdd }: Props) {
  const { t } = useTranslation('appBuilder');
  const [adding, setAdding] = useState(false);

  return (
    <div id="app-builder-loaders" className="app-builder-design__load-editor">
      {bindings.length ? (
        bindings.map((b) => (
          <div key={b.componentId} className="app-builder-design__loader-card">
            <LoaderForm
              initial={b}
              objectTypeOptions={objectTypeOptions}
              submitLabel={t('dataModelSaveLoader')}
              onSubmit={onSave}
              onRemove={() => onRemove(b.componentId)}
            />
          </div>
        ))
      ) : (
        <p className="app-builder-page__muted">{t('dataModelLoadMapEmpty')}</p>
      )}
      {adding ? (
        <div className="app-builder-design__loader-card app-builder-design__loader-card--new">
          <h4 className="app-builder-design__loader-card-title">{t('dataModelAddLoader')}</h4>
          <LoaderForm
            initial={{
              ...emptyDraft(),
              objectType: objectTypeOptions[0] || '',
              dataPath: '/lists/items',
            }}
            objectTypeOptions={objectTypeOptions}
            submitLabel={t('dataModelAddLoader')}
            onSubmit={(b) => {
              onAdd(b);
              setAdding(false);
            }}
            onCancel={() => setAdding(false)}
          />
        </div>
      ) : (
        <button type="button" className="btn btn-secondary" onClick={() => setAdding(true)}>
          {t('dataModelAddLoader')}
        </button>
      )}
    </div>
  );
}
