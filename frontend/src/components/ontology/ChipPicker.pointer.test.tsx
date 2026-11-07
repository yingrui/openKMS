/**
 * Mouse and touch have to work, not just the keyboard.
 *
 * The picker closes on blur when focus leaves its box. An `<li role="option">` is not focusable,
 * so pressing one moves focus to `<body>`: the menu unmounts on blur before the `click` lands and
 * the selection is lost. Keyboard tests never covered this. Real browsers report a null
 * `relatedTarget` for precisely the case a user hits most often — clicking an option.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { ChipPicker, type ChipPickerOption } from './ChipPicker';

const OPTIONS: ChipPickerOption[] = [
  { id: 'f1', label: 'ts_code', hint: 'String' },
  { id: 'f2', label: 'close', hint: 'Float' },
];

function Harness({ onPick }: { onPick?: (id: string) => void }) {
  const [picked, setPicked] = useState<string[]>([]);
  return (
    <ChipPicker
      idPrefix="test"
      options={OPTIONS}
      isPicked={(id) => picked.includes(id)}
      onPick={(id) => {
        onPick?.(id);
        setPicked((prev) => [...prev, id]);
      }}
      ariaLabel="Group by"
      placeholder="Type a field name…"
      emptyLabel="No field matches."
    />
  );
}

describe('ChipPicker with a mouse', () => {
  it('picks an option when it is clicked', () => {
    const picked: string[] = [];
    render(<Harness onPick={(id) => picked.push(id)} />);

    const input = screen.getByRole('combobox', { name: 'Group by' });
    fireEvent.focus(input);
    const option = screen.getByRole('option', { name: /ts_code/ });
    fireEvent.click(option);

    expect(picked).toEqual(['f1']);
  });

  it('does not close the menu on mousedown, so the click still lands', () => {
    // The browser order is mousedown → (focus change) → mouseup → click. Preventing the default
    // on mousedown keeps focus on the input, which is what stops the menu unmounting early.
    const picked: string[] = [];
    render(<Harness onPick={(id) => picked.push(id)} />);

    const input = screen.getByRole('combobox', { name: 'Group by' });
    fireEvent.focus(input);
    const option = screen.getByRole('option', { name: /ts_code/ });

    fireEvent.mouseDown(option);
    fireEvent.mouseUp(option);
    fireEvent.click(option);

    expect(picked).toEqual(['f1']);
  });

  it('keeps the menu open when focus stays inside the picker', () => {
    render(<Harness />);
    const input = screen.getByRole('combobox', { name: 'Group by' });
    fireEvent.focus(input);

    const option = screen.getByRole('option', { name: /ts_code/ });
    fireEvent.blur(input, { relatedTarget: option });

    expect(screen.queryByRole('listbox')).not.toBeNull();
  });
});
