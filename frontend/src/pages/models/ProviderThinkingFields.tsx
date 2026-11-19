import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FormField } from '../../styles/design-system';
import type { ProviderThinking } from '../../data/providersApi';

/**
 * What to send when asking a provider to think, or not to.
 *
 * Two free-form JSON fragments, not a list of vendors. The differences are not enumerable — DeepSeek takes
 * `{"thinking": {"type": "disabled"}}`, DashScope `{"enable_thinking": false}`, OpenAI has no toggle at all
 * (`reasoning_effort: none`), Anthropic has a token budget instead of a boolean — so the provider stores what to
 * send and the runtime only merges the fragment for the chosen option. A vendor with no way to switch thinking off
 * simply leaves "off" empty, and nothing is sent.
 *
 * There is no vendor menu on purpose. A list of vendors would be the same hard-coded enumeration this moved out of
 * the backend, would need editing whenever a vendor changes its spelling, and would look like a stored setting while
 * holding no state. The shapes we have seen sit in the label's hover tip instead, marked by whether they were measured
 * against a real endpoint or copied from documentation.
 */
function toText(fragment: Record<string, unknown> | undefined): string {
  return fragment ? JSON.stringify(fragment) : '';
}

/** `''` means "nothing to send"; invalid JSON is reported rather than silently dropped. */
function parseFragment(text: string): { value: Record<string, unknown> | undefined; error: boolean } {
  const trimmed = text.trim();
  if (!trimmed) return { value: undefined, error: false };
  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return { value: parsed as Record<string, unknown>, error: false };
    }
    return { value: undefined, error: true };
  } catch {
    return { value: undefined, error: true };
  }
}

function FragmentField({
  label,
  hint,
  help,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  help: string;
  value: string;
  onChange: (next: string) => void;
}) {
  const { t } = useTranslation('workspace');

  return (
    <FormField
      label={
        <span className="models-field-label">
          {label}
          {/* A hover tip, not a control: it holds no state, so it cannot look like a setting that is on.
              The text is multi-line — one vendor per line, measured before documented — and browsers render the
              newlines in a `title`, wrapping only when the line is wider than the tooltip. */}
          <span
            className="models-field-label__help"
            title={help}
            aria-label={t('models.provThinkingHelpLabel')}
            tabIndex={0}
          >
            ?
          </span>
        </span>
      }
      hint={hint}
    >
      <textarea
        className="ds-control"
        rows={2}
        value={value}
        placeholder={'{"thinking": {"type": "enabled"}}'}
        onChange={(e) => onChange(e.target.value)}
      />
    </FormField>
  );
}

export function ProviderThinkingFields({
  value,
  onChange,
}: {
  value: ProviderThinking | null | undefined;
  onChange: (next: ProviderThinking | null) => void;
}) {
  const { t } = useTranslation('workspace');
  const [onText, setOnText] = useState(() => toText(value?.on));
  const [offText, setOffText] = useState(() => toText(value?.off));

  const on = useMemo(() => parseFragment(onText), [onText]);
  const off = useMemo(() => parseFragment(offText), [offText]);
  const invalid = on.error || off.error;

  const emit = (nextOn: string, nextOff: string) => {
    const parsedOn = parseFragment(nextOn);
    const parsedOff = parseFragment(nextOff);
    if (parsedOn.error || parsedOff.error) return;
    const next: ProviderThinking = {};
    if (parsedOn.value) next.on = parsedOn.value;
    if (parsedOff.value) next.off = parsedOff.value;
    onChange(Object.keys(next).length > 0 ? next : null);
  };

  return (
    <>
      <FragmentField
        label={t('models.provThinkingOn')}
        hint={t('models.provThinkingOnHint')}
        help={t('models.provThinkingOnHelp')}
        value={onText}
        onChange={(next) => {
          setOnText(next);
          emit(next, offText);
        }}
      />
      <FragmentField
        label={t('models.provThinkingOff')}
        hint={t('models.provThinkingOffHint')}
        help={t('models.provThinkingOffHelp')}
        value={offText}
        onChange={(next) => {
          setOffText(next);
          emit(onText, next);
        }}
      />
      {invalid ? (
        <p className="ds-field__hint page-subtitle--error">{t('models.provThinkingInvalid')}</p>
      ) : (
        <p className="ds-field__hint">
          {t('models.provThinkingPreview')}{' '}
          <code>{JSON.stringify({ on: on.value ?? null, off: off.value ?? null })}</code>
        </p>
      )}
    </>
  );
}
