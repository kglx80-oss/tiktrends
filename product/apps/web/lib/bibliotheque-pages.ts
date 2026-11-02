import 'server-only';
import { and, desc, eq, isNotNull, isNull, notInArray, or, sql, type SQL } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import {
  curseurSuivant, dossiersEteints, FORMAT_CURSEUR_SQL, limiteDemande, motifRecherche, TAG_TEMPLATE, TRANSLITTERATION_SQL,
  type CurseurBibliotheque, type DemandePageBibliotheque, type FiltreTypeDrive, type LigneCompteBibliotheque, type MediaSource, type PageBibliotheque,
} from '@tiktrends/core';
import { toItem } from './asset-item';

/**
 * Bibliothèque · les lectures BORNÉES des médias (`assets`) · la fenêtre de la
 * page, les comptes exacts, une page de dossier, de corbeille ou de recherche,
 * et un fichier ciblé par le lien interne. Les règles (curseur, demande,
 * translittération, dossiers éteints) vivent au noyau (`pagination.ts`).
 *
 * Aucune garde ICI · chaque appelant passe la sienne AVANT (la page
 * `/assets` · `refusLectureBibliotheque` ; l'action `pageBibliothequeAction` ·
 * `gardeLectureBibliotheque`) et transmet la PORTÉE de la session · l'espace
 * (frontière dure) et la marque active (ses médias et les communs), la même
 * que `listAssets`. Rien du navigateur n'entre dans une requête sans être
 * passé par `lireDemandePage`.
 */

export interface PorteeBibliotheque { workspaceId: string; marque: string | null }

const A = schema.assets;
const F = schema.libraryFolders;
// Colonnes et ordre lus à l'appel, jamais à l'import · un test qui simule la base sans tables importe la page sans erreur.

const portee = (p: PorteeBibliotheque): SQL[] => [eq(A.workspaceId, p.workspaceId), ...(p.marque ? [or(eq(A.brandId, p.marque), isNull(A.brandId))!] : [])];

/** Les colonnes lues · jamais le contenu embarqué (`url` en base64), le curseur à la microseconde. */
const colonnes = () => ({
  id: A.id, name: A.name, kind: A.kind, source: A.source, brandId: A.brandId,
  useForAi: A.useForAi, sizeBytes: A.sizeBytes, tags: A.tags, createdAt: A.createdAt,
  externalId: A.externalId, thumbUrl: A.thumbUrl, objectEtag: A.objectEtag, folderId: A.folderId, rights: A.rights, mimeType: A.mimeType, deletedAt: A.deletedAt,
  embarquee: sql<boolean>`${A.url} like 'data:%'`,
  url: sql<string>`case when ${A.url} like 'data:%' then '' else ${A.url} end`,
  t: sql<string>`to_char(${A.createdAt} at time zone 'UTC', ${FORMAT_CURSEUR_SQL})`,
});

interface Ligne {
  id: string; name: string; kind: string; source: string; brandId: string | null; useForAi: boolean; sizeBytes: number | null; tags: string[] | null; createdAt: Date;
  externalId: string | null; thumbUrl: string | null; objectEtag: string | null; folderId: string | null; rights: string | null; mimeType: string | null; deletedAt: Date | null; embarquee: boolean; url: string; t: string;
}

/** Une ligne, telle que l'écran la range (`MediaSource`). */
function enMedia(r: Ligne): MediaSource & { curseur: CurseurBibliotheque } {
  const a = toItem(r);
  return {
    id: a.id, name: a.name, kind: a.kind, source: a.source, url: a.url, thumbUrl: a.thumbUrl, sizeBytes: a.sizeBytes, createdAt: a.createdAt,
    mimeType: r.mimeType, folderId: r.folderId, rights: r.rights, deletedAt: r.deletedAt ? r.deletedAt.toISOString() : null,
    ia: { utilisable: a.useForAi, template: a.isTemplate, tags: a.tags },
    // « Remplacer » · où vit le contenu, relu par `toItem` (jamais l'adresse) · le même champ que la page d'avant.
    ...(a.contenu ? { contenu: a.contenu } : {}),
    curseur: { t: r.t, id: r.id },
  };
}
const sansCurseur = ({ curseur: _c, ...m }: MediaSource & { curseur: CurseurBibliotheque }): MediaSource => m;

