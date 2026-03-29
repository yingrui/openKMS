import { UserManager } from 'oidc-client-ts';
import { config } from '../config';

let instance: UserManager | null = null;

export function getUserManager(): UserManager {
  if (!instance) {
    instance = new UserManager({
      authority: config.oidc.authority,
      client_id: config.oidc.clientId,
      redirect_uri: `${config.origin}/auth/callback`,
      silent_redirect_uri: `${config.origin}/auth/silent-renew`,
      post_logout_redirect_uri: config.origin,
      response_type: 'code',
      scope: 'openid profile email',
      automaticSilentRenew: true,
    });
  }
  return instance;
}
