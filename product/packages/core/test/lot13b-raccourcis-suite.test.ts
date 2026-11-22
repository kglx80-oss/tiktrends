import { describe, expect, it } from 'vitest';
import {
  RACCOURCIS, PORTEES_RACCOURCIS, PORTEES_AIDE_PROJET, TOUCHES_RECENSEES, REGLES_CLAVIER, ANCRE_CONCLURE_LOT,
  RAISON_GESTE_RIEN_A_CONCLURE, RAISON_GESTE_SANS_GAGNANTE_LOT, RAISON_ITERER_HORS_PLAN_LOT, RAISON_CONCLURE_NON_LANCE, RAISON_CONCLURE_HISTORIQUE,
  RAISON_CONCLURE_EN_DIFFUSION, RAISON_CONCLURE_MESURES_MANQUANTES, RAISON_GESTE_LECTURE_INCOMPLETE,
  gestesContexteJarvis, etatLotSpatial, attendArbitrage, lotConcluable, raisonConclureFerme, type EtatLotSpatial,
  conflitsRaccourcis, raccourciDeLaFrappe, raccourciFicheLot, raccourciDeVue, groupesAideRaccourcis, libelleAideFiltree,
  astuceRaccourcisAccueil, messageRaccourciFerme, gestesClavierLot, exigeCoupure, lienIterationVariable, sansTiretCadratin,
  type ContexteFrappeVue, type FaitsAdSpatial, type FrappeClavier, type Raccourci,
} from '../src';

/**
 * Lot 13 bis V5 · les restes du lot 13 et des raccourcis pour itérer · pur.
 *  · la portée « fiche-lot » (C, T) · sans conflit, et les touches écartées le
 *    sont PAR la garde (I · Importer, global ; R · fin de « G puis R ») ;
 *  · la règle d'une vue (`raccourciFicheLot`) · mêmes refus que la coquille ;
 *  · ce que C et T ouvrent (`gestesClavierLot`) · la même règle que les gestes ;
 *  · l'aide filtrée d'un projet (PC D16) · l'astuce de l'Accueil (CA G29).
 * Le rendu (vraies vues, jsdom) est prouvé côté web (`lot13b-raccourcis-suite-rendu.test.tsx`,
 * `lot13b-raccourcis-lot-db.test.tsx`).
 */

const VUE: ContexteFrappeVue = { actifs: true, modaleOuverte: false, cible: { tagName: 'BODY' } };
const idVue = (key: string, o: Partial<FrappeClavier> = {}, c: Partial<ContexteFrappeVue> = {}) => raccourciFicheLot({ key, ...o }, { ...VUE, ...c })?.id ?? null;
const lot = (id: string) => RACCOURCIS.find((r) => r.id === id)!;

describe('Lot 13 bis · la portée « fiche-lot » · conflits et touches choisies', () => {
  it('C et T sont dans la table, portée « fiche-lot », gérées par la vue · aucun conflit', () => {
    expect(RACCOURCIS.filter((r) => r.portee === 'fiche-lot').map((r) => [r.id, r.touches])).toEqual([['lot-conclure', [['c']]], ['lot-iterer', [['t']]]]);
    expect(PORTEES_RACCOURCIS.find((p) => p.cle === 'fiche-lot')).toEqual({ cle: 'fiche-lot', libelle: 'Fiche d’un lot (Résultats)', globale: false });
    expect(conflitsRaccourcis(), 'la table a un conflit').toEqual([]);
    for (const r of RACCOURCIS.filter((x) => x.portee === 'fiche-lot')) {
      expect(r.action, r.id).toBeNull();
      expect(r.sources).toEqual(['vues/resultats/RaccourcisLot.tsx']);
      expect(exigeCoupure(r), `${r.id} · une lettre seule doit pouvoir se couper (WCAG 2.1.4)`).toBe(true);
      expect(sansTiretCadratin(r.libelle)).toBe(r.libelle);
    }
    expect(TOUCHES_RECENSEES['vues/resultats/RaccourcisLot.tsx']).toEqual(['c', 't']);
    expect(REGLES_CLAVIER.raccourciFicheLot).toEqual(['c', 't']);
  });

  it('la garde écarte I (Importer, global) et R (fin de « G puis R ») · pourquoi C et T', () => {
    // Une touche candidate pour la fiche d'un lot, seule de sa portée · contre tout le reste de la table.
    const avec = (t: string) => conflitsRaccourcis(RACCOURCIS.filter((r) => r.id !== 'lot-conclure').map((r) => (r.id === 'lot-iterer' ? { ...r, touches: [[t]] } : r)));
    expect(avec('i'), 'I ne heurte pas « Importer des résultats »').toContainEqual({ a: 'importer', b: 'lot-iterer', touches: 'i', raison: 'mêmes touches, portées « partout » et « fiche-lot »' });
    expect(avec('r'), 'R ne heurte pas « G puis R »').toContainEqual({ a: 'lot-iterer', b: 'aller-resultats', touches: 'r', raison: 'touche de vue qui termine une séquence de la coquille' });
    for (const t of ['n', 'j', '?', '[', 'g', 'a', 's', 'v', 'b', 'm']) expect(avec(t).length, `« ${t} » passe la garde`).toBeGreaterThan(0);
    for (const t of ['c', 't', 'e', 'x']) expect(avec(t), `« ${t} » refusée à tort`).toEqual([]);
    // La règle ajoutée ne voit rien dans la table d'avant (ni Échap, ni flèches, ni « / »).
    expect(conflitsRaccourcis(RACCOURCIS.filter((r) => r.portee !== 'fiche-lot'))).toEqual([]);
  });
});

