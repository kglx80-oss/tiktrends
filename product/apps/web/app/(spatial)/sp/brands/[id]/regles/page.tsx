import { and, count, eq, isNull } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { manquantesLibelle, sourcesJarvisMarque } from '@tiktrends/core';
import { saveJarvisRulesAction } from '../../../../../actions/jarvis';
import { refusJarvis, TEXTE_REFUS_JARVIS } from '../../../../../../lib/jarvis-acces';
import { Regles } from '../../../../../../spatial/vues/marque/Regles';
import { chargerMarque } from '../donnees';

export const dynamic = 'force-dynamic';

export default async function ReglesSpatiale({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const c = await chargerMarque(id);
  const { s, b } = c;
  const n = (r: Array<{ n: number }>) => Number(r[0]?.n ?? 0);
  const [produits, personas, assets] = await Promise.all([
    db!.select({ n: count() }).from(schema.products).where(eq(schema.products.brandId, b.id)),
    db!.select({ n: count() }).from(schema.personas).where(eq(schema.personas.brandId, b.id)),
    db!.select({ n: count() }).from(schema.assets).where(and(eq(schema.assets.workspaceId, s.workspaceId), eq(schema.assets.brandId, b.id), isNull(schema.assets.deletedAt))),
  ]);
  const sources = sourcesJarvisMarque({ site: c.domaine, produits: n(produits), personas: n(personas), assets: n(assets), shopify: !!b.shopifyToken, meta: !!b.metaToken });
  // L'action écrit les règles de la marque ACTIVE · on ne l'offre que sur elle,
  // jamais sur une autre marque consultée (l'écriture partirait ailleurs).
  const refus = refusJarvis(s);
  const raison = refus ? TEXTE_REFUS_JARVIS[refus] : !c.estActive ? `Active ${b.name} dans le sélecteur de marque pour modifier ses règles.` : null;

  return (
    <Regles
      sousNav={c.sousNav} brandId={b.id} texte={b.creativeRules ?? ''}
      enregistrer={raison ? null : saveJarvisRulesAction} raison={raison} jarvis={c.jarvis}
      sources={{ lignes: sources, manquantes: manquantesLibelle(sources) }}
    />
  );
}
