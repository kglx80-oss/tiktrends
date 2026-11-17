import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { BORNE_PAGES_META, ATTENTES_REPRISE_META_MS, lireLectureIncomplete } from '@tiktrends/core';
import { metaDailySync, metaAdsetsSync, horlogeMeta } from '../src/meta-daily';

/**
 * `graphAll` suit la pagination Meta JUSQU'AU BOUT, ou échoue en le disant ·
 * jamais un jeu tronqué rendu comme complet.
 *
 * Les défauts · 25 pages au plus, puis retour silencieux de ce qui avait été
 * lu ; arrêt muet sur une page qui annonçait une suite sans curseur ; lignes
 * BRUTES gardées jusqu'à la fin (3 869 octets de tas chacune, de quoi faire
 * tomber le serveur web à la borne) ; une seule erreur passagère faisait
 * échouer toute la lecture. Le faux `fetch` ci-dessous pagine comme l'API
 * Graph (`paging.next` + `cursors.after`), sans réseau, et les attentes entre
 * deux essais sont relevées, jamais dormies. On compte ce qui SORT · les
 * lignes rendues, le message d'erreur, les requêtes, les attentes.
 */

const JETON = 'jeton-secret-ne-doit-pas-sortir';
const appels: string[] = [];
const attentes: number[] = [];

/** Une page d'insights · une ligne par page, l'annonce `a-<n>` le jour J. */
const ligne = (n: number) => ({ ad_id: `a-${n}`, ad_name: `Ad ${n}`, date_start: '2026-11-01', spend: '1' });
const pageDe = (u: URL) => Number((u.searchParams.get('after') ?? u.searchParams.get('offset') ?? '0').replace('c', ''));

/** Pagine `pages` pages (`Infinity` · sans fin) ; `sansCurseurA` · la page n annonce une suite sans curseur NI paramètre de suite. */
function fauxMeta(pages: number, o: { sansCurseurA?: number } = {}) {
  vi.stubGlobal('fetch', async (url: string) => {
    appels.push(url);
    const n = pageDe(new URL(url));
    const suite = n + 1 < pages;
    const paging = suite
      ? { next: `https://graph.facebook.com/next?access_token=${JETON}`, cursors: o.sansCurseurA === n + 1 ? {} : { after: `c${n + 1}` } }
      : { cursors: { after: `c${n + 1}` } };
    return new Response(JSON.stringify({ data: [ligne(n)], paging }), { status: 200 });
  });
}
const lire = () => metaDailySync('act_1', JETON, { since: new Date('2026-07-20'), until: new Date('2026-11-17') });
const echecDe = (p: Promise<unknown>) => p.then(() => null, (e: Error) => e);

const attendreOrigine = horlogeMeta.attendre;
beforeEach(() => {
  appels.length = 0; attentes.length = 0;
  horlogeMeta.attendre = async (ms) => { attentes.push(ms); };
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); horlogeMeta.attendre = attendreOrigine; });

describe('pagination Meta · complète ou en échec dit, jamais tronquée en silence', () => {
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
    const err = await echecDe(lire());
    expect(err, 'la pagination a été tronquée à la borne et rendue comme complète · elle doit échouer en disant pourquoi').not.toBeNull();
    expect(lireLectureIncomplete(err!.message), 'l’échec ne dit pas « lecture incomplète · borne »').toEqual({ raison: 'borne', pages: BORNE_PAGES_META });
    expect(err!.message).not.toContain(JETON);
    expect(appels.length, 'la lecture a dépassé la borne de pages').toBe(BORNE_PAGES_META);
  });

  it('une page annonce une suite SANS curseur NI paramètre de suite · échec « curseur absent », pas un arrêt muet', async () => {
    fauxMeta(10, { sansCurseurA: 4 });
    const err = await echecDe(lire());
    expect(err, 'une suite sans curseur a été ignorée · la lecture s’est arrêtée sans le dire').not.toBeNull();
    expect(lireLectureIncomplete(err!.message)).toEqual({ raison: 'curseur_absent', pages: 4 });
  });

  it('les ensembles passent sous la même règle · 30 pages lues en entier', async () => {
    vi.stubGlobal('fetch', async (url: string) => {
      const n = pageDe(new URL(url));
      const paging = n + 1 < 30 ? { next: 'x', cursors: { after: `c${n + 1}` } } : {};
      return new Response(JSON.stringify({ data: [{ id: `s-${n}`, name: `Ensemble ${n}` }], paging }), { status: 200 });
    });
    expect((await metaAdsetsSync('act_1', JETON)).length, 'des ensembles manquent · la lecture des ensembles est tronquée').toBe(30);
  });
});

