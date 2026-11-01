import * as zlib from 'node:zlib';
import { morceauxBornes, plafondArchiveReel } from '../../../../lib/archive-lecture';
import { and, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import {
  arborescenceArchive, conclureArchive, fluxZip, nomArchive, relecturesArchive, selectionArchive, tailleRelue, validerDemandeArchive, extensionArchive,
  ENTETES_MEDIA_FERMES, PLAFOND_ARCHIVE_FICHIERS, RAISONS_ARCHIVE,
  type EntreeZip, type LigneArchive,
} from '@tiktrends/core';
import { googleAccessToken, objectKeyFromUrl, privateObjectUrl, storageFromEnv } from '@tiktrends/integrations';
import { enteteTailleObjetEspace, fluxFichierDrive, fluxObjetEspace, metaTailleFichierDrive } from '@tiktrends/integrations/src/lecture-flux';
import { safeFetch } from '@tiktrends/integrations/src/safe-fetch';
import { getSession } from '../../../../lib/auth';
import { getActiveBrand } from '../../../../lib/brands';
import { driveRefreshTokenFor } from '../../../../lib/drive-token';
import { assetServing, isPrivateDriveUrl } from '../../../../lib/asset-url';
import { octetsDataUri } from '../../../../lib/import-image';
import { refusLectureBibliotheque, TEXTE_REFUS_BIBLIOTHEQUE } from '../../../../lib/bibliotheque-acces';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Bibliothèque · le TÉLÉCHARGEMENT GROUPÉ · une archive ZIP des fichiers et
 * des DOSSIERS sélectionnés (un dossier avec toute son arborescence vivante),
 * écrite EN FLUX (geste « Télécharger » de la barre de sélection).
 *
 * ── La garde · la même que les proxys `/api/asset/[id]` et `/api/drive-img/[id]` ──
 *
 * Session, puis règle de LECTURE de la Bibliothèque (`refusLectureBibliotheque` ·
 * rôle Membre, sans offre), puis l'espace de la SESSION · jamais un espace
 * fourni. La requête ne lit que des lignes de cet espace.
 *
 * ── Ce que la route reçoit · des identifiants, rien d'autre ─────────────────
 *
 * `ids` (fichiers) et `dossiers` · des UUID, dédoublonnés, chacun au plus
 * `TAG_SELECTION_MAX` (`validerDemandeArchive`, noyau). Tout autre champ est
 * ignoré · aucune adresse ni aucun chemin fourni par le client n'est lu.
 *
 * Un dossier · son arborescence est calculée au noyau (`arborescenceArchive`)
 * sur les dossiers de l'ESPACE seuls · un sous-dossier d'un autre espace (un
 * `parent_id` qui pointerait par erreur ici) n'est jamais lu, ni ses fichiers ;
 * sous-dossiers et fichiers en corbeille sont exclus, un cycle de parents est
 * parcouru une fois. Son contenu est lu en UNE requête bornée à
 * `PLAFOND_ARCHIVE_FICHIERS` + 1 lignes (le compte exact vient avec). Même
 * portée que l'écran · la marque active et les éléments communs (un dossier ou
 * un fichier d'une autre marque n'y entre pas), sinon tout l'espace.
 *
 * Chaque objet est lu par son adresse EN BASE, par les mêmes portes que le
 * proxy : octets embarqués décodés, objet du bucket de l'espace lu par
 * lien signé vers l'hôte du stockage configuré (`fluxObjetEspace`), fichier
 * Drive lu avec le jeton de l'espace, adresse publique lue par `safeFetch`
 * (bornée). Un objet du bucket hors de l'espace n'est jamais demandé.
 *
 * ── Tout ou rien, AVANT le premier octet ────────────────────────────────────
 *
 * `selectionArchive` puis `conclureArchive` (noyau) refusent l'archive ENTIÈRE
 * dès qu'un identifiant n'est pas un fichier ou un dossier vivant de l'espace
 * (inconnu, autre espace, corbeille, dossier en corbeille), au-delà des
 * plafonds de nombre, d'un chemin trop long, d'une taille qui reste inconnue,
 * ou si la somme des tailles dépasse `PLAFOND_ARCHIVE_OCTETS` · même phrase
 * qu'à l'écran.
 *
 * Une taille INCONNUE (`size_bytes` nul) est relue au stockage avant la
 * décision (`relecturesArchive` · au plus `RELECTURES_TAILLE_MAX`, huit à la
 * fois, 5 s chacune) · `HEAD` signé pour un objet du bucket de l'espace,
 * métadonnée `size` de Drive avec le jeton de l'espace. Elle n'est PAS écrite
 * en base · cette route obéit à la règle de LECTURE et ne modifie rien.
 * Un fichier qu'on ne saurait pas lire (Drive sans jeton, bucket d'un autre
 * espace, adresse inconnue) refuse aussi tout, avant d'écrire.
 *
 * Une lecture qui échoue PENDANT l'écriture (objet disparu, Drive en panne) ou
 * des octets réels au-delà du plafond COUPENT le flux en erreur · le navigateur
 * marque le téléchargement en échec, il ne reçoit jamais une archive fausse.
 *
 * ── Deux modes ──────────────────────────────────────────────────────────────
 *
 *  · `?verifier=1` (JSON) · la décision seule, en JSON · l'écran la demande
 *    avant de lancer le téléchargement, pour dire un refus sans quitter la page ;
 *  · sinon (formulaire `ids=…&ids=…`, envoyé par le navigateur) · l'archive,
 *    en pièce jointe, morceau par morceau (aucun fichier entier en mémoire).
 *
 * Toute réponse porte `ENTETES_MEDIA_FERMES` (`nosniff`, CSP fermée).
 */

