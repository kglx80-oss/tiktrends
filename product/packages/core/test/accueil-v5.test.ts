import { describe, expect, it } from 'vitest';
import {
  surtitreAccueil, dateDuJourAccueil, chosesQuiAttendent, gagnantsProuves, mesureIteration, prochainesIterationsAccueil,
  etatProchainesIterations, completudeFicheMarque, tuilesAccueil, kpiAccueil, rangEtapeProjet, libelleLot,
  ELEMENTS_FICHE_MARQUE, MAX_ITERATIONS_ACCUEIL, type LigneIterationAccueil, type ContexteGagnante, type FicheMarqueLue,
} from '../src/accueil-v5';
import { lienIterationStudio } from '../src/studios/anciennes-adresses';

/**
 * UX V5 · l'Accueil sur les vraies données · les règles pures.
 * Chaque bloc vérifie ce qui SORT (phrase, cartes, KPI) · aucun chiffre sans
 * source, aucune gagnante non prouvée.
 */

describe('en-tête · date du jour (Paris) et marque', () => {
  it('date en français, au fuseau de Paris (23 h 30 UTC = le lendemain à Paris)', () => {
    expect(dateDuJourAccueil(new Date('2026-10-15T10:00:00Z'))).toBe('jeudi 15 octobre');
    expect(dateDuJourAccueil(new Date('2026-10-14T23:30:00Z')), 'la date suit l’UTC, pas Paris').toBe('jeudi 15 octobre');
  });
  it('« date · marque », ou la date seule', () => {
    expect(surtitreAccueil({ maintenant: new Date('2026-10-12T09:00:00Z'), marque: 'Neva' })).toBe('lundi 12 octobre · Neva');
    expect(surtitreAccueil({ maintenant: new Date('2026-10-12T09:00:00Z'), marque: null })).toBe('lundi 12 octobre');
    expect(surtitreAccueil({ maintenant: new Date('2026-10-12T09:00:00Z'), marque: '  ' })).toBe('lundi 12 octobre');
  });
});

describe('« N choses t’attendent » · seulement des sources lues', () => {
  it('aucune source lue · aucune phrase (jamais un chiffre inventé)', () => {
    expect(chosesQuiAttendent({ iterations: null, veille: null, notifications: null })).toBeNull();
  });
  it('compteur illisible (négatif, non entier) · traité comme une source absente', () => {
    expect(chosesQuiAttendent({ iterations: -1, veille: 1.5, notifications: null })).toBeNull();
  });
  it('sources lues, tout à 0 · « Rien ne t’attend », aucun chiffre', () => {
    const p = chosesQuiAttendent({ iterations: 0, veille: 0, notifications: null })!;
    expect(p.total).toBe(0);
    expect(p.tete).toBe('Rien ne t’attend pour l’instant.');
    expect(p.elements).toEqual([]);
  });
  it('somme des seules sources lues, dans l’ordre itérations · veille · notifications, accords', () => {
    const p = chosesQuiAttendent({ iterations: 1, veille: 5, notifications: null })!;
    expect(p.total, 'le total n’est pas la somme des sources lues').toBe(6);
    expect(p.tete).toBe('6 choses t’attendent');
    expect(p.elements.map((e) => e.texte)).toEqual(['1 gagnante à itérer', '5 nouvelles pubs chez tes concurrents suivis']);
    expect(p.elements.map((e) => e.href)).toEqual(['#prochaines-iterations', '/saved?onglet=nouveautes']);
    expect(p.elements.every((e) => e.source.length > 0), 'un compteur sans source').toBe(true);
    const un = chosesQuiAttendent({ iterations: null, veille: null, notifications: 1 })!;
    expect(un.tete).toBe('1 chose t’attend');
    expect(un.elements[0]!.texte).toBe('1 notification non lue');
  });
});

const ligne = (adId: string, o: Partial<LigneIterationAccueil> = {}): LigneIterationAccueil => ({
  adId, label: `Concept ${adId} · v1`, conceptTitle: `Concept ${adId}`, variableLabel: 'le format',
  freezeLabels: ['l’accroche', 'l’angle', 'l’offre'], rationale: 'Résultat conforme au protocole · décline-la.',
  edgeLegal: true, parentVerdict: 'winner', parentComparable: true, ...o,
});

