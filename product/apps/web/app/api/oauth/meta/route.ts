import { NextResponse } from 'next/server';
import { buildMetaAuthUrl } from '@tiktrends/integrations';
import { getSession } from '../../../../lib/auth';
import { getActiveBrand } from '../../../../lib/brands';
import { signState } from '../../../../lib/oauth-state';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Démarre l'OAuth Meta pour la marque active (connexion en un clic). */
export async function GET() {
  const appId = process.env.META_APP_ID;
  const appUrl = process.env.APP_URL;
  if (!appId || !appUrl) return NextResponse.redirect((appUrl || '') + '/connections?e=meta_config');

  const s = await getSession();
  if (!s) return NextResponse.redirect(appUrl + '/login');
  const brand = await getActiveBrand(s.workspaceId);
  if (!brand) return NextResponse.redirect(appUrl + '/connections?e=nobrand');

  const url = buildMetaAuthUrl({
    appId,
    redirectUri: appUrl + '/api/oauth/meta/callback',
    state: signState({ brandId: brand.id, ws: s.workspaceId }),
    scopes: ['ads_read', 'business_management'],
  });
  return NextResponse.redirect(url);
}
