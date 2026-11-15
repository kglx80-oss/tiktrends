import 'server-only';
import { and, desc, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import type { PgColumn } from 'drizzle-orm/pg-core';
import { db, schema } from '@tiktrends/db';
import {
  COMPTES_VIDES, MENTIONS_MAX_LUES, MENTIONS_PAR_PAGE, aPermissionEspace, besoinsCloche, besoinsTickets, bornageDeNotif, filDeLaMention, genreDeNotif,
  libelleAuteurVersion, ligneMention, lireHistoriqueCommentaire, lireMentions, nomAffichageMention, notifsDansPortee, objetDansPortee,
  paginationMentions, projetDuLienMention, quandJournal, segmentsCommentaire, totalDuFiltre, typesDuFiltre, vueMesMentions,
  type ComptesMentions, type FilLu, type FilMentionnant, type FiltresMentions, type GenreMention, type MembreBrut, type NotifCloche,
  type PorteeCloche, type PorteeTickets, type VueMesMentions,
} from '@tiktrends/core';
import type { Session } from '../auth';
import { roleAtLeast, type Role } from '../rbac';
import { gardeStudio, type ContexteStudio } from './garde';
import { lireProjetsDeLaPortee, type ProjetStudio } from './depot';
import { refusCapacite } from './interrupteurs';
import { membresDeLEspace } from './membres-mentions';

/**
 * Studios · « Mes mentions » (règles : `C/studios/activite/mes-mentions.ts`).
 * LECTURE seule · rien n'est écrit ici (« marquer comme lue » reste l'action
 * existante des notifications, `markNotificationRead`).
 *
 *  · la source · les notifications de la SESSION (`user_id`), de son espace
 *    COURANT (`workspace_id`), de types mention · rien d'autre n'est lu de la
 *    notification que son type, son adresse (le projet), son extrait (pour
 *    retrouver le fil) et ses dates · son titre et son texte ne sortent jamais ;
 *  · la portée · relue À CHAQUE affichage, comme la fiche · la garde des
 *    Studios (`studio.read`, capacité « projets » · rôle, formule, marques et
 *    restrictions de marque), plus la capacité « canvas » pour les notes (les
 *    actions des notes l'exigent), le projet relu par `lireProjet` (portée
 *    SQL), chaque fil borné à LA marque du projet et rejoué par
 *    `objetDansPortee` · un fil hors de cette portée n'est pas lu du tout ;
 *  · le fil · ceux du projet qui ont PRÉVENU la personne (`prevenus` du JSON
 *    `history`, la règle de #1066) · le noyau choisit celui de la
 *    notification (`filDeLaMention`) · son texte COURANT, ses mentions sous le
 *    nom courant (`segmentsCommentaire`, `nomAffichageMention`).
 *
 * La MÊME relecture sert la cloche (`notifsRelues` · centre de notifications,
 * bandeau, « Quoi de neuf » de l'Accueil · règles :
 * `C/studios/activite/cloche-portee.ts`) · une notification bornée que rien ne
 * relit dans la portée est montrée sans son texte, son projet ni son lien ·
 * une notification de ticket de support est relue par la MÊME voie contre
 * l'accès au ticket (règle de la page du ticket, `peutLireTicket`, sous le
 * rôle actuel dans l'espace du ticket · `accesTicketsDeLaCloche`).
 *
 * Lectures BORNÉES · les projets en une requête (`lireProjetsDeLaPortee`), les
 * fils en une requête par genre, les tickets en une requête (joints au rôle
 * de la personne) · jamais une par notification, ni par projet, ni par ticket.
 *
 * Gratuit · aucun appel IA, aucune génération, aucune dépense.
 */

/** Au plus 500 fils relus par genre et par page · ceux des projets de la page qui ont prévenu la personne. */
export const FILS_MAX_LUS = 500;

type SessionMentions = Pick<Session, 'user' | 'workspaceId'>;

const porteeCtx = (ctx: ContexteStudio) => ({ workspaceId: ctx.workspaceId, marquesDuWorkspace: ctx.marquesDuWorkspace, restrictionsMarque: ctx.restrictionsMarque });

async function comptes(s: SessionMentions): Promise<ComptesMentions> {
  const N = schema.notifications;
  const lignes = await db.select({ type: N.type, nonLue: sql<boolean>`${N.readAt} is null`, n: sql<number>`count(*)::int` }).from(N)
    .where(and(eq(N.userId, s.user.id), eq(N.workspaceId, s.workspaceId), inArray(N.type, typesDuFiltre('tous'))))
    .groupBy(N.type, sql`${N.readAt} is null`);
  const c: ComptesMentions = { commentaire: { ...COMPTES_VIDES.commentaire }, note: { ...COMPTES_VIDES.note } };
  for (const l of lignes) {
    const g = genreDeNotif(l.type);
    if (!g) continue;
    const n = Number(l.n) || 0;
    c[g].toutes += n;
    if (l.nonLue) c[g].nonLues += n;
  }
  return c;
}

/** Les noms des personnes citées (auteurs, qui a résolu) · la règle de la fiche (`libelleAuteurVersion`). */
async function noms(moi: string, ids: ReadonlyArray<string | null>): Promise<(id: string | null) => string> {
  const uniques = [...new Set(ids.filter((x): x is string => !!x))];
  const U = schema.users;
  const lignes = uniques.length ? await db.select({ id: U.id, nom: U.name, email: U.email, masque: U.hidePersonalInfo }).from(U).where(inArray(U.id, uniques)) : [];
  const par = new Map(lignes.map((l) => [l.id, l]));
  return (id) => {
    if (!id) return 'Un ancien membre de l’espace';
    const l = par.get(id);
    return l ? libelleAuteurVersion({ authorId: id, nom: l.nom, email: l.email, masque: !!l.masque }, moi) : 'Un ancien membre de l’espace';
  };
}

interface FilBrut {
  id: string; genre: GenreMention; projectId: string; workspaceId: string; brandId: string; body: string; history: unknown;
  authorId: string | null; resolvedAt: Date | null; resolvedBy: string | null; createdAt: Date; noeud: string | null;
}

/** Les fils (d'un genre) des projets relus, qui ont prévenu la personne · bornés à la marque de chaque projet et rejoués dans la portée. */
async function filsQuiOntPrevenu(ctx: ContexteStudio, genre: GenreMention, projets: readonly ProjetStudio[]): Promise<FilBrut[]> {
  if (!projets.length) return [];
  const moi = ctx.userId.toLowerCase();
  const prevenu = JSON.stringify([{ prevenus: [moi] }]);
  const out: FilBrut[] = [];
  const parProjet = new Map(projets.map((p) => [p.id, p]));
  const dansMarque = (t: { projectId: PgColumn; brandId: PgColumn }) => or(...projets.map((p) => and(eq(t.projectId, p.id), eq(t.brandId, p.brandId))));
  if (genre === 'commentaire') {
    const C = schema.studioComments;
    const lignes = await db.select().from(C)
      .where(and(eq(C.workspaceId, ctx.workspaceId), inArray(C.brandId, ctx.marques), dansMarque(C), sql`${C.history} @> ${prevenu}::jsonb`))
      .orderBy(desc(C.createdAt)).limit(FILS_MAX_LUS);
    for (const l of lignes) out.push({ ...l, genre, noeud: null });
  } else {
    const N = schema.studioLineageNotes;
    const lignes = await db.select().from(N)
      .where(and(eq(N.workspaceId, ctx.workspaceId), inArray(N.brandId, ctx.marques), dansMarque(N), sql`${N.history} @> ${prevenu}::jsonb`))
      .orderBy(desc(N.createdAt)).limit(FILS_MAX_LUS);
    for (const l of lignes) out.push({ ...l, genre, noeud: l.nodeKey });
  }
  // Rejoués · la portée de la session, la marque du projet, et la personne bien prévenue (la dernière entrée « mentions », relue défensivement).
  return out.filter((f) => {
    const p = parProjet.get(f.projectId);
    return !!p && p.brandId === f.brandId && objetDansPortee(porteeCtx(ctx), f) && lireMentions(f.history, f.body).prevenus.some((x) => x.toLowerCase() === moi);
  });
}

/** La portée de la session pour chaque genre · `null` quand elle ne lit rien de ce genre (toutes ses mentions de ce genre sont alors hors de portée). */
async function porteeDesGenres(): Promise<{ ctx: ContexteStudio | null; genres: Set<GenreMention> }> {
  const g = await gardeStudio('studio.read', 'projets').catch(() => null);
  if (!g || !g.ok || !aPermissionEspace(g.ctx.permissions, 'studio.read')) return { ctx: null, genres: new Set() };
  const genres = new Set<GenreMention>(['commentaire']);
  const canvas = await refusCapacite(g.ctx, ['canvas']).catch(() => 'refus');
  if (!canvas) genres.add('note');
  return { ctx: g.ctx, genres };
}

/**
 * Les projets désignés, relus dans la portée en UNE requête, puis les fils de
 * chaque genre qui ont prévenu la personne (une requête par genre).
 */
async function relireProjetsEtFils(ctx: ContexteStudio, genres: ReadonlySet<GenreMention>, besoins: { projets: readonly string[]; fils: Readonly<Record<GenreMention, readonly string[]>> }): Promise<{ projets: Map<string, ProjetStudio>; fils: Map<string, FilBrut> }> {
  const projets = new Map<string, ProjetStudio>();
  for (const p of await lireProjetsDeLaPortee(ctx, besoins.projets).catch(() => [] as ProjetStudio[])) projets.set(p.id.toLowerCase(), p);
  const fils = new Map<string, FilBrut>();
  for (const g of genres) {
    const duGenre = [...new Set(besoins.fils[g])].filter((x) => projets.has(x)).map((x) => projets.get(x)!);
    for (const x of await filsQuiOntPrevenu(ctx, g, duGenre).catch(() => [] as FilBrut[])) fils.set(`${g}:${x.id}`, x);
  }
  return { projets, fils };
}

/** Les fils relus, tels que la règle du noyau les compare (`filDeLaMention`). */
function candidatsDe(fils: Iterable<FilBrut>): FilMentionnant[] {
  return [...fils].map((x) => ({
    id: x.id, genre: x.genre, projetId: x.projectId,
    textes: [x.body, ...lireHistoriqueCommentaire(x.history).map((a) => a.texte)],
    instants: [x.createdAt.getTime(), ...lireHistoriqueCommentaire(x.history).map((a) => Date.parse(a.remplaceLe)).filter((t) => Number.isFinite(t))],
  }));
}

/** La portée Studios relue pour la cloche · `null` quand aucune notification bornée de l'espace courant n'est à relire, ou que rien ne l'a été. */
async function porteeStudiosDeLaCloche(s: SessionMentions, notifs: readonly NotifCloche[]): Promise<PorteeCloche | null> {
  const aRelire = notifs.some((n) => bornageDeNotif(n.type) && n.workspaceId === s.workspaceId && projetDuLienMention(n.href));
  if (!db || !aRelire) return null;
  try {
    const { ctx, genres } = await porteeDesGenres();
    if (!ctx || !genres.size || ctx.workspaceId !== s.workspaceId || ctx.userId !== s.user.id) return null;
    const { projets, fils } = await relireProjetsEtFils(ctx, genres, besoinsCloche(notifs, ctx.workspaceId, genres));
    return { workspaceId: ctx.workspaceId, genres, projets: new Set(projets.keys()), fils: candidatsDe(fils.values()) };
  } catch {
    return null;
  }
}

/**
 * Les tickets que désignent les notifications de support, relus en UNE
 * requête · chacun avec son espace, son auteur et le rôle ACTUEL de la
 * personne dans cet espace (aucune ligne de membre · retirée, pas
 * administratrice) · de TOUS les espaces (la cloche n'est pas bornée à
 * l'espace courant) · `null` sans notification de ticket (aucune lecture) ou
 * quand la lecture échoue (aucune n'est alors lue sur parole).
 */
async function accesTicketsDeLaCloche(s: SessionMentions, notifs: readonly NotifCloche[]): Promise<PorteeTickets | null> {
  const ids = besoinsTickets(notifs);
  if (!db || !ids.length) return null;
  try {
    const T = schema.tickets, M = schema.workspaceMembers;
    const lignes = await db.select({ id: T.id, workspaceId: T.workspaceId, auteurId: T.userId, role: M.role }).from(T)
      .leftJoin(M, and(eq(M.workspaceId, T.workspaceId), eq(M.userId, s.user.id)))
      .where(inArray(T.id, ids));
    return {
      utilisateurId: s.user.id,
      // La règle de la page du ticket · `admin = roleAtLeast(rôle, 'admin')`, ici le rôle dans l'espace DU ticket.
      tickets: new Map(lignes.map((l) => [l.id.toLowerCase(), { workspaceId: l.workspaceId, auteurId: l.auteurId, admin: l.role != null && roleAtLeast(l.role as Role, 'admin') }])),
    };
  } catch {
    return null;
  }
}

/**
 * Ce que la cloche MONTRE de ces notifications (dans leur ordre) · relues dans
 * la portée actuelle (`notifRelueDansPortee`) · une notification non bornée
 * est rendue telle quelle, sans aucune lecture · une bornée que rien ne relit
 * (autre espace, marque ou droits Studios retirés, fil introuvable, lecture en
 * échec) a le libellé neutre, sans texte, ni projet, ni lien · un ticket dont
 * l'accès est perdu (rôle actuel, ticket introuvable) aussi.
 */
export async function notifsRelues(s: SessionMentions, notifs: readonly NotifCloche[]): Promise<Array<{ titre: string; corps: string | null; href: string | null }>> {
  const [studios, tickets] = await Promise.all([porteeStudiosDeLaCloche(s, notifs), accesTicketsDeLaCloche(s, notifs)]);
  return notifsDansPortee(notifs, studios, tickets);
}

/** La page « Mes mentions » de la session, pour ces filtres · relue dans la portée actuelle. */
export async function lireMesMentions(s: SessionMentions, f: FiltresMentions): Promise<VueMesMentions> {
  if (!db) return vueMesMentions({ filtres: f, comptes: COMPTES_VIDES, lignes: [] });
  const c = await comptes(s);
  const total = totalDuFiltre(c, f);
  const p = paginationMentions(total, f.page);
  const N = schema.notifications;
  const conditions = [eq(N.userId, s.user.id), eq(N.workspaceId, s.workspaceId), inArray(N.type, typesDuFiltre(f.type))];
  if (f.lecture === 'non-lues') conditions.push(isNull(N.readAt));
  const notifs = total === 0 ? [] : await db.select({ id: N.id, type: N.type, body: N.body, href: N.href, readAt: N.readAt, createdAt: N.createdAt }).from(N)
    .where(and(...conditions)).orderBy(desc(N.createdAt), desc(N.id))
    .limit(Math.max(0, Math.min(MENTIONS_PAR_PAGE, MENTIONS_MAX_LUES - p.debut))).offset(p.debut);

  const { ctx, genres } = notifs.length ? await porteeDesGenres() : { ctx: null, genres: new Set<GenreMention>() };
  // Les projets des mentions, relus dans la portée en une requête (un projet hors portée n'est pas lu), puis leurs fils.
  const { projets, fils } = ctx && genres.size
    ? await relireProjetsEtFils(ctx, genres, besoinsCloche(notifs.map((n) => ({ type: n.type, workspaceId: s.workspaceId, href: n.href })), s.workspaceId, genres))
    : { projets: new Map<string, ProjetStudio>(), fils: new Map<string, FilBrut>() };

  const candidats = candidatsDe(fils.values());
  const choisis = notifs.map((n) => {
    const g = genreDeNotif(n.type);
    return g ? (filDeLaMention({ genre: g, projetId: projetDuLienMention(n.href), corps: n.body, creeLe: n.createdAt.getTime() }, candidats)) : null;
  });
  const lus = choisis.flatMap((id, i) => { const g = genreDeNotif(notifs[i]!.type); return id && g ? [fils.get(`${g}:${id}`)!] : []; });
  const nom = ctx ? await noms(ctx.userId, lus.flatMap((x) => [x.authorId, x.resolvedBy])) : () => 'Un ancien membre de l’espace';
  const membres = ctx && lus.length ? await membresDeLEspace({ workspaceId: ctx.workspaceId }).catch(() => [] as MembreBrut[]) : [];
  const parMembre = new Map(membres.map((m) => [m.id.toLowerCase(), m]));

  const lignes = notifs.flatMap((n, i) => {
    const g = genreDeNotif(n.type);
    if (!g) return [];
    const x = choisis[i] ? fils.get(`${g}:${choisis[i]}`) ?? null : null;
    const projet = x ? projets.get(x.projectId) ?? null : null;
    const fil: FilLu | null = x && projet && ctx ? {
      id: x.id, genre: g, projetId: projet.id, projet: projet.title, auteur: nom(x.authorId),
      segments: segmentsCommentaire(x.body, lireMentions(x.history, x.body).mentions, (id) => nomAffichageMention(parMembre.get(id), projet, ctx.marquesDuWorkspace)),
      resolu: x.resolvedAt ? { par: nom(x.resolvedBy), quand: quandJournal(x.resolvedAt.toISOString()) } : null,
      noeud: x.noeud,
    } : null;
    return [ligneMention({ id: n.id, genre: g, quand: quandJournal(n.createdAt.toISOString()), lue: n.readAt != null }, fil)];
  });
  return vueMesMentions({ filtres: f, comptes: c, lignes });
}
