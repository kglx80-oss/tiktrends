import { describe, it, expect } from 'vitest';
import {
  suitePagination, erreurLectureIncomplete, lireLectureIncomplete, phraseLectureIncomplete,
  BORNE_PAGES_META, TAILLE_PAGE_META, FENETRE_SYNCHRO_JOURS, ANNONCES_MAX_COMPTE_META, PAGES_VOLUME_LEGITIME_META, PAGES_BUDGET_MEMOIRE_META,
  BUDGET_MEMOIRE_LECTURE_OCTETS, OCTETS_PAR_LIGNE_CONVERTIE, paramsDeSuite, reprisePageMeta, ATTENTES_REPRISE_META_MS,
  DUREE_MAX_LECTURE_META_MS, DELAI_REQUETE_META_MS,
  motifEchecRemontee, etatRemontee, texteRemontee, type RemonteeJournal,
} from '../src';

/**
 * La règle de la pagination Meta (`pagination-meta.ts`) · fin, page suivante,
 * ou lecture INCOMPLÈTE dite · et ce que l'écran en lit (Connexions, Importer).
 */

describe('pagination Meta · la règle', () => {
  it('les deux plafonds sont dérivés · volume légitime (5 000 × 121 / 500) et mémoire mesurée (128 Mio / 550 o / 500)', () => {
    expect(PAGES_VOLUME_LEGITIME_META).toBe(Math.ceil((ANNONCES_MAX_COMPTE_META * (FENETRE_SYNCHRO_JOURS + 1)) / TAILLE_PAGE_META));
    expect(PAGES_BUDGET_MEMOIRE_META).toBe(Math.floor(BUDGET_MEMOIRE_LECTURE_OCTETS / OCTETS_PAR_LIGNE_CONVERTIE / TAILLE_PAGE_META));
    expect([TAILLE_PAGE_META, FENETRE_SYNCHRO_JOURS, PAGES_VOLUME_LEGITIME_META, PAGES_BUDGET_MEMOIRE_META]).toEqual([500, 120, 1210, 488]);
  });
  it('la borne est SOUS les deux plafonds, avec marge · 400 pages, ~118 Mo au plus fort', () => {
    expect(BORNE_PAGES_META).toBe(400);
    expect(BORNE_PAGES_META, 'la borne dépasse le budget mémoire mesuré · la lecture peut faire tomber le serveur web').toBeLessThanOrEqual(Math.min(PAGES_VOLUME_LEGITIME_META, PAGES_BUDGET_MEMOIRE_META));
  });
  it.each([
    [{ pagesLues: 1, next: null, after: 'c1' }, { suite: 'fin' }],
    [{ pagesLues: 400, next: undefined, after: undefined }, { suite: 'fin' }],
    [{ pagesLues: 3, next: 'u', after: 'c3' }, { suite: 'page', params: { after: 'c3' } }],
    [{ pagesLues: 399, next: 'u', after: 'c' }, { suite: 'page', params: { after: 'c' } }],
    [{ pagesLues: 400, next: 'u', after: 'c' }, { suite: 'incomplete', raison: 'borne' }],
    [{ pagesLues: 2, next: 'u', after: null }, { suite: 'incomplete', raison: 'curseur_absent' }],
    [{ pagesLues: 2, next: 'https://graph.facebook.com/x?access_token=t&limit=500', after: null }, { suite: 'incomplete', raison: 'curseur_absent' }],
    [{ pagesLues: 2, next: 'https://graph.facebook.com/x?access_token=t&after=Q2', after: null }, { suite: 'page', params: { after: 'Q2' } }],
    [{ pagesLues: 2, next: 'https://graph.facebook.com/x?access_token=t&offset=1000', after: undefined }, { suite: 'page', params: { offset: '1000' } }],
    // `__paging_token` seul (sans les since / until de la page suivante) redemanderait la même page · pas une suite.
    [{ pagesLues: 2, next: 'https://graph.facebook.com/x?access_token=t&__paging_token=P', after: undefined }, { suite: 'incomplete', raison: 'curseur_absent' }],
    [{ pagesLues: 2, next: 'u', after: 'c', borne: 2 }, { suite: 'incomplete', raison: 'borne' }],
  ] as const)('%o → %o', (p, attendu) => expect(suitePagination(p)).toEqual(attendu));
  it('la suite lue dans `next` ne reprend JAMAIS son jeton', () => {
    expect(paramsDeSuite('https://graph.facebook.com/v21.0/act_1/insights?access_token=SECRET&after=A&limit=25&fields=x')).toEqual({ after: 'A' });
    expect(paramsDeSuite('pas une url')).toBeNull();
  });

  it('la durée d’une lecture est sous les délais qui l’entourent · 15 min du worker, 800 s de la route', () => {
    expect(DUREE_MAX_LECTURE_META_MS).toBe(12 * 60_000);
    expect(DUREE_MAX_LECTURE_META_MS).toBeLessThan(Math.min(15 * 60_000, 800_000));
    expect(DELAI_REQUETE_META_MS).toBe(60_000);
  });
  it('le message d’erreur se relit · et toute autre erreur n’est pas une lecture incomplète', () => {
    expect(lireLectureIncomplete(erreurLectureIncomplete('duree', 11))).toEqual({ raison: 'duree', pages: 11 });
    expect(lireLectureIncomplete(erreurLectureIncomplete('borne', 1210))).toEqual({ raison: 'borne', pages: 1210 });
    expect(lireLectureIncomplete(erreurLectureIncomplete('curseur_absent', 4))).toEqual({ raison: 'curseur_absent', pages: 4 });
    expect(lireLectureIncomplete('Meta : (#17) User request limit reached')).toBeNull();
  });
  it('le motif journalisé reste un code accepté par la colonne (`autre`)', () => {
    expect(motifEchecRemontee(erreurLectureIncomplete('borne', 1210))).toBe('autre');
  });
});

