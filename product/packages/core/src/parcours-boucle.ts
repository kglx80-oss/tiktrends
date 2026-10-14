import { CHEMIN_PROJETS } from './studios/anciennes-adresses';
import { dateCourteUtc } from './studios/brief';
import { estLotImporte, type FaitsLot } from './adsmap/lot-nature';

/**
 * La boucle créative, rendue lisible (UX V2 · lot 4a · maquette § 7). Pur ·
 * ni base, ni réseau, ni modèle.
 *
 * Deux parcours, avec ce qui EXISTE réellement :
 *  · Veille · source → analyse → projet ;
 *  · Résultats · hypothèse → lot → mesures → apprentissage.
 *
 * ── Ce que la maquette impose, et ce qu'on refuse d'en prendre ───────────────
 *
 * « Hypothèse ≠ observation ≠ résultat mesuré » · chaque étape porte sa NATURE,
 * dite à l'écran. Une annonce de Veille est une observation (un signal public,
 * pas une preuve), un projet porte une hypothèse (à vérifier), un lot organise
 * (pas encore un résultat), seule une mesure de diffusion réelle est un
 * résultat, et un apprentissage est une conclusion arbitrée.
 *
 * Les exemples de la maquette (« Accroche directe ou question ? », variantes A
 * et B) ne sont JAMAIS repris · chaque étape lit des comptes réels, et une étape
 * sans donnée le dit avec le chemin qui la remplit. Aucun « gagnant » n'est
 * annoncé · un verdict calculé n'est pas conclu tant qu'il n'est pas arbitré.
 *
 * ── Les droits ───────────────────────────────────────────────────────────────
 *
 * Lots, import et Radar de veille sont réservés aux admins (`roleAtLeast
 * admin` dans leurs pages) · un état vide ne propose jamais à un membre un lien
 * qui le renverrait en arrière. Il lui dit qui peut agir.
 */

export type NatureEtape = 'observation' | 'hypothese' | 'organisation' | 'mesure' | 'apprentissage';

/** Le libellé de nature affiché sur chaque étape · une seule source. */
export const LIBELLE_NATURE: Record<NatureEtape, string> = {
  observation: 'Observation · un signal, pas une preuve',
  hypothese: 'Hypothèse · à vérifier',
  organisation: 'Organisation · pas encore un résultat',
  mesure: 'Résultat mesuré',
  apprentissage: 'Apprentissage · conclusion arbitrée',
};

export interface LienEtape { libelle: string; href: string }

export interface EtapeParcours {
  cle: string;
  numero: number;
  titre: string;
  nature: NatureEtape;
  /** Ce qu'est l'étape, en une phrase · toujours affichée. */
  aide: string;
  /**
   * Ce que disent les données · `atteinte` quand elles existent, sinon l'état
   * vide (et pourquoi). `null` quand l'écran ne SAIT pas · on ne devine pas.
   */
  etat: { atteinte: boolean; texte: string } | null;
  liens: LienEtape[];
}

const pl = (n: number, un: string, plusieurs: string) => `${n} ${n > 1 ? plusieurs : un}`;

/* ─────────────────────────────── Veille ──────────────────────────────────── */

export const ANCRE_LECTURE_MARCHE = '#lecture-marche';

export interface EntreeParcoursVeille {
  /** Annonces réellement affichées dans la grille. */
  annonces: number;
  /** Échantillon de démonstration (aucune source branchée). */
  demo: boolean;
  /** La source a répondu une erreur. */
  erreur: boolean;
  /** Annonces sauvegardées dans la portée (marque active, sinon espace) · null si inconnu (pas de base). */
  sauvegardes: number | null;
  /** La « Lecture du marché » de Jarvis peut se rendre (offre Plus + marque active). */
  marcheDispo: boolean;
}

