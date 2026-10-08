/**
 * Studios · L4 · hypothèses de test (cahier 01 §4.2 point 4, contrat
 * `test_hypothesize_output` de 03-CONTRATS).
 *
 * Pur · ni base, ni réseau, ni modèle.
 *
 * Au plus TROIS hypothèses, chacune à CHANGEMENT ISOLÉ : une variable, un
 * témoin, un traitement, des invariants, une métrique disponible et une règle
 * de décision. L'utilisateur choisit une proposition ou rédige la sienne ;
 * dans les deux cas l'hypothèse retenue passe par la même validation.
 *
 * Une variable qui en combine plusieurs (« accroche et visuel ») n'est pas
 * refusée : elle est marquée EXPLORATOIRE (non causale), comme le demande la
 * consigne du gabarit `test.hypothesize`.
 */

export const MAX_HYPOTHESES = 3;
const TEXTE_MAX = 2000;

export interface HypotheseTest {
  id: string;
  statement: string;
  sourceIds: string[];
  variable: string;
  control: string;
  treatment: string;
  invariants: string[];
  metric: string;
  decisionRule: string;
  limitations: string[];
}

export type OrigineHypothese = 'proposee' | 'saisie';

/**
 * Métriques qu'un test publicitaire peut réellement lire (Adsmap, régies) ·
 * passées au gabarit comme `availableMetrics` : une hypothèse qui en cite une
 * autre est rejetée par le registre (`METRIQUE_INDISPONIBLE`).
 */
export const METRIQUES_TEST: readonly string[] = [
  'Taux de clic (CTR)',
  'Coût par clic (CPC)',
  'Taux de conversion',
  'Coût par achat (CPA)',
  'Retour sur dépense publicitaire (ROAS)',
];
export const METRIQUE_ACCROCHE_VIDEO = 'Taux d’accroche vidéo (3 secondes)';

export function metriquesDisponibles(video: boolean): string[] {
  return video ? [...METRIQUES_TEST, METRIQUE_ACCROCHE_VIDEO] : [...METRIQUES_TEST];
}

/** Identifiants alloués aux propositions · le modèle ne les invente pas. */
export function idsHypothesesAlloues(): string[] {
  return Array.from({ length: MAX_HYPOTHESES }, (_, i) => `hyp_${i + 1}`);
}
export const ID_HYPOTHESE_SAISIE = 'hyp_saisie';

/**
 * Le changement est-il isolé ? Une seule variable nommée · pas de liste, pas de
 * conjonction. Heuristique de FORME, pas de sens : elle sert à étiqueter
 * « exploratoire », jamais à refuser.
 */
const COMBINAISON = /(\+|;|&|\s\/\s|\bet\b|\band\b)/i;
export function changementIsole(variable: string): boolean {
  const v = variable.trim();
  return v.length > 0 && !COMBINAISON.test(v);
}

export interface ViolationHypothese { chemin: string; raison: string }

const estTexte = (x: unknown, max = TEXTE_MAX): x is string => typeof x === 'string' && x.length <= max;
const estListeTextes = (x: unknown): x is string[] => Array.isArray(x) && x.length <= 100 && x.every((t) => estTexte(t));

/** Valide UNE hypothèse · forme du contrat + cohérence (témoin ≠ traitement, sources fournies). */
export function validerHypothese(x: unknown, sourcesAutorisees: readonly string[], chemin = '/hypothese'): ViolationHypothese[] {
  const v: ViolationHypothese[] = [];
  if (typeof x !== 'object' || x === null || Array.isArray(x)) return [{ chemin, raison: 'hypothèse attendue' }];
  const h = x as Record<string, unknown>;
  const permis = ['id', 'statement', 'sourceIds', 'variable', 'control', 'treatment', 'invariants', 'metric', 'decisionRule', 'limitations'];
  for (const k of Object.keys(h)) if (!permis.includes(k)) v.push({ chemin: `${chemin}/${k}`, raison: 'champ inconnu' });
  if (typeof h.id !== 'string' || !/^[A-Za-z][A-Za-z0-9_.:-]{0,159}$/.test(h.id)) v.push({ chemin: `${chemin}/id`, raison: 'identifiant stable attendu' });
  for (const k of ['statement', 'variable', 'control', 'treatment', 'metric', 'decisionRule'] as const) {
    if (!estTexte(h[k])) v.push({ chemin: `${chemin}/${k}`, raison: `texte attendu (${TEXTE_MAX} caractères au plus)` });
  }
  if (estTexte(h.statement) && !h.statement.trim()) v.push({ chemin: `${chemin}/statement`, raison: 'énoncé de l’hypothèse requis' });
  if (estTexte(h.variable) && !h.variable.trim()) v.push({ chemin: `${chemin}/variable`, raison: 'variable testée requise' });
  if (estTexte(h.control) && estTexte(h.treatment) && h.control.trim() && h.control.trim() === h.treatment.trim()) {
    v.push({ chemin: `${chemin}/treatment`, raison: 'le traitement doit différer du témoin' });
  }
  for (const k of ['invariants', 'limitations'] as const) if (!estListeTextes(h[k])) v.push({ chemin: `${chemin}/${k}`, raison: 'liste de textes attendue' });
  if (!Array.isArray(h.sourceIds) || !h.sourceIds.every((s) => typeof s === 'string')) v.push({ chemin: `${chemin}/sourceIds`, raison: 'liste de sources attendue' });
  else {
    const permises = new Set(sourcesAutorisees);
    h.sourceIds.forEach((s, i) => { if (!permises.has(s as string)) v.push({ chemin: `${chemin}/sourceIds/${i}`, raison: 'source hors de la sélection' }); });
  }
  return v;
}

