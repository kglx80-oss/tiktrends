/**
 * Tour de contrôle · suivi opérationnel · les VRAIES durées des tâches de
 * génération, et le seuil « bloquée » qui s'en déduit (RJ JB01, suite de
 * #1072). Pur · ni base, ni réseau, ni modèle. La page lit les tâches
 * terminées et leurs transitions après `porteAdmin` · ces règles mesurent,
 * décident le seuil de chaque tâche et ce que le tableau « Durées mesurées »
 * montre.
 *
 * ── Ce qui est RÉELLEMENT écrit, recensé dans le code (12/11) ─────────────────
 *
 * | horodatage                                   | écrit par                                         | horloge        | lu ici |
 * | -------------------------------------------- | ------------------------------------------------- | -------------- | ------ |
 * | `studio_jobs.created_at`                     | l'approbation du devis (`commandes.ts`)           | base, `now()`  | oui · début |
 * | `studio_audit_events` `job.<état>`           | CHAQUE transition du worker (`MoteurStudio.transition`, même transaction) | base, `now()` | oui · bornes des phases |
 * | `studio_audit_events` `job.provider.payload` | `preparateurFal`, juste avant l'envoi à fal, `details.modele` | base, `now()` | oui · fin de la soumission, modèle |
 * | `studio_jobs.finished_at`                    | la transition terminale                          | worker         | repli, sans transition |
 * | `studio_job_attempts.started_at`             | la réclamation (même transaction que `job.claimed`) | base, `now()` | non · doublon de `job.claimed` |
 * | `studio_job_attempts.finished_at`            | `succeeded` (= `job.persisting`), `failed`, `abandoned` | worker   | non · doublon des transitions |
 * | `studio_jobs.updated_at`, `heartbeat_at`     | chaque écriture, chaque sondage                   | worker         | non · écrasés, ne datent aucune phase |
 *
 * Aucune colonne ne date la FIN de l'envoi à fal (la requête acceptée met à
 * jour `updated_at`, écrasé ensuite) · l'envoi HTTP lui-même tombe donc dans
 * l'exécution. Toutes les bornes lues viennent de l'horloge de la BASE · une
 * phase ne mélange jamais deux horloges.
 *
 * ── Les phases ────────────────────────────────────────────────────────────────
 *
 *  · attente         · en file (`queued`), de la création à la réclamation ·
 *                      remises en file comprises (bail perdu), ET les heures
 *                      d'une capacité coupée par un interrupteur (aucune
 *                      transition ne le dit · limite écrite) ;
 *  · prise en charge · `job.claimed` → `job.running` ;
 *  · soumission      · `job.running` → `job.provider.payload` (médias relus,
 *                      corps préparé) ;
 *  · exécution       · `job.provider.payload` → `job.persisting` (envoi, file
 *                      et travail du fournisseur, sondage) ;
 *  · téléchargement  · `job.persisting` → `job.completed` (téléchargement,
 *                      décodage, dépôt, relecture).
 * Un passage `running → persisting` SANS corps consigné (fournisseur simulé)
 * ne se découpe pas · soumission et exécution restent « non mesurées » pour
 * cette tâche, sa durée totale compte.
 *
 * ── Les quantiles · méthode exacte ────────────────────────────────────────────
 *
 * `quantileExact(x, p)` = la durée de rang ⌈n·p⌉ des durées triées (type 1 de
 * Hyndman et Fan, l'inverse de la fonction de répartition empirique) · une
 * durée réellement observée, jamais interpolée · médiane = rang ⌈n/2⌉, p95 =
 * rang ⌈0,95·n⌉.
 *
 * ── L'effectif minimum · calculé par la loi binomiale ─────────────────────────
 *
 * Le nombre de durées sous le vrai quantile 0,95 suit Bin(n ; 0,95) · la durée
 * de rang u est une borne haute à 95 % de ce quantile dès que
 * P(Bin(n ; 0,95) ≤ u − 1) ≥ 0,95 (intervalle sans hypothèse de loi). Calcul
 * exact (`rangBorneHauteQuantile`, vérifié en fractions) :
 *
 * | effectif n | rang du p95 | rang de la borne haute | durées au-dessus | couverture |
 * | ---------- | ----------- | ---------------------- | ---------------- | ---------- |
 * |     58     |      56     | aucun (le maximum ne suffit pas) |   ·    |   0,949    |
 * |     59     |      57     |   59 (le maximum)      |        0         |   0,952    |
 * |     80     |      76     |   80 (le maximum)      |        0         |   0,984    |
 * |     92     |      88     |   92 (le maximum)      |        0         |   0,991    |
 * |     93     |      89     |   92                   |        1         |   0,950    |
 * |    100     |      95     |   99                   |        1         |   0,963    |
 * |    150     |     143     |  148                   |        2         |   0,982    |
 * |    200     |     190     |  196                   |        4         |   0,974    |
 *
 * Sous 59 tâches, le p95 n'a AUCUNE borne haute à 95 % · de 59 à 92, la seule
 * borne est la plus longue tâche (une seule valeur aberrante la fixe) · à 93,
 * une durée observée la borne enfin sans être le maximum. Retenu, avec marge ·
 * **100 tâches saines** par groupe (couverture 0,963, une durée au-dessus de
 * la borne) · sous ce minimum, le seuil dérivé de #1072 (30 min) reste, et
 * l'écran le dit.
 *
 * ── Le seuil ─────────────────────────────────────────────────────────────────
 *
 * seuil mesuré = max(p95 × 1,5 ; la plus longue tâche saine du groupe),
 * arrondi à la seconde supérieure. La marge 1,5 est CELLE du seuil dérivé (la
 * garde de #1072 exige 30 min ≥ 1,5 × le pire cumul des délais du worker) · le
 * plancher garantit qu'aucune tâche saine mesurée n'aurait été dite bloquée.
 * Par modèle quand le modèle a l'effectif ; sinon par type (image, vidéo ·
 * JAMAIS mélangés) ; sinon dérivé · et même dérivé, jamais sous la plus longue
 * tâche saine mesurée de son type (relevé, et dit).
 * Une tâche saine · terminée (`completed`), jamais passée par un
 * rapprochement ni une demande d'annulation (attente humaine, pas du travail).
 */