describe('Lot 13 bis · la règle d’une vue · `raccourciFicheLot`', () => {
  it('C et T partent, en majuscule verrouillée aussi · la coquille ne les prend pas', () => {
    expect(idVue('c')).toBe('lot-conclure');
    expect(idVue('t')).toBe('lot-iterer');
    expect(idVue('C')).toBe('lot-conclure');
    expect(idVue('T')).toBe('lot-iterer');
    for (const k of ['c', 't']) expect(raccourciDeLaFrappe({ key: k }, { actifs: true, modaleOuverte: false, cible: { tagName: 'BODY' }, prefixe: null, maintenant: 0 }).raccourci, k).toBeNull();
  });
  it('jamais dans un champ, une zone éditable, un lecteur, sous une fenêtre modale, coupée par la préférence', () => {
    for (const cible of [{ tagName: 'INPUT' }, { tagName: 'TEXTAREA' }, { tagName: 'SELECT' }, { tagName: 'DIV', editable: true }, { tagName: 'BUTTON', dansLecteur: true }, { tagName: 'DIV', role: 'textbox' }]) {
      expect(idVue('c', {}, { cible }), JSON.stringify(cible)).toBeNull();
      expect(idVue('t', {}, { cible }), JSON.stringify(cible)).toBeNull();
    }
    expect(idVue('c', {}, { modaleOuverte: true })).toBeNull();
    expect(idVue('t', {}, { actifs: false })).toBeNull();
    expect(idVue('c', {}, { actifs: false })).toBeNull();
  });
  it('jamais avec un modificateur (Ctrl C copie, ⌘ T, Alt, Maj), ni une répétition, ni une frappe déjà prise', () => {
    expect(idVue('c', { ctrlKey: true }), 'Ctrl C · copier').toBeNull();
    expect(idVue('c', { metaKey: true })).toBeNull();
    expect(idVue('t', { metaKey: true }), '⌘ T · nouvel onglet').toBeNull();
    expect(idVue('t', { altKey: true })).toBeNull();
    expect(idVue('C', { shiftKey: true })).toBeNull();
    expect(idVue('c', { repetee: true })).toBeNull();
    expect(idVue('c', { dejaTraitee: true })).toBeNull();
    expect(idVue('i'), 'I reste à la coquille').toBeNull();
  });
  it('une vue ne lit que SA portée · et une entrée « sur le focus » n’est pas coupée', () => {
    expect(raccourciDeVue({ key: 'c' }, VUE, 'veille-detail')).toBeNull();
    expect(raccourciDeVue({ key: '/' }, VUE, 'ce-qui-scale')?.id).toBe('scale-recherche');
    expect(raccourciDeVue({ key: '/' }, { ...VUE, actifs: false }, 'ce-qui-scale')).toBeNull();
    expect(raccourciDeVue({ key: '+' }, { ...VUE, actifs: false }, 'canvas')?.id, 'le canvas agit sur le focus · pas coupé').toBe('canvas-zoom-plus');
  });
  it('le message d’un geste fermé · le libellé de la table, puis la raison', () => {
    expect(messageRaccourciFerme(lot('lot-iterer'), RAISON_GESTE_SANS_GAGNANTE_LOT)).toBe(`Itérer depuis la gagnante du lot (écran Itérer, pré-rempli · lot conclu · le même geste que le bouton de sa gagnante, fermé pour les mêmes raisons) · ${RAISON_GESTE_SANS_GAGNANTE_LOT}`);
  });
});

