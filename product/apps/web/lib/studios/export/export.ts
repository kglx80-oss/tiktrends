import 'server-only';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import {
  erreurStudio, aPermissionEspace, inspecterMedia, objetDansPortee,
  preflightVersion, mediasAVerifier, versionExportable, codeRefusPreflight, messageRefusPreflight,
  verifierExport, attenduExport, nomFichierExport, estFormatExport, lireTraceExport, empreinteCourte, cleExport,
  POLICES_EMBARQUEES, CONTRAT_FORMAT, JPEG_EXPORT, ACTION_AUDIT_EXPORT, EMPREINTE_VALIDE,
  type ErreurStudio, type DisponiblesExport, type EtatMediaExport, type FormatExport, type MesureExport,
  type ViolationExport, type TraceExport, type DocumentStudio,
} from '@tiktrends/core';
import type { ContexteStudio } from '../garde';
import { lireProjet, lireVersion, lireAsset, estUuid, type ProjetStudio, type VersionStudio } from '../depot';
import { ajouterAudit } from '../audit';
import { lireMediaDansPortee, chargerMediasDocument, lecteurMedias, type LecteurMedias } from '../rendu/medias';
import { estFichierCatalogue, lireFichierCatalogue } from '../rendu/catalogue-medias';
import { rendreDocument, type ImageRvba } from '../rendu/compositeur';
import { policeRendu } from '../rendu/polices';

/**
 * Studios · L7-A · export image d'une version (EXPORT-01, 02, 04, 05).
 *
 * ── Le chemin, dans l'ordre ──────────────────────────────────────────────────
 *
 *  1. permission `studio.export` RELUE (le contexte vient d'une garde neuve à
 *     chaque appel : session, rôle, marques, restrictions) ;
 *  2. projet et version lus DANS LA PORTÉE (hors portée = introuvable) ;
 *  3. version validée (contenu valide, empreinte relue = enregistrée) ;
 *  4. préflight CIBLÉ (`preflightVersion`, noyau) sur ce qui est disponible
 *     MAINTENANT : polices chargeables, chaque média relu, décodé, mesuré ·
 *     une ressource révoquée depuis l'aperçu est refusée, avec sa cible ;
 *  5. rendu par `rendreDocument`, avec les médias chargés par
 *     `chargerMediasDocument` · EXACTEMENT le chemin de l'aperçu ;
 *  6. encodage, puis DÉCODAGE RÉEL des octets produits (`sharp`, tous les
 *     pixels, avertissement = refus, comme le décodeur du worker), mesure
 *     (type réel, dimensions, empreinte, écart aux pixels du rendu) et verdict
 *     du noyau (`verifierExport`). Un fichier non conforme n'est jamais livré.
 *
 * ── Ce qui est écrit ─────────────────────────────────────────────────────────
 *
 * Seule la commande explicite `exporterVersionPour` écrit, et une seule ligne :
 * l'événement d'audit `project.export` (version, format, empreinte,
 * dimensions). La version n'est pas modifiée (l'export est un fichier DÉRIVÉ).
 * Aucun octet n'est persisté : il n'existe aucun stockage des dérivés côté web
 * (`studio_assets` n'est écrit que par le worker pour les générations). Le
 * rendu étant déterministe, le téléchargement (GET, aucune écriture) RE-REND la
 * version et exige la même empreinte que l'export audité : V1 reste
 * téléchargeable après V2, au même hash.
 *
 * Coût : calcul local, 0 $. Aucun appel fournisseur, aucune ligne de dépense.
 */

export type Resultat<T> = ({ ok: true } & T) | ErreurStudio;
export type RefusExport = ErreurStudio & { preflight?: ViolationExport[] };

export interface DependancesExport {
  lecteur?: LecteurMedias;
  /** Familles que le serveur sait dessiner · défaut : chaque police embarquée dont le fichier se charge. */
  polices?: () => readonly string[];
  /** Encodeur · injectable pour éprouver la vérification (fichier abîmé ⇒ refus). */
  encoder?: (rendu: { png: Buffer; pixels: ImageRvba }, format: FormatExport) => Promise<Uint8Array>;
}

/** Polices réellement chargeables (fichier présent, empreinte égale à celle du noyau). */
export function policesChargeables(): string[] {
  const out: string[] = [];
  for (const [famille, m] of Object.entries(POLICES_EMBARQUEES)) {
    try { policeRendu(m.fichier); out.push(famille); } catch { /* absente du serveur */ }
  }
  return out.sort();
}

const vueOctets = (b: Buffer) => new Uint8Array(b.buffer, b.byteOffset, b.length);

