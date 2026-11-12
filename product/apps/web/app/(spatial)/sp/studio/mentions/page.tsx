import { redirect } from 'next/navigation';
import { lienMesMentions, lireFiltresMentions } from '@tiktrends/core';
import { getSession } from '../../../../../lib/auth';
import { lireMesMentions } from '../../../../../lib/studios/mes-mentions';
import { MesMentions } from '../../../../../spatial/vues/studios/MesMentions';

export const dynamic = 'force-dynamic';

/**
 * « Mes mentions » · Spatial (`/studio/mentions`, hors maquette · le lien vit
 * dans le centre de notifications de la coquille). Toute personne connectée ·
 * SES mentions, de son espace courant (ses notifications existantes, types
 * mention) · chaque fil relu dans sa portée ACTUELLE à chaque ouverture
 * (`lireMesMentions`) · un fil hors de sa portée est listé sans rien de lui.
 * `?lecture=non-lues`, `?type=commentaires|notes`, `?page=n` · lus
 * défensivement. Rien n'est écrit pour afficher la page. Gratuit.
 */
export default async function MesMentionsSpatial({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const s = await getSession();
  if (!s) redirect('/login');
  const vue = await lireMesMentions(s, lireFiltresMentions((await searchParams) ?? {}));
  return <MesMentions key={lienMesMentions(vue.filtres)} initiale={vue} />;
}
