import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { StoryFinding } from '../../data/storiesApi';
import { Dialog, FormField } from '../../styles/design-system';
import { FindingViewFields } from './FindingViewFields';
import { viewDraftFromSpec } from './findingDraft';
import type { FindingFields } from './storyEdits';

/**
 * Edit one finding: what it says and how it is drawn.
 *
 * The **query is not editable here** on purpose — it belongs where it was built (the Playground for
 * a model metric, the Data tab for a dataset slice); "save to a story" writes a new finding for a
 * new query. Editing keeps the finding's source, query and last run untouched.
 */
export function EditFindingDialog({
  finding,
  columns,
  rows,
  onSave,
  onClose,
}: {
  finding: StoryFinding;
  columns: string[];
  rows: Array<Record<string, unknown>>;
  onSave: (fields: FindingFields) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation('ontology');
  const [title, setTitle] = useState(finding.title ?? '');
  const [takeaway, setTakeaway] = useState(finding.takeaway ?? '');
  /** Parsed once per finding — this dialog is keyed by the finding it edits. */
  const [view, setView] = useState(() => viewDraftFromSpec(finding.view, columns));
  const canSave = useMemo(() => title.trim() !== '' || (finding.title ?? '') !== '', [title, finding.title]);

  return (
    <Dialog
      open
      onClose={onClose}
      closeAriaLabel={t('shared.cancel')}
      title={t('dataInsights.editFinding')}
      size="md"
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            {t('shared.cancel')}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => onSave({ title, takeaway, view })}
            disabled={!canSave}
          >
            {t('shared.save')}
          </button>
        </>
      }
    >
      <FormField label={t('dataInsights.finding')}>
        <input value={title} onChange={(e) => setTitle(e.target.value)} />
      </FormField>
      <FormField label={t('dataInsights.saveFindingTakeaway')}>
        <input
          value={takeaway}
          onChange={(e) => setTakeaway(e.target.value)}
          placeholder={t('dataInsights.saveFindingTakeawayPlaceholder')}
        />
      </FormField>
      <FindingViewFields columns={columns} rows={rows} view={view} onChange={setView} />
    </Dialog>
  );
}
