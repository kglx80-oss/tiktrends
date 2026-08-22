/** Constructeurs d'URL OAuth (purs, testables). CDC §F2. */
const TIKTOK_AUTH = 'https://business-api.tiktok.com/portal/auth';
const META_AUTH = 'https://www.facebook.com/v20.0/dialog/oauth';

export interface OAuthParams { appId: string; redirectUri: string; state: string; scopes?: string[]; }

export function buildTikTokAuthUrl(p: OAuthParams): string {
  const q = new URLSearchParams({ app_id: p.appId, redirect_uri: p.redirectUri, state: p.state, rid: 'tiktrends' });
  return `${TIKTOK_AUTH}?${q.toString()}`;
}

export function buildMetaAuthUrl(p: OAuthParams): string {
  const q = new URLSearchParams({
    client_id: p.appId,
    redirect_uri: p.redirectUri,
    state: p.state,
    response_type: 'code',
    scope: (p.scopes ?? ['ads_read']).join(','),
  });
  return `${META_AUTH}?${q.toString()}`;
}

/** Échange code -> token (implémentation réelle au Sprint 1, ici l'interface). */
export interface TokenExchange { (code: string): Promise<{ accessToken: string; expiresIn: number }>; }
