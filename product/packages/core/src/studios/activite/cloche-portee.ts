import { extraitCommentaire } from './commentaires';
import { filDeLaMention, projetDuLienMention, TYPES_NOTIF_MENTION, type FilMentionnant, type GenreMention } from './mes-mentions';
import { peutLireTicket } from '../../spatial/reglages/support';

/**
 * Studios · la cloche (centre de notifications de la coquille, bandeau
 * d'arrivée, « Quoi de neuf » de l'Accueil) relit dans la portée ACTUELLE ce
 * qu'elle montre d'une notification née d'un fil borné · la relecture de
 * « Mes mentions » (#1081), appliquée telle quelle, jamais recopiée.
 *
 * Pur · ni base, ni réseau, ni modèle, ni horloge. Les règles :
 *
 *  · les types BORNÉS · ceux dont le titre et le texte viennent d'un fil des
 *    Studios, donc d'un projet borné à SA marque et lu sous `studio.read` ·
 *    la mention dans un commentaire, la mention dans une note de la lignée
 *    (`TYPES_NOTIF_MENTION`), le nouveau commentaire prévenu au propriétaire
 *    du projet (`studio_comment`) · tout autre type est montré tel quel (le
 *    recensement de `createNotification` est écrit dans `TYPES_NOTIF_RECENSES`,
 *    avec la raison de chacun) ;
 *  · RELUE · la notification est de l'espace COURANT, son genre est lisible
 *    (garde des Studios, capacités « projets », et « canvas » pour une note),
 *    son projet est relu dans la portée (`lireProjet`, marque du projet) et,
 *    pour une mention, un fil de ce projet relu dans la portée l'a prévenue ET
 *    redonne son extrait (texte courant ou ancien · `filDeLaMention`, puis
 *    `extraitCommentaire`) · une notification que rien ne redonne n'est pas
 *    lue sur parole ;
 *  · relue · titre, texte et lien EXACTEMENT comme avant (rien ne change à
 *    l'écran) · sinon · « Mention · fil hors de ta portée » (« Commentaire · … »
 *    pour le propriétaire), la raison, SANS extrait, ni projet, ni auteur, ni
 *    lien · la notification reste (le compte non lu ne bouge pas), rien n'est
 *    écrit ni supprimé ;
 *  · les tickets de support (`ticket_new`, `ticket_reply`, `ticket_status` ·
 *    `TYPES_NOTIF_TICKET`) · relus contre la règle de la page du ticket,
 *    `peutLireTicket` (C/spatial/reglages/support.ts · un administrateur de
 *    l'espace lit tous ses tickets, un membre seulement les siens), sous le
 *    rôle ACTUEL de la personne dans l'espace DU TICKET (retirée de l'espace ·
 *    plus administratrice), le ticket relu (introuvable, ou d'un autre espace
 *    que sa notification · rien) · l'auteur garde TOUJOURS ses tickets · sinon
 *    « Ticket · plus accessible avec ton rôle actuel », la raison, sans titre,
 *    ni texte, ni lien · la cloche n'est PAS bornée à l'espace courant
 *    (décision de Kevin en attente) · le ticket d'un autre espace où la
 *    personne administre encore est montré comme avant.
 *
 * ── Le coût, mesuré (la cloche est relue toutes les 45 s) ─────────────────────
 *
 * `fetchNotifications` sur la base de test (pglite, semis de
 * `W/test/cloche-portee-db.test.tsx`), 5 lectures de chauffe puis 30
 * chronométrées · 3 essais ALTERNÉS avant / après (avant = main b839efe, la
 * même action sans relecture), le 2026-11-15, 4 vCPU, charge 2,2 à 2,7 ·
 * fourchette des 3 médianes, et des 3 p90 après :
 *
 * | semis                                                   | requêtes | médiane avant → après    | p90 après      |
 * |---------------------------------------------------------|----------|--------------------------|----------------|
 * | 60 mentions, 25 projets · 20 projets distincts, 2 genres | 2 → 9    | 1,26-1,51 → 7,41-8,36 ms | 9,99-11,74 ms  |
 * | 2 mentions sur 1 projet, 2 genres                       | 2 → 9    | 0,92-1,06 → 5,50-6,04 ms | 7,35-8,28 ms   |
 * | 30 notifications ordinaires (aucune bornée)             | 2 → 2    | 1,12-1,32 → 1,37-1,49 ms | 1,92-2,52 ms   |
 * | 7 notifications dont 6 bornées                          | 2 → 9    | 0,95-1,09 → 5,94-6,93 ms | 8,57-8,73 ms   |
 *
 * Les 7 lectures ajoutées sont FIXES · marques, restrictions et réglage des
 * capacités (la garde des Studios), réglage « canvas », les projets en UNE
 * requête, les fils en une requête par genre · en production la garde relit
 * aussi la session (`getSession`, 4 lectures, simulée par le test) · ≈ 11
 * lectures de plus par relecture, une fois toutes les 45 s page visible.
 *
 * Les tickets · UNE lecture pour le lot (`tickets` joint au rôle de la
 * personne dans l'espace de chaque ticket, `W/lib/studios/mes-mentions.ts`),
 * jamais une par notification ni par ticket · même banc (semis de
 * `W/test/cloche-tickets-db.test.tsx` · 25 tickets ouverts et 20 relances par
 * les vraies actions, 15 mentions · 60 notifications mêlées), 5 lectures de
 * chauffe puis 30 chronométrées, 3 essais ALTERNÉS avant / après (avant = main
 * 8fc3bf0), le 2026-11-15, 4 vCPU, charge 1,1 à 2,4 · fourchette des 3
 * médianes, et des 3 p90 après :
 *
 * | cloche (20 lignes lues)                                    | requêtes | médiane avant → après    | p90 après      |
 * |------------------------------------------------------------|----------|--------------------------|----------------|
 * | 60 mêlées · 10 tickets sur 10 tickets + 10 mentions         | 8 → 9    | 6,78-7,78 → 5,81-9,55 ms | 8,41-13,29 ms  |
 * | 20 notifications de ticket sur 20 tickets distincts         | 2 → 3    | 1,44-1,84 → 2,55-3,00 ms | 3,93-4,31 ms   |
 * | 1 notification de ticket                                    | 2 → 3    | 1,09-1,52 → 1,78-2,19 ms | 2,36-2,62 ms   |
 * | 30 notifications ordinaires (aucun ticket, aucun fil borné) | 2 → 2    | 1,32-1,69 → 1,29-1,59 ms | 1,91-1,92 ms   |
 *
 * UNE lecture de plus, la même pour 1 ou 20 tickets (gardé par le test) ·
 * lancée en parallèle de la relecture des Studios (le surcoût d'une cloche
 * mêlée se perd dans le bruit) · une cloche sans ticket ne paie rien.
 *
 * La relecture coûte un nombre FIXE de lectures (session, marques,
 * restrictions et réglages des capacités · la garde des Studios · puis les
 * projets en UNE requête, les fils en une requête par genre), jamais une par
 * notification ni par projet · 60 mentions ou 2, le même compte, gardé par le
 * test · une cloche sans notification bornée ne paie rien. Les 20 lignes de la
 * cloche (et les 20 d'une page de « Mes mentions ») bornent les identifiants
 * lus d'un coup.
 */

