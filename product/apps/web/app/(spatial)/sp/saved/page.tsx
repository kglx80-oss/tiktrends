import { redirect } from 'next/navigation';
import { and, desc, eq } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import type { InspoAd } from '@tiktrends/integrations';
import { PROVEN_DAYS, apercuImage, estActiveVeille, etiquetteStyleVeille, explicationPontAdsmap, lienNouveauProjet, lireFormatCreatif, pastilleMarque, raisonPontAdsmap, tourneLongtemps } from '@tiktrends/core';
import { getSession } from '../../../../lib/auth';
import { FEATURES, canAccess, denyReason, roleAtLeast } from '../../../../lib/rbac';
import { effectiveAccess } from '../../../../lib/access';
import { getActiveBrand } from '../../../../lib/brands';
import { studioDepuisVeille } from '../../../../lib/veille-link';
import { Sauvegardes } from '../../../../spatial/vues/veille/Sauvegardes';
import type { SauvegardeDonnees } from '../../../../spatial/vues/veille/sauvegardes-client';
import { pastilleRadar } from '../veille/acces';

export const dynamic = 'force-dynamic';

const PLATEFORME: Record<string, string> = { meta: 'Meta', tiktok: 'TikTok', google: 'Google' };

/**
 * « Sauvegardes » (Spatial) · mêmes gardes et même périmètre que la page V5
 * (`app/(app)/saved`) : session, rôle membre, sauvegardes de la marque active
 * (ou de l'espace sans marque active). Les collections sont les dossiers réels.
 */
export default async function SauvegardesSpatiales() {
  const s = await getSession();
  if (!s) redirect('/login');
  if (!roleAtLeast(s.role, 'member')) redirect('/dashboard');

  const brand = db ? await getActiveBrand(s.workspaceId) : null;
  const lignes = db
    ? await db.select().from(schema.savedAds)
      .where(brand ? and(eq(schema.savedAds.workspaceId, s.workspaceId), eq(schema.savedAds.brandId, brand.id)) : eq(schema.savedAds.workspaceId, s.workspaceId))
      .orderBy(desc(schema.savedAds.createdAt))
    : [];

  const items: SauvegardeDonnees[] = lignes.map((r) => {
    const ad = r.snapshot as InspoAd;
    const nom = ad.advertiserName?.trim() || 'Annonceur';
    const video = (ad.mediaType ?? '').toLowerCase().includes('vid');
    const longue = tourneLongtemps(ad.daysRunning);
    return {
      id: r.id, platform: r.platform, externalId: r.externalId, ad, folder: r.folder ?? null,
      marque: { nom, ...pastilleMarque(nom) },
      source: [ad.mainCountry, PLATEFORME[r.platform] ?? r.platform].filter(Boolean).join(' · '),
      image: apercuImage({ isVideo: video, thumbnailUrl: ad.thumbnailUrl, mediaUrl: ad.mediaUrl }),
      longue: longue ? `${PROVEN_DAYS} j +` : null,
      video,
      meta: [`${estActiveVeille(ad.status) ? 'Active' : 'Arrêtée'} · ${Math.max(0, ad.daysRunning ?? 0)} j`, `${video ? 'Vidéo' : 'Image'} · ${PLATEFORME[r.platform] ?? r.platform}`],
      pastilles: [{ libelle: etiquetteStyleVeille(ad), classe: '' as const }, ...(longue ? [{ libelle: 'Tourne longtemps', classe: 'g' as const }] : [])],
      // Mode clone des Studios · la sauvegarde sert de référence de structure.
      cloner: studioDepuisVeille(ad, { ref: r.id }),
      format: (() => { const f = lireFormatCreatif(r.snapshot); return { id: f.id, versionAncienne: f.versionAncienne }; })(),
    };
  });

  // Les droits des gestes · le MÊME calcul que les gardes des actions (classement · Veille ; test · Résultats + marque active).
  const acces = effectiveAccess(s);
  const Veille = FEATURES.find((f) => f.key === 'inspo')!;
  const Resultats = FEATURES.find((f) => f.key === 'adsmap')!;
  const formatFerme = canAccess(acces, Veille) ? null
    : denyReason(acces, Veille) === 'plan' ? 'Classement réservé à la Veille · offre Core.' : 'Classement réservé aux rôles qui ont accès à la Veille.';
  const raisonTest = brand && canAccess(acces, Resultats) ? null
    : explicationPontAdsmap(raisonPontAdsmap(denyReason(acces, Resultats), !!brand), 'Préparer un test dans Résultats');

  return (
    <Sauvegardes items={items} pastilleRadar={pastilleRadar(acces)} creerProjet={lienNouveauProjet({ type: 'ads' })}
      gestes={{ formatFerme, test: raisonTest ? { ouvert: false, raison: raisonTest } : { ouvert: true } }} />
  );
}
