import 'server-only';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { storageFromEnv, putObject } from '@tiktrends/integrations';
import {
  erreurStudio, aPermissionEspace, inspecterMedia, objetDansPortee,
  preflightVersion, mediasAVerifier, versionExportable, codeRefusPreflight, messageRefusPreflight,
  verifierExport, attenduExport, nomFichierExport, estFormatExport, lireTraceExport, empreinteCourte, cleExport,
  POLICES_EMBARQUEES, CONTRAT_FORMAT, JPEG_EXPORT, ACTION_AUDIT_EXPORT, EMPREINTE_VALIDE,
  cleArchiveExport, droitsArchiveExport, ressourcesRevoquees, decisionTelechargement, ORIGINE_ARCHIVE_EXPORT,
  type ErreurStudio, type DisponiblesExport, type EtatMediaExport, type FormatExport, type MesureExport,
  type ViolationExport, type TraceExport, type DocumentStudio, type StockageStudio, type ArchiveRelue, type DroitMediaExport,
} from '@tiktrends/core';
import type { ContexteStudio } from '../garde';
import { lireProjet, lireVersion, lireAsset, estUuid, type ProjetStudio, type VersionStudio } from '../depot';
import { ajouterAudit } from '../audit';
import { lireMediaDansPortee, chargerMediasDocument, lecteurMedias, lecteurStockage, type LecteurMedias } from '../rendu/medias';
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
 * Seule la commande explicite `exporterVersionPour` écrit :
 *  · R4 · le fichier VÉRIFIÉ est déposé dans le stockage des médias studio
 *    (même bucket S3 que le worker, `putObject`), RELU, comparé à son
 *    empreinte, puis conservé comme ligne `studio_assets` (origine `render`,
 *    projet du fichier, provenance de version dans `rights`) ;
 *  · l'événement d'audit `project.export` (version, format, empreinte,
 *    dimensions, identifiant de l'archive), dans la MÊME transaction.
 * La version n'est pas modifiée (l'export est un fichier DÉRIVÉ).
 *
 * Le téléchargement (GET, aucune écriture) relit les droits, puis sert le
 * fichier ARCHIVÉ dont les octets relus redonnent l'empreinte de l'export :
 * un média modifié depuis ne change plus ce qui est servi. Sans archive
 * (export antérieur à R4, ou stockage indisponible au moment de l'export), il
 * RE-REND la version et exige la même empreinte, comme L7-A. Un média RÉVOQUÉ
 * depuis l'export bloque le téléchargement (décision documentée dans
 * `packages/core/src/studios/export/archive.ts`).
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
  /** R4 · stockage où conserver le fichier · défaut `stockageExport()` ; `null` : ne rien conserver. */
  stockage?: StockageStudio | null;
}

/* ───────────────────────── R4 · stockage des exports ──────────────────────── */

let stockageInjecte: StockageStudio | null | undefined;
/** Pour les tests seulement · refusé en production. `undefined` rend le stockage réel. */
export function injecterStockageExport(s: StockageStudio | null | undefined): void {
  if (process.env.NODE_ENV === 'production') throw new Error('stockage d’export injecté refusé en production');
  stockageInjecte = s;
}

/**
 * Le stockage des médias studio vu par l'export · dépôt par le MÊME mécanisme
 * que le worker (`putObject` signé sur le bucket S3), relecture par le MÊME
 * lecteur que celui qui servira le fichier (`lecteurStockage`). `null` sans
 * stockage configuré : l'export reste possible, il n'est pas conservé, et
 * l'écran le dit.
 */
export function stockageExport(): StockageStudio | null {
  if (stockageInjecte !== undefined) return stockageInjecte;
  const cfg = storageFromEnv();
  if (!cfg) return null;
  const lecteur = lecteurStockage();
  return {
    async deposer(cle, octets, mime) { await putObject(cfg, cle, Buffer.from(octets), mime); },
    relire: (cle) => lecteur.lire({ storageKey: cle, bytes: 0 }),
  };
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
  /** Médias dont les pixels sont dans le fichier (calques image et logo visibles). */
  medias: string[];
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
      medias: mediasAVerifier(doc),
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
  /** R4 · fichier conservé dans le stockage (servi tel quel) · absent ou faux : refait à la demande. */
  conserve?: boolean;
}

