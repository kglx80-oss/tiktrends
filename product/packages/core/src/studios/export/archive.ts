/**
 * Studios · R4 · l'export CONSERVÉ (EXPORT-05 « historique », cahier 01 §11.2
 * « réévaluer droits au moment d'exécution et d'export si ressources
 * révoquées »).
 *
 * Pur. Le serveur relit ce qui existe MAINTENANT (ligne d'archive, octets,
 * état de chaque média de la version) et le passe ici ; ce module décide.
 *
 * ── Le défaut réparé ─────────────────────────────────────────────────────────
 *
 * L7-A ne gardait aucun octet : le téléchargement RE-RENDAIT la version et
 * exigeait la même empreinte. Un média remplacé depuis (mêmes droits, autre
 * contenu) changeait le rendu, donc l'empreinte, donc l'ancien export n'était
 * plus servi · un fichier livré au client devenait introuvable.
 *
 * Désormais l'export vérifié est déposé dans le stockage des médias studio
 * (`studio_assets`, origine `render`) et son identifiant est écrit dans la
 * trace d'audit de l'export. Le téléchargement sert ce fichier ARCHIVÉ, après
 * avoir relu ses octets et constaté la même empreinte.
 *
 * ── La décision sur une ressource révoquée ───────────────────────────────────
 *
 * Un média de la version qui n'est plus AUTORISÉ (ligne retirée, plus stockée,
 * sortie de la portée ou de la marque du projet, photo du catalogue retirée)
 * ⇒ l'export conservé n'est PAS servi, avec la cible nommée. L'archive n'est
 * pas effacée (aucun historique supprimé) : rétablir le média la rend de
 * nouveau téléchargeable. Un média seulement MODIFIÉ (toujours autorisé,
 * contenu différent) ne bloque rien : c'est précisément le cas que la
 * conservation existe pour servir.
 *
 * Raison : l'archive contient les pixels du média. Servir un média retiré à
 * travers un fichier dérivé contournerait le retrait · le cahier demande de
 * réévaluer les droits à l'export, et un téléchargement est une remise du
 * fichier exporté.
 */

import { CONTRAT_FORMAT, estFormatExport, type FormatExport, type TraceExport } from './fichier';
import type { CalqueStudio, DocumentStudio } from '../document';
import type { ViolationExport } from './preflight';

const EMPREINTE = /^[a-f0-9]{64}$/;
const SEGMENT = /^[A-Za-z0-9-]{1,64}$/;

/** Origine `studio_assets` d'un export conservé · valeur déjà autorisée par la base (0054). */
export const ORIGINE_ARCHIVE_EXPORT = 'render' as const;

/**
 * Clé de stockage d'un export conservé · dérivée de son IDENTITÉ (version,
 * format, empreinte), jamais du nom de fichier. Le même fichier exporté deux
 * fois retombe sur la même clé (dépôt idempotent, une seule ligne).
 */
export function cleArchiveExport(i: { workspaceId: string; projectId: string; versionId: string; format: FormatExport; sha256: string }): string {
  for (const s of [i.workspaceId, i.projectId, i.versionId]) if (!SEGMENT.test(s)) throw new Error('segment de clé d’archive invalide');
  if (!EMPREINTE.test(i.sha256) || !estFormatExport(i.format)) throw new Error('identité d’export invalide');
  return `exports/${i.workspaceId}/${i.projectId}/${i.versionId}/${i.format}-${i.sha256}.${CONTRAT_FORMAT[i.format].extension}`;
}

/** Ce que la ligne d'archive porte dans `rights` · la version dont elle dérive (le parent au sens métier). */
export interface ProvenanceArchive { projectId: string; versionId: string; versionN: number; format: FormatExport }

export function droitsArchiveExport(t: Pick<TraceExport, 'projectId' | 'versionId' | 'versionN' | 'format'>, sources: readonly string[]): Record<string, unknown> {
  return {
    export: { projectId: t.projectId, versionId: t.versionId, versionN: t.versionN, format: t.format },
    // Les médias dont les pixels sont dans le fichier · relus à chaque téléchargement.
    sources: [...new Set(sources)].sort(),
    mention: 'Fichier dérivé d’une version · il ne la modifie pas',
  };
}

export function lireProvenanceArchive(rights: unknown): ProvenanceArchive | null {
  if (typeof rights !== 'object' || rights === null || Array.isArray(rights)) return null;
  const e = (rights as Record<string, unknown>).export;
  if (typeof e !== 'object' || e === null || Array.isArray(e)) return null;
  const x = e as Record<string, unknown>;
  if (typeof x.projectId !== 'string' || typeof x.versionId !== 'string' || !estFormatExport(x.format)) return null;
  if (typeof x.versionN !== 'number' || !Number.isInteger(x.versionN) || x.versionN < 1) return null;
  return { projectId: x.projectId, versionId: x.versionId, versionN: x.versionN, format: x.format };
}

/* ───────────────────────── Conformité de l'archive ───────────────────────── */