export interface HypotheseQualifiee extends HypotheseTest {
  /** Faux = test exploratoire, non causal (plusieurs variables changent). */
  isolee: boolean;
}

/** Valide une LISTE de propositions · au plus trois, identifiants uniques. */
export function validerHypotheses(liste: unknown, sourcesAutorisees: readonly string[]): { ok: true; hypotheses: HypotheseQualifiee[] } | { ok: false; violations: ViolationHypothese[] } {
  if (!Array.isArray(liste)) return { ok: false, violations: [{ chemin: '/hypotheses', raison: 'liste attendue' }] };
  const violations: ViolationHypothese[] = [];
  if (liste.length > MAX_HYPOTHESES) violations.push({ chemin: '/hypotheses', raison: `${MAX_HYPOTHESES} hypothèses au plus` });
  const vus = new Set<string>();
  liste.forEach((h, i) => {
    violations.push(...validerHypothese(h, sourcesAutorisees, `/hypotheses/${i}`));
    const id = (h as { id?: unknown })?.id;
    if (typeof id === 'string') {
      if (vus.has(id)) violations.push({ chemin: `/hypotheses/${i}/id`, raison: 'identifiant en double' });
      vus.add(id);
    }
  });
  if (violations.length) return { ok: false, violations };
  return { ok: true, hypotheses: (liste as HypotheseTest[]).map((h) => ({ ...h, isolee: changementIsole(h.variable) })) };
}

export interface SaisieHypothese {
  statement: unknown;
  variable: unknown;
  control?: unknown;
  treatment?: unknown;
  metric?: unknown;
  decisionRule?: unknown;
  invariants?: unknown;
}

const t = (x: unknown, max = TEXTE_MAX) => (typeof x === 'string' ? x.replace(/\s+/g, ' ').trim().slice(0, max) : '');

/**
 * L'hypothèse RÉDIGÉE par l'utilisateur · même forme que les propositions,
 * identifiant fixe, sources = la sélection. Les champs non remplis restent
 * vides (la complétude les signale), jamais inventés.
 */
export function hypotheseSaisie(s: SaisieHypothese, sourceIds: readonly string[]): HypotheseTest {
  const invariants = Array.isArray(s.invariants) ? s.invariants.map((x) => t(x, 500)).filter(Boolean).slice(0, 20) : [];
  return {
    id: ID_HYPOTHESE_SAISIE,
    statement: t(s.statement),
    sourceIds: [...sourceIds],
    variable: t(s.variable, 300),
    control: t(s.control),
    treatment: t(s.treatment),
    invariants,
    metric: t(s.metric, 200),
    decisionRule: t(s.decisionRule),
    limitations: [],
  };
}

/** Ce que la saisie manuelle exige au minimum pour créer un projet. */
export function saisieSuffisante(h: HypotheseTest): boolean {
  return h.statement.length > 0 && h.variable.length > 0;
}

/**
 * Plafond de coût d'UNE demande de propositions, annoncé AVANT le clic.
 *
 * Recopie des bornes du résolveur (`lib/studios/prompts/resolveur.ts` :
 * budget de contexte 24 000 jetons, sortie 4 000) · le pire cas, au tarif du
 * modèle routé. C'est un plafond (la barrière de dépense refuse au-delà), pas
 * le prix réel, qui est journalisé après coup.
 */
export const JETONS_ENTREE_MAX_PROPOSITION = 24_000;
export const JETONS_SORTIE_MAX_PROPOSITION = 4_000;
export function plafondPropositionUsd(tarif: { inputPerMTok: number; outputPerMTok: number }): number {
  const usd = (JETONS_ENTREE_MAX_PROPOSITION * tarif.inputPerMTok + JETONS_SORTIE_MAX_PROPOSITION * tarif.outputPerMTok) / 1_000_000;
  return Math.ceil(usd * 100) / 100;
}