import { VALEUR_ABSENTE } from '../../ponctuation-ecran';
import { libelleOperationConnu } from '../../studios/execution/reprise';
import { adminNombre } from './format';
import { SEUIL_TACHE_BLOQUEE_MIN, texteSansAdresse } from './taches-admin';

const MINUTE = 60_000;

/* ─────────────────────────────── Types et phases ─────────────────────────────── */

export const TYPES_TACHE = ['image', 'video'] as const;
export type TypeTache = (typeof TYPES_TACHE)[number];
export const LIBELLE_TYPE_TACHE: Readonly<Record<TypeTache, string>> = { image: 'Image', video: 'Vidéo' };

/** Le type d'une tâche · vidéo dès qu'une ligne de l'instantané anime un plan (profil `animation`, ou opération « Vidéo ») · sinon image. */
export function typeTache(lignes: ReadonlyArray<{ operation?: unknown; profil?: unknown }> | null | undefined): TypeTache {
  return (lignes ?? []).some((l) => l?.profil === 'animation' || libelleOperationConnu(String(l?.operation ?? '')) === 'Vidéo') ? 'video' : 'image';
}

export const PHASES_TACHE = ['attente', 'prise_en_charge', 'soumission', 'execution', 'telechargement'] as const;
export type PhaseTache = (typeof PHASES_TACHE)[number];
export const LIBELLE_PHASE_TACHE: Readonly<Record<PhaseTache, string>> = {
  attente: 'Attente', prise_en_charge: 'Prise en charge', soumission: 'Soumission', execution: 'Exécution', telechargement: 'Téléchargement',
};
/** Les bornes de chaque phase · dites sous le tableau. */
export const BORNES_PHASE_TACHE: Readonly<Record<PhaseTache, string>> = {
  attente: 'création → réclamation (remises en file comprises)',
  prise_en_charge: 'réclamation → démarrage',
  soumission: 'démarrage → corps envoyé au fournisseur',
  execution: 'corps envoyé → succès du fournisseur',
  telechargement: 'succès → fichiers décodés, déposés, relus',
};

/** Une transition lue au registre (`studio_audit_events`, cible `studio_job`). */
export interface TransitionLue { action: string; le: Date; modele?: string | null }

/** Une tâche terminée, telle que la mesure la lit (après la porte). */
export interface TacheMesurable {
  id: string;
  etat: string;
  creeLe: Date;
  /** `studio_jobs.finished_at` · repli quand aucune transition terminale n'est lue. */
  termineLe: Date | null;
  lignes: ReadonlyArray<{ operation?: unknown; profil?: unknown }> | null;
  transitions: readonly TransitionLue[];
}

