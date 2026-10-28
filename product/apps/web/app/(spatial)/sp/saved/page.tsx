import { redirect } from 'next/navigation';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import type { InspoAd } from '@tiktrends/integrations';
import { PROVEN_DAYS, apercuImage, collectionsSauvegardes, estActiveVeille, etiquetteStyleVeille, explicationPontAdsmap, lienNouveauProjet, lireCollectionSauvegardes, lireFiltresSauvegardes, lireFormatCreatif, pastilleMarque, raisonPontAdsmap, tourneLongtemps } from '@tiktrends/core';
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
 *
 * Vague 4 · les anciens onglets de l'écran V5 ont leur destination Spatial ·
 * « Concurrents suivis » (`?onglet=marques`) est le Radar, « Nouveautés »
 * (`?onglet=nouveautes`) la vue « Suivies » des pubs du moment. Les filtres de
 * départ (format, tri, média) se lisent dans l'adresse (`lireFiltresSauvegardes`),
 * la collection active aussi (`?collection=f:<dossier>`, `lireCollectionSauvegardes`) ·
 * validée contre les dossiers des sauvegardes lues ICI (espace, marque active) ·
 * une collection d'ailleurs ou inexistante est ignorée et l'écran le dit.
 */
export default async function SauvegardesSpatiales({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const s = await getSession();
  if (!s) redirect('/login');
  if (!roleAtLeast(s.role, 'member')) redirect('/dashboard');
  const sp = await searchParams;
  const onglet = Array.isArray(sp.onglet) ? sp.onglet[0] : sp.onglet;
  if (onglet === 'marques') redirect('/radar');
  if (onglet === 'nouveautes') redirect('/veille?vue=suivies');

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
      format: (() => { const f = lireFormatCreatif(r.snapshot); return { id: f.id, versionAncienne: f.versionAncienne, etat: f.etat }; })(),
      sauvegardeLe: (r.createdAt as Date).toISOString(),
      classeeLe: lireFormatCreatif(r.snapshot).date,
      auteur: null as string | null,
      jours: typeof ad.daysRunning === 'number' ? ad.daysRunning : null,
    };
  });

  // Qui a classé · le NOM d'un membre de CET espace (même lecture que l'écran
  // Formats V5) · la jointure sur l'appartenance écarte toute personne d'un
  // autre espace, l'e-mail n'est jamais lu, un membre sans nom reçoit un libellé.
  const auteurs = [...new Set(lignes.map((r) => lireFormatCreatif(r.snapshot).auteur).filter((x): x is string => !!x && /^[0-9a-f-]{36}$/i.test(x)))];
  if (db && auteurs.length) {
    const us = await db.select({ id: schema.users.id, name: schema.users.name }).from(schema.users)
      .innerJoin(schema.workspaceMembers, and(eq(schema.workspaceMembers.userId, schema.users.id), eq(schema.workspaceMembers.workspaceId, s.workspaceId)))
      .where(inArray(schema.users.id, auteurs));
    const noms = new Map(us.map((u) => [u.id, u.name?.trim() || 'un membre de l’espace']));
    lignes.forEach((r, n) => { const a = lireFormatCreatif(r.snapshot).auteur; if (a) items[n]!.auteur = noms.get(a) ?? null; });
  }

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
      gestes={{ formatFerme, test: raisonTest ? { ouvert: false, raison: raisonTest } : { ouvert: true } }} filtresInitiaux={lireFiltresSauvegardes(sp)}
      collection={lireCollectionSauvegardes(sp, collectionsSauvegardes(items))} />
  );
}
