import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Save } from 'lucide-react';
import { toast } from 'sonner';
import {
  createStory,
  fetchStory,
  fetchStories,
  updateStory,
  type StorySummary,
} from '../../data/storiesApi';
import { Dialog, FormField } from '../../styles/design-system';
import { FindingViewFields } from './FindingViewFields';
import { buildFindingEntry, guessView, type FindingDraftInput, type ViewDraft } from './findingDraft';

const NEW_DASHBOARD = '__new__';

/**
 * "Save this to a story" — the round trip the design promised: a query built in the Playground
 * (a model metric) or the Data tab (a dataset slice) becomes a finding in a story, with the
 * source and query it came from. The chart is a default the person can change, previewed here with
 * the same component the story uses.
 */
export function SaveFindingDialog({ draft }: { draft: FindingDraftInput }) {
  const { t } = useTranslation('ontology');
  const [open, setOpen] = useState(false);
  const [stories, setStories] = useState<StorySummary[]>([]);
  const [target, setTarget] = useState(NEW_DASHBOARD);
  const [newName, setNewName] = useState('');
  const [title, setTitle] = useState('');
  const [takeaway, setTakeaway] = useState('');
  const [view, setView] = useState<ViewDraft>({
    choice: 'none',
    valueColumn: '',
    axisColumn: '',
    y: [],
  });
  const [saving, setSaving] = useState(false);

  const openDialog = useCallback(() => {
    setTitle(draft.defaultTitle);
    setTakeaway('');
    setView(guessView(draft.columns, draft.rows));
    setTarget(NEW_DASHBOARD);
    setNewName(draft.defaultTitle);
    setOpen(true);
    void fetchStories()
      .then((r) => {
        setStories(r.items);
        if (r.items.length > 0) setTarget(r.items[0].id);
      })
      .catch(() => undefined);
  }, [draft]);

  const save = async () => {
    setSaving(true);
    try {
      const entry = buildFindingEntry(draft, { title, takeaway, view });
      const name = newName.trim() || title.trim() || draft.defaultTitle;
      if (target === NEW_DASHBOARD) {
        await createStory({ name, findings: [entry] });
      } else {
        // Append by sending the array back — the document is the story, and its findings are ours.
        const story = await fetchStory(target);
        await updateStory(target, { findings: [...(story.findings ?? []), entry] });
      }
      toast.success(t('dataInsights.saveFindingSaved'));
      setOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('dataInsights.saveFindingFailed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <button type="button" className="btn btn-secondary btn-sm" onClick={openDialog}>
        <Save size={14} aria-hidden />
        <span>{t('dataInsights.saveToStory')}</span>
      </button>
      <Dialog
        open={open}
        onClose={() => !saving && setOpen(false)}
        closeDisabled={saving}
        title={t('dataInsights.saveToStory')}
        closeAriaLabel={t('shared.cancel')}
        size="md"
        footer={
          <>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => !saving && setOpen(false)}
              disabled={saving}
            >
              {t('shared.cancel')}
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => void save()}
              disabled={saving || (target === NEW_DASHBOARD && !newName.trim())}
            >
              {saving ? t('shared.saving') : t('dataInsights.saveFinding')}
            </button>
          </>
        }
      >
        <FormField label={t('dataInsights.saveFindingStory')}>
          <select value={target} onChange={(e) => setTarget(e.target.value)}>
            <option value={NEW_DASHBOARD}>{t('dataInsights.newStory')}</option>
            {stories.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </FormField>
        {target === NEW_DASHBOARD && (
          <FormField label={t('dataInsights.storyName')}>
            <input value={newName} onChange={(e) => setNewName(e.target.value)} />
          </FormField>
        )}
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
        <FindingViewFields columns={draft.columns} rows={draft.rows} view={view} onChange={setView} />
      </Dialog>
    </>
  );
}