function realise(f: TraceExport, le: Date | null): ExportRealise {
  return {
    projectId: f.projectId, versionId: f.versionId, versionN: f.versionN, format: f.format, mime: f.mime,
    largeur: f.largeur, hauteur: f.hauteur, octets: f.octets, sha256: f.sha256, empreinteCourte: empreinteCourte(f.sha256),
    nomFichier: f.nomFichier, url: urlTelechargementExport(f), le: le ? le.toISOString() : null, conserve: !!f.assetId,
  };
}

/**
 * Dépose le fichier vérifié, le RELIT et compare l'empreinte · rend la clé
 * conservée, ou `null` (stockage absent ou défaillant : l'export reste livré,
 * non conservé, et la trace le dit). Aucun octet d'une autre identité n'est
 * jamais conservé sous cette clé.
 */
async function deposerArchive(ctx: ContexteStudio, f: FichierExport, stockage: StockageStudio | null): Promise<string | null> {
  if (!stockage) return null;
  const cle = cleArchiveExport({ workspaceId: ctx.workspaceId, projectId: f.projet.id, versionId: f.version.id, format: f.format, sha256: f.sha256 });
  try {
    await stockage.deposer(cle, f.octets, f.mime);
    const relu = await stockage.relire(cle);
    if (!relu || sha256(relu) !== f.sha256) {
      console.warn(`[studios] ${ctx.traceId} export non conservé · relecture différente du dépôt`);
      return null;
    }
    return cle;
  } catch (err) {
    console.warn(`[studios] ${ctx.traceId} export non conservé · ${err instanceof Error ? err.message : 'dépôt refusé'}`);
    return null;
  }
}

type TxExport = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * La ligne `studio_assets` de l'archive · une par clé (identité de l'export).
 * Le même fichier ré-exporté retrouve sa ligne ; une ligne existante qui n'est
 * plus ce fichier (retirée, autre empreinte) n'est jamais réutilisée.
 */
async function enregistrerArchive(tx: TxExport, ctx: ContexteStudio, f: FichierExport, cle: string, trace: TraceExport): Promise<string | null> {
  const S = schema.studioAssets;
  const [n] = await tx.insert(S).values({
    workspaceId: ctx.workspaceId, brandId: f.projet.brandId, projectId: f.projet.id, storageKey: cle, mime: f.mime,
    bytes: f.octets.length, width: f.largeur, height: f.hauteur, sha256: f.sha256, origin: ORIGINE_ARCHIVE_EXPORT,
    rights: droitsArchiveExport(trace, f.medias), parentAssetId: null, storageState: 'stored', createdBy: ctx.userId,
  }).onConflictDoNothing({ target: [S.workspaceId, S.storageKey] }).returning({ id: S.id });
  if (n) return n.id;
  const [e] = await tx.select({ id: S.id, brandId: S.brandId, projectId: S.projectId, sha256: S.sha256, origin: S.origin, storageState: S.storageState })
    .from(S).where(and(eq(S.workspaceId, ctx.workspaceId), eq(S.storageKey, cle))).limit(1);
  return e && e.storageState === 'stored' && e.sha256 === f.sha256 && e.brandId === f.projet.brandId && e.projectId === f.projet.id && e.origin === ORIGINE_ARCHIVE_EXPORT ? e.id : null;
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
  // R4 · dépôt et relecture HORS transaction (le stockage n'en a pas) ; la ligne et l'audit, ensemble.
  const cle = await deposerArchive(ctx, x, deps.stockage !== undefined ? deps.stockage : stockageExport());
  try {
    await db.transaction(async (tx) => {
      const assetId = cle ? await enregistrerArchive(tx, ctx, x, cle, trace) : null;
      if (assetId) trace.assetId = assetId;
      await ajouterAudit(tx, ctx, {
        action: ACTION_AUDIT_EXPORT, brandId: x.projet.brandId, targetType: 'studio_project_version', targetId: x.version.id,
        versionBefore: x.version.id, versionAfter: x.version.id,
        reason: `Export ${CONTRAT_FORMAT[x.format].libelle} de la version ${x.version.n}${assetId ? ' · fichier conservé' : ' · non conservé'}`,
        details: { ...trace },
      });
    });
  } catch (err) {
    console.error(`[studios] ${ctx.traceId} audit d'export`, err instanceof Error ? err.message : err);
    return erreurStudio('PERSISTENCE_FAILED', { traceId: ctx.traceId });
  }
  return { ok: true, export: realise(trace, new Date()) };
}

