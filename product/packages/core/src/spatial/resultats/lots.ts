import { estLotImporte } from '../../adsmap/lot-nature';
import { verdictEffectif, type VerdictValue } from '../../adsmap/types';
import { LIBELLE_VERDICT } from '../../adsmap/verdict-libelle';
import type { EntreeRail } from '../rail';

/**
 * Spatial · Résultats · les LOTS de test, lus sur leurs faits réels.
 *
 * Pur · ni base, ni réseau, ni horloge (l'instant arrive en paramètre).
 *
 * ── Ce que « conclure un lot » veut dire ici ────────────────────────────────
 *
 * Le moteur rend un verdict PAR ANNONCE (`computeVerdict` · cible CPA de la
 * marque, volume minimum, intervalle unilatéral), et un verdict ne se CLÔT
 * qu'arbitré avec un apprentissage (`validateVerdictAction`, invariant §2.4).
 * La maquette parle de conclure un LOT · on ne réinvente aucune comparaison
 * A/B : conclure un lot, c'est arbitrer les verdicts calculés de ses variantes.
 *
 * Un lot est « à conclure » quand, et seulement quand, la file de décisions
 * existante le demanderait pour au moins une de ses variantes (règle
 * `validate_verdict` de `buildDecisions`) ET que plus rien ne se mesure :
 *  · le lot est suivi dans l'outil (un historique importé ne se conclut pas) ;
 *  · sa fenêtre d'évaluation est écoulée (jours entiers depuis le lancement ≥
 *    fenêtre de la marque · même calcul que `lib/decisions`) ;
 *  · chaque variante a un verdict calculé (sinon il manque des mesures) ;
 *  · au moins une attend son arbitrage avec un verdict TRANCHÉ (ni non
 *    concluant, ni sous-diffusé · ceux-là ne disent rien à retenir).
 * Le silence est une conclusion valable · un lot dont toutes les variantes
 * restent non concluantes est « non concluant », jamais « à conclure ».
 */

/** Le verdict d'une variante tel qu'il est en base (`adsmap_verdicts`). */
export interface FaitsVerdictSpatial {
  /** Verdict calculé par le moteur · `null` pour un verdict importé (jamais calculé). */
  calcule: VerdictValue | null;
  /** Verdict arbitré · `null` tant que personne n'a tranché. */
  retenu: VerdictValue | null;
  statut: 'computed' | 'validated';
  comparable: boolean;
  /** Pourquoi ce verdict, la phrase du moteur (`metricsAgg.reason`). */
  raison: string | null;
  depense: number | null;
  impressions: number | null;
  achats: number | null;
  cpa: number | null;
}

/** Une variante d'un lot (une ad Adsmap). */
export interface FaitsAdSpatial {
  id: string;
  variante: string;
  statut: string;
  hypothese: string | null;
  variable: string | null;
  plateforme: string;
  /** Le texte porté par la créa (accroche du concept, sinon son titre). */
  texte: string | null;
  /** Le média réel de la variante (URL http·s), ou `null` · jamais une image fabriquée. */
  image: string | null;
  /** Ce qui manque pour partir en test (`manquesAvantTest`) · vide = complète. */
  manques: string[];
  verdict: FaitsVerdictSpatial | null;
}

export interface FaitsLotSpatial {
  id: string;
  numero: number;
  but: string | null;
  /** `adsmap_batch_status`. */
  statut: string;
  /** ISO · `null` si jamais lancé dans l'outil. */
  lanceLe: string | null;
  ads: FaitsAdSpatial[];
  /** Le dernier contrôle de protocole (`protocolCheck`) · `null` s'il n'a pas tourné. */
  protocole: { conforme: boolean | null; resume: string | null } | null;
}

export type EtatLotSpatial =
  | 'composition' | 'pret' | 'diffusion' | 'a_importer' | 'a_conclure' | 'non_concluant' | 'conclu' | 'importe';

/** Les deux verdicts qui ne disent rien à retenir · même liste que la file de décisions. */
const NON_CONCLUANTS: ReadonlySet<VerdictValue> = new Set<VerdictValue>(['inconclusive', 'insufficient_delivery']);
const JOUR = 86_400_000;

/** Jours ENTIERS écoulés depuis le lancement · `null` sans date lisible (même calcul que `lib/decisions`). */
export function joursEntiersDepuis(lanceLe: string | null, maintenant: Date): number | null {
  if (!lanceLe) return null;
  const t = Date.parse(lanceLe);
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.floor((maintenant.getTime() - t) / JOUR));
}

