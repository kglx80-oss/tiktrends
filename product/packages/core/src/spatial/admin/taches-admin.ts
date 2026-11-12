/**
 * Tour de contrôle · suivi opérationnel · les TÂCHES DE GÉNÉRATION de toute la
 * plateforme (`studio_jobs`, RJ JB01). Pur · ni base, ni réseau, ni modèle.
 * La page lit les tâches après `porteAdmin` · ces règles décident ce qui
 * s'affiche, dans quel segment, et ce qui sort dans un fichier.
 *
 *  · libellé · jamais le code brut (`libelleOperationJob`, « Génération ·
 *    Image ») ;
 *  · segments · CALCULÉS sur l'état réel et l'âge, contre une horloge
 *    INJECTÉE (`maintenant`) · « Bloquées » = active depuis plus de
 *    `SEUIL_TACHE_BLOQUEE_MIN` minutes, seuil DÉRIVÉ des délais du worker
 *    (tableau ci-dessous) ;
 *  · coût engagé · LU au registre (`studio_budget_ledger`, `bilanRegistre`),
 *    jamais recalculé d'un tarif ;
 *  · dernière erreur · texte borné, sans secret, sans adresse (ni e-mail, ni
 *    lien, ni clé d'objet du stockage) ;
 *  · lecture seule · aucune relance ni annulation d'ici (le rapprochement d'un
 *    coût incertain a son écran, `/admin/depenses#a-reconcilier`).
 */
import { VALEUR_ABSENTE } from '../../ponctuation-ecran';
import { IMAGE_MODELS } from '../../economics';
import { IMAGES_PAR_APPEL_MAX } from '../../studios/fournisseurs/fal-image';
import { TELECHARGEMENTS_MEDIA_MAX } from '../../studios/execution/media';
import { bilanRegistre } from '../../studios/execution/registre';
import { LIBELLES_ETAT_JOB, etatReprise, libelleOperationJob } from '../../studios/execution/reprise';
import { ETATS_JOB, type EtatJob } from '../../studios/machines';
import { adminDollars, adminDuree, adminNombre } from './format';
import { LONGUEUR_MAX_TEXTE_INCIDENT, LONGUEUR_MAX_TITRE_INCIDENT } from './incidents-declares';
import { celluleSansFuite, correspondRecherche, lireSegment, paginer, LONGUEUR_MAX_RECHERCHE, type FiltresListeTour, type PageTour } from './tour-controle';
import type { SeuilApplique, TacheASeuil } from './durees-taches';

const MINUTE = 60_000;

/* ─────────────────────────────── Le seuil « bloquée » ─────────────────────────────── */

/**
 * Le plus long délai qu'on laisse à un modèle d'image du catalogue (le haut de
 * gamme, quatre fois le travail) · lu dans le catalogue, jamais recopié.
 */
const DELAI_MODELE_IMAGE_MAX_MS = Math.max(...IMAGE_MODELS.map((m) => m.timeoutMs ?? 0));

