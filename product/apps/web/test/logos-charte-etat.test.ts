import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Au rendu de la fiche Identité · la vérification des logos à empreinte est
 * BORNÉE · on lit ce qui part au stockage (combien de `HEAD`, combien à la
 * fois) et l'état rendu, jamais la présence d'un appel :
 *  - parallèle borné · jamais plus de `PARALLELE` requêtes en vol ;
 *  - délai court · un stockage qui ne répond pas rend « indisponible » ;
 *  - budget · une requête qui ne peut plus partir n'est pas lancée.
 *
 * Horloge SIMULÉE · ces cas comptent des requêtes et des instants au regard de
 * délais de 60 à 150 ms. Sur l'horloge réelle, une charge de 21 a fait glisser
 * l'abandon du premier `HEAD` au-delà du budget (« expected 1 to be 2 ») ·
 * reproduit en gelant la boucle d'événements 70 ms. Les faux minuteurs de
 * vitest simulent `Date` (le budget de `etatLogosCharte`) et `setTimeout`, PAS
 * `AbortSignal.timeout` (minuteur interne de Node, le délai du `HEAD` dans
 * `verifierEmpreinteObjetEspace`) · on le recâble ici sur le `setTimeout`
 * simulé, même raison d'abandon (`TimeoutError`). Le code de production est
 * inchangé. Chaque cas AVANCE l'horloge et constate l'état à l'instant voulu ·
 * un minuteur qui échapperait à la simulation laisserait la promesse en
 * suspens et le cas échouerait, il ne passerait pas par hasard.
 */
const CFG = vi.hoisted(() => ({ cfg: { endpoint: 's3.test', region: 'gra', bucket: 'bucket', accessKeyId: 'cle', secretAccessKey: 'secret', publicBaseUrl: 'https://cdn.exemple.test/bucket' } as null | Record<string, string> }));
vi.mock('@tiktrends/integrations', async (importOriginal) => ({ ...(await importOriginal<typeof import('@tiktrends/integrations')>()), storageFromEnv: () => CFG.cfg }));

import { RAISONS_LOGO_CHARTE } from '@tiktrends/core';
import { etatLogosCharte } from '../lib/logos-charte-etat';

const WS = '11111111-1111-4111-8111-111111111111';
const MD5 = 'd41d8cd98f00b204e9800998ecf8427e';
const url = (i: number) => `https://cdn.exemple.test/bucket/assets/${WS}/${i}-ab-logo.png`;
const marque = (n: number) => {
  const logos = Array.from({ length: n }, (_, i) => url(i));
  return { workspaceId: WS, logoUrl: logos[0]!, logos, logoEmpreintes: Object.fromEntries(logos.map((u) => [u, MD5])) };
};
const indisponible = { etat: 'indisponible', raison: RAISONS_LOGO_CHARTE.illisible };

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
  vi.spyOn(AbortSignal, 'timeout').mockImplementation((ms: number) => {
    const c = new AbortController();
    setTimeout(() => c.abort(new DOMException('The operation was aborted due to timeout', 'TimeoutError')), ms);
    return c.signal;
  });
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

/** La promesse et son état · `fini` se lit à un instant SIMULÉ donné. */
const suivre = <T,>(p: Promise<T>) => { const s = { fini: false, p }; void p.then(() => { s.fini = true; }, () => { s.fini = true; }); return s; };
const sansReponse = (init: RequestInit) => new Promise<Response>((_r, rejeter) => init.signal?.addEventListener('abort', () => rejeter(new Error('abort'))));

describe('etatLogosCharte · vérification bornée au rendu', () => {
  it('parallèle borné · 10 logos, jamais plus de 4 HEAD en vol, chacun une fois ; tous confirmés · aucun état', async () => {
    let enVol = 0; let max = 0; const heads: string[] = [];
    vi.stubGlobal('fetch', async (u: string, init: RequestInit) => {
      heads.push(`${init.method} ${new URL(u).pathname}`);
      enVol++; max = Math.max(max, enVol);
      await new Promise((r) => setTimeout(r, 15));
      enVol--;
      return new Response(null, { status: 200, headers: { etag: `"${MD5}"` } });
    });
    const s = suivre(etatLogosCharte(marque(10)));
    // 10 logos, 4 à la fois, 15 ms chacun · trois vagues, rendu à 45 ms simulées.
    await vi.advanceTimersByTimeAsync(44);
    expect(s.fini).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(s.fini).toBe(true);
    const b = await s.p;
    expect(b).toEqual({ etats: {}, defaut: null });
    expect(heads).toHaveLength(10);
    expect(heads.every((h) => h.startsWith('HEAD '))).toBe(true);
    expect(max).toBe(4);
  });

  it('délai court · un stockage qui ne répond pas rend « indisponible » dans le délai, jamais « à réimporter »', async () => {
    vi.stubGlobal('fetch', (_u: string, init: RequestInit) => sansReponse(init));
    const s = suivre(etatLogosCharte(marque(2), { PARALLELE: 4, DELAI_MS: 60, BUDGET_MS: 5_000 }));
    // Rien ne tombe avant le délai, tout est rendu À 60 ms simulées · jamais au budget de 5 s.
    await vi.advanceTimersByTimeAsync(59);
    expect(s.fini).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(s.fini).toBe(true);
    const b = await s.p;
    expect(b.defaut).toEqual(indisponible);
    expect(Object.values(b.etats)).toEqual([indisponible, indisponible]);
  });

  it('budget · une fois épuisé, aucune requête de plus ne part ; les logos non vérifiés sont « indisponibles »', async () => {
    let n = 0;
    vi.stubGlobal('fetch', (_u: string, init: RequestInit) => { n++; return sansReponse(init); });
    const s = suivre(etatLogosCharte(marque(6), { PARALLELE: 1, DELAI_MS: 100, BUDGET_MS: 150 }));
    // Un seul HEAD en vol · le premier abandonne à 100 ms, le second part avec le reste du
    // budget (50 ms) et abandonne à 150 ms · le budget est épuisé, plus rien ne part.
    expect(n).toBe(1);
    await vi.advanceTimersByTimeAsync(100);
    expect(n).toBe(2);
    await vi.advanceTimersByTimeAsync(49);
    expect(s.fini).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(n).toBe(2);
    expect(s.fini).toBe(true);
    const b = await s.p;
    expect(Object.keys(b.etats)).toHaveLength(6);
    expect(Object.values(b.etats).every((e) => e.etat === 'indisponible')).toBe(true);
  });

  it('stockage non configuré · aucune requête, les logos à empreinte sont « indisponibles »', async () => {
    const garde = CFG.cfg; CFG.cfg = null;
    const f = vi.fn(); vi.stubGlobal('fetch', f);
    try {
      expect((await etatLogosCharte(marque(1))).defaut).toEqual(indisponible);
      expect(f).not.toHaveBeenCalled();
    } finally { CFG.cfg = garde; }
  });
});