export type RelectureNotif = 'fil' | 'projet';
export interface BornageNotif { genre: GenreMention; relecture: RelectureNotif; neutre: string }

export const TEXTES_CLOCHE_PORTEE = {
  mention: 'Mention · fil hors de ta portée',
  commentaire: 'Commentaire · fil hors de ta portée',
  raison: 'Tu ne vois plus ce projet (espace, marque ou droits Studios) · son texte n’est pas montré.',
  ticket: 'Ticket · plus accessible avec ton rôle actuel',
  raisonTicket: 'Ce ticket est réservé à son auteur et aux administrateurs de son espace · son texte n’est pas montré.',
} as const;

/** Les types du support · relus contre l'accès au ticket (`peutLireTicket`) avant d'être montrés. */
export const TYPES_NOTIF_TICKET: readonly string[] = ['ticket_new', 'ticket_reply', 'ticket_status'];

/** Le type est-il une notification de ticket ? */
export function estNotifTicket(type: string): boolean {
  return TYPES_NOTIF_TICKET.includes(type);
}

/** Le ticket désigné par l'adresse d'une notification (`/support/<id>`, `createTicketAction` et suivantes) · `null` sinon (en minuscules). */
export function ticketDuLien(href: string | null | undefined): string | null {
  const m = /^\/support\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:[?#].*)?$/i.exec(href ?? '');
  return m ? m[1]!.toLowerCase() : null;
}

/** Un ticket relu · son espace, son auteur, et si la personne en est ACTUELLEMENT administratrice (membre de cet espace, rôle administrateur au moins · retirée, `false`). */
export interface AccesTicketCloche { workspaceId: string; auteurId: string | null; admin: boolean }

/** Les tickets relus pour la personne · `null` quand rien ne l'a été (lecture en échec) · aucune notification de ticket n'est alors lue sur parole. */
export interface PorteeTickets {
  utilisateurId: string;
  /** Par identifiant de ticket (minuscules) · un ticket absent est introuvable. */
  tickets: ReadonlyMap<string, AccesTicketCloche>;
}

/** Les tickets à relire · ceux que désignent des notifications de ticket, de TOUS les espaces (la cloche n'est pas bornée à l'espace courant), une fois chacun. */
export function besoinsTickets(notifs: readonly Pick<NotifCloche, 'type' | 'href'>[]): string[] {
  const ids = new Set<string>();
  for (const n of notifs) {
    const id = estNotifTicket(n.type) ? ticketDuLien(n.href) : null;
    if (id) ids.add(id);
  }
  return [...ids];
}

/** La notification de ticket est-elle lisible · le ticket relu, de l'espace de la notification, et la règle de la page du ticket (`peutLireTicket`) sous le rôle actuel. */
export function ticketRelu(n: Pick<NotifCloche, 'workspaceId' | 'href'>, t: PorteeTickets | null): boolean {
  const id = ticketDuLien(n.href);
  const a = id && t ? t.tickets.get(id) : undefined;
  if (!a || !t || a.workspaceId !== n.workspaceId) return false;
  return peutLireTicket({ admin: a.admin, auteurId: a.auteurId, utilisateurId: t.utilisateurId });
}

/** Les types dont le texte vient d'un fil des Studios · relus dans la portée avant d'être montrés. */
export const TYPES_NOTIF_BORNES: Readonly<Record<string, BornageNotif>> = {
  [TYPES_NOTIF_MENTION.commentaire]: { genre: 'commentaire', relecture: 'fil', neutre: TEXTES_CLOCHE_PORTEE.mention },
  [TYPES_NOTIF_MENTION.note]: { genre: 'note', relecture: 'fil', neutre: TEXTES_CLOCHE_PORTEE.mention },
  studio_comment: { genre: 'commentaire', relecture: 'projet', neutre: TEXTES_CLOCHE_PORTEE.commentaire },
};

/**
 * Le recensement de TOUS les types écrits dans `notifications` (les appels de
 * `createNotification`, `notifyWorkspaceStaff` et les insertions directes) ·
 * borné (relu ici) ou laissé tel quel, et pourquoi · un type nouveau fait
 * échouer la garde de recensement tant qu'il n'est pas classé ici.
 */
export const TYPES_NOTIF_RECENSES: Readonly<Record<string, { bornee: boolean; raison: string }>> = {
  studio_comment_mention: { bornee: true, raison: 'Texte et projet d’un commentaire · borné à la marque du projet et à studio.read.' },
  studio_note_mention: { bornee: true, raison: 'Texte et projet d’une note de la lignée · borné à la marque du projet, à studio.read et à « canvas ».' },
  studio_comment: { bornee: true, raison: 'Texte et projet d’un nouveau commentaire, prévenu au propriétaire · borné comme le commentaire.' },
  ticket_new: { bornee: true, raison: 'Titre et auteur d’un ticket, prévenus à l’administration · relu contre l’accès au ticket (peutLireTicket) sous le rôle actuel.' },
  ticket_reply: { bornee: true, raison: 'Titre et texte d’une réponse, à l’auteur ou à l’administration · relu contre l’accès au ticket sous le rôle actuel.' },
  ticket_status: { bornee: true, raison: 'Titre du ticket et statut, prévenus à son auteur · relu contre l’accès au ticket (l’auteur le garde toujours).' },
  digest: { bornee: false, raison: 'Récap hebdomadaire de l’espace · aux administrateurs, aucune restriction de marque ne s’y applique · reste.' },
  radar: { bornee: false, raison: 'Compte rendu du radar · aux membres de l’espace, la page Radar n’applique aucune restriction de marque · reste.' },
  tracker: { bornee: false, raison: 'Un nombre de nouvelles pubs et une phrase fixe · aucun texte d’objet · ne peut pas fuir.' },
};

/** Le bornage d'un type · `null` pour un type montré tel quel. */
export function bornageDeNotif(type: string): BornageNotif | null {
  return TYPES_NOTIF_BORNES[type] ?? null;
}

/** Une notification telle que la table la porte (les champs que la cloche montre, et ce qui la relit). */
export interface NotifCloche { type: string; workspaceId: string; titre: string; corps: string | null; href: string | null; creeLe: number }

/** Ce qui a été relu dans la portée ACTUELLE de la session · `null` quand rien ne l'a été (aucune portée Studios, ou la lecture a échoué). */
export interface PorteeCloche {
  workspaceId: string;
  /** Les genres que la session lit (garde des Studios et capacités). */
  genres: ReadonlySet<GenreMention>;
  /** Les projets relus dans la portée (identifiants en minuscules). */
  projets: ReadonlySet<string>;
  /** Les fils relus dans la portée qui ont prévenu la personne. */
  fils: readonly FilMentionnant[];
}

/** Ce qu'il faut relire · les projets de l'espace courant que désignent des notifications bornées d'un genre lisible, et ceux dont il faut lire les fils, par genre. */
export function besoinsCloche(notifs: readonly Pick<NotifCloche, 'type' | 'workspaceId' | 'href'>[], workspaceId: string, genres: ReadonlySet<GenreMention>): { projets: string[]; fils: Record<GenreMention, string[]> } {
  const projets = new Set<string>();
  const fils: Record<GenreMention, Set<string>> = { commentaire: new Set(), note: new Set() };
  for (const n of notifs) {
    const b = bornageDeNotif(n.type);
    const pid = b && n.workspaceId === workspaceId && genres.has(b.genre) ? projetDuLienMention(n.href) : null;
    if (!b || !pid) continue;
    projets.add(pid);
    if (b.relecture === 'fil') fils[b.genre].add(pid);
  }
  return { projets: [...projets], fils: { commentaire: [...fils.commentaire], note: [...fils.note] } };
}

/** Le type est-il relu avant d'être montré (un fil des Studios, ou un ticket) ? */
export function notifBornee(type: string): boolean {
  return !!bornageDeNotif(type) || estNotifTicket(type);
}

/** La notification est-elle relue dans la portée actuelle ? · toujours pour un type non borné · un ticket, contre son accès (`t`). */
export function notifRelueDansPortee(n: NotifCloche, p: PorteeCloche | null, t: PorteeTickets | null = null): boolean {
  if (estNotifTicket(n.type)) return ticketRelu(n, t);
  const b = bornageDeNotif(n.type);
  if (!b) return true;
  if (!p || n.workspaceId !== p.workspaceId || !p.genres.has(b.genre)) return false;
  const projet = projetDuLienMention(n.href);
  if (!projet || !p.projets.has(projet)) return false;
  if (b.relecture === 'projet') return true;
  const corps = n.corps?.trim();
  if (!corps) return false;
  const id = filDeLaMention({ genre: b.genre, projetId: projet, corps, creeLe: n.creeLe }, p.fils);
  const fil = id ? p.fils.find((f) => f.id === id && f.genre === b.genre) : undefined;
  return !!fil && fil.textes.some((t) => extraitCommentaire(t) === corps);
}

/** Ce que la cloche MONTRE · tel quel quand la notification est relue (ou non bornée), sinon le libellé neutre, la raison, sans lien. */
export function texteNotifCloche(n: Pick<NotifCloche, 'type' | 'titre' | 'corps' | 'href'>, relue: boolean): { titre: string; corps: string | null; href: string | null } {
  if (estNotifTicket(n.type) && !relue) return { titre: TEXTES_CLOCHE_PORTEE.ticket, corps: TEXTES_CLOCHE_PORTEE.raisonTicket, href: null };
  const b = bornageDeNotif(n.type);
  if (!b || relue) return { titre: n.titre, corps: n.corps, href: n.href };
  return { titre: b.neutre, corps: TEXTES_CLOCHE_PORTEE.raison, href: null };
}

/** Les notifications telles que la cloche les montre, relues dans `p` (les fils des Studios) et `t` (les tickets). */
export function notifsDansPortee(notifs: readonly NotifCloche[], p: PorteeCloche | null, t: PorteeTickets | null = null): Array<{ titre: string; corps: string | null; href: string | null }> {
  return notifs.map((n) => texteNotifCloche(n, notifRelueDansPortee(n, p, t)));
}
