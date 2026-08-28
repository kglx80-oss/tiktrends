/**
 * ADSMAP · normalisation des propositions d'agents (§8.3, agents A1 à A3).
 *
 * Même discipline que pour l'analyse d'asset, et pour la même raison : les
 * valeurs proposées par un modèle finissent dans des colonnes typées et dans des
 * statistiques. `problem_agitate`, `Problem Agitate` et `agitation du problème`
 * ne doivent pas donner trois mécanismes distincts · le tableau de Jarvis ne
 * conclurait plus sur aucun.
 *
 * Deux différences avec A0, qui viennent de ce que ces agents PROPOSENT là où A0
 * décrit :
 *
 *  - un mécanisme inconnu ne devient pas `null` mais fait REJETER l'angle. Un
 *    angle sans mécanisme n'est pas une proposition incomplète, c'est une phrase
 *    sans contenu testable · la colonne est obligatoire en base.
 *  - les doublons sont écartés ici. Un agent relancé deux fois sur la même marque
 *    propose les mêmes désirs · sans dédoublonnage, la carte se remplit de
 *    jumeaux et les branches mortes deviennent illisibles.
 */

export const AWARENESS = ['unaware', 'problem_aware', 'solution_aware', 'product_aware', 'most_aware'] as const;
export type Awareness = (typeof AWARENESS)[number];

export const DESIRE_TYPES = ['gain', 'pain_relief', 'status', 'control', 'belonging', 'safety'] as const;
export type DesireType = (typeof DESIRE_TYPES)[number];

export const MECHANISMS = [
  'problem_agitate', 'demo', 'social_proof', 'comparison', 'story', 'curiosity', 'authority',
  'scarcity', 'reverse', 'statistic_shock', 'diagnostic', 'us_vs_them', 'listicle',
] as const;
export type Mechanism = (typeof MECHANISMS)[number];

export const MECHANISM_LABEL: Record<Mechanism, string> = {
  problem_agitate: 'Problème agité', demo: 'Démonstration', social_proof: 'Preuve sociale',
  comparison: 'Comparaison', story: 'Récit', curiosity: 'Curiosité', authority: 'Autorité',
  scarcity: 'Rareté', reverse: 'Contre-pied', statistic_shock: 'Chiffre choc',
  diagnostic: 'Diagnostic', us_vs_them: 'Nous contre eux', listicle: 'Liste',
};

export const AWARENESS_LABEL: Record<Awareness, string> = {
  unaware: 'Inconscient du problème', problem_aware: 'Conscient du problème',
  solution_aware: 'Conscient des solutions', product_aware: 'Connaît le produit',
  most_aware: 'Prêt à acheter',
};

export const DESIRE_LABEL: Record<DesireType, string> = {
  gain: 'Gain', pain_relief: 'Soulagement', status: 'Statut',
  control: 'Contrôle', belonging: 'Appartenance', safety: 'Sécurité',
};

/** Synonymes que les modèles produisent réellement, en français comme en anglais. */
const ALIASES: Record<string, string> = {
  // Mécanismes
  problem_agitation: 'problem_agitate', pas: 'problem_agitate', agitation: 'problem_agitate',
  problem_solution: 'problem_agitate', pain_agitate: 'problem_agitate',
  demonstration: 'demo', product_demo: 'demo', how_it_works: 'demo',
  testimonial: 'social_proof', reviews: 'social_proof', ugc_proof: 'social_proof', preuve_sociale: 'social_proof',
  versus: 'comparison', before_after: 'comparison', vs: 'comparison',
  storytelling: 'story', narrative: 'story', founder_story: 'story',
  teaser: 'curiosity', mystery: 'curiosity', open_loop: 'curiosity',
  expert: 'authority', doctor: 'authority', science: 'authority',
  urgency: 'scarcity', limited: 'scarcity', fomo: 'scarcity',
  contrarian: 'reverse', myth_busting: 'reverse', unpopular_opinion: 'reverse',
  statistic: 'statistic_shock', shock_stat: 'statistic_shock', number_shock: 'statistic_shock',
  quiz: 'diagnostic', assessment: 'diagnostic', symptom: 'diagnostic',
  enemy: 'us_vs_them', against: 'us_vs_them',
  list: 'listicle', top_n: 'listicle', reasons_why: 'listicle',
  // Conscience
  problem_unaware: 'unaware', inconscient: 'unaware',
  aware_of_problem: 'problem_aware',
  aware_of_solution: 'solution_aware', solution: 'solution_aware',
  product: 'product_aware', brand_aware: 'product_aware',
  ready: 'most_aware', hot: 'most_aware',
  // Désirs
  benefit: 'gain', achievement: 'gain', performance: 'gain',
  relief: 'pain_relief', pain: 'pain_relief', comfort: 'pain_relief',
  prestige: 'status', recognition: 'status', image: 'status',
  mastery: 'control', autonomy: 'control', simplicity: 'control',
  community: 'belonging', connection: 'belonging',
  security: 'safety', trust: 'safety', reassurance: 'safety',
};

const clef = (v: string) => v.trim().toLowerCase().replace(/[\s-]+/g, '_');

function normalize<T extends string>(value: string | null | undefined, allowed: readonly T[]): T | null {
  if (!value) return null;
  const k = clef(value);
  if ((allowed as readonly string[]).includes(k)) return k as T;
  const alias = ALIASES[k];
  return alias && (allowed as readonly string[]).includes(alias) ? (alias as T) : null;
}

export const normalizeMechanism = (v: string | null | undefined) => normalize(v, MECHANISMS);
export const normalizeAwareness = (v: string | null | undefined) => normalize(v, AWARENESS);
export const normalizeDesireType = (v: string | null | undefined) => normalize(v, DESIRE_TYPES);

