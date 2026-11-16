/**
 * **Basic information**: what the rule is called, and how it is identified.
 *
 * One card per intent, not one form for the whole rule: a rule is defined in four independent steps (what it
 * is, what must hold, how it runs, what it says when it fails), and each step gets its own card so a reader
 * can find the field they came to change.
 */
import { useTranslation } from "react-i18next";
import { FormField } from "../../../styles/design-system";

export type BasicsValue = {
  name: string;
  description: string;
  ruleId: string;
  severity: "P0" | "P1" | "P2";
  status: "active" | "paused";
};

export function RuleBasicsForm({
  value,
  onChange,
}: {
  value: BasicsValue;
  onChange: (next: Partial<BasicsValue>) => void;
}) {
  const { t } = useTranslation("ontology");
  return (
    <div className="rules-form">
      <FormField label={t("rules.fieldName")}>
        <input
          type="text"
          value={value.name}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder={t("rules.fieldNamePlaceholder")}
        />
      </FormField>
      <FormField
        label={t("rules.fieldRuleId")}
        hint={t("rules.fieldRuleIdHint")}
      >
        <input
          type="text"
          value={value.ruleId}
          onChange={(e) => onChange({ ruleId: e.target.value })}
          placeholder={t("rules.fieldRuleIdPlaceholder")}
          autoComplete="off"
        />
      </FormField>
      <FormField label={t("rules.fieldSeverity")}>
        <select
          value={value.severity}
          onChange={(e) =>
            onChange({ severity: e.target.value as BasicsValue["severity"] })
          }
        >
          {["P0", "P1", "P2"].map((severity) => (
            <option key={severity} value={severity}>
              {severity}
            </option>
          ))}
        </select>
      </FormField>
      <FormField label={t("rules.fieldStatus")}>
        <select
          value={value.status}
          onChange={(e) =>
            onChange({ status: e.target.value as BasicsValue["status"] })
          }
        >
          <option value="active">{t("rules.active")}</option>
          <option value="paused">{t("rules.paused")}</option>
        </select>
      </FormField>
    </div>
  );
}