export async function encoderExport(rendu: { png: Buffer; pixels: ImageRvba }, format: FormatExport): Promise<Uint8Array> {
  // PNG · les octets MÊMES du rendu de l'aperçu (même encodeur, même empreinte).
  if (format === 'png') return vueOctets(rendu.png);
  const { largeur, hauteur, donnees } = rendu.pixels;
  return sharp(Buffer.from(donnees), { raw: { width: largeur, height: hauteur, channels: 4 } })
    .flatten({ background: JPEG_EXPORT.fond })
    .jpeg({ quality: JPEG_EXPORT.qualite, chromaSubsampling: JPEG_EXPORT.chrominance, mozjpeg: false })
    .toBuffer();
}

export const sha256 = (o: Uint8Array) => createHash('sha256').update(o).digest('hex');

/** Adresse de téléchargement · désignée par la version et l'empreinte, jamais par le nom de fichier. */
export function urlTelechargementExport(t: { versionId: string; format: FormatExport; sha256: string }): string {
  return `/api/studios/export/${encodeURIComponent(t.versionId)}?format=${t.format}&empreinte=${t.sha256}`;
}

/* ─────────────────────────── Disponibilité des médias ────────────────────── */

async function decoderDimensions(octets: Uint8Array): Promise<{ largeur: number; hauteur: number } | null> {
  try {
    const { info } = await sharp(octets, { failOn: 'warning' }).raw().toBuffer({ resolveWithObject: true });
    return { largeur: info.width, hauteur: info.height };
  } catch {
    return null;
  }
}

/**
 * État d'UN média, relu maintenant dans la portée ET la marque du projet (la
 * même règle que `chargerMediasDocument`) · absent, illisible ou mesuré.
 */
async function etatMedia(ctx: ContexteStudio, projet: ProjetStudio, id: string, lecteur: LecteurMedias): Promise<EtatMediaExport> {
  if (estFichierCatalogue(id)) {
    const f = await lireFichierCatalogue(ctx, projet.id, id);
    if (!f.ok) return { etat: 'absent' };
    const d = await decoderDimensions(f.octets);
    return d ? { etat: 'ok', ...d } : { etat: 'illisible' };
  }
  if (!estUuid(id)) return { etat: 'absent' };
  const ligne = await lireAsset(ctx, id);
  if (!ligne.ok || ligne.asset.brandId !== projet.brandId || ligne.asset.storageState !== 'stored') return { etat: 'absent' };
  const m = await lireMediaDansPortee(ctx, id, lecteur);
  if (!m.ok || !m.mime.startsWith('image/')) return { etat: 'illisible' };
  const d = await decoderDimensions(m.octets);
  return d ? { etat: 'ok', ...d } : { etat: 'illisible' };
}

export async function disponiblesExport(ctx: ContexteStudio, projet: ProjetStudio, doc: DocumentStudio, deps: DependancesExport = {}): Promise<DisponiblesExport> {
  const lecteur = deps.lecteur ?? lecteurMedias();
  const medias: Record<string, EtatMediaExport> = {};
  for (const id of mediasAVerifier(doc)) medias[id] = await etatMedia(ctx, projet, id, lecteur);
  return { polices: (deps.polices ?? policesChargeables)(), medias };
}

/* ────────────────────────────── Fabrication ──────────────────────────────── */

export interface FichierExport {
  projet: ProjetStudio;
  version: VersionStudio;
  format: FormatExport;
  mime: string;
  octets: Uint8Array;
  sha256: string;
  largeur: number;
  hauteur: number;
  nomFichier: string;
}

async function versionDuProjet(ctx: ContexteStudio, projectId: unknown, versionId: unknown): Promise<Resultat<{ projet: ProjetStudio; version: VersionStudio }>> {
  if (projectId === undefined || projectId === null) {
    // Téléchargement · la version désigne son projet, relu dans la portée.
    const v = await lireVersion(ctx, versionId);
    if (!v.ok) return v;
    const p = await lireProjet(ctx, v.version.projectId);
    if (!p.ok) return p;
    return { ok: true, projet: p.projet, version: v.version };
  }
  const p = await lireProjet(ctx, projectId);
  if (!p.ok) return p;
  const v = await lireVersion(ctx, versionId ?? p.projet.currentVersionId);
  if (!v.ok) return v;
  if (v.version.projectId !== p.projet.id) return erreurStudio('NOT_FOUND', { traceId: ctx.traceId });
  return { ok: true, projet: p.projet, version: v.version };
}

