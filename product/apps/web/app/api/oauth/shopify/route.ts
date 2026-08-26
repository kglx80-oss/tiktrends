import { NextResponse, type NextRequest } from 'next/server';
import { getSession } from '../../../../lib/auth';
import { getActiveBrand } from '../../../../lib/brands';
import { signState } from '../../../../lib/oauth-state';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Démarre l'OAuth Shopify pour la marque active. ?shop=ta-boutique.myshopify.com */
export async function GET(req: NextRequest) {
  const appUrl = process.env.APP_URL;
  const apiKey = process.env.SHOPIFY_API_KEY;
  if (!apiKey || !appUrl) return NextResponse.redirect((appUrl || '') + '/connections?e=shopify_config');

  const s = await getSession();
  if (!s) return NextResponse.redirect(appUrl + '/login');
  const brand = await getActiveBrand(s.workspaceId);
  if (!brand) return NextResponse.redirect(appUrl + '/connections?e=nobrand');

  const shop = (new URL(req.url).searchParams.get('shop') || '').trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  if (!/\.myshopify\.com$/.test(shop)) return NextResponse.redirect(appUrl + '/connections?e=shopify_shop');

  const state = signState({ brandId: brand.id, ws: s.workspaceId, shop });
  const q = new URLSearchParams({
    client_id: apiKey,
    scope: 'read_orders,read_products',
    redirect_uri: appUrl + '/api/oauth/shopify/callback',
    state,
  });
  return NextResponse.redirect(`https://${shop}/admin/oauth/authorize?${q.toString()}`);
}
