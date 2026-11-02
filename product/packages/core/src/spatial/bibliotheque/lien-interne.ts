import { donneesDrive, type DonneesDrive, type FichierDrive, type MediaSource, type SourcesDrive } from './drive';

/**
 * Bibliothèque · le LIEN INTERNE d'un fichier ou d'un dossier · RÈGLES PURES
 * (ni base, ni réseau).
 *
 * « Copier le lien » (menu « … » d'une carte de fichier ou de dossier) copie
 * l'adresse de l'écran lui-même, qui rouvre ce fichier (son aperçu) ou ce
 * dossier · `/assets?fichier=<id>`, `/assets?dossier=<id>`. Ce n'est PAS un
 * lien de partage : aucune table, aucun jeton, rien de public. L'adresse ne
 * porte qu'un identifiant · elle ne donne aucun droit.
 *
 * Qui l'ouvre · la page `/assets` la lit CÔTÉ SERVEUR, après ses propres
 * gardes (session, lecture de la Bibliothèque · plancher Membre, un lecteur
 * client est renvoyé à l'accueil comme sans paramètre). Elle ne résout
 * l'identifiant que dans les données qu'elle vient de lire pour CETTE session
 * (l'espace de la session, la portée de la marque active, corbeille à part) ·
 * `ouvertureLienInterne`. Un fichier d'un autre espace, d'une marque hors
 * portée, à la corbeille ou inconnu donne `null` · la page est rendue
 * exactement comme sans paramètre, sans rien dire de son existence.
 *
 * Ce qui se lie · un fichier de la bibliothèque (`assets`, jamais une sortie
 * Studios ni une ancienne création, qui ont leur propre adresse) vivant, et un
 * dossier RÉEL (`library_folders`) vivant. Le menu ne propose le geste que si
 * le lien rouvre bien sa cible (`lienInterneFichier`, `lienInterneDossier` ·
 * même règle que la lecture).
 *
 * Au-delà de ce que l'écran charge · la page ne charge d'emblée que les 400
 * médias les plus récents (`FENETRE_BIBLIOTHEQUE`, la suite vient par
 * « Charger plus » · `pagination.ts`). Un lien vers un fichier plus ancien
 * fait lire CE SEUL fichier (`fichierLienALire` dit lequel, ou aucun quand il
 * est déjà chargé), par la même lecture que la liste (même garde, même espace,
 * même portée de marque, hors corbeille). `resoudreLienInterne` ne l'ajoute aux
 * données de l'écran que si le lien le rouvre alors (dossier parent et ancêtres
 * hors corbeille, fichier de la bibliothèque) · sinon les données restent
 * celles d'avant, octet pour octet, et rien ne dit qu'il existe.
 */

/** L'adresse de l'écran (le middleware la réécrit vers l'arbre Spatial, l'adresse du navigateur ne change pas). */
export const CHEMIN_BIBLIOTHEQUE = '/assets';
/** Les paramètres de l'adresse · un seul est lu à la fois (le fichier l'emporte). */
export const PARAM_LIEN_FICHIER = 'fichier';
export const PARAM_LIEN_DOSSIER = 'dossier';

/** Ce que dit le menu · le lien est interne, réservé aux membres de l'espace. */
export const DETAIL_LIEN_INTERNE = 'Lien interne · s’ouvre pour un membre de l’espace connecté, jamais en public.';
/** Le toast après la copie, et celui d'un presse-papiers refusé. */
export const MESSAGE_LIEN_COPIE = {
  fichier: 'Lien du fichier copié · réservé aux membres de l’espace.',
  dossier: 'Lien du dossier copié · réservé aux membres de l’espace.',
  echec: 'Copie impossible · le navigateur refuse le presse-papiers.',
} as const;

/** `assets.id` et `library_folders.id` sont des UUID · toute autre forme n'est jamais lue. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface LienInterneLu {
  fichier: string | null;
  dossier: string | null;
}

/** Une valeur d'adresse · une seule chaîne UUID (minuscule), sinon rien · une valeur répétée n'est pas lue. */
function lireId(raw: string | readonly string[] | null | undefined): string | null {
  return typeof raw === 'string' && UUID.test(raw) ? raw.toLowerCase() : null;
}

/** Un identifiant de fichier ou de dossier tel que le lien le porte · un UUID (rendu en minuscules), sinon `null` · rien d'autre n'est jamais lu en base. */
export function idLienInterne(raw: unknown): string | null {
  return typeof raw === 'string' ? lireId(raw) : null;
}

/** Les paramètres de l'adresse (`searchParams` de la page) · le fichier l'emporte sur le dossier. */
export function lireLienInterne(sp: Readonly<Record<string, string | readonly string[] | undefined>>): LienInterneLu {
  const fichier = lireId(sp[PARAM_LIEN_FICHIER]);
  return { fichier, dossier: fichier ? null : lireId(sp[PARAM_LIEN_DOSSIER]) };
}

/** Ni lui ni un ancêtre en corbeille, et connu (même règle que la vue). */
function dossierVivant(d: DonneesDrive, id: string): boolean {
  const par = new Map(d.dossiers.map((x) => [x.id, x] as const));
  const vus = new Set<string>();
  let cur = par.get(id);
  if (!cur) return false;
  while (cur && !vus.has(cur.id)) { if (cur.supprime) return false; vus.add(cur.id); cur = cur.parent ? par.get(cur.parent) : undefined; }
  return true;
}

