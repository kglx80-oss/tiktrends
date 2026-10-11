import { describe, expect, it } from 'vitest';
import {
  parcoursVeille, parcoursResultats, compterLots, LIBELLE_NATURE, CHEMIN_PROJETS,
  CHEMIN_LOTS, CHEMIN_IMPORT_RESULTATS, CHEMIN_SUITES, CHEMIN_RADAR_VEILLE, ANCRE_TESTS, ANCRE_APPRIS, ANCRE_LECTURE_MARCHE,
  type CompteBoucle,
} from '../src';

/**
 * UX V2 · lot 4a · la boucle créative rendue lisible (maquette § 7). Ce garde
 * cloue les RÈGLES pures · quelle étape est atteinte, quel état vide, quel
 * chemin, pour qui. Le rendu est cloué côté web (`lot4a-parcours-rendu`).
 */

const vide: CompteBoucle = { tests: 0, avecHypothese: 0, lots: 0, lotsLances: 0, lotsImportes: 0, mesures: 0, aArbitrer: 0, arbitres: 0, apprentissages: 0, derniereMesure: null };
const plein: CompteBoucle = { tests: 5, avecHypothese: 4, lots: 2, lotsLances: 1, lotsImportes: 0, mesures: 3, aArbitrer: 2, arbitres: 1, apprentissages: 1, derniereMesure: '2026-10-09T08:00:00.000Z' };
const etape = (p: ReturnType<typeof parcoursResultats>, cle: string) => p.etapes.find((e) => e.cle === cle)!;
const hrefs = (e: { liens: Array<{ href: string }> }) => e.liens.map((l) => l.href);

describe('Résultats · hypothèse → lot → mesures → apprentissage', () => {
  it('quatre étapes dans l’ordre, chacune avec sa NATURE distincte', () => {
    const p = parcoursResultats(plein, { peutAgir: true });
    expect(p.etapes.map((e) => e.cle)).toEqual(['hypothese', 'lot', 'mesures', 'apprentissage']);
    expect(p.etapes.map((e) => e.nature)).toEqual(['hypothese', 'organisation', 'mesure', 'apprentissage']);
    // Hypothèse ≠ observation ≠ résultat mesuré · trois libellés différents.
    expect(new Set([LIBELLE_NATURE.hypothese, LIBELLE_NATURE.observation, LIBELLE_NATURE.mesure]).size).toBe(3);
  });

  it('marque sans donnée · chaque étape est vide, la première est la prochaine, un avertissement le dit', () => {
    const p = parcoursResultats(vide, { peutAgir: true });
    expect(p.etapes.every((e) => e.etat && !e.etat.atteinte), 'une étape vide se dit atteinte').toBe(true);
    expect(p.prochaine).toBe('hypothese');
    expect(p.avertissement).toContain('Aucun résultat mesuré');
    expect(p.avertissement).toContain('restent des hypothèses');
  });

  it('les chiffres affichés sont ceux reçus · jamais un gagnant annoncé', () => {
    const p = parcoursResultats(plein, { peutAgir: true });
    expect(etape(p, 'hypothese').etat!.texte).toBe('4 tests portent une hypothèse écrite · 1 test sans hypothèse.');
    expect(etape(p, 'lot').etat!.texte).toBe('2 lots · 1 lancé.');
    expect(etape(p, 'mesures').etat!.texte).toBe('3 tests mesurés sur la diffusion réelle · 1 verdict arbitré · dernière mesure le 09/10/2026.');
    expect(etape(p, 'apprentissage').etat!.texte).toContain('1 apprentissage validé');
    expect(p.prochaine).toBeNull();
    expect(p.avertissement).toBeNull();
    const tout = JSON.stringify(p).toLowerCase();
    expect(tout, 'un gagnant est annoncé dans le parcours').not.toMatch(/gagnant|vainqueur|winner/);
  });

  it('calculé sans arbitrage · la mesure est atteinte mais dit que rien n’est conclu', () => {
    const p = parcoursResultats({ ...vide, tests: 2, avecHypothese: 2, lots: 1, lotsLances: 1, mesures: 2, aArbitrer: 2 }, { peutAgir: false });
    const m = etape(p, 'mesures');
    expect(m.etat!.atteinte).toBe(true);
    expect(m.etat!.texte).toContain('calculé n’est pas conclu');
    expect(m.etat!.texte, 'une date inventée').not.toContain('dernière mesure');
    expect(hrefs(m)).toEqual([ANCRE_TESTS]);
    expect(m.liens[0]!.libelle).toBe('Ouvrir les tests · 2 à arbitrer');
    expect(p.prochaine).toBe('apprentissage');
  });

  it('tests sans hypothèse · l’étape reste VIDE (une ad n’est pas une hypothèse)', () => {
    const p = parcoursResultats({ ...vide, tests: 3 }, { peutAgir: true });
    const h = etape(p, 'hypothese');
    expect(h.etat!.atteinte).toBe(false);
    expect(h.etat!.texte).toContain('3 tests, aucun avec hypothèse');
    expect(hrefs(h)).toEqual([CHEMIN_LOTS]);
  });

  it('un membre ne reçoit aucun lien vers un écran réservé aux admins · on lui dit qui agit', () => {
    const admin = parcoursResultats(vide, { peutAgir: true });
    const membre = parcoursResultats(vide, { peutAgir: false });
    const reserves = [CHEMIN_LOTS, CHEMIN_IMPORT_RESULTATS, CHEMIN_RADAR_VEILLE];
    const tousMembre = membre.etapes.flatMap(hrefs);
    for (const r of reserves) expect(tousMembre, `lien admin offert à un membre · ${r}`).not.toContain(r);
    expect(admin.etapes.flatMap(hrefs)).toEqual(expect.arrayContaining(reserves));
    expect(etape(membre, 'mesures').etat!.texte).toContain('Un admin de l’espace');
  });

  it('les destinations d’avant sont préservées · lots (admin), suites, cumul « appris »', () => {
    const p = parcoursResultats(plein, { peutAgir: true });
    const tous = p.etapes.flatMap(hrefs);
    expect(tous).toContain(CHEMIN_LOTS);
    expect(tous).toContain(CHEMIN_SUITES);
    expect(tous).toContain(ANCRE_APPRIS);
    // « appris » reste joignable même sans apprentissage validé.
    expect(hrefs(etape(parcoursResultats(vide, { peutAgir: false }), 'apprentissage'))).toContain(ANCRE_APPRIS);
  });

  it('verdicts arbitrés sans apprentissage · l’étape le dit et mène aux suites', () => {
    const p = parcoursResultats({ ...plein, apprentissages: 0 }, { peutAgir: false });
    const a = etape(p, 'apprentissage');
    expect(a.etat!.atteinte).toBe(false);
    expect(a.etat!.texte).toContain('aucun apprentissage validé');
    expect(hrefs(a)[0]).toBe(CHEMIN_SUITES);
  });

  it('un lot importé (analysé sans lancement) n’est pas compté « lancé »', () => {
    const c = compterLots([
      { status: 'analyzed', launchedAt: null },
      { status: 'analyzed', launchedAt: '2026-09-01T00:00:00Z' },
      { status: 'testing', launchedAt: '2026-10-01T00:00:00Z' },
      { status: 'planned', launchedAt: null },
    ]);
    expect(c).toEqual({ lots: 4, lotsLances: 2, lotsImportes: 1 });
    const p = parcoursResultats({ ...vide, ...c }, { peutAgir: true });
    expect(etape(p, 'lot').etat!.texte).toBe('4 lots · 2 lancés · 1 importé.');
    const seulImport = parcoursResultats({ ...vide, ...compterLots([{ status: 'analyzed', launchedAt: null }]) }, { peutAgir: true });
    expect(etape(seulImport, 'lot').etat!.texte).toBe('1 lot · 0 lancé · 1 importé · aucun encore lancé ici.');
  });

  it('des comptes incohérents ou négatifs ne produisent pas de chiffre absurde', () => {
    const p = parcoursResultats({ ...vide, tests: 1, avecHypothese: 9, lots: 1, lotsLances: 7, mesures: -3 }, { peutAgir: true });
    expect(etape(p, 'hypothese').etat!.texte).toBe('1 test porte une hypothèse écrite.');
    expect(etape(p, 'lot').etat!.texte).toBe('1 lot · 1 lancé.');
    expect(etape(p, 'mesures').etat!.atteinte).toBe(false);
  });
});

