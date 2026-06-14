/** Short build id (6-char git hash in prod/docker; `dev` when unknown). Set at build via VITE_APP_VERSION. */
export const appVersion = (import.meta.env.VITE_APP_VERSION ?? '').trim().slice(0, 6) || 'dev';
