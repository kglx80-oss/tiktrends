import * as zlib from 'node:zlib';
import { morceauxBornes, plafondArchiveReel } from '../../../../lib/archive-lecture';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import {
  decisionArchive, fluxZip, nomArchive, validerIdsArchive, extensionArchive, ENTETES_MEDIA_FERMES, RAISONS_ARCHIVE,
  type EntreeZip,
} from '@tiktrends/core';
import { googleAccessToken, objectKeyFromUrl, privateObjectUrl, storageFromEnv } from '@tiktrends/integrations';
import { fluxFichierDrive, fluxObjetEspace } from '@tiktrends/integrations/src/lecture-flux';
import { safeFetch } from '@tiktrends/integrations/src/safe-fetch';
import { getSession } from '../../../../lib/auth';
import { driveRefreshTokenFor } from '../../../../lib/drive-token';
import { assetServing, isPrivateDriveUrl } from '../../../../lib/asset-url';
import { octetsDataUri } from '../../../../lib/import-image';
import { refusLectureBibliotheque, TEXTE_REFUS_BIBLIOTHEQUE } from '../../../../lib/bibliotheque-acces';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Bibliothèque · le TÉLÉCHARGEMENT GROUPÉ · une archive ZIP des fichiers
 * sélectionnés, écrite EN FLUX (geste « Télécharger » de la barre de sélection).
 *
 * ── La garde · la même que les proxys `/api/asset/[id]` et `/api/drive-img/[id]` ──
 *
 * Session, puis règle de LECTURE de la Bibliothèque (`refusLectureBibliotheque` ·
 * rôle Membre, sans offre), puis l'espace de la SESSION · jamais un espace
 * fourni. La requête ne lit que des lignes de cet espace.
 *
 * ── Ce que la route reçoit · des identifiants, rien d'autre ─────────────────
 *
 * `ids` · des UUID, dédoublonnés, 1 à `TAG_SELECTION_MAX` (`validerIdsArchive`,
 * noyau). Tout autre champ est ignoré · aucune adresse fournie par le client
 * n'est lue. Chaque objet est lu par son adresse EN BASE, par les mêmes portes
 * que le proxy : octets embarqués décodés, objet du bucket de l'espace lu par
 * lien signé vers l'hôte du stockage configuré (`fluxObjetEspace`), fichier
 * Drive lu avec le jeton de l'espace, adresse publique lue par `safeFetch`
 * (bornée). Un objet du bucket hors de l'espace n'est jamais demandé.
 *
 * ── Tout ou rien, AVANT le premier octet ────────────────────────────────────
 *
 * `decisionArchive` (noyau) refuse l'archive ENTIÈRE dès qu'un identifiant
 * n'est pas un fichier vivant de l'espace (inconnu, autre espace, corbeille,
 * dossier en corbeille), qu'une taille est inconnue, ou que la somme des
 * `size_bytes` dépasse `PLAFOND_ARCHIVE_OCTETS` · même phrase qu'à l'écran.
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

/** Plus que 100 identifiants dans un formulaire ou du JSON · quelques Ko. Au-delà, illisible. */
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

/** Les identifiants demandés · JSON `{ ids: [...] }` ou formulaire `ids=…`. Rien d'autre n'est lu. */
async function lireIds(req: Request): Promise<unknown> {
  const corps = await lireCorps(req);
  if (corps === null) return null;
  const type = (req.headers.get('content-type') ?? '').toLowerCase();
  if (type.startsWith('application/json')) {
    try { const j = JSON.parse(corps) as { ids?: unknown }; return j && typeof j === 'object' ? j.ids : null; } catch { return null; }
  }
  if (type.startsWith('application/x-www-form-urlencoded')) return new URLSearchParams(corps).getAll('ids');
  return null;
}

type Lecture = () => Promise<AsyncIterable<Uint8Array> | Iterable<Uint8Array> | null>;