function refusPreflight(ctx: ContexteStudio, ids: string[], violations: ViolationExport[]): RefusExport {
  const cibles = violations.map((v) => v.cible.calqueId).filter((x): x is string => typeof x === 'string');
  return { ...erreurStudio(codeRefusPreflight(violations), { traceId: ctx.traceId, targetIds: [...ids, ...new Set(cibles)], message: messageRefusPreflight(violations) }), preflight: violations };
}

/**
 * Fabrique le fichier d'une version · LECTURE seule (rien n'est écrit).
 * `empreinteAttendue` : celle d'un export audité (re-téléchargement).
 */
export async function fabriquerExport(
  ctx: ContexteStudio,
  e: { projectId?: unknown; versionId?: unknown; format: unknown; empreinteAttendue?: string | null },
  deps: DependancesExport = {},
): Promise<Resultat<{ fichier: FichierExport }> | RefusExport> {
  if (!aPermissionEspace(ctx.permissions, 'studio.export')) return erreurStudio('FORBIDDEN', { traceId: ctx.traceId });
  if (!estFormatExport(e.format)) {
    return erreurStudio('INVALID_SCHEMA', { traceId: ctx.traceId, violations: [{ chemin: 'format', raison: `format ${Object.keys(CONTRAT_FORMAT).join(' ou ')} attendu` }] });
  }
  const format = e.format;
  const pv = await versionDuProjet(ctx, e.projectId, e.versionId);
  if (!pv.ok) return pv;
  const { projet, version } = pv;

  const exportable = versionExportable(version);
  if (!exportable.ok) return refusPreflight(ctx, [projet.id, version.id], exportable.violations);
  const lecteur = deps.lecteur ?? lecteurMedias();
  const dispo = await disponiblesExport(ctx, projet, exportable.document, { ...deps, lecteur });
  const pf = preflightVersion(version, dispo);
  if (!pf.ok) return refusPreflight(ctx, [projet.id, version.id], pf.violations);
  const doc = pf.document;

  // Même chemin que l'aperçu (`rendreApercu`) : médias chargés par la règle du rendu, puis le compositeur.
  const m = await chargerMediasDocument(ctx, projet, doc, lecteur);
  if (!m.ok) return m;
  const r = await rendreDocument(doc, m.medias);
  if (!r.ok) {
    return erreurStudio(r.code === 'INVALID_SCHEMA' ? 'INVARIANT_CONFLICT' : r.code, {
      traceId: ctx.traceId, targetIds: [projet.id, version.id],
      message: `Export refusé · ${r.violations[0]?.raison ?? 'rendu impossible'}. Aucun fichier n’a été produit.`,
    });
  }

  const octets = await (deps.encoder ?? encoderExport)({ png: r.png, pixels: r.pixels }, format);
  const mesure = await mesurerExport(octets, format, r.pixels);
  const verdict = verifierExport(attenduExport(doc, format, e.empreinteAttendue ?? null), mesure);
  if (!verdict.ok) {
    console.warn(`[studios] ${ctx.traceId} export non conforme · ${verdict.raisons.join(' ; ')}`);
    return erreurStudio('INVARIANT_CONFLICT', {
      traceId: ctx.traceId, targetIds: [projet.id, version.id],
      message: `Le fichier produit n’est pas conforme (${verdict.raisons.join(' ; ')}) · il n’est pas livré.`,
    });
  }
  return {
    ok: true,
    fichier: {
      projet, version, format, mime: CONTRAT_FORMAT[format].mime, octets, sha256: mesure.sha256,
      largeur: doc.width, hauteur: doc.height, nomFichier: nomFichierExport(projet.title, version.n, format),
    },
  };
}