/** La ligne d'archive relue dans la portée, et l'empreinte des octets relus maintenant. */
export interface ArchiveRelue {
  origin: string;
  storageState: string;
  projectId: string | null;
  mime: string;
  bytes: number;
  sha256: string;
  rights: unknown;
  /** sha256 des octets RELUS du stockage à l'instant · `null` si illisibles. */
  empreinteRelue: string | null;
}

/**
 * L'archive est-elle le fichier de CET export ? Toutes les raisons, jamais la
 * première seule. Identité exigée : origine, version, format, empreinte de la
 * ligne ET des octets relus, type et taille.
 */
export function archiveConforme(t: TraceExport, a: ArchiveRelue): { ok: true } | { ok: false; raisons: string[] } {
  const r: string[] = [];
  if (a.origin !== ORIGINE_ARCHIVE_EXPORT) r.push(`origine ${a.origin} au lieu de ${ORIGINE_ARCHIVE_EXPORT}`);
  if (a.storageState !== 'stored') r.push(`stockage ${a.storageState}`);
  if (a.projectId !== t.projectId) r.push('projet différent');
  const p = lireProvenanceArchive(a.rights);
  if (!p) r.push('provenance illisible');
  else {
    if (p.versionId !== t.versionId) r.push('version différente');
    if (p.format !== t.format) r.push('format différent');
  }
  if (a.mime !== CONTRAT_FORMAT[t.format].mime) r.push(`type ${a.mime} au lieu de ${CONTRAT_FORMAT[t.format].mime}`);
  if (a.bytes !== t.octets) r.push(`taille ${a.bytes} au lieu de ${t.octets}`);
  if (a.sha256 !== t.sha256) r.push('empreinte de la ligne différente de l’export');
  if (a.empreinteRelue === null) r.push('octets illisibles');
  else if (a.empreinteRelue !== t.sha256) r.push('octets relus différents de l’export');
  return r.length ? { ok: false, raisons: r } : { ok: true };
}

/* ───────────────────────── Droits relus au téléchargement ─────────────────── */

/** État des DROITS d'un média de la version, relu maintenant (pas son contenu). */
export type DroitMediaExport = 'autorise' | 'revoque';

const LIBELLE_KIND: Readonly<Record<CalqueStudio['kind'], string>> = { image: 'image', text: 'texte', shape: 'forme', logo: 'logo' };

/**
 * Médias révoqués depuis l'export · un par calque visible concerné, chacun
 * ciblé. Absent de la table = révoqué (le doute ne sert pas un fichier).
 */
export function ressourcesRevoquees(doc: DocumentStudio, droits: Readonly<Record<string, DroitMediaExport>>): ViolationExport[] {
  const out: ViolationExport[] = [];
  const calques = Object.values(doc.layers ?? {})
    .filter((l): l is Extract<CalqueStudio, { kind: 'image' | 'logo' }> => !!l && l.visible && (l.kind === 'image' || l.kind === 'logo'))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  for (const l of calques) {
    const d = Object.prototype.hasOwnProperty.call(droits, l.assetId) ? droits[l.assetId] : undefined;
    if (d === 'autorise') continue;
    out.push({
      cible: { type: 'calque', calqueId: l.id, nom: l.name, kind: l.kind, assetId: l.assetId },
      cause: 'media_revoque',
      message: `Calque ${LIBELLE_KIND[l.kind]} « ${l.name || l.id} » · média retiré depuis l’export · le fichier conservé n’est plus servi tant qu’il n’est pas rétabli.`,
    });
  }
  return out;
}

/* ───────────────────────── Décision de téléchargement ────────────────────── */

export type DecisionTelechargement =
  | { servir: 'archive' }
  /** Export antérieur à la conservation, ou archive non conforme · re-rendu, MÊME empreinte exigée. */
  | { servir: 'rendu'; raison: string }
  | { servir: 'refus'; violations: ViolationExport[] };

/**
 * Ordre : droits d'abord (un média révoqué bloque, archive ou pas), puis
 * l'archive conforme, puis le re-rendu de L7-A en repli · qui n'est servi que
 * s'il redonne l'empreinte exacte de l'export. Jamais un autre fichier.
 */
export function decisionTelechargement(e: {
  trace: TraceExport;
  revoquees: readonly ViolationExport[];
  /** `undefined` · l'export n'a pas d'archive ; `null` · archive désignée mais introuvable. */
  archive: ArchiveRelue | null | undefined;
}): DecisionTelechargement {
  if (e.revoquees.length) return { servir: 'refus', violations: [...e.revoquees] };
  if (e.archive === undefined) return { servir: 'rendu', raison: 'export antérieur à la conservation' };
  if (e.archive === null) return { servir: 'rendu', raison: 'archive introuvable' };
  const c = archiveConforme(e.trace, e.archive);
  return c.ok ? { servir: 'archive' } : { servir: 'rendu', raison: `archive non conforme · ${c.raisons.join(' ; ')}` };
}

/** Ce que l'écran dit de la conservation d'un export · jamais une capacité qui n'existe pas. */
export function libelleConservation(conserve: boolean): string {
  return conserve
    ? 'Conservé · le téléchargement sert ce fichier, même si un média change ensuite.'
    : 'Non conservé · refait à la demande, il n’est plus servi si un média a changé depuis.';
}
