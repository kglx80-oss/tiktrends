/**
 * Studios · lot 10 V5 · le JOURNAL d'un projet (PC D13, F9, F14, F16 · RJ AC01).
 *
 * Pur. Qui a fait quoi sur un projet, LU (jamais écrit pour l'occasion) dans
 * quatre sources que le serveur relit dans la portée :
 *
 *  · le journal d'audit des studios (`studio_audit_events`, ajout seul) ·
 *    versions, exports, relectures humaines, renommage, devis, générations,
 *    rattachements, propositions de Jarvis… ;
 *  · l'historique des versions · une version sans événement d'audit (semée,
 *    ancienne) se dit quand même, une version déjà dite par l'audit ne se
 *    répète pas ;
 *  · les tâches (`studio_jobs`) · la FIN d'une génération (terminée, en échec,
 *    annulée) que le worker écrit sans audit ;
 *  · les commentaires du projet (écrit, résolu) ;
 *  · les NOTES du canvas de lignée (lot 11 · écrite, résolue) · sous le libellé
 *    du nœud gardé avec la note, que le nœud soit encore dans la lignée ou non ;
 *  · les DUPLICATIONS du projet · l'audit de la création de chaque copie qui
 *    porte `copieDe` vers ce projet (`FaitDuplication`, `duplication.ts`) ·
 *    « Dupliqué en « … » », avec le lien vers la copie.
 *
 * Chaque fait devient UNE phrase en français (`entreeJournal`). Un événement
 * d'audit inconnu se dit de façon NEUTRE (« Action enregistrée sur ce projet »)
 * · jamais son code brut, jamais ses détails. Les détails sont lus de façon
 * défensive · une valeur absente ou d'un autre type ne se dit pas.
 *
 * `journalProjet` trie (du plus récent au plus ancien), filtre par type et
 * pagine (`PAR_PAGE_JOURNAL`) · le compte par type ne dépend pas du filtre.
 */

import { etatReprise, libelleOperationJob } from '../execution/reprise';
import type { EtatJob } from '../machines';
import { ETATS_JOB } from '../machines';
import { lireCopieDe, NOTE_COPIE_SANS_LIEN, phraseDuplication, type FaitDuplication } from './duplication';
import { lienLigneeProjet } from '../../spatial/projet/notes-lignee';

export type TypeJournal = 'versions' | 'exports' | 'relectures' | 'projet' | 'tests' | 'devis' | 'generations' | 'jarvis' | 'commentaires' | 'notes' | 'autre';

/** Les filtres, dans l'ordre de l'écran · le libellé est celui du bouton. */
export const TYPES_JOURNAL: ReadonlyArray<{ cle: TypeJournal; libelle: string }> = [
  { cle: 'versions', libelle: 'Versions' },
  { cle: 'exports', libelle: 'Exports' },
  { cle: 'relectures', libelle: 'Relectures' },
  { cle: 'projet', libelle: 'Projet' },
  { cle: 'tests', libelle: 'Tests' },
  { cle: 'devis', libelle: 'Devis' },
  { cle: 'generations', libelle: 'Générations' },
  { cle: 'jarvis', libelle: 'Jarvis' },
  { cle: 'commentaires', libelle: 'Commentaires' },
  { cle: 'notes', libelle: 'Notes de la lignée' },
  { cle: 'autre', libelle: 'Autres' },
];

/** Une page du journal · 20 lignes, la hauteur d'un écran de portable sans perdre le filtre de vue. */
export const PAR_PAGE_JOURNAL = 20;

/**
 * Le serveur lit au plus ce nombre de faits par source (les plus récents) ·
 * la lecture reste bornée quel que soit l'âge du projet · l'écran le dit
 * quand la borne est atteinte (`tronque`).
 */
export const LECTURE_MAX_JOURNAL = 500;

/** Ce qu'une phrase neutre dit d'un événement inconnu · jamais son code. */
export const PHRASE_EVENEMENT_INCONNU = 'Action enregistrée sur ce projet';

