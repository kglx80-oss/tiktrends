/**
 * UX V5 · l'Accueil sur les VRAIES données.
 *
 * ── Le défaut que ce module ferme ────────────────────────────────────────────
 *
 * La maquette V5 de l'Accueil est remplie de chiffres fictifs · « 2 choses
 * vous attendent », « 27 % taux d'accroche », « Lot #1 conclu », quatre KPI,
 * « 5 éléments à compléter ». Recopier la maquette, c'est afficher des chiffres
 * que personne n'a mesurés. Ce module décide, à partir de lectures RÉELLES
 * fournies par l'appelant, ce qui a le droit d'être affiché · et se tait
 * quand la source manque (le silence est une conclusion valable).
 *
 * ── Ce que ce module décide (pur · ni base, ni réseau, ni horloge) ──────────
 *
 *  · `surtitreAccueil` · la date du jour (fr-FR, fuseau de Paris) et la marque ;
 *  · `chosesQuiAttendent` · la phrase « N choses t'attendent », calculée
 *    seulement sur les sources lues (null = source fermée ou illisible) ;
 *  · `gagnantsProuves`, `prochainesIterationsAccueil`, `mesureIteration` ·
 *    les cartes « Prochaines itérations » · SEULEMENT des gagnantes prouvées
 *    (verdict arbitré, comparable au protocole), avec leur métrique mesurée,
 *    sa période et sa source ;
 *  · `etatProchainesIterations` · quel état montrer (fermé, offre, sans marque,
 *    erreur, vide, liste) ;
 *  · `completudeFicheMarque` · les éléments réellement manquants de la fiche ;
 *  · `tuilesAccueil` · les tuiles d'action que les droits ouvrent ;
 *  · `kpiAccueil` · les KPI dont la source a été lue, avec leur période.
 *
 * Aucun devis n'est affiché · il n'en existe pas avant la génération (G13).
 */

import { estGagnanteValidee, LIBELLE_VERDICT } from './adsmap/verdict-libelle';
import { usableImageUrl } from './adsmap/written-source';
import { verdictEffectif, type VerdictValue } from './adsmap/types';
import { lienIterationStudio } from './studios/anciennes-adresses';
import { CHEMIN_IMPORT_RESULTATS, CHEMIN_SUITES } from './parcours-boucle';
import type { EtapeProjet } from './studios/brief';

/* -------------------------------------------------------------------------- */
/*  En-tête · date du jour et marque active                                   */
/* -------------------------------------------------------------------------- */

/** Le fuseau de l'Accueil · le produit est français, la date suit Paris. */
export const FUSEAU_ACCUEIL = 'Europe/Paris';

/** « jeudi 15 octobre » · la date du jour en français, au fuseau de Paris. */
export function dateDuJourAccueil(maintenant: Date, fuseau: string = FUSEAU_ACCUEIL): string {
  return new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: fuseau }).format(maintenant);
}

/** Le surtitre · « jeudi 15 octobre · Neva », ou la date seule sans marque active. */
export function surtitreAccueil(p: { maintenant: Date; marque: string | null; fuseau?: string }): string {
  const date = dateDuJourAccueil(p.maintenant, p.fuseau);
  const marque = p.marque?.trim();
  return marque ? `${date} · ${marque}` : date;
}

/* -------------------------------------------------------------------------- */
/*  « N choses t'attendent »                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Les sources de la phrase · `null` = source FERMÉE au rôle ou ILLISIBLE ·
 * elle ne compte pas, et ne fait pas dire « 0 ».
 *
 * Écartée volontairement · « jobs terminés non vus » (studio_jobs) · aucune
 * trace de consultation n'existe pour un job livré, un compteur « non vus »
 * serait inventé.
 */
export interface SourcesAttente {
  /** Gagnantes PROUVÉES (verdict arbitré) qui ont une suite proposée · adsmap_verdicts + plan d'itération. */
  iterations: number | null;
  /** Nouvelles pubs des concurrents suivis, pas encore vues · brand_tracker_events.seen_at nul. */
  veille: number | null;
  /** Notifications non lues de la personne, hors veille (déjà comptée) · notifications.read_at nul. */
  notifications: number | null;
}

export type CleAttente = keyof SourcesAttente;

