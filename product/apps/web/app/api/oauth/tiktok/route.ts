import { NextResponse } from 'next/server';
import { buildTikTokAuthUrl } from '@tiktrends/integrations';

export const runtime = 'nodejs';

export function GET() {
  const url = buildTikTokAuthUrl({
    appId: process.env.TIKTOK_APP_ID ?? 'APP_ID',
    redirectUri: (process.env.APP_URL ?? 'http://localhost:3000') + '/api/oauth/tiktok/callback',
    state: crypto.randomUUID(),
  });
  return NextResponse.redirect(url);
}
