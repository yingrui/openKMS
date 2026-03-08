/** Central API client. Injects auth token from provider (set by AuthProvider). */

let tokenProvider: (() => Promise<string | undefined>) | null = null;

export function setAuthTokenProvider(provider: () => Promise<string | undefined>): void {
  tokenProvider = provider;
}

export async function getAuthHeaders(): Promise<Record<string, string>> {
  const token = tokenProvider ? await tokenProvider() : undefined;
  if (token) {
    return { Authorization: `Bearer ${token}` };
  }
  return {};
}
