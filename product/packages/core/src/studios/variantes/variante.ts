/**
 * Studios · L4-C · la VARIANTE : un média précis d'une version précise.
 *
 * Pur · ni base, ni réseau, ni modèle. Le serveur lit les lignes, ce module
 * DÉCIDE (cahier 01 §4.4 point 10, §7 « Variant et TestLink », §10 dernier
 * paragraphe ; recette FLOW-07 et FLOW-08).
 *
 * ── Ce qu'est une variante ───────────────────────────────────────────────────
 *
 * Une sortie stockée (`studio_assets`) d'un job `completed`, rattachée à la
 * version du projet QUE CE JOB A EXÉCUTÉE (son instantané), jamais à la version
 * courante. Une génération de quatre images donne quatre variantes distinctes :
 * chacune est nommée par sa position dans le lot et le rang du lot dans le
 * projet (« Image 3 du lot 4 »), pas par l'identifiant de génération.
 *
 * ── Le rang du lot est stable ────────────────────────────────────────────────
 *
 * Il compte TOUS les jobs du projet par ordre de création (puis d'identifiant),
 * quel que soit leur état : un lot créé plus tard ne renumérote jamais un lot
 * plus ancien, et « lot 4 » désigne le quatrième lancement que la personne a
 * fait, échoué ou non.
 */

import type { CodeErreurStudio } from '../erreurs';
import type { EtatJob, StatutQualite } from '../machines';

/** Une ligne du devis figé dans l'instantané · seul l'ORDRE et l'opération comptent ici. */
export interface LigneOrdonnee { operation: string }

export interface SortieOrdonnee {
  operation: string;
  assetId: string;
  /** Position 1, 2, 3… parmi les sorties LIVRÉES, dans l'ordre des lignes du devis. */
  position: number;
}

/**
 * Sorties livrées d'un lot, dans l'ordre des lignes de son devis. Une opération
 * livrée qui n'est pas dans les lignes (ne devrait pas arriver) est rangée après,
 * par ordre alphabétique, pour rester déterministe.
 */
export function sortiesOrdonnees(lignes: ReadonlyArray<LigneOrdonnee>, assets: Readonly<Record<string, string>> | null | undefined): SortieOrdonnee[] {
  const livrees = assets ?? {};
  const vues = new Set<string>();
  const ordre: string[] = [];
  for (const l of lignes) {
    if (Object.prototype.hasOwnProperty.call(livrees, l.operation) && !vues.has(l.operation)) {
      vues.add(l.operation);
      ordre.push(l.operation);
    }
  }
  for (const op of Object.keys(livrees).sort()) if (!vues.has(op)) ordre.push(op);
  return ordre.map((operation, i) => ({ operation, assetId: livrees[operation]!, position: i + 1 }));
}

export interface JobPourRang { id: string; createdAt: Date | string }