describe('reprise d’une page · passager redemandé, autorisation jamais', () => {
  it('trois reprises, attentes croissantes, puis plus rien', () => {
    const e = { status: 503, message: 'Meta : HTTP 503' };
    expect([0, 1, 2, 3].map((n) => reprisePageMeta(e, n))).toEqual([2_000, 6_000, 18_000, null]);
    expect(ATTENTES_REPRISE_META_MS.every((a, i, t) => i === 0 || a > t[i - 1]!)).toBe(true);
  });
  it.each([
    [{ status: 503, message: 'Meta : HTTP 503' }, 2_000],
    [{ status: 500, code: 1, message: 'Meta : Please reduce the amount of data you’re asking for, then retry your request' }, null],
    [{ status: 500, code: 1, transitoire: true, message: 'Meta : An unknown error has occurred.' }, 2_000],
    // Autorisation SANS mot révélateur dans le message · seul le code la reconnaît.
    [{ status: 500, code: 190, transitoire: true, message: 'Meta : HTTP 500' }, null],
    [{ status: 500, code: 102, message: 'Meta : Session key invalid' }, null],
    [{ status: 400, code: 17, message: 'Meta : (#17) User request limit reached' }, 2_000],
    [{ status: 400, code: 80004, message: 'Meta : There have been too many calls to this ad-account' }, 2_000],
    [{ status: 400, code: 2, transitoire: true, message: 'Meta : Service temporarily unavailable' }, 2_000],
    [{ status: 429, message: 'Meta : HTTP 429' }, 2_000],
    [{ status: null, message: 'fetch failed' }, 2_000],
    [{ status: null, message: 'The operation was aborted due to timeout' }, 2_000],
    [{ status: 400, code: 190, message: 'Meta : Error validating access token: Session has expired' }, null],
    [{ status: 400, code: 190, transitoire: true, message: 'Meta : Error validating access token' }, null],
    [{ status: 403, code: 200, message: 'Meta : (#200) Requires ads_read permission' }, null],
    [{ status: 400, code: 10, message: 'Meta : (#10) Application does not have permission for this action' }, null],
    [{ status: 400, code: 100, message: 'Meta : (#100) Invalid parameter' }, null],
  ] as const)('%o → %s', (e, attendu) => expect(reprisePageMeta(e, 0)).toBe(attendu));
});

describe('pagination Meta · ce que l’écran dit', () => {
  const echec: RemonteeJournal = {
    source: 'meta', declencheur: 'nuit', le: '2026-11-17T07:01:00Z', ok: false, motif: 'autre',
    resume: { lectureIncomplete: { raison: 'borne', pages: 1210 } },
  };
  const PHRASE = 'ce compte publicitaire renvoie plus de 1\u202f210 pages de mesures Meta, au-delà de ce que la mesure lit en une fois · rien n’a été écrit, les mesures précédentes restent en place · écris au support · ce volume demande une lecture par tranches, pas encore disponible';

  it('la phrase · la cause et que rien n’a été écrit', () => {
    expect(phraseLectureIncomplete({ raison: 'borne', pages: 1210 })).toBe(PHRASE);
    expect(phraseLectureIncomplete({ raison: 'duree', pages: 11 })).toBe('la lecture des mesures Meta a dépassé 12 min (11 pages lues) · rien n’a été écrit, les mesures précédentes restent en place · la remontée suivante réessaiera, si ça persiste écris au support');
    expect(phraseLectureIncomplete({ raison: 'curseur_absent', pages: 4 })).toBe('Meta a annoncé une suite de mesures sans moyen de la lire (page 4) · rien n’a été écrit, les mesures précédentes restent en place · la remontée suivante réessaiera, si ça persiste écris au support');
  });
  it('Connexions · la remontée est en échec, avec la phrase de la lecture incomplète (pas le « autre » générique)', () => {
    const e = etatRemontee({ connecte: true, cleDeclenchement: true, suspendueLe: null, derniereReussie: '2026-11-16T07:01:00Z', journal: [echec] }, new Date('2026-11-17T08:00:00Z'), 'Europe/Paris');
    expect(e.phase).toBe('en_echec');
    expect(e.erreur, 'l’écran ne dit pas que la lecture Meta était incomplète').toBe(PHRASE);
  });
  it('Importer · la ligne du journal dit la lecture incomplète', () => {
    expect(texteRemontee(echec)).toBe(`Remontée de la nuit · échec · ${PHRASE}`);
  });
  it('un échec ordinaire garde sa phrase de motif', () => {
    expect(texteRemontee({ ...echec, motif: 'limite', resume: null })).toBe('Remontée de la nuit · échec · Meta a limité les appels · la remontée suivante reprendra');
  });
});
