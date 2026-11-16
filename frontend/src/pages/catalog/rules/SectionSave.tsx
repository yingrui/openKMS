/** A card's own save: disabled until something in it differs from the server's answer. */
import { useTranslation } from 'react-i18next';

/** A card's own save: disabled until something in it differs from the server's answer. */
export function SectionSave({
  dirty,
  saving,
  onSave,
  onRevert,
}: {
  dirty: boolean;
  saving: boolean;
  onSave: () => void;
  onRevert: () => void;
}) {
  const { t } = useTranslation("ontology");
  return (
    <div className="rules-section-save">
      <button type="button" className="btn btn-secondary btn-sm" onClick={onRevert} disabled={!dirty || saving}>
        {t("shared.cancel")}
      </button>
      <button type="button" className="btn btn-primary btn-sm" onClick={onSave} disabled={!dirty || saving}>
        {saving ? t("rules.saving") : t("shared.save")}
      </button>
    </div>
  );
}

