// Configuration for the openKMS frontend (Vite uses import.meta.env, not process.env)
export const config = {
  apiUrl: import.meta.env.VITE_API_URL || 'http://localhost:8102',
  /** Base URL for direct object storage (S3/MinIO). Bucket must allow public read. No trailing slash. */
  storageBaseUrl: import.meta.env.VITE_STORAGE_BASE_URL || '',
  keycloak: {
    url: import.meta.env.VITE_KEYCLOAK_URL || 'http://localhost:8081',
    realm: import.meta.env.VITE_KEYCLOAK_REALM || 'openkms',
    clientId: import.meta.env.VITE_KEYCLOAK_CLIENT_ID || 'openkms-frontend',
  },
};
