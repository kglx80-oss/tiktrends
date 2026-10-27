/**
 * Spatial · l'Accueil (`vAccueil` de la maquette) sur les VRAIES données.
 * Pur · ni base, ni réseau · l'horloge est passée par l'appelant.
 *
 * Chaque bloc de la maquette reçoit ici sa règle · ce qui a le droit d'être
 * affiché, avec quels mots, vers quelle adresse. Une source fermée ou absente
 * se tait (bloc absent, ou état vide qui le dit) · aucun chiffre de la maquette
 * (« lot #1 », « 5 nouvelles créas », « 6 visuels prêts »…) n'est repris.
 *
 * Les règles de l'Accueil V5 restent la référence (`accueil-v5`, `onboarding`,
 * `parcours-boucle`) · ce module ne fait que les traduire dans la mise en page
 * Spatial, sans recalculer ce qu'elles décident déjà.
 */

import { surtitreAccueil, type CarteIterationAccueil, type PhraseAttente } from '../../accueil-v5';
import type { Journey, JourneyStep } from '../../onboarding';
import { CHEMIN_IMPORT_RESULTATS, CHEMIN_LOTS, CHEMIN_SUITES, ANCRE_TESTS } from '../../parcours-boucle';
import { lienLotApercu } from '../../adsmap/apercu-lots';
import { FORMATS_CREATIFS, FORMAT_AUTRE } from '../../formats-creatifs';
import { depuisRelatif, jourCourt, jourIso, joursEntre } from './temps';

