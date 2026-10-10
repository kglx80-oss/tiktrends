/**
 * Benchmark Studios · fiches de revue HUMAINE et verdict de campagne.
 *
 * Le code ne note JAMAIS une sortie : une fiche naît vide (toutes les notes à
 * `null`) et seul un relecteur la remplit. Une fiche incomplète empêche le
 * verdict (« revue humaine requise »), elle ne vaut ni 0 ni 2.
 *
 * Verdict, dans cet ordre :
 *  1. fiches illisibles (note hors 0-2, dimension inconnue ou manquante) → NON_CONFORME ;
 *  2. un invariant déterministe en échec → NON_CONFORME (100 % exigés) ;
 *  3. un cas absent, bloqué, arrêté ou un invariant non évaluable → INCOMPLET ;
 *  4. une fiche non remplie → REVUE_HUMAINE_REQUISE ;
 *  5. moyenne < 8/10 ou un défaut critique accepté → NON_CONFORME ;
 *  6. sinon CONFORME.
 *
 * `approuvable` (une release peut s'en prévaloir) exige en plus le mode RÉEL et
 * les 24 cas. Une campagne SIMULÉE n'est jamais approuvable, quel que soit son
 * statut : elle prouve la chaîne, pas la qualité.
 *
 * Pur.
 */

import { constatBench, DIMENSIONS_RUBRIQUE, IDS_CAS, type ConstatBench, type DimensionRubrique, type Rubrique } from './cas';
import type { PlanCas } from './plan';

export type ModeCampagne = 'simule' | 'reel';

export interface DefautCritique { description: string; accepte: boolean }

export interface NoteSortie {
  sortie: number;
  notes: Record<DimensionRubrique, number | null>;
  defautsCritiques: DefautCritique[];
  relecteur: string | null;
  commentaire: string;
}

export interface FicheRevue {
  cas: string;
  titre: string;
  mode: ModeCampagne;
  criteres: string[];
  oracleAttendu: string;
  dimensions: readonly DimensionRubrique[];
  echelle: readonly number[];
  sorties: NoteSortie[];
}

/** Fiche vierge d'un cas · une ligne par sortie, aucune note. */
export function ficheVierge(plan: PlanCas, rubrique: Rubrique, mode: ModeCampagne): FicheRevue | null {
  if (plan.revueHumaine.length === 0) return null;
  const notes = Object.fromEntries(rubrique.dimensions.map((d) => [d, null])) as Record<DimensionRubrique, null>;
  return {
    cas: plan.id, titre: plan.titre, mode, criteres: [...plan.revueHumaine], oracleAttendu: plan.oracleAttendu,
    dimensions: rubrique.dimensions, echelle: rubrique.pointsEach,
    sorties: Array.from({ length: plan.sorties }, (_, s) => ({ sortie: s, notes: { ...notes }, defautsCritiques: [], relecteur: null, commentaire: '' })),
  };
}

/** Défauts de forme d'une fiche remplie. */
export function validerFiche(f: FicheRevue, rubrique: Rubrique): ConstatBench[] {
  const out: ConstatBench[] = [];
  f.sorties.forEach((s) => {
    const cles = Object.keys(s.notes).sort();
    const attendues = [...rubrique.dimensions].sort();
    if (JSON.stringify(cles) !== JSON.stringify(attendues)) out.push(constatBench('FICHE_DIMENSIONS', `${f.cas}/${s.sortie}`, `Dimensions ${cles.join(', ')} · attendues ${attendues.join(', ')}.`));
    for (const d of rubrique.dimensions) {
      const n = s.notes[d];
      if (n !== null && !(rubrique.pointsEach as readonly number[]).includes(n)) out.push(constatBench('FICHE_NOTE_HORS_ECHELLE', `${f.cas}/${s.sortie}/${d}`, `Note ${String(n)} hors de l’échelle 0-2.`));
    }
    const remplie = rubrique.dimensions.every((d) => s.notes[d] !== null);
    if (remplie && !s.relecteur) out.push(constatBench('FICHE_SANS_RELECTEUR', `${f.cas}/${s.sortie}`, 'Une fiche notée porte le nom de son relecteur.'));
  });
  return out;
}

const ficheRemplie = (f: FicheRevue) => f.sorties.every((s) => DIMENSIONS_RUBRIQUE.every((d) => s.notes[d] !== null));

export interface Invariant {
  id: string;
  description: string;
  /** `null` = non évaluable (étape non exécutée) · jamais compté comme réussi. */
  passe: boolean | null;
  detail: string;
}

export type StatutCas = 'execute' | 'bloque_capacite' | 'arrete_budget' | 'arrete_incertain' | 'erreur';

