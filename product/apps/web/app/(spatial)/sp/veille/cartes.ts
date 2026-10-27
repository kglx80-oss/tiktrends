import 'server-only';
import type { InspoAd } from '@tiktrends/integrations';
import {
  ancreCarteVeille, apercuImage, bibliothequePub, classeCroissance, croissance7j, depenseEstimeeVeille, estActiveVeille,
  estTendanceVeille, etiquetteStyleVeille, euroCourt, joursCourts, libelleBibliotheque, libelleCroissance, lectureVeille,
  lienAnnonceurVeille, nombreCourt, pastilleMarque, signauxVeille, siteMarque,
} from '@tiktrends/core';
import { ACTIONS_JARVIS_VEILLE, lienJarvisVeille } from '../../../../lib/veille-jarvis';
import { studioDepuisVeille } from '../../../../lib/veille-link';
import type { CarteVeilleDonnees } from '../../../../spatial/vues/veille/types';

/**
 * Une annonce RÉELLE de la source → ce que la carte Spatial affiche. Aucune
 * valeur inventée · un champ que la source ne donne pas reste absent (la carte
 * ne le montre pas). Les règles (croissance, dépense, lecture, signaux) sont au
 * noyau (`spatial/veille/carte`).
 */
const PLATEFORME: Record<string, string> = { meta: 'Meta', tiktok: 'TikTok', google: 'Google' };
const SOUS_JARVIS: Record<keyof typeof ACTIONS_JARVIS_VEILLE, string> = {
  cloner: 'Structure gardée, adaptée à ta marque',
  scripts: 'Même mécanique, réécrite pour ta marque',
  accroche: 'Observation, puis hypothèse',
  hypothese: 'Prête à tester dans un lot',
};

export function carteVeille(ad: InspoAd, o: { cpm: number; sauvee: boolean; suivie: boolean; contexte: string; sauvegardeId?: string | null }): CarteVeilleDonnees {
  const ancre = ancreCarteVeille(ad);
  const retour = `${o.contexte}${ancre ? `#${ancre}` : ''}`;
  const nom = ad.advertiserName?.trim() || 'Annonceur';
  const pct = croissance7j(ad.reach, ad.reachDelta7d);
  const depense = depenseEstimeeVeille(ad.reach, o.cpm);
  const video = (ad.mediaType ?? '').toLowerCase().includes('vid');
  const biblio = bibliothequePub({ platform: ad.platform, name: ad.advertiserName });
  const site = siteMarque({ landingDomain: ad.landingDomain, landingUrl: ad.landingUrl });
  const active = estActiveVeille(ad.status);
  const kpis: Array<[string, string]> = [['Jours actifs', joursCourts(ad.daysRunning)]];
  if (ad.reach != null) kpis.push(['Portée', ad.reach.toLocaleString('fr-FR')]);
  if (pct != null) kpis.push(['Croissance 7 j', libelleCroissance(pct)]);
  if (depense != null) kpis.push([`Dépense estimée · CPM ${o.cpm} €`, `≈ ${euroCourt(depense)}`]);
  if (ad.liveAdsCount != null) kpis.push(['Pubs actives de l’annonceur', String(ad.liveAdsCount)]);
  if (ad.views != null) kpis.push(['Vues', ad.views.toLocaleString('fr-FR')]);
  if (ad.likes != null) kpis.push(['J’aime', ad.likes.toLocaleString('fr-FR')]);
  if (ad.engagementRate != null) kpis.push(['Engagement', `${ad.engagementRate.toLocaleString('fr-FR')} %`]);
  const liens: CarteVeilleDonnees['detail']['liens'][number][] = [];
  if (biblio) liens.push({ href: biblio.url, titre: libelleBibliotheque(biblio)!, sous: 'Recherche par nom · pas l’annonce exacte', icone: ad.platform === 'tiktok' ? 'tt' : 'meta' });
  if (site) liens.push({ href: site, titre: 'Site de la marque', sous: ad.landingDomain ?? site, icone: 'site' });
  return {
    cle: `${ad.platform}:${ad.id}`,
    ancre,
    ad,
    marque: { nom, ...pastilleMarque(nom) },
    active,
    jours: joursCourts(ad.daysRunning),
    signaux: signauxVeille(ad),
    pays: ad.mainCountry ?? null,
    portee: ad.reach != null ? nombreCourt(ad.reach) : null,
    depense: depense != null ? euroCourt(depense) : null,
    croissance: pct != null ? { texte: libelleCroissance(pct), classe: classeCroissance(pct) } : null,
    texte: ad.body?.trim() || null,
    image: apercuImage({ isVideo: video, thumbnailUrl: ad.thumbnailUrl, mediaUrl: ad.mediaUrl }),
    ratio: ad.platform === 'tiktok' ? 'r916' : '',
    tendance: estTendanceVeille(pct),
    style: etiquetteStyleVeille(ad),
    domaine: ad.landingDomain ?? PLATEFORME[ad.platform] ?? null,
    titre: nom,
    cta: ad.callToAction?.trim() || null,
    iterer: studioDepuisVeille(ad, { ref: o.sauvegardeId ?? null, retour }),
    sauvee: o.sauvee,
    suivie: o.suivie,
    detail: {
      statut: [active ? 'Active' : 'Arrêtée', `${Math.max(0, ad.daysRunning ?? 0)} jours`, PLATEFORME[ad.platform] ?? ad.platform, ad.mainCountry].filter(Boolean).join(' · '),
      liens,
      kpis,
      lecture: lectureVeille({ daysRunning: ad.daysRunning, croissance: pct }),
      annonceur: lienAnnonceurVeille(ad, o.contexte),
      jarvis: (Object.keys(ACTIONS_JARVIS_VEILLE) as Array<keyof typeof ACTIONS_JARVIS_VEILLE>).map((action) => ({
        href: lienJarvisVeille(ad, { action, ref: o.sauvegardeId ?? null, retour }),
        titre: ACTIONS_JARVIS_VEILLE[action],
        sous: SOUS_JARVIS[action],
      })),
      texte: ad.body?.trim() || null,
    },
  };
}
