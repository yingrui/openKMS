import { useTranslation } from 'react-i18next';
import type { ToolParameter, ToolParameterSchema } from '../../data/workforceToolsApi';
import './toolParams.scss';

/**
 * The function-call schema of one tool: argument names, types, which are required.
 *
 * This is what an agent engineer checks before writing an instruction — "does it take a path or a model id, is the limit
 * optional" — and it is the same JSON schema the model receives, rendered rather than paraphrased.
 */
export function ToolParameters({ parameters }: { parameters: ToolParameterSchema }) {
  const { t } = useTranslation('workforce');
  const entries = Object.entries(parameters.properties ?? {});

  if (entries.length === 0) {
    return <p className="ds-field__hint">{t('toolsNoParameters')}</p>;
  }

  const required = new Set(parameters.required ?? []);

  return (
    <table className="ds-table workforce-tool-params">
      <thead>
        <tr>
          <th>{t('toolsParamName')}</th>
          <th>{t('toolsParamType')}</th>
          <th>{t('toolsParamRequired')}</th>
          <th>{t('toolsParamDescription')}</th>
        </tr>
      </thead>
      <tbody>
        {entries.map(([name, schema]) => (
          <tr key={name}>
            <td>
              <code>{name}</code>
            </td>
            <td>
              <code>{describeType(schema)}</code>
            </td>
            <td>{required.has(name) ? t('toolsParamYes') : '—'}</td>
            <td>{schema.description ?? '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** `string` / `integer` / `string | null`, with a default appended when the schema carries one. */
function describeType(schema: ToolParameter): string {
  const types = schema.anyOf?.length
    ? schema.anyOf.map((part) => part.type ?? 'any')
    : [schema.type ?? 'any'];
  const base = types.join(' | ');
  if (schema.default === undefined || schema.default === null) return base;
  return `${base} · ${JSON.stringify(schema.default)}`;
}
