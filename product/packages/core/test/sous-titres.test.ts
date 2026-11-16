import { describe, it, expect } from 'vitest';
import {
  cartonsSousTitres, sousTitresAss, motsDuMontage, typographieFrancaise, tempsAss, miseEnPageSousTitres, instantsDeControle,
  largeurTextePx, nonInclusApresSousTitres, NON_INCLUS_SOUS_TITRES, PART_BASSE_LIBRE, FAMILLE_SOUS_TITRES, FICHIER_POLICE_SOUS_TITRES,
  type MotHorodate,
} from '../src';

/**
 * Sous-titres · des mots horodatés (transcription) aux cartons et au fichier
 * ASS. La présence du texte SUR L'IMAGE est prouvée par la passe réelle
 * (`packages/integrations/test/sous-titres-video.test.ts`).
 */

const m = (texte: string, debutMs: number, finMs: number): MotHorodate => ({ texte, debutMs, finMs });
const V = { largeur: 1080, hauteur: 1920, dureeMs: 10_000 };
/** Débit régulier, aucune pause, aucune ponctuation. */
const suite = (mots: string[], pas = 200, debut = 0) => mots.map((t, i) => m(t, debut + i * pas, debut + i * pas + pas - 20));

describe('découpage en cartons', () => {
  it('2 à 4 mots, répartis à tailles voisines · 5 mots ⇒ 3 + 2, 9 ⇒ 3 + 3 + 3, jamais un mot seul', () => {
    expect(cartonsSousTitres(suite(['a1', 'a2', 'a3', 'a4', 'a5']), V).cartons.map((c) => c.mots.length)).toEqual([3, 2]);
    expect(cartonsSousTitres(suite(['b1', 'b2', 'b3', 'b4', 'b5', 'b6', 'b7', 'b8', 'b9']), V).cartons.map((c) => c.mots.length)).toEqual([3, 3, 3]);
    expect(cartonsSousTitres(suite(['c1', 'c2', 'c3', 'c4']), V).cartons.map((c) => c.mots.length)).toEqual([4]);
  });

  it('coupure à la pause (≥ 250 ms) et à la ponctuation forte, puis aux virgules quand chaque côté garde 2 mots', () => {
    const mots = [m('Tu', 0, 100), m('vois', 110, 300), m('ça', 310, 400), /* pause */ m('Voilà.', 700, 900), m('Une', 910, 1000), m('peau', 1010, 1200),
      m('douce,', 1210, 1400), m('nette', 1410, 1600), m('et', 1610, 1700), m('lumineuse', 1710, 2000)];
    expect(cartonsSousTitres(mots, V).cartons.map((c) => c.mots.join(' '))).toEqual(['Tu vois ça', 'Voilà.', 'Une peau douce,', 'nette et lumineuse']);
  });

  it('pause de 249 ms · pas de coupure (seuil)', () => {
    expect(cartonsSousTitres([m('Un', 0, 100), m('deux', 349, 500)], V).cartons).toHaveLength(1);
    expect(cartonsSousTitres([m('Un', 0, 100), m('deux', 350, 500)], V).cartons).toHaveLength(2);
  });

  it('un carton trop large pour 2 lignes est redécoupé (métriques mesurées de la police)', () => {
    const longs = suite(['Incroyablement', 'hydratante', 'naturellement', 'extraordinaire']);
    const r = cartonsSousTitres(longs, { largeur: 360, hauteur: 640, dureeMs: 5000 });
    for (const c of r.cartons) {
      expect(c.lignes.length).toBeLessThanOrEqual(2);
      for (const l of c.lignes) expect(largeurTextePx(l, r.page.taille)).toBeLessThanOrEqual(r.page.largeurUtile);
    }
    expect(r.cartons.length).toBeGreaterThan(1);
  });
});

describe('horodatage', () => {
  it('début au premier mot, fin au dernier ou à la durée minimale, jamais au-delà du suivant ni de la vidéo', () => {
    const r = cartonsSousTitres([m('Un', 100, 150), m('test', 160, 200), /* pause */ m('Encore', 520, 600), m('un', 610, 700), m('Fin', 9_800, 9_900), m('ici', 9_910, 9_990)], V);
    expect(r.cartons.map((c) => [c.debutMs, c.finMs])).toEqual([[100, 520], [520, 1020], [9_800, 10_000]]);
  });

  it('ASS · temps en centisecondes, début arrondi vers le bas, fin vers le haut, jamais de chevauchement', () => {
    expect(tempsAss(1_234, 'debut')).toBe('0:00:01.23');
    expect(tempsAss(1_234, 'fin')).toBe('0:00:01.24');
    expect(tempsAss(3_723_450, 'debut')).toBe('1:02:03.45');
    const ass = sousTitresAss([m('Un', 100, 150), m('test', 160, 200), m('Encore', 525, 600), m('un', 610, 700)], V).ass;
    expect(ass).toContain('Dialogue: 0,0:00:00.10,0:00:00.52,SousTitres,,0,0,0,,Un test');
    expect(ass).toContain('Dialogue: 0,0:00:00.52,0:00:01.03,SousTitres,,0,0,0,,Encore un');
  });

  it('mots du montage · chaque prise recalée sur le début de son plan, mots dits après la fin du plan retirés', () => {
    const prises = { s1: [m('Bonjour', 100, 400), m('trop', 2_900, 3_200)], s2: [m('Salut', 0, 300)] };
    expect(motsDuMontage([{ shotId: 's1', dureeMs: 3_000 }, { shotId: 's2', dureeMs: 2_000 }], prises)).toEqual([
      m('Bonjour', 100, 400), m('trop', 2_900, 3_000), m('Salut', 3_000, 3_300),
    ]);
    expect(motsDuMontage([{ shotId: 's1', dureeMs: 2_000 }], prises)).toEqual([m('Bonjour', 100, 400)]);
  });
});

