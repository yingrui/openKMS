import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowDown,
  ArrowUp,
  Loader2,
  Pencil,
  Play,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  deleteStory,
  fetchStory,
  runStory,
  updateStory,
  type StoryFinding,
  type Story,
} from '../../data/storiesApi';
import { fetchDatasets, type DatasetResponse } from '../../data/datasetsApi';
import { fetchSemanticModels, type SemanticModelResponse } from '../../data/semanticModelsApi';
import { useAuth } from '../../contexts/AuthContext';
import { useConfirm } from '../../contexts/ConfirmContext';
import { RichMarkdown } from '../../components/markdown/richMarkdown';
import { StatusChip } from '../../styles/design-system';
import { StoryFindingView } from './StoryFindingView';
import { EntityViewLoading, EntityViewPanel, EntityViewShell } from './EntityViewShell';
import { AddFindingDialog } from './AddFindingDialog';
import { findingSource } from './findingSource';
import './data-insights.scss';
import { EditFindingDialog } from './EditFindingDialog';
import { applyFindingFields, moveFinding, removeFinding, replaceFinding } from './storyEdits';
import './data-insights.scss';

export function StoryDetailPage() {
  const { t } = useTranslation('ontology');
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const { hasPermission } = useAuth();
  const canWrite = hasPermission('insights:write');
  const [story, setStory] = useState<Story | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);
  const [narrativeDraft, setNarrativeDraft] = useState<string | null>(null);
  const [datasets, setDatasets] = useState<DatasetResponse[]>([]);
  const [models, setModels] = useState<SemanticModelResponse[]>([]);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      setStory(await fetchStory(id));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('datasets.loadFailed'));
      setStory(null);
    } finally {
      setLoading(false);
    }
  }, [id, t]);

  useEffect(() => {
    void load();
  }, [load]);

  // A source's name is part of a finding's provenance: every number says where it came from.
  useEffect(() => {
    void Promise.all([fetchDatasets(), fetchSemanticModels()])
      .then(([d, m]) => {
        setDatasets(d.items);
        setModels(m.items);
      })
      .catch(() => undefined);
  }, []);

  const findings = story?.findings ?? [];

  /** The document **is** the story, so every edit writes the array (or the narrative) back. */
  const saveDocument = async (
    body: { findings?: StoryFinding[]; narrative?: string | null },
    message: string,
  ) => {
    setSaving(true);
    try {
      setStory(await updateStory(id, body));
      toast.success(message);
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('dataInsights.saveFindingFailed'));
      return false;
    } finally {
      setSaving(false);
    }
  };

  const handleRun = async () => {
    setRunning(true);
    try {
      setStory(await runStory(id));
      toast.success(t('dataInsights.ran'));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('dataInsights.runFailed'));
    } finally {
      setRunning(false);
    }
  };

  const handleRemoveFinding = async (index: number) => {
    if (
      !(await confirm({
        title: t('shared.delete'),
        message: t('dataInsights.removeFindingConfirm'),
        confirmLabel: t('shared.delete'),
        danger: true,
      }))
    )
      return;
    await saveDocument({ findings: removeFinding(findings, index) }, t('dataInsights.findingRemoved'));
  };

  const handleDelete = async () => {
    if (
      !(await confirm({
        title: t('shared.delete'),
        message: t('dataInsights.deleteConfirm'),
        confirmLabel: t('shared.delete'),
        danger: true,
      }))
    )
      return;
    try {
      await deleteStory(id);
      toast.success(t('dataInsights.deleted'));
      navigate('/data-insights');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('dataInsights.deleteFailed'));
    }
  };

  if (loading) return <EntityViewLoading label={t('shared.loading')} />;
  if (!story) return null;

  const editingFinding = editing === null ? null : findings[editing];

  return (
    <>
    <EntityViewShell
      backTo="/data-insights"
      backLabel={t('dataInsights.backToStories')}
      title={story.name}
      /* The rail is this app's table of contents; a story's sections are its findings, so it
         lists them (the answer first), with where each one's numbers come from underneath. */
      navItems={[
        { sectionId: 'narrative', label: t('dataInsights.narrative') },
        ...findings.map((finding, i) => ({
          sectionId: `finding-${i}`,
          label: finding.title ?? t('dataInsights.finding'),
          hint: findingSource(finding, datasets, models, t('dataInsights.sourceMissing')).label,
        })),
      ]}
      meta={story.question ?? t('dataInsights.noQuestion')}
      identityAction={
        /* What this document *is* (state, size, and the delete that ends it) — and under it what it
           *does*: Run is the action you come back to, so it sits with the identity instead of in a
           header row that would otherwise be empty. */
        <>
          <div className="openkms-flex-row-gap">
            <StatusChip tone={story.status === 'ready' ? 'ok' : 'neutral'}>
              {t(`dataInsights.status_${story.status}`, { defaultValue: story.status })}
            </StatusChip>
            <span className="entity-view__identity-note">
              {t('dataInsights.findingCount', { count: findings.length })}
            </span>
          {/* An icon with the platform's own tooltip. The label used to *expand* on hover, which
              re-wrapped the rail's row, moved the button out from under the cursor, and flickered. */}
            <button
              type="button"
              className="is-danger"
              onClick={() => void handleDelete()}
              aria-label={t('dataInsights.deleteStory')}
              title={t('dataInsights.deleteStory')}
            >
              <Trash2 size={14} aria-hidden />
            </button>
          </div>
          {/* The small size: it sits in a 220 px rail beside the state line, and the primary button
              should read as the strongest thing there without being the biggest. */}
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => void handleRun()}
            disabled={running || findings.length === 0}
          >
            {running ? (
              <Loader2 size={14} className="console-loading-spinner" aria-hidden />
            ) : (
              <Play size={14} aria-hidden />
            )}
            <span>{t('dataInsights.run')}</span>
          </button>
        </>
      }
    >
      <EntityViewPanel
        id="narrative"
        title={t('dataInsights.narrative')}
        actions={
          narrativeDraft === null && canWrite && story.narrative ? (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => setNarrativeDraft(story.narrative ?? '')}
              title={t('shared.edit')}
            >
              <Pencil size={14} aria-hidden />
            </button>
          ) : null
        }
      >
        {narrativeDraft === null ? (
          story.narrative ? (
            <RichMarkdown className="story-narrative">{story.narrative}</RichMarkdown>
          ) : (
            <p className="entity-view__readonly">{t('dataInsights.noNarrative')}</p>
          )
        ) : (
          <>
            <textarea
              className="story-narrative__editor"
              value={narrativeDraft}
              onChange={(e) => setNarrativeDraft(e.target.value)}
              rows={8}
              aria-label={t('dataInsights.narrative')}
            />
            <div className="openkms-flex-row-gap openkms-mt-2">
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() =>
                  void saveDocument(
                    { narrative: narrativeDraft },
                    t('dataInsights.narrativeSaved'),
                  ).then((ok) => ok && setNarrativeDraft(null))
                }
                disabled={saving}
              >
                {saving ? t('shared.saving') : t('shared.save')}
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setNarrativeDraft(null)}
                disabled={saving}
              >
                {t('shared.cancel')}
              </button>
            </div>
          </>
        )}
      </EntityViewPanel>
      {findings.length === 0 && (
        <p className="entity-view__readonly">{t('dataInsights.findingsEmpty')}</p>
      )}
        {findings.map((finding, i) => (
          <StoryFindingView
            key={i}
            id={`finding-${i}`}
            finding={finding}
            datasets={datasets}
            models={models}
            actions={
              canWrite ? (
                <>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => setEditing(i)}
                    title={t('dataInsights.editFinding')}
                  >
                    <Pencil size={14} aria-hidden />
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() =>
                      void saveDocument(
                        { findings: moveFinding(findings, i, -1) },
                        t('dataInsights.findingsReordered'),
                      )
                    }
                    disabled={i === 0 || saving}
                    title={t('dataInsights.moveUp')}
                  >
                    <ArrowUp size={14} aria-hidden />
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() =>
                      void saveDocument(
                        { findings: moveFinding(findings, i, 1) },
                        t('dataInsights.findingsReordered'),
                      )
                    }
                    disabled={i === findings.length - 1 || saving}
                    title={t('dataInsights.moveDown')}
                  >
                    <ArrowDown size={14} aria-hidden />
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => void handleRemoveFinding(i)}
                    disabled={saving}
                    title={t('dataInsights.removeFinding')}
                  >
                    <Trash2 size={14} aria-hidden />
                  </button>
                </>
              ) : null
            }
          />
        ))}
      {/* Adding a finding is adding a section: it belongs at the end of the stack, not in a toolbar. */}
      {canWrite && (
        <div className="story-add-finding">
          <AddFindingDialog storyId={id} findings={findings} onSaved={() => void load()} />
        </div>
      )}
      {editingFinding && (
        <EditFindingDialog
          key={editing}
          finding={editingFinding}
          columns={editingFinding.columns ?? []}
          rows={editingFinding.rows ?? []}
          onClose={() => setEditing(null)}
          onSave={(fields) => {
            void saveDocument(
              { findings: replaceFinding(findings, editing ?? 0, applyFindingFields(editingFinding, fields)) },
              t('dataInsights.findingUpdated'),
            ).then((ok) => ok && setEditing(null));
          }}
        />
      )}
    </EntityViewShell>
    </>
  );
}
