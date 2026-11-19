/**
 * Preset buttons: a starting point that sets both sampling fields, and a "default" that clears them.
 *
 * The point of the test is that a preset is not a mode — matching is derived from the values, so typing 0.5 by hand
 * leaves no button active rather than showing "Balanced" while the stored value says otherwise.
 */
import { describe, expect, it } from 'vitest';
import { SAMPLING_PRESETS, applyPreset, matchPreset } from './samplingPresets';
import { draftFromConfig } from './workforceConfigDraft';

const base = draftFromConfig(null);

describe('sampling presets', () => {
  it('sets temperature and top-p together', () => {
    const precise = SAMPLING_PRESETS.find((p) => p.id === 'precise')!;
    const next = applyPreset(base, precise);
    expect(next.temperature).toBe('0');
    expect(next.topP).toBe('0.9');
  });

  it('default clears both, so an untouched config stays empty', () => {
    const filled = { ...base, temperature: '1', topP: '0.95' };
    const next = applyPreset(filled, SAMPLING_PRESETS.find((p) => p.id === 'default')!);
    expect(next.temperature).toBe('');
    expect(next.topP).toBe('');
  });

  it('a handwritten value leaves no button active', () => {
    expect(matchPreset({ ...base, temperature: '0.5', topP: '0.95' })).toBeNull();
  });

  it('recognises a value the reader typed that happens to match a preset', () => {
    expect(matchPreset({ ...base, temperature: '0.3', topP: '0.95' })).toBe('balanced');
  });

  it('empty fields match the default preset', () => {
    expect(matchPreset(base)).toBe('default');
  });
});