export interface ContexteLots {
  maintenant: Date;
  /** Fenêtre d'évaluation de la marque (`VerdictConfig.evaluationWindowDays`). */
  fenetreJours: number;
}

/** Le verdict qui compte pour l'affichage · l'arbitré s'il existe, sinon le calculé (rétrogradé hors protocole). */
export function verdictAffiche(v: FaitsVerdictSpatial | null): VerdictValue | null {
  if (!v) return null;
  return verdictEffectif(v.retenu ?? v.calcule, v.comparable);
}

/** La variante attend-elle son arbitrage (verdict calculé, personne n'a tranché) ? */
export function attendArbitrage(a: FaitsAdSpatial): boolean {
  return !!a.verdict && a.verdict.statut === 'computed' && !!a.verdict.calcule;
}

export function etatLotSpatial(l: FaitsLotSpatial, c: ContexteLots): EtatLotSpatial {
  if (estLotImporte({ status: l.statut, launchedAt: l.lanceLe })) return 'importe';
  if (l.statut === 'planned' || l.statut === 'in_production') return 'composition';
  if (l.statut === 'ready') return 'pret';
  const ads = l.ads;
  if (ads.length > 0 && ads.every((a) => a.verdict?.statut === 'validated')) return 'conclu';
  const jours = joursEntiersDepuis(l.lanceLe, c.maintenant);
  // Sans date de lancement lisible, on ne suppose jamais la fenêtre écoulée.
  if (jours === null || jours < c.fenetreJours) return 'diffusion';
  if (ads.length === 0 || ads.some((a) => !a.verdict || (a.verdict.statut === 'computed' && !a.verdict.calcule))) return 'a_importer';
  const enAttente = ads.filter(attendArbitrage);
  if (enAttente.some((a) => !NON_CONCLUANTS.has(a.verdict!.calcule!))) return 'a_conclure';
  return enAttente.length ? 'non_concluant' : 'conclu';
}

/** Un lot réellement prêt à conclure (la pastille du rail, la tuile vedette). */
export function lotPretAConclure(l: FaitsLotSpatial, c: ContexteLots): boolean {
  return etatLotSpatial(l, c) === 'a_conclure';
}

/** Peut-on arbitrer des variantes de ce lot maintenant (formulaire de conclusion) ? */
export function lotArbitrable(etat: EtatLotSpatial): boolean {
  return etat === 'a_conclure' || etat === 'non_concluant';
}

/**
 * La pastille de Résultats dans le rail (`badge` de la maquette) · posée seulement
 * s'il existe AU MOINS un lot réellement prêt à conclure, absente sinon.
 */
export function pastilleLotsAConclure(etats: readonly EtatLotSpatial[]): NonNullable<EntreeRail['pastille']> | null {
  const n = etats.filter((e) => e === 'a_conclure').length;
  if (!n) return null;
  return { classe: 'badge', valeur: '', libelle: n === 1 ? 'Un lot à conclure' : `${n} lots à conclure` };
}

/* ───────────────────────── présentation ───────────────────────── */

/** Les catégories de variable dans les mots de la maquette (Accroche, Format, Visuel, Texte, Offre…). */
export const CATEGORIE_VARIABLE: Record<string, string> = {
  hook: 'Accroche', opening_visual: 'Visuel', body: 'Texte', length: 'Durée', cta: 'Appel à l’action',
  format: 'Format', offer: 'Offre', landing: 'Page', avatar_on_screen: 'Personne à l’écran', proof: 'Preuve',
  audio: 'Son', angle: 'Angle', desire: 'Désir', none_control: 'Témoin',
};
export const CATEGORIE_A_CHOISIR = 'Variable à choisir';

export function categorieVariable(v: string | null | undefined): string {
  return (v && CATEGORIE_VARIABLE[v]) || CATEGORIE_A_CHOISIR;
}

/** La variable testée par le lot · celle de ses variantes (le témoin ne compte pas). */
export function categorieLot(l: FaitsLotSpatial): string {
  const vs = [...new Set(l.ads.map((a) => a.variable).filter((v): v is string => !!v && v !== 'none_control'))];
  if (vs.length === 1) return categorieVariable(vs[0]);
  return vs.length > 1 ? 'Plusieurs variables' : CATEGORIE_A_CHOISIR;
}