export async function POST(req: Request): Promise<Response> {
  const json = new URL(req.url).searchParams.get('verifier') === '1';
  // Un formulaire posté depuis un autre site · refus (le cookie `lax` ne part déjà pas).
  if (req.headers.get('sec-fetch-site') === 'cross-site') return refus(403, 'forbidden', json);
  const s = await getSession();
  if (!s || !db) return refus(401, 'unauthorized', json);
  if (refusLectureBibliotheque(s)) return refus(404, TEXTE_REFUS_BIBLIOTHEQUE.role, json);

  const v = validerIdsArchive(await lireIds(req));
  if (!v.ok) return refus(400, v.raison, json);

  const A = schema.assets;
  // Une image téléversée porte ses octets dans `url` (`data:` URI, jusqu'à ~6 Mo) ·
  // cent lignes lues d'un coup pèseraient des centaines de Mo. On ne lit ici que
  // l'adresse des AUTRES fichiers ; les octets embarqués se lisent un par un,
  // au moment de les écrire dans l'archive.
  const embarque = sql<boolean>`(${A.url} ilike 'data:%')`;
  const lignes = await db.select({
    id: A.id, name: A.name, sizeBytes: A.sizeBytes, deletedAt: A.deletedAt, folderId: A.folderId, mimeType: A.mimeType,
    embarque, adresse: sql<string | null>`case when ${embarque} then null else ${A.url} end`,
    kind: A.kind, source: A.source, externalId: A.externalId, brandId: A.brandId, createdAt: A.createdAt,
  }).from(A).where(and(eq(A.workspaceId, s.workspaceId), inArray(A.id, v.ids)));
  const F = schema.libraryFolders;
  const dossiers = lignes.some((l) => l.folderId)
    ? await db.select({ id: F.id, parentId: F.parentId, deletedAt: F.deletedAt }).from(F).where(eq(F.workspaceId, s.workspaceId))
    : [];
  const d = decisionArchive(
    v.ids,
    lignes.map((l) => ({ id: l.id, nom: l.name, tailleOctets: l.sizeBytes, supprime: l.deletedAt != null, dossierId: l.folderId, extension: extensionArchive(l.mimeType) })),
    dossiers.map((x) => ({ id: x.id, parentId: x.parentId, supprime: x.deletedAt != null })),
  );
  if (!d.ok) return refus(409, d.raison, json);

  // Chaque fichier · COMMENT le lire, décidé avant le premier octet.
  const cfg = storageFromEnv();
  const parId = new Map(lignes.map((l) => [l.id, l] as const));
  const jetons = new Map<string, string | null>();
  const lectures: Lecture[] = [];
  for (const f of d.fichiers) {
    const l = parId.get(f.id)!;
    const adresse = l.adresse ?? '';
    const mode = assetServing({ id: l.id, kind: l.kind, source: l.source, url: adresse, embedded: !!l.embarque, externalId: l.externalId });
    if (mode === 'embedded') {
      const id = l.id;
      lectures.push(async () => {
        const [e] = await db!.select({ url: A.url }).from(A).where(and(eq(A.workspaceId, s.workspaceId), eq(A.id, id))).limit(1);
        const octets = e ? octetsDataUri(e.url) : null;
        return octets ? [new Uint8Array(octets)] : null;
      });
    } else if (mode === 'drive') {
      const cle = l.brandId ?? '';
      if (!jetons.has(cle)) {
        const rt = await driveRefreshTokenFor(s.workspaceId, l.brandId);
        let jeton: string | null = null;
        if (rt) { try { jeton = await googleAccessToken(rt); } catch { jeton = null; } }
        jetons.set(cle, jeton);
      }
      const jeton = jetons.get(cle);
      if (!jeton) return refus(409, RAISONS_ARCHIVE.lecture, json);
      const fileId = l.externalId!;
      lectures.push(async () => { const r = await fluxFichierDrive(jeton, fileId); return r && morceauxBornes(r); });
    } else if (isPrivateDriveUrl(adresse)) {
      // Lien Drive sans identifiant · lu sans jeton, Google rendrait une page de connexion.
      return refus(409, RAISONS_ARCHIVE.lecture, json);
    } else if (cfg && objectKeyFromUrl(cfg, adresse) !== null) {
      // Objet du bucket · lu seulement s'il est de CET espace (sinon refus, aucune requête).
      if (!privateObjectUrl(cfg, adresse, s.workspaceId)) return refus(409, RAISONS_ARCHIVE.lecture, json);
      const url = adresse;
      lectures.push(async () => { const r = await fluxObjetEspace(cfg, url, s.workspaceId); return r && morceauxBornes(r); });
    } else if (/^https?:\/\//i.test(adresse)) {
      const url = adresse;
      lectures.push(async () => { const r = await safeFetch(url, { maxBytes: MAX_OCTETS_EXTERNE, timeoutMs: 20_000 }); return r ? [new Uint8Array(r.body)] : null; });
    } else {
      return refus(409, RAISONS_ARCHIVE.lecture, json);
    }
  }

  const nom = nomArchive(new Date());
  if (json) {
    return new Response(JSON.stringify({ ok: true, fichiers: d.fichiers.length, octets: d.octets, nom }), {
      status: 200,
      headers: { ...ENTETES_MEDIA_FERMES, 'content-type': 'application/json; charset=utf-8', 'cache-control': 'private, no-store' },
    });
  }

  const fichiers = d.fichiers;
  async function* entrees(): AsyncGenerator<EntreeZip> {
    for (let i = 0; i < fichiers.length; i++) {
      const f = fichiers[i]!;
      const octets = await lectures[i]!();
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
