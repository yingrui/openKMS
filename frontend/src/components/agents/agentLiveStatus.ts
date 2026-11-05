/**
 * Status helpers for the assistant stream.
 *
 * Kept beside `wikiCopilotStreamParts` (not re-exported from a component file) because
 * `react-refresh/only-export-components` forbids a module from exporting both a component and
 * plain functions.
 */
import type { AssistantStreamPart } from '../wiki/wikiCopilotStreamParts';

/**
 * Whether a tool of the live turn is currently executing.
 *
 * The tool row already shows the name, the command and its spinner, so the status line only
 * needs to know **whether** to stay silent — repeating the command there duplicated the same
 * sentence on screen and made the transcript harder to read.
 */
export function turnHasRunningTool(parts: AssistantStreamPart[] | undefined): boolean {
  return (parts ?? []).some(
    (part) =>
      (part.type === 'tool' || part.type === 'subagent') && part.step.status === 'running',
  );
}