describe('prochaines itérations · gagnantes PROUVÉES seulement', () => {
  it('écarte la piste relative, l’import non comparable, la perdante, la suite non filiée', () => {
    const rows = [
      ligne('relatif', { parentVerdict: 'relative_winner', edgeLegal: false }),
      ligne('importee', { parentComparable: false, edgeLegal: false }),
      ligne('importee-filiee', { parentComparable: false }), // edgeLegal mentirait · le verdict non comparable n'est pas prouvé
      ligne('perdante', { parentVerdict: 'loser', edgeLegal: false }),
      ligne('gagnante'),
      ligne('naissante', { parentVerdict: 'baby_winner' }),
    ];
    expect(gagnantsProuves(rows).map((r) => r.adId), 'une gagnante non prouvée passe').toEqual(['gagnante', 'naissante']);
  });
  it('une carte par gagnante · la première proposition du plan fait foi', () => {
    const rows = [ligne('a', { variableLabel: 'le format' }), ligne('a', { variableLabel: 'le son' }), ligne('b')];
    expect(gagnantsProuves(rows).map((r) => `${r.adId}:${r.variableLabel}`)).toEqual(['a:le format', 'b:le format']);
  });

  const A = '0f8e7a52-3c1d-4b6e-9a2f-1d2c3b4a5e6f';
  const ctx: Record<string, ContexteGagnante> = {
    [A]: { metricsAgg: { hookRate: 0.27, ctr: 0.018, daysElapsed: 7, syncedAt: '2026-10-10T08:00:00Z' }, plateforme: 'meta', lot: { numero: 1, statut: 'analyzed' }, apprentissageValide: true },
    b: { metricsAgg: null, plateforme: 'tiktok', lot: null, apprentissageValide: false },
  };
  it('cartes · verdict, lot, garde, change, raison, mesure, lien vers la préparation (sans dépense)', () => {
    const cartes = prochainesIterationsAccueil([ligne(A), ligne('b'), ligne('c')], (id) => ctx[id], { peutIterer: true });
    expect(cartes.length, 'plus de cartes que la maquette n’en pose').toBe(MAX_ITERATIONS_ACCUEIL);
    const [a, b] = cartes;
    expect(a).toMatchObject({ verdict: 'Gagnante', lot: 'Lot #1 conclu', apprentissageValide: true, garde: 'Garde · l’accroche, l’angle et l’offre', change: 'Change · le format' });
    expect(a!.iterer).toBe(lienIterationStudio(A));
    expect(a!.iterer, 'Itérer ne mène pas à la préparation du projet, brief repris').toBe(`/studio/projets/nouveau?type=ads&iter=${A}`);
    expect(a!.mesure).toEqual({ valeur: '1,8 %', libelle: 'taux de clic', periode: 'sur 7 jours de diffusion · mesuré le 10 oct. 2026', source: 'Meta · synchro Adsmap' });
    expect(b!.mesure, 'une mesure inventée pour un verdict sans métrique').toBeNull();
    expect(b!.lot).toBe('Hors lot');
  });
  it('rôle qui ne peut pas créer · aucun lien « Itérer »', () => {
    const [a] = prochainesIterationsAccueil([ligne(A)], (id) => ctx[id], { peutIterer: false });
    expect(a!.iterer).toBeNull();
  });
});

