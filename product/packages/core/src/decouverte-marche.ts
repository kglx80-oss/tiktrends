/**
 * La veille qui te trouve ce que tu ne penses pas à suivre.
 *
 * ── Le point aveugle ─────────────────────────────────────────────────────────
 *
 * Le radar ne regarde que les marques que tu ajoutes à la main. Sans marque
 * suivie, il n'a « rien à surveiller ». Or les créas qui vont t'inspirer sont
 * souvent hors de ta watchlist · un concurrent que tu ne connais pas, un
 * annonceur d'une catégorie voisine. Une veille qui n'affiche que ce que tu
 * pointes déjà ne t'apprend rien de neuf.
 *
 * Ce fichier décide, à partir d'une recherche par CATÉGORIE, ce qui mérite de
 * remonter · les créas ÉPROUVÉES que tu ne suis pas encore et que tu n'as pas
 * déjà vues. La récolte (l'appel à la source) vit dans le serveur · ici, tout
 * est pur, donc testable.
 *
 * ── Ce qui remonte, et ce qui est écarté ─────────────────────────────────────
 *
 * - ÉPROUVÉE · elle porte un signal de survie (le même que le radar) · une
 *   naissance ne prouve rien.
 * - PAS DÉJÀ VUE · dédupliquée de ce qui est déjà en base.
 * - PAS DÉJÀ SUIVIE · une découverte est ce que tu ne surveilles pas · afficher
 *   un annonceur que tu suis déjà n'est pas une découverte, c'est du bruit.
 * - Plafonnée par annonceur · trois créas d'un même annonceur suffisent à
 *   sentir sa manière · au-delà, on étudie une marque, pas un marché.
 *
 * Pur : ni base, ni réseau, ni modèle.
 */

import { survivalSignal, type RadarCandidate, type RadarSignal, MAX_PER_ADVERTISER } from './adsmap/radar';

/** Le terme de recherche d'une découverte · la catégorie de la marque, nettoyée. */
export function termeDecouverte(brand: { category?: string | null }): string | null {
  const c = (brand.category ?? '').replace(/\s+/g, ' ').trim();
  // Sous trois caractères, un terme ne cible rien d'utile · chercher « t »
  // ramènerait tout le marché. Sans catégorie, pas de découverte · on ne devine
  // pas le secteur depuis le nom de marque, qui ne ramènerait que la marque.
  return c.length >= 3 ? c : null;
}

const RANG: Record<RadarSignal, number> = {
  crossed_proven: 0, reach_growing: 1, advertiser_scaling: 2,
};

/** Clé d'annonceur normalisée · sert au plafond et à l'exclusion des suivis. */
const cleAnnonceur = (nom: string | null | undefined) => (nom ?? '').trim().toLowerCase();

/**
 * Ce qui remonte d'une recherche par catégorie · proven, pas déjà vu, pas déjà
 * suivi, plafonné et classé. `null` de signal = écarté (rien prouvé).
 */
export function decouvertes(
  candidats: readonly RadarCandidate[],
  o: {
    /** Identifiants déjà en base · on ne re-remonte pas ce qu'on a déjà vu. */
    connus: ReadonlySet<string>;
    /** Noms des annonceurs déjà suivis · une découverte est ce qu'on ne suit pas. */
    suivis: ReadonlySet<string>;
  },
): RadarCandidate[] {
  const suivis = new Set([...o.suivis].map((n) => cleAnnonceur(n)));

  const retenus = candidats
    .map((c) => ({ c, signal: survivalSignal(c) }))
    .filter((x): x is { c: RadarCandidate; signal: RadarSignal } => x.signal !== null)
    .filter((x) => x.c.externalId && !o.connus.has(x.c.externalId))
    .filter((x) => !suivis.has(cleAnnonceur(x.c.advertiser)))
    // Les plus probants d'abord · à signal égal, la plus ancienne (plus de survie).
    .sort((a, b) => RANG[a.signal] - RANG[b.signal] || (b.c.daysRunning - a.c.daysRunning));

  // Plafond par annonceur · on ne laisse pas un seul annonceur occuper la liste.
  const parAnnonceur = new Map<string, number>();
  const out: RadarCandidate[] = [];
  for (const { c } of retenus) {
    const cle = cleAnnonceur(c.advertiser) || `__${c.externalId}`;
    const n = parAnnonceur.get(cle) ?? 0;
    if (n >= MAX_PER_ADVERTISER) continue;
    parAnnonceur.set(cle, n + 1);
    out.push(c);
  }
  return out;
}