/** Un fait de l'audit · `cible` et `versionApresId` servent à ne pas dire deux fois la même chose. */
export interface FaitAudit {
  source: 'audit';
  id: string;
  le: string;
  /** Le nom déjà résolu (« Toi », un nom, une adresse) · `null` · automatique. */
  acteur: string | null;
  action: string;
  cible: { type: string; id: string };
  /** La version produite ou visée (`version_after` quand c'est une version du projet) · sinon `null`. */
  versionApresId: string | null;
  versionN: number | null;
  /** `version_after` brut quand ce n'est PAS une version (état d'une tâche, statut qualité) · sinon `null`. */
  etatApres: string | null;
  raison: string;
  /** La raison écrite sur la version produite (`studio_project_versions.reason`), si l'événement en produit une. */
  raisonVersion: string | null;
  details: unknown;
}

export interface FaitVersion { source: 'version'; id: string; le: string; acteur: string | null; versionN: number; raison: string }

/** Une tâche donne deux faits · son lancement (`fini: false`, à sa création) et sa fin (`fini: true`, à `finished_at`). */
export interface FaitTache { source: 'tache'; id: string; jobId: string; le: string; operation: string; etat: string; fini: boolean }

export interface FaitCommentaire {
  source: 'commentaire';
  id: string;
  le: string;
  acteur: string | null;
  geste: 'ecrit' | 'resolu';
  cible: { type: 'version'; versionId: string; versionN: number } | { type: 'creation'; libelle: string };
}

/**
 * Une note du canvas de lignée (lot 11) · `noeud` · le libellé du nœud gardé
 * avec la note (lisible même si le nœud a disparu) · le texte de la note ne
 * sort jamais dans le journal, seul son nœud est dit.
 */
export interface FaitNote {
  source: 'note';
  id: string;
  le: string;
  acteur: string | null;
  geste: 'ecrite' | 'resolue';
  noeud: string;
}

export type FaitJournal = FaitAudit | FaitVersion | FaitTache | FaitCommentaire | FaitDuplication | FaitNote;

export interface EntreeJournal {
  id: string;
  type: TypeJournal;
  phrase: string;
  detail: string | null;
  le: string;
  quand: string;
  /** Qui · « Toi », un nom, « Un membre de l’espace », « Automatique ». */
  acteur: string;
  versionN: number | null;
  lien: { href: string; libelle: string } | null;
}

/* ───────────────────────────── lectures défensives ───────────────────────────── */

const objet = (x: unknown): Record<string, unknown> => (typeof x === 'object' && x !== null && !Array.isArray(x) ? x as Record<string, unknown> : {});
const texte = (x: unknown, max = 160): string | null => (typeof x === 'string' && x.trim() ? x.trim().slice(0, max) : null);
const entier = (x: unknown): number | null => (typeof x === 'number' && Number.isInteger(x) && x >= 0 ? x : null);
const pluriel = (n: number, mot: string, motPluriel = `${mot}s`) => `${n} ${n > 1 ? motPluriel : mot}`;
const compte = (x: unknown): number | null => (Array.isArray(x) ? x.length : entier(x));

/** « 08/11/2026 · 14:32 » · heure de Paris, comme l'historique des exports. */
export function quandJournal(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const jour = new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Paris' }).format(d);
  const heure = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' }).format(d);
  return `${jour} · ${heure}`;
}

/* ───────────────────────────── les phrases ───────────────────────────── */

interface Phrase { type: TypeJournal; phrase: string; detail?: string | null; lien?: 'version' | 'export' | 'creations' | null }

const FORMATS: Record<string, string> = { png: 'PNG', jpeg: 'JPEG', webp: 'WebP', mp4: 'MP4' };
const QUALITE: Record<string, string> = { passed: 'conforme', requires_review: 'à relire', rejected: 'refusée', pending: 'en attente' };

function versionDe(f: FaitAudit): string { return f.versionN !== null ? `Version ${f.versionN}` : 'Une version'; }

/** La raison d'une version, dite seulement si une personne l'a écrite (ni « création » ni un identifiant). */
function raisonLisible(r: string | null): string | null {
  const t = texte(r, 200);
  if (!t || t === 'création' || t === 'test' || /\b[0-9a-f]{8}-[0-9a-f]{4}-/i.test(t)) return null;
  return t;
}

