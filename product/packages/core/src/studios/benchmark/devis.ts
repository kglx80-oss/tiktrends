/**
 * Benchmark Studios · devis AGRÉGÉ, calculé avant toute exécution réelle
 * (`budgetPolicy` : « calculer devis agrégé avant tests réels »).
 *
 * Aucun prix n'est inventé ici :
 *  - un appel texte coûte au plus ses BORNES (`bornes-taches.ts`, la même
 *    source que le résolveur : 24 000 jetons d'entrée, 4 000 de sortie) au
 *    tarif du modèle ROUTÉ pour le profil du template (`MODEL_RATES`) ;
 *  - un média coûte le plafond fournisseur du barème existant
 *    (`GRILLE_STUDIO`, dérivé de `FIXED_COSTS`) ;
 *  - un calcul local est inclus (0 $), mais listé.
 *
 * Un profil non routé, un modèle sans tarif répertorié ou un média sans tarif
 * rendent la ligne NON CHIFFRABLE · jamais 0 $. Le devis agrégé est alors
 * REFUSÉ (le total d'une somme incomplète mentirait), avec la liste des cas en
 * cause et le chiffrage partiel des autres pour information.
 *
 * Montants en micro-dollars ENTIERS (jamais de flottant dans un devis).
 * Pur.
 */

import { MODEL_RATES, type ModelRate } from '../../spend-guard';
import { JETONS_ENTREE_MAX_PROPOSITION, JETONS_SORTIE_MAX_PROPOSITION } from '../bornes-taches';
import { GRILLE_STUDIO } from '../execution/tarifs';
import { empreinteContenu } from '../version';
import { VISION_JETONS_IMAGE_MAX, VISION_PIECES_PAR_APPEL_MAX } from '../../prompts/vision';
import type { PlanCas, ProfilMedia } from './plan';

export interface TarifsBenchmark {
  /** templateKey → profil logique (`modelProfile` du pack). */
  profils: Readonly<Record<string, string>>;
  /** Profil logique → modèle routé · absent ou `null` = non routé. */
  routage: Readonly<Record<string, string | null>>;
  /** Tarifs connus des modèles ($ par million de jetons). */
  tarifsModeles: Readonly<Record<string, ModelRate>>;
  /** Plafond fournisseur par unité de média, micro-dollars · `null` = aucun tarif. */
  medias: Readonly<Record<ProfilMedia, { usdMicros: number | null; source: string }>>;
  bornes: { jetonsEntree: number; jetonsSortie: number };
  /**
   * Images natives jointes AU PLUS par appel, par profil (vision) · chaque image
   * compte `jetonsParImage` jetons d'entrée EN PLUS des bornes texte. Absent = 0.
   */
  imagesParProfil?: Readonly<Record<string, number>>;
  jetonsParImage?: number;
}

/** Tarifs du produit : modèle routé pour `reasoning_structured`, barème média existant. */
export function tarifsDuProduit(a: { profils: Readonly<Record<string, string>>; routage: Readonly<Record<string, string | null>> }): TarifsBenchmark {
  return {
    profils: a.profils,
    routage: a.routage,
    tarifsModeles: MODEL_RATES,
    medias: {
      image_generation: { usdMicros: GRILLE_STUDIO.image_generation.usdMicros, source: GRILLE_STUDIO.image_generation.source },
      animation: { usdMicros: GRILLE_STUDIO.animation.usdMicros, source: GRILLE_STUDIO.animation.source },
    },
    bornes: { jetonsEntree: JETONS_ENTREE_MAX_PROPOSITION, jetonsSortie: JETONS_SORTIE_MAX_PROPOSITION },
    // Vision : au plus VISION_PIECES_PAR_APPEL_MAX images, chacune au plus
    // VISION_JETONS_IMAGE_MAX jetons · la borne que l'adaptateur fait respecter.
    imagesParProfil: { vision_analysis: VISION_PIECES_PAR_APPEL_MAX },
    jetonsParImage: VISION_JETONS_IMAGE_MAX,
  };
}

/**
 * Tarif CONNU d'un modèle (exact, ou identifiant daté par préfixe comme
 * `rateFor`) · `null` sinon. Contrairement à la barrière de dépense, qui
 * présume cher un modèle inconnu pour REFUSER, un devis ne présume rien : il
 * dit « non chiffrable ».
 */
export function tarifConnu(modele: string, table: Readonly<Record<string, ModelRate>>): ModelRate | null {
  if (Object.prototype.hasOwnProperty.call(table, modele)) return table[modele]!;
  const k = Object.keys(table).find((x) => modele.startsWith(x));
  return k ? table[k]! : null;
}

/** Plafond d'un appel texte borné, micro-dollars entiers (arrondi au supérieur). */
export function borneAppelMicros(tarif: ModelRate, bornes: TarifsBenchmark['bornes']): number {
  // jetons × ($/M jetons) / 1e6 $ = jetons × tarif micro-dollars.
  return Math.ceil(bornes.jetonsEntree * tarif.inputPerMTok + bornes.jetonsSortie * tarif.outputPerMTok);
}

export interface LigneDevisBench {
  etapeId: string;
  sortie: number;
  nature: 'tache' | 'media' | 'calcul';
  /** templateKey, profil média ou identifiant du calcul. */
  cle: string;
  modele: string | null;
  unites: number;
  usdMicros: number | null;
  source: string;
  motif: string | null;
}