export function parcoursVeille(e: EntreeParcoursVeille): EtapeParcours[] {
  const n = Math.max(0, e.annonces | 0);
  const sauv = e.sauvegardes == null ? null : Math.max(0, e.sauvegardes | 0);
  const morceauxSource: string[] = [];
  if (n > 0) morceauxSource.push(e.demo ? `${pl(n, 'annonce', 'annonces')} d’échantillon (démonstration)` : pl(n, 'annonce affichée', 'annonces affichées'));
  if (sauv != null && sauv > 0) morceauxSource.push(pl(sauv, 'sauvegardée, source conservée', 'sauvegardées, source conservée'));
  const source: EtapeParcours = {
    cle: 'source', numero: 1, titre: 'Source', nature: 'observation',
    aide: 'Cherche un mot-clé ou un domaine · ★ garde l’annonce et sa source.',
    etat: n > 0 || (sauv ?? 0) > 0
      ? { atteinte: true, texte: morceauxSource.join(' · ') }
      : { atteinte: false, texte: e.erreur ? 'La source ne répond pas pour l’instant · aucune annonce affichée.' : 'Aucune annonce affichée · lance une recherche ci-dessous.' },
    liens: [],
  };
  const analyse: EtapeParcours = {
    cle: 'analyse', numero: 2, titre: 'Analyse', nature: 'observation',
    aide: 'Durée, portée, annonces du même annonceur · des signaux, pas une preuve de rentabilité.',
    etat: n > 0
      ? { atteinte: true, texte: 'Signaux et liens vers la source sur chaque carte.' }
      : { atteinte: false, texte: 'Rien à analyser tant qu’aucune annonce n’est affichée.' },
    liens: e.marcheDispo ? [{ libelle: 'Lecture du marché ↓', href: ANCRE_LECTURE_MARCHE }] : [],
  };
  // On ne sait pas ici combien de projets sont nés de la Veille · pas d'état
  // inventé. Le geste vit sur chaque carte, le projet atterrit dans Studios.
  const projet: EtapeParcours = {
    cle: 'projet', numero: 3, titre: 'Projet', nature: 'hypothese',
    aide: '« Préparer une création » sur une carte prépare un projet Studios, source reprise · ton hypothèse reste à vérifier.',
    etat: null,
    liens: [{ libelle: 'Mes projets', href: CHEMIN_PROJETS }],
  };
  return [source, analyse, projet];
}

/* ────────────────────────────── Résultats ────────────────────────────────── */

export const CHEMIN_LOTS = '/adsmap/lots';
export const CHEMIN_IMPORT_RESULTATS = '/adsmap/import';
export const CHEMIN_SUITES = '/adsmap/suites';
export const CHEMIN_PROTOCOLE = '/adsmap/protocole';
export const CHEMIN_RADAR_VEILLE = '/adsmap/radar';
/** Les tests de la page (« À décider », Table, Carte) · ancre posée sur /adsmap. */
export const ANCRE_TESTS = '#tests';
/** Le cumul de Jarvis (`SectionEssais`) · ancre existante. */
export const ANCRE_APPRIS = '#appris';

export interface CompteBoucle {
  /** Ads (tests) de la marque active. */
  tests: number;
  /** Dont l'hypothèse est écrite (non vide). */
  avecHypothese: number;
  lots: number;
  /** Lots lancés DANS l'outil (datés de lancement, ou en test) · `compterLots`. */
  lotsLances: number;
  /** Lots repris d'un tableur (analysés sans lancement ici · `natureLot`). */
  lotsImportes: number;
  /** Tests dont un verdict a été CALCULÉ sur des chiffres de diffusion. */
  mesures: number;
  /** Verdicts calculés, pas encore arbitrés. */
  aArbitrer: number;
  /** Verdicts arbitrés (calculés puis validés, ou importés du tableur). */
  arbitres: number;
  /** Apprentissages validés. */
  apprentissages: number;
  /** Dernière mesure de la marque (ISO) · null si jamais mesurée. */
  derniereMesure: string | null;
}