/** Mesure d'un fichier produit · décodage RÉEL de tous les pixels, comme le décodeur du worker. */
export async function mesurerExport(octets: Uint8Array, format: FormatExport, rendu: ImageRvba): Promise<MesureExport> {
  const mesure: MesureExport = {
    mimeReel: inspecterMedia(octets)?.mime ?? null,
    octets: octets.length,
    sha256: sha256(octets),
    decodage: { ok: false, raison: 'non décodé' },
    ecartPixelsMax: null,
  };
  try {
    const { data, info } = await sharp(octets, { failOn: 'warning' }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    mesure.decodage = { ok: true, largeur: info.width, hauteur: info.height };
    if (CONTRAT_FORMAT[format].sansPerte) {
      if (data.length !== rendu.donnees.length) mesure.ecartPixelsMax = 255;
      else {
        let max = 0;
        for (let i = 0; i < data.length; i++) { const d = Math.abs(data[i]! - rendu.donnees[i]!); if (d > max) max = d; }
        mesure.ecartPixelsMax = max;
      }
    }
  } catch (err) {
    mesure.decodage = { ok: false, raison: ((err as Error).message ?? '').split('\n')[0]!.slice(0, 200) || 'décodage refusé' };
  }
  return mesure;
}

/* ─────────────────────────────── Commandes ───────────────────────────────── */

export interface ExportRealise {
  projectId: string;
  versionId: string;
  versionN: number;
  format: FormatExport;
  mime: string;
  largeur: number;
  hauteur: number;
  octets: number;
  sha256: string;
  empreinteCourte: string;
  nomFichier: string;
  url: string;
  /** Date de l'export (ISO), lue dans l'audit. */
  le: string | null;
}

function realise(f: Pick<FichierExport, 'format' | 'mime' | 'sha256' | 'largeur' | 'hauteur' | 'nomFichier'> & { projectId: string; versionId: string; versionN: number; octets: number }, le: Date | null): ExportRealise {
  return {
    projectId: f.projectId, versionId: f.versionId, versionN: f.versionN, format: f.format, mime: f.mime,
    largeur: f.largeur, hauteur: f.hauteur, octets: f.octets, sha256: f.sha256, empreinteCourte: empreinteCourte(f.sha256),
    nomFichier: f.nomFichier, url: urlTelechargementExport(f), le: le ? le.toISOString() : null,
  };
}

/**
 * Commande EXPLICITE d'export · fabrique et vérifie le fichier, puis écrit
 * l'événement d'audit (la seule écriture). Renvoie de quoi le télécharger.
 */
export async function exporterVersionPour(
  ctx: ContexteStudio,
  e: { projectId: unknown; versionId?: unknown; format: unknown },
  deps: DependancesExport = {},
): Promise<Resultat<{ export: ExportRealise }> | RefusExport> {
  if (e.projectId === undefined || e.projectId === null) return erreurStudio('NOT_FOUND', { traceId: ctx.traceId });
  const f = await fabriquerExport(ctx, { projectId: e.projectId, versionId: e.versionId, format: e.format }, deps);
  if (!f.ok) return f;
  const x = f.fichier;
  const trace: TraceExport = {
    projectId: x.projet.id, versionId: x.version.id, versionN: x.version.n, format: x.format, sha256: x.sha256,
    mime: x.mime, largeur: x.largeur, hauteur: x.hauteur, octets: x.octets.length, nomFichier: x.nomFichier,
  };
  try {
    await ajouterAudit(db, ctx, {
      action: ACTION_AUDIT_EXPORT, brandId: x.projet.brandId, targetType: 'studio_project_version', targetId: x.version.id,
      versionBefore: x.version.id, versionAfter: x.version.id,
      reason: `Export ${CONTRAT_FORMAT[x.format].libelle} de la version ${x.version.n}`,
      details: { ...trace },
    });
  } catch (err) {
    console.error(`[studios] ${ctx.traceId} audit d'export`, err instanceof Error ? err.message : err);
    return erreurStudio('PERSISTENCE_FAILED', { traceId: ctx.traceId });
  }
  return { ok: true, export: realise(trace, new Date()) };
}

/** Exports audités d'un projet, du plus récent au plus ancien · lecture dans la portée. */
export async function historiqueExports(ctx: ContexteStudio, projet: ProjetStudio, limite = 30): Promise<ExportRealise[]> {
  if (ctx.marques.length === 0) return [];
  const V = schema.studioProjectVersions;
  const versions = await db.select({ id: V.id }).from(V)
    .where(and(eq(V.projectId, projet.id), eq(V.workspaceId, ctx.workspaceId), inArray(V.brandId, ctx.marques)));
  if (!versions.length) return [];
  const E = schema.studioAuditEvents;
  const lignes = await db.select({ details: E.details, workspaceId: E.workspaceId, brandId: E.brandId, targetId: E.targetId, le: E.occurredAt }).from(E)
    .where(and(
      eq(E.action, ACTION_AUDIT_EXPORT), eq(E.targetType, 'studio_project_version'),
      inArray(E.targetId, versions.map((v) => v.id)), eq(E.workspaceId, ctx.workspaceId), inArray(E.brandId, ctx.marques),
    ))
    .orderBy(desc(E.occurredAt)).limit(limite);
  const out: ExportRealise[] = [];
  const vus = new Set<string>();
  for (const l of lignes) {
    if (!l.workspaceId || !l.brandId || !objetDansPortee({ workspaceId: ctx.workspaceId, marquesDuWorkspace: ctx.marquesDuWorkspace, restrictionsMarque: ctx.restrictionsMarque }, { workspaceId: l.workspaceId, brandId: l.brandId })) continue;
    const t = lireTraceExport(l.details);
    if (!t || t.versionId !== l.targetId || t.projectId !== projet.id) continue;
    // Le même fichier exporté deux fois (même version, format, empreinte) · une entrée, la plus récente.
    if (vus.has(cleExport(t))) continue;
    vus.add(cleExport(t));
    out.push(realise(t, l.le));
  }
  return out;
}

/**
 * Téléchargement d'un export AUDITÉ · lecture pure (aucune écriture). La
 * version est re-rendue et doit redonner l'empreinte de l'export ; sinon,
 * refus (rien n'est servi qui ne soit pas le fichier exporté).
 */
export async function telechargerExportPour(
  ctx: ContexteStudio,
  e: { versionId: unknown; format: unknown; empreinte: unknown },
  deps: DependancesExport = {},
): Promise<Resultat<{ fichier: FichierExport }> | RefusExport> {
  if (!aPermissionEspace(ctx.permissions, 'studio.export')) return erreurStudio('FORBIDDEN', { traceId: ctx.traceId });
  if (!estUuid(e.versionId) || !estFormatExport(e.format) || typeof e.empreinte !== 'string' || !EMPREINTE_VALIDE.test(e.empreinte)) {
    return erreurStudio('NOT_FOUND', { traceId: ctx.traceId });
  }
  const v = await lireVersion(ctx, e.versionId);
  if (!v.ok) return v;
  const p = await lireProjet(ctx, v.version.projectId);
  if (!p.ok) return p;
  const audites = await historiqueExports(ctx, p.projet, 500);
  const connu = audites.some((a) => a.versionId === v.version.id && a.format === e.format && a.sha256 === e.empreinte);
  if (!connu) return erreurStudio('NOT_FOUND', { traceId: ctx.traceId });
  return fabriquerExport(ctx, { projectId: p.projet.id, versionId: v.version.id, format: e.format, empreinteAttendue: e.empreinte }, deps);
}

/* ─────────────────────────────── Écran ───────────────────────────────────── */

export interface VueExport {
  projet: { id: string; title: string; marque: string };
  version: { id: string; n: number; courante: boolean };
  versions: Array<{ id: string; n: number; courante: boolean }>;
  document: { largeur: number; hauteur: number; calques: number } | null;
  preflight: { ok: true; medias: number; polices: number } | { ok: false; violations: ViolationExport[] };
  historique: ExportRealise[];
  peutExporter: boolean;
}

/** L'écran d'export · LECTURE (préflight compris) : rien n'est écrit à la visite. */
export async function lireVueExportPour(ctx: ContexteStudio, e: { projectId: unknown; versionId?: unknown }, deps: DependancesExport = {}): Promise<Resultat<{ vue: VueExport }>> {
  const pv = await versionDuProjet(ctx, e.projectId, e.versionId ?? undefined);
  if (!pv.ok) return pv;
  const { projet, version } = pv;
  const V = schema.studioProjectVersions;
  const lignes = await db.select({ id: V.id, n: V.n }).from(V)
    .where(and(eq(V.projectId, projet.id), eq(V.workspaceId, ctx.workspaceId), inArray(V.brandId, ctx.marques)))
    .orderBy(desc(V.n)).limit(50);
  const [m] = await db.select({ nom: schema.brands.name }).from(schema.brands)
    .where(and(eq(schema.brands.id, projet.brandId), eq(schema.brands.workspaceId, ctx.workspaceId))).limit(1);

  const exportable = versionExportable(version);
  let preflight: VueExport['preflight'];
  let document: VueExport['document'] = null;
  if (!exportable.ok) preflight = { ok: false, violations: exportable.violations };
  else {
    const doc = exportable.document;
    document = { largeur: doc.width, hauteur: doc.height, calques: Object.keys(doc.layers).length };
    const pf = preflightVersion(version, await disponiblesExport(ctx, projet, doc, deps));
    preflight = pf.ok ? { ok: true, medias: pf.medias, polices: pf.polices } : { ok: false, violations: pf.violations };
  }
  return {
    ok: true,
    vue: {
      projet: { id: projet.id, title: projet.title, marque: m?.nom ?? '' },
      version: { id: version.id, n: version.n, courante: version.id === projet.currentVersionId },
      versions: lignes.map((l) => ({ id: l.id, n: l.n, courante: l.id === projet.currentVersionId })),
      document,
      preflight,
      historique: await historiqueExports(ctx, projet),
      peutExporter: aPermissionEspace(ctx.permissions, 'studio.export'),
    },
  };
}
