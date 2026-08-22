import { describe, it, expect } from 'vitest';
import { buildTikTokAuthUrl, buildMetaAuthUrl } from '../src/oauth';

describe('OAuth URLs', () => {
  it('TikTok inclut app_id, redirect_uri, state', () => {
    const u = new URL(buildTikTokAuthUrl({ appId: 'AID', redirectUri: 'https://app/x', state: 'st' }));
    expect(u.searchParams.get('app_id')).toBe('AID');
    expect(u.searchParams.get('redirect_uri')).toBe('https://app/x');
    expect(u.searchParams.get('state')).toBe('st');
  });
  it('Meta inclut client_id, scope', () => {
    const u = new URL(buildMetaAuthUrl({ appId: 'MID', redirectUri: 'https://app/y', state: 's2', scopes: ['ads_read'] }));
    expect(u.searchParams.get('client_id')).toBe('MID');
    expect(u.searchParams.get('scope')).toBe('ads_read');
  });
});