/* -------------------------------------------------------------------------- */
/*  Dédoublonnage                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Empreinte d'un libellé, pour repérer deux formulations du même nœud.
 *
 * Volontairement grossière : accents, ponctuation et mots vides retirés, mots
 * triés. « Dormir mieux sans somnifère » et « mieux dormir, sans somnifères »
 * donnent la même empreinte · c'est le résultat voulu, ce sont bien deux
 * écritures du même désir.
 */
const VIDES = new Set(['le', 'la', 'les', 'de', 'du', 'des', 'un', 'une', 'et', 'ou', 'a', 'au', 'aux', 'en', 'pour', 'sans', 'avec', 'plus', 'mon', 'ma', 'mes', 'son', 'sa', 'ses']);

export function labelFingerprint(label: string): string {
  return label
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/).filter((w) => w.length > 2 && !VIDES.has(w))
    .map((w) => w.replace(/s$/, ''))     // pluriel naïf · suffisant pour du français courant
    .sort()
    .join(' ');
}

/**
 * Écarte les propositions qui redisent ce qui existe déjà, ou qui se répètent
 * entre elles.
 *
 * Renvoie ce qui est retenu ET ce qui est écarté : afficher « 3 propositions,
 * 2 écartées car déjà présentes » vaut mieux que d'en montrer 3 dont 2 sont des
 * jumeaux · l'utilisateur croirait l'agent plus productif qu'il ne l'est.
 */
export function dedupeByLabel<T>(
  items: T[],
  label: (item: T) => string,
  existing: readonly string[] = [],
): { kept: T[]; duplicates: T[] } {
  const vus = new Set(existing.map(labelFingerprint).filter(Boolean));
  const kept: T[] = [];
  const duplicates: T[] = [];
  for (const it of items) {
    const fp = labelFingerprint(label(it));
    if (!fp || vus.has(fp)) { duplicates.push(it); continue; }
    vus.add(fp);
    kept.push(it);
  }
  return { kept, duplicates };
}

/* -------------------------------------------------------------------------- */
/*  Nettoyage des propositions                                                */
/* -------------------------------------------------------------------------- */

const texte = (v: unknown, max: number): string =>
  typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '';

const liste = (v: unknown, max: number, len = 160): string[] =>
  Array.isArray(v) ? v.map((x) => texte(x, len)).filter(Boolean).slice(0, max) : [];

export interface RawPersona { name?: string; description?: string; pains?: string[]; desires?: string[]; objections?: string[] }
export interface CleanPersona { name: string; description: string; pains: string[]; desires: string[]; objections: string[] }

export function cleanPersonas(raw: RawPersona[]): CleanPersona[] {
  return raw
    .map((p) => ({
      name: texte(p.name, 80),
      description: texte(p.description, 600),
      pains: liste(p.pains, 6),
      desires: liste(p.desires, 6),
      objections: liste(p.objections, 6),
    }))
    // Un avatar sans nom n'est pas affichable, et sans douleur ni désir il ne
    // sert à rien : c'est une fiche vide qui encombrerait la carte.
    .filter((p) => p.name && (p.pains.length || p.desires.length));
}

export interface RawDesire { label?: string; type?: string; awareness?: string; rationale?: string }
export interface CleanDesire { label: string; type: DesireType | null; awareness: Awareness | null; rationale: string }

export function cleanDesires(raw: RawDesire[]): CleanDesire[] {
  return raw
    .map((d) => ({
      label: texte(d.label, 160),
      type: normalizeDesireType(d.type),
      awareness: normalizeAwareness(d.awareness),
      rationale: texte(d.rationale, 400),
    }))
    .filter((d) => d.label.length >= 4);
}

export interface RawAngle { label?: string; mechanism?: string; promise?: string; proof?: string }
export interface CleanAngle { label: string; mechanism: Mechanism; promise: string; proof: string }

/**
 * Un angle sans mécanisme reconnu est REJETÉ, pas complété.
 *
 * Le mécanisme est ce qui rend un angle comparable à un autre · c'est la
 * dimension sur laquelle Jarvis apprend. Un angle qui n'en porte pas n'est pas
 * une proposition incomplète, c'est une phrase sans contenu testable.
 */
export function cleanAngles(raw: RawAngle[]): { kept: CleanAngle[]; rejected: string[] } {
  const kept: CleanAngle[] = [];
  const rejected: string[] = [];
  for (const a of raw) {
    const label = texte(a.label, 160);
    const mechanism = normalizeMechanism(a.mechanism);
    if (!label || label.length < 4) continue;
    if (!mechanism) { rejected.push(label); continue; }
    kept.push({ label, mechanism, promise: texte(a.promise, 400), proof: texte(a.proof, 400) });
  }
  return { kept, rejected };
}

export interface RawConcept { title?: string; callout?: string; valueBlock?: string; cta?: string; hookOptions?: string[] }
export interface CleanConcept { title: string; callout: string; valueBlock: string; cta: string; hookOptions: string[] }

export function cleanConcepts(raw: RawConcept[]): CleanConcept[] {
  return raw
    .map((c) => ({
      title: texte(c.title, 160),
      callout: texte(c.callout, 200),
      valueBlock: texte(c.valueBlock, 900),
      cta: texte(c.cta, 80),
      hookOptions: liste(c.hookOptions, 5, 200),
    }))
    // Un concept sans accroche possible n'est pas produisible · c'est un titre.
    .filter((c) => c.title.length >= 4 && (c.hookOptions.length > 0 || c.valueBlock.length > 0));
}
