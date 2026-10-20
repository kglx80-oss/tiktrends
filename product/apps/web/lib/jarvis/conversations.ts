import 'server-only';
import { and, asc, desc, eq, inArray, isNull } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { titreConversation, titreValide, type PorteeConversation } from '@tiktrends/core';

/**
 * UX V5 · le côté base des conversations Jarvis (règle pure : `packages/core/src/jarvis-conversations.ts`).
 *
 * Toutes les fonctions portent la MÊME barrière · la requête filtre espace ET
 * marque ET personne. Une conversation (ou ses messages) d'un autre espace,
 * d'une autre marque ou d'une autre personne n'est jamais lue, modifiée ni
 * rattachée, même si l'appelant en passe l'identifiant · le filtre ne la trouve
 * pas (la portée n'est pas prise du navigateur, elle vient de la session).
 *
 * Le « fil principal » est la conversation implicite des messages SANS
 * `conversation_id` (le fil unique d'avant la V5) · `conversationId === null` le
 * désigne. Les conversations nommées sont des lignes de `jarvis_conversations`.
 */

const C = schema.jarvisConversations;
const M = schema.jarvisMessages;

export interface ConversationLue {
  id: string;
  titre: string;
  /** Dernière activité · ISO 8601. */
  majLe: string;
}

export interface MessageLu { id: string; role: string; content: string; createdAt: Date }

/**
 * Crée une conversation vide portée (espace + marque + personne) · rend son id.
 *
 * `projectId` (Concept créatif V5) rattache la conversation à un concept (= projet
 * studio) EN PLUS de la portée marque · additif et facultatif. Sans lui, c'est une
 * conversation de marque, comme avant (le défaut est `null`).
 */
export async function creerConversation(
  p: PorteeConversation,
  options: { projectId?: string | null } = {},
): Promise<string> {
  const [row] = await db.insert(C).values({
    workspaceId: p.workspaceId, brandId: p.brandId, userId: p.userId, titre: null,
    projectId: options.projectId ?? null,
  }).returning({ id: C.id });
  return row!.id;
}

/**
 * Les conversations rattachées à un concept (= projet studio), de la plus récente
 * à la plus ancienne, titre dérivé du premier message.
 *
 * La barrière marque est CONSERVÉE · la requête filtre espace ET marque ET
 * personne, et `project_id` s'y AJOUTE. Une conversation d'un autre concept,
 * d'une autre marque, d'un autre espace ou d'une autre personne n'est jamais
 * lue, même si l'appelant en passe l'identifiant · le filtre ne la trouve pas.
 */
export async function conversationDuProjet(
  p: PorteeConversation, projectId: string, limite = 50,
): Promise<ConversationLue[]> {
  const convs = await db.select({ id: C.id, titre: C.titre, majLe: C.updatedAt }).from(C)
    .where(and(
      eq(C.workspaceId, p.workspaceId), eq(C.brandId, p.brandId), eq(C.userId, p.userId),
      eq(C.projectId, projectId),
    ))
    .orderBy(desc(C.updatedAt)).limit(limite);
  if (convs.length === 0) return [];

  // Premier message utilisateur de chaque conversation (pour dériver un titre) ·
  // même portée que `listerConversations`, bornée aux conversations retournées.
  const ids = convs.map((c) => c.id);
  const messages = await db.select({ cid: M.conversationId, content: M.content, createdAt: M.createdAt })
    .from(M)
    .where(and(
      eq(M.workspaceId, p.workspaceId), eq(M.brandId, p.brandId), eq(M.userId, p.userId),
      inArray(M.conversationId, ids), eq(M.role, 'user'),
    ))
    .orderBy(asc(M.createdAt));
  const premier = new Map<string, string>();
  for (const m of messages) if (m.cid && !premier.has(m.cid)) premier.set(m.cid, m.content);

  return convs.map((c) => ({
    id: c.id,
    titre: titreConversation({ titre: c.titre, premierMessage: premier.get(c.id) ?? null }),
    majLe: (c.majLe as Date).toISOString(),
  }));
}

