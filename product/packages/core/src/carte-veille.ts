import { PROVEN_DAYS } from './adsmap/market-stats';

/**
 * Présentation V5 de la carte créative de la Veille · ce que la maquette montre
 * en bandeau (plateforme, format) et en pastille de statut (Active / Inactive ·
 * N j, avec une jauge). PUR · il ne lit QUE les champs réels d'`InspoAd`
 * (plateforme, type de média, statut, jours de diffusion). Rien n'est inventé ·
 * la maquette affiche en plus durée, ratio, variantes, date de première vue et
 * tags, absents de la source (R14) · on ne les simule pas, ils ne figurent donc
 * pas ici.
 */
export type BandeauVeille = {
  /** Libellé de plateforme affiché (marque blanche · jamais le nom du fournisseur). */
  plateforme: 'Meta' | 'TikTok' | 'Google';
  /** Format connu de la source · Vidéo ou Image. `null` quand la source ne le dit pas. */
  media: 'Vidéo' | 'Image' | null;
  statut: {
    actif: boolean;
    /** « Active » ou « Inactive » · ce que la source rapporte sur la diffusion. */
    texte: 'Active' | 'Inactive';
    /** Jours de diffusion observés, entier ≥ 0. */
    jours: number;
  };
  /**
   * Remplissage de la jauge, 0 à 1 · proportion des jours de diffusion observés
   * rapportée au seuil d'une piste éprouvée (`PROVEN_DAYS`). Une créa qui a
   * atteint cet âge remplit la jauge. Pas un nouveau seuil inventé · il réemploie
   * celui, déjà posé, qui sépare « repérée » d'« éprouvée ».
   */
  jauge: number;
};

export function bandeauVeille(ad: {
  platform?: string | null;
  mediaType?: string | null;
  status?: string | null;
  daysRunning?: number | null;
}): BandeauVeille {
  const p = (ad.platform ?? '').toLowerCase();
  const plateforme: BandeauVeille['plateforme'] = p === 'tiktok' ? 'TikTok' : p === 'google' ? 'Google' : 'Meta';

  const m = (ad.mediaType ?? '').toLowerCase();
  const media: BandeauVeille['media'] = m === 'video' ? 'Vidéo' : m === 'image' ? 'Image' : null;

  const actif = (ad.status ?? '').toLowerCase() === 'active';
  const jours = Number.isFinite(ad.daysRunning) ? Math.max(0, Math.floor(ad.daysRunning as number)) : 0;
  const jauge = Math.max(0, Math.min(1, jours / PROVEN_DAYS));

  return {
    plateforme,
    media,
    statut: { actif, texte: actif ? 'Active' : 'Inactive', jours },
    jauge,
  };
}
