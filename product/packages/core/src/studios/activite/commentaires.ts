/**
 * Studios · lot 10 V5 · les COMMENTAIRES d'un projet (PC D15).
 *
 * Pur. Un commentaire porte sur une VERSION du projet ou sur une CRÉATION
 * (sortie livrée d'un lot). Les règles, rejouées par le serveur à chaque geste
 * (une action serveur est appelable directement, rien n'est cru du client) :
 *
 *  · le texte · une chaîne, normalisée (fins de ligne, caractères de contrôle
 *    retirés, espaces de bord), de 1 à `LONGUEUR_MAX_COMMENTAIRE` caractères ·
 *    un texte vide (ou fait d'espaces) est refusé avec sa raison ;
 *  · écrire · qui peut PROPOSER sur le projet (`studio.propose`, la garde de
 *    l'édition) · un lecteur lit, n'écrit pas ;
 *  · modifier · SEULEMENT son propre commentaire, encore ouvert · l'ancien
 *    texte est gardé (`historique`), borné à `MODIFICATIONS_MAX_COMMENTAIRE` ;
 *  · résoudre / rouvrir · qui peut proposer, quel que soit l'auteur (le
 *    commentaire est un fil d'équipe) ;
 *  · supprimer · JAMAIS (choix du lot · un commentaire se RÉSOUT, il reste lu
 *    sous « Résolus » · aucun masquage, aucune perte de texte).
 *
 * Le texte n'est jamais du HTML · l'écran le rend comme du texte (React
 * l'échappe), retours à la ligne conservés.
 */

/**
 * 2 000 caractères · la borne de toute raison écrite des studios
 * (`ajouterAudit` coupe `reason` à 2 000) et la contrainte posée en base
 * (`studio_comments_longueur_ck`, migration 0074) · un commentaire tient sur
 * un écran.
 */
export const LONGUEUR_MAX_COMMENTAIRE = 2000;

/** Au-delà, on écrit un nouveau commentaire · l'historique d'un commentaire reste lisible d'un coup d'œil. */
export const MODIFICATIONS_MAX_COMMENTAIRE = 20;

export type CibleCommentaire = 'version' | 'creation';

// Caractères de contrôle (hors tabulation et retour à la ligne) et caractères de direction invisibles.
// eslint-disable-next-line no-control-regex
const CONTROLES = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F‎‏‪-‮⁦-⁩]/g;

export type TexteCommentaire = { ok: true; texte: string } | { ok: false; raison: string };

/** Le texte d'un commentaire, normalisé et borné · ou la raison du refus, à dire à côté du bouton. */
export function validerTexteCommentaire(x: unknown): TexteCommentaire {
  if (typeof x !== 'string') return { ok: false, raison: 'Le commentaire doit être un texte · recharge la page puis recommence.' };
  const t = x.replace(/\r\n?/g, '\n').replace(CONTROLES, '').replace(/[ \t]+$/gm, '').replace(/\n{3,}/g, '\n\n').trim();
  if (!t) return { ok: false, raison: 'Le commentaire est vide · écris ce que tu as vu avant de publier.' };
  const n = [...t].length;
  if (n > LONGUEUR_MAX_COMMENTAIRE) return { ok: false, raison: `Le commentaire fait ${n} caractères · ${LONGUEUR_MAX_COMMENTAIRE} au plus, raccourcis-le.` };
  return { ok: true, texte: t };
}

/** La cible demandée par le client · `version` ou `creation`, sinon rien. */
export function cibleCommentaire(x: unknown): CibleCommentaire | null {
  return x === 'version' || x === 'creation' ? x : null;
}

export interface GesteCommentaire { ok: boolean; raison: string | null }

export interface DroitsCommentaire { modifier: GesteCommentaire; resoudre: GesteCommentaire; rouvrir: GesteCommentaire }

export const RAISON_LECTEUR_COMMENTAIRE = 'Ton rôle permet de lire les commentaires de ce projet, pas d’en écrire ni d’en résoudre · demande à un membre de l’espace.';

