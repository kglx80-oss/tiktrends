/**
 * La provenance d'une source de marché, et sa pertinence pour une marque · CDC v8 · N03.
 *
 * ── Le manque ────────────────────────────────────────────────────────────────
 *
 * « Ce que fait le marché » mêlait, sous une même marque, des créas de
 * concurrents suivis et des créas repérées au hasard d'un balayage · rasage,
 * pieds, coloriage, électronique proposés à Klorea sans dire d'où ils venaient.
 * Le lecteur ne pouvait pas comprendre POURQUOI une inspiration hors catégorie
 * lui était montrée, ni l'écarter en connaissance de cause.
 *
 * ── La distinction ───────────────────────────────────────────────────────────
 *
 * On sépare deux choses que le cahier des charges tient distinctes :
 *
 *  - la **provenance FACTUELLE** d'une créa · comment elle est entrée dans notre
 *    base. C'est un fait, stocké à l'ingestion · une marque suivie délibérément,
 *    un balayage radar, notre propre production, ou rien (historique sans preuve).
 *  - la **pertinence POUR une marque** · ce que cette provenance veut dire quand
 *    CETTE marque la regarde. Elle se calcule, elle ne se fige pas globalement ·
 *    la même créa est un concurrent suivi pour la marque qui la suit, et une
 *    inspiration adjacente pour une autre qui l'a juste croisée au radar. C'est
 *    pourquoi la provenance vit sur la ligne PAR marque, jamais une fois pour la
 *    créa entière.
 *
 * On n'INVENTE aucune catégorie · une provenance inconnue reste « non qualifié »,
 * et le silence est une réponse valable (le lecteur sait alors qu'il ne sait pas).
 *
 * Pur : ni base, ni horloge, ni modèle.
 */

/** Comment une créa de marché est entrée · fait stocké à l'ingestion. */
export type Provenance = 'followed' | 'radar' | 'propre';

/** Ce que la provenance vaut pour la marque qui regarde · calculé, jamais figé. */
export type Pertinence =
  | 'concurrent_direct'
  | 'inspiration_adjacente'
  | 'preuve_propre'
  | 'non_qualifiee'
  | 'mixte';

/** Les classes de comptage · l'inconnu forme la sienne, il ne s'invente pas. */
export type ClasseProvenance = 'concurrent' | 'inspiration' | 'propre' | 'nonQualifie';

/** Ramène une valeur stockée (ou nulle) à sa classe. */
export function classerProvenance(p: string | null | undefined): ClasseProvenance {
  return p === 'followed' ? 'concurrent'
    : p === 'radar' ? 'inspiration'
    : p === 'propre' ? 'propre'
    : 'nonQualifie';
}

/** Le décompte des provenances derrière une proposition · dit la divergence. */
export interface CompteProvenance {
  /** Créas issues de marques suivies · concurrents assumés. */
  concurrent: number;
  /** Créas repérées au radar hors des marques suivies · inspiration adjacente. */
  inspiration: number;
  /** Nos propres créas mesurées. */
  propre: number;
  /** Créas sans provenance connue · historiques importés sans preuve. */
  nonQualifie: number;
}

/** Compte vide · point de départ d'une agrégation. */
export function compteVide(): CompteProvenance {
  return { concurrent: 0, inspiration: 0, propre: 0, nonQualifie: 0 };
}

/** Ajoute une provenance au compte. */
export function ajouterProvenance(c: CompteProvenance, p: string | null | undefined): void {
  const classe = classerProvenance(p);
  if (classe === 'concurrent') c.concurrent++;
  else if (classe === 'inspiration') c.inspiration++;
  else if (classe === 'propre') c.propre++;
  else c.nonQualifie++;
}

/** Agrège les provenances d'une liste de créas en un décompte. */
export function compterProvenances(sources: ReadonlyArray<{ provenance?: string | null }>): CompteProvenance {
  const c = compteVide();
  for (const s of sources) ajouterProvenance(c, s.provenance);
  return c;
}

/**
 * La pertinence d'une proposition pour la marque · lue sur le décompte.
 *
 * Une seule classe présente → c'est elle. Plusieurs → « mixte » · on ne masque
 * pas la divergence sous une étiquette unique, on l'affiche et on renvoie au
 * détail. Aucune → « non qualifié ».
 */
export function pertinenceDeRangee(c: CompteProvenance): Pertinence {
  const presentes = [c.concurrent > 0, c.inspiration > 0, c.propre > 0, c.nonQualifie > 0].filter(Boolean).length;
  if (presentes === 0) return 'non_qualifiee';
  if (presentes > 1) return 'mixte';
  if (c.concurrent > 0) return 'concurrent_direct';
  if (c.inspiration > 0) return 'inspiration_adjacente';
  if (c.propre > 0) return 'preuve_propre';
  return 'non_qualifiee';
}

/** Le libellé et la limite à dire de chaque pertinence · une seule carte, tous écrans. */
export const LIBELLE_PERTINENCE: Record<Pertinence, { court: string; note?: string }> = {
  concurrent_direct: { court: 'Concurrent direct', note: 'issu d’une marque que tu suis' },
  inspiration_adjacente: { court: 'Inspiration adjacente', note: 'repérée au radar hors de tes marques suivies · écarte-la si elle est hors sujet' },
  preuve_propre: { court: 'Preuve propre', note: 'mesurée sur tes propres créas' },
  non_qualifiee: { court: 'Source non qualifiée', note: 'provenance inconnue · pertinence à confirmer' },
  mixte: { court: 'Sources mêlées', note: 'concurrents suivis et inspirations repérées · vois le détail des sources' },
};
