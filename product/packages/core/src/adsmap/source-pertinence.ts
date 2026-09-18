/**
 * Le canal d'acquisition d'une source de marché, et sa qualification métier · CDC v8 · N03.
 *
 * ── Le manque ────────────────────────────────────────────────────────────────
 *
 * « Ce que fait le marché » mêlait, sous une même marque, des créas venues de
 * marques suivies et des créas repérées au balayage du Radar · rasage, pieds,
 * coloriage, électronique proposés à Klorea sans dire d'où ils venaient. Le
 * lecteur ne pouvait pas comprendre POURQUOI une source lui était montrée.
 *
 * ── Deux axes, tenus séparés ─────────────────────────────────────────────────
 *
 * On distingue deux choses que le canal seul ne suffit PAS à relier :
 *
 *  - le **CANAL d'acquisition** · comment la créa est entrée. C'est un FAIT,
 *    stocké à l'ingestion, par marque. « Marque suivie » (followed), « Détectée
 *    par le Radar » (radar), ou « Origine inconnue » (rien de stocké).
 *  - la **QUALIFICATION métier** · la pertinence competitive de la source pour
 *    CETTE marque. Concurrent direct, inspiration adjacente, preuve propre. Elle
 *    n'est établie que par une qualification DISTINCTE et étayée · elle n'est
 *    JAMAIS déduite du canal. Une marque suivie n'est pas d'office un concurrent
 *    direct ; une détection Radar n'est pas d'office une inspiration adjacente.
 *
 * Tant qu'aucune qualification étayée n'existe, la qualification reste « À
 * qualifier » · l'inconnu demeure explicite, on n'invente aucune catégorie par
 * déduction du canal. Le silence est une réponse valable.
 *
 * Pur : ni base, ni horloge, ni modèle.
 */

/* -------------------------------------------------------------------------- */
/*  Axe 1 · le canal d'acquisition (fait, stocké)                              */
/* -------------------------------------------------------------------------- */

/** Comment une créa de marché est entrée · fait stocké sur la ligne, par marque. */
export type CanalAcquisition = 'suivi' | 'radar' | 'inconnu';

/** Ramène la valeur stockée (`provenance`) à son canal · rien de connu → inconnu. */
export function canalDepuisProvenance(p: string | null | undefined): CanalAcquisition {
  return p === 'followed' ? 'suivi' : p === 'radar' ? 'radar' : 'inconnu';
}

/** Décompte des canaux derrière une proposition · dit la diversité d'acquisition. */
export interface CompteCanaux {
  /** Créas issues de marques suivies. */
  suivi: number;
  /** Créas repérées par le Radar. */
  radar: number;
  /** Créas sans canal connu · historiques importés sans preuve. */
  inconnu: number;
}

export function compteCanauxVide(): CompteCanaux {
  return { suivi: 0, radar: 0, inconnu: 0 };
}

export function ajouterCanal(c: CompteCanaux, p: string | null | undefined): void {
  const canal = canalDepuisProvenance(p);
  c[canal]++;
}

/** Agrège les canaux d'une liste de créas en un décompte. */
export function compterCanaux(sources: ReadonlyArray<{ provenance?: string | null }>): CompteCanaux {
  const c = compteCanauxVide();
  for (const s of sources) ajouterCanal(c, s.provenance);
  return c;
}

/** Le canal d'une rangée · un seul canal présent → lui ; plusieurs → « multiples ». */
export type CanalRangee = CanalAcquisition | 'multiples';

export function canalDeRangee(c: CompteCanaux): CanalRangee {
  const presents = [c.suivi > 0, c.radar > 0, c.inconnu > 0].filter(Boolean).length;
  if (presents === 0) return 'inconnu';
  if (presents > 1) return 'multiples';
  if (c.suivi > 0) return 'suivi';
  if (c.radar > 0) return 'radar';
  return 'inconnu';
}

/** Le libellé de chaque canal · ce qu'on SAIT de l'acquisition, sans plus. */
export const LIBELLE_CANAL: Record<CanalRangee, { court: string; note?: string }> = {
  suivi: { court: 'Marque suivie', note: 'entrée via une marque que tu suis' },
  radar: { court: 'Détectée par le Radar', note: 'repérée par le balayage, pas par un suivi' },
  inconnu: { court: 'Origine inconnue', note: 'aucun canal d’acquisition enregistré' },
  multiples: { court: 'Provenances multiples', note: 'plusieurs canaux d’acquisition derrière cette part' },
};

