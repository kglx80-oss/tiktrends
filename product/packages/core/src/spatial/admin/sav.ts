/**
 * Tour de contrôle (Spatial, rubrique Admin) · les tickets du support réel
 * (tables `tickets` et `ticket_messages`). Pur.
 *
 * Les délais se MESURENT sur les messages · 1re réponse = premier message de
 * l'équipe (`is_staff`) après l'ouverture ; résolution = ouverture → dernière
 * mise à jour d'un ticket résolu (le statut « résolu » pose `updated_at`).
 * L'outil ne connaît ni priorité, ni délai contractuel, ni note de
 * satisfaction · aucune n'est inventée.
 */

export type StatutTicket = 'open' | 'in_progress' | 'resolved';
export type TypeTicket = 'bug' | 'suggestion' | 'question';

export interface MessageTicket { auteur: string; corps: string; equipe: boolean; le: Date }

export interface TicketPlateforme {
  id: string;
  espaceId: string;
  espace: string;
  auteur: string | null;
  type: TypeTicket;
  titre: string;
  corps: string;
  statut: StatutTicket;
  creeLe: Date;
  majLe: Date;
  messages: MessageTicket[];
  /** Forfait de l'espace · ordonne la file du SAV (support e-mail · prioritaire · dédié, 29/10). */
  plan?: string | null;
}

export const ONGLETS_SAV: ReadonlyArray<{ statut: StatutTicket; libelle: string }> = [
  { statut: 'open', libelle: 'Ouverts' },
  { statut: 'in_progress', libelle: 'En cours' },
  { statut: 'resolved', libelle: 'Résolus' },
];

/** La pastille du type · seule catégorie que le client choisit à l'ouverture. */
export const PASTILLE_TYPE_TICKET: Readonly<Record<TypeTicket, { libelle: string; classe: '' | 'r' | 'w' | 'c' }>> = {
  bug: { libelle: 'Bug', classe: 'r' },
  question: { libelle: 'Question', classe: 'w' },
  suggestion: { libelle: 'Suggestion', classe: 'c' },
};

export const LIBELLE_STATUT_TICKET: Readonly<Record<StatutTicket, string>> = { open: 'Ouvert', in_progress: 'En cours', resolved: 'Résolu' };

/** Un ticket non résolu attend l'équipe quand son dernier message n'est pas d'elle (ou qu'il n'a aucun message). */
export function attendReponse(t: Pick<TicketPlateforme, 'statut' | 'messages'>): boolean {
  if (t.statut === 'resolved') return false;
  const dernier = t.messages[t.messages.length - 1];
  return !dernier || !dernier.equipe;
}

const mediane = (xs: number[]): number | null => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};

export interface IndicateursSav {
  ouverts: number;
  sansReponse: number;
  /** Médiane, en minutes, sur les tickets ouverts dans les 30 derniers jours. */
  premiereReponseMin: number | null;
  reponsesMesurees: number;
  /** Médiane, en minutes, sur les tickets résolus dans les 30 derniers jours. */
  resolutionMin: number | null;
  resolutionsMesurees: number;
  parStatut: Record<StatutTicket, number>;
}

export function indicateursSav(tickets: readonly TicketPlateforme[], maintenant: Date): IndicateursSav {
  const depuis = maintenant.getTime() - 30 * 86_400_000;
  const reponses: number[] = [];
  const resolutions: number[] = [];
  const parStatut: Record<StatutTicket, number> = { open: 0, in_progress: 0, resolved: 0 };
  for (const t of tickets) {
    parStatut[t.statut] += 1;
    if (t.creeLe.getTime() > depuis) {
      const r = t.messages.find((m) => m.equipe && m.le.getTime() >= t.creeLe.getTime());
      if (r) reponses.push((r.le.getTime() - t.creeLe.getTime()) / 60_000);
    }
    if (t.statut === 'resolved' && t.majLe.getTime() > depuis) resolutions.push((t.majLe.getTime() - t.creeLe.getTime()) / 60_000);
  }
  return {
    ouverts: parStatut.open + parStatut.in_progress,
    sansReponse: tickets.filter(attendReponse).length,
    premiereReponseMin: mediane(reponses), reponsesMesurees: reponses.length,
    resolutionMin: mediane(resolutions), resolutionsMesurees: resolutions.length,
    parStatut,
  };
}

/** Les tickets d'un onglet, le plus ancien sans réponse d'abord, puis le plus récent. */
export function ticketsDeLOnglet(tickets: readonly TicketPlateforme[], statut: StatutTicket): TicketPlateforme[] {
  return tickets.filter((t) => t.statut === statut).sort((a, b) => {
    const ra = attendReponse(a) ? 0 : 1, rb = attendReponse(b) ? 0 : 1;
    if (ra !== rb) return ra - rb;
    return ra === 0 ? a.creeLe.getTime() - b.creeLe.getTime() : b.majLe.getTime() - a.majLe.getTime();
  });
}

/** « #3f2a91 » · le numéro court d'un ticket (début de l'identifiant). */
export const numeroTicket = (id: string) => `#${id.replace(/-/g, '').slice(0, 6)}`;

/**
 * Les réponses types · du texte inséré dans la réponse, rien d'autre (aucune
 * action n'est simulée · « crédits recrédités » n'y figure pas, l'outil n'a
 * pas ce geste ici).
 */
export const REPONSES_TYPES: ReadonlyArray<{ libelle: string; texte: string }> = [
  { libelle: 'Problème identifié', texte: 'Bonjour, merci pour votre message. Nous avons identifié le problème et nous revenons vers vous dès qu’il est réglé.' },
  { libelle: 'Besoin de précisions', texte: 'Bonjour, merci pour votre message. Pourriez-vous nous préciser la marque concernée et l’heure à laquelle le problème est apparu ?' },
  { libelle: 'C’est réglé', texte: 'Bonjour, c’est réglé de notre côté. N’hésitez pas à nous répondre ici si le problème revient.' },
];

/**
 * L'état d'attente d'un ticket (la barre `savsla`) · un FAIT, sans délai
 * contractuel · sans réponse (rouge), répondu (vert), résolu (vert).
 */
export function etatAttente(t: Pick<TicketPlateforme, 'statut' | 'messages' | 'creeLe' | 'majLe'>, maintenant: Date, duree: (min: number) => string): { classe: 'g' | 'r'; texte: string } {
  const min = (d: Date) => (maintenant.getTime() - d.getTime()) / 60_000;
  if (t.statut === 'resolved') return { classe: 'g', texte: `Résolu en ${duree((t.majLe.getTime() - t.creeLe.getTime()) / 60_000)}` };
  if (attendReponse(t)) {
    const dernier = t.messages[t.messages.length - 1];
    return { classe: 'r', texte: `En attente de réponse depuis ${duree(min(dernier?.le ?? t.creeLe))}` };
  }
  const r = [...t.messages].reverse().find((m) => m.equipe)!;
  return { classe: 'g', texte: `Dernière réponse de l’équipe il y a ${duree(min(r.le))}` };
}

/** La pastille d'état du détail · « Sans réponse » (r), « Répondu » (vert), « Résolu » (vert). */
export function pastilleEtatTicket(t: Pick<TicketPlateforme, 'statut' | 'messages'>): { libelle: string; classe: '' | 'g' | 'r' } {
  if (t.statut === 'resolved') return { libelle: 'Résolu', classe: 'g' };
  return attendReponse(t) ? { libelle: 'Sans réponse', classe: 'r' } : { libelle: 'Répondu', classe: 'g' };
}
