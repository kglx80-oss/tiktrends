import { VARIABLE_LABEL } from '../../adsmap/iterate';
import type { TestedVariable } from '../../adsmap/types';
import { estGagnanteValidee } from '../../adsmap/verdict-libelle';
import { LIBELLE_CHOIX_VARIABLE, VARIABLES_ECRAN, type ChoixVariablesIteration } from '../studios/iterer-variable';
import { vueVariantes, type DonneesVariantes } from '../../studios/variantes/vue';
import { nettoyerContexteJarvis, type DemandeContexteJarvis } from './contexte';
import {
  lienIterationJarvis, nomPubJarvis, pubDepuisReponse, variablesConseillees,
  type CandidatIteration, type OptionsPubJarvis, type PreparationIterationJarvis,
} from './gestes';

/**
 * Spatial · Jarvis, la suite (lot 5 ter V5 · RJ G07, PC E35, PC E38).
 * RÈGLES PURES · ni base, ni réseau, ni modèle.
 *
 * Sous une réponse de Jarvis, en plus de « Créer l'itération » et « Conclure
 * le lot » (lot 5 bis, `gestes.ts`) :
 *  · « Autre variable » · quand la réponse a désigné UNE variable, la variable
 *    SUIVANTE admise pour la pub de départ (`ordreVariablesSuivantes`), en lien
 *    vers Itérer pré-rempli (`?autre=1`) · l'écran d'arrivée relit tout et
 *    rejoue la même règle · sans suite, le geste est absent et la phrase dit pourquoi ;
 *  · « Pourquoi ? » · PRÉPARE dans le champ une question sur la pub de départ ·
 *    jamais envoyée seule, le prix d'un message reste annoncé avant l'envoi ;
 *  · le panneau Jarvis d'un PROJET · « Créer l'itération » n'apparaît que si la
 *    réponse désigne SÛREMENT une variante gagnante du projet (`gesteIterationProjet`).
 * Rien n'est créé sans le clic sur l'écran d'arrivée.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TOUTES = new Set<string>([...VARIABLES_ECRAN, 'none_control']);

/** La variable que la réponse désigne · la SEULE mentionnée positivement dans un conseil, admise ou non · `null` zéro ou plusieurs. */
export function variableDesignee(texte: string): TestedVariable | null {
  const v = variablesConseillees(texte);
  return v.length === 1 ? v[0]! : null;
}

/** Ce qui a déjà été testé sur une pub · sa variable testée (colonne `tested_variable`) et ce que sa lignée a changé. */
export function dejaTesteesSurPub(variableTestee: string | null | undefined, lignee: readonly TestedVariable[] = []): TestedVariable[] {
  const t = typeof variableTestee === 'string' && TOUTES.has(variableTestee) ? [variableTestee as TestedVariable] : [];
  return [...new Set([...t, ...lignee])];
}

/**
 * L'ordre des variables à proposer APRÈS celle que la réponse désigne, pour une pub.
 *
 *  1. seules les variables ADMISES de la pub (`variablesIteration`), sauf la désignée ;
 *  2. celles jamais testées sur cette pub d'abord, puis celles déjà testées
 *     (sous le plafond de la lignée, sinon elles seraient fermées) ;
 *  3. dans chaque groupe · la variable que le PLAN conseille (`defaut`) en tête,
 *     puis l'ordre du tunnel (`VARIABLES_ECRAN`) en repartant juste après la
 *     variable désignée, en boucle.
 */
export function ordreVariablesSuivantes(c: ChoixVariablesIteration, designee: TestedVariable, dejaTestees: readonly TestedVariable[] = []): TestedVariable[] {
  const admises = c.options.filter((o) => o.admise && o.variable !== designee).map((o) => o.variable);
  // Le rang dans le tunnel, compté juste APRÈS la désignée (0 · la suivante), en boucle · le témoin (hors liste) part du début.
  const i0 = VARIABLES_ECRAN.indexOf(designee);
  const n = VARIABLES_ECRAN.length;
  const rang = (v: TestedVariable) => (v === c.defaut ? -1 : (VARIABLES_ECRAN.indexOf(v) - i0 - 1 + n) % n);
  const teste = new Set(dejaTestees);
  const tri = (l: TestedVariable[]) => [...l].sort((a, b) => rang(a) - rang(b));
  return [...tri(admises.filter((v) => !teste.has(v))), ...tri(admises.filter((v) => teste.has(v)))];
}

export const RAISON_AUTRE_SANS_SUITE = (pub: string) => `aucune autre variable n’est admise pour ${pub} · les autres sont acquises, structurelles ou déjà essayées assez de fois.`;
export const RAISON_AUTRE_SANS_PUB = 'Jarvis ne désigne aucune pub de départ sûre · la variable suivante se lit sur une pub précise.';

export type VariableSuivante =
  | { variable: TestedVariable; designee: TestedVariable }
  | { variable: null; designee: TestedVariable; raison: string };