const PLATEFORME: Record<string, string> = { meta: 'Meta', tiktok: 'TikTok', google: 'Google', snapchat: 'Snapchat', pinterest: 'Pinterest' };
export function plateformesLot(l: FaitsLotSpatial): string {
  const ps = [...new Set(l.ads.map((a) => PLATEFORME[a.plateforme] ?? a.plateforme))];
  return ps.length ? ps.join(' et ') : 'Plateforme à choisir';
}

/** « Si … alors … parce que … » · les trois mots en gras de la maquette (`hl`). */
export function segmentsHypothese(s: string): Array<{ texte: string; fort: boolean }> {
  const out: Array<{ texte: string; fort: boolean }> = [];
  const re = /(^|[^\p{L}])(Si|alors|parce que)(?![\p{L}])/gu;
  let dernier = 0;
  for (const m of s.matchAll(re)) {
    const debut = m.index! + m[1]!.length;
    if (debut > dernier) out.push({ texte: s.slice(dernier, debut), fort: false });
    out.push({ texte: m[2]!, fort: true });
    dernier = debut + m[2]!.length;
  }
  if (dernier < s.length) out.push({ texte: s.slice(dernier), fort: false });
  return out;
}

/** L'hypothèse du lot · celle de sa première variante qui en porte une. */
export function hypotheseLot(l: FaitsLotSpatial): string | null {
  return l.ads.map((a) => a.hypothese?.trim()).find((h): h is string => !!h) ?? null;
}

export const lienLotSpatial = (id: string) => `/adsmap/lots/${encodeURIComponent(id)}`;

type ClassePill = '' | 'c' | 'g' | 'w';
export const PRESENTATION_ETAT_LOT: Record<EtatLotSpatial, { statut: string; pill: ClassePill; anneau: ClassePill; action: string; primaire: boolean; versImport?: true }> = {
  composition: { statut: 'En préparation', pill: '', anneau: 'c', action: 'Préparer le lot', primaire: false },
  pret: { statut: 'Prêt à lancer', pill: '', anneau: 'c', action: 'Lancer le lot', primaire: false },
  diffusion: { statut: 'En diffusion', pill: 'c', anneau: 'c', action: 'Suivre', primaire: false },
  a_importer: { statut: 'Mesures à importer', pill: 'w', anneau: 'w', action: 'Importer', primaire: false, versImport: true },
  a_conclure: { statut: 'À conclure', pill: 'g', anneau: 'g', action: 'Conclure', primaire: true },
  non_concluant: { statut: 'Non concluant', pill: '', anneau: 'w', action: 'Voir le lot', primaire: false },
  conclu: { statut: 'Conclu', pill: 'g', anneau: 'g', action: 'Voir le lot', primaire: false },
  importe: { statut: 'Historique importé', pill: '', anneau: '', action: 'Voir le lot', primaire: false },
};

export interface PresentationLot {
  id: string;
  numero: number;
  etat: EtatLotSpatial;
  titre: string;
  hypothese: string | null;
  categorie: string;
  plateformes: string;
  statut: { libelle: string; classe: ClassePill };
  anneau: { part: number; libelle: string; classe: ClassePill };
  action: { libelle: string; href: string; primaire: boolean };
  /** Jour courant (1 = jour du lancement), plafonné à la fenêtre · `null` si non lancé. */
  jour: number | null;
  fenetre: number;
  /** Fin de fenêtre (ISO) · `null` si non lancé. */
  fin: string | null;
}

export function presentationLot(l: FaitsLotSpatial, c: ContexteLots, liens: { import: string } = { import: '/adsmap/import' }): PresentationLot {
  const etat = etatLotSpatial(l, c);
  const p = PRESENTATION_ETAT_LOT[etat];
  const ecoules = joursEntiersDepuis(l.lanceLe, c.maintenant);
  const lance = ecoules !== null && etat !== 'composition' && etat !== 'pret' && etat !== 'importe';
  const jour = lance ? Math.min(c.fenetreJours, ecoules + 1) : null;
  const part = etat === 'diffusion' && jour !== null ? Math.round((jour / Math.max(1, c.fenetreJours)) * 100) : lance ? 100 : 0;
  const t = l.lanceLe ? Date.parse(l.lanceLe) : NaN;
  return {
    id: l.id,
    numero: l.numero,
    etat,
    titre: l.but?.trim() ? `Lot #${l.numero} · ${l.but.trim()}` : `Lot #${l.numero}`,
    hypothese: hypotheseLot(l),
    categorie: categorieLot(l),
    plateformes: plateformesLot(l),
    statut: { libelle: p.statut, classe: p.pill },
    anneau: { part, libelle: jour !== null ? `J${jour}` : '–', classe: p.anneau },
    action: { libelle: p.action, href: p.versImport ? liens.import : lienLotSpatial(l.id), primaire: p.primaire },
    jour,
    fenetre: c.fenetreJours,
    fin: Number.isFinite(t) ? new Date(t + c.fenetreJours * JOUR).toISOString() : null,
  };
}

