/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APP_VERSION?: string;
  readonly VITE_API_URL?: string;
  readonly VITE_AUTH_MODE?: string;
  readonly VITE_OIDC_ISSUER?: string;
  readonly VITE_OIDC_AUTH_SERVER_BASE_URL?: string;
  readonly VITE_OIDC_REALM?: string;
  readonly VITE_OIDC_CLIENT_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
