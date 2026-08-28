'use server';

import { randomBytes } from 'crypto';
import { and, desc, eq } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { adsmapGuard } from '../../lib/adsmap-guard';
import { logAndTranslate } from '../../lib/error-log';

/**
 * ADSMAP · lien de partage client (§12).
 *
 * Une agence ne montre pas son outil à son client, elle lui montre un RÉSULTAT.
 * Créer un compte, expliquer un rôle et faire poser un mot de passe pour cela
 * est un coût qui fait qu'on ne partage jamais rien · un lien s'envoie dans un
 * message.
 *
 * Ce qui circule est délibérément amputé :
 *
 *  - **aucun chiffre de dépense, de CPA ou de budget.** La marge de l'agence se
 *    lit dans ces colonnes, et un lien se transfère · ce qui part n'est pas
 *    récupérable.
 *  - **aucune hypothèse ni apprentissage.** C'est la méthode, c'est-à-dire ce
 *    que le client paie · le montrer intégralement revient à le donner.
 *  - **rien qui ne soit pas arbitré.** Un verdict calculé mais non validé peut
 *    encore changer ; l'afficher ferait discuter un chiffre provisoire.
 *
 * Reste ce qui compte pour le client : ce qui a été testé, ce qui a gagné, et
 * ce qui part ensuite.
 */

/** Assez long pour être non devinable, assez court pour tenir dans un message. */
const TOKEN_BYTES = 24;
const DEFAULT_DAYS = 90;

export interface ShareLink {
  id: string;
  token: string;
  expiresAt: string | null;
  createdAt: string;
  /** Vrai quand la date est passée · l'écran le dit au lieu d'afficher un lien mort. */
  expired: boolean;
}

const toLink = (r: typeof schema.clientShareLinks.$inferSelect): ShareLink => ({
  id: r.id,
  token: r.token,
  expiresAt: r.expiresAt ? (r.expiresAt as Date).toISOString() : null,
  createdAt: (r.createdAt as Date).toISOString(),
  expired: !!r.expiresAt && (r.expiresAt as Date).getTime() < Date.now(),
});

export async function listShareLinksAction(): Promise<{ links?: ShareLink[]; error?: string }> {
  const g = await adsmapGuard({ minRole: 'admin' });
  if ('error' in g) return { error: g.error };
  try {
    const rows = await db!.select().from(schema.clientShareLinks)
      .where(eq(schema.clientShareLinks.brandId, g.brand.id))
      .orderBy(desc(schema.clientShareLinks.createdAt))
      .limit(20);
    return { links: rows.map(toLink) };
  } catch (e) {
    return { error: logAndTranslate('adsmap:share-list', e, { subject: 'la lecture des liens', workspaceId: g.s.workspaceId }) };
  }
}

/**
 * Crée un lien.
 *
 * Une échéance est posée d'office. Un lien de partage sans date de fin traîne
 * dans un fil de messages pendant des années et finit par montrer à un ancien
 * client ce que fait l'agence aujourd'hui · l'oubli est le mode de fuite le plus
 * courant, et il ne demande aucune malveillance.
 */
export async function createShareLinkAction(days = DEFAULT_DAYS): Promise<{ link?: ShareLink; error?: string }> {
  const g = await adsmapGuard({ minRole: 'admin' });
  if ('error' in g) return { error: g.error };

  const jours = Math.min(365, Math.max(1, Math.round(days) || DEFAULT_DAYS));
  try {
    const [row] = await db!.insert(schema.clientShareLinks).values({
      workspaceId: g.s.workspaceId,
      brandId: g.brand.id,
      token: randomBytes(TOKEN_BYTES).toString('base64url'),
      createdBy: g.s.user.id,
      expiresAt: new Date(Date.now() + jours * 86_400_000),
      scopes: { view: 'adsmap_client', metrics: false, learnings: false },
    }).returning();
    if (!row) return { error: 'Création impossible.' };
    return { link: toLink(row) };
  } catch (e) {
    return { error: logAndTranslate('adsmap:share-create', e, { subject: 'la création du lien', workspaceId: g.s.workspaceId }) };
  }
}

/** Révoque un lien · la suppression est immédiate et définitive. */
export async function revokeShareLinkAction(id: string): Promise<{ ok?: true; error?: string }> {
  const g = await adsmapGuard({ minRole: 'admin' });
  if ('error' in g) return { error: g.error };
  try {
    await db!.delete(schema.clientShareLinks)
      .where(and(eq(schema.clientShareLinks.id, id), eq(schema.clientShareLinks.brandId, g.brand.id)));
    return { ok: true };
  } catch (e) {
    return { error: logAndTranslate('adsmap:share-revoke', e, { subject: 'la révocation du lien', workspaceId: g.s.workspaceId }) };
  }
}
