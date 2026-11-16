/** **Alert copy**: what a reader sees on the event when the rule fires. */
import { useTranslation } from "react-i18next";
import { FormField } from "../../../styles/design-system";

export type AlertValue = { conclusion: string; suggestion: string };

export function RuleAlertForm({
  value,
  onChange,
}: {
  value: AlertValue;
  onChange: (next: Partial<AlertValue>) => void;
}) {
  const { t } = useTranslation("ontology");
  return (
    <div className="rules-form">
      <FormField
        label={t("rules.fieldConclusion")}
        hint={t("rules.fieldConclusionHint")}
      >
        <input
          type="text"
          value={value.conclusion}
          onChange={(e) => onChange({ conclusion: e.target.value })}
        />
      </FormField>
      <FormField
        label={t("rules.fieldSuggestion")}
        hint={t("rules.fieldSuggestionHint")}
      >
        <input
          type="text"
          value={value.suggestion}
          onChange={(e) => onChange({ suggestion: e.target.value })}
        />
      </FormField>
    </div>
  );
}