export interface DevisCas {
  cas: string;
  lignes: LigneDevisBench[];
  chiffrable: boolean;
  totalUsdMicros: number | null;
  appels: number;
  medias: number;
}

export function devisCas(plan: PlanCas, t: TarifsBenchmark): DevisCas {
  const lignes: LigneDevisBench[] = plan.deroule.map(({ etape: e, sortie }): LigneDevisBench => {
    if (e.nature === 'calcul') return { etapeId: e.id, sortie, nature: 'calcul', cle: e.id, modele: null, unites: 1, usdMicros: 0, source: 'moteur déterministe local · inclus', motif: null };
    if (e.nature === 'media') {
      const m = t.medias[e.profil];
      if (!m || m.usdMicros === null) return { etapeId: e.id, sortie, nature: 'media', cle: e.profil, modele: null, unites: e.unites, usdMicros: null, source: m?.source ?? 'aucun tarif', motif: `aucun tarif pour le média « ${e.profil} »` };
      return { etapeId: e.id, sortie, nature: 'media', cle: e.profil, modele: null, unites: e.unites, usdMicros: m.usdMicros * e.unites, source: m.source, motif: null };
    }
    const profil = t.profils[e.templateKey];
    if (!profil) return { etapeId: e.id, sortie, nature: 'tache', cle: e.templateKey, modele: null, unites: 1, usdMicros: null, source: 'pack', motif: `template « ${e.templateKey} » absent du pack` };
    const modele = t.routage[profil] ?? null;
    if (!modele) return { etapeId: e.id, sortie, nature: 'tache', cle: e.templateKey, modele: null, unites: 1, usdMicros: null, source: `profil ${profil}`, motif: `profil « ${profil} » routé vers aucun modèle` };
    const tarif = tarifConnu(modele, t.tarifsModeles);
    if (!tarif) return { etapeId: e.id, sortie, nature: 'tache', cle: e.templateKey, modele, unites: 1, usdMicros: null, source: 'MODEL_RATES', motif: `modèle « ${modele} » sans tarif répertorié` };
    const images = t.imagesParProfil?.[profil] ?? 0;
    const jetonsImages = images * (t.jetonsParImage ?? 0);
    if (images > 0 && !(jetonsImages > 0)) return { etapeId: e.id, sortie, nature: 'tache', cle: e.templateKey, modele, unites: 1, usdMicros: null, source: `profil ${profil}`, motif: `images jointes sans borne de jetons par image` };
    const bornes = { jetonsEntree: t.bornes.jetonsEntree + jetonsImages, jetonsSortie: t.bornes.jetonsSortie };
    return {
      etapeId: e.id, sortie, nature: 'tache', cle: e.templateKey, modele, unites: 1, usdMicros: borneAppelMicros(tarif, bornes),
      source: `${t.bornes.jetonsEntree} jetons entrée${images ? ` + ${images} images × ${t.jetonsParImage} jetons` : ''} + ${t.bornes.jetonsSortie} sortie au tarif ${modele} (MODEL_RATES)`, motif: null,
    };
  });
  const chiffrable = lignes.every((l) => l.usdMicros !== null);
  return {
    cas: plan.id, lignes, chiffrable,
    totalUsdMicros: chiffrable ? lignes.reduce((s, l) => s + (l.usdMicros ?? 0), 0) : null,
    appels: lignes.filter((l) => l.nature === 'tache').length,
    medias: lignes.filter((l) => l.nature === 'media').reduce((s, l) => s + l.unites, 0),
  };
}

export type DevisAgrege =
  | { ok: true; cas: DevisCas[]; totalUsdMicros: number; empreinte: string }
  | { ok: false; code: 'NON_CHIFFRABLE'; cas: DevisCas[]; nonChiffrables: string[]; totalPartielUsdMicros: number; empreinte: null };

/** Empreinte d'un devis · ce que l'approbation ADMIN vise, ligne par ligne. */
export function empreinteDevis(cas: readonly DevisCas[], totalUsdMicros: number, bornes: TarifsBenchmark['bornes']): string {
  return empreinteContenu({ format: 'devis-benchmark-studios/1', bornes, totalUsdMicros, cas: cas.map((c) => ({ cas: c.cas, total: c.totalUsdMicros, lignes: c.lignes.map((l) => [l.etapeId, l.sortie, l.nature, l.cle, l.modele, l.unites, l.usdMicros]) })) });
}

/** Devis agrégé = SOMME des cas · refusé si un seul cas n'est pas chiffrable. */
export function devisAgrege(plans: readonly PlanCas[], t: TarifsBenchmark): DevisAgrege {
  const cas = plans.map((p) => devisCas(p, t));
  const nonChiffrables = cas.filter((c) => !c.chiffrable).map((c) => c.cas);
  if (nonChiffrables.length || cas.length === 0) {
    return { ok: false, code: 'NON_CHIFFRABLE', cas, nonChiffrables, totalPartielUsdMicros: cas.reduce((s, c) => s + (c.totalUsdMicros ?? 0), 0), empreinte: null };
  }
  const totalUsdMicros = cas.reduce((s, c) => s + c.totalUsdMicros!, 0);
  return { ok: true, cas, totalUsdMicros, empreinte: empreinteDevis(cas, totalUsdMicros, t.bornes) };
}

/** Affichage · « 0,132 $ » (trois décimales : les bornes d'un appel tombent au millième). */
export function usdLisible(micros: number | null): string {
  if (micros === null) return 'non chiffrable';
  return `${(micros / 1_000_000).toFixed(3).replace('.', ',')} $`;
}
