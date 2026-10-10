/**
 * Studios · L4-C · rattacher une variante au TEST (plan 06 §3 `linkVariantToTest`,
 * cahier 01 §4.8).
 *
 * Pur. Le test n'est pas un objet nouveau : c'est une ad Adsmap (`adsmap_ads`,
 * hypothèse, variable, offre, page), relue ou créée en `draft` par le serveur,
 * et reliée à la variante par `studio_test_links` (une ad = une variante, en
 * base). Ce module décide :
 *
 *  · la SAISIE (hypothèse, variable, objectif, protocole, période, métrique,
 *    offre et destination quand il le faut) ;
 *  · l'UNICITÉ selon le domaine (une ad teste une seule variante ; une variante
 *    n'a qu'un test ouvert à la fois ; un double clic rend le même lien) ;
 *  · l'ISOLATION : un test ne prétend pas isoler une variable si plusieurs
 *    champs créatifs ont changé entre la version parente et la version enfant ;
 *  · le REGISTRE du projet (`studio_projects.test_refs`) où vivent les champs
 *    que l'ad Adsmap n'a pas (objectif, période, métrique, isolation) et la
 *    filiation des itérations.
 */

import type { CodeErreurStudio } from '../erreurs';
import { jsonCanonique } from '../version';
import type { TestedVariable } from '../../adsmap/types';
import { VARIABLE_LABEL } from '../../adsmap/iterate';

/* ─────────────────────────────── Vocabulaire ─────────────────────────────── */

/** Les variables Adsmap (miroir de `adsmap_tested_variable`), dans l'ordre du tunnel. */
export const VARIABLES_TEST: readonly TestedVariable[] = [
  'hook', 'opening_visual', 'format', 'body', 'length', 'audio', 'avatar_on_screen', 'proof', 'cta', 'offer', 'landing', 'angle', 'desire', 'none_control',
];

export function libelleVariable(v: string | null | undefined): string {
  return v && (VARIABLES_TEST as readonly string[]).includes(v) ? VARIABLE_LABEL[v as TestedVariable] : (v ?? 'non précisée');
}

/** Métriques que le moteur de verdict Adsmap sait lire (KPI primaire et indicateurs avancés). */
export const METRIQUES_TEST = ['cpa', 'roas', 'cpc', 'ctr', 'hook_rate', 'hold_rate'] as const;
export type MetriqueTest = (typeof METRIQUES_TEST)[number];
export const LIBELLE_METRIQUE: Record<MetriqueTest, string> = {
  cpa: 'Coût par achat (CPA)', roas: 'Retour sur dépense (ROAS)', cpc: 'Coût par clic (CPC)',
  ctr: 'Taux de clic (CTR)', hook_rate: 'Taux d’accroche (3 s)', hold_rate: 'Taux de rétention',
};

/** Structures de protocole Adsmap (miroir de `adsmap_protocol_structure`). */
export const PROTOCOLES_TEST = ['abo_one_adset_per_ad', 'abo_single_adset', 'cbo_tolerated'] as const;
export type ProtocoleTest = (typeof PROTOCOLES_TEST)[number];
export const LIBELLE_PROTOCOLE: Record<ProtocoleTest, string> = {
  abo_one_adset_per_ad: 'ABO · un ensemble par pub (comparable)',
  abo_single_adset: 'ABO · un seul ensemble',
  cbo_tolerated: 'CBO toléré (comparaison relative seulement)',
};

/** Durée maximale d'une période de test · au-delà, ce n'est plus un test mais un suivi. */
export const PERIODE_MAX_JOURS = 90;

/* ──────────────────────────────── Saisie ─────────────────────────────────── */

export interface SaisieTest {
  hypothese: string;
  variable: TestedVariable;
  valeurVariable: string | null;
  objectif: string;
  protocole: ProtocoleTest;
  periode: { debut: string; fin: string };
  metrique: MetriqueTest;
  offreId: string | null;
  pageId: string | null;
  /** Fiche Adsmap EXISTANTE à reprendre · sinon le serveur en crée une en `draft`. */
  adsmapAdId: string | null;
}

export interface ViolationSaisie { chemin: string; raison: string }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

