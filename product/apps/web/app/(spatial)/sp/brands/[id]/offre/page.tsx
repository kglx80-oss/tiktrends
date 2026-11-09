import { and, asc, eq } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import {
  costFor, listePropre, morceauxTexte, prixEuros, resumeProduits, statutFicheProduit, messageServiceInactif,
  detailOffre, lienNouveauProjet, LIBELLES_STATUT_ALLEGATION, LIBELLES_TYPE_OFFRE, manquesOffres, ordonnerOffres, pastilleManquesOffres, signalAllegation, statutAllegation,
} from '@tiktrends/core';
import {
  addProductAction, deleteProductAction, importProductsAction, syncShopifyProductsAction,
  archiverAllegationAction, archiverOffreAction, enregistrerAllegationAction, enregistrerOffreAction,
} from '../../../../../actions/brand-detail';
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
  // Lot 9 bis · les offres et les allégations de CETTE marque (de l'espace de la session · `chargerMarque`), archivées comprises.
  const O = schema.offers, C = schema.brandClaims;
  const [lignesOffres, lignesAllegations] = await Promise.all([
    db!.select().from(O).where(and(eq(O.brandId, b.id), eq(O.workspaceId, c.s.workspaceId))).orderBy(asc(O.createdAt)),
    db!.select().from(C).where(and(eq(C.brandId, b.id), eq(C.workspaceId, c.s.workspaceId))).orderBy(asc(C.createdAt)),
  ]);
  const offres = ordonnerOffres(lignesOffres.map((o) => ({ id: o.id, intitule: o.label, type: o.kind, conditions: o.conditions, active: o.active })));
  const allegations = [...lignesAllegations.filter((a) => !a.archivedAt), ...lignesAllegations.filter((a) => a.archivedAt)];
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
      offres={{
        liste: offres.map((o) => ({
          id: o.id, intitule: o.intitule, detail: detailOffre(o), active: o.active,
          editable: { id: o.id, intitule: o.intitule, type: o.type, conditions: o.conditions },
          creerPub: !o.active
            ? { href: null, raison: 'Une offre archivée ne se choisit plus au brief · réactive-la d’abord' }
            : c.creerPub ? { href: lienNouveauProjet({ type: 'ads', offre: o.id }), raison: null } : { href: null, raison: 'Les Studios ne sont pas ouverts à ton rôle ou à ta formule' },
        })),
        manque: pastilleManquesOffres(manquesOffres(offres)),
        manquantes: manquesOffres(offres).map((t) => ({ type: t, libelle: LIBELLES_TYPE_OFFRE[t] })),
        gestes: { enregistrer: enregistrerOffreAction, archiver: archiverOffreAction, raison: null },
      }}
      allegations={{
        liste: allegations.map((a) => {
          const statut = statutAllegation(a.status);
          return {
            id: a.id, texte: a.text, preuve: a.proof, statut, libelleStatut: LIBELLES_STATUT_ALLEGATION[statut], signal: signalAllegation(statut),
            archivee: !!a.archivedAt, editable: { id: a.id, texte: a.text, preuve: a.proof, statut },
          };
        }),
        gestes: { enregistrer: enregistrerAllegationAction, archiver: archiverAllegationAction, raison: null },
      }}
    />
  );
}
