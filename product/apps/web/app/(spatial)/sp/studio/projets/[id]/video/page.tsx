import { redirect } from 'next/navigation';
import { and, eq } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { coutMaximalTexte, decisionFournisseurStudio } from '@tiktrends/core';
import { getSession } from '../../../../../../../lib/auth';
import { gardeStudio } from '../../../../../../../lib/studios/garde';
import { lireVideoPour } from '../../../../../../../lib/studios/video/lecture';
import { lirePointeur } from '../../../../../../../lib/studios/prompts/depot-prompts';
import { modeleTexte } from '../../../../../../../lib/studios/prompts/adaptateur';
import { spendStatus } from '../../../../../../../lib/spend-guard';
import { Video } from '../../../../../../../spatial/vues/projet/Video';
import { EtatProjet } from '../../../../../../../spatial/vues/projet/EtatProjet';
import { raisonDuRefus } from '../donnees';

export const dynamic = 'force-dynamic';

/**
 * Studio vidéo · Spatial (`/studio/projets/[id]/video`, maquette `video`).
 * Mêmes gardes et même lecture que la page V5 · `studio.read` + capacité
 * « video » (coupée par défaut, la page le dit), plafond de dépense relu,
 * fournisseurs relus. Les gestes passent par `app/actions/studios/video.ts`.
 */
export default async function VideoSpatial({ params }: { params: Promise<{ id: string }> }) {
  const s = await getSession();
  if (!s) redirect('/login');
  const { id } = await params;
  const g = await gardeStudio('studio.read', 'video');
  const [pointeur, plafond] = await Promise.all([lirePointeur().catch(() => null), spendStatus()]);
  const r = g.ok
    ? await lireVideoPour(g.ctx, id, {
      maintenant: new Date(), releasePubliee: pointeur !== null, fournisseurTexte: !!process.env.ANTHROPIC_API_KEY, plafondAtteint: plafond.blocked,
      fournisseurImage: decisionFournisseurStudio(process.env).ok, coutTexteUsd: coutMaximalTexte(modeleTexte()),
    })
    : g;
  if (!r.ok) return <EtatProjet raison={raisonDuRefus(r, s, 'Le studio vidéo')} projectId={id} titre="Vidéo" />;

  // Le nom de la marque · ligne au-dessus du titre (lecture, portée espace).
  const [m] = db ? await db.select({ nom: schema.brands.name }).from(schema.studioProjects)
    .innerJoin(schema.brands, eq(schema.brands.id, schema.studioProjects.brandId))
    .where(and(eq(schema.studioProjects.id, r.vue.projet.id), eq(schema.studioProjects.workspaceId, s.workspaceId))).limit(1) : [];
  return <Video vue={r.vue} marque={m?.nom ?? ''} variantesHref={`/studio/projets/${r.vue.projet.id}#variantes`} />;
}