/** Les filtres de la liste des lots (maquette `lots`) · un état n'appartient qu'à un groupe, « Tous » les voit tous. */
export type FiltreLots = 'tous' | 'preparation' | 'diffusion' | 'importer' | 'conclure';
export const FILTRES_LOTS: ReadonlyArray<{ cle: FiltreLots; libelle: string }> = [
  { cle: 'tous', libelle: 'Tous' }, { cle: 'preparation', libelle: 'En préparation' }, { cle: 'diffusion', libelle: 'En diffusion' },
  { cle: 'importer', libelle: 'À importer' }, { cle: 'conclure', libelle: 'À conclure' },
];
export function dansFiltreLots(etat: EtatLotSpatial, f: FiltreLots): boolean {
  switch (f) {
    case 'tous': return true;
    case 'preparation': return etat === 'composition' || etat === 'pret';
    case 'diffusion': return etat === 'diffusion';
    case 'importer': return etat === 'a_importer';
    case 'conclure': return etat === 'a_conclure';
  }
}

/* ───────────────────────── synthèse et mesure d'un lot ───────────────────────── */

export type NiveauPreuve = 1 | 2 | 3;
/** Les libellés des points de preuve (maquette `dots` · 3 mesuré, 2 observé, 1 à vérifier). */
export const LIBELLE_NIVEAU: Record<NiveauPreuve, string> = { 3: 'Mesuré', 2: 'Observé', 1: 'À vérifier' };

export interface SyntheseLot {
  /** La variante qui gagne au sens du moteur (gagnante ou naissante, au protocole) · `null` sinon. */
  gagnante: string | null;
  /** Le gros titre du verdict (« v2 · Gagnante naissante », « Aucune gagnante », « Pas encore de verdict »). */
  titre: string;
  /** La phrase qui l'explique · celle du moteur quand elle existe. */
  phrase: string;
  niveau: NiveauPreuve;
}

const GAGNANTES: ReadonlySet<VerdictValue> = new Set<VerdictValue>(['winner', 'baby_winner']);
const ORDRE_GAIN: Record<string, number> = { winner: 0, baby_winner: 1 };

/**
 * Ce que le lot dit, d'après les verdicts EXISTANTS de ses variantes · aucune
 * comparaison nouvelle. La gagnante est celle que le moteur déclare gagnante au
 * protocole (la meilleure, puis le CPA le plus bas) ; une prometteuse relative
 * n'est jamais présentée comme gagnante.
 */
export function syntheseLot(l: FaitsLotSpatial, cibleCpa: number | null): SyntheseLot {
  const lus = l.ads.map((a) => ({ a, v: verdictAffiche(a.verdict) })).filter((x) => x.v);
  const gagnantes = lus.filter((x) => GAGNANTES.has(x.v!))
    .sort((x, y) => (ORDRE_GAIN[x.v!]! - ORDRE_GAIN[y.v!]!) || ((x.a.verdict?.cpa ?? Infinity) - (y.a.verdict?.cpa ?? Infinity)));
  if (gagnantes[0]) {
    const g = gagnantes[0];
    return { gagnante: g.a.id, titre: `${g.a.variante} · ${LIBELLE_VERDICT[g.v!].court}`, phrase: g.a.verdict?.raison ?? 'Verdict du moteur sur la cible de la marque.', niveau: 3 };
  }
  const relative = lus.find((x) => x.v === 'relative_winner');
  if (relative) {
    return { gagnante: null, titre: `${relative.a.variante} · ${LIBELLE_VERDICT.relative_winner.court}`, phrase: relative.a.verdict?.raison ?? 'Meilleure du lot, sans protocole respecté · comparaison relative seulement.', niveau: 2 };
  }
  if (!lus.length) {
    return { gagnante: null, titre: 'Pas encore de verdict', phrase: l.ads.length ? 'Aucune variante n’a encore de mesure rattachée.' : 'Ce lot ne contient encore aucune variante.', niveau: 1 };
  }
  const compte = new Map<VerdictValue, number>();
  for (const x of lus) compte.set(x.v!, (compte.get(x.v!) ?? 0) + 1);
  const detail = [...compte.entries()].map(([v, n]) => `${n} ${LIBELLE_VERDICT[v].court.toLowerCase()}`).join(', ');
  const mesure = lus.some((x) => x.v === 'loser' && x.a.verdict?.comparable);
  return {
    gagnante: null,
    titre: 'Aucune gagnante',
    phrase: `${detail}${cibleCpa ? ` · aucune ne tient la cible de ${cibleCpa.toLocaleString('fr-FR')} € par achat` : ''}.`,
    niveau: mesure ? 3 : 1,
  };
}