describe('Veille · source → analyse → projet', () => {
  const base = { annonces: 0, demo: false, erreur: false, sauvegardes: null, marcheDispo: false };

  it('trois étapes · source et analyse sont des OBSERVATIONS, le projet une HYPOTHÈSE', () => {
    const p = parcoursVeille(base);
    expect(p.map((e) => e.cle)).toEqual(['source', 'analyse', 'projet']);
    expect(p.map((e) => e.nature)).toEqual(['observation', 'observation', 'hypothese']);
  });

  it('aucune annonce · source et analyse sont vides et le disent', () => {
    const p = parcoursVeille(base);
    expect(p[0]!.etat).toEqual({ atteinte: false, texte: 'Aucune annonce affichée · lance une recherche ci-dessous.' });
    expect(p[1]!.etat!.atteinte).toBe(false);
    expect(parcoursVeille({ ...base, erreur: true })[0]!.etat!.texte).toContain('ne répond pas');
  });

  it('les comptes réels sont lus · la démonstration est nommée', () => {
    expect(parcoursVeille({ ...base, annonces: 24, sauvegardes: 3 })[0]!.etat!.texte).toBe('24 annonces affichées · 3 sauvegardées, source conservée');
    expect(parcoursVeille({ ...base, annonces: 2, demo: true })[0]!.etat!.texte).toBe('2 annonces d’échantillon (démonstration)');
    expect(parcoursVeille({ ...base, sauvegardes: 1 })[0]!.etat!.atteinte).toBe(true);
  });

  it('le projet n’invente pas d’état · il mène aux projets Studios', () => {
    const projet = parcoursVeille({ ...base, annonces: 5 })[2]!;
    expect(projet.etat).toBeNull();
    expect(projet.liens.map((l) => l.href)).toEqual([CHEMIN_PROJETS]);
    expect(projet.aide).toContain('Préparer une création');
  });

  it('« Lecture du marché » n’est proposée que si la section peut se rendre', () => {
    expect(parcoursVeille({ ...base, marcheDispo: true })[1]!.liens.map((l) => l.href)).toEqual([ANCRE_LECTURE_MARCHE]);
    expect(parcoursVeille(base)[1]!.liens).toEqual([]);
  });

  it('aucun raccourci de section (Ce qui scale, Radar, Sauvegardes) · ils vivent dans les onglets', () => {
    const tous = parcoursVeille({ ...base, annonces: 3, marcheDispo: true }).flatMap((e) => e.liens.map((l) => l.href));
    for (const h of ['/veille/scale', '/radar', '/saved']) expect(tous).not.toContain(h);
  });
});