export interface ParcoursResultats {
  etapes: EtapeParcours[];
  /** La première étape sans donnée · null quand chaque étape en a. */
  prochaine: string | null;
  /** Dit quand AUCUN résultat n'est mesuré · rien n'est alors conclu. */
  avertissement: string | null;
}

const UN_ADMIN = 'Un admin de l’espace';

/**
 * Les lots, comptés par leurs FAITS (`natureLot`) · un lot « analysé » sans
 * date de lancement est un import, pas un lot lancé ici · le compter « lancé »
 * dirait qu'on l'a diffusé.
 */
export function compterLots(lots: readonly FaitsLot[]): { lots: number; lotsLances: number; lotsImportes: number } {
  let lotsLances = 0, lotsImportes = 0;
  for (const l of lots) {
    if (estLotImporte(l)) lotsImportes++;
    else if (l.launchedAt != null || l.status === 'testing' || l.status === 'analyzed') lotsLances++;
  }
  return { lots: lots.length, lotsLances, lotsImportes };
}

export function parcoursResultats(c: CompteBoucle, o: { peutAgir: boolean }): ParcoursResultats {
  const k = (v: number) => Math.max(0, v | 0);
  const tests = k(c.tests), avecH = Math.min(k(c.avecHypothese), tests);
  const lots = k(c.lots), lances = Math.min(k(c.lotsLances), lots), importes = Math.min(k(c.lotsImportes), lots - lances);
  const mesures = k(c.mesures), aArbitrer = k(c.aArbitrer), arbitres = k(c.arbitres), appris = k(c.apprentissages);
  const admin = o.peutAgir;

  // 1 · Hypothèse
  let hypothese: EtapeParcours['etat'];
  let liensH: LienEtape[] = [];
  if (avecH > 0) {
    const sans = tests - avecH;
    hypothese = { atteinte: true, texte: `${pl(avecH, 'test porte', 'tests portent')} une hypothèse écrite${sans > 0 ? ` · ${pl(sans, 'test', 'tests')} sans hypothèse` : ''}.` };
    liensH = [{ libelle: 'Voir les tests', href: ANCRE_TESTS }];
  } else if (tests > 0) {
    hypothese = { atteinte: false, texte: `${pl(tests, 'test', 'tests')}, aucun avec hypothèse écrite · son résultat ne s’attribuera à rien tant qu’elle manque.${admin ? '' : ` ${UN_ADMIN} la complète en préparant le lot.`}` };
    liensH = admin ? [{ libelle: 'Préparer le lot · ce qui manque', href: CHEMIN_LOTS }] : [];
  } else {
    hypothese = { atteinte: false, texte: `Aucun test pour l’instant · un test entre avec ce que tu veux vérifier (une créa repérée, une suite d’un test arbitré, ou ton tableau importé).${admin ? '' : ` ${UN_ADMIN} les fait entrer.`}` };
    liensH = admin ? [{ libelle: 'Radar de veille', href: CHEMIN_RADAR_VEILLE }, { libelle: 'Importer ton tableau', href: CHEMIN_IMPORT_RESULTATS }] : [];
  }

  // 2 · Lot
  const lot: EtapeParcours['etat'] = lots > 0
    ? { atteinte: true, texte: `${pl(lots, 'lot', 'lots')} · ${pl(lances, 'lancé', 'lancés')}${importes > 0 ? ` · ${pl(importes, 'importé', 'importés')}` : ''}${lances === 0 ? ' · aucun encore lancé ici' : ''}.` }
    : { atteinte: false, texte: `Aucun lot · un lot rassemble les variantes à comparer sous un même protocole.${admin ? '' : ` ${UN_ADMIN} prépare les lots.`}` };
  const liensL: LienEtape[] = admin
    ? [{ libelle: lots > 0 ? 'Ouvrir les lots' : 'Préparer un lot', href: CHEMIN_LOTS }, { libelle: 'Protocole', href: CHEMIN_PROTOCOLE }]
    : [{ libelle: 'Lire le protocole', href: CHEMIN_PROTOCOLE }];

  // 3 · Mesures · jamais un gagnant annoncé ici
  let mesure: EtapeParcours['etat'];
  let liensM: LienEtape[] = [];
  if (mesures > 0 || arbitres > 0) {
    const m: string[] = [];
    if (mesures > 0) m.push(`${pl(mesures, 'test mesuré', 'tests mesurés')} sur la diffusion réelle`);
    m.push(arbitres > 0 ? pl(arbitres, 'verdict arbitré', 'verdicts arbitrés') : 'aucun verdict arbitré · calculé n’est pas conclu');
    const date = dateCourteUtc(c.derniereMesure);
    if (date) m.push(`dernière mesure le ${date}`);
    mesure = { atteinte: true, texte: m.join(' · ') + '.' };
    // Arbitrer se fait dans la fiche du test (Table ou Carte) · « À décider »
    // est une file calculée à part, on ne lui prête pas ces verdicts.
    if (aArbitrer > 0) liensM = [{ libelle: `Ouvrir les tests · ${aArbitrer} à arbitrer`, href: ANCRE_TESTS }];
  } else {
    mesure = { atteinte: false, texte: `Aucune mesure rattachée · un verdict se calcule sur les chiffres réels de diffusion. Rien n’est gagnant ni perdant tant que rien n’est mesuré.${admin ? ' « Mesurer maintenant » relit le compte publicitaire connecté.' : ` ${UN_ADMIN} lance la mesure.`}` };
    liensM = admin ? [{ libelle: 'Importer des résultats', href: CHEMIN_IMPORT_RESULTATS }] : [];
  }

  // 4 · Apprentissage
  let apprentissage: EtapeParcours['etat'];
  const liensA: LienEtape[] = [];
  if (appris > 0) {
    apprentissage = { atteinte: true, texte: `${pl(appris, 'apprentissage validé', 'apprentissages validés')}, chacun rattaché au test d’où il vient.` };
    liensA.push({ libelle: 'Préparer la suite', href: CHEMIN_SUITES });
  } else if (arbitres > 0) {
    apprentissage = { atteinte: false, texte: `${pl(arbitres, 'verdict arbitré', 'verdicts arbitrés')}, aucun apprentissage validé · il s’écrit à l’arbitrage, dans la fiche du test.` };
    liensA.push({ libelle: 'Voir les suites', href: CHEMIN_SUITES });
  } else {
    apprentissage = { atteinte: false, texte: 'Pas encore de conclusion · un apprentissage naît d’un verdict arbitré, avec son chiffre et ses limites.' };
  }
  liensA.push({ libelle: 'Ce que Jarvis a appris ↓', href: ANCRE_APPRIS });

  const etapes: EtapeParcours[] = [
    { cle: 'hypothese', numero: 1, titre: 'Hypothèse', nature: 'hypothese', aide: 'Ce que tu veux vérifier, écrit avant le test.', etat: hypothese, liens: liensH },
    { cle: 'lot', numero: 2, titre: 'Lot', nature: 'organisation', aide: 'Les variantes à comparer, même audience, même période, même budget.', etat: lot, liens: liensL },
    { cle: 'mesures', numero: 3, titre: 'Mesures', nature: 'mesure', aide: 'Les chiffres de diffusion rattachés, et leur date.', etat: mesure, liens: liensM },
    { cle: 'apprentissage', numero: 4, titre: 'Apprentissage', nature: 'apprentissage', aide: 'Ce que le test a appris, avec sa provenance · la base de la prochaine itération.', etat: apprentissage, liens: liensA },
  ];
  const prochaine = etapes.find((e) => e.etat && !e.etat.atteinte)?.cle ?? null;
  const avertissement = mesures === 0 && arbitres === 0
    ? 'Aucun résultat mesuré pour cette marque · les propositions (Jarvis, Radar, Studios) restent des hypothèses jusqu’à la mesure.'
    : null;
  return { etapes, prochaine, avertissement };
}
