import { describe, it, expect } from 'vitest';
import {
  suitePagination, erreurLectureIncomplete, lireLectureIncomplete, phraseLectureIncomplete,
  BORNE_PAGES_META, TAILLE_PAGE_META, FENETRE_SYNCHRO_JOURS, ANNONCES_MAX_COMPTE_META,
  motifEchecRemontee, etatRemontee, texteRemontee, type RemonteeJournal,
} from '../src';

/**
 * La règle de la pagination Meta (`pagination-meta.ts`) · fin, page suivante,
 * ou lecture INCOMPLÈTE dite · et ce que l'écran en lit (Connexions, Importer).
 */

describe('pagination Meta · la règle', () => {
  it('la borne est dérivée · annonces max × jours de la fenêtre (inclusive) / taille de page', () => {
    expect(BORNE_PAGES_META).toBe(Math.ceil((ANNONCES_MAX_COMPTE_META * (FENETRE_SYNCHRO_JOURS + 1)) / TAILLE_PAGE_META));
    expect([TAILLE_PAGE_META, FENETRE_SYNCHRO_JOURS, BORNE_PAGES_META]).toEqual([500, 120, 1210]);
  });
  it.each([
    [{ pagesLues: 1, next: null, after: 'c1' }, { suite: 'fin' }],
    [{ pagesLues: 1210, next: undefined, after: undefined }, { suite: 'fin' }],
    [{ pagesLues: 3, next: 'u', after: 'c3' }, { suite: 'page', after: 'c3' }],
    [{ pagesLues: 1209, next: 'u', after: 'c' }, { suite: 'page', after: 'c' }],
    [{ pagesLues: 1210, next: 'u', after: 'c' }, { suite: 'incomplete', raison: 'borne' }],
    [{ pagesLues: 2, next: 'u', after: null }, { suite: 'incomplete', raison: 'curseur_absent' }],
    [{ pagesLues: 2, next: 'u', after: 'c', borne: 2 }, { suite: 'incomplete', raison: 'borne' }],
  ] as const)('%o → %o', (p, attendu) => expect(suitePagination(p)).toEqual(attendu));

  it('le message d’erreur se relit · et toute autre erreur n’est pas une lecture incomplète', () => {
    expect(lireLectureIncomplete(erreurLectureIncomplete('borne', 1210))).toEqual({ raison: 'borne', pages: 1210 });
    expect(lireLectureIncomplete(erreurLectureIncomplete('curseur_absent', 4))).toEqual({ raison: 'curseur_absent', pages: 4 });
    expect(lireLectureIncomplete('Meta : (#17) User request limit reached')).toBeNull();
  });
  it('le motif journalisé reste un code accepté par la colonne (`autre`)', () => {
    expect(motifEchecRemontee(erreurLectureIncomplete('borne', 1210))).toBe('autre');
  });
});

describe('pagination Meta · ce que l’écran dit', () => {
  const echec: RemonteeJournal = {
    source: 'meta', declencheur: 'nuit', le: '2026-11-17T07:01:00Z', ok: false, motif: 'autre',
    resume: { lectureIncomplete: { raison: 'borne', pages: 1210 } },
  };
  const PHRASE = 'Meta renvoie plus de 1210 pages de mesures pour ce compte, la lecture a été arrêtée · rien n’a été écrit, les mesures précédentes restent en place';

  it('la phrase · la cause et que rien n’a été écrit', () => {
    expect(phraseLectureIncomplete({ raison: 'borne', pages: 1210 })).toBe(PHRASE);
    expect(phraseLectureIncomplete({ raison: 'curseur_absent', pages: 4 })).toBe('Meta a annoncé une suite de mesures sans moyen de la lire (page 4) · rien n’a été écrit, les mesures précédentes restent en place');
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