/**
 * Pourquoi 30 minutes · AUCUNE durée réelle de tâche n'est consignée dans le
 * dépôt (le proxy de la session bloque fal, aucune recette chronométrée) · le
 * seuil est donc DÉRIVÉ des délais que le worker s'accorde, pris au pire, une
 * phase après l'autre (valeurs du 11/11, vérifiées contre le code par
 * `W/test/admin-suivi-recensement.test.ts` · une valeur qui change fait tomber la
 * garde) :
 *
 * | phase                                                   | borne        | source                                                     |
 * | ------------------------------------------------------- | ------------ | ---------------------------------------------------------- |
 * | un tour du worker                                       |      2 s     | `demarrerBoucleStudio`, `intervalleMs` par défaut          |
 * | bail perdu avant soumission, reprise par un autre worker |     60 s     | `MoteurStudio`, `bailMs` par défaut                        |
 * | soumission à la file du fournisseur                     |     30 s     | `DELAI_SOUMISSION_FAL_MS`                                  |
 * | travail du fournisseur · le plus long délai du catalogue |    300 s     | `IMAGE_MODELS` (GPT Image 2 · Haute), lu ci-dessus         |
 * | lecture du suivi                                        |     20 s     | `DELAI_LECTURE_FAL_MS`                                     |
 * | téléchargements · 4 sorties × 3 essais × 60 s           |    720 s     | `IMAGES_PAR_APPEL_MAX` × `TELECHARGEMENTS_MEDIA_MAX` × `DELAI_TELECHARGEMENT_FAL_MS` |
 * | **total au pire**                                       | **1 132 s ≈ 18,9 min** |                                                  |
 *
 * Retenu · **30 minutes**, soit 1,6 fois le pire cumul · une tâche active au-delà
 * a dépassé TOUS les délais que le worker se donne, elle ne « prend » plus son
 * temps, elle est bloquée. Limite dite · le clip vidéo (Kling, file fal) n'a
 * AUCUN délai écrit dans le code · il est supposé tenir dans le délai d'image le
 * plus long. Ce seuil n'est plus qu'un REPLI · dès qu'un modèle (ou un type)
 * réunit assez de tâches saines, le seuil MESURÉ le remplace pour ses tâches
 * (`durees-taches.ts`, tableau « Durées mesurées » de `/admin/taches`).
 */
export const PHASES_DUREE_TACHE: ReadonlyArray<{ phase: string; ms: number; source: string }> = [
  { phase: 'tour du worker', ms: 2_000, source: 'demarrerBoucleStudio · intervalleMs' },
  { phase: 'bail perdu avant soumission', ms: 60_000, source: 'MoteurStudio · bailMs' },
  { phase: 'soumission', ms: 30_000, source: 'DELAI_SOUMISSION_FAL_MS' },
  { phase: 'travail du fournisseur', ms: DELAI_MODELE_IMAGE_MAX_MS, source: 'IMAGE_MODELS · timeoutMs max' },
  { phase: 'lecture du suivi', ms: 20_000, source: 'DELAI_LECTURE_FAL_MS' },
  { phase: 'téléchargements', ms: IMAGES_PAR_APPEL_MAX * TELECHARGEMENTS_MEDIA_MAX * 60_000, source: 'IMAGES_PAR_APPEL_MAX × TELECHARGEMENTS_MEDIA_MAX × DELAI_TELECHARGEMENT_FAL_MS' },
];
/** Le pire cumul des phases · 1 132 000 ms le 11/11. */
export const DUREE_TACHE_PIRE_CAS_MS = PHASES_DUREE_TACHE.reduce((s, p) => s + p.ms, 0);
/** Une tâche active depuis PLUS de 30 minutes est bloquée (voir le tableau). */
export const SEUIL_TACHE_BLOQUEE_MIN = 30;

/** Les états où le worker doit encore agir · une tâche y vieillit. */
export const ETATS_TACHE_ACTIFS: readonly EtatJob[] = ['queued', 'claimed', 'running', 'persisting', 'cancel_requested'];

/** L'âge d'une tâche, en millisecondes, contre l'horloge donnée · jamais négatif. */
export function ageTacheMs(creeLe: Date, maintenant: Date): number {
  return Math.max(0, maintenant.getTime() - creeLe.getTime());
}

/** Le seuil dérivé, appliqué quand aucune mesure n'est donnée (ou que l'effectif manque). */
export const SEUIL_DERIVE_SEUL: SeuilApplique = {
  ms: SEUIL_TACHE_BLOQUEE_MIN * MINUTE, source: 'derive', libelle: `dérivé, effectif insuffisant · ${SEUIL_TACHE_BLOQUEE_MIN} min, délais du worker`,
};

/** Bloquée · active, et lancée depuis STRICTEMENT plus que son seuil (`seuilMs`, le dérivé par défaut). */
export function tacheBloquee(t: { etat: string; creeLe: Date }, maintenant: Date, seuilMs: number = SEUIL_DERIVE_SEUL.ms): boolean {
  return (ETATS_TACHE_ACTIFS as readonly string[]).includes(t.etat) && ageTacheMs(t.creeLe, maintenant) > seuilMs;
}

/* ─────────────────────────────── Segments ─────────────────────────────── */

