/**
 * Tour de contrôle · suivi opérationnel · le REGISTRE D'AUDIT de la plateforme
 * (RJ AR06) · `studio_audit_events` de portée plateforme et les audits
 * plateforme existants (`ai_spend_reconciliations`). Pur · ni base, ni réseau.
 *
 *  · chaque action ÉCRITE dans le code est classée ici (`ACTIONS_AUDIT`) ·
 *    phrase lisible, sensible ou non, et pourquoi · le recensement par motif
 *    (`W/test/admin-suivi-recensement.test.ts`) refait la liste des actions
 *    écrites et échoue si l'une n'est pas classée, ou si une action classée
 *    n'est plus écrite nulle part ;
 *  · « Actions sensibles » · une liste FERMÉE (`ACTIONS_SENSIBLES`) · droits,
 *    argent, ce qui part en production, interrupteurs ;
 *  · portée · les gestes sans espace (plateforme), les interrupteurs Studios
 *    et les actions sensibles de tous les espaces · le bruit des espaces (une
 *    transition de tâche, un brouillon) n'y entre pas ;
 *  · export · les colonnes de la table, détails JSON bornés, clés secrètes
 *    masquées, adresses et liens masqués.
 */
import { VALEUR_ABSENTE } from '../../ponctuation-ecran';
import { adminDateHeure } from './format';
import { LIBELLE_AUDIT_PLATEFORME } from './pilotage';
import { borne, texteSansAdresse } from './taches-admin';
import { correspondRecherche, lireSegment, paginer, LONGUEUR_MAX_RECHERCHE, type FiltresListeTour, type PageTour } from './tour-controle';

/* ─────────────────────────────── Le classement des actions ─────────────────────────────── */

export interface ClasseActionAudit {
  /** Ce que l'acteur a fait · « a publié une release ». */
  phrase: string;
  sensible: boolean;
  /** Pourquoi elle est sensible · écrit sous le filtre. */
  raison?: string;
}

const P = LIBELLE_AUDIT_PLATEFORME;
const courante = (phrase: string): ClasseActionAudit => ({ phrase, sensible: false });
const sensible = (phrase: string, raison: string): ClasseActionAudit => ({ phrase, sensible: true, raison });

/**
 * L'action synthétique d'un rapprochement de dépense (`ai_spend_reconciliations`)
 * · ce geste n'écrit pas dans `studio_audit_events`, ses colonnes (auteur,
 * date, preuve, motif) SONT son audit (`reconciliation-depense.ts`).
 */
export const ACTION_RAPPROCHEMENT_DEPENSE = 'depense.rapprochement';

/**
 * TOUTES les actions d'audit écrites par le code (recensées par motif) · une
 * clé « préfixe.* » couvre une famille écrite par un gabarit (`job.${état}`,
 * `webhook.${type}`). Une action écrite et absente d'ici fait échouer le
 * recensement · on la classe en l'ajoutant.
 */