/* ───────────── ce que C et T ouvrent ───────────── */

const ID = (n: number) => `0000000${n}-0000-4000-8000-000000000000`;
const ad = (n: number, v: Partial<NonNullable<FaitsAdSpatial['verdict']>> | null): FaitsAdSpatial => ({
  id: ID(n), variante: `V${n}`, statut: 'done', hypothese: null, variable: null, plateforme: 'meta', texte: null, image: null, manques: [],
  verdict: v ? { statut: 'validated', calcule: 'winner', retenu: 'winner', comparable: true, raison: null, ...v } as NonNullable<FaitsAdSpatial['verdict']> : null,
});

describe('Lot 13 bis · `gestesClavierLot` · la règle des gestes, rien de plus', () => {
  it('C · ouverte seulement quand un verdict attend d’être arbitré dans un lot arbitrable', () => {
    const attend = ad(1, { statut: 'computed', retenu: null });
    expect(gestesClavierLot({ etat: 'a_conclure', ads: [attend], planIds: new Set() }).conclure).toEqual({ href: `#${ANCRE_CONCLURE_LOT}`, raison: null });
    expect(gestesClavierLot({ etat: 'non_concluant', ads: [attend], planIds: new Set() }).conclure.href).toBe('#conclure');
    // Un lot conclu · rien n'attend (chaque verdict est arbitré, ou plus rien ne se mesure ni ne se tranche) · la seule raison qui le dise.
    expect(gestesClavierLot({ etat: 'conclu', ads: [ad(1, {})], planIds: new Set() }).conclure, 'conclu').toEqual({ href: null, raison: RAISON_GESTE_RIEN_A_CONCLURE });
    // Un brouillon, un historique, un lot en diffusion, un lot dont des mesures manquent · l'ÉTAT dit pourquoi · « aucun verdict
    // n'attend » serait faux · `attend` y est rangée (un verdict calculé attend, le lot ne s'arbitre pas encore).
    for (const [etat, raison] of [
      ['composition', RAISON_CONCLURE_NON_LANCE], ['pret', RAISON_CONCLURE_NON_LANCE], ['importe', RAISON_CONCLURE_HISTORIQUE],
      ['diffusion', RAISON_CONCLURE_EN_DIFFUSION], ['a_importer', RAISON_CONCLURE_MESURES_MANQUANTES],
    ] as const) {
      expect(gestesClavierLot({ etat, ads: [attend], planIds: new Set() }).conclure, `fiche · ${etat}`).toEqual({ href: null, raison });
      const j = gestesContexteJarvis({ type: 'lot', id: ID(9), ads: [attend], lot: { id: ID(9), etat, ads: [attend] } })!;
      expect([j.conclure.cible, j.conclure.raison], `Jarvis · ${etat} · la même raison que la fiche`).toEqual([null, raison]);
    }
    expect(gestesClavierLot({ etat: 'a_conclure', ads: [ad(1, {})], planIds: new Set() }).conclure, 'tout est arbitré').toEqual({ href: null, raison: RAISON_GESTE_RIEN_A_CONCLURE });
  });
  it('C · « Aucun verdict n’attend » n’est JAMAIS dit d’un lot où un verdict calculé attend · chaque état, tiré des FAITS', () => {
    // Le scénario de la relecture · lancé, fenêtre écoulée · V1 calculée gagnante qui attend, V2 sans mesure · « Mesures à importer ».
    const ctx = { maintenant: new Date('2020-02-01T12:00:00Z'), fenetreJours: 7 };
    const v1 = { verdict: { statut: 'computed' as const, calcule: 'winner' as const, calculeLe: '2020-01-20T03:00:00Z' } };
    const lance = (lanceLe: string, ads: ReadonlyArray<typeof v1 | { verdict: null }>) => etatLotSpatial({ statut: 'testing', lanceLe, ads }, ctx);
    expect(lance('2020-01-06T09:00:00Z', [v1, { verdict: null }]), 'préalable · des mesures manquent').toBe('a_importer');
    expect(raisonConclureFerme('a_importer'), 'Mesures à importer · la raison de l’état').toBe(RAISON_CONCLURE_MESURES_MANQUANTES);
    expect(lance('2020-01-30T09:00:00Z', [v1, { verdict: null }]), 'préalable · la fenêtre court').toBe('diffusion');
    expect(raisonConclureFerme('diffusion'), 'En diffusion · la raison de l’état').toBe(RAISON_CONCLURE_EN_DIFFUSION);
    // La règle, sur les FAITS · chaque statut, chaque lancement, chaque paire de verdicts · l'état vient de `etatLotSpatial` ·
    // fermé alors qu'un verdict calculé attend, la raison n'est jamais « aucun verdict n'attend ».
    type V = { verdict: { statut: 'computed' | 'validated'; calcule: 'winner' | 'inconclusive' | null; calculeLe: string } | null };
    const verdicts: V[] = [
      v1, { verdict: { statut: 'computed', calcule: 'inconclusive', calculeLe: '2020-01-20T03:00:00Z' } },
      { verdict: { statut: 'computed', calcule: 'winner', calculeLe: '2020-01-08T03:00:00Z' } }, // mesure arrêtée avant la fin de la fenêtre
      { verdict: { statut: 'validated', calcule: 'winner', calculeLe: '2020-01-20T03:00:00Z' } },
      { verdict: { statut: 'computed', calcule: null, calculeLe: '2020-01-20T03:00:00Z' } }, { verdict: null },
    ];
    const fermesQuiAttendent = new Map<EtatLotSpatial, number>();
    for (const statut of ['planned', 'in_production', 'ready', 'testing', 'analyzed']) {
      for (const lanceLe of [null, '2020-01-06T09:00:00Z', '2020-01-30T09:00:00Z']) {
        for (const a of verdicts) for (const b of verdicts) {
          const ads = [a, b];
          const etat = etatLotSpatial({ statut, lanceLe, ads }, ctx);
          if (!ads.some(attendArbitrage) || lotConcluable(etat, ads)) continue;
          fermesQuiAttendent.set(etat, (fermesQuiAttendent.get(etat) ?? 0) + 1);
          expect(raisonConclureFerme(etat), `${statut} · ${lanceLe} · ${JSON.stringify(ads)} · ${etat} · fermé, un verdict calculé attend`).not.toBe(RAISON_GESTE_RIEN_A_CONCLURE);
        }
      }
    }
    expect([...fermesQuiAttendent.keys()].sort(), 'préalable · les états fermés où un verdict calculé attend').toEqual(['a_importer', 'composition', 'diffusion', 'importe', 'pret']);
    expect(raisonConclureFerme('illisible'), 'lu en partie · rien n’est tiré du contenu').toBe(RAISON_GESTE_LECTURE_INCOMPLETE);
    for (const r of [RAISON_CONCLURE_EN_DIFFUSION, RAISON_CONCLURE_MESURES_MANQUANTES]) {
      expect(sansTiretCadratin(r)).toBe(r);
      expect(r, 'une raison d’état ne parle pas des verdicts comme s’ils étaient lus').not.toMatch(/aucun verdict/i);
    }
  });
  it('T · la gagnante ARBITRÉE du lot que le plan propose · celle du verdict d’abord · sinon la raison', () => {
    const g1 = ad(1, {}); const g2 = ad(2, {}); const perdante = ad(3, { calcule: 'loser', retenu: 'loser' }); const calculee = ad(4, { statut: 'computed' });
    const plan = new Set([ID(1), ID(2), ID(3), ID(4)]);
    expect(gestesClavierLot({ etat: 'conclu', ads: [g1, g2], planIds: plan }).iterer).toEqual({ href: lienIterationVariable({ adId: ID(1) }), adId: ID(1), raison: null });
    expect(gestesClavierLot({ etat: 'conclu', ads: [g1, g2], gagnante: ID(2), planIds: plan }).iterer.adId, 'la gagnante du verdict d’abord').toBe(ID(2));
    expect(gestesClavierLot({ etat: 'conclu', ads: [g1, g2], planIds: new Set([ID(2)]) }).iterer.adId, 'hors plan, on passe à la suivante').toBe(ID(2));
    expect(gestesClavierLot({ etat: 'conclu', ads: [g1], gagnante: ID(9), planIds: plan }).iterer.adId, 'une gagnante annoncée hors lot ne compte pas').toBe(ID(1));
    expect(gestesClavierLot({ etat: 'conclu', ads: [g1], planIds: new Set() }).iterer).toEqual({ href: null, adId: null, raison: RAISON_ITERER_HORS_PLAN_LOT });
    expect(gestesClavierLot({ etat: 'conclu', ads: [perdante, calculee], planIds: plan }).iterer, 'perdante, ou gagnante pas arbitrée').toEqual({ href: null, adId: null, raison: RAISON_GESTE_SANS_GAGNANTE_LOT });
    expect(gestesClavierLot({ etat: 'conclu', ads: [ad(5, { comparable: false })], planIds: new Set([ID(5)]) }).iterer.href, 'non comparable').toBeNull();
    expect(lienIterationVariable({ adId: ID(1) })).toBe(`/studio/iterer?iter=${ID(1)}`);
  });
});