const ordre = () => [desc(A.createdAt), desc(A.id)];
const apres = (c: CurseurBibliotheque | null): SQL[] => (c ? [sql`(${A.createdAt}, ${A.id}) < (${c.t}::timestamptz, ${c.id}::uuid)`] : []);

/** Le filtre de type · la règle de `passeFiltreType(typeFichier(kind, mime), filtre)`, écrite en SQL (équivalence gardée sur base réelle). */
function filtreType(f: FiltreTypeDrive): SQL[] {
  const mime = sql`coalesce(${A.mimeType}, '')`;
  if (f === 'tous') return [];
  if (f === 'image') return [sql`${mime} <> 'application/pdf' and (${mime} = 'image/svg+xml' or ${A.kind} = 'image')`];
  if (f === 'autre') return [sql`(${mime} = 'application/pdf' or (${mime} <> 'image/svg+xml' and ${A.kind} not in ('image', 'video', 'audio')))`];
  return [sql`${mime} not in ('application/pdf', 'image/svg+xml') and ${A.kind} = ${f}`];
}

/** Les dossiers de la portée (marque active et communs, corbeille comprise) · ceux que l'écran range. */
export async function lireDossiersPortee(p: PorteeBibliotheque) {
  if (!db) return [];
  return db.select({ id: F.id, parentId: F.parentId, name: F.name, brandId: F.brandId, locked: F.locked, colorTag: F.colorTag, deletedAt: F.deletedAt, createdAt: F.createdAt }).from(F)
    .where(and(eq(F.workspaceId, p.workspaceId), ...(p.marque ? [or(eq(F.brandId, p.marque), isNull(F.brandId))!] : [])));
}

/**
 * La FENÊTRE de la page · les `limite` médias les plus récents, vivants ou à la
 * corbeille, et le curseur de son dernier fichier (`null` quand elle contient
 * tout · moins de `limite` fichiers).
 */
export async function lireFenetre(p: PorteeBibliotheque, o: { corbeille: boolean; limite: number }): Promise<{ medias: MediaSource[]; curseur: CurseurBibliotheque | null }> {
  if (!db) return { medias: [], curseur: null };
  const rows = await db.select(colonnes()).from(A).where(and(...portee(p), o.corbeille ? isNotNull(A.deletedAt) : isNull(A.deletedAt))).orderBy(...ordre()).limit(o.limite);
  const lus = (rows as Ligne[]).map(enMedia);
  return { medias: lus.map(sansCurseur), curseur: curseurSuivant(lus, o.limite) };
}

/** CE SEUL fichier vivant (lien interne au-delà de la fenêtre) · même portée, rangement compris, une lecture. */
export async function lireMediaCible(p: PorteeBibliotheque, id: string): Promise<MediaSource | null> {
  if (!db) return null;
  const rows = await db.select(colonnes()).from(A).where(and(...portee(p), isNull(A.deletedAt), eq(A.id, id))).limit(1);
  return rows[0] ? sansCurseur(enMedia(rows[0] as Ligne)) : null;
}

/**
 * Les COMPTES EXACTS · une requête agrégée sur toute la portée · par dossier,
 * type, format et corbeille · le nombre, le volume connu, les tailles
 * inconnues, et les images sans tags (le critère de l'analyse en lot).
 */
