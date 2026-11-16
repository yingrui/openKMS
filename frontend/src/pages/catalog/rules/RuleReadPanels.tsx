/**
 * The read view of one rule: what it asserts, what it last computed, and what it raised.
 *
 * Split out of the page so the page keeps the state and the two modes, and this file keeps the
 * presentation — the same reason the editor panels are separate.
 */

import { useTranslation } from "react-i18next";
import { BellRing, Trash2 } from "lucide-react";
import { EmptyState, StatusChip } from "../../../styles/design-system";
import { EntityViewPanel } from "../../shared/EntityViewShell";
import { relationLabel } from "./rulesLabels";
import type { EventOut } from "../../../data/eventsApi";
import type { RuleOut, RuleRunPeriod } from "../../../data/rulesApi";
import { RulesEventsTable } from "./RulesEventsTable";
import type { LabelLookups } from "./rulesLabels";

export function RuleReadPanels({
  rule,
  conditionText,
  events,
  busyEventId,
  onTransition,
  onDelete,
  lookups,
}: {
  rule: RuleOut;
  conditionText: string;
  scopeNote: string | null;
  events: EventOut[];
  busyEventId: string | null;
  onTransition: (event: EventOut, status: "resolved" | "dismissed") => void;
  onDelete: () => void;
  lookups: LabelLookups & { metricName: (id: string) => string };
}) {
  const { t } = useTranslation("ontology");
  const periodArgument =
    (rule.run_params?.arguments.find(
      (argument): argument is RuleRunPeriod => argument.role === "period",
    ) as RuleRunPeriod | undefined) ?? null;
  const extraArguments = (rule.run_params?.arguments ?? []).filter(
    (argument) => argument.role !== "period",
  );
  return (
    <>
      <EntityViewPanel
        title={t("rules.panelDefinition")}
        description={t("rules.panelDefinitionHint")}
      >
        <dl className="rules-facts">
          <dt>
            {(rule.identities?.length ?? 0) > 0
              ? t("rules.relationLabel")
              : t("rules.colCondition")}
          </dt>
          <dd>
            {(rule.identities?.length ?? 0) > 0 ? (
              // Every identity is stated: one rule may assert several, and the reader needs all of
              // them (the event names the one that failed).
              <ul className="rules-identities">
                {rule.identities?.map((identity, index) => (
                  <li key={index}>
                    <code className="rules-condition">
                      {relationLabel(identity, lookups.metricName)}
                    </code>
                    {identity.note ? (
                      <p className="rules-hint">{identity.note}</p>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <code className="rules-condition">{conditionText}</code>
            )}
          </dd>
          <dt>{t("rules.runValues")}</dt>
          <dd>
            {periodArgument ? (
              <span>
                {periodArgument.field}{" "}
                —{" "}
                {periodArgument.has_interval
                  ? t("rules.runParamsRequired", {
                      formats:
                        periodArgument.format ??
                        t("rules.runParamsCustomFormat"),
                    })
                  : t("rules.periodNoInterval")}
                <span className="page-subtitle">
                  {" — "}
                  {t("rules.runParamsFiltersOn", {
                    dimensions: periodArgument.field,
                  })}
                </span>
              </span>
            ) : (
              t("datasets.dash")
            )}
            {extraArguments.map((argument) => (
              <span key={argument.key} className="page-subtitle">
                {" · "}
                {argument.kind === "key"
                  ? t("rules.runArgKeyRead", {
                      field: argument.field ?? argument.key,
                    })
                  : t("rules.runArgFilterRead", {
                      field: argument.field ?? argument.key,
                    })}
              </span>
            ))}
          </dd>
          <dt>{t("rules.fieldConclusion")}</dt>
          <dd>{rule?.conclusion || "—"}</dd>
          <dt>{t("rules.fieldSuggestion")}</dt>
          <dd>{rule?.suggestion || t("rules.noSuggestion")}</dd>
          <dt>{t("rules.fieldStatus")}</dt>
          <dd>
            {rule?.status === "paused" ? t("rules.paused") : t("rules.active")}
          </dd>
        </dl>
        <div className="rules-danger-row">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onDelete}
          >
            <Trash2 size={16} aria-hidden />
            {t("rules.deleteRule")}
          </button>
        </div>
      </EntityViewPanel>

      <EntityViewPanel title={t("rules.panelLastRun")}>
        {rule?.last_status ? (
          <dl className="rules-facts">
            <dt>{t("rules.fieldStatus")}</dt>
            <dd>
              <StatusChip
                tone={
                  rule.last_status === "fail"
                    ? "warn"
                    : rule.last_status === "pass"
                      ? "ok"
                      : "neutral"
                }
              >
                {t(`rules.status.${rule.last_status}`)}
              </StatusChip>
              <span className="rules-status-meaning">
                {t("rules.statusMeaning")}
              </span>
            </dd>
            <dt>{t("rules.colLastRun")}</dt>
            <dd>
              {rule.last_run_at
                ? new Date(rule.last_run_at).toLocaleString()
                : "—"}
            </dd>
            <dt>{t("rules.colPeriod")}</dt>
            <dd>
              {rule.last_period_start || "—"}
              {rule.last_period_end &&
              rule.last_period_end !== rule.last_period_start
                ? ` – ${rule.last_period_end}`
                : ""}
            </dd>
            {rule.last_reason ? (
              <>
                <dt>{t("rules.fieldReason")}</dt>
                <dd>{rule.last_reason}</dd>
              </>
            ) : null}
          </dl>
        ) : (
          <p className="page-subtitle">{t("rules.neverRun")}</p>
        )}
      </EntityViewPanel>

      <EntityViewPanel
        title={t("rules.panelEvents")}
        description={t("rules.panelEventsHint")}
      >
        {events.length === 0 ? (
          <EmptyState
            icon={<BellRing size={32} aria-hidden />}
            title={t("rules.emptyEvents")}
          />
        ) : (
          <RulesEventsTable
            events={events}
            busyEventId={busyEventId}
            showPeriod
            onTransition={onTransition}
          />
        )}
      </EntityViewPanel>
    </>
  );
}