export interface DureesTache {
  id: string;
  type: TypeTache;
  modele: string | null;
  saine: boolean;
  /** Pourquoi la tâche ne compte pas · `null` si saine. */
  exclusion: string | null;
  totalMs: number | null;
  phases: Record<PhaseTache, number | null>;
}

const ETATS_TERMINAUX_TRANSITION = new Set(['completed', 'failed', 'cancelled']);

/** Le modèle d'une tâche · celui du DERNIER corps envoyé au fournisseur (`job.provider.payload`, `details.modele`). `null` · non consigné. */
export function modeleDesTransitions(transitions: readonly TransitionLue[]): string | null {
  let m: string | null = null;
  for (const t of [...transitions].sort((a, b) => a.le.getTime() - b.le.getTime())) {
    if (t.action === 'job.provider.payload' && typeof t.modele === 'string' && t.modele.trim()) m = t.modele.trim();
  }
  return m;
}

/**
 * Les durées d'une tâche · rejoue ses transitions dans l'ordre, de la
 * création à la fin · chaque intervalle va à la phase de l'état qu'il couvre.
 */
export function dureesTache(t: TacheMesurable): DureesTache {
  const type = typeTache(t.lignes);
  const modele = modeleDesTransitions(t.transitions);
  const acc: Record<PhaseTache, number> = { attente: 0, prise_en_charge: 0, soumission: 0, execution: 0, telechargement: 0 };
  const ev = [...t.transitions].map((x, i) => ({ ...x, i })).sort((a, b) => a.le.getTime() - b.le.getTime() || a.i - b.i);
  let etat = 'queued';
  let depuis = t.creeLe.getTime();
  let corps = false;
  let decoupable = true;
  let fin: number | null = null;
  let detour: string | null = null;
  let vues = 0;
  const cloturer = (jusqua: number, vers: string) => {
    const d = Math.max(0, jusqua - depuis);
    if (etat === 'queued') acc.attente += d;
    else if (etat === 'claimed') acc.prise_en_charge += d;
    else if (etat === 'persisting') acc.telechargement += d;
    else if (etat === 'running') {
      if (corps) acc.execution += d;
      else if (vers === 'persisting') decoupable = false;
      else acc.soumission += d;
    }
    depuis = Math.max(depuis, jusqua);
  };
  for (const e of ev) {
    const le = e.le.getTime();
    if (e.action === 'job.provider.payload') {
      if (etat === 'running' && !corps) { cloturer(le, 'payload'); corps = true; }
      continue;
    }
    if (!e.action.startsWith('job.')) continue;
    const vers = e.action.slice(4);
    if (!['queued', 'claimed', 'running', 'persisting', 'completed', 'failed', 'cancelled', 'cancel_requested', 'reconciliation_required'].includes(vers)) continue;
    vues += 1;
    cloturer(le, vers);
    if (vers === 'reconciliation_required') detour = 'passée par un rapprochement';
    if (vers === 'cancel_requested') detour = detour ?? 'annulation demandée';
    if (vers === 'running') corps = false;
    etat = vers;
    if (ETATS_TERMINAUX_TRANSITION.has(vers)) { fin = le; break; }
  }
  const termine = fin ?? t.termineLe?.getTime() ?? null;
  const totalMs = termine === null ? null : Math.max(0, termine - t.creeLe.getTime());
  const phasesLues = vues > 0 && fin !== null;
  const phases: Record<PhaseTache, number | null> = {
    attente: phasesLues ? acc.attente : null,
    prise_en_charge: phasesLues ? acc.prise_en_charge : null,
    soumission: phasesLues && decoupable ? acc.soumission : null,
    execution: phasesLues && decoupable ? acc.execution : null,
    telechargement: phasesLues ? acc.telechargement : null,
  };
  const exclusion = t.etat !== 'completed' ? 'non terminée avec succès'
    : detour ? detour
      : totalMs === null ? 'aucune date de fin'
        : null;
  return { id: t.id, type, modele, saine: exclusion === null, exclusion, totalMs, phases };
}

/* ─────────────────────────────── Quantiles exacts ─────────────────────────────── */