const JOUR = 86_400_000;
const pl = (n: number, un: string, plusieurs: string) => `${n} ${n > 1 ? plusieurs : un}`;
const liste = (xs: readonly string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} et ${xs[xs.length - 1]}`);

/** Le chemin des Résultats · la boucle s'y ouvre (pas encore d'écran « boucle » dédié). */
export const CHEMIN_BOUCLE_ACCUEIL = '/adsmap';

/* ───────────────────────────── En-tête ───────────────────────────── */

/** « Mercredi 22 octobre · Neva » · la date du jour (Paris) et la marque active, majuscule initiale comme la maquette. */
export function surtitreSpatialAccueil(p: { maintenant: Date; marque: string | null; fuseau?: string }): string {
  const s = surtitreAccueil(p);
  return s.charAt(0).toLocaleUpperCase('fr-FR') + s.slice(1);
}

/** « Bonjour Kevin » · le prénom réel, sinon « Bonjour ». */
export function salutationAccueil(nom: string | null | undefined): string {
  const prenom = (nom ?? '').trim().split(/\s+/)[0];
  return prenom ? `Bonjour ${prenom}` : 'Bonjour';
}

/**
 * La phrase sous les raccourcis (`p.lead2`) · « 2 choses t'attendent : 1
 * gagnante à itérer et 5 nouvelles pubs chez tes concurrents suivis. ».
 * `null` quand aucune source n'a été lue (`chosesQuiAttendent` rend `null`).
 */
export function ligneAttente(phrase: PhraseAttente | null): string | null {
  if (!phrase) return null;
  if (phrase.total === 0 || phrase.elements.length === 0) return phrase.tete;
  return `${phrase.tete} : ${liste(phrase.elements.map((e) => e.texte))}.`;
}

/* ───────────────────────────── Raccourcis ───────────────────────────── */

export interface RaccourciAccueil {
  cle: 'nouveau' | 'formats' | 'forfaits' | 'importer' | 'fiche';
  icone: string;
  titre: string;
  sous: string;
  href: string;
  /** La pastille de la maquette (`qbadge`) · seulement sur la fiche marque, quand il y manque quelque chose. */
  pastille: { valeur: string; titre: string } | null;
}

/** Les formats du catalogue normatif · « Autre » n'est pas un format à explorer. */
export const NB_FORMATS_VEILLE = FORMATS_CREATIFS.filter((f) => f.id !== FORMAT_AUTRE).length;

/**
 * Les cinq raccourcis de la maquette, chacun SEULEMENT si le droit l'ouvre
 * (rôle ET offre · l'appelant passe la décision de la matrice). La fiche marque
 * dit ce qui y manque réellement (`completudeFicheMarque`).
 */
export function raccourcisAccueil(p: {
  nouveauProjet: string | null;
  formats: boolean;
  forfaits: boolean;
  importer: boolean;
  fiche: { href: string; manques: readonly string[] } | null;
}): RaccourciAccueil[] {
  const out: RaccourciAccueil[] = [];
  if (p.nouveauProjet) out.push({ cle: 'nouveau', icone: 'brush', titre: 'Nouveau projet', sous: 'Brief → création, étape par étape', href: p.nouveauProjet, pastille: null });
  if (p.formats) out.push({ cle: 'formats', icone: 'eye', titre: 'Formats & Veille', sous: `${NB_FORMATS_VEILLE} formats, concurrents`, href: '/veille/formats', pastille: null });
  if (p.forfaits) out.push({ cle: 'forfaits', icone: 'spark', titre: 'Forfaits & crédits', sous: 'Recharger, changer de plan', href: '/billing', pastille: null });
  if (p.importer) out.push({ cle: 'importer', icone: 'down', titre: 'Importer des résultats', sous: 'Relier les mesures aux créas', href: CHEMIN_IMPORT_RESULTATS, pastille: null });
  if (p.fiche) {
    const n = p.fiche.manques.length;
    out.push({
      cle: 'fiche', icone: 'tag', titre: 'Fiche marque', href: p.fiche.href,
      sous: n === 0 ? 'Complète · identité, offre, audiences' : `${pl(n, 'élément', 'éléments')} à compléter`,
      pastille: n > 0 ? { valeur: String(n), titre: `${pl(n, 'élément', 'éléments')} de la fiche à compléter` } : null,
    });
  }
  return out;
}

/* ───────────────────────────── Lots ───────────────────────────── */

/** Un lot de la marque active, tel que la base le porte (`adsmap_batches`). */
export interface LotAccueil {
  id: string;
  numero: number;
  statut: string;
  but: string | null;
  lanceLe: string | null;
  finPrevue: string | null;
  variantes: number;
  /** Le média réel d'une variante (créa ou asset) · `null` sans média. */
  vignette: string | null;
}

const temps = (iso: string | null) => (iso ? Date.parse(iso) : NaN);

/**
 * Les lots À CONCLURE · en diffusion (`testing`) et dont la fin prévue est
 * passée. Un lot sans fin prévue n'est jamais déclaré « à conclure » · on ne
 * devine pas la durée d'un protocole. Le plus ancien d'abord.
 */
export function lotsAConclure(lots: readonly LotAccueil[], maintenant: Date): LotAccueil[] {
  return lots
    .filter((l) => l.statut === 'testing' && Number.isFinite(temps(l.finPrevue)) && temps(l.finPrevue) <= maintenant.getTime())
    .sort((a, b) => temps(a.finPrevue) - temps(b.finPrevue));
}

/** Les jours écoulés depuis le lancement (0 sans date). */
export function joursEcoules(lanceLe: string | null, maintenant: Date): number {
  const t = temps(lanceLe);
  return Number.isFinite(t) ? Math.max(0, Math.floor((maintenant.getTime() - t) / JOUR)) : 0;
}

/* ───────────────────────────── « À faire maintenant » ───────────────────────────── */

export interface AFaireMaintenant { titre: string; detail: string; action: string; href: string }

/**
 * La barre « À faire maintenant » (`a.tile.nowbar`) · UNE action, la plus
 * urgente parmi celles qui existent réellement, dans cet ordre :
 *  1. un lot dont la période est écoulée · le conclure ;
 *  2. des verdicts calculés à arbitrer ;
 *  3. une gagnante prouvée à itérer ;
 *  4. la prochaine étape de configuration (`journey.next`).
 * `null` quand rien de tout cela n'existe · la barre est alors absente.
 */
export function aFaireMaintenant(p: {
  lotsAConclure: readonly LotAccueil[];
  /** `null` quand Résultats est fermé au rôle ou illisible. */
  aArbitrer: number | null;
  iteration: { titre: string; href: string } | null;
  etape: { libelle: string; pourquoi: string; href: string } | null;
  maintenant: Date;
  /** Les lots s'ouvrent aux admins · sinon le lien mène aux tests. */
  lotsOuverts: boolean;
}): AFaireMaintenant | null {
  const lot = p.lotsAConclure[0];
  if (lot) {
    const j = joursEcoules(lot.lanceLe, p.maintenant);
    const morceaux = [j > 0 ? `${pl(j, 'jour écoulé', 'jours écoulés')}` : null, lot.variantes > 0 ? pl(lot.variantes, 'variante', 'variantes') : null, lot.finPrevue ? `fin prévue le ${jourCourt(lot.finPrevue.slice(0, 10))}` : null];
    return {
      titre: `À faire maintenant : conclure le lot #${lot.numero}`,
      detail: morceaux.filter(Boolean).join(' · '),
      action: 'Conclure le lot',
      href: p.lotsOuverts ? lienLotApercu(lot.id) : `${CHEMIN_BOUCLE_ACCUEIL}${ANCRE_TESTS}`,
    };
  }
  if (p.aArbitrer && p.aArbitrer > 0) {
    return {
      titre: `À faire maintenant : arbitrer ${pl(p.aArbitrer, 'verdict', 'verdicts')}`,
      detail: 'Calculés sur la diffusion réelle · un verdict calculé n’est conclu qu’une fois arbitré',
      action: 'Arbitrer',
      href: `${CHEMIN_BOUCLE_ACCUEIL}${ANCRE_TESTS}`,
    };
  }
  if (p.iteration) {
    return {
      titre: `Prochaine étape : itérer sur ${p.iteration.titre}`,
      detail: 'Gagnante prouvée · le Studio reprend son brief, le devis s’affiche avant toute génération',
      action: 'Itérer',
      href: p.iteration.href,
    };
  }
  if (p.etape) {
    return { titre: `À faire maintenant : ${p.etape.libelle.charAt(0).toLocaleLowerCase('fr-FR')}${p.etape.libelle.slice(1)}`, detail: p.etape.pourquoi, action: 'Commencer', href: p.etape.href };
  }
  return null;
}

