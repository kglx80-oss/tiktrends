import { eq } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { costFor, listePropre, morceauxTexte, prixEuros, resumeProduits, statutFicheProduit, messageServiceInactif } from '@tiktrends/core';
import { addProductAction, deleteProductAction, importProductsAction, syncShopifyProductsAction } from '../../../../../actions/brand-detail';
import { brandMediaPreview } from '../../../../../../lib/brand-media-url';
import { Offre } from '../../../../../../spatial/vues/marque/Offre';
import type { LigneKv } from '../../../../../../spatial/vues/marque/base';
import { chargerMarque, propsSync } from '../donnees';

export const dynamic = 'force-dynamic';

/** L'import des produits depuis le site · mêmes conditions que l'écran V5 (site renseigné, IA configurée), prix annoncé. */
function importer(c: Awaited<ReturnType<typeof chargerMarque>>) {
  const raison = !c.b.url ? 'Renseigne le site de la marque pour importer' : !c.aiReady ? messageServiceInactif('ia_profil') : null;
  return { action: raison ? null : importProductsAction, cout: c.unlimited ? null : costFor('brief'), raison };
}

export default async function OffreSpatiale({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const c = await chargerMarque(id);
  const { b } = c;
  const produits = await db!.select().from(schema.products).where(eq(schema.products.brandId, b.id));
  const lus = produits.map((x) => ({ nom: x.name, prix: x.price, image: !!x.imageUrl, description: x.description }));
  const premier = produits[0] ?? null;
  const interdits = listePropre(b.avoidWords, 8);
  const affirmer = premier ? morceauxTexte(premier.usp, 6) : [];
  const lignes: LigneKv[] = premier ? [
    premier.price != null ? { dt: 'Prix', dd: { type: 'texte', texte: prixEuros(premier.price) } } : { dt: 'Prix', dd: { type: 'vide', texte: 'Non renseigné' } },
    premier.description?.trim() ? { dt: 'Description', dd: { type: 'texte', texte: premier.description.trim() } } : { dt: 'Description', dd: { type: 'vide', texte: 'Non renseignée' } },
    affirmer.length ? { dt: 'Peut affirmer', dd: { type: 'pastilles', classe: 'g', pastilles: affirmer } } : { dt: 'Peut affirmer', dd: { type: 'vide', texte: 'Rien de renseigné' } },
    interdits.length ? { dt: 'Ne doit jamais dire', dd: { type: 'pastilles', classe: 'r', pastilles: interdits } } : { dt: 'Ne doit jamais dire', dd: { type: 'vide', texte: 'Aucun mot à éviter' } },
  ] : [];

  return (
    <Offre
      sousNav={c.sousNav} brandId={b.id} sync={propsSync(c)}
      produits={produits.map((x, i) => {
        const st = statutFicheProduit(lus[i]!);
        return { id: x.id, nom: x.name, image: x.imageUrl ? brandMediaPreview(b.id, x.imageUrl) : null, detail: st.detail, complet: st.complete };
      })}
      aCompleter={resumeProduits(lus).libelle}
      detail={premier ? { nom: premier.name, lignes } : null}
      ajouter={addProductAction}
      shopify={b.shopifyDomain ? { appel: syncShopifyProductsAction, domaine: b.shopifyDomain } : null}
      retours={c.retours}
      gestion={{
        retirer: deleteProductAction,
        importer: importer(c),
        boutique: { domaine: b.shopifyDomain ?? null, synchroniser: syncShopifyProductsAction },
      }}
    />
  );
}
