/**
 * Benchmark Studios · plan d'exécution de chaque cas F01-F24.
 *
 * Un cas = une suite d'ÉTAPES :
 *  - `tache` : un appel au registre (`executerTache`) sur un template du cas ;
 *  - `media` : une génération ou retouche facturée au coup (fournisseur image
 *    ou vidéo), tarifée au barème EXISTANT (`GRILLE_STUDIO`) ;
 *  - `calcul` : un moteur déterministe local (rendu, application d'un patch,
 *    mesure) · 0 $, jamais un fournisseur.
 *
 * Une étape `parSortie` est répétée pour chaque sortie : 2 sorties pour un cas
 * stochastique VISUEL (`stochasticOutputsPerCase`), 1 sinon. Les appels
 * supplémentaires restent sous budget (rubrique, `scope`).
 *
 * Garde de cohérence : l'ensemble des templates des étapes `tache` d'un cas est
 * EXACTEMENT celui que `09-BENCHMARK.json` déclare. Le plan n'invente pas de
 * tâche et n'en oublie pas.
 *
 * Pur.
 */

import { constatBench, type BenchmarkLu, type CasBenchmark, type ConstatBench, type Rubrique } from './cas';

export type ProfilMedia = 'image_generation' | 'animation';
export type AttenduEtape = 'ready' | 'blocked' | 'ready_ou_blocked';

export type EtapeBench =
  | { nature: 'tache'; id: string; templateKey: string; parSortie: boolean; attendu: AttenduEtape; but: string }
  | { nature: 'media'; id: string; profil: ProfilMedia; parSortie: boolean; unites: number; but: string }
  | { nature: 'calcul'; id: string; parSortie: boolean; but: string };

export interface DefinitionCas {
  stochastiqueVisuel: boolean;
  etapes: EtapeBench[];
  /** Invariants DÉTERMINISTES que l'oracle calcule (identifiants stables). */
  invariants: string[];
  /** Critères de la fiche de revue HUMAINE · vide = cas entièrement déterministe. */
  revueHumaine: string[];
  /** Limites connues, écrites dans le dossier de preuve. */
  limites: string[];
}

const T = (id: string, templateKey: string, but: string, o: { parSortie?: boolean; attendu?: AttenduEtape } = {}): EtapeBench =>
  ({ nature: 'tache', id, templateKey, parSortie: o.parSortie ?? false, attendu: o.attendu ?? 'ready', but });
const M = (id: string, profil: ProfilMedia, but: string, unites = 1): EtapeBench => ({ nature: 'media', id, profil, parSortie: true, unites, but });
const C = (id: string, but: string, parSortie = false): EtapeBench => ({ nature: 'calcul', id, parSortie, but });

const LIMITE_VISION = 'Le profil vision_analysis n’est routé vers aucun fournisseur : l’étape est bloquée avant appel (UNSUPPORTED_CAPABILITY) et le cas n’est pas chiffrable tant que ce routage n’existe pas.';

/**
 * Les 24 plans. Chaque choix est écrit ici une fois ; le devis, l'exécution
 * et les dossiers de preuve en dérivent.
 */
