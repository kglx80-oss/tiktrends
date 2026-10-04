/**
 * Pagination des galeries Image et Vidéo du Studio · lot 13.
 *
 * ── Le défaut que ce module ferme ────────────────────────────────────────────
 *
 * Les deux galeries ne chargeaient que les 24 DERNIÈRES générations de la
 * marque (`limit(24)` côté serveur), puis paginaient côté client ce reliquat ·
 * au-delà, les plus anciens visuels devenaient inaccessibles, sans le dire, et
 * le compteur annonçait ce qui était chargé (47) pour 63 visuels en base.
 *
 * Le serveur pagine désormais toute la population, page par page (jamais une
 * liste sans borne), dans un ordre stable (date décroissante, puis
 * identifiant, puis rang de la sortie dans sa génération), sous une borne
 * temporelle figée à l'ouverture (`jusqua`) · une génération arrivée pendant la
 * consultation ne décale pas les pages (ni doublon ni perte) ; elle apparaît au
 * prochain rechargement de la première page.
 *
 * Pur · ni base ni réseau.
 */

/** Cartes par page · même valeur que la pagination partagée (`Pager`). */
export const TAILLE_PAGE_GALERIE = 24;

export interface FenetrePage {
  /** Page effective (0-indexée), ramenée dans [0, pages-1]. */
  page: number;
  pages: number;
  /** Décalage SQL de la page. */
  offset: number;
  /** Rang (1-indexé) de la première et de la dernière carte affichées · 0 si vide. */
  de: number;
  a: number;
}

/** La fenêtre d'une page · une page demandée hors bornes est ramenée dedans. */
export function fenetrePage(total: number, page: number, taille: number = TAILLE_PAGE_GALERIE): FenetrePage {
  const t = Math.max(0, Math.floor(total));
  const pages = Math.max(1, Math.ceil(t / taille));
  const p = Number.isFinite(page) ? Math.min(Math.max(0, Math.floor(page)), pages - 1) : 0;
  const offset = p * taille;
  return { page: p, pages, offset, de: t === 0 ? 0 : offset + 1, a: Math.min(t, offset + taille) };
}

/**
 * Le compteur d'une galerie · il distingue les GÉNÉRATIONS (une demande) et les
 * SORTIES (un visuel produit · une génération Image en produit plusieurs ; une
 * génération Vidéo en produit au plus une, une fois prête).
 */
export function compteurGalerie(c: { generations: number; sorties: number; genre: 'image' | 'video' }): string {
  const g = `${c.generations} génération${c.generations > 1 ? 's' : ''}`;
  if (c.genre === 'image') return `${c.sorties} visuel${c.sorties > 1 ? 's' : ''} · ${g}`;
  return `${g} · ${c.sorties} vidéo${c.sorties > 1 ? 's' : ''} prête${c.sorties > 1 ? 's' : ''}`;
}

/**
 * La borne temporelle d'une consultation · ISO valide sinon « maintenant ». Une
 * borne future est ramenée à maintenant (elle n'ouvrirait rien de plus).
 */
export function borneConsultation(jusqua: string | null | undefined, maintenant: Date): Date {
  const d = jusqua ? new Date(jusqua) : null;
  if (!d || Number.isNaN(d.getTime()) || d.getTime() > maintenant.getTime()) return maintenant;
  return d;
}