/** Ce que la personne peut faire d'un commentaire · rejoué par le serveur avant toute écriture. */
export function droitsCommentaire(
  c: { auteurId: string | null; resolu: boolean; modifications: number },
  moi: { userId: string; peutProposer: boolean },
): DroitsCommentaire {
  const lecteur: GesteCommentaire = { ok: false, raison: RAISON_LECTEUR_COMMENTAIRE };
  if (!moi.peutProposer) return { modifier: lecteur, resoudre: lecteur, rouvrir: lecteur };
  const modifier: GesteCommentaire = c.auteurId === null || c.auteurId !== moi.userId
    ? { ok: false, raison: 'Seule la personne qui l’a écrit peut le modifier · réponds par un nouveau commentaire.' }
    : c.resolu ? { ok: false, raison: 'Ce commentaire est résolu · rouvre-le pour le modifier.' }
      : c.modifications >= MODIFICATIONS_MAX_COMMENTAIRE ? { ok: false, raison: `Déjà modifié ${MODIFICATIONS_MAX_COMMENTAIRE} fois · écris un nouveau commentaire.` }
        : { ok: true, raison: null };
  return {
    modifier,
    resoudre: c.resolu ? { ok: false, raison: 'Ce commentaire est déjà résolu.' } : { ok: true, raison: null },
    rouvrir: c.resolu ? { ok: true, raison: null } : { ok: false, raison: 'Ce commentaire est encore ouvert.' },
  };
}

/** Une entrée de l'historique · le texte remplacé et quand il l'a été. */
export interface AncienTexteCommentaire { texte: string; remplaceLe: string }

/** L'historique lu de la base, défensivement · une entrée illisible est ignorée, jamais inventée. */
export function lireHistoriqueCommentaire(x: unknown): AncienTexteCommentaire[] {
  if (!Array.isArray(x)) return [];
  return x.flatMap((e) => (typeof e === 'object' && e !== null && typeof (e as AncienTexteCommentaire).texte === 'string' && typeof (e as AncienTexteCommentaire).remplaceLe === 'string'
    ? [{ texte: (e as AncienTexteCommentaire).texte, remplaceLe: (e as AncienTexteCommentaire).remplaceLe }] : []));
}

/** L'historique après une modification · l'ancien texte s'ajoute à la fin, rien ne se perd. */
export function historiqueApresModification(historique: unknown, ancien: string, remplaceLe: string): AncienTexteCommentaire[] {
  return [...lireHistoriqueCommentaire(historique), { texte: ancien, remplaceLe }];
}

/** Le bouton « Publier » · fermé tant que le texte n'est pas publiable, la raison écrite à côté. */
export function etatPublicationCommentaire(texte: string, o: { peutProposer: boolean; cibleChoisie: boolean }): GesteCommentaire {
  if (!o.peutProposer) return { ok: false, raison: RAISON_LECTEUR_COMMENTAIRE };
  if (!o.cibleChoisie) return { ok: false, raison: 'Choisis la version ou la création que tu commentes.' };
  const v = validerTexteCommentaire(texte);
  return v.ok ? { ok: true, raison: null } : { ok: false, raison: v.raison };
}

export type FiltreCommentaires = 'ouverts' | 'resolus' | 'tous';

/** Les commentaires gardés par le filtre · « ouverts » par défaut, les résolus restent lisibles sous leur filtre. */
export function filtrerCommentaires<T extends { resolu: unknown }>(liste: readonly T[], f: FiltreCommentaires): T[] {
  if (f === 'tous') return [...liste];
  return liste.filter((c) => (f === 'resolus' ? !!c.resolu : !c.resolu));
}

/** Un extrait sûr pour une notification · texte seul, coupé au mot. */
export function extraitCommentaire(t: string, max = 140): string {
  const plat = t.replace(/\s+/g, ' ').trim();
  if ([...plat].length <= max) return plat;
  const coupe = [...plat].slice(0, max).join('');
  const i = coupe.lastIndexOf(' ');
  return `${(i > max * 0.6 ? coupe.slice(0, i) : coupe).trimEnd()}…`;
}