export interface ChoseQuiAttend {
  cle: CleAttente;
  n: number;
  texte: string;
  /** Où la traiter · `null` quand elle se lit ailleurs (la cloche). */
  href: string | null;
  /** D'où vient le chiffre · posé en attribut, cité dans la PR. */
  source: string;
}

export interface PhraseAttente {
  total: number;
  /** « 3 choses t'attendent » · ou « Rien ne t'attend pour l'instant. » quand tout est lu et vaut 0. */
  tete: string;
  elements: ChoseQuiAttend[];
}

export const SOURCE_ATTENTE: Readonly<Record<CleAttente, string>> = {
  iterations: 'adsmap_verdicts (arbitrés) · plan d’itération',
  veille: 'brand_tracker_events (non vues)',
  notifications: 'notifications (non lues, hors veille)',
};

const HREF_ATTENTE: Readonly<Record<CleAttente, string | null>> = {
  iterations: '#prochaines-iterations',
  veille: '/saved?onglet=nouveautes',
  notifications: null,
};

function texteAttente(cle: CleAttente, n: number): string {
  const pl = n > 1;
  switch (cle) {
    case 'iterations': return `${n} gagnante${pl ? 's' : ''} à itérer`;
    case 'veille': return `${n} nouvelle${pl ? 's' : ''} pub${pl ? 's' : ''} chez tes concurrents suivis`;
    case 'notifications': return `${n} notification${pl ? 's' : ''} non lue${pl ? 's' : ''}`;
  }
}

/**
 * La phrase d'attente · `null` quand AUCUNE source n'a été lue (on ne dit rien
 * plutôt qu'un chiffre inventé). Un compteur négatif ou non entier est rejeté
 * comme une source illisible.
 */
export function chosesQuiAttendent(s: SourcesAttente): PhraseAttente | null {
  const ordre: CleAttente[] = ['iterations', 'veille', 'notifications'];
  const lues = ordre.filter((c) => { const v = s[c]; return typeof v === 'number' && Number.isInteger(v) && v >= 0; });
  if (lues.length === 0) return null;
  const elements = lues
    .filter((c) => (s[c] as number) > 0)
    .map((c) => ({ cle: c, n: s[c] as number, texte: texteAttente(c, s[c] as number), href: HREF_ATTENTE[c], source: SOURCE_ATTENTE[c] }));
  const total = elements.reduce((t, e) => t + e.n, 0);
  const tete = total === 0
    ? 'Rien ne t’attend pour l’instant.'
    : `${total} chose${total > 1 ? 's' : ''} t’attend${total > 1 ? 'ent' : ''}`;
  return { total, tete, elements };
}

/* -------------------------------------------------------------------------- */
/*  Prochaines itérations · gagnantes prouvées seulement                      */
/* -------------------------------------------------------------------------- */

/** Ce que la carte lit d'une ligne du plan d'itération (`IterationRow`). */
export interface LigneIterationAccueil {
  adId: string;
  label: string;
  conceptTitle: string;
  variableLabel: string;
  freezeLabels: readonly string[];
  rationale: string;
  edgeLegal: boolean;
  parentVerdict: VerdictValue;
  parentComparable: boolean;
}

/**
 * Les lignes dont le parent est une victoire PROUVÉE · verdict arbitré (le
 * plan ne lit que ceux-là), gagnant au protocole (`estGagnanteValidee`), et
 * suite filiée (`edgeLegal`). Une piste relative, une perdante ou un import
 * non comparable n'y figure jamais. Une seule carte par gagnante (la première
 * proposition, l'ordre du plan fait foi).
 */
export function gagnantsProuves<T extends LigneIterationAccueil>(rows: readonly T[]): T[] {
  const vus = new Set<string>();
  const out: T[] = [];
  for (const r of rows) {
    if (!r.edgeLegal || !estGagnanteValidee(r.parentVerdict, r.parentComparable)) continue;
    if (vus.has(r.adId)) continue;
    vus.add(r.adId);
    out.push(r);
  }
  return out;
}