/** Exports audités d'un projet, du plus récent au plus ancien · lecture dans la portée. */
export async function historiqueExports(ctx: ContexteStudio, projet: ProjetStudio, limite = 30): Promise<ExportRealise[]> {
  return (await tracesAuditees(ctx, projet, limite)).map((x) => realise(x.trace, x.le));
}

/**
 * Traces d'export d'un projet, une par fichier (la plus récente ; à identité
 * égale, celle qui désigne une archive l'emporte) · lecture dans la portée.
 */
async function tracesAuditees(ctx: ContexteStudio, projet: ProjetStudio, limite: number): Promise<Array<{ trace: TraceExport; le: Date | null }>> {
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
  const out: Array<{ trace: TraceExport; le: Date | null }> = [];
  const vus = new Map<string, number>();
  for (const l of lignes) {
    if (!l.workspaceId || !l.brandId || !objetDansPortee({ workspaceId: ctx.workspaceId, marquesDuWorkspace: ctx.marquesDuWorkspace, restrictionsMarque: ctx.restrictionsMarque }, { workspaceId: l.workspaceId, brandId: l.brandId })) continue;
    const t = lireTraceExport(l.details);
    if (!t || t.versionId !== l.targetId || t.projectId !== projet.id) continue;
    // Le même fichier exporté deux fois (même version, format, empreinte) · une entrée, la plus récente,
    // qui hérite de l'archive d'une trace plus ancienne si elle-même n'en a pas.
    const deja = vus.get(cleExport(t));
    if (deja !== undefined) {
      if (!out[deja]!.trace.assetId && t.assetId) out[deja] = { trace: { ...out[deja]!.trace, assetId: t.assetId }, le: out[deja]!.le };
      continue;
    }
    vus.set(cleExport(t), out.length);
    out.push({ trace: t, le: l.le });
  }
  return out;
}

/* ───────────────────────── R4 · téléchargement ───────────────────────────── */

/**
 * Droits de chaque média de la version, relus MAINTENANT (lignes seulement,
 * pas le contenu) · autorisé = dans la portée, de la marque du projet, stocké ;
 * photo ou logo du catalogue encore servi. Tout le reste est révoqué.
 */
async function droitsMedias(ctx: ContexteStudio, projet: ProjetStudio, doc: DocumentStudio): Promise<Record<string, DroitMediaExport>> {
  const out: Record<string, DroitMediaExport> = {};
  for (const id of mediasAVerifier(doc)) {
    if (estFichierCatalogue(id)) {
      out[id] = (await lireFichierCatalogue(ctx, projet.id, id)).ok ? 'autorise' : 'revoque';
      continue;
    }
    const a = estUuid(id) ? await lireAsset(ctx, id) : null;
    out[id] = a && a.ok && a.asset.brandId === projet.brandId && a.asset.storageState === 'stored' ? 'autorise' : 'revoque';
  }
  return out;
}

