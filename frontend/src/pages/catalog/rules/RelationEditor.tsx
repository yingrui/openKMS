/**
 * The identities editor: each identity is a target metric, weighted members, a tolerance; a rule may
 * assert several of them (a snapshot's amount, its line count, two counts), judged together per scope.
 *
 * Extracted from the rule page because the page was 880 lines — and because this block is the one part
 * with no idea what a rule is: it edits identities, renders what they say, and hands the value back.
 */
import { useTranslation } from "react-i18next";
import { Minus, Plus } from "lucide-react";
import { FormField } from "../../../styles/design-system";
import { relationLabel } from "./rulesLabels";
import {
  emptyRelationDraft,
  relationPayload,
  type RelationDraft,
  type RelationMemberDraft,
} from "./relationDraft";
import type { MetricResponse } from "../../../data/metricsApi";

export function RelationEditor({
  value,
  onChange,
  metrics,
  metricName,
}: {
  value: RelationDraft[];
  onChange: (next: RelationDraft[]) => void;
  metrics: MetricResponse[];
  metricName: (id: string) => string;
}) {
  const { t } = useTranslation("ontology");
  const patch = (at: number, next: Partial<RelationDraft>) =>
    onChange(
      value.map((draft, index) =>
        index === at ? { ...draft, ...next } : draft,
      ),
    );
  const setMember = (
    at: number,
    index: number,
    next: Partial<RelationMemberDraft>,
  ) =>
    patch(at, {
      members: value[at].members.map((row, rowIndex) =>
        rowIndex === index ? { ...row, ...next } : row,
      ),
    });

  return (
    <div className="rules-form">
      <p className="rules-hint">{t("rules.relationIntro")}</p>
      {value.map((draft, at) => (
        <div className="rules-relation" key={at}>
          <p className="rules-relation__title">
            {value.length > 1
              ? t("rules.relationNumber", { index: at + 1 })
              : t("rules.relationLabel")}
            {value.length > 1 ? (
              <button
                type="button"
                className="btn btn-secondary btn-sm rules-relation__remove"
                onClick={() =>
                  onChange(value.filter((_draft, index) => index !== at))
                }
              >
                {t("rules.relationRemove")}
              </button>
            ) : null}
          </p>
          <FormField
            label={t("rules.relationTarget")}
            hint={t("rules.relationTargetHint")}
          >
            <select
              value={draft.target}
              onChange={(e) => patch(at, { target: e.target.value })}
            >
              <option value="">{t("rules.relationPickMetric")}</option>
              {metrics.map((metric) => (
                <option key={metric.id} value={metric.id}>
                  {metric.name}
                </option>
              ))}
            </select>
          </FormField>

          {draft.members.map((member, index) => (
            <div key={index} className="rules-relation-member">
              <FormField label={index === 0 ? t("rules.relationMember") : " "}>
                <select
                  value={member.metricId}
                  onChange={(e) =>
                    setMember(at, index, { metricId: e.target.value })
                  }
                >
                  <option value="">{t("rules.relationPickMetric")}</option>
                  {metrics.map((metric) => (
                    <option key={metric.id} value={metric.id}>
                      {metric.name}
                    </option>
                  ))}
                </select>
              </FormField>
              <FormField label={index === 0 ? t("rules.relationWeight") : " "}>
                <input
                  type="number"
                  step="any"
                  value={member.weight}
                  onChange={(e) =>
                    setMember(at, index, { weight: e.target.value })
                  }
                />
              </FormField>
              <button
                type="button"
                className="btn btn-secondary btn-sm rules-relation-remove"
                aria-label={t("rules.relationRemoveMember")}
                title={t("rules.relationRemoveMember")}
                disabled={draft.members.length <= 1}
                onClick={() =>
                  patch(at, {
                    members: draft.members.filter(
                      (_, rowIndex) => rowIndex !== index,
                    ),
                  })
                }
              >
                <Minus size={14} aria-hidden />
              </button>
            </div>
          ))}

          <button
            type="button"
            className="btn btn-secondary btn-sm rules-relation-add"
            onClick={() =>
              patch(at, {
                members: [...draft.members, { metricId: "", weight: "1", groupField: "" }],
              })
            }
          >
            <Plus size={14} aria-hidden />
            {t("rules.relationAddMember")}
          </button>

          <FormField
            label={t("rules.relationTolerance")}
            hint={t("rules.relationToleranceHint")}
          >
            <div className="rules-relation-tolerance">
              <select
                value={draft.toleranceKind}
                onChange={(e) =>
                  patch(at, {
                    toleranceKind: e.target
                      .value as RelationDraft["toleranceKind"],
                  })
                }
              >
                <option value="abs">{t("rules.toleranceAbs")}</option>
                <option value="rel">{t("rules.toleranceRel")}</option>
              </select>
              <input
                type="number"
                step="any"
                min="0"
                value={draft.toleranceValue}
                onChange={(e) => patch(at, { toleranceValue: e.target.value })}
              />
            </div>
          </FormField>

          <p className="rules-condition-current">
            {relationLabel(relationPayload(draft), metricName)}
          </p>
        </div>
      ))}
      <button
        type="button"
        className="btn btn-secondary btn-sm"
        onClick={() => onChange([...value, emptyRelationDraft()])}
      >
        <Plus size={14} aria-hidden />
        {t("rules.relationAdd")}
      </button>
    </div>
  );
}
