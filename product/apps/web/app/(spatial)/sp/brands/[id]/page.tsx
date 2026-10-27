import { redirect } from 'next/navigation';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import {
  carteConfigurationMarque, costFor, initialeNom, lignesACompleter, listePropre, morceauxTexte, prixEuros, statutPersona, teinteAvatar,
} from '@tiktrends/core';
import { updateBrandAction } from '../../../../actions/brands';
import { generateFullBrandAction } from '../../../../actions/brand-detail';
import { uploadImageAssetsAction } from '../../../../actions/assets';
import { brandMediaPreview } from '../../../../../lib/brand-media-url';
import { adresseAssetProxy } from '../../../../../lib/asset-url';
import { refusEcritureBibliotheque, refusLectureBibliotheque, TEXTE_REFUS_BIBLIOTHEQUE } from '../../../../../lib/bibliotheque-acces';
import { etatConfigurationMarque } from '../../../../../lib/spatial/pastilles/marque';
import { Marque } from '../../../../../spatial/vues/marque/Marque';
import { chargerMarque, ficheLue, propsFavicon, propsSync, valeursFiche } from './donnees';

export const dynamic = 'force-dynamic';

const NB_ASSETS = 7;

/**
 * Les anciens onglets de la fiche (`?tab=`) · les actions serveur V5 y
 * redirigent après un ajout (persona, produit). Ils mènent à leur écran Spatial,
 * message compris.
 */
const ONGLETS: Record<string, string> = { audience: 'personas', products: 'offre' };

export default async function MarqueSpatiale({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { id } = await params;
  const q = await searchParams;
  if (q.tab && ONGLETS[q.tab]) {
    const suite = new URLSearchParams(Object.entries(q).filter((e): e is [string, string] => e[0] !== 'tab' && typeof e[1] === 'string'));
    redirect(`/brands/${encodeURIComponent(id)}/${ONGLETS[q.tab]}${suite.size ? `?${suite}` : ''}`);
  }
  const c = await chargerMarque(id);
  const { s, b } = c;
  const lectureAssets = !refusLectureBibliotheque(s);
  const [personas, scenarios, produits, assets, etat] = await Promise.all([
    db!.select().from(schema.personas).where(eq(schema.personas.brandId, b.id)),
    db!.select({ id: schema.scenarios.id }).from(schema.scenarios).where(eq(schema.scenarios.brandId, b.id)),
    db!.select().from(schema.products).where(eq(schema.products.brandId, b.id)),
    lectureAssets
      ? db!.select({ id: schema.assets.id }).from(schema.assets)
        .where(and(eq(schema.assets.workspaceId, s.workspaceId), eq(schema.assets.brandId, b.id), eq(schema.assets.kind, 'image'), isNull(schema.assets.deletedAt)))
        .orderBy(desc(schema.assets.createdAt)).limit(NB_ASSETS)
      : Promise.resolve([] as Array<{ id: string }>),
    etatConfigurationMarque(s.workspaceId, b.id),
  ]);
  const carte = etat ? carteConfigurationMarque(etat, b.id) : null;
  const produit = produits[0] ?? null;
  const refusEcriture = refusEcritureBibliotheque(s);
  const raisonAssets = !c.estActive ? `Active ${b.name} dans le sélecteur de marque pour y ajouter des images` : refusEcriture ? TEXTE_REFUS_BIBLIOTHEQUE[refusEcriture] : null;
  const remplirRaison = c.aiReady ? null : 'IA non configurée sur le serveur';
  // Les personas à valider d'abord (ils attendent un geste), puis les validés.
  const audiences = [...personas].filter((x) => x.status !== 'rejected' && x.status !== 'archived').slice(0, 3);

  return (
    <Marque
      sousNav={c.sousNav} brandId={b.id} nom={b.name}
      favicon={propsFavicon(c)}
      configuration={carte && carte.restantes > 0 ? { etapes: carte.etapes, faites: carte.faites, total: carte.total, part: carte.part } : null}
      questionnaire="/onboarding?redo=1"
      sync={propsSync(c)}
      aCompleter={lignesACompleter(ficheLue(b, { scenarios: scenarios.length, personas: personas.length, produits: produits.length }), b.id)}
      remplir={{ action: remplirRaison ? null : generateFullBrandAction, cout: c.unlimited ? null : costFor('brief'), raison: remplirRaison }}
      edition={{ action: updateBrandAction, valeurs: valeursFiche(b) }}
      couleurs={listePropre(b.colors, 6)}
      ton={morceauxTexte(b.tone, 4)}
      produit={produit ? {
        nom: produit.name,
        image: produit.imageUrl ? brandMediaPreview(b.id, produit.imageUrl) : null,
        detail: [produit.price != null ? prixEuros(produit.price) : null, `${produits.length} produit${produits.length > 1 ? 's' : ''} dans la fiche`].filter(Boolean).join(' · '),
      } : null}
      affirmer={morceauxTexte(b.usp, 5)}
      interdits={listePropre(b.avoidWords, 8)}
      audiences={audiences.map((x, i) => {
        const st = statutPersona(x.status);
        return { initiale: initialeNom(x.name), teinte: teinteAvatar(i), nom: x.name, detail: [x.description, ...(x.pains ?? []).slice(0, 1)].filter(Boolean).join(' · ') || null, etiquette: x.status === 'proposed' ? st.libelle : null };
      })}
      assets={assets.map((a) => ({ id: a.id, src: adresseAssetProxy(a.id) }))}
      ajoutAssets={{ televerser: raisonAssets ? null : uploadImageAssetsAction, raison: raisonAssets }}
      retours={c.retours}
    />
  );
}