/* ───────────── l'aide filtrée (D16) et l'astuce (G29) ───────────── */

describe('Lot 13 bis · l’aide d’un projet, filtrée par la règle du noyau', () => {
  it('seulement fenêtres, éditeur, canvas, mentions · toujours dans l’ordre de l’aide · chaque entrée de ces portées, et aucune autre', () => {
    expect(PORTEES_AIDE_PROJET).toEqual(['fenetres', 'editeur', 'canvas', 'mentions']);
    const g = groupesAideRaccourcis(undefined, false, [...PORTEES_AIDE_PROJET].reverse());
    expect(g.map((x) => x.portee)).toEqual(['fenetres', 'editeur', 'canvas', 'mentions']);
    expect(g.flatMap((x) => x.lignes.map((l) => l.id))).toEqual(RACCOURCIS.filter((r) => PORTEES_AIDE_PROJET.includes(r.portee)).sort((a, b) => PORTEES_AIDE_PROJET.indexOf(a.portee) - PORTEES_AIDE_PROJET.indexOf(b.portee)).map((r) => r.id));
    expect(groupesAideRaccourcis(undefined, false, null).length, 'sans filtre, l’aide entière').toBe(PORTEES_RACCOURCIS.length);
    expect(groupesAideRaccourcis().find((x) => x.portee === 'fiche-lot')?.lignes.map((l) => [l.id, l.sequences]), 'l’aide entière dit C et T').toEqual([['lot-conclure', [[['C']]]], ['lot-iterer', [[['T']]]]]);
  });
  it('la phrase de l’aide filtrée nomme les portées montrées, sans tiret cadratin', () => {
    const t = libelleAideFiltree(PORTEES_AIDE_PROJET);
    expect(t).toBe('Raccourcis du projet · fenêtres, panneaux et menus · éditeur de créa · canvas du projet · mentions dans un commentaire ou une note. Ceux de toute l’application sont dans l’aide complète.');
    expect(sansTiretCadratin(t)).toBe(t);
  });
});

describe('Lot 13 bis · l’astuce de l’Accueil lit la table et la préférence', () => {
  it('actifs · la touche de l’aide, depuis la table · coupés · aucune touche, le bouton', () => {
    expect(astuceRaccourcisAccueil(true)).toEqual({ avant: 'Astuce · tape', touche: '?', apres: 'hors d’un champ pour voir tous les raccourcis clavier.' });
    const autre: Raccourci[] = RACCOURCIS.map((r) => (r.id === 'aide' ? { ...r, touches: [['h']] } : r));
    expect(astuceRaccourcisAccueil(true, autre).touche, 'la touche n’est pas lue dans la table').toBe('H');
    const coupe = astuceRaccourcisAccueil(false);
    expect(coupe.touche).toBeNull();
    expect(coupe.avant).toContain('coupés');
    for (const x of [astuceRaccourcisAccueil(true), coupe]) expect(sansTiretCadratin(x.avant + x.apres)).toBe(x.avant + x.apres);
  });
});