/**
 * La mesure affichée par variante · le coût par achat, celui sur lequel le moteur
 * décide. La barre la plus haute coûte le MOINS (part = meilleur CPA ÷ CPA) ;
 * une variante sans achat n'a pas de CPA, sa barre reste à zéro et le dit.
 */
export function barresCpa(ads: readonly FaitsAdSpatial[]): Array<{ id: string; libelle: string; part: number }> {
  const cpas = ads.map((a) => a.verdict?.cpa ?? null);
  const meilleur = Math.min(...cpas.filter((x): x is number => x !== null && x > 0));
  return ads.map((a, i) => {
    const c = cpas[i] ?? null;
    if (c === null || !(c > 0) || !Number.isFinite(meilleur)) return { id: a.id, libelle: a.verdict ? 'aucun achat' : 'en mesure', part: 0 };
    return { id: a.id, libelle: `${c.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} €`, part: Math.round((meilleur / c) * 100) };
  });
}

/** Le plus petit volume d'impressions parmi les variantes mesurées · `null` si aucune. */
export function volumeMinimumLot(l: FaitsLotSpatial): number | null {
  const v = l.ads.map((a) => a.verdict?.impressions).filter((x): x is number => typeof x === 'number');
  return v.length ? Math.min(...v) : null;
}

/** Préparation d'un lot · quatre étapes réelles (variantes, complétude, noms régie, prêt). */
export function preparationLot(l: FaitsLotSpatial, nomsGeneres: number): { fait: number; sur: 4 } {
  const etapes = [
    l.ads.length > 0,
    l.ads.length > 0 && l.ads.every((a) => a.manques.length === 0),
    l.ads.length > 0 && nomsGeneres >= l.ads.length,
    l.statut === 'ready',
  ];
  return { fait: etapes.filter(Boolean).length, sur: 4 };
}

/** La prochaine meilleure action de la boucle, tirée des états réels (ordre · conclure, importer, lancer, préparer). */
export function prochaineActionBoucle(lots: ReadonlyArray<{ presentation: PresentationLot; synthese: SyntheseLot }>, aDesSuites: boolean): { titre: string; phrase: string; bouton: string; href: string } {
  const de = (e: EtatLotSpatial) => lots.find((l) => l.presentation.etat === e);
  const c = de('a_conclure');
  if (c) return { titre: `Conclure le lot #${c.presentation.numero}`, phrase: `${c.synthese.titre} · ${c.synthese.phrase} Conclure enregistre l’apprentissage et débloque l’itération.`, bouton: 'Conclure le lot', href: c.presentation.action.href };
  const i = de('a_importer');
  if (i) return { titre: `Importer les mesures du lot #${i.presentation.numero}`, phrase: 'La fenêtre d’évaluation est écoulée, mais des variantes n’ont pas encore de mesure · sans elles, pas de verdict.', bouton: 'Importer', href: i.presentation.action.href };
  const p = de('pret');
  if (p) return { titre: `Lancer le lot #${p.presentation.numero}`, phrase: 'Toutes ses variantes sont prêtes · le lancement date le départ de la fenêtre d’évaluation.', bouton: 'Lancer le lot', href: p.presentation.action.href };
  const m = de('composition');
  if (m) return { titre: `Préparer le lot #${m.presentation.numero}`, phrase: 'Range ses variantes, vérifie ce qui leur manque, génère les noms attendus côté régie.', bouton: 'Préparer le lot', href: m.presentation.action.href };
  if (aDesSuites) return { titre: 'Préparer la suite d’un test', phrase: 'Des tests arbitrés appellent une suite · une seule variable à la fois.', bouton: 'Voir les suites', href: '/adsmap/suites' };
  return { titre: 'Formuler une première hypothèse', phrase: 'Aucun lot n’attend d’action · une hypothèse vérifiable ouvre la boucle.', bouton: 'Voir les hypothèses', href: '/adsmap/hypotheses' };
}