export interface ResultatCas {
  cas: string;
  statut: StatutCas;
  motif: string | null;
  invariants: Invariant[];
  fiche: FicheRevue | null;
}

export type StatutVerdict = 'CONFORME' | 'NON_CONFORME' | 'INCOMPLET' | 'REVUE_HUMAINE_REQUISE';

export interface VerdictCampagne {
  mode: ModeCampagne;
  statut: StatutVerdict;
  evaluationReelle: boolean;
  approuvable: boolean;
  invariants: { total: number; passes: number; echoues: number; nonEvaluables: number };
  moyenne: number | null;
  sortiesNotees: number;
  critiquesAcceptes: number;
  casEchoues: string[];
  casIncomplets: string[];
  revuesManquantes: string[];
  motifs: string[];
}

export function verdictCampagne(a: { mode: ModeCampagne; rubrique: Rubrique; resultats: readonly ResultatCas[] }): VerdictCampagne {
  const { rubrique, resultats } = a;
  const motifs: string[] = [];
  const tous = resultats.flatMap((r) => r.invariants);
  const echoues = tous.filter((i) => i.passe === false);
  const nonEvaluables = tous.filter((i) => i.passe === null);
  const casEchoues = resultats.filter((r) => r.invariants.some((i) => i.passe === false)).map((r) => r.cas);
  const presents = new Set(resultats.map((r) => r.cas));
  const casIncomplets = [
    ...IDS_CAS.filter((id) => !presents.has(id)),
    ...resultats.filter((r) => r.statut !== 'execute' || r.invariants.some((i) => i.passe === null)).map((r) => r.cas),
  ];
  const fiches = resultats.flatMap((r) => (r.fiche ? [r.fiche] : []));
  const defautsFiches = fiches.flatMap((f) => validerFiche(f, rubrique));
  const revuesManquantes = fiches.filter((f) => !ficheRemplie(f)).map((f) => f.cas);
  const notees = fiches.filter(ficheRemplie).flatMap((f) => f.sorties);
  const moyenne = notees.length ? notees.reduce((s, x) => s + rubrique.dimensions.reduce((t, d) => t + (x.notes[d] ?? 0), 0), 0) / notees.length : null;
  const critiquesAcceptes = fiches.flatMap((f) => f.sorties.flatMap((s) => s.defautsCritiques)).filter((d) => d.accepte).length;
  const taux = tous.length ? (tous.length - echoues.length - nonEvaluables.length) / tous.length : 0;

  let statut: StatutVerdict;
  if (defautsFiches.length) { statut = 'NON_CONFORME'; motifs.push(...defautsFiches.map((c) => `${c.code} ${c.cible}`)); }
  else if (echoues.length) { statut = 'NON_CONFORME'; motifs.push(`${echoues.length} invariant(s) déterministe(s) en échec · ${rubrique.deterministicInvariantPassRate * 100} % exigés`); }
  else if (casIncomplets.length) { statut = 'INCOMPLET'; motifs.push(`cas incomplets : ${[...new Set(casIncomplets)].join(', ')}`); }
  else if (revuesManquantes.length) { statut = 'REVUE_HUMAINE_REQUISE'; motifs.push(`fiches à remplir : ${revuesManquantes.join(', ')}`); }
  else if (critiquesAcceptes > rubrique.criticalAcceptedAllowed) { statut = 'NON_CONFORME'; motifs.push(`${critiquesAcceptes} défaut(s) critique(s) accepté(s) · ${rubrique.criticalAcceptedAllowed} permis`); }
  else if (moyenne === null || moyenne < rubrique.minimumMean) { statut = 'NON_CONFORME'; motifs.push(`moyenne ${moyenne === null ? 'absente' : moyenne.toFixed(2)} · minimum ${rubrique.minimumMean}/10`); }
  else if (taux < rubrique.deterministicInvariantPassRate) { statut = 'NON_CONFORME'; motifs.push('taux d’invariants insuffisant'); }
  else statut = 'CONFORME';

  const complete = IDS_CAS.every((id) => presents.has(id));
  if (a.mode === 'simule') motifs.push('campagne SIMULÉE · ne vaut jamais évaluation réelle');
  if (!complete) motifs.push('campagne partielle · une release ne s’en prévaut pas');
  return {
    mode: a.mode, statut, evaluationReelle: a.mode === 'reel',
    approuvable: a.mode === 'reel' && statut === 'CONFORME' && complete,
    invariants: { total: tous.length, passes: tous.length - echoues.length - nonEvaluables.length, echoues: echoues.length, nonEvaluables: nonEvaluables.length },
    moyenne, sortiesNotees: notees.length, critiquesAcceptes,
    casEchoues, casIncomplets: [...new Set(casIncomplets)], revuesManquantes, motifs,
  };
}
