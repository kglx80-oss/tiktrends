import { describe, it, expect, vi, afterEach } from 'vitest';
import { BORNE_PAGES_META, lireLectureIncomplete } from '@tiktrends/core';
import { metaDailySync, metaAdsetsSync } from '../src/meta-daily';

/**
 * `graphAll` suit la pagination Meta JUSQU'AU BOUT, ou échoue en le disant ·
 * jamais un jeu tronqué rendu comme complet.
 *
 * Le défaut · 25 pages au plus, puis retour silencieux de ce qui avait été lu ;
 * et arrêt muet sur une page qui annonçait une suite sans curseur. Le faux
 * `fetch` ci-dessous pagine comme l'API Graph (`paging.next` + `cursors.after`),
 * sans réseau. On compte ce qui SORT · les lignes rendues, le message d'erreur.
 */

const JETON = 'jeton-secret-ne-doit-pas-sortir';
const appels: string[] = [];

/** Une page d'insights · une ligne par page, l'annonce `a-<n>` le jour J. */
const ligne = (n: number) => ({ ad_id: `a-${n}`, ad_name: `Ad ${n}`, date_start: '2026-11-01', spend: '1' });

/** Pagine `pages` pages (`Infinity` · sans fin) ; `sansCurseurA` · la page n annonce une suite sans curseur. */
function fauxMeta(pages: number, o: { sansCurseurA?: number } = {}) {
  appels.length = 0;
  vi.stubGlobal('fetch', async (url: string) => {
    appels.push(url);
    const u = new URL(url);
    const n = Number(u.searchParams.get('after')?.replace('c', '') ?? '0');
    const suite = n + 1 < pages;
    const paging = suite
      ? { next: `https://graph.facebook.com/next?access_token=${JETON}`, cursors: o.sansCurseurA === n + 1 ? {} : { after: `c${n + 1}` } }
      : { cursors: { after: `c${n + 1}` } };
    return new Response(JSON.stringify({ data: [ligne(n)], paging }), { status: 200 });
  });
}
const lire = () => metaDailySync('act_1', JETON, { since: new Date('2026-07-20'), until: new Date('2026-11-17') });

afterEach(() => vi.unstubAllGlobals());

describe('pagination Meta · complète ou en échec dit, jamais tronquée en silence', () => {
  it('la borne est celle dérivée dans le noyau · ⌈5 000 annonces × 121 jours / 500⌉', () => {
    expect(BORNE_PAGES_META).toBe(1210);
  });

  it('30 pages (au-delà des 25 d’avant) · les 30 lignes sont rendues, une requête par page', async () => {
    fauxMeta(30);
    const rows = await lire();
    expect(rows.length, 'la lecture s’est arrêtée avant la dernière page · des journées Meta manquent sans que rien ne le dise').toBe(30);
    expect(rows.map((r) => r.adId).at(-1)).toBe('a-29');
    expect(appels.length).toBe(30);
  });

  it('exactement la borne, dernière page sans suite · tout est rendu, aucune erreur', async () => {
    fauxMeta(BORNE_PAGES_META);
    expect((await lire()).length).toBe(BORNE_PAGES_META);
  });

  it('une suite annoncée au-delà de la borne · ÉCHEC avec sa raison, aucune requête de plus, jeton absent du message', async () => {
    fauxMeta(Infinity);
    const err = await lire().then(() => null, (e: Error) => e);
    expect(err, 'la pagination a été tronquée à la borne et rendue comme complète · elle doit échouer en disant pourquoi').not.toBeNull();
    expect(lireLectureIncomplete(err!.message), 'l’échec ne dit pas « lecture incomplète · borne »').toEqual({ raison: 'borne', pages: BORNE_PAGES_META });
    expect(err!.message).not.toContain(JETON);
    expect(appels.length, 'la lecture a dépassé la borne de pages').toBe(BORNE_PAGES_META);
  });

  it('une page annonce une suite SANS curseur · échec « curseur absent », pas un arrêt muet', async () => {
    fauxMeta(10, { sansCurseurA: 4 });
    const err = await lire().then(() => null, (e: Error) => e);
    expect(err, 'une suite sans curseur a été ignorée · la lecture s’est arrêtée sans le dire').not.toBeNull();
    expect(lireLectureIncomplete(err!.message)).toEqual({ raison: 'curseur_absent', pages: 4 });
  });

  it('les ensembles passent sous la même règle · 30 pages lues en entier', async () => {
    appels.length = 0;
    vi.stubGlobal('fetch', async (url: string) => {
      appels.push(url);
      const n = Number(new URL(url).searchParams.get('after')?.replace('c', '') ?? '0');
      const paging = n + 1 < 30 ? { next: 'x', cursors: { after: `c${n + 1}` } } : {};
      return new Response(JSON.stringify({ data: [{ id: `s-${n}`, name: `Ensemble ${n}` }], paging }), { status: 200 });
    });
    expect((await metaAdsetsSync('act_1', JETON)).length, 'des ensembles manquent · la lecture des ensembles est tronquée').toBe(30);
  });
});