export const ACTIONS_AUDIT: Readonly<Record<string, ClasseActionAudit>> = {
  // Droits · qui accède à quoi.
  'equipe.membre.retire': sensible('a retiré un membre de l’espace', 'droits · un accès disparaît'),
  'equipe.membre.role': sensible('a changé le rôle d’un membre', 'droits · un accès change'),
  'asset.set_rights': sensible('a déclaré les droits d’utilisation d’un média', 'droits d’utilisation · ce qu’on a le droit de diffuser'),
  // Production · ce que les modèles reçoivent pour tous les clients.
  'prompt.release.publier': sensible(P['prompt.release.publier']!, 'production · la release servie à tous les espaces change'),
  'prompt.release.rollback': sensible(P['prompt.release.rollback']!, 'production · la release servie à tous les espaces change'),
  'prompt.release.retirer': sensible(P['prompt.release.retirer']!, 'production · une release sort du service'),
  'prompt.release.revoquer': sensible(P['prompt.release.revoquer']!, 'production · une release est révoquée'),
  'prompt.benchmark.approuver': sensible(P['prompt.benchmark.approuver']!, 'production · ouvre la publication d’une release'),
  'prompt.recette_manuelle.approuver': sensible(P['prompt.recette_manuelle.approuver']!, 'production · une recette manuelle remplace le benchmark'),
  // Argent.
  'prompt.benchmark.approuver_budget': sensible('a approuvé le budget d’un benchmark', 'dépense · un budget payant est ouvert'),
  'studios.budget_essai': sensible(P['studios.budget_essai']!, 'dépense · le budget d’essai d’un espace change'),
  [ACTION_RAPPROCHEMENT_DEPENSE]: sensible('a rapproché une dépense IA de sa facture', 'dépense · le montant retenu par le plafond change'),
  // Interrupteurs · ce qui est ouvert ou fermé chez un client.
  'studios.interrupteurs': sensible(P['studios.interrupteurs']!, 'interrupteurs · une fonction s’ouvre ou se ferme pour un espace'),

  // Courantes · le travail ordinaire, tracé mais pas sensible.
  'prompt.import': courante(P['prompt.import']!),
  'prompt.version.brouillon': courante(P['prompt.version.brouillon']!),
  'prompt.version.valider': courante(P['prompt.version.valider']!),
  'prompt.release.creer': courante(P['prompt.release.creer']!),
  'prompt.release.evaluer': courante(P['prompt.release.evaluer']!),
  'prompt.benchmark.joindre': courante('a joint le rapport d’un benchmark'),
  'prompt.benchmark.joindre_fiches': courante('a joint les fiches d’un benchmark'),
  'project.create': courante('a créé un projet'),
  'project.create_from_sources': courante('a créé un projet depuis des sources'),
  'project.add_sources': courante('a ajouté des sources à un projet'),
  'project.rename': courante('a renommé un projet'),
  'project.version.create': courante('a enregistré une version de projet'),
  'project.iterate': courante('a itéré sur un projet'),
  'project.export': courante('a exporté un livrable'),
  'project.export.review': courante('a relu un export'),
  'project.export.video': courante('a rendu la vidéo finale'),
  'studio.project.archived': courante('a archivé un projet'),
  'studio.project.restored': courante('a restauré un projet'),
  'image.consigne.compilee': courante('a compilé une consigne d’image'),
  'image.batch.quote': courante('a demandé un devis de lot d’images'),
  'video.consigne_plan.compilee': courante('a compilé la consigne d’un plan vidéo'),
  'quote.create': courante('a créé un devis'),
  'job.enqueue': courante('a lancé une génération'),
  'job.cancel_requested': courante('a demandé l’annulation d’une génération'),
  'job.provider.payload': courante('a envoyé une génération au fournisseur'),
  'job.provider.blocked': courante('a bloqué un envoi au fournisseur'),
  'job.*': courante('a fait avancer une génération'),
  'webhook.*': courante('a reçu un événement du fournisseur'),
  'media.accept': courante('a accepté un média'),
  'media.reject': courante('a refusé un média'),
  'media.quality.control': courante('a contrôlé la qualité d’un média'),
  'media.quality.reprise': courante('a repris le contrôle qualité d’un média'),
  'proposal.request': courante('a demandé une proposition'),
  'proposal.create': courante('a reçu une proposition'),
  'proposal.apply': courante('a appliqué une proposition'),
  'proposal.reject': courante('a rejeté une proposition'),
  'proposal.expire': courante('a laissé expirer une proposition'),
  'variant.create': courante('a créé une variante'),
  'variant.test.link': courante('a rattaché une variante à un test'),
  'learning.review': courante('a relu un apprentissage'),
};

/** La classe d'une action · exacte d'abord, puis sa famille (« job.* »). `null` · action non classée. */
export function classeActionAudit(action: string): ClasseActionAudit | null {
  if (ACTIONS_AUDIT[action]) return ACTIONS_AUDIT[action]!;
  const point = action.indexOf('.');
  return point > 0 ? ACTIONS_AUDIT[`${action.slice(0, point)}.*`] ?? null : null;
}

/** La liste FERMÉE des actions sensibles · exactes, jamais une famille. */
export const ACTIONS_SENSIBLES: readonly string[] = Object.freeze(Object.entries(ACTIONS_AUDIT).filter(([k, c]) => c.sensible && !k.endsWith('.*')).map(([k]) => k));

export const estActionSensible = (action: string): boolean => ACTIONS_SENSIBLES.includes(action);

