import { injectStyles } from '@a2ui/react/styles';

/** Once per app: A2UI structural + component utility classes (`.a2ui-surface`, layout-*, …). */
let injected = false;

export function ensureA2uiPlatformStyles(): void {
  if (injected || typeof document === 'undefined') return;
  injectStyles();
  injected = true;
}