/** Le quantile `p` d'une liste TRIÉE (croissante) · rang ⌈n·p⌉ (au moins 1), une valeur observée. */
export function quantileExact(triees: readonly number[], p: number): number {
  if (!triees.length) throw new Error('quantile d’une liste vide');
  // n·p arrondi au millionième avant ⌈ ⌉ · 100 × 0,07 vaut 7,000…001 en virgule flottante (rang 8 au lieu de 7).
  const rang = Math.min(triees.length, Math.max(1, Math.ceil(Math.round(triees.length * p * 1e6) / 1e6)));
  return triees[rang - 1]!;
}

/** P(Bin(n ; p) ≤ k) · exacte, en logarithmes (aucun tirage). */
export function binomialeRepartition(n: number, p: number, k: number): number {
  if (k < 0) return 0;
  if (k >= n) return 1;
  const lp = Math.log(p), lq = Math.log(1 - p);
  let logC = 0;
  let s = 0;
  for (let i = 0; i <= k; i++) {
    if (i > 0) logC += Math.log((n - i + 1) / i);
    s += Math.exp(logC + i * lp + (n - i) * lq);
  }
  return Math.min(1, s);
}

/**
 * Le rang u de la plus petite durée observée qui borne PAR LE HAUT le vrai
 * quantile `p` avec la confiance `niveau` · P(Bin(n ; p) ≤ u − 1) ≥ niveau ·
 * `null` quand même le maximum ne suffit pas.
 */
export function rangBorneHauteQuantile(n: number, p = 0.95, niveau = 0.95): number | null {
  // Une seule passe · P(B ≤ u − 1) cumulée terme à terme (la même somme que `binomialeRepartition`), O(n).
  const lp = Math.log(p), lq = Math.log(1 - p);
  let logC = 0;
  let cumul = 0;
  for (let u = 1; u <= n; u++) {
    const i = u - 1;
    if (i > 0) logC += Math.log((n - i + 1) / i);
    cumul += Math.exp(logC + i * lp + (n - i) * lq);
    if (Math.min(1, cumul) >= niveau) return u;
  }
  return null;
}

/** Le plus petit effectif dont la borne haute du quantile laisse au moins `auDessus` durées au-dessus d'elle. */
export function effectifMinimalBorneHaute(p = 0.95, niveau = 0.95, auDessus = 1): number {
  for (let n = 1; n <= 10_000; n++) {
    const u = rangBorneHauteQuantile(n, p, niveau);
    if (u !== null && n - u >= auDessus) return n;
  }
  throw new Error('effectif introuvable');
}

/** L'effectif exact (93) arrondi au-dessus · 100 tâches saines par groupe (tableau ci-dessus). */
export const EFFECTIF_MIN_DUREES = 100;
/** La marge du seuil mesuré · la même que celle du seuil dérivé (30 min ≥ 1,5 × le pire cumul, garde de #1072). */
export const MARGE_SEUIL_MESURE = 1.5;
/** Le seuil dérivé de #1072, en millisecondes · le repli. */
export const SEUIL_DERIVE_MS = SEUIL_TACHE_BLOQUEE_MIN * MINUTE;

export interface StatDurees { n: number; medianeMs: number; p95Ms: number; borneHauteP95Ms: number | null; maxMs: number }

export function statDurees(xs: readonly number[]): StatDurees | null {
  if (!xs.length) return null;
  const t = [...xs].sort((a, b) => a - b);
  const u = rangBorneHauteQuantile(t.length);
  return { n: t.length, medianeMs: quantileExact(t, 0.5), p95Ms: quantileExact(t, 0.95), borneHauteP95Ms: u === null ? null : t[u - 1]!, maxMs: t[t.length - 1]! };
}

/** Le seuil mesuré d'un groupe · `null` sous l'effectif minimum. */
export function seuilMesure(s: StatDurees | null): number | null {
  if (!s || s.n < EFFECTIF_MIN_DUREES) return null;
  return Math.ceil(Math.max(s.p95Ms * MARGE_SEUIL_MESURE, s.maxMs) / 1000) * 1000;
}

/* ─────────────────────────────── La mesure ─────────────────────────────── */

export interface GroupeDurees {
  type: TypeTache;
  /** `null` · tous les modèles du type (la ligne « Tous modèles »), ou modèle non consigné quand `tous` est faux. */
  modele: string | null;
  tous: boolean;
  total: StatDurees | null;
  phases: Record<PhaseTache, StatDurees | null>;
  seuilMs: number | null;
}