/** La variable SUIVANTE admise pour une pub, après celle que la réponse désigne · sinon la raison. */
export function variableSuivante(c: CandidatIteration, designee: TestedVariable): VariableSuivante {
  const l = ordreVariablesSuivantes(c.variables, designee, c.dejaTestees ?? []);
  if (l.length) return { variable: l[0]!, designee };
  return { variable: null, designee, raison: c.variables.ferme && !c.variables.options.some((o) => o.admise) ? c.variables.ferme : RAISON_AUTRE_SANS_SUITE(nomPubJarvis(c)) };
}

const FIN_AUTRE = 'Rien n’est créé sans ton clic sur « Créer l’itération ».';

/**
 * Itérer ouvert par « Autre variable » · la pub de départ par la MÊME règle
 * que « Créer l'itération », la variable SUIVANTE admise à la place de celle
 * de la réponse · rien de sûr, aucun pré-choix, et l'écran le dit.
 */
export function preparationAutreVariable(texte: string, candidats: readonly CandidatIteration[], o: OptionsPubJarvis = {}): PreparationIterationJarvis {
  const p = pubDepuisReponse(texte, candidats, o);
  if (!p.candidat) return { adId: null, variable: null, note: `Préparé depuis Jarvis · ${p.phrase}. ${FIN_AUTRE}` };
  const d = variableDesignee(texte);
  if (!d) return { adId: p.candidat.adId, variable: null, note: `Préparé depuis Jarvis · ${p.phrase} · la réponse ne désigne aucune variable, il n’y a pas de suivante · rien n’est coché, choisis-la à l’étape « Ce qu’on change ». ${FIN_AUTRE}` };
  const s = variableSuivante(p.candidat, d);
  if (!s.variable) return { adId: p.candidat.adId, variable: null, note: `Préparé depuis Jarvis · ${p.phrase} · ${s.raison} Rien n’est coché. ${FIN_AUTRE}` };
  return {
    adId: p.candidat.adId, variable: s.variable,
    note: `Préparé depuis Jarvis · ${p.phrase} · Autre variable · ${LIBELLE_CHOIX_VARIABLE[s.variable]}, à la place de ${VARIABLE_LABEL[d]} que Jarvis proposait. ${FIN_AUTRE}`,
  };
}

/** La question « Pourquoi ? » sur la pub de départ · préparée dans le champ, jamais envoyée seule. */
export function questionPourquoi(pub: { variante: string }, designee: TestedVariable | null): string {
  const nom = `« ${nomPubJarvis(pub)} »`;
  return designee && designee !== 'none_control'
    ? `Pourquoi la variante ${nom} a-t-elle gagné, et pourquoi changer ${VARIABLE_LABEL[designee]} plutôt qu’une autre variable ? Appuie-toi sur ses chiffres.`
    : `Pourquoi la variante ${nom} a-t-elle gagné ? Qu’est-ce qui, dans ses chiffres, l’explique ?`;
}

export interface SuiteReponseJarvis {
  /** « Autre variable » · `null` quand la réponse ne désigne aucune variable (rien à proposer, rien d'affiché). */
  autre: { libelle: string; href: string; variable: TestedVariable } | { raison: string } | null;
  /** « Pourquoi ? » · la question préparée, ou pourquoi il n'y en a pas. */
  pourquoi: { question: string } | { raison: string };
}

export const LIBELLE_AUTRE_VARIABLE = 'Autre variable';
export const LIBELLE_POURQUOI = 'Pourquoi ?';
export const EFFET_POURQUOI = 'Prépare la question dans le champ · rien n’est envoyé sans ton clic, au prix annoncé d’un message.';
export const RAISON_POURQUOI_SANS_PUB = 'Jarvis ne désigne aucune pub de départ sûre · « Pourquoi ? » porte sur une pub précise.';

/**
 * Les gestes de la suite sous UNE réponse (son identifiant, son texte lisible) ·
 * calculés sur la liste FERMÉE des candidates du contexte (gagnantes du plan,
 * leurs variables admises et ce qui a été testé). `null` · réponse sans
 * identifiant lisible (en cours d'écriture) ou contexte qui n'a pas d'Itérer.
 */
export function suiteReponseJarvis(o: { texte: string; reponse: string; contexte: DemandeContexteJarvis; candidats: readonly CandidatIteration[]; exclus?: readonly string[] }): SuiteReponseJarvis | null {
  if (!UUID.test(o.reponse)) return null;
  const href = lienIterationJarvis(o.contexte, o.reponse, { autre: true });
  if (!href) return null;
  const p = pubDepuisReponse(o.texte, o.candidats, { exclus: o.exclus ?? [] });
  const d = variableDesignee(o.texte);
  let autre: SuiteReponseJarvis['autre'] = null;
  if (d) {
    if (!p.candidat) autre = { raison: RAISON_AUTRE_SANS_PUB };
    else {
      const s = variableSuivante(p.candidat, d);
      autre = s.variable ? { libelle: `${LIBELLE_AUTRE_VARIABLE} · ${LIBELLE_CHOIX_VARIABLE[s.variable]}`, href, variable: s.variable } : { raison: s.raison.charAt(0).toUpperCase() + s.raison.slice(1) };
    }
  }
  return { autre, pourquoi: p.candidat ? { question: questionPourquoi(p.candidat, d) } : { raison: RAISON_POURQUOI_SANS_PUB } };
}