const PHRASES_AUDIT: Readonly<Record<string, (f: FaitAudit, d: Record<string, unknown>) => Phrase>> = {
  'project.create': (f, d) => {
    const r = texte(f.raisonVersion, 300);
    // Une copie d'avant le lien (`copieDe`) · le projet source ne la dit pas, et la copie le précise · rien n'est deviné.
    return r && r.startsWith('Copie de «')
      ? { type: 'projet', phrase: 'Projet créé par duplication', detail: lireCopieDe(d) ? r : `${r} · ${NOTE_COPIE_SANS_LIEN}`, lien: 'version' }
      : { type: 'projet', phrase: 'Projet créé', detail: null, lien: 'version' };
  },
  'project.create_from_sources': (_f, d) => {
    const n = compte(d.sourceIds);
    return { type: 'projet', phrase: 'Projet créé depuis la Veille', detail: n ? `${pluriel(n, 'source')} au brief` : null, lien: 'version' };
  },
  'project.add_sources': (_f, d) => {
    const n = compte(d.ajoutees);
    return { type: 'projet', phrase: n ? `${pluriel(n, 'source ajoutée', 'sources ajoutées')} au brief` : 'Sources ajoutées au brief' };
  },
  'project.rename': (_f, d) => {
    const avant = texte(d.avant, 200); const apres = texte(d.apres, 200);
    return { type: 'projet', phrase: 'Projet renommé', detail: avant && apres ? `« ${avant} » devient « ${apres} »` : null };
  },
  'studio.project.archived': () => ({ type: 'projet', phrase: 'Projet archivé' }),
  'studio.project.restored': () => ({ type: 'projet', phrase: 'Projet restauré' }),
  'asset.set_rights': () => ({ type: 'projet', phrase: 'Provenance et droits d’un média renseignés' }),
  'project.version.create': (f, d) => ({
    type: 'versions', phrase: `${versionDe(f)} enregistrée`,
    detail: texte(d.proposalId) ? 'En appliquant une proposition' : raisonLisible(f.raisonVersion), lien: 'version',
  }),
  'project.iterate': (f, d) => {
    const v = texte(d.variable, 80);
    return { type: 'versions', phrase: `Itération · ${versionDe(f).toLowerCase()} créée depuis une variante`, detail: v ? `Variable changée · ${v}` : null, lien: 'version' };
  },
  'project.export': (f, d) => {
    const fmt = typeof d.format === 'string' ? FORMATS[d.format] ?? null : null;
    const l = entier(d.largeur); const h = entier(d.hauteur);
    const morceaux = [fmt, l && h ? `${l} × ${h}` : null, texte(d.nomFichier, 120)].filter(Boolean);
    return { type: 'exports', phrase: `${versionDe(f)} exportée`, detail: morceaux.length ? morceaux.join(' · ') : null, lien: 'export' };
  },
  'project.export.video': (_f, d) => {
    const ms = entier(d.dureeMs); const plans = entier(d.plans);
    const morceaux = [ms ? `${(ms / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} s` : null, plans ? pluriel(plans, 'plan') : null].filter(Boolean);
    return { type: 'exports', phrase: 'Vidéo finale assemblée', detail: morceaux.length ? morceaux.join(' · ') : null, lien: 'export' };
  },
  'project.export.review': (f, d) => {
    const n = compte(d.points);
    return { type: 'relectures', phrase: `Relecture humaine validée · ${versionDe(f).toLowerCase()}`, detail: n ? `${pluriel(n, 'point relu', 'points relus')} avant export` : null, lien: 'export' };
  },
  'media.accept': () => ({ type: 'relectures', phrase: 'Sortie acceptée à la relecture humaine', lien: 'creations' }),
  'media.reject': () => ({ type: 'relectures', phrase: 'Sortie refusée à la relecture humaine', lien: 'creations' }),
  'media.quality.control': (f) => {
    const q = f.etatApres ? QUALITE[f.etatApres] ?? null : null;
    return { type: 'relectures', phrase: 'Contrôle qualité d’une sortie', detail: q ? `Résultat · ${q}` : null, lien: 'creations' };
  },
  'media.quality.reprise': () => ({ type: 'relectures', phrase: 'Contrôle qualité d’une sortie repris', lien: 'creations' }),
  'quote.create': (_f, d) => {
    const c = entier(d.credits);
    return { type: 'devis', phrase: 'Devis préparé', detail: c !== null ? `${pluriel(c, 'crédit')} au plus` : null };
  },
  'image.batch.quote': (_f, d) => {
    const n = entier(d.nombre); const c = entier(d.totalCredits);
    return { type: 'devis', phrase: n ? `Lot de ${pluriel(n, 'image')} chiffré` : 'Lot d’images chiffré', detail: c !== null ? `${pluriel(c, 'crédit')} au plus` : null };
  },
  'job.enqueue': (_f, d) => {
    const c = entier(d.credits);
    return { type: 'generations', phrase: 'Génération lancée · devis approuvé', detail: c !== null ? `${pluriel(c, 'crédit débité', 'crédits débités')}` : null };
  },
  'job.cancel_requested': () => ({ type: 'generations', phrase: 'Annulation d’une génération demandée' }),
  'image.consigne.compilee': () => ({ type: 'generations', phrase: 'Consigne d’image compilée et validée' }),
  'video.consigne_plan.compilee': () => ({ type: 'generations', phrase: 'Consigne d’image d’un plan compilée et validée' }),
  'variant.create': (f) => ({ type: 'tests', phrase: 'Sortie retenue comme variante', detail: texte(f.raison, 160), lien: 'creations' }),
  'variant.test.link': (f, d) => {
    const v = texte(d.variable, 80);
    return { type: 'tests', phrase: 'Variante rattachée à un test Adsmap', detail: [texte(f.raison, 160), v ? `variable · ${v}` : null].filter(Boolean).join(' · ') || null, lien: 'creations' };
  },
  'learning.review': () => ({ type: 'tests', phrase: 'Apprentissage d’un test relu par Jarvis', lien: 'creations' }),
  'proposal.request': () => ({ type: 'jarvis', phrase: 'Jarvis sollicité · aucune proposition retenue' }),
  'proposal.create': (_f, d) => ({ type: 'jarvis', phrase: d.origine === 'jarvis' ? 'Proposition de Jarvis' : 'Proposition saisie' }),
  'proposal.apply': () => ({ type: 'jarvis', phrase: 'Proposition appliquée' }),
  'proposal.reject': () => ({ type: 'jarvis', phrase: 'Proposition rejetée' }),
  'proposal.expire': () => ({ type: 'jarvis', phrase: 'Proposition expirée' }),
};

