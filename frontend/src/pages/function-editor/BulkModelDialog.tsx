import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import { fetchAllModels } from '../../data/modelsApi';
import { bulkReplaceFunctionModel, type BulkModelResult } from '../../data/ontologyFunctionsApi';
import { useAsyncData } from '../../hooks/useAsyncData';
import { Dialog, FormField } from '../../styles/design-system';

/**
 * Change the model of many Logic functions at once.
 *
 * AIP Logic does this through Workflow Lineage; ours is honest about the mechanism: each function gets a **new draft
 * version** with its model nodes repointed, and nothing is published. That is why the dialog says "draft" — the old
 * version stays published, so actions pinned to it keep working.
 */
export function BulkModelDialog({
  open,
  functionIds,
  onClose,
  onDone,
}: {
  open: boolean;
  functionIds: string[];
  onClose: () => void;
  onDone: (rows: BulkModelResult[]) => void;
}) {
  const { t } = useTranslation('ontology');
  const [modelId, setModelId] = useState('');
  const [fromModelId, setFromModelId] = useState('');
  const [saving, setSaving] = useState(false);
  const [rows, setRows] = useState<BulkModelResult[] | null>(null);

  const { data: models } = useAsyncData(
    async () => (await fetchAllModels({ api_kind: 'chat-completions' })).map((m) => ({ id: m.id, name: m.name })),
    [],
  );
  const options = models ?? [];

  const submit = async () => {
    setSaving(true);
    try {
      const result = await bulkReplaceFunctionModel({
        function_ids: functionIds,
        from_model_id: fromModelId || null,
        to_model_id: modelId || null,
      });
      setRows(result);
      onDone(result);
    } finally {
      setSaving(false);
    }
  };

  const counts = rows
    ? rows.reduce<Record<string, number>>((acc, row) => ({ ...acc, [row.status]: (acc[row.status] ?? 0) + 1 }), {})
    : null;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t('editor.bulkModelTitle', { count: functionIds.length })}
      closeAriaLabel={t('shared.close')}
      size="md"
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            {rows ? t('shared.close') : t('shared.cancel')}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void submit()}
            disabled={saving || (!modelId && !fromModelId)}
          >
            {saving ? <Loader2 size={14} className="spin" aria-hidden /> : null}
            {saving ? t('editor.bulkModelSaving') : t('editor.bulkModelSubmit')}
          </button>
        </>
      }
    >
      <p className="page-subtitle">{t('editor.bulkModelHint')}</p>
      <FormField label={t('editor.bulkModelTo')} hint={t('editor.bulkModelToHint')}>
        <select className="ds-control" value={modelId} onChange={(e) => setModelId(e.target.value)}>
          <option value="">{t('editor.logicModelDefault')}</option>
          {options.map((model) => (
            <option key={model.id} value={model.id}>
              {model.name}
            </option>
          ))}
        </select>
      </FormField>
      <FormField label={t('editor.bulkModelFrom')} hint={t('editor.bulkModelFromHint')}>
        <select className="ds-control" value={fromModelId} onChange={(e) => setFromModelId(e.target.value)}>
          <option value="">{t('editor.bulkModelFromAll')}</option>
          {options.map((model) => (
            <option key={model.id} value={model.id}>
              {model.name}
            </option>
          ))}
        </select>
      </FormField>

      {counts ? (
        <div className="bulk-model-result">
          {(['updated', 'unchanged', 'not_logic', 'missing', 'failed'] as const).map((status) =>
            counts[status] ? (
              <p key={status} className={`bulk-model-result__row bulk-model-result__row--${status}`}>
                {t(`editor.bulkModelStatus.${status}`, { count: counts[status] })}
              </p>
            ) : null,
          )}
        </div>
      ) : null}
    </Dialog>
  );
}
