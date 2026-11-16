import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router-dom";
import { Loader2, Plus, Sparkles } from "lucide-react";
import { toast } from "sonner";
import {
  createStory,
  fetchStories,
  type StorySummary,
} from "../../data/storiesApi";
import {
  Dialog,
  EmptyState,
  FormField,
  StatusChip,
} from "../../styles/design-system/index";
import { ListPage, SearchField } from "../../styles/design-system";

/**
 * All stories — the app's shared card list (`ds-resource-list.scss`, the same chrome as Knowledge
 * Bases and Wiki spaces): one page header with the primary action, a card grid, and a card whose
 * top row is an icon, then a title, a description and a meta line.
 *
 * What is specific to a story lives *inside* that grammar: the question is the description, and
 * the meta line carries the state, the finding count and the sources the findings read.
 */
export function DataInsightsPage() {
  const { t } = useTranslation("ontology");
  const navigate = useNavigate();
  const [stories, setStories] = useState<StorySummary[]>([]);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [question, setQuestion] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setStories(
        (await fetchStories({ search: debouncedSearch.trim() || undefined }))
          .items,
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("datasets.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, t]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const handle = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(handle);
  }, [search]);

  const openCreate = () => {
    setName("");
    setQuestion("");
    setShowForm(true);
  };

  const handleCreate = async () => {
    if (!name.trim()) {
      toast.error(t("dataInsights.nameRequired"));
      return;
    }
    setSubmitting(true);
    try {
      const created = await createStory({
        name: name.trim(),
        question: question.trim() || null,
      });
      toast.success(t("dataInsights.created"));
      setShowForm(false);
      navigate(`/data-insights/${created.id}`);
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : t("dataInsights.createFailed"),
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <ListPage
        title={t("dataInsights.title")}
        subtitle={t("dataInsights.subtitle")}
        actions={
          <button
            type="button"
            className="btn btn-primary"
            onClick={openCreate}
          >
            <Plus size={18} aria-hidden />
            <span>{t("dataInsights.newStory")}</span>
          </button>
        }
        toolbar={
          // Also while a search finds nothing: otherwise the box that would let you clear it disappears.
          !loading && (stories.length > 0 || debouncedSearch.trim() !== "") ? (
            <SearchField
              value={search}
              onChange={setSearch}
              label={t("dataInsights.searchAria")}
              placeholder={t("dataInsights.searchPlaceholder")}
            />
          ) : null
        }
      >
        {loading && (
          <p className="ds-resource-list-loading">
            <Loader2 size={18} className="spin" aria-hidden />{" "}
            {t("shared.loading")}
          </p>
        )}

        {!loading && stories.length === 0 && debouncedSearch.trim() && (
          <p className="page-subtitle">{t("dataInsights.noMatches")}</p>
        )}

        {!loading && stories.length === 0 && !debouncedSearch.trim() && (
          <EmptyState
            icon={<Sparkles size={48} strokeWidth={1} />}
            title={t("dataInsights.empty")}
            description={t("dataInsights.subtitle")}
            action={
              <button
                type="button"
                className="btn btn-primary"
                onClick={openCreate}
              >
                <Plus size={18} aria-hidden />
                <span>{t("dataInsights.newStory")}</span>
              </button>
            }
          />
        )}

        {!loading && stories.length > 0 && (
          <div className="ds-resource-list-grid">
            {stories.map((story) => {
              const sources = story.sources.map((s) => s.label);
              return (
                <Link
                  key={story.id}
                  to={`/data-insights/${story.id}`}
                  className="ds-resource-list-card"
                >
                  <div className="ds-resource-list-card-top">
                    <div className="ds-resource-list-icon">
                      <Sparkles size={28} strokeWidth={1.5} />
                    </div>
                  </div>
                  <h3>{story.name}</h3>
                  <p
                    className="ds-resource-list-desc"
                    title={story.question?.trim() || undefined}
                  >
                    {story.question || t("dataInsights.noQuestion")}
                  </p>
                  <div className="ds-resource-list-meta">
                    <StatusChip
                      tone={story.status === "ready" ? "ok" : "neutral"}
                    >
                      {t(`dataInsights.status_${story.status}`, {
                        defaultValue: story.status,
                      })}
                    </StatusChip>
                    <span>
                      {t("dataInsights.findingCount", {
                        count: story.finding_count,
                      })}
                    </span>
                    {sources.length > 0 && <span>{sources.join(" + ")}</span>}
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </ListPage>

      <Dialog
        open={showForm}
        onClose={() => !submitting && setShowForm(false)}
        closeDisabled={submitting}
        title={t("dataInsights.newStory")}
        closeAriaLabel={t("shared.cancel")}
        size="sm"
        footer={
          <>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => !submitting && setShowForm(false)}
              disabled={submitting}
            >
              {t("shared.cancel")}
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => void handleCreate()}
              disabled={!name.trim() || submitting}
            >
              {submitting ? t("shared.saving") : t("shared.create")}
            </button>
          </>
        }
      >
        <FormField label={t("dataInsights.storyName")}>
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </FormField>
        <FormField label={t("dataInsights.question")}>
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder={t("dataInsights.questionPlaceholder")}
          />
        </FormField>
      </Dialog>
    </>
  );
}
