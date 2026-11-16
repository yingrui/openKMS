/**
 * One rule: read it, run it, edit it — on a page, not in a dialog.
 *
 * A rule is a handful of metadata plus a condition, and the condition needs room: a summary of what is
 * stored, a form view, and a JSON view for the shapes the form cannot express. That is a page's worth
 * of work ("both views at once serves neither" was the same conclusion the quality-rule page reached),
 * so the page has two modes — read and edit — and the header carries the mode's actions.
 *
 * `/rules/new` is the same page in edit mode, so creating and editing cannot drift apart.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Loader2, Pencil, Play } from "lucide-react";
import { toast } from "sonner";
import {
  FormField,
  StatusChip,
  StatusLine,
  StatusLineNote,
} from "../../../styles/design-system";
import {
  createRule,
  fetchRule,
  fetchRuleEvents,
  updateRule,
  type RuleOut,
  type RuleRunPeriod,
  type RulesEvaluateResponse,
} from "../../../data/rulesApi";
import type { EventOut } from "../../../data/eventsApi";
import { fetchMetrics, type MetricResponse } from "../../../data/metricsApi";
import { fetchDatasets, type DatasetResponse } from "../../../data/datasetsApi";
import {
  fetchModelFields,
  type SemanticModelFieldResponse,
} from "../../../data/semanticModelFieldsApi";
import { EntityViewPanel } from "../../shared/EntityViewShell";
import { RuleReadPanels } from "./RuleReadPanels";
import { RunRulesDialog } from "./RunRulesDialog";
import { conditionLabel, conditionScopeNote } from "./rulesLabels";
import { ConditionRows } from "./ConditionRows";
import {
  conditionFromRows,
  newRow,
  rowsFromCondition,
  type ConditionRow,
} from "./conditionRowsModel";
import { useRuleActions } from "./useRuleActions";
import { RuleBasicsForm } from "./RuleBasicsForm";
import { RelationEditor } from "./RelationEditor";
import {
  buildRulePayload,
  EMPTY_FORM,
  formFromRule,
  type FormState,
} from "./ruleForm";
import "../../../styles/settings-page.scss";
import "../../ontology/ontology-admin.scss";
import "../../../styles/rules.scss";

function severityTone(severity: string | null): "warn" | "accent" | "neutral" {
  if (severity === "P0") return "warn";
  if (severity === "P1") return "accent";
  return "neutral";
}

export function RuleDetailPage() {
  const { t } = useTranslation("ontology");
  const { ruleId } = useParams<{ ruleId: string }>();
  const navigate = useNavigate();
  const isNew = ruleId === "new";

  const [rule, setRule] = useState<RuleOut | null>(null);
  const [events, setEvents] = useState<EventOut[]>([]);
  const [metrics, setMetrics] = useState<MetricResponse[]>([]);
  const [datasets, setDatasets] = useState<DatasetResponse[]>([]);
  const [loading, setLoading] = useState(!isNew);
  const [editing, setEditing] = useState(isNew);

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const rulePeriodArgument =
    (rule?.run_params?.arguments.find(
      (argument): argument is RuleRunPeriod => argument.role === "period",
    ) as RuleRunPeriod | undefined) ?? null;
  const [conditionRows, setConditionRows] = useState<ConditionRow[]>([]);
  /** The stored condition has a shape this editor cannot draw — editing would silently rewrite it. */
  const [conditionUnrepresentable, setConditionUnrepresentable] =
    useState(false);
  const [conditionError, setConditionError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [runOpen, setRunOpen] = useState(false);
  // A trial's result lives here, not on the rule: 试算 publishes nothing, so there is nothing to reload.
  const [trial, setTrial] = useState<RulesEvaluateResponse | null>(null);
  const [busyEventId, setBusyEventId] = useState<string | null>(null);
  const [paramCandidates, setParamCandidates] = useState<string[]>([]);

  const metricName = useMemo(() => {
    const byId = new Map(metrics.map((metric) => [metric.id, metric.name]));
    return (id: string) => byId.get(id) ?? id.slice(0, 8);
  }, [metrics]);
  const datasetName = useMemo(() => {
    const byId = new Map(
      datasets.map((dataset) => [
        dataset.id,
        dataset.display_name || dataset.table_name || dataset.id.slice(0, 8),
      ]),
    );
    return (id: string) => byId.get(id) ?? id.slice(0, 8);
  }, [datasets]);

  /** Fields a group-by can use: the model fields of the metric this rule watches. */
  useEffect(() => {
    let cancelled = false;
    const metric = metrics.find((entry) => entry.id === form.metricId);
    if (!metric) {
      setParamCandidates([]);
      return () => {
        cancelled = true;
      };
    }
    void (async () => {
      try {
        const fields = await fetchModelFields(metric.semantic_model_id);
        if (!cancelled) {
          setParamCandidates(
            fields.items.map((field: SemanticModelFieldResponse) => field.name),
          );
        }
      } catch {
        if (!cancelled) setParamCandidates([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [form.metricId, metrics]);

  const loadPickers = useCallback(async () => {
    const [metricPage, datasetPage] = await Promise.all([
      fetchMetrics().catch(() => ({ items: [] as MetricResponse[], total: 0 })),
      fetchDatasets({ limit: 200 }).catch(() => ({
        items: [] as DatasetResponse[],
        total: 0,
      })),
    ]);
    setMetrics(metricPage.items);
    setDatasets(datasetPage.items);
    return { metrics: metricPage.items, datasets: datasetPage.items };
  }, []);

  const load = useCallback(async () => {
    if (isNew) return;
    setLoading(true);
    try {
      const [current, eventPage, pickers] = await Promise.all([
        fetchRule(ruleId ?? ""),
        fetchRuleEvents(ruleId ?? "", { limit: 50 }).catch(() => ({
          items: [] as EventOut[],
          total: 0,
        })),
        loadPickers(),
      ]);
      setRule(current);
      // Creating a rule navigates here with the editor state still "on"; loading a stored rule is
      // always a read view, so entering the page never starts half-edited.
      setEditing(false);
      setEvents(eventPage.items);
      setForm(formFromRule(current, pickers.metrics, pickers.datasets));
      // A stored condition the flat editor cannot show (a nested group) leaves the rows empty and the
      // page says so; nothing is silently rewritten.
      const rows = rowsFromCondition(current.condition);
      setConditionRows(rows ?? []);
      setConditionUnrepresentable(rows === null);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t("rules.toastLoadFailed"));
    } finally {
      setLoading(false);
    }
  }, [isNew, ruleId, t, loadPickers]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!isNew) return;
    void loadPickers().then((pickers) => {
      const next: FormState = {
        ...EMPTY_FORM,
        metricId: pickers.metrics[0]?.id ?? "",
        datasetId: pickers.datasets[0]?.id ?? "",
      };
      setForm(next);
      setConditionRows([
        newRow({
          metricId: pickers.metrics[0]?.id ?? "",
          datasetId: pickers.datasets[0]?.id ?? "",
        }),
      ]);
    });
  }, [isNew, loadPickers]);

  const save = async () => {
    if (!form.name.trim()) return;
    if (conditionUnrepresentable) {
      setConditionError(t("rules.conditionUnrepresentable"));
      return;
    }
    const condition = conditionFromRows(conditionRows);
    if (!condition) {
      setConditionError(t("rules.conditionIncomplete"));
      return;
    }
    setSaving(true);
    try {
      const payload = buildRulePayload(form, condition);
      if (isNew) {
        const created = await createRule(payload);
        toast.success(t("rules.toastCreated"));
        navigate(`/data-rules/${created.id}`, { replace: true });
      } else if (rule) {
        const updated = await updateRule(rule.id, payload);
        setRule(updated);
        setForm(formFromRule(updated, metrics, datasets));
        setEditing(false);
        toast.success(t("rules.toastUpdated"));
      }
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t("rules.toastSaveFailed"));
    } finally {
      setSaving(false);
    }
  };

  const cancelEdit = () => {
    if (isNew) {
      navigate("/data-rules");
      return;
    }
    if (rule) {
      setForm(formFromRule(rule, metrics, datasets));
      const rows = rowsFromCondition(rule.condition);
      setConditionRows(rows ?? []);
      setConditionUnrepresentable(rows === null);
    }
    setConditionError(null);
    setEditing(false);
  };

  const actions = useRuleActions({
    rule,
    load,
    runOpen,
    setRunOpen,
    setTrial,
    running,
    setRunning,
    eventCount: events.length,
    setBusyEventId,
  });

  // The author's own word for what a run picks ("方案") makes the sentence concrete; without one the
  // sentence stays domain-neutral ("one object at a time"). Neither ever says "scenario".
  const groupLabel = rule?.group_by?.label ?? null;
  const joiners = {
    and: t("rules.joinAnd"),
    or: t("rules.joinOr"),
    scopePrefix: t("rules.scopePrefix"),
    scopeAtRunTime: groupLabel
      ? t("rules.groupedByNamed", { name: groupLabel })
      : t("rules.groupedBy"),
  };
  const conditionText =
    conditionLabel(
      rule?.condition ?? null,
      { metricName, datasetName, ...joiners },
      rule?.group_by,
    ) ?? "";
  const scopeNote = conditionScopeNote(
    rule?.condition ?? null,
    { metricName, datasetName, ...joiners },
    rule?.group_by,
  );

  if (loading) {
    return (
      <div className="ontology-admin">
        <p className="page-subtitle">
          <Loader2 size={16} className="animate-spin" aria-hidden />{" "}
          {t("shared.loading")}
        </p>
      </div>
    );
  }

  if (!isNew && !rule) {
    return (
      <div className="ontology-admin">
        <p className="page-subtitle">{t("rules.notFound")}</p>
      </div>
    );
  }

  return (
    <div className="ontology-admin">
      <div className="page-header">
        <div>
          <Link to="/data-rules" className="rules-back">
            <ArrowLeft size={16} aria-hidden />
            {t("rules.backToList")}
          </Link>
          <h1>{isNew ? t("rules.dialogCreate") : (rule?.name ?? "—")}</h1>
          {rule ? (
            <p className="page-subtitle">
              <StatusLine>
                <StatusChip tone={severityTone(rule.severity)}>
                  {rule.severity ?? "—"}
                </StatusChip>
                <StatusChip tone={rule.status === "paused" ? "neutral" : "ok"}>
                  {rule.status === "paused"
                    ? t("rules.paused")
                    : t("rules.active")}
                </StatusChip>
                <StatusLineNote>
                  {rule.rule_id ?? ""}
                  {rule.owner ? ` · ${rule.owner}` : ""} · v{rule.version ?? 1}
                </StatusLineNote>
              </StatusLine>
            </p>
          ) : null}
        </div>
        <div className="page-header-actions">
          {editing ? (
            <>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={cancelEdit}
                disabled={saving}
              >
                {t("shared.cancel")}
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => void save()}
                disabled={saving || !form.name.trim()}
              >
                {saving
                  ? t("rules.saving")
                  : isNew
                    ? t("shared.create")
                    : t("shared.save")}
              </button>
            </>
          ) : rule ? (
            <>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setEditing(true)}
              >
                <Pencil size={16} aria-hidden />
                {t("shared.edit")}
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setRunOpen(true)}
                disabled={running}
              >
                {running ? (
                  <Loader2 size={16} className="animate-spin" aria-hidden />
                ) : (
                  <Play size={16} aria-hidden />
                )}
                {t("rules.run")}
              </button>
            </>
          ) : null}
        </div>
      </div>

      <div className="account-stack">
        {editing ? (
          <>
            <EntityViewPanel title={t("rules.panelBasics")}>
              <RuleBasicsForm
                value={{
                  name: form.name,
                  ruleId: form.ruleId,
                  severity: form.severity,
                  status: form.status,
                  groupField: form.groupField,
                  runArgs: form.runArgs,
                }}
                onChange={(next) => setForm({ ...form, ...next })}
                fields={paramCandidates}
                periodSpec={rulePeriodArgument}
                groupField={form.groupField}
              />
            </EntityViewPanel>

            <EntityViewPanel
              title={
                form.mode === "relation"
                  ? t("rules.panelRelation")
                  : t("rules.panelCondition")
              }
              description={
                form.mode === "relation"
                  ? t("rules.panelRelationHint")
                  : t("rules.panelConditionHint")
              }
            >
              {/* Two kinds of check, one place: a threshold, or an identity between metrics. */}
              <div
                className="ds-view-toggle rules-mode"
                role="tablist"
                aria-label={t("rules.modeAria")}
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={form.mode === "condition"}
                  className={`ds-view-toggle__btn ${form.mode === "condition" ? "active" : ""}`}
                  onClick={() => setForm({ ...form, mode: "condition" })}
                >
                  {t("rules.modeCondition")}
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={form.mode === "relation"}
                  className={`ds-view-toggle__btn ${form.mode === "relation" ? "active" : ""}`}
                  onClick={() => setForm({ ...form, mode: "relation" })}
                >
                  {t("rules.modeRelation")}
                </button>
              </div>

              {form.mode === "relation" ? (
                <RelationEditor
                  value={form.relations}
                  onChange={(relations) => setForm({ ...form, relations })}
                  metrics={metrics}
                  metricName={metricName}
                />
              ) : null}

              {form.mode === "condition" ? (
                <>
                  {/* The logic, in words, as the rows are edited — the editor shows fields, this shows the
                      sentence a reader would have to reconstruct from them. */}
                  <p className="rules-condition-current">
                    {conditionLabel(
                      conditionFromRows(conditionRows),
                      { metricName, datasetName, ...joiners },
                      form.groupField.trim()
                        ? { field: form.groupField.trim() }
                        : null,
                    ) ?? t("rules.conditionIncomplete")}
                  </p>
                  {conditionUnrepresentable ? (
                    <p className="rules-condition-warning">
                      {t("rules.conditionUnrepresentable")}
                    </p>
                  ) : null}
                  <ConditionRows
                    rows={conditionRows}
                    onChange={(next) => {
                      setConditionRows(next);
                      setConditionError(null);
                    }}
                    metrics={metrics}
                    datasets={datasets}
                    error={conditionError}
                  />
                </>
              ) : null}
            </EntityViewPanel>

            <EntityViewPanel
              title={t("rules.panelMeaning")}
              description={t("rules.panelMeaningHint")}
            >
              <div className="rules-form">
                <FormField
                  label={t("rules.fieldConclusion")}
                  hint={t("rules.fieldConclusionHint")}
                >
                  <input
                    type="text"
                    value={form.conclusion}
                    onChange={(e) =>
                      setForm({ ...form, conclusion: e.target.value })
                    }
                  />
                </FormField>
                <FormField
                  label={t("rules.fieldSuggestion")}
                  hint={t("rules.fieldSuggestionHint")}
                >
                  <textarea
                    rows={3}
                    value={form.suggestion}
                    onChange={(e) =>
                      setForm({ ...form, suggestion: e.target.value })
                    }
                  />
                </FormField>
              </div>
            </EntityViewPanel>
          </>
        ) : (
          <RuleReadPanels
            rule={rule!}
            conditionText={conditionText}
            scopeNote={scopeNote}
            events={events}
            busyEventId={busyEventId}
            onTransition={(event, status) =>
              void actions.moveEvent(event, status)
            }
            onDelete={() => void actions.remove()}
            lookups={{
              metricName,
              datasetName,
              ...joiners,
              derivedWord: (word) =>
                t(
                  `rules.evidence${{ target: "Target", residual: "Residual", tolerance: "Tolerance" }[word]}`,
                ),
            }}
          />
        )}
      </div>

      <RunRulesDialog
        open={runOpen}
        busy={running}
        onClose={() => {
          setRunOpen(false);
          setTrial(null);
        }}
        onRun={(params) => void actions.run(params)}
        onTrial={(params) => void actions.trialRun(params)}
        trial={trial}
        runArguments={rule?.run_params?.arguments ?? []}
        lookups={{
          metricName,
          datasetName,
          ...joiners,
          derivedWord: (word) =>
            t(
              `rules.evidence${{ target: "Target", residual: "Residual", tolerance: "Tolerance" }[word]}`,
            ),
        }}
      />
    </div>
  );
}
