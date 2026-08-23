import { appBuilderCatalog } from './catalog';

type ZodIssue = { path: (string | number)[]; message: string };

function formatZodIssues(issues: ZodIssue[]): string {
  return issues.map((i) => `${i.path.join('.') || 'root'}: ${i.message}`).join('; ');
}

/** Pre-validate Source before MessageProcessor (avoids Zod v4 `.error.errors` crash in @a2ui/web_core). */
export function validateAppA2uiMessages(messages: Record<string, unknown>[]): void {
  for (const msg of messages) {
    const upd = msg.updateComponents as { components?: Record<string, unknown>[] } | undefined;
    if (!upd?.components) continue;
    for (const comp of upd.components) {
      const componentType = String(comp.component || '');
      const api = appBuilderCatalog.components.get(componentType) as
        | { schema?: { safeParse: (v: unknown) => { success: boolean; error?: { issues?: ZodIssue[] } } } }
        | undefined;
      if (!api?.schema) continue;
      const { id, component: _name, ...properties } = comp;
      const result = api.schema.safeParse(properties);
      if (!result.success) {
        const issues = (result.error as { issues?: ZodIssue[] }).issues || [];
        throw new Error(
          `Invalid A2UI component ${componentType} (${String(id)}): ${formatZodIssues(issues)}`,
        );
      }
    }
  }
}
