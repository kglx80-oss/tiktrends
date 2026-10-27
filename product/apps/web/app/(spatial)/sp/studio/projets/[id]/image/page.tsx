import { redirect } from 'next/navigation';
import { and, eq } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { calquesParZ } from '@tiktrends/core';
import { getSession } from '../../../../../../../lib/auth';
import { roleAtLeast } from '../../../../../../../lib/rbac';
import { gardeStudio } from '../../../../../../../lib/studios/garde';
import { lireEditeurPour } from '../../../../../../../lib/studios/editeur/lecture';
import { urlsApercu } from '../../../../../../../lib/studios/editeur/apercus';
import { liensAtelierProjet } from '../../../../../../../lib/navigation';
import { etatInterrupteurs } from '../../../../../../../lib/studios/interrupteurs';
import { Editeur } from '../../../../../../../spatial/vues/projet/Editeur';
import { EtatProjet } from '../../../../../../../spatial/vues/projet/EtatProjet';
import { raisonDuRefus } from '../donnees';

export const dynamic = 'force-dynamic';

/**
 * Éditeur d'image · Spatial (`/studio/projets/[id]/image`, maquette `editeur`).
 * Mêmes gardes que la page V5 · `studio.read` + capacité « editeur », portée
 * marque ; l'enregistrement passe par `enregistrerDocument` (`studio.propose`),
 * sans ce droit l'écran est en lecture seule. Aucune génération.
 */
export default async function EditeurSpatial({ params }: { params: Promise<{ id: string }> }) {
  const s = await getSession();
  if (!s) redirect('/login');
  const { id } = await params;
  const g = await gardeStudio('studio.read', 'editeur');
  const r = g.ok ? await lireEditeurPour(g.ctx, id) : g;
  if (!r.ok) return <EtatProjet raison={raisonDuRefus(r, s, 'L’éditeur d’image du Studio')} projectId={id} titre="Éditeur" />;

  const d = r.donnees;
  const ids = [
    ...d.medias.map((m) => m.assetId),
    ...(d.produit ? [d.produit.assetId] : []),
    ...(d.document ? calquesParZ(d.document).flatMap((c) => (c.kind === 'image' || c.kind === 'logo' ? [c.assetId] : [])) : []),
  ];
  // Les couleurs de la fiche marque · proposées en premier dans l'inspecteur (lecture, portée espace).
  const [p] = db ? await db.select({ brandId: schema.studioProjects.brandId }).from(schema.studioProjects)
    .where(and(eq(schema.studioProjects.id, d.projet.id), eq(schema.studioProjects.workspaceId, s.workspaceId))).limit(1) : [];
  const [b] = db && p ? await db.select({ colors: schema.brands.colors }).from(schema.brands)
    .where(and(eq(schema.brands.id, p.brandId), eq(schema.brands.workspaceId, s.workspaceId))).limit(1) : [];
  const atelier = liensAtelierProjet(d.projet.id, (await etatInterrupteurs(s.workspaceId)).actif);
  const exporter = roleAtLeast(s.role, 'member') ? atelier.find((a) => a.segment === 'export')?.href ?? null : null;

  return (
    <Editeur
      projet={d.projet} version={d.version} contenu={d.contenu} document={d.document} formatPropose={d.formatPropose}
      produit={d.produit} medias={d.medias} apercus={urlsApercu(ids, d.projet.id)} peutEnregistrer={d.peutEnregistrer}
      couleursMarque={b?.colors ?? []} exporterHref={exporter} variantesHref={`/studio/projets/${d.projet.id}#variantes`}
    />
  );
}
