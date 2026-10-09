'use server';

import { revalidatePath } from 'next/cache';
import { gardePlateforme } from '../../../lib/studios/prompts/garde-prompts';
import { enregistrerReglagesEspace } from '../../../lib/studios/interrupteurs';

/**
 * F1 · réglage des interrupteurs Studios d'UN espace (cahier 01 §14 · espaces
 * pilotes autorisés).
 *
 * Plateforme SEULEMENT : `provider.configure`, que seul l'accès total d'équipe
 * porte (SEC-09) · un owner ou un admin d'espace reçoit FORBIDDEN, rien n'est
 * écrit. Confirmation explicite et motif obligatoires ; l'écriture et son
 * audit (`studios.interrupteurs`, avant/après) partagent une transaction. Aucun
 * appel IA, aucune dépense. Effet immédiat : serveur et worker relisent le
 * réglage à chaque geste et à chaque réclamation.
 */

export type ReponseInterrupteurs = { ok: true; message: string } | { ok: false; message: string; raisons: string[]; traceId?: string };

const CHEMIN = '/admin/studios-interrupteurs';

export async function enregistrerInterrupteursEspaceAction(e: { workspaceId: unknown; actives: unknown; coupees: unknown; motif: unknown; confirme: unknown }): Promise<ReponseInterrupteurs> {
  const g = await gardePlateforme('provider.configure');
  if (!g.ok) return { ok: false, message: g.message, raisons: [], traceId: g.traceId };
  if (e?.confirme !== true) return { ok: false, message: 'Confirme le changement avant de l’envoyer.', raisons: [], traceId: g.ctx.traceId };
  try {
    const r = await enregistrerReglagesEspace({ userId: g.ctx.userId, roleEffectif: g.ctx.roleEffectif, traceId: g.ctx.traceId }, {
      workspaceId: e?.workspaceId, actives: e?.actives, coupees: e?.coupees, motif: e?.motif,
    });
    if (!r.ok) return { ok: false, message: 'Refusé · rien n’a été modifié.', raisons: r.raisons, traceId: g.ctx.traceId };
    revalidatePath(CHEMIN);
    return { ok: true, message: 'Réglage enregistré et journalisé · effet immédiat pour cet espace.' };
  } catch (err) {
    console.error(`[interrupteurs] ${g.ctx.traceId}`, (err as Error).message);
    return { ok: false, message: 'L’enregistrement a échoué · rien n’a été modifié. Réessaie.', raisons: [], traceId: g.ctx.traceId };
  }
}
