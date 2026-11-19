/**
 * Sampling presets: a starting point for temperature and top-p, as one row of buttons.
 *
 * They set both values because a reader who wants "steadier answers" should not have to know which of the two knobs
 * does that — but the values are visible in the hint, and the fields below stay editable, so a preset is a starting
 * point rather than a mode. Nothing here is vendor knowledge: vendors publish defaults (GLM recommends temperature 1,
 * top-p 0.95), and those belong to the model, not to a generic three-button shortcut.
 *
 * `default` is the absence of a value: it clears both fields, which is the honest representation of "let the service
 * decide" and keeps a config that was never touched empty.
 */
import type { BehaviourDraft } from './workforceConfigDraft';

export type SamplingPresetId = 'default' | 'precise' | 'balanced' | 'creative';

export type SamplingPreset = {
  id: SamplingPresetId;
  /** `null` clears the field. */
  temperature: string | null;
  topP: string | null;
};

export const SAMPLING_PRESETS: SamplingPreset[] = [
  { id: 'default', temperature: null, topP: null },
  { id: 'precise', temperature: '0', topP: '0.9' },
  { id: 'balanced', temperature: '0.3', topP: '0.95' },
  { id: 'creative', temperature: '1', topP: '0.95' },
];

/** Which preset the current values happen to match; `null` when the reader has typed their own. */
export function matchPreset(draft: BehaviourDraft): SamplingPresetId | null {
  const found = SAMPLING_PRESETS.find(
    (preset) => (preset.temperature ?? '') === draft.temperature.trim() && (preset.topP ?? '') === draft.topP.trim(),
  );
  return found ? found.id : null;
}

export function applyPreset(draft: BehaviourDraft, preset: SamplingPreset): BehaviourDraft {
  return {
    ...draft,
    temperature: preset.temperature ?? '',
    topP: preset.topP ?? '',
  };
}
