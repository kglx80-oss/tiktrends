/**
 * UX V2 · lot 5 · l'Accueil part du PROJET (reprendre ou créer), plus le pilotage.
 *
 * ── Le défaut que ce module ferme ────────────────────────────────────────────
 *
 * L'Accueil partait des MARQUES (« Prépare ton prochain test », « Tes
 * marques ») · le travail en cours, lui, vit dans les projets Studios, qu'il
 * fallait aller chercher dans le rail. Le mandat UX V2 (validé par Kevin)
 * demande en tête : reprendre le dernier projet, en créer un, voir les
 * suivants, et piloter l'activité.
 *
 * ── Ce que ce module décide (pur · ni base, ni réseau, ni modèle) ────────────
 *
 *  · `doitLireProjetsAccueil` · faut-il seulement LIRE les projets (le rôle
 *    ouvre-t-il les Studios) ;
 *  · `resoudreAccueilProjets` · QUEL état montrer (fermé, coupé, erreur,
 *    premier usage, liste), QUEL projet reprendre (le plus récemment modifié),
 *    LESQUELS montrer ensuite, et quels gestes proposer ;
 *  · `rangeeStudiosAccueil` · la rangée Studios d'avant reste-t-elle (elle ne
 *    reste que quand la tête ne porte pas déjà ses deux liens) ;
 *  · `liensPilotage` · Résultats, Activité et coûts, Jarvis · chacun SEULEMENT
 *    si le rôle l'ouvre ;
 *  · `apercuReprise` · l'aperçu du projet repris · une SORTIE LIVRÉE réelle
 *    (même règle que la bibliothèque), servie par la route gardée, sinon rien.
 *
 * Aucun chiffre, aucun visuel, aucun projet n'est inventé · tout vient de la
 * lecture fournie par l'appelant. La consultation n'écrit rien.
 */

import { CHEMIN_PROJETS, CHEMIN_NOUVEAU_PROJET } from './studios/anciennes-adresses';
import { DEFINITIONS_CAPACITES, type CapaciteStudio } from './studios/interrupteurs';
import { verdictSortieLivree, cheminMediaStudio, type SortieStudioLue } from './studios/bibliotheque';

/** Un lien proposé par l'Accueil · une destination EXISTANTE et son libellé. */
export interface LienAccueil {
  href: string;
  libelle: string;
}

/** Tous les projets, toutes marques visibles (la liste filtre sinon sur la marque active). */
export const CHEMIN_TOUS_PROJETS = `${CHEMIN_PROJETS}?toutes=1`;

/** Combien de projets suivent le projet repris · la maquette en montre deux, le mandat « 2 ou 3 ». */
export const NB_AUTRES_PROJETS = 3;

export const LIEN_NOUVEAU_PROJET: LienAccueil = { href: CHEMIN_NOUVEAU_PROJET, libelle: 'Nouveau projet' };
export const LIEN_TOUS_PROJETS: LienAccueil = { href: CHEMIN_TOUS_PROJETS, libelle: 'Voir tous les projets' };
export const LIEN_VEILLE_PROJET: LienAccueil = { href: '/veille', libelle: 'Partir d’une annonce de la Veille' };

/** Le minimum qu'une carte de projet doit porter pour être ordonnée. */
export interface ProjetOrdonnable {
  id: string;
  updatedAt: string;
}

/** Ce que la lecture des projets a rendu · l'appelant traduit sa réponse serveur. */
export type LectureProjetsAccueil<T extends ProjetOrdonnable> =
  | { ok: true; cartes: readonly T[] }
  | { ok: false; code: string; capacitesCoupees?: readonly CapaciteStudio[]; traceId?: string | null };

export type EtatAccueilProjets<T extends ProjetOrdonnable> =
  /** Le rôle n'ouvre pas les Studios (ou le serveur refuse) · aucun bloc projet. */
  | { etat: 'ferme' }
  /** La capacité Studios est coupée pour l'espace · une note discrète, aucun geste mort. */
  | { etat: 'coupee'; message: string }
  /** La lecture a échoué · un bloc discret, le reste de l'Accueil s'affiche. */
  | { etat: 'erreur'; traceId: string | null; tous: LienAccueil }
  /** Aucun projet · on propose d'en créer un (si le rôle le peut), l'accompagnement reste. */
  | { etat: 'premier-usage'; nouveau: LienAccueil | null; veille: LienAccueil | null }
  /** Des projets · le plus récent à reprendre, les suivants, et la liste entière. */
  | { etat: 'liste'; reprendre: T; autres: T[]; tous: LienAccueil; nouveau: LienAccueil | null };