describe('suite lue dans l’URL `next` quand `cursors.after` manque · jamais l’URL suivie telle quelle', () => {
  it.each([['after', 'c'], ['offset', '']])('page VIDE avec `next` (%s) et sans `cursors` · la lecture continue, avec NOTRE jeton', async (cle, prefixe) => {
    vi.stubGlobal('fetch', async (url: string) => {
      appels.push(url);
      const n = pageDe(new URL(url));
      // Page 1 vide, sans `cursors` · la suite n'est que dans `next`, qui porte un AUTRE jeton.
      if (n === 1) return new Response(JSON.stringify({ data: [], paging: { next: `https://graph.facebook.com/v21.0/act_1/insights?access_token=jeton-de-next&${cle}=${prefixe}2` } }), { status: 200 });
      const paging = n < 3 ? { next: 'x', cursors: { after: `c${n + 1}` } } : {};
      return new Response(JSON.stringify({ data: [ligne(n)], paging }), { status: 200 });
    });
    const rows = await lire();
    expect(rows.map((r) => r.adId), 'la lecture s’est arrêtée sur une page sans `cursors` alors que `next` portait la suite').toEqual(['a-0', 'a-2', 'a-3']);
    const troisieme = new URL(appels[2]!);
    expect(troisieme.searchParams.get(cle)).toBe(`${prefixe}2`);
    expect(troisieme.searchParams.get('access_token'), 'l’URL `next` a été suivie telle quelle · son jeton a remplacé le nôtre').toBe(JETON);
    expect(troisieme.searchParams.get('level')).toBe('ad');
  });
});

describe('chaque page est convertie DÈS réception · aucune ligne brute retenue', () => {
  it('les lignes brutes d’une page, abîmées dès la page suivante servie, ne changent rien au résultat', async () => {
    // Le faux Meta ABÎME les lignes brutes qu'il a déjà rendues dès qu'on lui demande la page suivante ·
    // seule une lecture qui les a converties avant de demander la suite rend des lignes justes.
    const rendues: Array<Record<string, unknown>> = [];
    vi.stubGlobal('fetch', async (url: string) => {
      for (const r of rendues) { r.ad_id = undefined; r.spend = '999999'; }
      const n = pageDe(new URL(url));
      const data = [ligne(n), ligne(n + 100)];
      rendues.push(...data);
      const paging = n + 1 < 5 ? { next: 'x', cursors: { after: `c${n + 1}` } } : {};
      // Les objets eux-mêmes, comme `res.json()` les rend · pas une copie (un texte reparsé ne pourrait pas être abîmé après coup).
      return { ok: true, status: 200, json: async () => ({ data, paging }) } as unknown as Response;
    });
    const rows = await lire();
    expect(rows.length, 'des lignes brutes ont été gardées jusqu’à la fin de la lecture puis converties · elles pèsent sept fois une ligne convertie').toBe(10);
    expect(rows.every((r) => r.spend === 1), 'une ligne a été convertie APRÈS la page suivante · la lecture retient les lignes brutes').toBe(true);
  });
});

describe('reprise d’une page en échec passager · la même page, attentes croissantes, jamais sur une erreur d’autorisation', () => {
  /** 5 pages ; la page `p` échoue `fois` fois avec `reponse`, puis réussit. */
  function fauxMetaEnPanne(p: number, fois: number, reponse: () => Response | Promise<Response>) {
    let restants = fois;
    vi.stubGlobal('fetch', async (url: string) => {
      appels.push(url);
      const n = pageDe(new URL(url));
      if (n === p && restants > 0) { restants--; return reponse(); }
      const paging = n + 1 < 5 ? { next: 'x', cursors: { after: `c${n + 1}` } } : {};
      return new Response(JSON.stringify({ data: [ligne(n)], paging }), { status: 200 });
    });
  }
  const http503 = () => new Response('<html>Service Unavailable</html>', { status: 503 });
  const limite17 = () => new Response(JSON.stringify({ error: { message: '(#17) User request limit reached', code: 17 } }), { status: 400 });
  const jeton190 = () => new Response(JSON.stringify({ error: { message: 'Error validating access token: Session has expired', code: 190 } }), { status: 400 });

  it.each([['un 503 (HTML)', http503], ['un « (#17) » limite d’appels', limite17], ['une coupure réseau', () => { throw new TypeError('fetch failed'); }]])(
    '%s une fois à la page 3 · la page est redemandée, la lecture est COMPLÈTE', async (_l, rep) => {
      fauxMetaEnPanne(3, 1, rep);
      const rows = await lire();
      expect(rows.length, 'une seule erreur passagère a fait échouer ou tronqué la lecture').toBe(5);
      expect(appels.filter((u) => pageDe(new URL(u)) === 3).length, 'la page en échec n’a pas été redemandée (ou une autre l’a été)').toBe(2);
      expect(attentes).toEqual([ATTENTES_REPRISE_META_MS[0]]);
    });

  it('un 503 qui ne passe JAMAIS · trois reprises aux attentes croissantes, puis échec avec la raison de Meta', async () => {
    fauxMetaEnPanne(3, Infinity, http503);
    const err = await echecDe(lire());
    expect(err?.message, 'une page toujours en échec a été ignorée ou la lecture rendue partielle').toBe('Meta : HTTP 503');
    expect(attentes, 'les attentes ne sont pas croissantes, ou pas bornées').toEqual([2_000, 6_000, 18_000]);
    expect(appels.filter((u) => pageDe(new URL(u)) === 3).length).toBe(4);
  });

  it('jeton expiré (190) · AUCUNE reprise, échec immédiat', async () => {
    fauxMetaEnPanne(3, Infinity, jeton190);
    const err = await echecDe(lire());
    expect(err?.message).toBe('Meta : Error validating access token: Session has expired');
    expect(attentes, 'une erreur d’autorisation a été redemandée').toEqual([]);
    expect(appels.filter((u) => pageDe(new URL(u)) === 3).length).toBe(1);
  });
});