describe('mesure · la plus proche de l’achat, toujours avec sa période', () => {
  it('coût par achat d’abord (achats > 0), puis ROAS, clic, accroche', () => {
    const base = { daysElapsed: 14 };
    expect(mesureIteration({ ...base, cpa: 12.4, purchases: 9, roas: 2.1 }, 'meta')?.libelle).toBe('coût par achat');
    expect(mesureIteration({ ...base, cpa: 12.4, purchases: 9 }, 'meta')?.valeur.replace(/\s/g, ' ')).toBe('12,40 €');
    expect(mesureIteration({ ...base, cpa: null, purchases: 0, roas: 2.4 }, 'meta')?.libelle).toBe('retour sur dépense (ROAS)');
    expect(mesureIteration({ ...base, hookRate: 0.27 }, 'meta')?.valeur.replace(/\s/g, ' ')).toBe('27 %');
  });
  it('sans période (ni jours, ni date) · aucune mesure', () => {
    expect(mesureIteration({ hookRate: 0.27 }, 'meta')).toBeNull();
    expect(mesureIteration({ hookRate: 0.27, syncedAt: 'pas une date' }, 'meta')).toBeNull();
  });
  it('agrégat vide ou absurde · aucune mesure', () => {
    expect(mesureIteration(null, 'meta')).toBeNull();
    expect(mesureIteration({ daysElapsed: 7, cpa: Infinity, purchases: 0 }, 'meta')).toBeNull();
    expect(mesureIteration('texte', 'meta')).toBeNull();
  });
  it('lot · conclu seulement analysé', () => {
    expect(libelleLot({ numero: 4, statut: 'testing' })).toBe('Lot #4');
    expect(libelleLot({ numero: 4, statut: 'analyzed' })).toBe('Lot #4 conclu');
  });
});

describe('état du bloc · droits, marque, lecture', () => {
  const base = { contexte: () => undefined, peutIterer: true };
  it('rôle refusé · rien ; offre · dit pourquoi ; sans marque · dit pourquoi', () => {
    expect(etatProchainesIterations({ ...base, refus: 'role', marqueActive: true, lecture: null }).etat).toBe('ferme');
    const o = etatProchainesIterations({ ...base, refus: 'plan', marqueActive: true, lecture: null });
    expect(o.etat).toBe('offre');
    expect(o.etat === 'offre' && o.message).toContain('offre Plus');
    expect(etatProchainesIterations({ ...base, refus: null, marqueActive: false, lecture: null }).etat).toBe('sans-marque');
  });
  it('panne · le message de l’action ; aucun gagnant prouvé · état vide honnête vers Résultats', () => {
    const e = etatProchainesIterations({ ...base, refus: null, marqueActive: true, lecture: { ok: false, message: 'Lecture impossible.' } });
    expect(e).toEqual({ etat: 'erreur', message: 'Lecture impossible.' });
    const v = etatProchainesIterations({ ...base, refus: null, marqueActive: true, lecture: { ok: true, rows: [ligne('r', { parentVerdict: 'relative_winner', edgeLegal: false })] } });
    expect(v.etat, 'une piste relative remplit le bloc').toBe('vide');
    expect(v.etat === 'vide' && v.message).toContain('Aucun test conclu pour l’instant');
    expect(v.etat === 'vide' && v.resultats).toBe('/adsmap');
  });
  it('liste · total des gagnantes prouvées, boucle vers Résultats, autres vers Suites', () => {
    const l = etatProchainesIterations({ ...base, refus: null, marqueActive: true, lecture: { ok: true, rows: [ligne('a'), ligne('b'), ligne('c'), ligne('r', { parentVerdict: 'loser', edgeLegal: false })] } });
    expect(l.etat).toBe('liste');
    if (l.etat !== 'liste') return;
    expect(l.total, 'le total compte un verdict non prouvé').toBe(3);
    expect(l.cartes.length).toBe(2);
    expect(l.boucle).toBe('/adsmap');
    expect(l.autres).toBe('/adsmap/suites');
  });
});

const fiche = (o: Partial<FicheMarqueLue> = {}): FicheMarqueLue => ({
  description: 'd', usp: 'u', audience: 'a', category: 'c', categoryNeeds: 'n', tone: 't',
  industryTags: 1, colors: 2, scenarios: 1, personas: 1, produits: 3, concurrents: 1, ...o,
});