export const SEGMENTS_TACHES = ['echec', 'bloquees', 'en-cours', 'rapprochement', 'annulees', 'terminees'] as const;
export type SegmentTache = (typeof SEGMENTS_TACHES)[number];

export const LIBELLE_SEGMENT_TACHE: Readonly<Record<SegmentTache | 'tous', string>> = {
  tous: 'Toutes', echec: 'En échec', bloquees: 'Bloquées', 'en-cours': 'En cours', rapprochement: 'Coût à rapprocher', annulees: 'Annulées', terminees: 'Terminées',
};

export const DEFINITION_SEGMENT_TACHE: Readonly<Record<SegmentTache | 'tous', string>> = {
  tous: 'Toutes les tâches lues, de tous les espaces.',
  echec: 'Terminées en échec · rien n’a été livré.',
  bloquees: `Encore actives (en file, prises, en cours, en enregistrement ou en annulation) depuis plus que le seuil de leur modèle · mesuré quand l’effectif suffit, sinon ${SEUIL_TACHE_BLOQUEE_MIN} minutes dérivées des délais du worker (tableau « Durées mesurées »).`,
  'en-cours': 'Actives depuis moins que le seuil de leur modèle · le worker y travaille.',
  rapprochement: 'Interrompues, coût incertain chez le fournisseur · à rapprocher avant toute relance.',
  annulees: 'Annulées · un nouvel essai est une nouvelle tâche.',
  terminees: 'Terminées · fichier enregistré.',
};

/** Le segment d'une tâche · un seul, calculé sur son état réel et son âge. `null` pour un état inconnu (« Toutes » seulement). */
export function segmentTache(t: { etat: string; creeLe: Date }, maintenant: Date, seuilMs: number = SEUIL_DERIVE_SEUL.ms): SegmentTache | null {
  switch (t.etat) {
    case 'completed': return 'terminees';
    case 'failed': return 'echec';
    case 'cancelled': return 'annulees';
    case 'reconciliation_required': return 'rapprochement';
    default: return (ETATS_TACHE_ACTIFS as readonly string[]).includes(t.etat) ? (tacheBloquee(t, maintenant, seuilMs) ? 'bloquees' : 'en-cours') : null;
  }
}

/* ─────────────────────────────── Textes d'une ligne ─────────────────────────────── */

/** La dernière erreur affichée · au-delà, coupée (« … ») · le motif entier reste à la tâche, en base. */
export const LONGUEUR_MAX_ERREUR_TACHE = 200;