/* ───────────────────────── le panneau Jarvis d'un projet (PC E35, E38) ───────────────────────── */

/** Une variante d'un projet et son test, ce que le geste en lit. */
export interface VarianteProjetJarvis {
  id: string;
  /** Le libellé de la variante à l'écran (« Image 1 du lot 2 ») · son nom fermé. */
  libelle: string;
  test: { adsmapAdId: string; variable: string | null; verdict: { validated: Parameters<typeof estGagnanteValidee>[0]; comparable: boolean } | null } | null;
}

/** Une candidate du panneau · une variante GAGNANTE (verdict arbitré, comparable), une fois par pub Adsmap. */
export interface CandidatProjetJarvis { adId: string; varianteId: string; libelle: string }

/** Les variantes gagnantes d'un projet · la MÊME règle que le couloir « Itération » (`noeudsIterationProjet`). */
export function candidatsIterationProjet(variantes: readonly VarianteProjetJarvis[]): CandidatProjetJarvis[] {
  const vus = new Set<string>();
  const out: CandidatProjetJarvis[] = [];
  for (const v of variantes) {
    const t = v.test;
    if (!t || !UUID.test(t.adsmapAdId) || vus.has(t.adsmapAdId) || !estGagnanteValidee(t.verdict?.validated, !!t.verdict?.comparable)) continue;
    vus.add(t.adsmapAdId);
    out.push({ adId: t.adsmapAdId.toLowerCase(), varianteId: v.id, libelle: nettoyerContexteJarvis(v.libelle, 40) });
  }
  return out;
}

/** Ce que le panneau d'un projet lit · ses gagnantes (candidates) et les noms de ses AUTRES variantes (une réponse qui en nomme une ne désigne aucune gagnante). */
export interface IterationProjetJarvis { candidats: CandidatProjetJarvis[]; autres: string[] }

/** Les candidates d'un projet, depuis ses variantes DÉJÀ lues dans la portée (`listerVariantes`) · leurs libellés d'écran (`vueVariantes`). */
export function iterationProjetDepuisVariantes(donnees: DonneesVariantes): IterationProjetJarvis {
  if (!donnees.adsmap.acces) return { candidats: [], autres: [] };
  const lues: VarianteProjetJarvis[] = vueVariantes(donnees).variantes.map((v) => {
    const t = donnees.variantes.find((x) => x.id === v.id)?.test ?? null;
    return { id: v.id, libelle: v.libelle, test: t ? { adsmapAdId: t.adsmapAdId, variable: t.variable, verdict: t.verdict ? { validated: t.verdict.validated, comparable: t.verdict.comparable } : null } : null };
  });
  const candidats = candidatsIterationProjet(lues);
  const pris = new Set(candidats.map((c) => c.varianteId));
  return { candidats, autres: lues.filter((v) => !pris.has(v.id)).map((v) => nettoyerContexteJarvis(v.libelle, 40)) };
}

/** Le projet · la seule gagnante n'est prise que si la réponse CONSEILLE un geste (son fil parle aussi du brief). */
export const OPTIONS_PUB_PROJET: OptionsPubJarvis = { seuleSiConseil: true };

export const EFFET_GESTE_PROJET = 'Ouvre l’écran Itérer, pré-rempli · rien n’est créé sans ton clic là-bas.';

/**
 * « Créer l'itération » sous une réponse du panneau d'un projet · PRÉSENT
 * seulement quand la réponse désigne SÛREMENT une variante gagnante du projet
 * (nommée seule, ou la seule gagnante et un conseil) · sinon `null`, aucun geste.
 * Le lien ne porte que des identifiants · Itérer relit la réponse dans le fil
 * LIÉ au projet, les variantes dans la portée, et borne la variable aux admises.
 */
export function gesteIterationProjet(o: { texte: string; reponse: string; projectId: string; candidats: readonly CandidatProjetJarvis[]; autres?: readonly string[] }):
  { libelle: string; href: string; varianteId: string; variante: string } | null {
  if (!UUID.test(o.reponse)) return null;
  const vides: ChoixVariablesIteration = { adId: '', ferme: null, options: [], defaut: null };
  const p = pubDepuisReponse(o.texte, o.candidats.map((c) => ({ adId: c.adId, variante: c.libelle, variables: vides })), { ...OPTIONS_PUB_PROJET, exclus: o.autres ?? [] });
  if (!p.candidat) return null;
  const href = lienIterationJarvis({ type: 'projet', id: o.projectId }, o.reponse);
  const c = o.candidats.find((x) => x.adId === p.candidat!.adId)!;
  return href ? { libelle: 'Créer l’itération', href, varianteId: c.varianteId, variante: c.libelle } : null;
}