export async function lireComptes(p: PorteeBibliotheque): Promise<Array<LigneCompteBibliotheque & { sansTags: number }>> {
  if (!db) return [];
  const supprime = sql<boolean>`${A.deletedAt} is not null`;
  const rows = await db.select({
    dossierId: A.folderId, kind: A.kind, mimeType: A.mimeType, supprime,
    n: sql<number>`count(*)::int`,
    octets: sql<string>`coalesce(sum(${A.sizeBytes}), 0)::bigint`,
    sansTaille: sql<number>`(count(*) filter (where ${A.sizeBytes} is null))::int`,
    sansTags: sql<number>`(count(*) filter (where ${A.kind} = 'image' and (${A.tags} is null or cardinality(${A.tags}) = 0)))::int`,
  }).from(A).where(and(...portee(p))).groupBy(A.folderId, A.kind, A.mimeType, supprime);
  return rows.map((r) => ({ ...r, supprime: !!r.supprime, n: Number(r.n), octets: Number(r.octets), sansTaille: Number(r.sansTaille), sansTags: Number(r.sansTags) }));
}

/**
 * Une PAGE · d'un dossier (ses fichiers vivants directs · la racine des assets
 * porte aussi ceux d'un dossier hors portée, comme l'écran), de la corbeille,
 * ou d'une recherche (nom ou tag visible, sans accent ni casse, hors dossiers
 * éteints) · filtre de type, curseur stable. Une recherche lue depuis son
 * début renvoie aussi son total exact. Un dossier hors portée ne rend rien.
 *
 * `limite` · après un geste, la liste se relit depuis son début jusqu'à la
 * profondeur atteinte, en une requête (ordre `created_at desc, id desc` ·
 * l'index `assets_ws_created_id_idx`, migration 0067, la sert dans l'ordre).
 */
export async function lirePageBibliotheque(p: PorteeBibliotheque, d: DemandePageBibliotheque): Promise<PageBibliotheque> {
  if (!db) return { medias: [], suivant: null };
  const conds: SQL[] = [...portee(p), ...filtreType(d.filtre)];
  if (d.portee.type === 'corbeille') conds.push(isNotNull(A.deletedAt));
  else {
    conds.push(isNull(A.deletedAt));
    const dossiers = await lireDossiersPortee(p);
    if (d.portee.type === 'dossier') {
      const cible = d.portee.dossier;
      if (cible === 'r:assets') conds.push(dossiers.length ? or(isNull(A.folderId), notInArray(A.folderId, dossiers.map((x) => x.id)))! : sql`true`);
      else if (dossiers.some((x) => x.id === cible)) conds.push(eq(A.folderId, cible));
      else return { medias: [], suivant: null };
    } else {
      const eteints = dossiersEteints(dossiers.map((x) => ({ id: x.id, parentId: x.parentId, deletedAt: x.deletedAt ? (x.deletedAt as Date).toISOString() : null })));
      if (eteints.length) conds.push(or(isNull(A.folderId), notInArray(A.folderId, eteints))!);
      const { de, vers } = TRANSLITTERATION_SQL;
      const motif = motifRecherche(d.portee.q);
      conds.push(sql`(translate(lower(${A.name}), ${de}, ${vers}) like ${motif}
        or exists (select 1 from unnest(${A.tags}) as tag where tag <> ${TAG_TEMPLATE} and translate(lower(tag), ${de}, ${vers}) like ${motif}))`);
    }
  }
  // Une page (200), ou la profondeur relue après un geste · bornée au noyau (`lireDemandePage`).
  const limite = limiteDemande(d);
  const [rows, total] = await Promise.all([
    db.select(colonnes()).from(A).where(and(...conds, ...apres(d.curseur))).orderBy(...ordre()).limit(limite),
    d.portee.type === 'recherche' && !d.curseur
      ? db.select({ n: sql<number>`count(*)::int` }).from(A).where(and(...conds)).then((r) => Number(r[0]?.n ?? 0))
      : Promise.resolve(undefined),
  ]);
  const lus = (rows as Ligne[]).map(enMedia);
  return { medias: lus.map(sansCurseur), suivant: curseurSuivant(lus, limite), ...(total !== undefined ? { total } : {}) };
}
