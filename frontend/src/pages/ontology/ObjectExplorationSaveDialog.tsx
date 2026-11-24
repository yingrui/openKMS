import { useTranslation } from 'react-i18next';
import { Dialog, FormField } from '../../styles/design-system';

/**
 * Naming an exploration: its name, and who can open it.
 *
 * The sharing sentence is part of the dialog rather than of the docs, because "shared" is the one word here that
 * could be read as "and its data too" — and it is not.
 */
export function ObjectExplorationSaveDialog({
  open,
  updating,
  name,
  shared,
  saving,
  onName,
  onShared,
  onClose,
  onSave,
}: {
  open: boolean;
  /** An existing exploration is being renamed/updated rather than created. */
  updating: boolean;
  name: string;
  shared: boolean;
  saving: boolean;
  onName: (value: string) => void;
  onShared: (value: boolean) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  const { t } = useTranslation('explore');
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={updating ? t('objectSet.saveUpdate') : t('objectSet.saveCreate')}
      closeAriaLabel={t('shared.close')}
      size="sm"
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            {t('shared.cancel')}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={onSave}
            disabled={saving || !name.trim()}
          >
            {t('shared.save')}
          </button>
        </>
      }
    >
      <FormField label={t('objectSet.saveName')}>
        <input
          className="ds-control"
          value={name}
          onChange={(e) => onName(e.target.value)}
          placeholder={t('objectSet.saveNamePlaceholder')}
        />
      </FormField>
      <FormField label={t('objectSet.saveVisibility')} hint={t('objectSet.saveVisibilityHint')}>
        <select
          className="ds-control"
          value={shared ? 'shared' : 'private'}
          onChange={(e) => onShared(e.target.value === 'shared')}
        >
          <option value="private">{t('objectSet.visibilityPrivate')}</option>
          <option value="shared">{t('objectSet.visibilityShared')}</option>
        </select>
      </FormField>
    </Dialog>
  );
}
