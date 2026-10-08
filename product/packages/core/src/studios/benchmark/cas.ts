/**
 * Benchmark Studios F01-F24 · lecture et validation de `09-BENCHMARK.json`.
 *
 * La rubrique est FIGÉE : la recette a refusé tout assouplissement. Le
 * lecteur compare chaque seuil à la référence ci-dessous et refuse un fichier
 * qui la modifie, dans un sens comme dans l'autre (un seuil changé doit
 * passer par une décision écrite, pas par une édition silencieuse du JSON).
 *
 * Pur : reçoit l'objet ou le texte, ne lit pas le disque.
 */

export interface ConstatBench {
  code: string;
  cible: string;
  message: string;
}

export const constatBench = (code: string, cible: string, message: string): ConstatBench => ({ code, cible, message });

export const DIMENSIONS_RUBRIQUE = ['fidélité produit', 'respect brief', 'cohérence', 'texte', 'qualité technique'] as const;
export type DimensionRubrique = (typeof DIMENSIONS_RUBRIQUE)[number];

/** La rubrique de référence · copie exacte de `qualityRubric`, hors `scope` (texte). */
export const RUBRIQUE_REFERENCE = {
  dimensions: DIMENSIONS_RUBRIQUE,
  pointsEach: [0, 1, 2] as const,
  minimumMean: 8,
  criticalAcceptedAllowed: 0,
  stochasticOutputsPerCase: 2,
  deterministicInvariantPassRate: 1,
} as const;

export type Rubrique = typeof RUBRIQUE_REFERENCE;

export const IDS_CAS: readonly string[] = Array.from({ length: 24 }, (_, i) => `F${String(i + 1).padStart(2, '0')}`);
/** F01-F20 socle créatif, F21-F24 compléments contractuels (`qualityRubric.scope`). */
export const CAS_SOCLE: readonly string[] = IDS_CAS.slice(0, 20);

export interface CasBenchmark {
  id: string;
  title: string;
  fixture: string;
  templates: string[];
  variable: string;
  expectedOracle: string;
  status: string;
  requiredEvidence: string[];
}

export interface BenchmarkLu {
  version: string;
  status: string;
  budgetPolicy: string;
  datasetPolicy: string;
  rubrique: Rubrique;
  cas: CasBenchmark[];
}

const estObjet = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const estTexte = (x: unknown): x is string => typeof x === 'string' && x.trim().length > 0;
const estListeTextes = (x: unknown): x is string[] => Array.isArray(x) && x.every((v) => typeof v === 'string');

function egal(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Écarts entre la rubrique lue et la référence · liste vide = rubrique intacte. */
export function ecartsRubrique(r: unknown): ConstatBench[] {
  if (!estObjet(r)) return [constatBench('RUBRIQUE_ABSENTE', 'qualityRubric', 'Rubrique absente ou illisible.')];
  const out: ConstatBench[] = [];
  const attendu = RUBRIQUE_REFERENCE as unknown as Record<string, unknown>;
  for (const cle of Object.keys(attendu)) {
    if (!egal(r[cle], attendu[cle])) {
      out.push(constatBench('RUBRIQUE_MODIFIEE', `qualityRubric.${cle}`, `Valeur ${JSON.stringify(r[cle])} au lieu de ${JSON.stringify(attendu[cle])} · aucun assouplissement ni changement sans décision écrite.`));
    }
  }
  return out;
}

/**
 * Lit et valide le benchmark. `templatesConnus` = clés du pack de prompts :
 * un cas qui vise un template inconnu est refusé (le plan ne peut pas
 * l'exécuter ni le chiffrer).
 */
export function lireBenchmark(brut: unknown, templatesConnus: ReadonlySet<string>): { ok: true; benchmark: BenchmarkLu } | { ok: false; constats: ConstatBench[] } {
  let objet = brut;
  if (typeof brut === 'string') {
    try { objet = JSON.parse(brut); } catch { return { ok: false, constats: [constatBench('JSON_ILLISIBLE', '', 'Le benchmark n’est pas un JSON valide.')] }; }
  }
  if (!estObjet(objet)) return { ok: false, constats: [constatBench('JSON_ILLISIBLE', '', 'Objet attendu.')] };
  const out: ConstatBench[] = [];
  for (const cle of ['version', 'status', 'budgetPolicy', 'datasetPolicy'] as const) {
    if (!estTexte(objet[cle])) out.push(constatBench('CHAMP_ABSENT', cle, `« ${cle} » absent ou vide.`));
  }
  out.push(...ecartsRubrique(objet.qualityRubric));
  const cas = Array.isArray(objet.cases) ? objet.cases : [];
  const ids = cas.map((c) => (estObjet(c) ? c.id : undefined));
  if (!egal(ids, IDS_CAS)) out.push(constatBench('CAS_INCOMPLETS', 'cases', `Cas attendus F01 à F24 dans l’ordre · lus : ${JSON.stringify(ids)}.`));
  const lus: CasBenchmark[] = [];
  cas.forEach((c, i) => {
    const cible = `cases/${i}`;
    if (!estObjet(c)) { out.push(constatBench('CAS_ILLISIBLE', cible, 'Objet attendu.')); return; }
    for (const k of ['id', 'title', 'fixture', 'variable', 'expectedOracle', 'status'] as const) {
      if (!estTexte(c[k])) out.push(constatBench('CHAMP_ABSENT', `${cible}/${k}`, `« ${k} » absent ou vide.`));
    }
    if (!estListeTextes(c.templates) || c.templates.length === 0) out.push(constatBench('CHAMP_ABSENT', `${cible}/templates`, 'Liste de templates attendue.'));
    else for (const t of c.templates) if (!templatesConnus.has(t)) out.push(constatBench('TEMPLATE_INCONNU', `${cible}/templates`, `Template « ${t} » absent du pack de prompts.`));
    if (!estListeTextes(c.requiredEvidence) || c.requiredEvidence.length === 0) out.push(constatBench('CHAMP_ABSENT', `${cible}/requiredEvidence`, 'Preuves requises attendues.'));
    lus.push({
      id: String(c.id), title: String(c.title), fixture: String(c.fixture), templates: estListeTextes(c.templates) ? [...c.templates] : [],
      variable: String(c.variable), expectedOracle: String(c.expectedOracle), status: String(c.status),
      requiredEvidence: estListeTextes(c.requiredEvidence) ? [...c.requiredEvidence] : [],
    });
  });
  if (out.length) return { ok: false, constats: out };
  return {
    ok: true,
    benchmark: {
      version: String(objet.version), status: String(objet.status), budgetPolicy: String(objet.budgetPolicy), datasetPolicy: String(objet.datasetPolicy),
      rubrique: RUBRIQUE_REFERENCE, cas: lus,
    },
  };
}