export const DEFINITIONS_CAS: Readonly<Record<string, DefinitionCas>> = {
  F01: {
    stochastiqueVisuel: true,
    etapes: [
      T('brief', 'brief.build', 'Brief avec lunettes ET bandeau en composants requis'),
      T('compile', 'image.compile', 'Consigne image en mode fidèle, décor seul variable'),
      M('generation', 'image_generation', 'Décor généré autour du calque produit'),
      C('composition', 'Calque produit original reposé par le moteur déterministe', true),
      T('qualite', 'quality.visual', 'Contrôle visuel de chaque sortie', { parSortie: true, attendu: 'ready' }),
    ],
    invariants: ['F01.composants_proteges', 'F01.calque_inchange'],
    revueHumaine: ['Lunettes ET bandeau présents sur chaque sortie', 'Décor seul modifié'],
    limites: [LIMITE_VISION],
  },
  F02: {
    stochastiqueVisuel: true,
    etapes: [
      T('style', 'style.describe', 'Style de la référence clay, portée décor seulement'),
      T('compile', 'image.compile', 'Consigne image avec interdits de transfert'),
      M('generation', 'image_generation', 'Décor au style de la référence'),
      T('qualite', 'quality.visual', 'Contrôle visuel de chaque sortie', { parSortie: true }),
    ],
    invariants: ['F02.portee_decor', 'F02.interdits_transfert'],
    revueHumaine: ['Aucun personnage ni logo tiers importé', 'Matière du produit bleu protégée'],
    limites: [LIMITE_VISION],
  },
  F03: {
    stochastiqueVisuel: false,
    etapes: [
      T('coherence', 'quality.consistency', 'Fiche tenue verte contre plan texte jaune'),
      T('plan', 'shot.image', 'Plan demandé malgré le conflit', { attendu: 'blocked' }),
    ],
    invariants: ['F03.conflit_explicite', 'F03.plan_bloque', 'F03.aucun_devis'],
    revueHumaine: [],
    limites: [],
  },
  F04: {
    stochastiqueVisuel: false,
    etapes: [
      T('route', 'jarvis.route', 'Demande de modification de la montre'),
      T('patch', 'document.patch', 'Proposition de patch, jamais appliquée'),
    ],
    invariants: ['F04.proposition', 'F04.document_inchange', 'F04.zero_job_devis_media_quota'],
    revueHumaine: [],
    limites: [],
  },
  F05: {
    stochastiqueVisuel: true,
    etapes: [
      T('consigne', 'edit.mask', 'Consigne de retouche : étoile dans la zone masquée'),
      M('retouche', 'image_generation', 'Retouche masquée (barème image existant)'),
      C('mesure', 'Comparaison pixel à pixel avant encodage', true),
    ],
    invariants: ['F05.hors_masque_intact', 'F05.zone_modifiee'],
    revueHumaine: ['Une étoile lisible dans le rectangle gauche'],
    limites: [],
  },
  F06: {
    stochastiqueVisuel: false,
    etapes: [
      T('patch', 'document.patch', 'Échelle du produit à 55 % de la largeur'),
      C('rendu', 'Patch appliqué puis rendu, boîte englobante mesurée'),
    ],
    invariants: ['F06.valeur_document', 'F06.largeur_rendue'],
    revueHumaine: [],
    limites: [],
  },
  F07: {
    stochastiqueVisuel: false,
    etapes: [T('qualite', 'quality.visual', 'Une boîte livrée au lieu des lunettes')],
    invariants: ['F07.jamais_passed'],
    revueHumaine: [],
    limites: [LIMITE_VISION],
  },
  F08: {
    stochastiqueVisuel: false,
    etapes: [T('voix', 'voice.prepare', 'Narration avec nom produit et chiffre sourcé')],
    invariants: ['F08.texte_identique'],
    revueHumaine: [],
    limites: ['Synthèse vocale hors plan : aucun tarif de voix dans l’offre (GRILLE_STUDIO.speech). L’oracle porte sur le texte préparé.'],
  },
  F09: {
    stochastiqueVisuel: false,
    etapes: [
      T('patch', 'document.patch', 'Tenue du plan 2 seulement'),
      C('application', 'Patch appliqué, empreintes du plan 1 et de l’audio comparées'),
    ],
    invariants: ['F09.plan1_conserve', 'F09.audio_conserve', 'F09.plan2_modifie'],
    revueHumaine: [],
    limites: ['La régénération de l’image du plan 2 n’est pas incluse : l’oracle porte sur l’isolation de la révision.'],
  },
  F10: {
    stochastiqueVisuel: false,
    etapes: [T('relecture', 'learning.review', 'Test sans exposition ni dépense fiable')],
    invariants: ['F10.inconclusive'],
    revueHumaine: [],
    limites: [],
  },
  F11: {
    stochastiqueVisuel: false,
    etapes: [
      T('textes', 'text.write', 'Promesse « -50 % » sans source', { attendu: 'ready_ou_blocked' }),
      T('brief', 'brief.build', 'Brief de la même demande', { attendu: 'ready_ou_blocked' }),
    ],
    invariants: ['F11.aucune_promesse', 'F11.explicite'],
    revueHumaine: [],
    limites: [],
  },
  F12: {
    stochastiqueVisuel: false,
    etapes: [
      T('analyse', 'source.analyze', 'Extrait concurrent qui donne des ordres'),
      T('route', 'jarvis.route', 'Même extrait en source de la conversation'),
    ],
    invariants: ['F12.hors_consignes_systeme', 'F12.transmis_en_donnee', 'F12.action_disponible'],
    revueHumaine: [],
    limites: [LIMITE_VISION],
  },
  F13: {
    stochastiqueVisuel: false,
    etapes: [T('analyse', 'source.analyze', 'Source image sans audio ni vidéo')],
    invariants: ['F13.aucune_transcription'],
    revueHumaine: [],
    limites: [LIMITE_VISION, 'Oracle lexical (vocabulaire audio et temporel absent) : une formulation détournée relève de la revue.'],
  },
  F14: {
    stochastiqueVisuel: true,
    etapes: [
      T('storyboard', 'storyboard.plan', 'Brief sans texte, sous-titres désactivés'),
      T('compile', 'image.compile', 'Consigne image en mode sans texte'),
      M('generation', 'image_generation', 'Image sans texte'),
    ],
    invariants: ['F14.textes_vides', 'F14.sans_overlay'],
    revueHumaine: ['Contrôle OCR : aucun texte visible dans les pixels'],
    limites: ['Aucun moteur OCR n’est branché : le contrôle OCR est une revue humaine.'],
  },
  F15: {
    stochastiqueVisuel: true,
    etapes: [
      T('compile', 'image.compile', 'Flacon transparent, étiquette fine protégée'),
      M('generation', 'image_generation', 'Changement de fond'),
      T('qualite', 'quality.visual', 'Contours, transparence, lisibilité de l’étiquette', { parSortie: true }),
    ],
    invariants: ['F15.etiquette_protegee'],
    revueHumaine: ['Contours et transparence du flacon conservés', 'Texte de l’étiquette lisible, sinon requires_review'],
    limites: [LIMITE_VISION],
  },
  F16: {
    stochastiqueVisuel: false,
    etapes: [T('animation', 'animation.compile', 'Lipsync demandé, capacité absente', { attendu: 'blocked' })],
    invariants: ['F16.bloque_avant_appel', 'F16.zero_job_media'],
    revueHumaine: [],
    limites: [],
  },
  F17: {
    stochastiqueVisuel: false,
    etapes: [T('lot', 'batch.plan', '3 angles × 3 formats × 3 variations pour un plafond de 12', { attendu: 'ready_ou_blocked' })],
    invariants: ['F17.lot_borne'],
    revueHumaine: [],
    limites: [],
  },
  F18: {
    stochastiqueVisuel: false,
    etapes: [
      T('adaptation', 'format.adapt', 'Document carré au texte long vers 9:16'),
      C('geometrie', 'Patch appliqué, proportions et zones sûres mesurées'),
    ],
    invariants: ['F18.sans_etirement', 'F18.texte_complet', 'F18.zones_sures'],
    revueHumaine: ['Lisibilité et équilibre de la mise en page 9:16'],
    limites: [],
  },
  F19: {
    stochastiqueVisuel: false,
    etapes: [
      T('extraction_a', 'brand.extract', 'Source de la marque A, non autorisée pour B', { attendu: 'blocked' }),
      T('extraction_b', 'brand.extract', 'Sources de la marque B seulement'),
      T('brief', 'brief.build', 'Brief du produit de la marque B'),
    ],
    invariants: ['F19.source_a_rejetee', 'F19.aucun_transfert'],
    revueHumaine: [],
    limites: [],
  },
  F20: {
    stochastiqueVisuel: true,
    etapes: [
      T('personnage', 'character.spec', 'Personnage original, vues de face et de trois quarts'),
      T('storyboard', 'storyboard.plan', 'Deux cadrages, produit tenu'),
      M('images_cles', 'image_generation', 'Une image clé par cadrage', 2),
      T('animation', 'animation.compile', 'Animation des deux cadrages', { parSortie: true }),
      M('clips', 'animation', 'Un clip par cadrage', 2),
    ],
    invariants: ['F20.traits_imposes', 'F20.deux_cadrages'],
    revueHumaine: ['Même identité, même tenue, même produit sur les deux cadrages', 'Absence de caméra parasite signalée'],
    limites: ['animation.compile est appelé une fois par sortie et couvre les deux cadrages par ses contraintes.'],
  },
  F21: {
    stochastiqueVisuel: false,
    etapes: [T('route', 'jarvis.route', 'Question informative sans projet sélectionné')],
    invariants: ['F21.intention_informative', 'F21.aucune_cible', 'F21.aucune_mutation'],
    revueHumaine: [],
    limites: [],
  },
  F22: {
    stochastiqueVisuel: false,
    etapes: [T('hypotheses', 'test.hypothesize', 'Observations concurrentes sans performance propre')],
    invariants: ['F22.au_plus_3', 'F22.metriques_existantes', 'F22.sans_causalite_garantie'],
    revueHumaine: [],
    limites: [],
  },
  F23: {
    stochastiqueVisuel: false,
    etapes: [T('concepts', 'concept.plan', 'Brief sans témoignage ni chiffre')],
    invariants: ['F23.au_plus_12', 'F23.aucune_preuve_inventee'],
    revueHumaine: ['Concepts distincts et exploitables sur l’angle déclaré'],
    limites: ['Oracle lexical (chiffres, avis, témoignages) : une allégation sans chiffre relève de la revue.'],
  },
  F24: {
    stochastiqueVisuel: false,
    etapes: [
      T('musique', 'music.prepare', 'Mood calme, instrumental, narration conservée'),
      C('mixage', 'Musique licenciée choisie, narration relue par empreinte'),
    ],
    invariants: ['F24.instrumental', 'F24.duree', 'F24.licenciee', 'F24.voix_intacte'],
    revueHumaine: [],
    limites: ['Aucune génération musicale : la musique vient du catalogue licencié (licensedAssetIds).'],
  },
};

