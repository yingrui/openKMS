/** Dispatched on the window after server system settings are saved (Console). Sidebar refetches public name. */
export const SYSTEM_SETTINGS_UPDATED_EVENT = 'openkms:system-settings-updated';

export function notifySystemSettingsUpdated(): void {
  window.dispatchEvent(new CustomEvent(SYSTEM_SETTINGS_UPDATED_EVENT));
}
