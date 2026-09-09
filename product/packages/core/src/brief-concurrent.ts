/**
 * Le brief d'une marque concurrente · lire un annonceur d'un coup d'œil.
 *
 * ── Pourquoi, et pourquoi SANS IA ────────────────────────────────────────────
 *
 * Depuis « Marques suivies », on voulait « analyser » un concurrent sans repartir
 * fouiller sa bibliothèque à la main. Mais décrire chaque créa au modèle coûte,
 * et le sujet n'est pas là : ce qu'on veut d'abord, c'est la FORME de son compte
 * — combien de pubs tiennent, quelle part de vidéo, quels angles dominent, quels
 * appels à l'action, vers quels sites. Tout ça se lit dans les métadonnées de
 * recherche, sans un seul appel payant. L'angle est classé par la même
 * heuristique déterministe que le swipe file (`classifyAngle`).
 *
 * Le brief IA (description créa par créa) existe déjà ailleurs (`market-learn`,
 * sous barrière de dépense) · ici on donne la lecture GRATUITE et immédiate.
 *
 * Pur : ni base, ni réseau, ni modèle.
 */

import { classifyAngle, ANGLE_LABEL, median, type AngleKey } from './angles';
import { estGagnantVeille } from './brief-veille';

/** Le sous-ensemble d'une pub concurrente dont le brief se sert. */
export interface PubConcurrent {
  body?: string | null;
  callToAction?: string | null;
  landingDomain?: string | null;
  mediaType?: string | null;
  daysRunning?: number | null;
  reachDelta30d?: number | null;
}

export interface AnglePart { angle: AngleKey; label: string; n: number; part: number }
export interface CtaPart { cta: string; n: number }

export interface BriefConcurrent {
  /** Nombre de pubs lues pour ce brief. */
  total: number;
  /** Combien sont ÉPROUVÉES (tiennent dans le temps ou portée qui monte). */
  gagnants: number;
  /** Part de vidéo · 0..1. */
  partVideo: number;
  /** Ancienneté médiane, en jours. */
  ancienneteMediane: number;
  /** La doyenne encore active · la plus forte preuve de marché, en jours. */
  doyenneJours: number;
  /** Les angles dominants, du plus fréquent au moins fréquent. */
  angles: AnglePart[];
  /** Les appels à l'action les plus fréquents. */
  ctas: CtaPart[];
  /** Les domaines d'atterrissage distincts (jusqu'à 6). */
  domaines: string[];
}

const estVideo = (m?: string | null) => (m || '').toLowerCase().includes('vid');
const domaineNet = (d?: string | null) => d?.replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/^www\./, '').trim() || null;

/** Compte les occurrences et rend les plus fréquentes, décroissant. */
function topN<T>(items: T[], cle: (x: T) => string | null, n: number): Array<{ v: string; n: number }> {
  const m = new Map<string, number>();
  for (const it of items) {
    const k = cle(it);
    if (!k) continue;
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([v, c]) => ({ v, n: c }));
}

export function briefConcurrent(pubs: PubConcurrent[]): BriefConcurrent {
  const total = pubs.length;
  if (total === 0) {
    return { total: 0, gagnants: 0, partVideo: 0, ancienneteMediane: 0, doyenneJours: 0, angles: [], ctas: [], domaines: [] };
  }

  const gagnants = pubs.filter(estGagnantVeille).length;
  const videos = pubs.filter((p) => estVideo(p.mediaType)).length;
  const jours = pubs.map((p) => p.daysRunning ?? 0);

  const angles: AnglePart[] = topN(pubs, (p) => classifyAngle(p.body), 5)
    .map(({ v, n }) => ({ angle: v as AngleKey, label: ANGLE_LABEL[v as AngleKey], n, part: n / total }));

  const ctas: CtaPart[] = topN(pubs, (p) => p.callToAction?.trim() || null, 4).map(({ v, n }) => ({ cta: v, n }));
  const domaines = topN(pubs, (p) => domaineNet(p.landingDomain), 6).map((d) => d.v);

  return {
    total,
    gagnants,
    partVideo: videos / total,
    ancienneteMediane: median(jours),
    doyenneJours: Math.max(...jours),
    angles,
    ctas,
    domaines,
  };
}