/* -------------------------------------------------------------------------- */
/*  Axe 2 · la qualification métier (pertinence, jamais déduite du canal)      */
/* -------------------------------------------------------------------------- */

/**
 * La pertinence competitive d'une source pour la marque · établie SEULEMENT par
 * une qualification distincte et étayée. « À qualifier » tant que rien ne
 * l'établit · on ne l'infère jamais du canal d'acquisition.
 */
export type QualificationMetier =
  | 'preuve_propre'
  | 'concurrent_direct'
  | 'inspiration_adjacente'
  | 'a_qualifier';

/**
 * Lit une qualification EXPLICITE et étayée · toute valeur absente ou inconnue
 * reste « à qualifier ». Le canal n'entre PAS dans cette fonction · c'est le
 * point de la correction · une source suivie ou Radar n'hérite d'aucune
 * pertinence non prouvée.
 */
export function qualificationDepuis(q: string | null | undefined): QualificationMetier {
  return q === 'preuve_propre' || q === 'concurrent_direct' || q === 'inspiration_adjacente'
    ? q
    : 'a_qualifier';
}

/** Décompte des qualifications ÉTABLIES derrière une proposition. */
export interface CompteQualifs {
  preuvePropre: number;
  concurrentDirect: number;
  inspirationAdjacente: number;
  /** Sources dont la pertinence n'est pas établie · l'inconnu explicite. */
  aQualifier: number;
}

export function compteQualifsVide(): CompteQualifs {
  return { preuvePropre: 0, concurrentDirect: 0, inspirationAdjacente: 0, aQualifier: 0 };
}

export function ajouterQualification(c: CompteQualifs, q: string | null | undefined): void {
  const qualif = qualificationDepuis(q);
  if (qualif === 'preuve_propre') c.preuvePropre++;
  else if (qualif === 'concurrent_direct') c.concurrentDirect++;
  else if (qualif === 'inspiration_adjacente') c.inspirationAdjacente++;
  else c.aQualifier++;
}

/** Agrège les qualifications explicites d'une liste de créas. */
export function compterQualifications(sources: ReadonlyArray<{ qualification?: string | null }>): CompteQualifs {
  const c = compteQualifsVide();
  for (const s of sources) ajouterQualification(c, s.qualification);
  return c;
}

/**
 * La qualification d'une rangée · lue sur les qualifications ÉTABLIES.
 * Aucune établie → « à qualifier ». Une seule → elle. Plusieurs établies et
 * distinctes → « mixte ». Les sources « à qualifier » ne comptent jamais comme
 * une pertinence · elles n'ajoutent pas de diversité de qualification.
 */
export type QualifRangee = QualificationMetier | 'mixte';

export function qualifDeRangee(c: CompteQualifs): QualifRangee {
  const etablies = [c.preuvePropre > 0, c.concurrentDirect > 0, c.inspirationAdjacente > 0].filter(Boolean).length;
  if (etablies === 0) return 'a_qualifier';
  if (etablies > 1) return 'mixte';
  if (c.preuvePropre > 0) return 'preuve_propre';
  if (c.concurrentDirect > 0) return 'concurrent_direct';
  return 'inspiration_adjacente';
}

/** Le libellé de chaque qualification · la limite à dire quand rien n'est prouvé. */
export const LIBELLE_QUALIFICATION: Record<QualifRangee, { court: string; note?: string }> = {
  preuve_propre: { court: 'Preuve propre', note: 'mesurée sur tes propres créas' },
  concurrent_direct: { court: 'Concurrent direct', note: 'qualifié comme concurrent de ta marque' },
  inspiration_adjacente: { court: 'Inspiration adjacente', note: 'qualifiée hors de ton marché direct' },
  a_qualifier: { court: 'À qualifier', note: 'pertinence non établie · écarte-la si elle est hors sujet' },
  mixte: { court: 'Pertinences mixtes', note: 'plusieurs qualifications établies derrière cette part' },
};