/** Une action non classée (écrite après ce module) se dit, sans inventer · son code reste dans sa colonne. */
export const PHRASE_ACTION_NON_CLASSEE = 'a fait une action non classée';
export const phraseActionAudit = (action: string) => classeActionAudit(action)?.phrase ?? PHRASE_ACTION_NON_CLASSEE;

/* ─────────────────────────────── La portée ─────────────────────────────── */

/** Les interrupteurs Studios s'écrivent sur un espace mais sont des gestes de plateforme (comme le registre de « Rôles & droits »). */
export const PREFIXE_AUDIT_PLATEFORME = 'studios.';

/** Dans le registre · geste sans espace (plateforme), geste `studios.*`, ou action sensible d'un espace. */
export function dansRegistrePlateforme(e: { action: string; espaceId: string | null }): boolean {
  return e.espaceId === null || e.action.startsWith(PREFIXE_AUDIT_PLATEFORME) || estActionSensible(e.action);
}

/* ─────────────────────────────── Les cellules ─────────────────────────────── */

/** L'acteur, jamais son adresse · son nom, sinon ce qu'il est (automatique, script). */
export function acteurAudit(nom: string | null | undefined, role: string): string {
  if (nom && nom.trim() && !nom.includes('@')) return nom.trim();
  if (role.startsWith('systeme:')) return 'Automatique';
  if (role.startsWith('script:')) return 'Script';
  return 'Membre sans nom';
}

const LIBELLE_CIBLE: Readonly<Record<string, string>> = {
  workspace: 'Espace', workspace_member: 'Membre', studio_asset: 'Média', studio_job: 'Génération', studio_variant: 'Variante', studio_test_link: 'Test',
  studio_project: 'Projet', studio_project_version: 'Version de projet', studio_image_batch: 'Lot d’images', studio_proposal: 'Proposition', studio_quote: 'Devis',
  prompt_release: 'Release de prompts', prompt_pointer: 'Release en service', prompt_pack: 'Pack de prompts', ai_spend: 'Dépense IA',
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** La longueur gardée d'un identifiant non UUID (`clé@version`) · une clé de prompt tient en 40 caractères. */
export const LONGUEUR_MAX_ID_CIBLE = 40;

/** « Release de prompts · 3f2a9c1e » · le type en clair, l'identifiant court (8 signes d'un UUID). */
export function cibleAudit(type: string, id: string): string {
  const t = LIBELLE_CIBLE[type] ?? (type.startsWith('prompt_') ? 'Prompt' : 'Objet');
  const court = UUID.test(id) ? id.slice(0, 8) : borne(texteSansAdresse(id), LONGUEUR_MAX_ID_CIBLE);
  return court ? `${t} · ${court}` : t;
}

/** Le motif et les détails gardés · au-delà, coupés (« … »), le reste demeure en base, jamais réécrit. */
export const LONGUEUR_MAX_MOTIF_AUDIT = 200;
export const LONGUEUR_MAX_DETAILS_AUDIT = 240;
/** Une clé de détail dont la VALEUR est un secret · masquée avant tout affichage ou export. */
const CLE_SECRETE = /(secret|token|jeton|password|mot_?de_?passe|api_?key|cle_?api|authorization|signature|cookie|refresh)/i;

function masquerCles(v: unknown, profondeur = 0): unknown {
  if (profondeur > 6) return '…';
  if (Array.isArray(v)) return v.map((x) => masquerCles(x, profondeur + 1));
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, CLE_SECRETE.test(k) ? '[masqué]' : masquerCles(x, profondeur + 1)]));
  return v;
}

/** Les détails JSON d'un événement · clés secrètes masquées, adresses et liens masqués, bornés. */
export function detailsAudit(details: unknown): string {
  if (details == null) return VALEUR_ABSENTE;
  let json: string;
  try { json = JSON.stringify(masquerCles(details)) ?? ''; } catch { return VALEUR_ABSENTE; }
  if (!json || json === '{}' || json === '[]') return VALEUR_ABSENTE;
  return borne(texteSansAdresse(json), LONGUEUR_MAX_DETAILS_AUDIT);
}

export const motifAudit = (motif: string | null | undefined) => (motif && motif.trim() ? borne(texteSansAdresse(motif), LONGUEUR_MAX_MOTIF_AUDIT) : VALEUR_ABSENTE);