/** La phrase d'ouverture de la vue d'ensemble (`rvlead`) · comptée, jamais interprétée. */
export function accrocheResultats(vedette: { numero: number; synthese: SyntheseLot; aConclure: boolean } | null, autresEnAttente: number): { avant: string; fort: string; apres: string } {
  const apres = autresEnAttente === 0 ? 'Aucun autre lot n’attend d’action de ta part.'
    : autresEnAttente === 1 ? 'Un autre attend une action de ta part.' : `${autresEnAttente} autres attendent une action de ta part.`;
  if (!vedette) {
    const attente = autresEnAttente === 0 ? 'Prépare un lot pour ouvrir la boucle.'
      : autresEnAttente === 1 ? 'Un lot attend une action de ta part.' : `${autresEnAttente} lots attendent une action de ta part.`;
    return { avant: 'Aucun lot n’a encore de verdict.', fort: '', apres: attente };
  }
  return {
    avant: vedette.aConclure ? `Le lot #${vedette.numero} est prêt à donner sa réponse :` : `Dernier verdict, lot #${vedette.numero} :`,
    fort: `${vedette.synthese.titre}.`,
    apres,
  };
}

/* ───────────────────────── phrases d'état ───────────────────────── */

const dateCourte = (iso: string | null) => {
  const d = iso ? new Date(iso) : null;
  return d && Number.isFinite(d.getTime()) ? d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', timeZone: 'UTC' }) : null;
};

/** Ce que la carte d'un lot dit de lui, tiré de son état (jamais une interprétation des chiffres). */
export function phraseLot(p: PresentationLot, s: SyntheseLot, variantes: number): string {
  switch (p.etat) {
    case 'diffusion': {
      const fin = dateCourte(p.fin);
      return `Jour ${p.jour ?? 1} sur ${p.fenetre} · pas de lecture avant la fin de la fenêtre.${fin ? ` Bilan le ${fin}.` : ''}`;
    }
    case 'a_importer': return 'La période est finie. Il manque des mesures pour donner le verdict.';
    case 'pret': return 'Les variantes sont prêtes · le lancement démarre la fenêtre d’évaluation.';
    case 'composition': return variantes ? `${variantes} variante${variantes > 1 ? 's' : ''} · il reste à compléter et préparer le lot.` : 'Aucune variante rangée · le lot se compose avant de partir.';
    case 'a_conclure': return `${s.titre} · prêt à conclure.`;
    case 'non_concluant': return 'Aucune variante n’a tranché · sans volume suffisant, rien n’est à retenir.';
    case 'conclu': return s.titre;
    case 'importe': return 'Historique repris du tableau · ses verdicts ne sont pas comparables aux tests suivis ici.';
  }
}

/** « Et maintenant » · la suite que les règles autorisent (on n'itère que sur une gagnante, §2.4). */
export function suiteLot(etat: EtatLotSpatial, s: SyntheseLot): string {
  if (etat === 'a_conclure') return 'Conclure le lot enregistre ce qu’il t’apprend et débloque l’itération sur la gagnante.';
  if (etat === 'non_concluant') return 'Arbitre-le quand même : écrire pourquoi rien n’a tranché évite de relancer le même test.';
  if (s.gagnante) return 'Prépare la suite depuis la gagnante · une seule variable change, le reste est gardé.';
  return 'Pas de gagnante · repars d’une nouvelle hypothèse plutôt que d’itérer sur une perdante.';
}

/**
 * Le lot mis en avant sur la vue d'ensemble · le premier à conclure, sinon le
 * plus récent qui a au moins un verdict. `-1` quand aucun n'a de verdict.
 */
export function indexLotVedette(lots: ReadonlyArray<{ etat: EtatLotSpatial; aDesVerdicts: boolean }>): number {
  const c = lots.findIndex((l) => l.etat === 'a_conclure');
  return c >= 0 ? c : lots.findIndex((l) => l.aDesVerdicts);
}

