import 'server-only';
import { and, eq, isNull, or } from 'drizzle-orm';
import { schema } from '@tiktrends/db';
import { photosDuProduit, idLogoMarque, versionDepuisEmpreinte, estEmpreinte, type ResolutionReference } from '@tiktrends/core';
import { hacherImage } from '../produit/catalogue';
import type { ExecStudio } from '../execution/types';

/**
 * Studios · F-B · relit, MAINTENANT, les références qu'une consigne lie, dans
 * le catalogue de la MARQUE DU PROJET (même résolution que le catalogue L5-C
 * et que le worker F-A : photos `pph_`, logos `logo_`, bibliothèque `bib_`,
 * médias studio stockés `sta_`). Prend l'exécuteur de l'appelant : dans une
 * transaction, la lecture se fait dans la transaction.
 *
 *  · absente, d'une autre marque, d'un autre espace ⇒ `absent` ;
 *  · une source concurrente (ou tout autre identifiant) n'a pas de média que
 *    le fournisseur puisse recevoir ⇒ `present` mais non transmissible, comme
 *    le worker (`sans_media`) · le devis le dit au lieu de débiter un job qui
 *    échouerait ;
 *  · un média studio simulé (`simule/…`) n'est jamais transmissible.
 *
 * Aucune requête sortante : une photo distante est identifiée par son adresse.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ADRESSE_TRANSMISSIBLE = (url: string) => /^data:image\/(png|jpeg|webp);base64,/.test(url) || /^https:\/\/[^/@]+\//.test(url);

export async function resoudreReferencesImage(ex: ExecStudio, portee: { workspaceId: string; brandId: string }, ids: readonly string[]): Promise<Map<string, ResolutionReference>> {
  const out = new Map<string, ResolutionReference>();
  let photos: Map<string, { url: string; sha256: string }> | null = null;
  let logos: Map<string, { url: string; sha256: string }> | null = null;
  const present = (sha256: string, url: string | null, transmissible = true): ResolutionReference => ({
    etat: 'present', sha256, assetVersion: versionDepuisEmpreinte(sha256), transmissible: transmissible && url !== null && ADRESSE_TRANSMISSIBLE(url),
  });

  for (const id of new Set(ids)) {
    if (id.startsWith('pph_')) {
      if (!photos) {
        photos = new Map();
        const P = schema.products;
        const lignes = await ex.select({ id: P.id, name: P.name, imageUrl: P.imageUrl, imageUrls: P.imageUrls })
          .from(P).innerJoin(schema.brands, eq(schema.brands.id, P.brandId))
          .where(and(eq(P.brandId, portee.brandId), eq(schema.brands.workspaceId, portee.workspaceId)));
        for (const l of lignes) for (const ph of photosDuProduit(l, hacherImage)) photos.set(ph.assetId, { url: ph.url, sha256: ph.sha256 });
      }
      const p = photos.get(id);
      out.set(id, p ? present(p.sha256, p.url) : { etat: 'absent' });
    } else if (id.startsWith('logo_')) {
      if (!logos) {
        logos = new Map();
        const [m] = await ex.select({ logoUrl: schema.brands.logoUrl, logos: schema.brands.logos }).from(schema.brands)
          .where(and(eq(schema.brands.id, portee.brandId), eq(schema.brands.workspaceId, portee.workspaceId))).limit(1);
        for (const url of [m?.logoUrl, ...(m?.logos ?? [])]) {
          if (typeof url !== 'string' || !url) continue;
          const e = hacherImage(url);
          logos.set(idLogoMarque(portee.brandId, e.sha256), { url, sha256: e.sha256 });
        }
      }
      const l = logos.get(id);
      out.set(id, l ? present(l.sha256, l.url) : { etat: 'absent' });
    } else if (id.startsWith('sta_') && UUID.test(id.slice(4))) {
      const S = schema.studioAssets;
      const [m] = await ex.select({ storageKey: S.storageKey, sha256: S.sha256, mime: S.mime }).from(S)
        .where(and(eq(S.id, id.slice(4)), eq(S.workspaceId, portee.workspaceId), eq(S.brandId, portee.brandId), eq(S.storageState, 'stored'))).limit(1);
      out.set(id, m && m.mime.startsWith('image/') && estEmpreinte(m.sha256)
        ? { etat: 'present', sha256: m.sha256, assetVersion: versionDepuisEmpreinte(m.sha256), transmissible: !m.storageKey.startsWith('simule/') }
        : { etat: 'absent' });
    } else if (id.startsWith('bib_') && UUID.test(id.slice(4))) {
      const A = schema.assets;
      const [b] = await ex.select({ url: A.url }).from(A)
        .where(and(eq(A.id, id.slice(4)), eq(A.workspaceId, portee.workspaceId), eq(A.kind, 'image'), or(isNull(A.brandId), eq(A.brandId, portee.brandId)))).limit(1);
      out.set(id, b ? present(hacherImage(b.url).sha256, b.url) : { etat: 'absent' });
    } else {
      // Source concurrente ou identifiant inconnu · aucun média transmissible.
      out.set(id, { etat: 'sans_media' });
    }
  }
  return out;
}