/* ───────────────────────────── « Configure TikTrends » ───────────────────────────── */

export interface EtapeConfiguration {
  cle: string;
  libelle: string;
  fait: boolean;
  /** Ce que l'étape débloque, ou pourquoi elle attend · `null` une fois faite. */
  detail: string | null;
  /** Le geste · absent quand l'étape est faite, bloquée, ou que son écran est fermé au rôle. */
  action: { libelle: string; href: string; primaire: boolean } | null;
}

export interface CarteConfiguration {
  fait: number;
  total: number;
  part: number;
  titre: string;
  etapes: EtapeConfiguration[];
  /** Les trois prochaines étapes non faites · la carte repliée de la maquette. */
  prochaines: EtapeConfiguration[];
}

const VERBE_ETAPE: Readonly<Record<string, string>> = {
  brand: 'Créer', identity: 'Compléter', generate: 'Créer', map: 'Poser', batch: 'Préparer',
  meta: 'Connecter', verdict: 'Arbitrer', memory: 'Ouvrir', competitors: 'Suivre',
};

/**
 * La carte de configuration · les étapes RÉELLES du parcours (`journey`,
 * calculé sur la donnée, jamais sur des cases cochées). `null` quand le chemin
 * bloquant est terminé (la maquette retire alors la carte).
 */