/** Le chemin d'un dossier depuis sa racine (même forme que `cheminVers`). */
function chemin(d: DonneesDrive, id: string): string[] {
  const par = new Map(d.dossiers.map((x) => [x.id, x] as const));
  const out: string[] = [];
  const vus = new Set<string>();
  let cur = par.get(id);
  while (cur && !vus.has(cur.id)) { vus.add(cur.id); out.unshift(cur.id); cur = cur.parent ? par.get(cur.parent) : undefined; }
  return out;
}

/** Un fichier que le lien rouvre · de la bibliothèque, hors corbeille, dans un dossier vivant. */
function fichierLiable(d: DonneesDrive, id: string): FichierDrive | null {
  const f = d.fichiers.find((x) => x.id === id);
  return f && UUID.test(f.id) && !f.lectureSeule && !f.supprime && dossierVivant(d, f.parent) ? f : null;
}

/** Un dossier que le lien rouvre · réel, vivant (ni une racine, ni un projet Studios). */
function dossierLiable(d: DonneesDrive, id: string): boolean {
  const x = d.dossiers.find((y) => y.id === id);
  return !!x && x.reel && UUID.test(x.id) && dossierVivant(d, id);
}

export interface OuvertureLienInterne {
  /** Le fichier dont l'aperçu s'ouvre · null pour un lien de dossier. */
  fichier: string | null;
  /** Le chemin ouvert dans l'arbre · le dossier du fichier, ou le dossier lié. */
  chemin: string[];
}

/**
 * Ce que l'adresse ouvre, résolu dans les données de la SESSION · `null` quand
 * rien ne correspond (autre espace, marque hors portée, corbeille, inconnu) ·
 * la page se rend alors comme sans paramètre.
 */
export function ouvertureLienInterne(d: DonneesDrive, lu: LienInterneLu): OuvertureLienInterne | null {
  if (lu.fichier) {
    const f = fichierLiable(d, lu.fichier);
    return f ? { fichier: f.id, chemin: chemin(d, f.parent) } : null;
  }
  if (lu.dossier && dossierLiable(d, lu.dossier)) return { fichier: null, chemin: chemin(d, lu.dossier) };
  return null;
}

/** Le lien interne d'un fichier · `null` quand il ne le rouvrirait pas (le menu ne propose alors pas le geste). */
export function lienInterneFichier(d: DonneesDrive, id: string): string | null {
  const f = fichierLiable(d, id);
  return f ? `${CHEMIN_BIBLIOTHEQUE}?${PARAM_LIEN_FICHIER}=${encodeURIComponent(f.id.toLowerCase())}` : null;
}

/** Le lien interne d'un dossier · `null` quand il ne le rouvrirait pas. */
export function lienInterneDossier(d: DonneesDrive, id: string): string | null {
  return dossierLiable(d, id) ? `${CHEMIN_BIBLIOTHEQUE}?${PARAM_LIEN_DOSSIER}=${encodeURIComponent(id.toLowerCase())}` : null;
}

/**
 * L'adresse une fois quittée la cible du lien (aperçu fermé, autre dossier) ·
 * la recherche sans les paramètres du lien, les autres gardés (`?tag=`…).
 * Un rafraîchissement ne rouvre plus ce qu'on vient de fermer.
 */
export function rechercheSansLien(search: string): string {
  const q = new URLSearchParams(search);
  q.delete(PARAM_LIEN_FICHIER);
  q.delete(PARAM_LIEN_DOSSIER);
  const s = q.toString();
  return s ? `?${s}` : '';
}

/**
 * Le fichier du lien à lire EN PLUS de la liste · l'identifiant quand
 * l'adresse vise un fichier absent des médias déjà chargés, sinon `null`
 * (aucune lecture · lien de dossier, aucun lien, fichier déjà là, y compris
 * à la corbeille chargée).
 */
export function fichierLienALire(lu: LienInterneLu, charges: readonly { id: string }[]): string | null {
  if (!lu.fichier) return null;
  return charges.some((m) => m.id.toLowerCase() === lu.fichier) ? null : lu.fichier;
}

export interface LienInterneResolu {
  /** Les données de l'écran · avec la cible lue à part seulement si le lien la rouvre. */
  donnees: DonneesDrive;
  ouverture: OuvertureLienInterne | null;
}

/**
 * Les données de l'écran et ce que l'adresse ouvre. `cible` · le fichier lu à
 * part (`fichierLienALire`), ou `null`. Il n'entre dans les données que si
 * le fichier de l'adresse est absent des médias chargés (jamais en double) et
 * que le lien le rouvre une fois la cible ajoutée (c'est bien lui · de la
 * bibliothèque, hors corbeille, dossier vivant) · sinon les données et
 * l'ouverture sont exactement celles sans cible.
 */
export function resoudreLienInterne(
  src: SourcesDrive,
  cible: MediaSource | null,
  lu: LienInterneLu,
): LienInterneResolu {
  if (cible && lu.fichier && !src.medias.some((m) => m.id.toLowerCase() === lu.fichier)) {
    const avec = donneesDrive({ ...src, medias: [...src.medias, cible] });
    const ouverture = ouvertureLienInterne(avec, lu);
    if (ouverture) return { donnees: avec, ouverture };
  }
  const donnees = donneesDrive(src);
  return { donnees, ouverture: ouvertureLienInterne(donnees, lu) };
}