/** Les actions d'audit qui ÉCRIVENT une version · une version qu'elles disent ne se répète pas depuis l'historique. */
export const ACTIONS_QUI_CREENT_UNE_VERSION: readonly string[] = ['project.create', 'project.create_from_sources', 'project.version.create', 'project.iterate'];

/** Les actions dont la phrase est connue · le reste se dit de façon neutre. */
export const ACTIONS_JOURNAL_CONNUES: readonly string[] = Object.keys(PHRASES_AUDIT);

/**
 * Les ÉTAPES INTERNES du moteur, écrites par le worker (`apps/workers`) ·
 * prise en charge, passage d'un état à l'autre, corps préparé pour le
 * fournisseur, webhook. Ce ne sont pas des gestes · le journal dit le
 * lancement (`job.enqueue`) et la FIN d'une génération (relue sur la tâche,
 * une seule fois) · ces lignes ne se disent pas, ni neutres ni en clair.
 */
export const ETAPES_TECHNIQUES_JOURNAL: readonly string[] = [
  ...ETATS_JOB.filter((e) => e !== 'cancel_requested').map((e) => `job.${e}`),
  'job.provider.payload', 'job.provider.blocked',
];

/** Une étape interne du moteur (liste ci-dessus, ou tout `webhook.*`) · tue dans le journal. */
export function etapeTechniqueJournal(action: string): boolean {
  return ETAPES_TECHNIQUES_JOURNAL.includes(action) || action.startsWith('webhook.');
}