const URGENCE: Record<EtatLotSpatial, number> = { a_conclure: 0, a_importer: 1, pret: 2, composition: 3, diffusion: 4, non_concluant: 5, conclu: 6, importe: 7 };

/** Les « autres tests » · au plus `max`, ceux qui attendent une action d'abord (ordre stable sinon). */
export function indexAutresLots(lots: ReadonlyArray<{ etat: EtatLotSpatial }>, vedette: number, max = 3): number[] {
  return lots.map((l, i) => ({ i, u: URGENCE[l.etat] })).filter((x) => x.i !== vedette)
    .sort((a, b) => a.u - b.u || a.i - b.i).slice(0, max).map((x) => x.i);
}

/** Les lots qui attendent une action de l'équipe (conclure, importer, lancer, préparer). */
export function compteLotsEnAttente(etats: readonly EtatLotSpatial[]): number {
  return etats.filter((e) => e === 'a_conclure' || e === 'a_importer' || e === 'pret' || e === 'composition').length;
}

/* ───────────────────────── fiche d'un lot ───────────────────────── */

const n = (x: number) => x.toLocaleString('fr-FR');

/** Les trois contrôles de la fiche (durée, volume, règle) · tirés des faits, jamais supposés. */
export function controlesLot(l: FaitsLotSpatial, p: PresentationLot, minImpressions: number): Array<{ icone: 'cal' | 'chart' | 'lock'; titre: string; detail: string }> {
  const lance = p.jour !== null;
  const fini = p.etat !== 'diffusion' && lance;
  const vol = volumeMinimumLot(l);
  const pc = l.protocole;
  return [
    {
      icone: 'cal',
      titre: lance ? `${p.jour} jour${(p.jour ?? 0) > 1 ? 's' : ''} sur ${p.fenetre}` : p.etat === 'importe' ? 'Historique' : 'Pas encore lancé',
      detail: lance ? (fini ? 'Durée prévue atteinte' : 'Fenêtre d’évaluation en cours') : `Fenêtre de ${p.fenetre} jours après le lancement`,
    },
    {
      icone: 'chart',
      titre: vol !== null ? `${n(vol)} impressions` : 'Aucune mesure',
      detail: `${vol !== null ? 'par variante, au plus bas · ' : ''}minimum ${n(minImpressions)}`,
    },
    {
      icone: 'lock',
      titre: !pc || pc.conforme === null ? 'Protocole à contrôler' : pc.conforme ? 'Règle respectée' : 'Protocole non respecté',
      detail: pc?.resume ?? 'Contrôlé à la première mesure du lot',
    },
  ];
}

/** Ce que la fiche dit à côté de l'orbe · l'étape suivante, d'après l'état (aucun texte généré). */
export function coachLot(p: PresentationLot, s: SyntheseLot, variantes: number): { avant: string; fort: string; apres: string } {
  switch (p.etat) {
    case 'a_conclure': return { avant: 'Les verdicts sont calculés, il reste à les arbitrer. Le moteur retient :', fort: s.titre, apres: '· écris ce que chaque variante t’apprend pour conclure le lot.' };
    case 'non_concluant': return { avant: 'Aucune variante n’a tranché :', fort: s.titre, apres: '· arbitre quand même pour garder la trace de ce qui n’a rien donné.' };
    case 'conclu': return { avant: 'Lot conclu :', fort: s.titre, apres: '· ses apprentissages nourrissent les prochains briefs.' };
    case 'diffusion': return { avant: 'Le lot tourne :', fort: `jour ${p.jour ?? 1} sur ${p.fenetre}`, apres: '· pas de lecture avant la fin de la fenêtre.' };
    case 'a_importer': return { avant: 'La fenêtre est écoulée :', fort: 'des mesures manquent', apres: '· importe-les pour obtenir les verdicts.' };
    case 'composition': return { avant: 'Lot en préparation :', fort: `${variantes} variante${variantes > 1 ? 's' : ''}`, apres: '· range, complète et prépare avant de lancer.' };
    case 'pret': return { avant: 'Toutes les variantes sont prêtes :', fort: 'lance-les dans Meta avec les noms générés', apres: '· puis marque le lot lancé ici.' };
    case 'importe': return { avant: 'Historique importé :', fort: s.titre, apres: '· ses verdicts ne sont pas comparables aux tests suivis ici.' };
  }
}
