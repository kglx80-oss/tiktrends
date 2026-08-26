import { NextResponse } from 'next/server';
import { buildGoogleAuthUrl, googleConfigured } from '@tiktrends/integrations';
import { getSession } from '../../../../lib/auth';
import { getActiveBrand } from '../../../../lib/brands';
import { signState } from '../../../../lib/oauth-state';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Démarre l'OAuth Google Drive pour la MARQUE active (connexion Drive par marque). */
export async function GET() {
  const appUrl = process.env.APP_URL || '';
  if (!googleConfigured()) return NextResponse.redirect(appUrl + '/assets?e=drive_config');
  const s = await getSession();
  if (!s) return NextResponse.redirect(appUrl + '/login');
  const brand = await getActiveBrand(s.workspaceId);
  if (!brand) return NextResponse.redirect(appUrl + '/assets?e=drive_nobrand');
  return NextResponse.redirect(buildGoogleAuthUrl(signState({ ws: s.workspaceId, brand: brand.id })));
}
