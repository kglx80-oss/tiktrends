/**
 * Ce que les écrans ADMIN « IA et Studios » affichent d'une version · PUR.
 * Champs lisibles, variables, différences entre deux versions. Les règles
 * (quoi montrer, comment comparer) vivent ici, testées sans JSX.
 */

import type { TypeEntree } from './correspondance';
import { CLE_SOCLE } from './correspondance';

export interface ChampAffiche { champ: string; libelle: string; texte: string; contrat: boolean }

const LIBELLES: Record<string, string> = {
  title: 'Titre', taskInstructions: 'Consignes de tâche', userTemplate: 'Gabarit utilisateur', modelProfile: 'Modèle logique',
  inputSchemaRef: 'Schéma d’entrée', outputSchemaRef: 'Schéma de sortie', semanticChecks: 'Contrôles sémantiques',
  evaluationCaseIds: 'Cas d’évaluation', maximumRepairAttempts: 'Réparations au plus', allowedTools: 'Outils autorisés',
  material: 'Matière', lighting: 'Lumière', composition: 'Composition', invariants: 'Invariants', forbiddenTransfers: 'Transferts interdits',
  [CLE_SOCLE]: 'Consignes communes', method: 'Méthode de rendu', requiredVariables: 'Variables obligatoires',
  unresolvedVariablePolicy: 'Variable non résolue', contextVersionPinned: 'Contexte épinglé', resolvedDataContract: 'Contrat des données résolues',
  mediaBindingContract: 'Contrat des médias', origin: 'Origine', justification: 'Justification', scope: 'Portée',
};

const CONTRAT = new Set(['modelProfile', 'inputSchemaRef', 'outputSchemaRef', 'semanticChecks', 'evaluationCaseIds', 'maximumRepairAttempts', 'allowedTools', 'scope', 'method', 'requiredVariables', 'unresolvedVariablePolicy', 'contextVersionPinned', 'resolvedDataContract', 'mediaBindingContract']);
const IGNORES = new Set(['key', 'id', 'version', 'status', 'contentHash', 'sections']);

const enTexte = (v: unknown): string => (typeof v === 'string' ? v : Array.isArray(v) ? (v.length ? v.map((x) => `· ${String(x)}`).join('\n') : '(aucun)') : JSON.stringify(v));

/** Les champs d'un contenu de version, dans un ordre stable, avec leur libellé. */
export function champsAffiches(type: TypeEntree, contenu: unknown): ChampAffiche[] {
  const c = (typeof contenu === 'object' && contenu !== null ? contenu : {}) as Record<string, unknown>;
  const sortie: ChampAffiche[] = [];
  for (const [k, v] of Object.entries(c)) {
    if (IGNORES.has(k)) continue;
    sortie.push({ champ: k, libelle: LIBELLES[k] ?? k, texte: enTexte(v), contrat: CONTRAT.has(k) });
  }
  if (type === 'conversation' && typeof c.sections === 'object' && c.sections !== null) {
    for (const [k, v] of Object.entries(c.sections as Record<string, unknown>)) sortie.push({ champ: `sections.${k}`, libelle: `Section · ${k}`, texte: enTexte(v), contrat: false });
  }
  return sortie;
}

/** Variables `{{ nom }}` présentes dans les textes d'un contenu. */
export function variablesDe(contenu: unknown): string[] {
  const vues = new Set<string>();
  const visiter = (v: unknown) => {
    if (typeof v === 'string') for (const m of v.matchAll(/\{\{\s*([^{}]*?)\s*\}\}/g)) vues.add(m[1] ?? '');
    else if (Array.isArray(v)) v.forEach(visiter);
    else if (typeof v === 'object' && v !== null) Object.values(v).forEach(visiter);
  };
  visiter(contenu);
  return [...vues].sort();
}

export interface LigneDiff { op: '=' | '+' | '-'; texte: string }

/** Différence ligne à ligne (plus longue sous-suite commune). Bornée : au-delà, comparaison brute. */
export function diffLignes(a: string, b: string, max = 1500): LigneDiff[] {
  const x = a.split('\n'), y = b.split('\n');
  if (x.length > max || y.length > max) return a === b ? x.map((t) => ({ op: '=', texte: t })) : [...x.map((t) => ({ op: '-' as const, texte: t })), ...y.map((t) => ({ op: '+' as const, texte: t }))];
  const n = x.length, m = y.length;
  const L: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i]![j] = x[i] === y[j] ? L[i + 1]![j + 1]! + 1 : Math.max(L[i + 1]![j]!, L[i]![j + 1]!);
  const out: LigneDiff[] = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (x[i] === y[j]) { out.push({ op: '=', texte: x[i]! }); i++; j++; }
    else if (L[i + 1]![j]! >= L[i]![j + 1]!) out.push({ op: '-', texte: x[i++]! });
    else out.push({ op: '+', texte: y[j++]! });
  }
  while (i < n) out.push({ op: '-', texte: x[i++]! });
  while (j < m) out.push({ op: '+', texte: y[j++]! });
  return out;
}

export interface DiffChamp { champ: string; libelle: string; lignes: LigneDiff[] }

/** Champs qui diffèrent entre deux contenus du même type · vide = identiques. */
export function diffVersions(type: TypeEntree, avant: unknown, apres: unknown): DiffChamp[] {
  const a = new Map(champsAffiches(type, avant).map((c) => [c.champ, c]));
  const b = new Map(champsAffiches(type, apres).map((c) => [c.champ, c]));
  const champs = [...new Set([...a.keys(), ...b.keys()])];
  const sortie: DiffChamp[] = [];
  for (const k of champs) {
    const ta = a.get(k)?.texte ?? '', tb = b.get(k)?.texte ?? '';
    if (ta === tb) continue;
    sortie.push({ champ: k, libelle: (b.get(k) ?? a.get(k))!.libelle, lignes: diffLignes(ta, tb) });
  }
  return sortie;
}

/** Empreinte abrégée lisible · le texte complet reste accessible au survol et au lecteur d'écran. */
export function court(h: string | null | undefined, n = 12): string {
  return h ? `${h.slice(0, n)}…` : '·';
}