function dateValide(x: unknown): string | null {
  if (typeof x !== 'string') return null;
  const m = DATE.exec(x.trim());
  if (!m) return null;
  const d = new Date(`${m[0]}T00:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== m[0] ? null : m[0];
}

const chaine = (x: unknown): string => (typeof x === 'string' ? x.trim() : '');
const idOptionnel = (x: unknown): string | null | false => {
  const s = chaine(x);
  if (!s) return null;
  return UUID.test(s) ? s : false;
};

/**
 * Valide la saisie du formulaire. Avec une variante parente, la variable ne peut
 * pas être « rien (témoin) » : une itération change exactement une variable
 * (règle Adsmap `checkIteration`).
 */
export function validerSaisieTest(x: unknown, o: { aUnParent: boolean }): { ok: true; saisie: SaisieTest } | { ok: false; violations: ViolationSaisie[] } {
  const e = (typeof x === 'object' && x !== null ? x : {}) as Record<string, unknown>;
  const v: ViolationSaisie[] = [];
  const hypothese = chaine(e.hypothese);
  if (hypothese.length < 10 || hypothese.length > 2000) v.push({ chemin: 'hypothese', raison: 'Écris l’hypothèse en une phrase (10 à 2 000 caractères) : quel effet, sur quelle métrique.' });
  const variable = chaine(e.variable) as TestedVariable;
  if (!(VARIABLES_TEST as readonly string[]).includes(variable)) v.push({ chemin: 'variable', raison: 'Choisis la variable testée.' });
  else if (o.aUnParent && variable === 'none_control') v.push({ chemin: 'variable', raison: 'Face à sa variante parente, un test change exactement une variable · « rien (témoin) » n’est pas possible ici.' });
  const valeur = chaine(e.valeurVariable);
  if (valeur.length > 500) v.push({ chemin: 'valeurVariable', raison: '500 caractères au plus.' });
  const objectif = chaine(e.objectif);
  if (objectif.length < 3 || objectif.length > 500) v.push({ chemin: 'objectif', raison: 'Indique l’objectif du test (3 à 500 caractères).' });
  const protocole = chaine(e.protocole) as ProtocoleTest;
  if (!(PROTOCOLES_TEST as readonly string[]).includes(protocole)) v.push({ chemin: 'protocole', raison: 'Choisis le protocole de diffusion.' });
  const metrique = chaine(e.metrique) as MetriqueTest;
  if (!(METRIQUES_TEST as readonly string[]).includes(metrique)) v.push({ chemin: 'metrique', raison: 'Choisis la métrique qui tranchera.' });
  const debut = dateValide(e.periodeDebut);
  const fin = dateValide(e.periodeFin);
  if (!debut) v.push({ chemin: 'periodeDebut', raison: 'Date de début attendue (AAAA-MM-JJ).' });
  if (!fin) v.push({ chemin: 'periodeFin', raison: 'Date de fin attendue (AAAA-MM-JJ).' });
  if (debut && fin) {
    const jours = (Date.parse(fin) - Date.parse(debut)) / 86_400_000;
    if (jours < 1) v.push({ chemin: 'periodeFin', raison: 'La fin doit suivre le début d’au moins un jour.' });
    else if (jours > PERIODE_MAX_JOURS) v.push({ chemin: 'periodeFin', raison: `Une période de test dure ${PERIODE_MAX_JOURS} jours au plus.` });
  }
  const offreId = idOptionnel(e.offreId);
  if (offreId === false) v.push({ chemin: 'offreId', raison: 'Offre inconnue.' });
  const pageId = idOptionnel(e.pageId);
  if (pageId === false) v.push({ chemin: 'pageId', raison: 'Page de destination inconnue.' });
  const adsmapAdId = idOptionnel(e.adsmapAdId);
  if (adsmapAdId === false) v.push({ chemin: 'adsmapAdId', raison: 'Fiche Adsmap inconnue.' });
  if (variable === 'offer' && !offreId) v.push({ chemin: 'offreId', raison: 'Tu testes l’offre · choisis l’offre testée.' });
  if (variable === 'landing' && !pageId) v.push({ chemin: 'pageId', raison: 'Tu testes la page · choisis la page de destination testée.' });
  if (v.length) return { ok: false, violations: v };
  return {
    ok: true,
    saisie: {
      hypothese, variable, valeurVariable: valeur || null, objectif, protocole, metrique,
      periode: { debut: debut!, fin: fin! },
      offreId: offreId || null, pageId: pageId || null, adsmapAdId: adsmapAdId || null,
    },
  };
}

/* ─────────────────────────────── Unicité ─────────────────────────────────── */

export interface LienExistant { linkId: string; variantId: string; adsmapAdId: string; adStatus: string }

export type DecisionRattachement =
  | { action: 'existant'; lien: LienExistant }
  | { action: 'creer' }
  | { action: 'refus'; code: CodeErreurStudio; message: string };

/** Une ad `done` a fini son test · la variante peut en ouvrir un nouveau. */
export const STATUTS_AD_CLOS: readonly string[] = ['done'];

/**
 * Unicité selon le domaine :
 *  · une fiche Adsmap teste UNE variante (aussi garanti en base, `studio_test_links_ad_uq`) ;
 *  · une variante n'a qu'UN test ouvert à la fois ;
 *  · redemander le même rattachement rend le lien existant (double clic, reconnexion).
 */
export function decisionRattachement(
  demande: { variantId: string; adsmapAdId: string | null },
  liensDeLaVariante: ReadonlyArray<LienExistant>,
  lienDeLAdCible: LienExistant | null,
): DecisionRattachement {
  if (demande.adsmapAdId && lienDeLAdCible) {
    if (lienDeLAdCible.variantId === demande.variantId) return { action: 'existant', lien: lienDeLAdCible };
    return { action: 'refus', code: 'INVARIANT_CONFLICT', message: 'Cette fiche Adsmap teste déjà une autre variante · une fiche ne mesure qu’une seule variante.' };
  }
  const ouvert = liensDeLaVariante.find((l) => l.variantId === demande.variantId && !STATUTS_AD_CLOS.includes(l.adStatus));
  if (ouvert) {
    if (!demande.adsmapAdId || ouvert.adsmapAdId === demande.adsmapAdId) return { action: 'existant', lien: ouvert };
    return { action: 'refus', code: 'INVARIANT_CONFLICT', message: 'Cette variante est déjà en test sur une autre fiche Adsmap · clos ce test avant d’en ouvrir un autre.' };
  }
  return { action: 'creer' };
}

/* ─────────────────────────────── Isolation ───────────────────────────────── */

/** Champs créatifs comparés · ceux du brief, puis les parties créatives du contenu de version. */
export const CHAMPS_CREATIFS_BRIEF = ['composition', 'styleIntent', 'texts', 'formats', 'references', 'audience', 'exclusions'] as const;
export const CHAMPS_CREATIFS_CONTENU = ['productRef', 'styleRef', 'characterRefs', 'shots', 'document', 'timeline'] as const;

const LIBELLE_CHAMP: Record<string, string> = {
  'brief.composition': 'la composition', 'brief.styleIntent': 'le style', 'brief.texts': 'les textes', 'brief.formats': 'les formats',
  'brief.references': 'les références', 'brief.audience': 'l’audience', 'brief.exclusions': 'les exclusions',
  productRef: 'le produit', styleRef: 'la recette de style', characterRefs: 'les personnages', shots: 'les plans',
  document: 'les calques', timeline: 'le montage',
};
export const libelleChamp = (c: string): string => LIBELLE_CHAMP[c] ?? c;

export type StatutIsolation = 'isole' | 'plusieurs' | 'aucun' | 'sans_parent';

export interface Isolation {
  statut: StatutIsolation;
  /** Champs créatifs qui diffèrent entre la version parente et la version enfant. */
  champs: string[];
  /** Le test PRÉTEND-il isoler la variable déclarée ? Vrai seulement si un seul champ a bougé. */
  pretendIsoler: boolean;
  phrase: string;
}

const objet = (x: unknown): Record<string, unknown> => (typeof x === 'object' && x !== null && !Array.isArray(x) ? x as Record<string, unknown> : {});
const egal = (a: unknown, b: unknown) => jsonCanonique(a ?? null) === jsonCanonique(b ?? null);

/** Champs créatifs qui diffèrent entre deux contenus de version. */
export function champsCreatifsModifies(parent: unknown, enfant: unknown): string[] {
  const p = objet(parent);
  const e = objet(enfant);
  const bp = objet(p.brief);
  const be = objet(e.brief);
  const out: string[] = [];
  for (const k of CHAMPS_CREATIFS_BRIEF) if (!egal(bp[k], be[k])) out.push(`brief.${k}`);
  for (const k of CHAMPS_CREATIFS_CONTENU) if (!egal(p[k], e[k])) out.push(k);
  return out;
}

/**
 * Le test prétend-il isoler la variable ? Seulement si UN champ créatif a
 * changé entre la version de la variante parente et celle de l'enfant. Sinon
 * il reste un test, mais son résultat ne s'attribue pas à la variable seule.
 */
export function isolationVariable(contenuParent: unknown | null, contenuEnfant: unknown, variable: string): Isolation {
  const nom = libelleVariable(variable);
  if (contenuParent === null) {
    return { statut: 'sans_parent', champs: [], pretendIsoler: false, phrase: 'Premier test de cette lignée · comparé aux repères de la marque, pas à une variante parente.' };
  }
  const champs = champsCreatifsModifies(contenuParent, contenuEnfant);
  if (champs.length === 0) {
    return { statut: 'aucun', champs, pretendIsoler: false, phrase: `Aucun champ créatif n’a changé depuis la parente · un écart viendrait du tirage, pas de ${nom}.` };
  }
  if (champs.length > 1) {
    return { statut: 'plusieurs', champs, pretendIsoler: false, phrase: `${champs.length} champs ont changé (${champs.map(libelleChamp).join(', ')}) · ce test ne peut pas attribuer son résultat à ${nom} seule.` };
  }
  return { statut: 'isole', champs, pretendIsoler: true, phrase: `Un seul champ a changé (${libelleChamp(champs[0]!)}) · le test isole ${nom}.` };
}

/* ──────────────────────── Registre du projet (test_refs) ─────────────────── */

export interface EntreeRegistreTest {
  type: 'test';
  linkId: string;
  variantId: string;
  adsmapAdId: string;
  hypothese: string;
  variable: TestedVariable;
  valeurVariable: string | null;
  objectif: string;
  protocole: ProtocoleTest;
  periode: { debut: string; fin: string };
  metrique: MetriqueTest;
  isolation: { statut: StatutIsolation; champs: string[] };
  creeLe: string;
  creePar: string;
}

export interface EntreeRegistreIteration {
  type: 'iteration';
  /** Version enfant créée par l'itération. */
  versionId: string;
  /** Version de la variante dont on repart (la branche réelle). */
  depuisVersionId: string;
  parentVariantId: string;
  linkId: string | null;
  variable: TestedVariable;
  variableGardee: boolean;
  sourceIds: string[];
  creeLe: string;
  creePar: string;
}

export interface Registre {
  tests: EntreeRegistreTest[];
  iterations: EntreeRegistreIteration[];
  /** Entrées d'une autre forme · conservées telles quelles, jamais réécrites. */
  autres: unknown[];
}

/** Lecture défensive · une entrée qui n'a pas la forme écrite par ce module est conservée, pas interprétée. */
export function lireRegistre(x: unknown): Registre {
  const r: Registre = { tests: [], iterations: [], autres: [] };
  if (!Array.isArray(x)) return r;
  for (const e of x) {
    const o = objet(e);
    if (o.type === 'test' && typeof o.linkId === 'string' && typeof o.variantId === 'string' && typeof o.adsmapAdId === 'string') r.tests.push(o as unknown as EntreeRegistreTest);
    else if (o.type === 'iteration' && typeof o.versionId === 'string' && typeof o.parentVariantId === 'string') r.iterations.push(o as unknown as EntreeRegistreIteration);
    else r.autres.push(e);
  }
  return r;
}

/** Ajoute une entrée en conservant TOUT le reste, dans l'ordre. */
export function ajouterAuRegistre(x: unknown, e: EntreeRegistreTest | EntreeRegistreIteration): unknown[] {
  return [...(Array.isArray(x) ? x : []), e];
}

/** Parente par défaut d'une variante · celle dont l'itération a créé la version de son lot. */
export function parentParIteration(r: Registre, versionId: string): string | null {
  const it = [...r.iterations].reverse().find((i) => i.versionId === versionId);
  return it?.parentVariantId ?? null;
}

/** Entrée de test d'un lien · la plus récente. */
export function testDuLien(r: Registre, linkId: string): EntreeRegistreTest | null {
  return [...r.tests].reverse().find((t) => t.linkId === linkId) ?? null;
}