export interface AppelPlan { etapeId: string; templateKey: string; sortie: number; attendu: AttenduEtape }
export interface MediaPlan { etapeId: string; profil: ProfilMedia; sortie: number; unites: number }

export interface PlanCas {
  id: string;
  titre: string;
  sorties: number;
  stochastiqueVisuel: boolean;
  /** Étapes dépliées, dans l'ordre d'exécution (sortie par sortie pour les étapes répétées). */
  deroule: Array<{ etape: EtapeBench; sortie: number }>;
  appels: AppelPlan[];
  medias: MediaPlan[];
  invariants: string[];
  revueHumaine: string[];
  limites: string[];
  oracleAttendu: string;
}

/** Templates d'un plan · ensemble trié. */
export const templatesDuPlan = (d: DefinitionCas): string[] =>
  [...new Set(d.etapes.flatMap((e) => (e.nature === 'tache' ? [e.templateKey] : [])))].sort();

export function planCas(cas: CasBenchmark, rubrique: Rubrique, definitions: Readonly<Record<string, DefinitionCas>> = DEFINITIONS_CAS): { ok: true; plan: PlanCas } | { ok: false; constats: ConstatBench[] } {
  const d = definitions[cas.id];
  if (!d) return { ok: false, constats: [constatBench('PLAN_ABSENT', cas.id, 'Aucun plan d’exécution pour ce cas.')] };
  const declares = [...new Set(cas.templates)].sort();
  const planifies = templatesDuPlan(d);
  if (JSON.stringify(declares) !== JSON.stringify(planifies)) {
    return { ok: false, constats: [constatBench('PLAN_TEMPLATES_DIVERGENTS', cas.id, `Templates déclarés ${declares.join(', ')} · planifiés ${planifies.join(', ')}.`)] };
  }
  const sorties = d.stochastiqueVisuel ? rubrique.stochasticOutputsPerCase : 1;
  // Ordre d'exécution : une étape commune à sa place ; un bloc d'étapes
  // consécutives répétées se déroule sortie par sortie (génération, rendu,
  // contrôle de la sortie 1, puis de la sortie 2).
  const deroule: PlanCas['deroule'] = [];
  let i = 0;
  while (i < d.etapes.length) {
    const e = d.etapes[i]!;
    if (!e.parSortie) { deroule.push({ etape: e, sortie: 0 }); i++; continue; }
    let j = i;
    while (j < d.etapes.length && d.etapes[j]!.parSortie) j++;
    const bloc = d.etapes.slice(i, j);
    for (let s = 0; s < sorties; s++) for (const b of bloc) deroule.push({ etape: b, sortie: s });
    i = j;
  }
  return {
    ok: true,
    plan: {
      id: cas.id, titre: cas.title, sorties, stochastiqueVisuel: d.stochastiqueVisuel, deroule,
      appels: deroule.flatMap(({ etape: e, sortie }) => (e.nature === 'tache' ? [{ etapeId: e.id, templateKey: e.templateKey, sortie, attendu: e.attendu }] : [])),
      medias: deroule.flatMap(({ etape: e, sortie }) => (e.nature === 'media' ? [{ etapeId: e.id, profil: e.profil, sortie, unites: e.unites }] : [])),
      invariants: [...d.invariants], revueHumaine: [...d.revueHumaine], limites: [...d.limites], oracleAttendu: cas.expectedOracle,
    },
  };
}

/**
 * Plans de la campagne. `selection` (facultative) restreint aux cas voulus :
 * une campagne partielle reste lisible mais ne peut jamais approuver une
 * release (voir `verdictCampagne`).
 */
export function planCampagne(b: BenchmarkLu, selection?: readonly string[] | null): { ok: true; plans: PlanCas[] } | { ok: false; constats: ConstatBench[] } {
  const ids = new Set(b.cas.map((c) => c.id));
  const voulus = selection && selection.length ? [...new Set(selection)] : b.cas.map((c) => c.id);
  const inconnus = voulus.filter((v) => !ids.has(v));
  if (inconnus.length) return { ok: false, constats: [constatBench('CAS_INCONNU', inconnus.join(','), `Cas inconnus : ${inconnus.join(', ')}.`)] };
  const plans: PlanCas[] = [];
  const constats: ConstatBench[] = [];
  for (const c of b.cas) {
    if (!voulus.includes(c.id)) continue;
    const p = planCas(c, b.rubrique);
    if (p.ok) plans.push(p.plan); else constats.push(...p.constats);
  }
  return constats.length ? { ok: false, constats } : { ok: true, plans };
}