/** Les conversations de la portée, de la plus récente à la plus ancienne, titre dérivé. */
export async function listerConversations(p: PorteeConversation, limite = 50): Promise<ConversationLue[]> {
  const convs = await db.select({ id: C.id, titre: C.titre, majLe: C.updatedAt }).from(C)
    .where(and(eq(C.workspaceId, p.workspaceId), eq(C.brandId, p.brandId), eq(C.userId, p.userId)))
    .orderBy(desc(C.updatedAt)).limit(limite);
  if (convs.length === 0) return [];

  // Premier message utilisateur de chaque conversation (pour dériver un titre
  // quand la personne n'en a pas donné) · une requête, puis le plus ancien par
  // conversation. Les messages sont déjà bornés à la portée par leur FK de fait.
  const ids = convs.map((c) => c.id);
  const messages = await db.select({ cid: M.conversationId, content: M.content, createdAt: M.createdAt })
    .from(M)
    .where(and(
      eq(M.workspaceId, p.workspaceId), eq(M.brandId, p.brandId), eq(M.userId, p.userId),
      inArray(M.conversationId, ids), eq(M.role, 'user'),
    ))
    .orderBy(asc(M.createdAt));
  const premier = new Map<string, string>();
  for (const m of messages) if (m.cid && !premier.has(m.cid)) premier.set(m.cid, m.content);

  return convs.map((c) => ({
    id: c.id,
    titre: titreConversation({ titre: c.titre, premierMessage: premier.get(c.id) ?? null }),
    majLe: (c.majLe as Date).toISOString(),
  }));
}

/** La conversation appartient-elle à la portée ? (avant d'y rattacher un message). */
export async function conversationAppartient(p: PorteeConversation, id: string): Promise<boolean> {
  const r = await db.select({ id: C.id }).from(C)
    .where(and(eq(C.id, id), eq(C.workspaceId, p.workspaceId), eq(C.brandId, p.brandId), eq(C.userId, p.userId)))
    .limit(1);
  return r.length > 0;
}

/**
 * Renomme une conversation · `true` si une ligne DE LA PORTÉE a été modifiée.
 * Un titre vide (après nettoyage) ne renomme rien (on garde l'ancien).
 */
export async function renommerConversation(p: PorteeConversation, id: string, propose: string): Promise<boolean> {
  const t = titreValide(propose);
  if (!t) return false;
  const res = await db.update(C).set({ titre: t, updatedAt: new Date() })
    .where(and(eq(C.id, id), eq(C.workspaceId, p.workspaceId), eq(C.brandId, p.brandId), eq(C.userId, p.userId)))
    .returning({ id: C.id });
  return res.length > 0;
}

/** Remonte une conversation (dernière activité) · scoping identique. */
export async function toucherConversation(p: PorteeConversation, id: string): Promise<void> {
  await db.update(C).set({ updatedAt: new Date() })
    .where(and(eq(C.id, id), eq(C.workspaceId, p.workspaceId), eq(C.brandId, p.brandId), eq(C.userId, p.userId)));
}

/**
 * Les messages d'une conversation de la portée, du plus ancien au plus récent.
 * `conversationId === null` · le fil principal (messages sans `conversation_id`).
 */
export async function messagesDeConversation(p: PorteeConversation, conversationId: string | null): Promise<MessageLu[]> {
  const rows = await db.select({ id: M.id, role: M.role, content: M.content, createdAt: M.createdAt })
    .from(M)
    .where(and(
      eq(M.workspaceId, p.workspaceId), eq(M.brandId, p.brandId), eq(M.userId, p.userId),
      conversationId === null ? isNull(M.conversationId) : eq(M.conversationId, conversationId),
    ))
    .orderBy(asc(M.createdAt)).limit(120);
  return rows.map((r) => ({ id: r.id, role: r.role, content: r.content, createdAt: r.createdAt as Date }));
}

/** Efface les messages d'une conversation de la portée (le fil, pas la ligne de titre). */
export async function effacerMessagesConversation(p: PorteeConversation, conversationId: string | null): Promise<void> {
  await db.delete(M).where(and(
    eq(M.workspaceId, p.workspaceId), eq(M.brandId, p.brandId), eq(M.userId, p.userId),
    conversationId === null ? isNull(M.conversationId) : eq(M.conversationId, conversationId),
  ));
}