/** 100 fichiers et 100 dossiers dans un formulaire ou du JSON · moins de 10 Ko. Au-delà, illisible. */
const CORPS_MAX = 16_384;
/** Une adresse publique (import par lien) · même borne que le proxy. */
const MAX_OCTETS_EXTERNE = 50_000_000;

const crcNatif = (zlib as { crc32?: (d: Uint8Array, v?: number) => number }).crc32;

function refus(status: number, raison: string, json: boolean): Response {
  return new Response(json ? JSON.stringify({ ok: false, raison }) : raison, {
    status,
    headers: { ...ENTETES_MEDIA_FERMES, 'content-type': json ? 'application/json; charset=utf-8' : 'text/plain; charset=utf-8', 'cache-control': 'private, no-store' },
  });
}

async function lireCorps(req: Request): Promise<string | null> {
  const lecteur = req.body?.getReader();
  if (!lecteur) return '';
  const morceaux: Uint8Array[] = [];
  let n = 0;
  try {
    for (;;) {
      const { done, value } = await lecteur.read();
      if (done) break;
      n += value.length;
      if (n > CORPS_MAX) return null;
      morceaux.push(value);
    }
  } finally {
    try { await lecteur.cancel(); } catch { /* flux déjà clos */ }
  }
  return Buffer.concat(morceaux).toString('utf8');
}

/** La demande · JSON `{ ids: [...], dossiers: [...] }` ou formulaire `ids=…&dossiers=…`. Rien d'autre n'est lu. */
async function lireDemande(req: Request): Promise<{ ids: unknown; dossiers: unknown }> {
  const illisible = { ids: null, dossiers: null };
  const corps = await lireCorps(req);
  if (corps === null) return illisible;
  const type = (req.headers.get('content-type') ?? '').toLowerCase();
  if (type.startsWith('application/json')) {
    try {
      const j = JSON.parse(corps) as { ids?: unknown; dossiers?: unknown } | null;
      return j && typeof j === 'object' && !Array.isArray(j) ? { ids: j.ids, dossiers: j.dossiers } : illisible;
    } catch { return illisible; }
  }
  if (type.startsWith('application/x-www-form-urlencoded')) {
    const f = new URLSearchParams(corps);
    return { ids: f.getAll('ids'), dossiers: f.getAll('dossiers') };
  }
  return illisible;
}

/** Relectures de taille · huit à la fois (le stockage n'est pas inondé par une seule demande). */
const RELECTURES_SIMULTANEES = 8;

async function enParallele<T>(taches: ReadonlyArray<() => Promise<T>>, n: number): Promise<T[]> {
  const sortie: T[] = new Array(taches.length);
  let suivant = 0;
  await Promise.all(Array.from({ length: Math.min(n, taches.length) }, async () => {
    while (suivant < taches.length) { const i = suivant++; sortie[i] = await taches[i]!(); }
  }));
  return sortie;
}

type Lecture = () => Promise<AsyncIterable<Uint8Array> | Iterable<Uint8Array> | null>;

