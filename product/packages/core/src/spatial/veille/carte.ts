import { ANGLE_LABEL, classifyAngle } from '../../angles';
import { PROVEN_DAYS } from '../../adsmap/market-stats';

/**
 * Spatial · Veille · ce que la carte d'une annonce AFFICHE, décidé ici (pur).
 *
 * La maquette (`docs/spatial/reference/veille.html`, `xCard`) montre une part
 * d'impressions, un nombre de variantes, une croissance « 7 j » et une dépense
 * estimée par CPM. La source réelle (`InspoAd`) ne porte ni part d'impressions
 * ni variantes · elles ne sont pas inventées : la carte montre à leur place les
 * SIGNAUX que la source donne (pubs actives de l'annonceur, vues et j'aime
 * TikTok), et rien quand il n'y en a pas.
 */

/** Les seuils de la maquette (`xCard` · `a.g>=20` hausse, `a.g<0` baisse, `a.g>=25` tendance). */
export const SEUIL_HAUSSE_VEILLE = 20;
export const SEUIL_TENDANCE_VEILLE = 25;

/**
 * Croissance de la portée sur 7 jours, en % · `delta7d` est un gain ABSOLU de
 * personnes atteintes (source), rapporté à la portée d'il y a 7 jours.
 * `null` quand la source ne donne pas les deux.
 */
export function croissance7j(reach?: number | null, delta7d?: number | null): number | null {
  if (reach == null || delta7d == null || !Number.isFinite(reach) || !Number.isFinite(delta7d)) return null;
  const avant = reach - delta7d;
  if (avant <= 0) return delta7d > 0 ? null : 0; // tout est neuf · un pourcentage n'a pas de sens
  return Math.round((delta7d / avant) * 100);
}

/** La classe de la maquette pour la croissance · `up` · `down` · rien. */
export function classeCroissance(pct: number | null): 'up' | 'down' | '' {
  if (pct == null) return '';
  return pct >= SEUIL_HAUSSE_VEILLE ? 'up' : pct < 0 ? 'down' : '';
}

export function estTendanceVeille(pct: number | null): boolean {
  return pct != null && pct >= SEUIL_TENDANCE_VEILLE;
}

export function libelleCroissance(pct: number): string {
  return `${pct > 0 ? '+' : ''}${pct.toLocaleString('fr-FR')} %`;
}

/** Les CPM proposés par la maquette (« Dépense estimée : CPM 9 € »). */
export const CPM_VEILLE = [6, 9, 12, 15] as const;
export const CPM_VEILLE_DEFAUT = 9;
export function lireCpmVeille(v: string | null | undefined): number {
  const n = Number(v);
  return (CPM_VEILLE as readonly number[]).includes(n) ? n : CPM_VEILLE_DEFAUT;
}

/**
 * Dépense estimée · une BORNE BASSE, dite comme telle : au moins une impression
 * par personne atteinte (portée réelle de la source), au CPM choisi par
 * l'utilisateur. La maquette multiplie par une fréquence de 1,6 écrite de tête ·
 * on ne la reprend pas.
 */
export function depenseEstimeeVeille(reach: number | null | undefined, cpm: number): number | null {
  if (reach == null || !Number.isFinite(reach) || reach <= 0) return null;
  return Math.round((reach / 1000) * cpm);
}

/** Montants comme la maquette (`xK`) · « 1,6 k€ », « 864 € ». */
export function euroCourt(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace('.', ',').replace(',0', '')} k€`;
  return `${Math.round(n)} €`;
}

/** Portée comme la maquette (« 110 k », « 1,2 M »). */
export function nombreCourt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace('.', ',').replace(',0', '')} M`;
  if (n >= 1000) return `${Math.round(n / 1000)} k`;
  return String(Math.round(n));
}

/** La pastille d'une marque · pastels de la maquette (`XB`), choisis par le nom. */
const PASTELS = ['#ffb3c7', '#b8e1ff', '#c9f2d8', '#ffe1a8', '#ffc2b0', '#e3d4ff', '#9fe3d9', '#ffd2e6', '#cfe8ff', '#f7c8ff', '#d6f5b0', '#bcd2ff'] as const;
export function pastilleMarque(nom: string | null | undefined): { initiale: string; fond: string } {
  const n = (nom ?? '').trim();
  let h = 0;
  for (const c of n.toLowerCase()) h = (h * 31 + c.codePointAt(0)!) >>> 0;
  const premiere = [...n].find((c) => /[\p{L}\p{N}]/u.test(c));
  return { initiale: (premiere ?? '?').toLocaleUpperCase('fr-FR'), fond: PASTELS[h % PASTELS.length]! };
}

/** L'étiquette de style de la carte · l'angle lu dans le texte (heuristique pure, sans IA). */
export function etiquetteStyleVeille(ad: { body?: string | null; mediaType?: string | null }): string {
  const a = classifyAngle(ad.body);
  if (a !== 'other') return ANGLE_LABEL[a];
  return (ad.mediaType ?? '').toLowerCase().includes('vid') ? 'Vidéo' : 'Image';
}

/**
 * La lecture de la maquette (`xmw`) · ce que la DURÉE et la CROISSANCE réelles
 * laissent supposer, dit comme une observation. Seuil de durée = celui du noyau
 * (`PROVEN_DAYS`), pas les 30 jours de tête de la maquette.
 */
export function lectureVeille(o: { daysRunning?: number | null; croissance: number | null }): string {
  const j = o.daysRunning ?? 0;
  if (j >= PROVEN_DAYS) return `En ligne depuis ${j} jours : la marque la garde, c’est un signal qu’elle rapporte (observation, pas une preuve).`;
  if (o.croissance != null && o.croissance >= SEUIL_TENDANCE_VEILLE) return `Portée en hausse de ${o.croissance} % en 7 jours : la marque pousse cette créa.`;
  return 'Encore récente : à surveiller avant de s’en inspirer.';
}

/** Les signaux de la ligne d'en-tête · seulement ceux que la source donne. */
export function signauxVeille(ad: { platform?: string | null; liveAdsCount?: number | null; views?: number | null; likes?: number | null }): Array<{ icone: 'eye' | 'copy'; texte: string; titre: string }> {
  const out: Array<{ icone: 'eye' | 'copy'; texte: string; titre: string }> = [];
  if (ad.platform === 'tiktok') {
    if (ad.views != null) out.push({ icone: 'eye', texte: nombreCourt(ad.views), titre: 'Vues' });
    if (ad.likes != null) out.push({ icone: 'copy', texte: nombreCourt(ad.likes), titre: 'J’aime' });
    return out;
  }
  if (ad.liveAdsCount != null && ad.liveAdsCount > 0) out.push({ icone: 'eye', texte: `${ad.liveAdsCount} actives`, titre: 'Pubs actives de l’annonceur' });
  return out;
}

/** Les jours de diffusion comme la maquette (« 63 j »). */
export const joursCourts = (j: number | null | undefined) => `${Math.max(0, Math.round(j ?? 0))} j`;

export function estActiveVeille(status: string | null | undefined): boolean {
  return (status ?? 'active').toLowerCase() === 'active';
}
