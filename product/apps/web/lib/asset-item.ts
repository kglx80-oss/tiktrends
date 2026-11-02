import 'server-only';
import { estTemplateAsset, tagsVisibles } from '@tiktrends/core';
import { objectKeyFromUrl, storageFromEnv } from '@tiktrends/integrations';
import { servedAssetUrl, adresseAssetProxy } from './asset-url';
import type { AssetItem, AssetKind } from '../app/actions/assets';

/**
 * Une ligne `assets` telle que la bibliothèque la sert · adresse gardée
 * (proxy pour un objet privé ou un contenu embarqué), vignette privée par le
 * proxy, marqueur de template jamais exposé. Partagée par `listAssets` et les
 * pages de la Bibliothèque (`bibliotheque-pages.ts`) · une seule règle.
 */
export function toItem(r: {
  id: string; name: string; kind: string; source: string; url: string; embarquee: boolean;
  externalId: string | null; thumbUrl: string | null;
  brandId: string | null; useForAi: boolean; sizeBytes: number | null; tags: string[] | null; createdAt: Date;
}): AssetItem {
  const cfg = storageFromEnv();
  const prive = (url: string) => !!cfg && objectKeyFromUrl(cfg, url) !== null;
  return {
    id: r.id, name: r.name, kind: r.kind as AssetKind, source: r.source,
    // La règle vit dans `lib/asset-url` · elle s'y teste, ce qu'un fichier
    // `'use server'` interdit (tout export y devient un point d'entrée réseau).
    url: servedAssetUrl({ id: r.id, kind: r.kind, source: r.source, url: r.url, embedded: r.embarquee, externalId: r.externalId, privateStorage: prive(r.url) }),
    // Vignette privée : même contrôle de session via le proxy, sans signature persistée.
    thumbUrl: r.thumbUrl ? (prive(r.thumbUrl) ? `${adresseAssetProxy(r.id)}&thumb=1` : r.thumbUrl) : null,
    brandId: r.brandId, useForAi: r.useForAi, sizeBytes: r.sizeBytes,
    // Le marqueur de template ne sort pas en tant que tag · le statut passe par
    // le booléen dérivé, la plomberie interne ne traverse pas le réseau.
    tags: tagsVisibles(r.tags), isTemplate: estTemplateAsset(r.tags),
    createdAt: r.createdAt.toISOString(),
  };
}