export async function POST(req: Request): Promise<Response> {
  const json = new URL(req.url).searchParams.get('verifier') === '1';
  // Un formulaire posté depuis un autre site · refus (le cookie `lax` ne part déjà pas).
  if (req.headers.get('sec-fetch-site') === 'cross-site') return refus(403, 'forbidden', json);
  const s = await getSession();
  if (!s || !db) return refus(401, 'unauthorized', json);
  if (refusLectureBibliotheque(s)) return refus(404, TEXTE_REFUS_BIBLIOTHEQUE.role, json);

  const lu = await lireDemande(req);
  const v = validerDemandeArchive(lu.ids, lu.dossiers);
  if (!v.ok) return refus(400, v.raison, json);
  const ws = s.workspaceId;

  const A = schema.assets;
  // Une image téléversée porte ses octets dans `url` (`data:` URI, jusqu'à ~6 Mo) ·
  // cent lignes lues d'un coup pèseraient des centaines de Mo. On ne lit ici que
  // l'adresse des AUTRES fichiers ; les octets embarqués se lisent un par un,
  // au moment de les écrire dans l'archive.
  const embarque = sql<boolean>`(${A.url} ilike 'data:%')`;
  const colonnes = {
    id: A.id, name: A.name, sizeBytes: A.sizeBytes, deletedAt: A.deletedAt, folderId: A.folderId, mimeType: A.mimeType,
    embarque, adresse: sql<string | null>`case when ${embarque} then null else ${A.url} end`,
    kind: A.kind, source: A.source, externalId: A.externalId, brandId: A.brandId, createdAt: A.createdAt,
  };
  type Ligne = Awaited<ReturnType<typeof lireDemandes>>[number];
  const lireDemandes = () => (v.fichiers.length ? db!.select(colonnes).from(A).where(and(eq(A.workspaceId, ws), inArray(A.id, v.fichiers))) : Promise.resolve([]));
  const demandes = await lireDemandes();
  const F = schema.libraryFolders;
  // Un dossier · même portée que l'écran (`listAssets`, page Bibliothèque) · la marque
  // active et les éléments communs, sinon tout l'espace. Ce qu'on voit est ce qu'on télécharge.
  const marque = v.dossiers.length ? await getActiveBrand(ws) : null;
  // Les dossiers de l'ESPACE seuls · l'arborescence ne sort jamais de l'espace de la session.
  const dossiers = v.dossiers.length || demandes.some((l) => l.folderId)
    ? (await db.select({ id: F.id, parentId: F.parentId, deletedAt: F.deletedAt, name: F.name, brandId: F.brandId }).from(F).where(eq(F.workspaceId, ws)))
      .map((x) => ({ id: x.id, parentId: x.parentId, supprime: x.deletedAt != null, nom: x.name, horsPortee: !!marque && x.brandId != null && x.brandId !== marque.id }))
    : [];
  let contenus: Ligne[] = [];
  let compte = 0;
  if (v.dossiers.length) {
    const arbre = arborescenceArchive(v.dossiers, dossiers);
    if (!arbre.ok) return refus(409, arbre.raison, json);
    // Une requête, bornée · au-delà du plafond on ne lit pas tout pour refuser, le compte exact suffit.
    const rangs = await db.select({ ...colonnes, total: sql<number>`count(*) over ()` }).from(A)
      .where(and(eq(A.workspaceId, ws), isNull(A.deletedAt), inArray(A.folderId, arbre.dossiers), ...(marque ? [or(eq(A.brandId, marque.id), isNull(A.brandId))!] : [])))
      .limit(PLAFOND_ARCHIVE_FICHIERS + 1);
    compte = rangs.length ? Number(rangs[0]!.total) : 0;
    contenus = rangs;
  }
  const parId = new Map<string, Ligne>();
  for (const l of [...demandes, ...contenus]) parId.set(l.id, l);
  const lignes: LigneArchive[] = [...parId.values()].map((l) => ({ id: l.id, nom: l.name, tailleOctets: l.sizeBytes, supprime: l.deletedAt != null, dossierId: l.folderId, extension: extensionArchive(l.mimeType) }));
  const sel = selectionArchive({ fichiers: v.fichiers, dossiers: v.dossiers }, lignes, dossiers, { fichiersDansDossiers: compte });
  if (!sel.ok) return refus(409, sel.raison, json);

  // Chaque fichier · COMMENT le lire, décidé avant le premier octet (et avant de relire une taille).
  const cfg = storageFromEnv();
  const jetons = new Map<string, string | null>();
  type Plan = { lire: Lecture; taille: (() => Promise<unknown>) | null };
  const plans = new Map<string, Plan>();
  for (const f of sel.fichiers) {
    const l = parId.get(f.id)!;
    const adresse = l.adresse ?? '';
    const mode = assetServing({ id: l.id, kind: l.kind, source: l.source, url: adresse, embedded: !!l.embarque, externalId: l.externalId });
    if (mode === 'embedded') {
      const id = l.id;
      plans.set(f.id, {
        lire: async () => {
          const [e] = await db!.select({ url: A.url }).from(A).where(and(eq(A.workspaceId, ws), eq(A.id, id))).limit(1);
          const octets = e ? octetsDataUri(e.url) : null;
          return octets ? [new Uint8Array(octets)] : null;
        },
        taille: null,
      });
    } else if (mode === 'drive') {
      const cle = l.brandId ?? '';
      if (!jetons.has(cle)) {
        const rt = await driveRefreshTokenFor(ws, l.brandId);
        let jeton: string | null = null;
        if (rt) { try { jeton = await googleAccessToken(rt); } catch { jeton = null; } }
        jetons.set(cle, jeton);
      }
      const jeton = jetons.get(cle);
      if (!jeton) return refus(409, RAISONS_ARCHIVE.lecture, json);
      const fileId = l.externalId!;
      plans.set(f.id, {
        lire: async () => { const r = await fluxFichierDrive(jeton, fileId); return r && morceauxBornes(r); },
        taille: () => metaTailleFichierDrive(jeton, fileId),
      });
    } else if (isPrivateDriveUrl(adresse)) {
      // Lien Drive sans identifiant · lu sans jeton, Google rendrait une page de connexion.
      return refus(409, RAISONS_ARCHIVE.lecture, json);
    } else if (cfg && objectKeyFromUrl(cfg, adresse) !== null) {
      // Objet du bucket · lu seulement s'il est de CET espace (sinon refus, aucune requête).
      if (!privateObjectUrl(cfg, adresse, ws)) return refus(409, RAISONS_ARCHIVE.lecture, json);
      const url = adresse;
      plans.set(f.id, {
        lire: async () => { const r = await fluxObjetEspace(cfg, url, ws); return r && morceauxBornes(r); },
        taille: () => enteteTailleObjetEspace(cfg, url, ws),
      });
    } else if (/^https?:\/\//i.test(adresse)) {
      // Adresse publique · lue bornée par `safeFetch` ; sa taille n'est pas relue (un hôte tiers ne décide pas du plafond).
      const url = adresse;
      plans.set(f.id, {
        lire: async () => { const r = await safeFetch(url, { maxBytes: MAX_OCTETS_EXTERNE, timeoutMs: 20_000 }); return r ? [new Uint8Array(r.body)] : null; },
        taille: null,
      });
    } else {
      return refus(409, RAISONS_ARCHIVE.lecture, json);
    }
  }

  // Les tailles inconnues · relues au stockage, jamais écrites en base.
  const aRelire = relecturesArchive(sel);
  const relues = await enParallele(aRelire.map((id) => async () => {
    const t = plans.get(id)!.taille;
    return t ? tailleRelue(await t()) : null;
  }), RELECTURES_SIMULTANEES);
  const tailles = new Map<string, number>();
  aRelire.forEach((id, i) => { const t = relues[i]; if (t != null) tailles.set(id, t); });
  const d = conclureArchive(sel, tailles);
  if (!d.ok) return refus(409, d.raison, json);

  const nom = nomArchive(new Date());
  if (json) {
    return new Response(JSON.stringify({ ok: true, fichiers: d.fichiers.length, dossiers: d.repertoires.length, octets: d.octets, nom }), {
      status: 200,
      headers: { ...ENTETES_MEDIA_FERMES, 'content-type': 'application/json; charset=utf-8', 'cache-control': 'private, no-store' },
    });
  }

  const { fichiers, repertoires } = d;
  const maintenant = new Date();
  async function* entrees(): AsyncGenerator<EntreeZip> {
    // Les dossiers d'abord (parents avant enfants) · un dossier vide existe aussi à l'extraction.
    for (const chemin of repertoires) yield { nom: chemin, date: maintenant, octets: [] };
    for (const f of fichiers) {
      const octets = await plans.get(f.id)!.lire();
      if (!octets) throw new Error(`lecture impossible · ${f.id}`);
      yield { nom: f.nom, date: parId.get(f.id)!.createdAt, octets };
    }
  }
  const zip = fluxZip(entrees(), { plafondOctets: plafondArchiveReel(), crc: crcNatif ? (b, c) => crcNatif(b, c) : undefined });
  const corps = new ReadableStream<Uint8Array>({
    async pull(c) {
      try {
        const r = await zip.next();
        if (r.done) c.close(); else c.enqueue(r.value);
      } catch (e) {
        c.error(e);
      }
    },
    async cancel() { await zip.return(undefined); },
  }, { highWaterMark: 1 });

  return new Response(corps, {
    status: 200,
    headers: {
      ...ENTETES_MEDIA_FERMES,
      'content-type': 'application/zip',
      'content-disposition': `attachment; filename="${nom}"`,
      'cache-control': 'private, no-store',
    },
  });
}
