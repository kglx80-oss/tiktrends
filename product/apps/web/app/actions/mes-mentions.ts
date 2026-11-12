'use server';

import { lireFiltresMentions, type VueMesMentions } from '@tiktrends/core';
import { getSession } from '../../lib/auth';
import { lireMesMentions } from '../../lib/studios/mes-mentions';

/**
 * « Mes mentions » · relire la page après un geste (« Marquer comme lue »,
 * l'action EXISTANTE `markNotificationRead`) · LECTURE seule · la session
 * relue, ses seules notifications, sa portée actuelle (`lireMesMentions`).
 * Entrée `unknown` · les filtres sont relus comme dans l'adresse. Gratuit.
 */
export async function lireMesMentionsAction(entree: { lecture?: unknown; type?: unknown; page?: unknown }): Promise<{ ok: true; vue: VueMesMentions } | { ok: false; message: string }> {
  const s = await getSession();
  if (!s) return { ok: false, message: 'Ta session a expiré · reconnecte-toi.' };
  const page = typeof entree?.page === 'number' ? String(entree.page) : entree?.page;
  return { ok: true, vue: await lireMesMentions(s, lireFiltresMentions({ lecture: entree?.lecture, type: entree?.type, page })) };
}