export interface MesureDurees {
  /** Un groupe par (type, modèle), modèles triés par effectif décroissant. */
  modeles: GroupeDurees[];
  /** Un groupe par type, TOUJOURS les deux (image, vidéo), même vides. */
  types: Record<TypeTache, GroupeDurees>;
  /** Tâches lues, et celles écartées (non saines). */
  lues: number;
  exclues: number;
}

function groupe(type: TypeTache, modele: string | null, tous: boolean, ds: readonly DureesTache[]): GroupeDurees {
  const total = statDurees(ds.map((d) => d.totalMs!));
  const phases = Object.fromEntries(PHASES_TACHE.map((p) => [p, statDurees(ds.map((d) => d.phases[p]).filter((x): x is number => x !== null))])) as Record<PhaseTache, StatDurees | null>;
  return { type, modele, tous, total, phases, seuilMs: seuilMesure(total) };
}

/** La mesure des tâches terminées lues · seules les SAINES comptent. */
export function mesurerDureesTaches(taches: readonly TacheMesurable[]): MesureDurees {
  const ds = taches.map(dureesTache);
  const saines = ds.filter((d) => d.saine);
  const parCle = new Map<string, DureesTache[]>();
  for (const d of saines) {
    const k = `${d.type}\u0000${d.modele ?? ''}`;
    const l = parCle.get(k);
    if (l) l.push(d); else parCle.set(k, [d]);
  }
  const modeles = [...parCle.values()]
    .map((l) => groupe(l[0]!.type, l[0]!.modele, false, l))
    .sort((a, b) => TYPES_TACHE.indexOf(a.type) - TYPES_TACHE.indexOf(b.type) || (b.total?.n ?? 0) - (a.total?.n ?? 0) || String(a.modele).localeCompare(String(b.modele)));
  const types = Object.fromEntries(TYPES_TACHE.map((ty) => [ty, groupe(ty, null, true, saines.filter((d) => d.type === ty))])) as Record<TypeTache, GroupeDurees>;
  return { modeles, types, lues: taches.length, exclues: ds.length - saines.length };
}

/** Aucune tâche mesurée · le seuil dérivé partout. */
export const MESURE_VIDE: MesureDurees = mesurerDureesTaches([]);

/* ─────────────────────────────── Le seuil appliqué ─────────────────────────────── */

export type SourceSeuil = 'mesure-modele' | 'mesure-type' | 'derive';

export interface SeuilApplique {
  ms: number;
  source: SourceSeuil;
  /** La source dite · commence par « mesuré » ou par « dérivé, effectif insuffisant ». */
  libelle: string;
}

const effectif = (g: GroupeDurees | undefined) => g?.total?.n ?? 0;

/**
 * Le seuil d'une tâche (type, modèle) · le modèle s'il a l'effectif, sinon son
 * type, sinon le seuil dérivé · jamais sous la plus longue tâche saine
 * mesurée de son type.
 */
export function seuilApplique(m: MesureDurees, t: { type: TypeTache; modele: string | null }): SeuilApplique {
  const g = t.modele ? m.modeles.find((x) => x.type === t.type && x.modele === t.modele) : undefined;
  const ty = m.types[t.type];
  const nom = LIBELLE_TYPE_TACHE[t.type].toLowerCase();
  if (g?.seuilMs) return { ms: g.seuilMs, source: 'mesure-modele', libelle: `mesuré · ce modèle, ${adminNombre(effectif(g))} tâches saines` };
  const manque = t.modele ? `modèle à ${adminNombre(effectif(g))} sur ${EFFECTIF_MIN_DUREES}` : 'modèle pas encore connu';
  if (ty.seuilMs) return { ms: ty.seuilMs, source: 'mesure-type', libelle: `mesuré · toutes les tâches ${nom}, ${adminNombre(effectif(ty))} tâches saines (${manque})` };
  const plancher = ty.total?.maxMs ?? 0;
  const releve = plancher > SEUIL_DERIVE_MS;
  return {
    ms: releve ? Math.ceil(plancher / 1000) * 1000 : SEUIL_DERIVE_MS,
    source: 'derive',
    libelle: `dérivé, effectif insuffisant (${nom} · ${adminNombre(effectif(ty))} sur ${EFFECTIF_MIN_DUREES}) · ${releve ? 'relevé à la plus longue tâche saine mesurée' : `${SEUIL_TACHE_BLOQUEE_MIN} min, délais du worker`}`,
  };
}