/** Ce que la page a lu autour d'une gagnante · verdict, lot, apprentissage. */
export interface ContexteGagnante {
  /** `adsmap_verdicts.metrics_agg_json` tel que lu · forme non garantie. */
  metricsAgg: unknown;
  /** `adsmap_ads.platform`. */
  plateforme: string | null;
  /** Le lot de test de l'ad (`adsmap_batches`), s'il existe. */
  lot: { numero: number; statut: string } | null;
  /** Un apprentissage VALIDÉ et non réfuté est rattaché à l'ad (`adsmap_learnings`). */
  apprentissageValide: boolean;
  /**
   * La vignette média RÉELLE de la gagnante · `adsmap_ads.asset_url` ou la
   * miniature de sa créative (`creatives.thumb_url`), telle que lue. Jamais une
   * image inventée · `prochainesIterationsAccueil` la valide par `usableImageUrl`
   * (une page de partage ou un lien non affichable devient `null`).
   */
  vignette?: string | null;
}

export interface MesureIteration {
  valeur: string;
  libelle: string;
  /** « sur 7 jours de diffusion · mesuré le 12 oct. » · jamais vide. */
  periode: string;
  /** « Meta · synchro Adsmap ». */
  source: string;
}

const PLATEFORME: Readonly<Record<string, string>> = { meta: 'Meta', tiktok: 'TikTok' };

const nombre = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const pct = (v: number) => `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 }).format(v * 100)} %`;

/**
 * La métrique d'une gagnante · la plus proche de l'achat parmi celles
 * mesurées · coût par achat, puis ROAS, puis taux de clic, puis taux
 * d'accroche. Sans période lisible (jours de diffusion ou date de mesure),
 * rien · une métrique sans période ne dit pas quand elle a été vraie.
 */
export function mesureIteration(metricsAgg: unknown, plateforme: string | null, fuseau: string = FUSEAU_ACCUEIL): MesureIteration | null {
  if (!metricsAgg || typeof metricsAgg !== 'object') return null;
  const a = metricsAgg as Record<string, unknown>;
  const achats = nombre(a.purchases);
  const cpa = nombre(a.cpa);
  const roas = nombre(a.roas);
  const ctr = nombre(a.ctr);
  const hook = nombre(a.hookRate);

  let m: { valeur: string; libelle: string } | null = null;
  if (cpa !== null && cpa > 0 && (achats ?? 0) > 0) {
    m = { valeur: new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(cpa), libelle: 'coût par achat' };
  } else if (roas !== null && roas > 0) {
    m = { valeur: new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(roas), libelle: 'retour sur dépense (ROAS)' };
  } else if (ctr !== null && ctr > 0) {
    m = { valeur: pct(ctr), libelle: 'taux de clic' };
  } else if (hook !== null && hook > 0) {
    m = { valeur: pct(hook), libelle: 'taux d’accroche' };
  }
  if (!m) return null;

  const morceaux: string[] = [];
  const jours = nombre(a.daysElapsed);
  if (jours !== null && jours > 0) morceaux.push(`sur ${Math.round(jours)} jour${Math.round(jours) > 1 ? 's' : ''} de diffusion`);
  const synchro = typeof a.syncedAt === 'string' ? new Date(a.syncedAt) : null;
  if (synchro && Number.isFinite(synchro.getTime())) {
    morceaux.push(`mesuré le ${new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', timeZone: fuseau }).format(synchro)}`);
  }
  if (morceaux.length === 0) return null;

  const nomPlateforme = (plateforme && PLATEFORME[plateforme]) || null;
  return {
    ...m,
    periode: morceaux.join(' · '),
    source: nomPlateforme ? `${nomPlateforme} · synchro Adsmap` : 'synchro Adsmap',
  };
}

export interface CarteIterationAccueil {
  adId: string;
  titre: string;
  /**
   * La vignette média réelle de la gagnante · `null` quand aucune URL affichable
   * n'existe (la carte reste en texte seul · jamais une image de remplacement).
   */
  vignette: string | null;
  /** « Gagnante », « Gagnante naissante » · le verdict effectif arbitré. */
  verdict: string;
  /** « Lot #3 conclu », « Lot #3 », ou « Hors lot ». */
  lot: string;
  apprentissageValide: boolean;
  mesure: MesureIteration | null;
  garde: string | null;
  change: string;
  raison: string;
  /** La préparation du projet, brief d'itération repris · `null` quand le rôle ne peut pas créer. */
  iterer: string | null;
}

/** Combien de cartes l'Accueil montre · la maquette V5 en pose deux, le reste vit dans Suites. */
export const MAX_ITERATIONS_ACCUEIL = 2;