describe('typographie française et accents', () => {
  it('apostrophe typographique, espace fine insécable avant ; : ! ? et dans les guillemets, accents gardés', () => {
    expect(typographieFrancaise("C'est l'été ! Vraiment ? « Oui »").texte).toBe('C’est l’été ! Vraiment ? « Oui »');
    expect(typographieFrancaise('Crème à l’œillet, déjà ÉTÉ').texte).toBe('Crème à l’œillet, déjà ÉTÉ');
  });
  it('commandes ASS neutralisées · accolades et barres inverses ne passent jamais', () => {
    expect(typographieFrancaise('{\\b1}gras\\N').texte).toBe('b1grasN');
  });
  it('caractère que la police ne dessine pas · retiré ET signalé, jamais une case vide', () => {
    const r = cartonsSousTitres([m('Top', 0, 100), m('😀', 110, 200), m('produit', 210, 400)], V);
    expect(r.caracteresRetires).toEqual(['😀']);
    expect(r.cartons.map((c) => c.lignes.join(' '))).toEqual(['Top produit']);
  });
  it('le fichier ASS garde les accents en UTF-8', () => {
    expect(sousTitresAss([m('Crème', 0, 300), m('été', 310, 600)], V).ass).toContain(',,Crème été\n');
  });
});

describe('mise en page · zone sûre 9:16', () => {
  it('Liberation Sans Bold du dépôt, texte posé au-dessus des 20 % bas, contour', () => {
    const p = miseEnPageSousTitres(1080, 1920);
    expect(p.zone.bas).toBeLessThanOrEqual(1920 * (1 - PART_BASSE_LIBRE));
    expect(p.margeBas).toBeGreaterThanOrEqual(Math.ceil(1920 * PART_BASSE_LIBRE));
    expect(FAMILLE_SOUS_TITRES).toBe('Liberation Sans');
    expect(FICHIER_POLICE_SOUS_TITRES).toBe('sans-700.ttf');
    const ass = sousTitresAss([m('Un', 0, 100), m('test', 110, 300)], V).ass;
    expect(ass).toContain(`Style: SousTitres,Liberation Sans,${p.taille},&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,-1,0,0,0,100,100,0,0,1,${p.contour},0,2,${p.margeCote},${p.margeCote},${p.margeBas},1`);
    expect(ass).toContain('PlayResX: 1080\nPlayResY: 1920\nWrapStyle: 2');
    expect(p.contour).toBeGreaterThanOrEqual(2);
  });
  it('instants de contrôle · milieu de cartons, et des moments sans carton', () => {
    expect(instantsDeControle([{ debutMs: 500, finMs: 1_100 }, { debutMs: 1_900, finMs: 2_400 }], 3_000)).toEqual({ avecTexteMs: [800, 2_150], sansTexteMs: [1_500, 2_700] });
    expect(instantsDeControle([], 3_000)).toEqual({ avecTexteMs: [], sansTexteMs: [] });
  });
});

describe('« Sous-titres » sort de la liste « non inclus » seulement quand ils sont vus sur l’image', () => {
  const liste = ['Texte écran · non incrusté (plan 1).', NON_INCLUS_SOUS_TITRES];
  it('brûlés et vus ⇒ la ligne sort, les autres restent', () => {
    expect(nonInclusApresSousTitres(liste, { brules: true, cartons: 4, cartonsVerifies: 3 })).toEqual(['Texte écran · non incrusté (plan 1).']);
  });
  it('aucun carton vu, ou passe refusée, ou non exécutée ⇒ la ligne reste avec la raison', () => {
    expect(nonInclusApresSousTitres(liste, { brules: true, cartons: 4, cartonsVerifies: 0 })).toEqual(liste.map((l) => (l === NON_INCLUS_SOUS_TITRES ? 'Sous-titres · non incrustés (passe des sous-titres non exécutée).' : l)));
    expect(nonInclusApresSousTitres(liste, { brules: false, raison: 'aucune prise transcrite' })[1]).toBe('Sous-titres · non incrustés (aucune prise transcrite).');
    expect(nonInclusApresSousTitres(liste, null)[1]).toBe('Sous-titres · non incrustés (passe des sous-titres non exécutée).');
  });
});