export function carteConfiguration(j: Journey, p: { marque: string | null; ouvert: (href: string) => boolean; ficheHref?: string | null }): CarteConfiguration | null {
  if (j.complete) return null;
  const etapes = j.steps.map((s: JourneyStep): EtapeConfiguration => {
    const fait = s.status === 'done';
    const href = s.key === 'identity' && p.ficheHref ? p.ficheHref : s.href;
    const detail = fait ? null
      : s.lockedByRole ? 'Réservé à un administrateur de l’espace'
      : s.status === 'blocked' && s.blockedBy ? `Après « ${s.blockedBy} »`
      : s.why;
    const action = !fait && s.status === 'now' && p.ouvert(href.split(/[?#]/)[0]!)
      ? { libelle: VERBE_ETAPE[s.key] ?? 'Ouvrir', href, primaire: j.next?.key === s.key }
      : null;
    return { cle: s.key, libelle: s.label, fait, detail, action };
  });
  const total = j.totalRequired;
  const fait = j.doneCount;
  return {
    fait, total, part: total > 0 ? Math.round((fait / total) * 100) : 0,
    titre: p.marque?.trim() ? `Configure TikTrends pour ${p.marque.trim()}` : 'Configure TikTrends',
    etapes,
    prochaines: etapes.filter((e) => !e.fait).slice(0, 3),
  };
}

/* ───────────────────────────── « Ta boucle d'itération » ───────────────────────────── */

export interface EtapeBoucleAccueil {
  cle: 'hypotheses' | 'preparation' | 'diffusion' | 'atraiter' | 'apprentissages';
  icone: string;
  n: number;
  titre: string;
  sous: string;
  href: string;
  alerte: boolean;
  /** `vertical` · format 9:16 connu (aucune source ne le porte aujourd'hui · toujours faux en production). */
  vignettes: Array<{ url: string; gagnante: boolean; vertical: boolean }>;
  progression: { part: number; texte: string; note: string } | null;
  action: string | null;
}

/** Les comptes de la boucle · `compterBoucle` (lecture réelle, marque active). */
export interface ComptesBoucleAccueil {
  tests: number;
  avecHypothese: number;
  aArbitrer: number;
  arbitres: number;
  apprentissages: number;
}

const PREPARATION = new Set(['planned', 'in_production', 'ready']);

/** La progression d'un lot en diffusion · seulement quand le lancement ET la fin prévue sont datés. */
export function progressionLot(l: LotAccueil, maintenant: Date): EtapeBoucleAccueil['progression'] {
  const a = jourIso(l.lanceLe?.slice(0, 10)), b = jourIso(l.finPrevue?.slice(0, 10));
  if (!a || !b || b < a) return null;
  const total = joursEntre(a, b) - 1;
  if (total <= 0) return null;
  const ecoule = Math.min(total, joursEcoules(l.lanceLe, maintenant));
  return { part: Math.round((ecoule / total) * 100), texte: `J${ecoule} / ${total}`, note: `Bilan le ${jourCourt(b)} · rien à faire d’ici là` };
}

const titreLot = (l: LotAccueil) => `Lot #${l.numero}${l.but?.trim() ? ` · ${l.but.trim()}` : ''}`;

/**
 * Les cinq étapes de la boucle, sur les comptes et les lots RÉELS de la marque
 * active. Une étape vide le dit (« Aucun lot en préparation ») · jamais un
 * exemple. Les lots s'ouvrent aux admins · sinon les liens mènent à Résultats.
 */
export function etapesBoucleAccueil(p: { comptes: ComptesBoucleAccueil; lots: readonly LotAccueil[]; maintenant: Date; lotsOuverts: boolean }): EtapeBoucleAccueil[] {
  const c = p.comptes;
  const k = (v: number) => Math.max(0, Math.floor(Number.isFinite(v) ? v : 0));
  const tests = k(c.tests), avecH = Math.min(k(c.avecHypothese), tests), aArb = k(c.aArbitrer), appris = k(c.apprentissages), arbitres = k(c.arbitres);
  const lien = (l: LotAccueil | undefined) => (l && p.lotsOuverts ? lienLotApercu(l.id) : p.lotsOuverts ? CHEMIN_LOTS : CHEMIN_BOUCLE_ACCUEIL);
  const vignettes = (ls: readonly LotAccueil[], gagnante = false) => ls.filter((l) => l.vignette).slice(0, 2).map((l, i) => ({ url: l.vignette!, gagnante: gagnante && i === 0, vertical: false }));

  const enPrep = p.lots.filter((l) => PREPARATION.has(l.statut));
  const aConclure = lotsAConclure(p.lots, p.maintenant);
  const idsAConclure = new Set(aConclure.map((l) => l.id));
  const enDiff = p.lots.filter((l) => l.statut === 'testing' && !idsAConclure.has(l.id));

  const sansH = tests - avecH;
  const hypo: EtapeBoucleAccueil = {
    cle: 'hypotheses', icone: 'q', n: avecH, titre: 'Hypothèses',
    sous: tests === 0 ? 'Aucun test pour l’instant' : sansH > 0 ? `${pl(sansH, 'test', 'tests')} sans hypothèse écrite` : 'Chaque test a la sienne',
    href: p.lotsOuverts ? CHEMIN_LOTS : `${CHEMIN_BOUCLE_ACCUEIL}${ANCRE_TESTS}`, alerte: false, vignettes: [], progression: null,
    action: p.lotsOuverts ? 'Préparer un lot' : null,
  };
  const prep: EtapeBoucleAccueil = {
    cle: 'preparation', icone: 'cal', n: enPrep.length, titre: 'En préparation',
    sous: enPrep[0] ? titreLot(enPrep[0]) : 'Aucun lot en préparation',
    href: lien(enPrep[0]), alerte: enPrep.length > 0 && p.lotsOuverts, vignettes: vignettes(enPrep), progression: null,
    action: enPrep.length > 0 && p.lotsOuverts ? 'Compléter' : null,
  };
  const diff0 = enDiff[0];
  const diff: EtapeBoucleAccueil = {
    cle: 'diffusion', icone: 'flask', n: enDiff.length, titre: 'En diffusion',
    sous: diff0 ? titreLot(diff0) : 'Aucun lot en diffusion',
    href: lien(diff0), alerte: false, vignettes: vignettes(enDiff),
    progression: diff0 ? progressionLot(diff0, p.maintenant) : null, action: null,
  };
  const morceaux = [...aConclure.map((l) => `Lot #${l.numero} à conclure`), aArb > 0 ? `${pl(aArb, 'verdict', 'verdicts')} à arbitrer` : null].filter((x): x is string => !!x);
  const traiter: EtapeBoucleAccueil = {
    cle: 'atraiter', icone: 'check', n: aConclure.length + aArb, titre: 'À traiter',
    sous: morceaux.length ? morceaux.join(' · ') : 'Rien en attente',
    href: aConclure[0] ? lien(aConclure[0]) : `${CHEMIN_BOUCLE_ACCUEIL}${ANCRE_TESTS}`,
    alerte: morceaux.length > 0, vignettes: vignettes(aConclure, true), progression: null,
    action: aConclure[0] ? `Conclure le lot #${aConclure[0].numero}` : aArb > 0 ? 'Arbitrer' : null,
  };
  const appr: EtapeBoucleAccueil = {
    cle: 'apprentissages', icone: 'bulb', n: appris, titre: 'Apprentissages',
    sous: appris > 0 ? `${pl(appris, 'validé', 'validés')}` : arbitres > 0 ? `${pl(arbitres, 'verdict arbitré', 'verdicts arbitrés')}, aucun apprentissage écrit` : 'Pas encore de conclusion',
    href: CHEMIN_SUITES, alerte: false, vignettes: [], progression: null,
    action: appris > 0 ? 'Préparer la suite' : null,
  };
  return [hypo, prep, diff, traiter, appr];
}

/* ───────────────────────────── « Quoi itérer » ───────────────────────────── */

export interface IndicateurIteration { libelle: string; valeur: string; classe: '' | 'g' | 'r' }
export interface SignalIteration { texte: string; classe: '' | 'g' | 'r' | 'w' | 'c' }

export interface CarteQuoiIterer {
  adId: string;
  rang: number;
  vignette: string | null;
  /** Format 9:16 connu · le plan d'itération ne le porte pas, toujours faux en production. */
  vertical: boolean;
  etiquette: SignalIteration;
  nom: string;
  indicateurs: IndicateurIteration[];
  recommande: boolean;
  titre: string;
  raison: string;
  signaux: SignalIteration[];
  garde: string | null;
  preuve: { niveau: 1 | 2 | 3; libelle: string };
  note: string;
  action: { libelle: string; href: string } | null;
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const dec2 = (n: number) => n.toFixed(2).replace('.', ',');

/**
 * Les trois chiffres d'une gagnante (`div.qk`) · lus dans son agrégat de
 * verdict (`adsmap_verdicts.metrics_agg_json`), seulement ceux qui existent.
 * Aucun seuil n'est appliqué (aucune couleur « bonne » ou « mauvaise » posée
 * d'instinct) · la gagnante l'est par son verdict, pas par une teinte.
 */
export function indicateursGagnante(metricsAgg: unknown): IndicateurIteration[] {
  if (!metricsAgg || typeof metricsAgg !== 'object') return [];
  const a = metricsAgg as Record<string, unknown>;
  const out: IndicateurIteration[] = [];
  const roas = num(a.roas), spend = num(a.spend), cpa = num(a.cpa), ctr = num(a.ctr), hook = num(a.hookRate), achats = num(a.purchases);
  if (roas !== null && roas > 0) out.push({ libelle: 'ROAS', valeur: dec2(roas), classe: '' });
  if (spend !== null && spend > 0) out.push({ libelle: 'Dépense', valeur: `${Math.round(spend).toLocaleString('fr-FR')} €`, classe: '' });
  if (cpa !== null && cpa > 0 && (achats ?? 0) > 0) out.push({ libelle: 'Coût / achat', valeur: `${dec2(cpa)} €`, classe: '' });
  if (ctr !== null && ctr > 0) out.push({ libelle: 'CTR', valeur: `${(ctr * 100).toFixed(2).replace('.', ',')} %`, classe: '' });
  if (hook !== null && hook > 0) out.push({ libelle: 'Accroche', valeur: `${Math.round(hook * 100)} %`, classe: '' });
  return out.slice(0, 3);
}

/**
 * « Quoi itérer, d'après tes performances » · les gagnantes PROUVÉES du plan
 * d'itération (`etatProchainesIterations` · verdict arbitré, comparable,
 * suite filiée), une ligne chacune. La maquette y mêle des diagnostics
 * (fatigue, « à couper ») qu'aucune source ne calcule aujourd'hui · ils ne
 * sont pas inventés. Aucun « Recommandé » n'est posé · rien ne le décide.
 */
export function cartesQuoiIterer(cartes: readonly CarteIterationAccueil[], agregats: (adId: string) => unknown): CarteQuoiIterer[] {
  return cartes.map((c, i) => {
    const signaux: SignalIteration[] = [];
    if (c.mesure) signaux.push({ texte: `${c.mesure.valeur} · ${c.mesure.libelle}`, classe: 'g' });
    if (c.lot !== 'Hors lot') signaux.push({ texte: c.lot, classe: 'c' });
    if (c.apprentissageValide) signaux.push({ texte: 'Apprentissage validé', classe: 'g' });
    const niveau: 1 | 2 | 3 = c.mesure && c.apprentissageValide ? 3 : c.mesure ? 2 : 1;
    return {
      adId: c.adId, rang: i + 1, vignette: c.vignette, vertical: false,
      etiquette: { texte: c.verdict, classe: 'g' },
      nom: c.titre,
      indicateurs: indicateursGagnante(agregats(c.adId)),
      recommande: false,
      titre: `Garder ce qui a gagné · changer ${c.change.replace(/^Change · /, '').toLocaleLowerCase('fr-FR')}`,
      raison: c.raison,
      signaux,
      garde: c.garde,
      preuve: { niveau, libelle: niveau === 3 ? 'Mesuré' : niveau === 2 ? 'Observé' : 'À vérifier' },
      note: c.mesure ? `${c.mesure.periode} · ${c.mesure.source}` : 'Verdict arbitré · période de mesure non datée',
      action: c.iterer ? { libelle: 'Préparer l’itération', href: c.iterer } : null,
    };
  });
}

/* ───────────────────────────── « Quoi de neuf » ───────────────────────────── */

export interface NotificationLue { id: string; type: string; titre: string; corps: string | null; href: string | null; creeLe: Date | string }
export interface NouveauteAccueil { id: string; icone: string; couleur: 'good' | 'chg' | 'warn' | null; texte: string; quand: string; action: { libelle: string; href: string } | null }

/** Combien de nouveautés l'Accueil montre · la maquette en pose quatre, la cloche porte le reste. */
export const MAX_NOUVEAUTES_ACCUEIL = 4;

const GENRE_NOTIF: Readonly<Record<string, { icone: string; couleur: NouveauteAccueil['couleur']; action: string }>> = {
  tracker: { icone: 'eye', couleur: 'chg', action: 'Analyser' },
  ticket_new: { icone: 'chat', couleur: null, action: 'Ouvrir' },
  ticket_reply: { icone: 'chat', couleur: null, action: 'Ouvrir' },
  ticket_status: { icone: 'chat', couleur: null, action: 'Ouvrir' },
  system: { icone: 'spark', couleur: 'good', action: 'Voir' },
};

/** Les dernières notifications RÉELLES de la personne (table `notifications`), les plus récentes d'abord. */
export function fileQuoiDeNeuf(notifs: readonly NotificationLue[], maintenant: Date): NouveauteAccueil[] {
  return [...notifs]
    .sort((a, b) => new Date(b.creeLe).getTime() - new Date(a.creeLe).getTime())
    .slice(0, MAX_NOUVEAUTES_ACCUEIL)
    .map((n) => {
      const g = GENRE_NOTIF[n.type] ?? { icone: 'bell', couleur: null, action: 'Ouvrir' };
      const corps = n.corps?.trim();
      const texte = corps ? `${n.titre.trim()} · ${corps.length > 140 ? `${corps.slice(0, 139)}…` : corps}` : n.titre.trim();
      const href = n.href && n.href.startsWith('/') && !n.href.startsWith('//') ? n.href : null;
      return { id: n.id, icone: g.icone, couleur: g.couleur, texte, quand: depuisRelatif(n.creeLe, maintenant) ?? '', action: href ? { libelle: g.action, href } : null };
    });
}

/* ───────────────────────────── « Reprendre » ───────────────────────────── */

export interface ProjetLu { id: string; titre: string; apercu: string | null; libelleEtape: string; libelleType: string; majLe: string }
export interface LigneReprendre { id: string; href: string; titre: string; vignette: string | null; detail: string }

/** Les projets à reprendre · ceux que la liste des projets a rendus (portée comprise), quatre au plus. */
export function lignesReprendre(projets: readonly ProjetLu[], maintenant: Date): LigneReprendre[] {
  return projets.slice(0, 4).map((p) => ({
    id: p.id, href: `/studio/projets/${encodeURIComponent(p.id)}`, titre: p.titre || 'Projet sans titre',
    vignette: p.apercu, detail: [p.libelleEtape, p.libelleType, depuisRelatif(p.majLe, maintenant)].filter(Boolean).join(' · '),
  }));
}