const liste = (xs: readonly string[]): string => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} et ${xs[xs.length - 1]}`);

export function libelleLot(lot: ContexteGagnante['lot']): string {
  if (!lot) return 'Hors lot';
  return lot.statut === 'analyzed' ? `Lot #${lot.numero} conclu` : `Lot #${lot.numero}`;
}

/**
 * Les cartes de l'Accueil · gagnantes prouvées seulement, `max` au plus.
 * `peutIterer` · le rôle peut-il créer un projet (sinon aucun CTA).
 */
export function prochainesIterationsAccueil<T extends LigneIterationAccueil>(
  rows: readonly T[],
  contexte: (adId: string) => ContexteGagnante | undefined,
  o: { peutIterer: boolean; max?: number; fuseau?: string },
): CarteIterationAccueil[] {
  return gagnantsProuves(rows).slice(0, o.max ?? MAX_ITERATIONS_ACCUEIL).map((r) => {
    const c = contexte(r.adId);
    const eff = verdictEffectif(r.parentVerdict, r.parentComparable) ?? r.parentVerdict;
    return {
      adId: r.adId,
      titre: r.label,
      vignette: usableImageUrl(c?.vignette ?? null),
      verdict: LIBELLE_VERDICT[eff].court,
      lot: libelleLot(c?.lot ?? null),
      apprentissageValide: !!c?.apprentissageValide,
      mesure: c ? mesureIteration(c.metricsAgg, c.plateforme, o.fuseau) : null,
      garde: r.freezeLabels.length ? `Garde · ${liste(r.freezeLabels)}` : null,
      change: `Change · ${r.variableLabel}`,
      raison: r.rationale,
      iterer: o.peutIterer ? lienIterationStudio(r.adId) : null,
    };
  });
}

export type EtatProchainesIterations =
  | { etat: 'ferme' }
  | { etat: 'offre'; message: string }
  | { etat: 'sans-marque'; message: string }
  | { etat: 'erreur'; message: string }
  | { etat: 'vide'; message: string; resultats: string }
  | { etat: 'liste'; cartes: CarteIterationAccueil[]; total: number; boucle: string; autres: string };

/** Résultats (Adsmap) · « Voir la boucle » et l'état vide y mènent. */
export const CHEMIN_RESULTATS = '/adsmap';

/**
 * Quel état montrer · `refus` vient de la garde d'accès Adsmap (rôle avant
 * offre, comme `denyReason`) · un refus de RÔLE ne montre rien (la note de
 * rôle de l'Accueil le dit déjà), un refus d'OFFRE dit pourquoi.
 */
export function etatProchainesIterations<T extends LigneIterationAccueil>(p: {
  refus: 'role' | 'plan' | null;
  marqueActive: boolean;
  lecture: { ok: true; rows: readonly T[] } | { ok: false; message: string } | null;
  contexte: (adId: string) => ContexteGagnante | undefined;
  peutIterer: boolean;
  fuseau?: string;
}): EtatProchainesIterations {
  if (p.refus === 'role') return { etat: 'ferme' };
  if (p.refus === 'plan') return { etat: 'offre', message: 'Les prochaines itérations viennent de Résultats, disponible à partir de l’offre Plus.' };
  if (!p.marqueActive) return { etat: 'sans-marque', message: 'Choisis une marque active pour lire ses prochaines itérations.' };
  if (!p.lecture) return { etat: 'ferme' };
  if (!p.lecture.ok) return { etat: 'erreur', message: p.lecture.message };
  const prouves = gagnantsProuves(p.lecture.rows);
  if (prouves.length === 0) {
    return { etat: 'vide', message: 'Aucun test conclu pour l’instant · les itérations apparaissent ici dès qu’un verdict gagnant est arbitré.', resultats: CHEMIN_RESULTATS };
  }
  return {
    etat: 'liste',
    cartes: prochainesIterationsAccueil(prouves, p.contexte, { peutIterer: p.peutIterer, fuseau: p.fuseau }),
    total: prouves.length,
    boucle: CHEMIN_RESULTATS,
    autres: CHEMIN_SUITES,
  };
}

/* -------------------------------------------------------------------------- */
/*  Fiche marque · ce qui manque VRAIMENT                                     */
/* -------------------------------------------------------------------------- */

