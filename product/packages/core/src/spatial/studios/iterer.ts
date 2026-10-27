import { estGagnanteValidee } from '../../adsmap/verdict-libelle';
import { usableImageUrl } from '../../adsmap/written-source';
import type { VerdictValue } from '../../adsmap/types';
import { lienIterationStudio } from '../../studios/anciennes-adresses';
import type { ClassePastilleSpatiale } from './liste';

/**
 * Spatial · « Nouvelle itération » (`/studio/iterer`, maquette `iterer`). Pur.
 *
 * La maquette classe des pubs avec des chiffres d'exemple et simule ensuite la
 * génération des variantes. Ici, la liste est le PLAN D'ITÉRATION réel
 * (`iterationPlanAction` · verdicts arbitrés seulement, classés par priorité de
 * revue) · une pub par ligne, sa première proposition fait foi. On ne peut
 * repartir que d'une gagnante PROUVÉE (même règle que la reprise du brief
 * d'itération, `briefDepuisTest`) · les autres pistes restent visibles,
 * désactivées, avec la raison. Le geste suivant est la VRAIE reprise
 * (`lienIterationStudio` · préparation du projet, brief repris) · rien n'est
 * généré ni débité ici, le devis vient dans le projet, avant tout lancement.
 */

export interface LignePlanSpatial {
  adId: string;
  label: string;
  mode: 'more' | 'better' | 'new';
  modeLabel: string;
  rationale: string;
  variableLabel: string;
  freezeLabels: readonly string[];
  parentVerdict: VerdictValue;
  parentComparable: boolean;
  edgeLegal: boolean;
  spend: number | null;
}

/** Ce qu'on sait en plus d'une pub du plan · son ROAS mesuré et sa vignette RÉELLE. */
export interface ContexteAdSpatial { roas: number | null; vignette: string | null }

export interface ChoixIterationSpatial {
  adId: string;
  titre: string;
  pastilles: Array<{ libelle: string; classe: ClassePastilleSpatiale }>;
  chiffres: Array<{ libelle: string; valeur: string }>;
  raison: string;
  vignette: string | null;
  selectionnable: boolean;
  /** La phrase de la barre d'action · ce qui change, ce qui reste. */
  change: { variable: string; garde: string | null };
  /** La reprise réelle · `null` quand la pub n'est pas sélectionnable. */
  lien: string | null;
}

/** Combien de pubs l'écran propose · le plan en lit 30 au plus, l'écran garde les plus urgentes. */
export const MAX_CHOIX_ITERATION = 12;

const CLASSE_MODE: Readonly<Record<LignePlanSpatial['mode'], ClassePastilleSpatiale>> = { more: 'g', better: 'w', new: 'r' };

const liste = (xs: readonly string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} et ${xs[xs.length - 1]}`);
const euros = (v: number) => `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(v)} €`;
const deux = (v: number) => new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);

export const RAISON_NON_GAGNANTE = 'On n’itère que sur une gagnante arbitrée au protocole · cette piste repart en nouveau concept, depuis Résultats.';
export const RAISON_ROLE_ITERATION = 'Ton rôle ne permet pas de créer le projet de cette itération.';

export function choixIterationSpatial(
  rows: readonly LignePlanSpatial[],
  contexte: (adId: string) => ContexteAdSpatial | undefined,
  o: { peutIterer: boolean; max?: number },
): ChoixIterationSpatial[] {
  const vus = new Set<string>();
  const out: ChoixIterationSpatial[] = [];
  let conseille = false;
  for (const r of rows) {
    if (vus.has(r.adId)) continue;
    vus.add(r.adId);
    const gagnante = r.edgeLegal && estGagnanteValidee(r.parentVerdict, r.parentComparable);
    const selectionnable = gagnante && o.peutIterer;
    const c = contexte(r.adId);
    const pastilles: ChoixIterationSpatial['pastilles'] = [];
    if (selectionnable && !conseille) { pastilles.push({ libelle: 'Conseillé', classe: 'g' }); conseille = true; }
    pastilles.push({ libelle: r.modeLabel, classe: CLASSE_MODE[r.mode] });
    const chiffres: ChoixIterationSpatial['chiffres'] = [];
    if (c?.roas != null && Number.isFinite(c.roas) && c.roas > 0) chiffres.push({ libelle: 'ROAS', valeur: deux(c.roas) });
    if (r.spend != null && Number.isFinite(r.spend) && r.spend > 0) chiffres.push({ libelle: 'Dépense', valeur: euros(r.spend) });
    out.push({
      adId: r.adId,
      titre: r.label,
      pastilles,
      chiffres,
      raison: selectionnable ? r.rationale : gagnante ? RAISON_ROLE_ITERATION : RAISON_NON_GAGNANTE,
      vignette: usableImageUrl(c?.vignette ?? null),
      selectionnable,
      change: { variable: r.variableLabel, garde: r.freezeLabels.length ? liste(r.freezeLabels) : null },
      lien: selectionnable ? lienIterationStudio(r.adId) : null,
    });
    if (out.length >= (o.max ?? MAX_CHOIX_ITERATION)) break;
  }
  return out;
}

/** La pub sélectionnée à l'ouverture · celle demandée par l'adresse si elle est sélectionnable, sinon la première qui l'est. */
export function choixInitialIteration(choix: readonly ChoixIterationSpatial[], demande: string | null | undefined): string | null {
  const d = demande ? choix.find((c) => c.adId === demande.toLowerCase() && c.selectionnable) : undefined;
  return d?.adId ?? choix.find((c) => c.selectionnable)?.adId ?? null;
}

/** Les quatre étapes de la maquette · la première se fait ici, les suivantes dans le projet (brief repris, devis, confirmation). */
export const ETAPES_ITERATION_SPATIALE = ['La pub', 'Ce qu’on change', 'Le brief', 'Devis et lancement'] as const;

export interface VideIterationSpatial { titre: string; texte: string; lien: { href: string; libelle: string } | null }

/**
 * Ce que dit l'écran quand il n'a aucune pub à proposer · refus d'offre ou de
 * rôle (garde Adsmap), pas de marque active, lecture en panne, plan vide (le
 * résumé RÉEL du plan, qui dit sur quoi il est fondé). `null` · il y a des pubs.
 */
export function videIterationSpatial(e: { refus: 'role' | 'plan' | null; marque: boolean; erreur: string | null; lignes: number; resume: string }): VideIterationSpatial | null {
  if (e.refus === 'plan') return { titre: 'Inclus dès l’offre Plus', texte: 'Les itérations partent des verdicts de Résultats, disponible à partir de l’offre Plus.', lien: { href: '/billing', libelle: 'Voir les forfaits' } };
  if (e.refus === 'role') return { titre: 'Accès réservé', texte: 'Ton rôle ne permet pas d’ouvrir Résultats, d’où partent les itérations.', lien: null };
  if (!e.marque) return { titre: 'Choisis une marque', texte: 'Les itérations se lisent marque par marque · choisis une marque active.', lien: { href: '/brands', libelle: 'Choisir une marque' } };
  if (e.erreur) return { titre: 'Lecture impossible', texte: e.erreur, lien: null };
  if (e.lignes === 0) return { titre: 'Rien à itérer pour l’instant', texte: e.resume, lien: { href: '/adsmap', libelle: 'Voir les Résultats' } };
  return null;
}
