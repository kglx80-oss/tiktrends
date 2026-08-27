import { NextResponse, type NextRequest } from 'next/server';
import { db, schema, eq, and } from '@tiktrends/db';
import { encryptSecret } from '@tiktrends/integrations';
import { getSession } from '../../../../../lib/auth';
import { verifyState } from '../../../../../lib/oauth-state';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const GRAPH = 'https://graph.facebook.com/v21.0';

/**
 * Callback OAuth Meta : échange le code contre un token longue durée, puis récupère
 * TOUS les comptes publicitaires accessibles (une agence en a souvent plusieurs).
 * On ne présélectionne que s'il n'y en a qu'un ; sinon l'utilisateur choisit dans la liste.
 */
export async function GET(req: NextRequest) {
  const appUrl = process.env.APP_URL || '';
  const appId = process.env.META_APP_ID, appSecret = process.env.META_APP_SECRET;
  const back = (q: string) => NextResponse.redirect(`${appUrl}/connections${q}`);
  if (!appId || !appSecret) return back('?e=meta_config');

  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const st = verifyState<{ brandId: string; ws: string }>(url.searchParams.get('state'));
  if (!code || !st) return back('?e=meta_state');

  const s = await getSession();
  if (!s || s.workspaceId !== st.ws || !db) return back('?e=meta_session');

  try {
    const redirectUri = appUrl + '/api/oauth/meta/callback';
    // 1) code -> token court
    const t1 = await fetch(`${GRAPH}/oauth/access_token?client_id=${appId}&client_secret=${appSecret}&redirect_uri=${encodeURIComponent(redirectUri)}&code=${encodeURIComponent(code)}`).then((r) => r.json()) as { access_token?: string; error?: { message: string } };
    if (!t1.access_token) return back('?e=meta_token');
    // 2) token court -> token longue durée
    const t2 = await fetch(`${GRAPH}/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${t1.access_token}`).then((r) => r.json()) as { access_token?: string };
    const token = t2.access_token || t1.access_token;
    // 3) tous les comptes publicitaires accessibles (pour laisser le choix)
    const acc = await fetch(`${GRAPH}/me/adaccounts?fields=account_id,name,currency,account_status&limit=200&access_token=${token}`)
      .then((r) => r.json()) as { data?: Array<{ account_id: string; name?: string; currency?: string; account_status?: number }> };
    const list = (acc.data || [])
      .filter((a) => a.account_id)
      .map((a) => ({ id: `act_${a.account_id}`, name: a.name || `act_${a.account_id}`, currency: a.currency }));

    // Un seul compte : on le sélectionne d'office. Plusieurs : l'utilisateur choisit.
    const only = list.length === 1 ? list[0]!.id : null;
    await db.update(schema.brands).set({
      metaToken: encryptSecret(token),
      metaAdAccounts: list,
      ...(only ? { metaAdAccountId: only } : {}),
    }).where(and(eq(schema.brands.id, st.brandId), eq(schema.brands.workspaceId, st.ws)));

    if (!list.length) return back('?ok=meta_noacct');
    return back(only ? '?ok=meta' : '?ok=meta_pick');
  } catch {
    return back('?e=meta_exchange');
  }
}