const ETATS: ReadonlySet<string> = new Set(ETATS_JOB);

function lienDe(genre: Phrase['lien'], projectId: string, versionId: string | null, versionN: number | null): EntreeJournal['lien'] {
  const base = `/studio/projets/${encodeURIComponent(projectId)}`;
  if (genre === 'creations') return { href: `${base}#creations`, libelle: 'Voir le livrable' };
  if (!versionId) return null;
  const v = encodeURIComponent(versionId);
  if (genre === 'export') return { href: `${base}/export?version=${v}`, libelle: 'Voir le livrable' };
  if (genre === 'version') return { href: `${base}?version=${v}`, libelle: versionN !== null ? `Examiner la version ${versionN}` : 'Examiner la version' };
  return null;
}

/** Un fait → une ligne du journal · un événement inconnu se dit neutre, ses détails ne sortent jamais. */
export function entreeJournal(f: FaitJournal, o: { projectId: string }): EntreeJournal {
  const acteur = ('acteur' in f ? f.acteur : null)?.trim() || 'Automatique';
  const commun = { id: `${f.source}:${f.id}`, le: f.le, quand: quandJournal(f.le), acteur };
  if (f.source === 'audit') {
    const regle = PHRASES_AUDIT[f.action];
    const p: Phrase = regle ? regle(f, objet(f.details)) : { type: 'autre', phrase: PHRASE_EVENEMENT_INCONNU };
    return { ...commun, type: p.type, phrase: p.phrase, detail: p.detail ?? null, versionN: f.versionN, lien: lienDe(p.lien ?? null, o.projectId, f.versionApresId, f.versionN) };
  }
  if (f.source === 'version') {
    return {
      ...commun, type: 'versions', phrase: `Version ${f.versionN} enregistrée`, detail: raisonLisible(f.raison), versionN: f.versionN,
      lien: lienDe('version', o.projectId, f.id, f.versionN),
    };
  }
  if (f.source === 'tache') {
    // Une opération sans libellé connu (« studio.generation ») ne se dit pas · jamais un code brut à l'écran.
    const lu = libelleOperationJob(f.operation);
    const op = lu !== f.operation ? lu : null;
    const etat = ETATS.has(f.etat) ? etatReprise(f.etat as EtatJob) : null;
    const phrase = !f.fini ? 'Génération lancée'
      : etat?.ton === 'termine' ? 'Génération terminée'
        : f.etat === 'cancelled' ? 'Génération annulée'
          : etat?.ton === 'echec' ? 'Génération en échec'
            : etat?.interrompu ? 'Génération interrompue · coût en rapprochement' : 'Génération arrêtée';
    return { ...commun, type: 'generations', phrase, detail: op, versionN: null, lien: f.fini && etat?.ton === 'termine' ? lienDe('creations', o.projectId, null, null) : null };
  }
  if (f.source === 'duplication') {
    const p = phraseDuplication(f);
    return { ...commun, type: 'projet', phrase: p.phrase, detail: p.detail, versionN: f.versionN, lien: p.lien };
  }
  if (f.source === 'note') {
    return {
      ...commun, type: 'notes',
      phrase: f.geste === 'ecrite' ? 'Note sur la lignée' : 'Note de la lignée résolue',
      detail: texte(f.noeud, 300) ? `Sur « ${texte(f.noeud, 300)} »` : null,
      versionN: null,
      lien: { href: lienLigneeProjet(o.projectId), libelle: 'Voir la lignée' },
    };
  }
  const sur = f.cible.type === 'version' ? `la version ${f.cible.versionN}` : 'une création';
  return {
    ...commun, type: 'commentaires',
    phrase: f.geste === 'ecrit' ? `Commentaire sur ${sur}` : `Commentaire résolu sur ${sur}`,
    detail: f.cible.type === 'creation' ? f.cible.libelle : null,
    versionN: f.cible.type === 'version' ? f.cible.versionN : null,
    lien: f.cible.type === 'version' ? lienDe('version', o.projectId, f.cible.versionId, f.cible.versionN) : lienDe('creations', o.projectId, null, null),
  };
}