/** Faut-il lire les projets ? Seulement si le rôle ouvre les Studios · sinon rien n'est demandé. */
export function doitLireProjetsAccueil(ouvert: (href: string) => boolean): boolean {
  return ouvert(CHEMIN_PROJETS);
}

/** Codes de refus qui veulent dire « pas pour ce rôle » (et non une panne). */
const REFUS_DE_ROLE: readonly string[] = ['FORBIDDEN', 'AUTH_REQUIRED'];

const horodatage = (iso: string): number => {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? Number.NEGATIVE_INFINITY : t;
};

/** Du plus récemment modifié au plus ancien · à date égale, ordre d'identifiant (stable). */
export function projetsParRecence<T extends ProjetOrdonnable>(cartes: readonly T[]): T[] {
  return [...cartes].sort((a, b) => {
    const d = horodatage(b.updatedAt) - horodatage(a.updatedAt);
    if (d !== 0 && !Number.isNaN(d)) return d;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

/** La phrase de la capacité coupée · nomme ce qui est coupé, sans promettre de date. */
export function messageProjetsCoupes(capacites: readonly CapaciteStudio[]): string {
  const noms = (capacites.length ? capacites : (['projets'] as const)).map((c) => `« ${DEFINITIONS_CAPACITES[c].libelle} »`);
  return `${noms.join(', ')} · non activé pour cet espace. Les projets reviendront ici dès l’activation.`;
}

/**
 * L'état de la tête de l'Accueil.
 *
 *  · rôle sans Studios, ou lecture non faite, ou refus de rôle ⇒ `ferme` ;
 *  · capacité coupée ⇒ `coupee` ; autre refus ou panne ⇒ `erreur` ;
 *  · aucune carte ⇒ `premier-usage` ;
 *  · sinon ⇒ `liste` · le plus récemment modifié est repris, les
 *    `NB_AUTRES_PROJETS` suivants sont montrés.
 *
 * « Nouveau projet » n'est proposé que si le serveur l'accepterait
 * (`peutCreer` · la permission `studio.propose`) ET que le rôle ouvre la
 * préparation · jamais un bouton mort.
 */
export function resoudreAccueilProjets<T extends ProjetOrdonnable>(p: {
  ouvert: (href: string) => boolean;
  lecture: LectureProjetsAccueil<T> | null;
  peutCreer: boolean;
}): EtatAccueilProjets<T> {
  if (!doitLireProjetsAccueil(p.ouvert) || p.lecture === null) return { etat: 'ferme' };
  const l = p.lecture;
  if (!l.ok) {
    if (REFUS_DE_ROLE.includes(l.code)) return { etat: 'ferme' };
    if (l.code === 'UNSUPPORTED_CAPABILITY') return { etat: 'coupee', message: messageProjetsCoupes(l.capacitesCoupees ?? []) };
    return { etat: 'erreur', traceId: l.traceId ?? null, tous: LIEN_TOUS_PROJETS };
  }
  const nouveau = p.peutCreer && p.ouvert(CHEMIN_NOUVEAU_PROJET) ? LIEN_NOUVEAU_PROJET : null;
  if (l.cartes.length === 0) {
    return { etat: 'premier-usage', nouveau, veille: p.ouvert(LIEN_VEILLE_PROJET.href) ? LIEN_VEILLE_PROJET : null };
  }
  const tries = projetsParRecence(l.cartes);
  return { etat: 'liste', reprendre: tries[0]!, autres: tries.slice(1, 1 + NB_AUTRES_PROJETS), tous: LIEN_TOUS_PROJETS, nouveau };
}

/**
 * La rangée Studios d'avant (« Nouveau projet », « Mes projets ») reste-t-elle ?
 * Seulement quand la tête ne porte PAS déjà ces gestes : rôle fermé (la rangée
 * filtre elle-même ses liens, comme avant) ou lecture en erreur. Coupée, ses
 * liens ne mèneraient qu'à « non activé » · la note de la tête le dit déjà.
 */
export function rangeeStudiosAccueil(e: { etat: EtatAccueilProjets<ProjetOrdonnable>['etat'] }): boolean {
  return e.etat === 'ferme' || e.etat === 'erreur';
}

/* ────────────────────────────── Pilotage ──────────────────────────────────── */

export interface LienPilotage {
  href: string;
  titre: string;
  sous: string;
  /**
   * Une page du menu de COMPTE (gardée par le rôle d'espace, pas seulement par
   * la matrice) · elle n'est proposée que si le menu de compte l'ouvre aussi.
   */
  compte?: true;
}

/** Les accès de pilotage · destinations EXISTANTES, libellés descriptifs, aucun chiffre. */
export const PILOTAGE: readonly LienPilotage[] = [
  { href: '/adsmap', titre: 'Résultats', sous: 'Tests, verdicts et apprentissages' },
  { href: '/usage', titre: 'Activité et coûts', sous: 'Utilisation des crédits de l’espace', compte: true },
  { href: '/jarvis', titre: 'Faire le point avec Jarvis', sous: 'Ce que Jarvis sait de ta catégorie' },
];

/**
 * Les accès de pilotage que le rôle ouvre · l'ordre est conservé. Une page du
 * menu de compte exige EN PLUS que ce menu l'ouvre (`compteOuvert`) · même
 * règle que le menu (un membre d'équipe au rôle d'espace inférieur y serait
 * renvoyé à l'accueil).
 */
export function liensPilotage(p: { ouvert: (href: string) => boolean; compteOuvert: (href: string) => boolean }): LienPilotage[] {
  return PILOTAGE.filter((l) => p.ouvert(l.href) && (!l.compte || p.compteOuvert(l.href)));
}

/* ──────────────────────────── Bandeau en doublon ───────────────────────── */

const cheminSeul = (href: string): string => href.split('#')[0]!.split('?')[0]!;

/**
 * Le bandeau « Prépare ton prochain test » se tait quand TOUS ses gestes sont
 * déjà portés par la tête (Nouveau projet, Voir tous les projets) ou le
 * pilotage (Résultats…) · même destination (chemin, sans paramètres). Avec
 * une marque active, il proposait « Voir mes tests » (/adsmap) et « Créer une
 * pub » (/studio/projets/nouveau), soit deux doublons. Sans marque, son geste
 * « Choisir une marque » n'est porté nulle part ailleurs · il reste.
 */
export function bandeauEnDoublon(bandeau: { href: string; hrefSec?: string } | null, offerts: readonly (string | null | undefined)[]): boolean {
  if (!bandeau) return false;
  const chemins = new Set(offerts.filter((h): h is string => !!h).map(cheminSeul));
  return [bandeau.href, ...(bandeau.hrefSec ? [bandeau.hrefSec] : [])].every((h) => chemins.has(cheminSeul(h)));
}

/** Les destinations que la tête de l'Accueil propose déjà, selon son état. */
export function destinationsTete(e: EtatAccueilProjets<ProjetOrdonnable>): string[] {
  if (e.etat === 'liste') return [e.tous.href, ...(e.nouveau ? [e.nouveau.href] : [])];
  if (e.etat === 'premier-usage') return [...(e.nouveau ? [e.nouveau.href] : []), ...(e.veille ? [e.veille.href] : [])];
  if (e.etat === 'erreur') return [e.tous.href];
  return [];
}

/* ─────────────────────────────── Aperçu ───────────────────────────────────── */

/** Une sortie lue pour l'aperçu · la ligne `studio_assets` et sa date. */
export interface SortieApercu extends SortieStudioLue {
  createdAt: string;
}

/** Types qu'une balise image peut montrer · une vidéo livrée n'est pas un aperçu fixe. */
const MIMES_APERCU: readonly string[] = ['image/png', 'image/jpeg', 'image/webp'];

/**
 * L'aperçu du projet repris · la SORTIE LIVRÉE (`verdictSortieLivree`, même
 * règle que la bibliothèque) la plus récente, de type image, de CE projet ·
 * son adresse gardée (`/api/studios/media/:id`). Aucune sortie livrée ⇒
 * `null` · pas d'image inventée, pas de pastiche.
 */
export function apercuReprise(projectId: string, sorties: readonly SortieApercu[]): string | null {
  const retenues = sorties
    .filter((s) => s.projectId === projectId && MIMES_APERCU.includes(s.mime) && verdictSortieLivree(s).livree)
    .sort((a, b) => {
      const d = horodatage(b.createdAt) - horodatage(a.createdAt);
      if (d !== 0 && !Number.isNaN(d)) return d;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
  return retenues[0] ? cheminMediaStudio(retenues[0].id) : null;
}
