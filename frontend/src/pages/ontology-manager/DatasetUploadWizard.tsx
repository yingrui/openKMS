import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Dialog, FormField } from '../../styles/design-system';
import { ErrorBanner } from '../../components/ErrorBanner';
import type { DataSourceResponse } from '../../data/dataSourcesApi';
import type { DatasetResponse } from '../../data/datasetsApi';
import {
  loadDatasetIngest,
  previewDatasetIngest,
  startDatasetIngest,
  type DatasetIngestPreview,
} from '../../data/ingestsApi';

type Props = {
  open: boolean;
  onClose: () => void;
  dataSources: DataSourceResponse[];
  onLoaded: (dataset: DatasetResponse) => void;
};

/** Three-step file ingest: choose file + source → preview/confirm → load. */
export function DatasetUploadWizard({ open, onClose, dataSources, onLoaded }: Props) {
  const { t } = useTranslation('ontology');
  const [step, setStep] = useState(1);
  const [file, setFile] = useState<File | null>(null);
  const [dataSourceId, setDataSourceId] = useState('');
  const [ingestId, setIngestId] = useState('');
  const [preview, setPreview] = useState<DatasetIngestPreview | null>(null);
  const [schema, setSchema] = useState('public');
  const [table, setTable] = useState('');
  const [mode, setMode] = useState('overwrite');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setStep(1);
    setFile(null);
    setDataSourceId('');
    setIngestId('');
    setPreview(null);
    setSchema('public');
    setTable('');
    setMode('overwrite');
    setBusy(false);
    setError(null);
  };

  const close = () => {
    if (busy) return;
    reset();
    onClose();
  };

  const goPreview = async () => {
    if (!file || !dataSourceId) {
      setError(t('datasets.uploadNeedFile'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const started = await startDatasetIngest(file, dataSourceId);
      setIngestId(started.id);
      if (started.table_name) setTable(started.table_name);
      const p = await previewDatasetIngest(started.id);
      setPreview(p);
      setStep(2);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('datasets.uploadFailed'));
    } finally {
      setBusy(false);
    }
  };

  const goLoad = async () => {
    if (!ingestId || !schema.trim() || !table.trim()) {
      setError(t('datasets.uploadNeedTable'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const dataset = await loadDatasetIngest(ingestId, {
        schema_name: schema.trim(),
        table_name: table.trim(),
        mode,
      });
      toast.success(t('datasets.uploadLoaded'));
      onLoaded(dataset);
      reset();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('datasets.uploadFailed'));
    } finally {
      setBusy(false);
    }
  };

  const footer =
    step === 1 ? (
      <>
        <button type="button" className="btn btn-secondary" onClick={close} disabled={busy}>
          {t('shared.cancel')}
        </button>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => void goPreview()}
          disabled={!file || !dataSourceId || busy}
        >
          {busy ? t('datasets.uploadParsing') : t('datasets.uploadPreview')}
        </button>
      </>
    ) : (
      <>
        <button type="button" className="btn btn-secondary" onClick={() => setStep(1)} disabled={busy}>
          {t('datasets.uploadBack')}
        </button>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => void goLoad()}
          disabled={!schema.trim() || !table.trim() || busy}
        >
          {busy ? t('datasets.uploadLoading') : t('datasets.uploadLoad')}
        </button>
      </>
    );

  return (
    <Dialog
      open={open}
      onClose={close}
      closeDisabled={busy}
      title={t('datasets.uploadTitle')}
      closeAriaLabel={t('shared.cancel')}
      size="md"
      footer={footer}
    >
      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}
      <p className="page-subtitle">
        {t(step === 1 ? 'datasets.uploadStep1' : 'datasets.uploadStep2')}
      </p>
      {step === 1 && (
        <>
          <FormField label={t('datasets.uploadFile')}>
            <input
              type="file"
              accept=".csv,.tsv,.json,.xlsx,.xls"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              disabled={busy}
            />
          </FormField>
          <FormField label={t('datasets.fieldDataSource')}>
            <select
              value={dataSourceId}
              onChange={(e) => setDataSourceId(e.target.value)}
              disabled={busy}
            >
              <option value="">{t('datasets.selectDataSource')}</option>
              {dataSources.map((ds) => (
                <option key={ds.id} value={ds.id}>
                  {ds.name}
                </option>
              ))}
            </select>
          </FormField>
        </>
      )}
      {step === 2 && preview && (
        <>
          <FormField label={t('datasets.uploadSchema')}>
            <input value={schema} onChange={(e) => setSchema(e.target.value)} disabled={busy} />
          </FormField>
          <FormField label={t('datasets.uploadTable')}>
            <input value={table} onChange={(e) => setTable(e.target.value)} disabled={busy} />
          </FormField>
          <FormField label={t('datasets.uploadMode')}>
            <select value={mode} onChange={(e) => setMode(e.target.value)} disabled={busy}>
              <option value="overwrite">{t('datasets.uploadModeOverwrite')}</option>
              <option value="append">{t('datasets.uploadModeAppend')}</option>
            </select>
          </FormField>
          <div className="ds-table-wrap">
            <table className="console-table">
              <thead>
                <tr>
                  {preview.columns.map((c) => (
                    <th key={c.name}>
                      {c.name}
                      <br />
                      <small>{c.pg_type}</small>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.sample_rows.slice(0, 5).map((row, i) => (
                  <tr key={i}>
                    {preview.columns.map((c) => (
                      <td key={c.name}>{String(row[c.name] ?? '')}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Dialog>
  );
}
