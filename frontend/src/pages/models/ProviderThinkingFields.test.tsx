/**
 * The provider's thinking fragments: two JSON boxes, a hover tip of shapes per box, and no silent data loss.
 *
 * The shapes differ per vendor and are easy to get wrong, so the tip carries them — it is the only place the examples
 * live now that there is no vendor menu — and invalid JSON is refused rather than saved as nothing.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ProviderThinkingFields } from './ProviderThinkingFields';

vi.mock('react-i18next', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-i18next')>();
  return {
    ...actual,
    useTranslation: () => ({ t: (key: string) => key }),
  };
});

describe('ProviderThinkingFields', () => {
  it('puts the vendor shapes in the label tip, without claiming to be a control', () => {
    const { container } = render(<ProviderThinkingFields value={null} onChange={() => {}} />);

    const markers = container.querySelectorAll('.models-field-label__help');
    expect(markers).toHaveLength(2);
    // The tip carries the examples; there is no button, because a button that cannot do anything is a promise.
    expect(markers[0].getAttribute('title')).toBe('models.provThinkingOnHelp');
    expect(markers[1].getAttribute('title')).toBe('models.provThinkingOffHelp');
    expect(container.querySelector('button.models-field-label__help')).toBeNull();
    // Focusable, so the tooltip is not mouse-only.
    expect(markers[0].getAttribute('tabindex')).toBe('0');
  });

  it('saves both fragments once the JSON is valid', () => {
    const onChange = vi.fn();
    const { container } = render(<ProviderThinkingFields value={null} onChange={onChange} />);
    const [onBox, offBox] = Array.from(container.querySelectorAll('textarea'));

    fireEvent.change(onBox, { target: { value: '{"thinking": {"type": "enabled"}}' } });
    fireEvent.change(offBox, { target: { value: '{"thinking": {"type": "disabled"}}' } });

    expect(onChange).toHaveBeenLastCalledWith({
      on: { thinking: { type: 'enabled' } },
      off: { thinking: { type: 'disabled' } },
    });
  });

  it('refuses invalid JSON instead of saving nothing', () => {
    const onChange = vi.fn();
    const { container } = render(<ProviderThinkingFields value={null} onChange={onChange} />);
    const [onBox] = Array.from(container.querySelectorAll('textarea'));

    fireEvent.change(onBox, { target: { value: '{"thinking": ' } });

    expect(screen.getByText('models.provThinkingInvalid')).toBeTruthy();
    // The half-typed value never reaches the form state, so a save cannot clear the stored fragments by accident.
    expect(onChange).not.toHaveBeenCalledWith(expect.objectContaining({ on: expect.anything() }));
  });

  it('treats an emptied box as "this provider cannot be asked"', () => {
    const onChange = vi.fn();
    const { container } = render(
      <ProviderThinkingFields value={{ on: { enable_thinking: true } }} onChange={onChange} />,
    );
    const [onBox] = Array.from(container.querySelectorAll('textarea'));

    fireEvent.change(onBox, { target: { value: '' } });

    expect(onChange).toHaveBeenLastCalledWith(null);
  });
});
