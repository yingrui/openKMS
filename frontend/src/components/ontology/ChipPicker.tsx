import { useMemo, useState } from 'react';
import { Check, Search } from 'lucide-react';

/**
 * Pick a few things out of a long list — by typing, not by scrolling a wall of checkboxes.
 *
 * A table with nineteen columns and two unique keys turned into ~57 checkbox rows: the space cost of
 * a list is proportional to the list, and the cost of typing is not. This is the picker the Playground
 * already used for a metric's group-by fields, extracted here because the dataset's keys need exactly
 * the same thing.
 *
 * The **chips stay the caller's**: a Playground chip carries a granularity selector, a key's chip does
 * not. What lives here is the part that is identical — the search input, the menu that appears only
 * while it is being used, and the keyboard habits (↑↓ move, Enter adds, backspace with an empty input
 * drops the last chip).
 */

export interface ChipPickerOption {
  id: string;
  label: string;
  /** A quieter second line or trailing detail — a column's type, a field's label. */
  hint?: string;
  /** Options are shown under their group's heading, in the order the group names are given. */
  group?: string;
}

export interface ChipPickerProps {
  options: ChipPickerOption[];
  /** The group headings, in order. Options with no group render first, without a heading. */
  groups?: string[];
  /** Already picked: shown as selected, and picking them again removes them. */
  isPicked: (id: string) => boolean;
  onPick: (id: string) => void;
  placeholder: string;
  ariaLabel: string;
  /** Explains the habits (type to filter, Enter adds, Backspace removes). */
  title?: string;
  emptyLabel: string;
  /** Backspace on an empty input: the autocomplete habit of dropping the last chip. */
  onBackspaceEmpty?: () => void;
  /** Prefixes the element ids in this instance, so two pickers can live on one page. */
  idPrefix: string;
}

export function ChipPicker({
  options,
  groups,
  isPicked,
  onPick,
  placeholder,
  ariaLabel,
  title,
  emptyLabel,
  onBackspaceEmpty,
  idPrefix,
}: ChipPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlighted, setHighlighted] = useState(0);

  const needle = query.trim().toLowerCase();
  const matches = useMemo(
    () =>
      options.filter(
        (option) =>
          !needle ||
          option.label.toLowerCase().includes(needle) ||
          (option.hint ?? '').toLowerCase().includes(needle),
      ),
    [options, needle],
  );
  /** The flat order the keyboard walks: ungrouped first, then each group. */
  const ordered = useMemo(() => {
    if (!groups || groups.length === 0) return matches;
    return [
      ...matches.filter((option) => !option.group),
      ...groups.flatMap((group) => matches.filter((option) => option.group === group)),
    ];
  }, [matches, groups]);
  const active = ordered[highlighted] ?? null;

  const commit = (option: ChipPickerOption) => {
    onPick(option.id);
    setQuery('');
    setHighlighted(0);
  };

  return (
    <div
      className="chip-picker"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      <div className="chip-picker__search">
        <Search size={16} aria-hidden />
        {/* ds-control-exempt: `.chip-picker__search input` styles this (its own sheet) */}
        <input
          type="search"
          role="combobox"
          aria-expanded={open}
          aria-controls={`${idPrefix}-menu`}
          aria-autocomplete="list"
          aria-activedescendant={open && active ? `${idPrefix}-${active.id}` : undefined}
          aria-label={ariaLabel}
          placeholder={placeholder}
          title={title}
          value={query}
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            setQuery(event.target.value);
            setHighlighted(0);
            setOpen(true);
          }}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              setOpen(true);
              setHighlighted((h) => Math.min(h + 1, ordered.length - 1));
            } else if (event.key === 'ArrowUp') {
              event.preventDefault();
              setHighlighted((h) => Math.max(h - 1, 0));
            } else if (event.key === 'Enter') {
              if (open && active) {
                event.preventDefault();
                commit(active);
              }
            } else if (event.key === 'Escape') {
              setOpen(false);
              setQuery('');
            } else if (event.key === 'Backspace' && !query && onBackspaceEmpty) {
              onBackspaceEmpty();
            }
          }}
        />
      </div>

      {open && (
        <div className="chip-picker__menu" id={`${idPrefix}-menu`} role="listbox">
          {ordered.length === 0 ? (
            <p className="chip-picker__empty">{emptyLabel}</p>
          ) : (
            <>
              {!groups?.length && (
                <ul>{ordered.map((option) => renderOption(option, idPrefix, isPicked, active, commit))}</ul>
              )}
              {groups?.length ? (
                <>
                  {ordered
                    .filter((option) => !option.group)
                    .map((option) => (
                      <ul key={option.id}>
                        {renderOption(option, idPrefix, isPicked, active, commit)}
                      </ul>
                    ))}
                  {groups.map((group) => {
                    const inGroup = ordered.filter((option) => option.group === group);
                    if (inGroup.length === 0) return null;
                    return (
                      <div key={group}>
                        <p className="chip-picker__menu-head">{group}</p>
                        <ul>
                          {inGroup.map((option) =>
                            renderOption(option, idPrefix, isPicked, active, commit),
                          )}
                        </ul>
                      </div>
                    );
                  })}
                </>
              ) : null}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function renderOption(
  option: ChipPickerOption,
  idPrefix: string,
  isPicked: (id: string) => boolean,
  active: ChipPickerOption | null,
  onSelect: (option: ChipPickerOption) => void,
) {
  const picked = isPicked(option.id);
  return (
    <li
      key={option.id}
      id={`${idPrefix}-${option.id}`}
      role="option"
      aria-selected={picked}
      className={`chip-picker__option${active?.id === option.id ? ' chip-picker__option--active' : ''}`}
      onClick={() => onSelect(option)}
    >
      <span className="chip-picker__option-label">{option.label}</span>
      {option.hint ? <span className="chip-picker__option-hint">{option.hint}</span> : null}
      {picked ? <Check size={14} aria-hidden /> : null}
    </li>
  );
}