/** Ce que la fiche marque contient · colonnes de `brands` et comptes de ses tables. */
export interface FicheMarqueLue {
  description: string | null;
  usp: string | null;
  audience: string | null;
  category: string | null;
  categoryNeeds: string | null;
  tone: string | null;
  industryTags: number;
  colors: number;
  scenarios: number;
  personas: number;
  produits: number;
  concurrents: number;
}

/**
 * Les douze éléments du profil, dans l'ordre de l'aperçu de la fiche
 * (`/brands/[id]`) · c'est le même calcul de complétude, déplacé au noyau.
 */
export const ELEMENTS_FICHE_MARQUE: ReadonlyArray<{ cle: keyof FicheMarqueLue; libelle: string }> = [
  { cle: 'description', libelle: 'la description' },
  { cle: 'usp', libelle: 'la promesse (USP)' },
  { cle: 'audience', libelle: 'l’audience' },
  { cle: 'category', libelle: 'la catégorie' },
  { cle: 'categoryNeeds', libelle: 'les besoins de la catégorie' },
  { cle: 'tone', libelle: 'le ton' },
  { cle: 'industryTags', libelle: 'les tags du secteur' },
  { cle: 'colors', libelle: 'les couleurs' },
  { cle: 'scenarios', libelle: 'les scénarios d’usage' },
  { cle: 'personas', libelle: 'les personas' },
  { cle: 'produits', libelle: 'les produits' },
  { cle: 'concurrents', libelle: 'les concurrents' },
];

export interface CompletudeFiche {
  /** Un booléen par élément, dans l'ordre de `ELEMENTS_FICHE_MARQUE`. */
  checks: boolean[];
  score: number;
  manques: string[];
}

export function completudeFicheMarque(f: FicheMarqueLue): CompletudeFiche {
  const checks = ELEMENTS_FICHE_MARQUE.map(({ cle }) => {
    const v = f[cle];
    return typeof v === 'number' ? v > 0 : !!(v && v.trim());
  });
  const faits = checks.filter(Boolean).length;
  return {
    checks,
    score: Math.round((faits / checks.length) * 100),
    manques: ELEMENTS_FICHE_MARQUE.filter((_, i) => !checks[i]).map((e) => e.libelle),
  };
}

/* -------------------------------------------------------------------------- */
/*  Tuiles d'action                                                           */
/* -------------------------------------------------------------------------- */

export interface TuileAccueil {
  cle: 'nouveau' | 'veille' | 'jarvis' | 'importer' | 'fiche';
  titre: string;
  sous: string;
  href: string;
  icone: string;
  primaire: boolean;
}

/**
 * Les tuiles que les droits ouvrent · chaque entrée vaut `null`/`false`
 * quand le droit (rôle ET offre) manque · une tuile fermée est ABSENTE.
 * La fiche marque n'apparaît que s'il y manque réellement quelque chose.
 */