/** Rang 1, 2, 3… de chaque job du projet · ordre de création, puis identifiant. */
export function rangsDesLots(jobs: ReadonlyArray<JobPourRang>): Map<string, number> {
  const t = (d: Date | string) => (d instanceof Date ? d.getTime() : new Date(d).getTime());
  const tri = [...jobs].sort((a, b) => t(a.createdAt) - t(b.createdAt) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return new Map(tri.map((j, i) => [j.id, i + 1]));
}

export type NatureMedia = 'image' | 'video' | 'audio' | 'media';

export function natureDuMime(mime: string | null | undefined): NatureMedia {
  const m = (mime ?? '').toLowerCase();
  if (m.startsWith('image/')) return 'image';
  if (m.startsWith('video/')) return 'video';
  if (m.startsWith('audio/')) return 'audio';
  return 'media';
}

const NOM_NATURE: Record<NatureMedia, string> = { image: 'Image', video: 'Vidéo', audio: 'Audio', media: 'Média' };

/** « Image 3 du lot 4 » · le nom qu'on lit, et le seul qu'on écrit au test. */
export function libelleVariante(o: { position: number; lot: number; nature: NatureMedia }): string {
  return `${NOM_NATURE[o.nature]} ${o.position} du lot ${o.lot}`;
}

/* ────────────────────────────── Admissibilité ───────────────────────────── */

export interface SourceVariante {
  job: { state: EtatJob; qualityStatus: StatutQualite; projectId: string; projectVersionId: string };
  asset: { projectId: string | null; storageState: string };
  /** Vrai si l'asset figure dans `job.result.assets` · lu en base, pas déduit. */
  assetDansLeJob: boolean;
}

export type Admissibilite =
  | { ok: true; versionId: string; qualite: StatutQualite; aRelire: boolean }
  | { ok: false; code: CodeErreurStudio; message: string };

/**
 * Peut-on faire de ce média une variante ? Oui s'il a été stocké par un job
 * `completed` du même projet et n'a pas été écarté. Accepté ou encore à relire :
 * les deux sont admis, et le statut qualité reste affiché à part du statut
 * technique (cahier 01 §4.4 point 7).
 *
 * La version rendue est TOUJOURS celle du job (FLOW-07) : un résultat d'une
 * version ancienne reste rangé dans sa branche.
 */
export function admissibiliteVariante(s: SourceVariante): Admissibilite {
  if (!s.assetDansLeJob || s.asset.projectId !== s.job.projectId) {
    return { ok: false, code: 'MISSING_REFERENCE', message: 'Ce média n’a pas été produit par un lot de ce projet · choisis une sortie du projet.' };
  }
  if (s.job.state !== 'completed') {
    return { ok: false, code: 'INVARIANT_CONFLICT', message: 'Ce lot n’est pas terminé · attends que le fichier soit enregistré.' };
  }
  if (s.asset.storageState !== 'stored') {
    return { ok: false, code: 'INVARIANT_CONFLICT', message: 'Ce fichier n’est pas (ou plus) stocké · il ne peut pas devenir une variante.' };
  }
  if (s.job.qualityStatus === 'rejected') {
    return { ok: false, code: 'QUALITY_REVIEW_REQUIRED', message: 'Ce média a été écarté à la relecture · il ne peut pas devenir une variante.' };
  }
  return { ok: true, versionId: s.job.projectVersionId, qualite: s.job.qualityStatus, aRelire: s.job.qualityStatus !== 'passed' };
}

/** Où la variante est rangée par rapport à la version courante du projet. */
export function rangementVersion(versionVariante: string, versionCourante: string | null): 'courante' | 'anterieure' {
  return versionCourante !== null && versionVariante === versionCourante ? 'courante' : 'anterieure';
}

/* ─────────────────────────────── Le brief lu ─────────────────────────────── */

/**
 * Ce que la variante emporte du brief de SA version · hypothèse, variable,
 * sources. Le brief est une DONNÉE (contrat `brief_build_output`, module de
 * l'agent « Veille et projet ») : on le lit défensivement, sans en déclarer un
 * type concurrent.
 */
export interface TraceBrief {
  hypothese: string | null;
  variable: string | null;
  hypotheseId: string | null;
  sourceIds: string[];
}

const objet = (x: unknown): Record<string, unknown> | null => (typeof x === 'object' && x !== null && !Array.isArray(x) ? x as Record<string, unknown> : null);
const texte = (x: unknown): string | null => (typeof x === 'string' && x.trim() ? x.trim() : null);

export function traceDuBrief(brief: unknown): TraceBrief {
  const b = objet(brief);
  if (!b) return { hypothese: null, variable: null, hypotheseId: null, sourceIds: [] };
  const faits = Array.isArray(b.facts) ? b.facts.map(objet).filter((f): f is Record<string, unknown> => f !== null) : [];
  const hypotheseId = texte(b.hypothesisId);
  const fait = (hypotheseId ? faits.find((f) => f.id === hypotheseId) : undefined) ?? faits.find((f) => f.kind === 'hypothesis');
  const sourceIds = new Set<string>();
  for (const f of faits) if (Array.isArray(f.sourceIds)) for (const s of f.sourceIds) if (typeof s === 'string' && s) sourceIds.add(s);
  return {
    hypothese: fait ? texte(fait.claim) : null,
    variable: texte(b.testedVariable),
    hypotheseId,
    sourceIds: [...sourceIds].sort(),
  };
}