/** L'archive relue dans la portée · ligne et octets (empreinte recalculée) · `null` hors portée ou inconnue. */
async function relireArchive(ctx: ContexteStudio, assetId: string, lecteur: LecteurMedias): Promise<(ArchiveRelue & { octets: Uint8Array | null }) | null> {
  const a = await lireAsset(ctx, assetId);
  if (!a.ok) return null;
  const x = a.asset;
  let octets: Uint8Array | null = null;
  if (x.storageState === 'stored') {
    try { octets = await lecteur.lire(x); } catch { octets = null; }
  }
  return {
    origin: x.origin, storageState: x.storageState, projectId: x.projectId, mime: x.mime, bytes: x.bytes, sha256: x.sha256,
    rights: x.rights, empreinteRelue: octets ? sha256(octets) : null, octets,
  };
}

function refusTelechargement(ctx: ContexteStudio, ids: string[], violations: ViolationExport[]): RefusExport {
  const cibles = violations.map((v) => v.cible.calqueId).filter((x): x is string => typeof x === 'string');
  const autres = violations.length - 1;
  return {
    ...erreurStudio(codeRefusPreflight(violations), {
      traceId: ctx.traceId, targetIds: [...ids, ...new Set(cibles)],
      message: `Téléchargement refusé · ${violations[0]?.message ?? 'ressource retirée.'}${autres > 0 ? ` Et ${autres} autre${autres > 1 ? 's' : ''} média${autres > 1 ? 's' : ''} retiré${autres > 1 ? 's' : ''}.` : ''} Le fichier reste conservé.`,
    }),
    preflight: violations,
  };
}

/**
 * Téléchargement d'un export AUDITÉ · lecture pure (aucune écriture).
 * Permission relue, version et projet relus dans la portée, droits de chaque
 * média relus (révoqué ⇒ refus ciblé), puis le fichier ARCHIVÉ dont les
 * octets relus redonnent l'empreinte de l'export. Sans archive conforme,
 * re-rendu exigeant la même empreinte ; sinon refus (rien n'est servi qui ne
 * soit pas le fichier exporté).
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
  const format = e.format;
  const empreinte = e.empreinte;
  const t = (await tracesAuditees(ctx, p.projet, 500)).find((a) => a.trace.versionId === v.version.id && a.trace.format === format && a.trace.sha256 === empreinte)?.trace;
  if (!t) return erreurStudio('NOT_FOUND', { traceId: ctx.traceId });
  const ids = [p.projet.id, v.version.id];

  // Droits relus d'abord · un média révoqué bloque, archive ou pas.
  const exportable = versionExportable(v.version);
  if (!exportable.ok) return refusPreflight(ctx, ids, exportable.violations);
  const revoquees = ressourcesRevoquees(exportable.document, await droitsMedias(ctx, p.projet, exportable.document));
  const lecteur = deps.lecteur ?? lecteurMedias();
  const archive = t.assetId ? await relireArchive(ctx, t.assetId, lecteur) : undefined;
  const d = decisionTelechargement({ trace: t, revoquees, archive });
  if (d.servir === 'refus') return refusTelechargement(ctx, ids, d.violations);
  if (d.servir === 'archive' && archive?.octets) {
    return {
      ok: true,
      fichier: {
        projet: p.projet, version: v.version, format, mime: CONTRAT_FORMAT[format].mime, octets: archive.octets, sha256: t.sha256,
        largeur: t.largeur, hauteur: t.hauteur, nomFichier: t.nomFichier, medias: mediasAVerifier(exportable.document),
      },
    };
  }
  if (t.assetId) console.warn(`[studios] ${ctx.traceId} export conservé non servi · ${d.servir === 'rendu' ? d.raison : 'octets absents'} · repli sur le re-rendu`);
  // Repli L7-A · re-rendu, servi SEULEMENT s'il redonne l'empreinte exacte de l'export.
  return fabriquerExport(ctx, { projectId: p.projet.id, versionId: v.version.id, format, empreinteAttendue: empreinte }, { ...deps, lecteur });
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