describe('fiche marque · le vrai manque', () => {
  it('complète · 100 %, rien ne manque', () => {
    expect(completudeFicheMarque(fiche())).toMatchObject({ score: 100, manques: [] });
  });
  it('les manques réels, dans l’ordre de la fiche ; un texte blanc est un manque', () => {
    const c = completudeFicheMarque(fiche({ usp: '   ', produits: 0, concurrents: 0 }));
    expect(c.manques).toEqual(['la promesse (USP)', 'les produits', 'les concurrents']);
    expect(c.score).toBe(Math.round((9 / 12) * 100));
    expect(c.checks.length).toBe(ELEMENTS_FICHE_MARQUE.length);
  });
});

describe('tuiles · seulement ce que les droits ouvrent', () => {
  it('tout ouvert · cinq tuiles, Nouveau projet en primaire', () => {
    const t = tuilesAccueil({ nouveauProjet: '/studio/projets/nouveau', veille: true, jarvis: true, importer: true, fiche: { href: '/brands/b1', manques: ['la description', 'le ton', 'les produits'] } });
    expect(t.map((x) => x.cle)).toEqual(['nouveau', 'veille', 'jarvis', 'importer', 'fiche']);
    expect(t.map((x) => x.href)).toEqual(['/studio/projets/nouveau', '/veille', '/jarvis', '/adsmap/import', '/brands/b1']);
    expect(t.filter((x) => x.primaire).map((x) => x.cle)).toEqual(['nouveau']);
    expect(t[4]!.sous).toBe('3 éléments à compléter · la description, le ton…');
  });
  it('droits fermés · tuiles absentes ; fiche complète · pas de tuile', () => {
    expect(tuilesAccueil({ nouveauProjet: null, veille: false, jarvis: false, importer: false, fiche: null })).toEqual([]);
    expect(tuilesAccueil({ nouveauProjet: null, veille: false, jarvis: true, importer: false, fiche: { href: '/brands/b', manques: [] } }).map((x) => x.cle)).toEqual(['jarvis']);
    expect(tuilesAccueil({ nouveauProjet: null, veille: false, jarvis: false, importer: false, fiche: { href: '/b', manques: ['le ton'] } })[0]!.sous).toBe('À compléter · le ton');
  });
});

describe('KPI · une source lue, une période, sinon rien', () => {
  it('aucune source · aucun KPI', () => {
    expect(kpiAccueil({ projets: null, sauvegardees: null, nouveautes: null, enTest: null })).toEqual([]);
  });
  it('chaque KPI porte sa période et sa source', () => {
    const k = kpiAccueil({ projets: { n: 3, plafond: 60 }, sauvegardees: { n: 4, dossiers: 3 }, nouveautes: { n: 5, jours: 7, suivies: 2 }, enTest: { n: 6, lots: [4, 2, 4] } });
    expect(k.map((x) => [x.cle, x.valeur, x.detail, x.periode])).toEqual([
      ['projets', '3', 'dans les marques de ta portée', 'à ce jour'],
      ['sauvegardees', '4', '3 collections', 'au total'],
      ['nouveautes', '5', '2 concurrents suivis', 'ces 7 derniers jours'],
      ['enTest', '6', 'lots #2 et #4', 'en ce moment'],
    ]);
    expect(k.every((x) => x.source.length > 0 && x.periode.length > 0)).toBe(true);
  });
  it('lecture bornée · « 60+ », jamais un faux total ; sans concurrent suivi · KPI muet ; compteur illisible · KPI muet', () => {
    const k = kpiAccueil({ projets: { n: 60, plafond: 60 }, sauvegardees: { n: -2, dossiers: 0 }, nouveautes: { n: 0, jours: 7, suivies: 0 }, enTest: { n: 0, lots: [] } });
    expect(k.map((x) => [x.cle, x.valeur, x.detail])).toEqual([['projets', '60+', 'dans les marques de ta portée'], ['enTest', '0', 'aucun lot en test']]);
  });
});

describe('barre d’étapes d’un projet', () => {
  it('rang 1 à 3', () => {
    expect([rangEtapeProjet('brief_a_completer'), rangEtapeProjet('brief_pret'), rangEtapeProjet('production')]).toEqual([1, 2, 3]);
  });
});
