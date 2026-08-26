import { NextResponse, type NextRequest } from 'next/server';
import { db, schema, eq } from '@tiktrends/db';
import { googleExchangeCode, encryptSecret } from '@tiktrends/integrations';
import { getSession } from '../../../../../lib/auth';
import { verifyState } from '../../../../../lib/oauth-state';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Callback OAuth Google : stocke le refresh token (chiffré) sur l'espace. */
export async function GET(req: NextRequest) {
  const appUrl = process.env.APP_URL || '';
  const back = (q: string) => NextResponse.redirect(`${appUrl}/assets${q}`);
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const st = verifyState<{ ws: string }>(url.searchParams.get('state'));
  if (!code || !st) return back('?e=drive_state');
  const s = await getSession();
  if (!s || s.workspaceId !== st.ws || !db) return back('?e=drive_session');

  try {
    const { refreshToken } = await googleExchangeCode(code);
    if (!refreshToken) return back('?e=drive_norefresh');
    await db.update(schema.workspaces).set({ driveRefreshToken: encryptSecret(refreshToken) }).where(eq(schema.workspaces.id, st.ws));
    return back('?ok=drive');
  } catch {
    return back('?e=drive_exchange');
  }
}