/**
 * Ne dit pas deux fois la même chose · une version déjà dite par l'audit, le
 * lancement d'une tâche déjà dit par `job.enqueue` · et tait les étapes
 * internes du moteur (`etapeTechniqueJournal`).
 */
export function faitsSansDoublon(faits: readonly FaitJournal[]): FaitJournal[] {
  const versionsDites = new Set<string>();
  const tachesLancees = new Set<string>();
  for (const f of faits) {
    if (f.source !== 'audit') continue;
    if (f.versionApresId && ACTIONS_QUI_CREENT_UNE_VERSION.includes(f.action)) versionsDites.add(f.versionApresId);
    if (f.action === 'job.enqueue' && f.cible.type === 'studio_job') tachesLancees.add(f.cible.id);
  }
  return faits.filter((f) => !(f.source === 'audit' && etapeTechniqueJournal(f.action))
    && !(f.source === 'version' && versionsDites.has(f.id)) && !(f.source === 'tache' && !f.fini && tachesLancees.has(f.jobId)));
}

export interface JournalProjet {
  entrees: EntreeJournal[];
  type: TypeJournal | null;
  page: number;
  pages: number;
  /** Lignes qui passent le filtre. */
  total: number;
  /** Les filtres offerts · seulement les types présents, avec leur compte (indépendant du filtre choisi). */
  filtres: Array<{ cle: TypeJournal; libelle: string; n: number }>;
  /** Toutes les lignes, sans filtre. */
  tous: number;
}

/** Le type demandé par le client · une valeur inconnue vaut « tout ». */
export function typeJournal(x: unknown): TypeJournal | null {
  return typeof x === 'string' && TYPES_JOURNAL.some((t) => t.cle === x) ? x as TypeJournal : null;
}

/** La page demandée, bornée à [1, pages] · une valeur illisible vaut 1. */
export function pageJournal(x: unknown, pages: number): number {
  const n = typeof x === 'number' ? x : typeof x === 'string' ? Number(x) : NaN;
  if (!Number.isInteger(n) || n < 1) return 1;
  return Math.min(n, Math.max(1, pages));
}

/** Le journal d'un projet · trié du plus récent au plus ancien, filtré, paginé. */
export function journalProjet(faits: readonly FaitJournal[], o: { projectId: string; type?: unknown; page?: unknown; parPage?: number }): JournalProjet {
  const parPage = o.parPage && o.parPage > 0 ? Math.floor(o.parPage) : PAR_PAGE_JOURNAL;
  const toutes = faitsSansDoublon(faits).map((f) => entreeJournal(f, { projectId: o.projectId }))
    .sort((a, b) => (a.le === b.le ? (a.id < b.id ? 1 : a.id > b.id ? -1 : 0) : a.le < b.le ? 1 : -1));
  const type = typeJournal(o.type);
  const gardees = type ? toutes.filter((e) => e.type === type) : toutes;
  const pages = Math.max(1, Math.ceil(gardees.length / parPage));
  const page = pageJournal(o.page, pages);
  const n = new Map<TypeJournal, number>();
  for (const e of toutes) n.set(e.type, (n.get(e.type) ?? 0) + 1);
  return {
    entrees: gardees.slice((page - 1) * parPage, page * parPage),
    type, page, pages, total: gardees.length, tous: toutes.length,
    filtres: TYPES_JOURNAL.filter((t) => n.has(t.cle)).map((t) => ({ ...t, n: n.get(t.cle)! })),
  };
}

/** « Page 2 sur 3 · 41 événements » · « Aucun événement » quand le filtre ne garde rien. */
export function resumeJournal(j: Pick<JournalProjet, 'page' | 'pages' | 'total' | 'type'>): string {
  if (j.total === 0) return j.type ? 'Aucun événement de ce type sur ce projet.' : 'Aucun événement sur ce projet pour l’instant.';
  return `${pluriel(j.total, 'événement')}${j.pages > 1 ? ` · page ${j.page} sur ${j.pages}` : ''}`;
}
