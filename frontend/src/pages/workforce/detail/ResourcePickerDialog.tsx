import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  PickerCheck,
  PickerDialog,
  PickerList,
  PickerRow,
  PickerState,
} from '../../../components/picker/PickerDialog';
import { FormField } from '../../../styles/design-system';

/**
 * Pick several resources and add them in one action.
 *
 * The page used to offer a dropdown plus a "bind" button per section: one decision split into two steps, no search,
 * and one resource per round trip. This is the dialog the knowledge base pages already use for "add documents", with
 * the same parts — search, rows with a second line of information, and a footer that counts what you chose.
 *
 * Candidates and bound rows share one shape (`name` + `meta`), so what a reader sees while choosing matches what the
 * list shows afterwards.
 */
export type PickableResource = {
  id: string;
  name: string;
  /** A second line: document count, description, access mode — whatever tells two similar names apart. */
  meta?: string;
};

export function ResourcePickerDialog({
  open,
  title,
  addLabel,
  searchPlaceholder,
  emptyLabel,
  items,
  busy,
  onClose,
  onSubmit,
}: {
  open: boolean;
  title: string;
  addLabel: string;
  searchPlaceholder: string;
  emptyLabel: string;
  items: PickableResource[];
  busy: boolean;
  onClose: () => void;
  onSubmit: (ids: string[]) => Promise<void>;
}) {
  const { t } = useTranslation('workforce');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string[]>([]);

  const close = () => {
    setQuery('');
    setSelected([]);
    onClose();
  };

  const needle = query.trim().toLowerCase();
  const visible = needle
    ? items.filter(
        (item) =>
          item.name.toLowerCase().includes(needle) ||
          (item.meta ?? '').toLowerCase().includes(needle),
      )
    : items;

  const toggle = (id: string) =>
    setSelected((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
    );

  return (
    <PickerDialog
      open={open}
      title={title}
      onClose={close}
      closeDisabled={busy}
      footer={
        <>
          <span className="workforce-picker-count">
            {t('pickerSelected', { count: selected.length })}
          </span>
          <button type="button" className="btn btn-secondary" onClick={close} disabled={busy}>
            {t('cancel')}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy || selected.length === 0}
            onClick={() => void onSubmit(selected).then(close)}
          >
            {busy ? t('saving') : t('pickerAdd', { label: addLabel, count: selected.length })}
          </button>
        </>
      }
    >
      <FormField label={searchPlaceholder}>
        <input
          className="ds-control"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
        />
      </FormField>

      {visible.length === 0 ? (
        <PickerState>{emptyLabel}</PickerState>
      ) : (
        <PickerList>
          {visible.map((item) => (
            <li key={item.id}>
              <PickerRow
                name={item.name}
                meta={item.meta}
                selected={selected.includes(item.id)}
                leading={<PickerCheck selected={selected.includes(item.id)} />}
                onClick={() => toggle(item.id)}
              />
            </li>
          ))}
        </PickerList>
      )}
    </PickerDialog>
  );
}