/** Une tâche active, telle que le segment « Bloquées » la lit. */
export interface TacheASeuil { lignes: ReadonlyArray<{ operation?: unknown; profil?: unknown }> | null; modele?: string | null }

/** Le résolveur que la table des tâches reçoit · le seuil de CHAQUE tâche, d'après la mesure. */
export function resolveurSeuils(m: MesureDurees): (t: TacheASeuil) => SeuilApplique {
  return (t) => seuilApplique(m, { type: typeTache(t.lignes), modele: t.modele ?? null });
}

/* ─────────────────────────────── Le tableau « Durées mesurées » ─────────────────────────────── */

/** Une durée lisible · « 42 s », « 3 min 05 s », « 1 h 12 ». */
export function libelleDureeMs(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms)) return VALEUR_ABSENTE;
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s} s`;
  if (s < 3600) { const m = Math.floor(s / 60), r = s % 60; return r ? `${m} min ${String(r).padStart(2, '0')} s` : `${m} min`; }
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return m ? `${h} h ${String(m).padStart(2, '0')}` : `${h} h`;
}

export const COLONNES_DUREES_MESUREES = ['Modèle', 'Type', 'Effectif', 'Médiane', 'p95', 'Seuil appliqué', 'Source'] as const;

export interface LigneDureesMesurees {
  cle: string;
  type: TypeTache;
  tous: boolean;
  seuilMs: number;
  source: SourceSeuil;
  cellules: [string, string, string, string, string, string, string];
}

const nomModele = (g: GroupeDurees) => (g.tous ? 'Tous modèles' : g.modele ? texteSansAdresse(g.modele) : 'Modèle non consigné');

/**
 * Les lignes du tableau · pour chaque type, ses modèles puis « Tous modèles »
 * (toujours présente, même vide · le seuil vidéo se lit à part) · le seuil
 * appliqué est CELUI que reçoivent les tâches de la ligne.
 */
export function tableauDureesMesurees(m: MesureDurees): LigneDureesMesurees[] {
  const out: LigneDureesMesurees[] = [];
  for (const ty of TYPES_TACHE) {
    for (const g of [...m.modeles.filter((x) => x.type === ty), m.types[ty]]) {
      const s = seuilApplique(m, { type: ty, modele: g.tous ? null : g.modele });
      out.push({
        cle: `${ty}:${g.tous ? '*' : g.modele ?? ''}`, type: ty, tous: g.tous, seuilMs: s.ms, source: s.source,
        cellules: [nomModele(g), LIBELLE_TYPE_TACHE[ty], adminNombre(effectif(g)), libelleDureeMs(g.total?.medianeMs), libelleDureeMs(g.total?.p95Ms), libelleDureeMs(s.ms), s.libelle],
      });
    }
  }
  return out;
}

export const COLONNES_PHASES_MESUREES = ['Type', 'Phase', 'Effectif', 'Médiane', 'p95', 'Bornes'] as const;

/** Les phases de chaque type (tous modèles) · ce que les données permettent de découper. */
export function tableauPhasesMesurees(m: MesureDurees): Array<{ cle: string; cellules: [string, string, string, string, string, string] }> {
  return TYPES_TACHE.flatMap((ty) => PHASES_TACHE.map((p) => {
    const s = m.types[ty].phases[p];
    return {
      cle: `${ty}:${p}`,
      cellules: [LIBELLE_TYPE_TACHE[ty], LIBELLE_PHASE_TACHE[p], adminNombre(s?.n ?? 0), libelleDureeMs(s?.medianeMs), libelleDureeMs(s?.p95Ms), BORNES_PHASE_TACHE[p]] as [string, string, string, string, string, string],
    };
  }));
}

/** La méthode, dite sous le tableau. */
export const METHODE_DUREES = `Tâches terminées avec succès, sans rapprochement ni annulation demandée · durée totale de la création à la fin, phases bornées par les transitions du worker · quantiles exacts (la durée de rang ⌈n·p⌉, jamais interpolée) · seuil mesuré = p95 × ${String(MARGE_SEUIL_MESURE).replace('.', ',')}, jamais sous la plus longue tâche saine, par modèle à partir de ${EFFECTIF_MIN_DUREES} tâches saines (borne haute à 95 % du p95 par la loi binomiale), sinon par type, sinon ${SEUIL_TACHE_BLOQUEE_MIN} min dérivées des délais du worker.`;
