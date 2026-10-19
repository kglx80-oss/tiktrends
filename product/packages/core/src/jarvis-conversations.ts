/**
 * UX V5 · plusieurs conversations Jarvis par marque, règle PURE.
 *
 * ── Le défaut que ce module ferme ────────────────────────────────────────────
 *
 * Jarvis n'avait qu'UN fil par (marque, personne) · ouvrir une nouvelle piste
 * effaçait la précédente. La maquette V5 pose une colonne « Mes conversations »
 * avec une liste nommée · pour la porter honnêtement, il faut de vraies
 * conversations distinctes, chacune portée (espace + marque + personne), pas une
 * illusion au-dessus d'un fil unique.
 *
 * Ce module ne touche ni la base ni le réseau · il décide :
 *
 *  · `titreConversation` · le titre d'une conversation, dérivé de son premier
 *    message quand la personne n'en a pas donné · borné, sans retour à la ligne
 *    ni marqueur, jamais vide ;
 *  · `titreValide` · nettoie un titre proposé au renommage · `null` si rien ne
 *    reste (on garde alors l'ancien) ;
 *  · `conversationDansPortee` · SECONDE barrière après la requête · une
 *    conversation d'un autre espace, d'une autre marque ou d'une autre personne
 *    est écartée ICI même si l'appelant la passait par erreur.
 *
 * La portée (espace + marque + personne) est la même règle que le fil unique
 * d'avant · deux personnes sur la même marque ne lisent pas les brouillons de
 * réflexion l'une de l'autre (cf. schema `jarvis_messages`).
 */

/** Au-delà, un titre encombre la colonne sans rien ajouter. */
export const MAX_TITRE_CONVERSATION = 80;

/** Le titre d'une conversation sans message ni nom · neutre, jamais vide. */
export const TITRE_CONVERSATION_PAR_DEFAUT = 'Nouvelle conversation';

/** Une ligne de titre · sans retour, sans marqueur `[[…]]`, sans séparateur de blocs, coupée proprement. */
function platBorne(texte: string, max: number): string {
  const plat = texte
    .replace(/\[\[|\]\]/g, ' ')
    .replace(/-{3,}/g, '·')
    .replace(/[—–]/g, '·')
    .replace(/\s+/g, ' ')
    .trim();
  const car = [...plat];
  return car.length <= max ? plat : `${car.slice(0, max - 1).join('').trimEnd()}…`;
}

/**
 * Le titre d'une conversation.
 *
 * Priorité au titre choisi par la personne (nettoyé) ; sinon dérivé du premier
 * message utilisateur (une conversation « Angles rentrée des clubs » se reconnaît
 * à sa première question) ; sinon le libellé neutre, jamais une chaîne vide qui
 * laisserait une ligne cliquable sans texte.
 */
export function titreConversation(p: { titre?: string | null; premierMessage?: string | null }): string {
  const choisi = p.titre ? platBorne(p.titre, MAX_TITRE_CONVERSATION) : '';
  if (choisi) return choisi;
  const derive = p.premierMessage ? platBorne(p.premierMessage, MAX_TITRE_CONVERSATION) : '';
  return derive || TITRE_CONVERSATION_PAR_DEFAUT;
}

/**
 * Un titre proposé au renommage · nettoyé et borné, `null` si rien ne reste.
 *
 * On renvoie `null` plutôt qu'une chaîne vide pour que l'appelant garde l'ancien
 * titre · un renommage « vers rien » n'efface pas le nom d'une conversation.
 */
export function titreValide(propose: string): string | null {
  const t = platBorne(propose, MAX_TITRE_CONVERSATION);
  return t ? t : null;
}

export interface PorteeConversation {
  workspaceId: string;
  brandId: string;
  userId: string;
}

/**
 * La conversation est-elle DANS la portée demandée ? Seconde barrière après la
 * requête SQL · espace ET marque ET personne doivent coïncider, et aucun champ
 * de portée ne peut être vide (une portée partielle n'ouvre rien).
 */
export function conversationDansPortee(
  conv: { workspaceId: string; brandId: string; userId: string },
  portee: PorteeConversation,
): boolean {
  if (!portee.workspaceId || !portee.brandId || !portee.userId) return false;
  return conv.workspaceId === portee.workspaceId
    && conv.brandId === portee.brandId
    && conv.userId === portee.userId;
}