/** Une URL quelconque, et une clé d'objet du stockage (`assets/<espace>/…`, `studios/…`). */
const LIEN = /\bhttps?:\/\/[^\s"'<>)]+/gi;
const CLE_OBJET = /\b(?:assets|studios|uploads|brands)\/[0-9a-z][\w./-]*/gi;

/** Un texte qui peut s'afficher et sortir · aucun secret, aucune adresse e-mail, aucun lien, aucune clé d'objet. */
export function texteSansAdresse(v: unknown): string {
  return celluleSansFuite(String(v ?? '').replace(LIEN, '[lien masqué]').replace(CLE_OBJET, '[fichier masqué]'));
}

/** Un texte borné à `n` caractères · « … » quand il est coupé. */
export function borne(v: string, n: number): string {
  const s = v.replace(/\s+/g, ' ').trim();
  return s.length > n ? `${s.slice(0, Math.max(0, n - 1)).trimEnd()}…` : s;
}

/**
 * La dernière erreur d'une tâche (`studio_jobs.error`, jsonb) · le motif écrit
 * par le worker (`{ issue, motif }`, `{ code, motif }`), à défaut le message ou
 * le code · `null` sans erreur.
 */
export function erreurTache(e: unknown): string | null {
  if (!e || typeof e !== 'object') return null;
  const o = e as Record<string, unknown>;
  const brut = [o.motif, o.message, o.code].find((x) => typeof x === 'string' && x.trim());
  return brut ? borne(texteSansAdresse(brut), LONGUEUR_MAX_ERREUR_TACHE) : null;
}

/** Un mouvement du registre de budget d'une tâche (`studio_budget_ledger`), tel qu'il est lu. */
export interface MouvementTache { kind: string; credits: number; usdMicros: number }

const credits = (n: number) => `${adminNombre(n)} crédit${Math.abs(n) > 1 ? 's' : ''}`;

/**
 * Le coût ENGAGÉ · LU au registre, jamais recalculé · réglé (le règlement
 * fait foi), sinon réservé (réserve encore ouverte), sinon rendu.
 */
export function coutEngageTache(mouvements: readonly MouvementTache[]): string {
  if (!mouvements.length) return VALEUR_ABSENTE;
  const b = bilanRegistre(mouvements.map((m) => ({ kind: m.kind as 'reserve', credits: Number(m.credits), usdMicros: Number(m.usdMicros) })));
  if (b.regle) return `Réglé · ${adminDollars(b.settle.usdMicros / 1e6)} · ${credits(b.settle.credits)}`;
  if (b.ouvert.credits > 0 || b.ouvert.usdMicros > 0) return `Réservé · ${adminDollars(b.ouvert.usdMicros / 1e6)} · ${credits(b.ouvert.credits)}`;
  if (b.release.credits > 0 || b.release.usdMicros > 0) return 'Rendu · rien de réglé';
  return VALEUR_ABSENTE;
}

/* ─────────────────────────────── La table ─────────────────────────────── */

/** Une tâche lue en base (après la porte) · les champs que la table montre. */
export interface TacheLue {
  id: string;
  operation: string;
  etat: string;
  /** Les lignes de l'instantané (`snapshot.lignes`) · ce que la tâche produit (profil `animation` · vidéo). */
  lignes: ReadonlyArray<{ operation: string; profil?: string }> | null;
  /** Le modèle du dernier corps envoyé au fournisseur (`job.provider.payload`) · absent avant la soumission. */
  modele?: string | null;
  projet: string | null;
  espace: string | null;
  creeLe: Date;
  erreur: unknown;
  registre: readonly MouvementTache[];
}

export interface LigneTacheAdmin {
  id: string;
  segment: SegmentTache | null;
  tache: string;
  etat: { libelle: string; classe: '' | 'g' | 'w' | 'r' | 'c' };
  projet: string;
  espace: string;
  age: string;
  cout: string;
  erreur: string | null;
  /** Les gestes que la ligne propose · des LIENS, jamais une écriture d'ici. */
  declarer: boolean;
  rapprocher: boolean;
  /** Le seuil « bloquée » appliqué à CETTE tâche (mesuré ou dérivé). */
  seuil: SeuilApplique;
}

const CLASSE_TON: Readonly<Record<string, '' | 'g' | 'w' | 'r' | 'c'>> = { attente: 'c', termine: 'g', echec: 'r', interrompu: 'w' };

/** Le seuil de chaque tâche · le résolveur de la mesure (`resolveurSeuils`), à défaut le seuil dérivé. */
export type SeuilDe = (t: TacheASeuil) => SeuilApplique;
const seuilDerive: SeuilDe = () => SEUIL_DERIVE_SEUL;

export function ligneTacheAdmin(t: TacheLue, maintenant: Date, seuilDe: SeuilDe = seuilDerive): LigneTacheAdmin {
  const seuil = seuilDe(t);
  const segment = segmentTache(t, maintenant, seuil.ms);
  const connu = (ETATS_JOB as readonly string[]).includes(t.etat);
  const lib = connu ? LIBELLES_ETAT_JOB[t.etat as EtatJob] : 'État inconnu';
  const ton = connu ? etatReprise(t.etat as EtatJob).ton : '';
  return {
    id: t.id, segment,
    tache: libelleOperationJob(t.operation, t.lignes),
    etat: segment === 'bloquees' ? { libelle: `${lib} · bloquée`, classe: 'r' } : { libelle: lib, classe: CLASSE_TON[ton] ?? '' },
    projet: t.projet?.trim() || 'Projet sans titre',
    espace: t.espace?.trim() || 'Espace supprimé',
    age: adminDuree(ageTacheMs(t.creeLe, maintenant) / MINUTE),
    cout: coutEngageTache(t.registre),
    erreur: erreurTache(t.erreur),
    declarer: segment === 'echec',
    rapprocher: segment === 'rapprochement',
    seuil,
  };
}

/** Les colonnes de la table · les MÊMES dans l'export. */
export const COLONNES_TACHES_ADMIN = ['Tâche', 'État', 'Projet', 'Espace', 'Âge', 'Coût engagé', 'Dernière erreur'] as const;
export const cellulesTacheAdmin = (l: LigneTacheAdmin): string[] => [l.tache, l.etat.libelle, l.projet, l.espace, l.age, l.cout, l.erreur ?? VALEUR_ABSENTE];

export interface SegmentTacheCompte { cle: SegmentTache | 'tous'; libelle: string; n: number; definition: string }

export interface TableTachesAdmin {
  segments: SegmentTacheCompte[];
  segment: string;
  q: string;
  /** TOUTES les lignes du filtre · ce que l'export reprend. */
  filtrees: LigneTacheAdmin[];
  page: PageTour<LigneTacheAdmin>;
}

/**
 * La table des tâches d'un filtre · segment, puis recherche (tâche, état,
 * projet, espace, erreur, identifiant), puis la page · la page ET l'export
 * appellent CETTE fonction, avec le MÊME résolveur de seuils.
 */
export function tableTachesAdmin(taches: readonly TacheLue[], maintenant: Date, f: FiltresListeTour, seuilDe: SeuilDe = seuilDerive): TableTachesAdmin {
  const lignes = taches.map((t) => ligneTacheAdmin(t, maintenant, seuilDe));
  const n = new Map<string, number>();
  for (const l of lignes) if (l.segment) n.set(l.segment, (n.get(l.segment) ?? 0) + 1);
  const segments: SegmentTacheCompte[] = [
    { cle: 'tous', libelle: LIBELLE_SEGMENT_TACHE.tous, n: lignes.length, definition: DEFINITION_SEGMENT_TACHE.tous },
    ...SEGMENTS_TACHES.map((c) => ({ cle: c, libelle: LIBELLE_SEGMENT_TACHE[c], n: n.get(c) ?? 0, definition: DEFINITION_SEGMENT_TACHE[c] })),
  ];
  const segment = lireSegment(f.segment, segments);
  const q = String(f.q ?? '').trim().slice(0, LONGUEUR_MAX_RECHERCHE);
  const filtrees = lignes.filter((l) => (segment === 'tous' || l.segment === segment) && correspondRecherche([l.tache, l.etat.libelle, l.projet, l.espace, l.erreur, l.id], q));
  return { segments, segment, q, filtrees, page: paginer(filtrees, f.page ?? 1) };
}

/* ─────────────────────────────── Déclarer un incident ─────────────────────────────── */

/**
 * L'incident PRÉ-REMPLI depuis une tâche en échec · titre et constat seulement,
 * rien n'est écrit · la déclaration reste le clic de la personne
 * (`ouvrirIncidentAction`, validée au noyau).
 */
export function incidentDepuisTache(l: LigneTacheAdmin): { titre: string; constat: string } {
  const titre = borne(`Tâche en échec · ${l.tache} · ${l.espace}`, LONGUEUR_MAX_TITRE_INCIDENT);
  const constat = borne(
    `Tâche ${l.id} (${l.tache}) · projet « ${l.projet} », espace « ${l.espace} » · état ${l.etat.libelle}, lancée il y a ${l.age} · coût engagé ${l.cout} · dernière erreur · ${l.erreur ?? 'aucune consignée'}.`,
    LONGUEUR_MAX_TEXTE_INCIDENT,
  );
  return { titre: texteSansAdresse(titre), constat: texteSansAdresse(constat) };
}

/** L'adresse du geste « Déclarer un incident » d'une tâche · le formulaire de #1070, pré-rempli, rien d'écrit. */
export const adresseIncidentTache = (id: string) => `/admin/incidents?tache=${encodeURIComponent(id)}#declarer`;
/** Le rapprochement d'un coût incertain · l'écran existant des dépenses (JB02). */
export const ADRESSE_RAPPROCHEMENT = '/admin/depenses#a-reconcilier';
