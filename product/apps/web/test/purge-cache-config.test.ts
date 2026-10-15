import { describe, it, expect } from 'vitest';
import { matchHas } from 'next/dist/shared/lib/router/utils/prepare-destination';
import { purgeCacheAFaire, regleEnTetesPurgeCache } from '@tiktrends/core';
import nextConfig from '../next.config.mjs';

/**
 * I1 · la purge du cache est réellement CÂBLÉE dans Next.
 *
 * `next.config.mjs` porte la règle en littéraux (Node le lit sans TypeScript).
 * On l'évalue avec le moteur de conditions de Next lui-même (`matchHas`, celui
 * qui décide à l'exécution si une règle `headers()` s'applique) sur des
 * requêtes réelles, et on compare à la règle pure du noyau. Une condition
 * oubliée, une valeur non ancrée, un cookie mal nommé : le test tombe.
 */

type Regle = { source: string; has?: unknown[]; missing?: unknown[]; headers: Array<{ key: string; value: string }> };

async function regles(): Promise<Regle[]> {
  const h = (nextConfig as { headers?: () => Promise<Regle[]> }).headers;
  expect(h, 'next.config.mjs n’a pas de headers()').toBeTypeOf('function');
  return h!();
}

/** Les en-têtes que Next poserait sur cette requête. */
async function entetesPoses(cookies: Record<string, string>, accepte: string | null): Promise<Record<string, string>> {
  const headers: Record<string, string> = {};
  const cookie = Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; ');
  if (cookie) headers.cookie = cookie;
  if (accepte) headers.accept = accepte;
  const req = { headers } as unknown as Parameters<typeof matchHas>[0];
  const out: Record<string, string> = {};
  for (const r of await regles()) {
    expect(r.source).toBe('/:path*');
    if (matchHas(req, {}, r.has as never, r.missing as never)) for (const e of r.headers) out[e.key] = e.value;
  }
  return out;
}

const HTML = 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8';

describe('next.config.mjs · purge du cache une fois par navigateur', () => {
  it('la règle de next.config est celle du noyau, mot pour mot', async () => {
    expect(await regles()).toContainEqual(regleEnTetesPurgeCache());
  });

  const CAS: Array<[string, Record<string, string>, string | null]> = [
    ['session, page HTML, sans cookie de version', { tt_session: 'jeton' }, HTML],
    ['session, page HTML, ancienne version', { tt_session: 'jeton', tt_cache_v: '1' }, HTML],
    ['session, page HTML, version « 22 »', { tt_session: 'jeton', tt_cache_v: '22' }, HTML],
    ['session, page HTML, version courante', { tt_session: 'jeton', tt_cache_v: '2' }, HTML],
    ['sans session', {}, HTML],
    ['session, image', { tt_session: 'jeton' }, 'image/avif,image/webp,*/*'],
    ['session, sans Accept', { tt_session: 'jeton' }, null],
  ];
  for (const [nom, cookies, accepte] of CAS) {
    it(nom, async () => {
      const poses = await entetesPoses(cookies, accepte);
      const attendu = purgeCacheAFaire({ session: !!cookies.tt_session, accepte, cookieVersion: cookies.tt_cache_v ?? null });
      if (attendu) {
        expect(poses['Clear-Site-Data'], `${nom} · purge attendue`).toBe('"cache"');
        expect(poses['Set-Cookie'], nom).toBe('tt_cache_v=2; Max-Age=31536000; Path=/; SameSite=Lax');
      } else {
        expect(poses['Clear-Site-Data'], `${nom} · aucune purge attendue`).toBeUndefined();
        expect(poses['Set-Cookie'], nom).toBeUndefined();
      }
    });
  }
});
