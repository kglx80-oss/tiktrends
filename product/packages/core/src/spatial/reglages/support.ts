import { LIBELLE_STATUT_TICKET, PASTILLE_TYPE_TICKET, type StatutTicket, type TypeTicket } from '../admin/sav';

/**
 * Spatial · Réglages · « Support » de l'espace (vague 4 · écrans V5 `/support`
 * et `/support/[id]` sans fragment de maquette). Pur.
 *
 * Un ticket reste DANS l'espace · seuls ses administrateurs le voient et y
 * répondent (aucun envoi à l'équipe de la plateforme · recette #106). Les
 * pastilles reprennent celles du poste SAV du Tour de contrôle.
 */

/** Les types proposés à l'ouverture · ordre de l'écran V5 (« Question » par défaut). */
export const TYPES_TICKET: ReadonlyArray<{ cle: TypeTicket; libelle: string }> = [
  { cle: 'question', libelle: PASTILLE_TYPE_TICKET.question.libelle },
  { cle: 'bug', libelle: PASTILLE_TYPE_TICKET.bug.libelle },
  { cle: 'suggestion', libelle: PASTILLE_TYPE_TICKET.suggestion.libelle },
];

export const STATUTS_TICKET: readonly StatutTicket[] = ['open', 'in_progress', 'resolved'];

/** La pastille du statut · ouvert (attente), en cours, résolu. */
export function pastilleStatutTicket(statut: string): { libelle: string; classe: 'w' | 'c' | 'g' } {
  const s = (STATUTS_TICKET as readonly string[]).includes(statut) ? (statut as StatutTicket) : 'open';
  return { libelle: LIBELLE_STATUT_TICKET[s], classe: s === 'resolved' ? 'g' : s === 'in_progress' ? 'c' : 'w' };
}

/** La pastille du type · un type inconnu garde son nom, sans couleur. */
export function pastilleTypeTicket(type: string): { libelle: string; classe: '' | 'r' | 'w' | 'c' } {
  return PASTILLE_TYPE_TICKET[type as TypeTicket] ?? { libelle: type, classe: '' };
}

/**
 * Qui lit un ticket · un administrateur de l'espace lit tous ceux de son
 * espace, un membre seulement les siens (règle des actions du support).
 */
export function peutLireTicket(p: { admin: boolean; auteurId: string | null; utilisateurId: string }): boolean {
  return p.admin || p.auteurId === p.utilisateurId;
}

export interface MessageFil { id: string; auteur: string; corps: string; equipe: boolean; le: Date }

/**
 * Le fil d'un ticket · ses messages ; un ancien ticket sans message montre son
 * corps comme message d'ouverture (comportement de l'écran V5).
 */
export function filTicket(
  t: { auteur: string | null; corps: string | null; creeLe: Date },
  messages: ReadonlyArray<{ id: string; auteur: string | null; corps: string; equipe: boolean; le: Date }>,
): MessageFil[] {
  if (messages.length > 0) return messages.map((m) => ({ ...m, auteur: m.auteur ?? 'Utilisateur' }));
  return t.corps ? [{ id: 'ouverture', auteur: t.auteur ?? 'Utilisateur', corps: t.corps, equipe: false, le: t.creeLe }] : [];
}

/** Les messages des actions du support qui redirigent (`?ok=` / `?e=`) · textes des écrans V5. */
export function messagesRetourSupport(): Record<string, string> {
  return {
    'ok:1': 'Message envoyé.',
    'ok:created': 'Ticket ouvert · les admins de ton espace le voient dans ce fil.',
    'ok:reply': 'Réponse envoyée.',
    'ok:status': 'Statut mis à jour.',
    'e:title': 'Ajoute un titre.',
    'e:empty': 'Écris un message.',
    'e:forbidden': 'Action non autorisée.',
    'e:notfound': 'Ticket introuvable.',
    'e:bad': 'Demande incomplète · réessaie depuis le ticket.',
  };
}

/** Ce que dit l'écran sur la portée d'un ticket · il ne quitte pas l'espace. */
export const PORTEE_TICKET = 'Chaque message ouvre un fil visible par les admins de ton espace. Tu reçois une notification (la cloche) dès qu’un admin te répond ou change le statut. Le ticket reste dans ton espace · il n’est pas transmis automatiquement à l’équipe TikTrends.';
