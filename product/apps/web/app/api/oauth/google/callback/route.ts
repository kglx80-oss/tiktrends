import { NextResponse, type NextRequest } from 'next/server';
import { db, schema, eq, and } from '@tiktrends/db';
import { googleExchangeCode, encryptSecret } from '@tiktrends/integrations';
import { getSession } from '../../../../../lib/auth';
import { verifyState } from '../../../../../lib/oauth-state';
import { peutBrancherConnecteur, RETOUR_CONNEXION_REFUSEE } from '../../../../../lib/connexions-acces';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Callback OAuth Google : stocke le refresh token (chiffré) sur l'espace. */
export async function GET(req: NextRequest) {
  const appUrl = process.env.APP_URL || '';
  const back = (q: string) => NextResponse.redirect(`${appUrl}/assets${q}`);
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const st = verifyState<{ ws: string; brand: string }>(url.searchParams.get('state'));
  if (!code || !st || !st.brand) return back('?e=drive_state');
  const s = await getSession();
  if (!s || s.workspaceId !== st.ws || !db) return back('?e=drive_session');
  // Avant l'échange du code · un non-administrateur n'écrit aucun jeton.
  if (!peutBrancherConnecteur(s.role)) return NextResponse.redirect(appUrl + RETOUR_CONNEXION_REFUSEE);

  try {
    const { refreshToken } = await googleExchangeCode(code);
    if (!refreshToken) return back('?e=drive_norefresh');
    await db.update(schema.brands).set({ driveRefreshToken: encryptSecret(refreshToken) }).where(and(eq(schema.brands.id, st.brand), eq(schema.brands.workspaceId, st.ws)));
    return back('?ok=drive');
  } catch {
    return back('?e=drive_exchange');
  }
}