/* ─────────────────────────────── La table ─────────────────────────────── */

/** Un événement lu (après la porte) · `studio_audit_events` ou un rapprochement de dépense. */
export interface EvenementAuditLu {
  id: string;
  le: Date;
  acteurNom: string | null;
  role: string;
  action: string;
  cibleType: string;
  cibleId: string;
  espaceId: string | null;
  espace: string | null;
  motif: string | null;
  details: unknown;
}

export interface LigneRegistreAudit {
  id: string;
  sensible: boolean;
  quand: string;
  acteur: string;
  action: string;
  code: string;
  cible: string;
  espace: string;
  motif: string;
  details: string;
  /** L'identifiant entier de la cible · cherché, jamais affiché en entier. */
  cibleId: string;
}

export function ligneRegistreAudit(e: EvenementAuditLu): LigneRegistreAudit {
  return {
    id: e.id, sensible: estActionSensible(e.action),
    quand: adminDateHeure(e.le), acteur: acteurAudit(e.acteurNom, e.role),
    action: phraseActionAudit(e.action), code: borne(texteSansAdresse(e.action), 80),
    cible: cibleAudit(e.cibleType, e.cibleId),
    espace: e.espaceId === null ? 'Plateforme' : (e.espace?.trim() || 'Espace supprimé'),
    motif: motifAudit(e.motif), details: detailsAudit(e.details), cibleId: e.cibleId,
  };
}

export const COLONNES_REGISTRE_AUDIT = ['Quand', 'Acteur', 'Action', 'Code', 'Cible', 'Espace', 'Motif', 'Détails'] as const;
export const cellulesRegistreAudit = (l: LigneRegistreAudit): string[] => [l.quand, l.acteur, l.action, l.code, l.cible, l.espace, l.motif, l.details];

export const SEGMENTS_REGISTRE = ['sensibles'] as const;
export const LIBELLE_SEGMENT_REGISTRE: Readonly<Record<'tous' | 'sensibles', string>> = { tous: 'Tout le registre', sensibles: 'Actions sensibles' };
export const DEFINITION_SEGMENT_REGISTRE: Readonly<Record<'tous' | 'sensibles', string>> = {
  tous: 'Les gestes de la plateforme (sans espace), les interrupteurs Studios et les actions sensibles de tous les espaces.',
  sensibles: `Liste fermée · ${ACTIONS_SENSIBLES.length} actions · droits, dépense, production, interrupteurs.`,
};

export interface TableRegistreAudit {
  segments: Array<{ cle: 'tous' | 'sensibles'; libelle: string; n: number; definition: string }>;
  segment: string;
  q: string;
  filtrees: LigneRegistreAudit[];
  page: PageTour<LigneRegistreAudit>;
}

/**
 * Le registre d'un filtre · portée (`dansRegistrePlateforme`), segment, puis
 * recherche (acteur, action · phrase et code, cible · type et identifiant
 * entier, espace), puis la page · la page ET l'export appellent CETTE fonction.
 * Le plus récent d'abord.
 */
export function tableRegistreAudit(evenements: readonly EvenementAuditLu[], f: FiltresListeTour): TableRegistreAudit {
  const lignes = [...evenements].filter(dansRegistrePlateforme).sort((a, b) => b.le.getTime() - a.le.getTime() || (a.id < b.id ? 1 : -1)).map(ligneRegistreAudit);
  const segments = [
    { cle: 'tous' as const, libelle: LIBELLE_SEGMENT_REGISTRE.tous, n: lignes.length, definition: DEFINITION_SEGMENT_REGISTRE.tous },
    { cle: 'sensibles' as const, libelle: LIBELLE_SEGMENT_REGISTRE.sensibles, n: lignes.filter((l) => l.sensible).length, definition: DEFINITION_SEGMENT_REGISTRE.sensibles },
  ];
  const segment = lireSegment(f.segment, segments);
  const q = String(f.q ?? '').trim().slice(0, LONGUEUR_MAX_RECHERCHE);
  const filtrees = lignes.filter((l) => (segment !== 'sensibles' || l.sensible) && correspondRecherche([l.acteur, l.action, l.code, l.cible, l.cibleId, l.espace], q));
  return { segments, segment, q, filtrees, page: paginer(filtrees, f.page ?? 1) };
}
