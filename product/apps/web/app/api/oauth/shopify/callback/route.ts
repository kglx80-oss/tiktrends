import { NextResponse, type NextRequest } from 'next/server';
import { createHmac, timingSafeEqual } from 'crypto';
import { db, schema, eq, and } from '@tiktrends/db';
import { encryptSecret } from '@tiktrends/integrations';
import { getSession } from '../../../../../lib/auth';
import { verifyState } from '../../../../../lib/oauth-state';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Callback OAuth Shopify : vérifie le HMAC, échange le code, stocke le token Admin. */
export async function GET(req: NextRequest) {
  const appUrl = process.env.APP_URL || '';
  const apiKey = process.env.SHOPIFY_API_KEY, apiSecret = process.env.SHOPIFY_API_SECRET;
  const back = (q: string) => NextResponse.redirect(`${appUrl}/connections${q}`);
  if (!apiKey || !apiSecret) return back('?e=shopify_config');

  const url = new URL(req.url);
  const params = url.searchParams;
  const code = params.get('code');
  const shop = params.get('shop') || '';
  const st = verifyState<{ brandId: string; ws: string; shop: string }>(params.get('state'));
  if (!code || !st || st.shop !== shop) return back('?e=shopify_state');

  // Vérification HMAC Shopify.
  const hmac = params.get('hmac') || '';
  const message = [...params.entries()].filter(([k]) => k !== 'hmac' && k !== 'signature').sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join('&');
  const digest = createHmac('sha256', apiSecret).update(message).digest('hex');
  try { if (!timingSafeEqual(Buffer.from(digest), Buffer.from(hmac))) return back('?e=shopify_hmac'); } catch { return back('?e=shopify_hmac'); }

  const s = await getSession();
  if (!s || s.workspaceId !== st.ws || !db) return back('?e=shopify_session');

  try {
    const r = await fetch(`https://${shop}/admin/oauth/access_token`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: apiKey, client_secret: apiSecret, code }),
    }).then((x) => x.json()) as { access_token?: string };
    if (!r.access_token) return back('?e=shopify_token');
    await db.update(schema.brands).set({ shopifyDomain: shop, shopifyToken: encryptSecret(r.access_token) })
      .where(and(eq(schema.brands.id, st.brandId), eq(schema.brands.workspaceId, st.ws)));
    return back('?ok=shopify');
  } catch {
    return back('?e=shopify_exchange');
  }
}
