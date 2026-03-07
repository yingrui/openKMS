// Configuration for the openKMS frontend (Vite uses import.meta.env, not process.env)
export const config = {
  keycloak: {
    url: import.meta.env.VITE_KEYCLOAK_URL || 'http://localhost:8081',
    realm: import.meta.env.VITE_KEYCLOAK_REALM || 'openkms',
    clientId: import.meta.env.VITE_KEYCLOAK_CLIENT_ID || 'openkms-frontend',
  },
};
