import { NextResponse } from 'next/server';
import { buildMetaAuthUrl } from '@tiktrends/integrations';

export const runtime = 'nodejs';

export function GET() {
  const url = buildMetaAuthUrl({
    appId: process.env.META_APP_ID ?? 'APP_ID',
    redirectUri: (process.env.APP_URL ?? 'http://localhost:3000') + '/api/oauth/meta/callback',
    state: crypto.randomUUID(),
    scopes: ['ads_read'],
  });
  return NextResponse.redirect(url);
}