export function tuilesAccueil(p: {
  nouveauProjet: string | null;
  veille: boolean;
  jarvis: boolean;
  importer: boolean;
  fiche: { href: string; manques: readonly string[] } | null;
}): TuileAccueil[] {
  const out: TuileAccueil[] = [];
  if (p.nouveauProjet) out.push({ cle: 'nouveau', titre: 'Nouveau projet', sous: 'Brief puis création, étape par étape', href: p.nouveauProjet, icone: 'plus', primaire: true });
  if (p.veille) out.push({ cle: 'veille', titre: 'Explorer la Veille', sous: 'Créatives, formats, concurrents', href: '/veille', icone: 'search', primaire: false });
  if (p.jarvis) out.push({ cle: 'jarvis', titre: 'Demander à Jarvis', sous: 'Angles, accroches, analyses', href: '/jarvis', icone: 'chat', primaire: false });
  if (p.importer) out.push({ cle: 'importer', titre: 'Importer des résultats', sous: 'Relier les mesures à tes créations', href: CHEMIN_IMPORT_RESULTATS, icone: 'upload', primaire: false });
  if (p.fiche && p.fiche.manques.length > 0) {
    const m = p.fiche.manques;
    const sous = m.length === 1 ? `À compléter · ${m[0]}` : `${m.length} éléments à compléter · ${m[0]}, ${m[1]}${m.length > 2 ? '…' : ''}`;
    out.push({ cle: 'fiche', titre: 'Fiche marque', sous, href: p.fiche.href, icone: 'tag', primaire: false });
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/*  KPI                                                                       */
/* -------------------------------------------------------------------------- */

/** Les sources des KPI · `null` = fermée au rôle/offre, ou illisible · le KPI est alors ABSENT. */
export interface SourcesKpi {
  /** studio_projects actifs dans la portée de la personne (lecture de la liste des projets, bornée à `plafond`). */
  projets: { n: number; plafond: number } | null;
  /** saved_ads de la marque active (de l'espace sans marque active) · `dossiers` = collections distinctes. */
  sauvegardees: { n: number; dossiers: number } | null;
  /** brand_tracker_events créés ces `jours` derniers jours · `suivies` = concurrents suivis (followed_brands). */
  nouveautes: { n: number; jours: number; suivies: number } | null;
  /** adsmap_ads rattachées à un lot `testing` de la marque active (adsmap_batches). */
  enTest: { n: number; lots: readonly number[] } | null;
}

export interface KpiAccueil {
  cle: keyof SourcesKpi;
  libelle: string;
  valeur: string;
  detail: string;
  periode: string;
  source: string;
  href: string;
}

const okN = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 0;

/** Les KPI dont la source a été lue · un compteur illisible fait taire SON KPI, pas les autres. */
export function kpiAccueil(s: SourcesKpi): KpiAccueil[] {
  const out: KpiAccueil[] = [];
  if (s.projets && okN(s.projets.n) && okN(s.projets.plafond)) {
    const borne = s.projets.n >= s.projets.plafond && s.projets.plafond > 0;
    out.push({
      cle: 'projets', libelle: 'Projets actifs', valeur: borne ? `${s.projets.plafond}+` : String(s.projets.n),
      detail: 'dans les marques de ta portée', periode: 'à ce jour',
      source: 'studio_projects (actifs, portée)', href: '/studio/projets?toutes=1',
    });
  }
  if (s.sauvegardees && okN(s.sauvegardees.n) && okN(s.sauvegardees.dossiers)) {
    const d = s.sauvegardees.dossiers;
    out.push({
      cle: 'sauvegardees', libelle: 'Créatives sauvegardées', valeur: String(s.sauvegardees.n),
      detail: d === 0 ? 'aucune collection' : `${d} collection${d > 1 ? 's' : ''}`, periode: 'au total',
      source: 'saved_ads', href: '/saved',
    });
  }
  // Sans concurrent suivi, « 0 nouveauté » ne mesure rien · le KPI se tait.
  if (s.nouveautes && okN(s.nouveautes.n) && okN(s.nouveautes.suivies) && s.nouveautes.suivies > 0 && okN(s.nouveautes.jours) && s.nouveautes.jours > 0) {
    const k = s.nouveautes.suivies;
    out.push({
      cle: 'nouveautes', libelle: 'Nouveautés des concurrents', valeur: String(s.nouveautes.n),
      detail: `${k} concurrent${k > 1 ? 's' : ''} suivi${k > 1 ? 's' : ''}`, periode: `ces ${s.nouveautes.jours} derniers jours`,
      source: 'brand_tracker_events', href: '/saved?onglet=nouveautes',
    });
  }
  if (s.enTest && okN(s.enTest.n) && s.enTest.lots.every(okN)) {
    const lots = [...new Set(s.enTest.lots)].sort((a, b) => a - b);
    out.push({
      cle: 'enTest', libelle: 'Variantes en test', valeur: String(s.enTest.n),
      detail: lots.length === 0 ? 'aucun lot en test' : `${lots.length > 1 ? 'lots' : 'lot'} ${liste(lots.map((n) => `#${n}`))}`,
      periode: 'en ce moment', source: 'adsmap_batches (en test) · adsmap_ads', href: CHEMIN_RESULTATS,
    });
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/*  Projets · barre d'étapes                                                  */
/* -------------------------------------------------------------------------- */

/** L'ordre des étapes d'un projet · la barre de la carte « Reprendre » en remplit autant. */
export const ORDRE_ETAPES_PROJET: readonly EtapeProjet[] = ['brief_a_completer', 'brief_pret', 'production'];

/** Rang 1 à 3 de l'étape · une étape inconnue compte pour la première. */
export function rangEtapeProjet(etape: EtapeProjet): number {
  return Math.max(0, ORDRE_ETAPES_PROJET.indexOf(etape)) + 1;
}
