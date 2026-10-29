import { beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';

/**
 * Sécurité · dépôt de fichiers et adresses de logo · les VRAIES actions sur une
 * vraie base (pglite), stockage signé en local (aucun réseau).
 *  - `presignAssetUploadAction` refuse SVG, HTML, type inconnu, fichier vide ou
 *    trop lourd ; accepte un type de la liste et SIGNE son Content-Type ;
 *    l'extension de la clé vient du type, jamais du nom.
 *  - `saveBrandDAAction` refuse une adresse de logo NOUVELLE hors règle
 *    (`javascript:`, `http:`, IP, identifiants) sans rien écrire ; accepte une
 *    adresse https publique ; une adresse ancienne déjà en base se renvoie.
 * On lit ce que l'action REND et ce que la base CONTIENT.
 */
const etat = vi.hoisted(() => ({ session: null as null | Record<string, unknown> }));
vi.mock('@tiktrends/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tiktrends/db')>();
  const { pgMemoire } = await import('./helpers/pg-memoire');
  const db = await pgMemoire(actual.schema as unknown as Record<string, unknown>);
  return { ...actual, db };
});
vi.mock('../lib/auth', () => ({ getSession: async () => etat.session }));
vi.mock('next/navigation', () => ({ redirect: (u: string) => { throw new Error(`REDIRECT ${u}`); }, notFound: () => { throw new Error('NOT_FOUND'); } }));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }) }));

import { db, schema, eq } from '@tiktrends/db';
import { MESSAGES_REFUS_DEPOT, MESSAGES_REFUS_LOGO } from '@tiktrends/core';
import { presignAssetUploadAction } from '../app/actions/assets';
import { saveBrandDAAction } from '../app/actions/brand-detail';

const ANCIEN = 'http://ancien-site.fr/logo.png';
async function marque() {
  const ws = randomUUID(); const id = randomUUID(); const user = randomUUID();
  await db.insert(schema.workspaces).values({ id: ws, name: 'Espace', plan: 'core' });
  await db.insert(schema.users).values({ id: user, email: `${user.slice(0, 8)}@exemple.invalid` });
  await db.insert(schema.brands).values({ id, workspaceId: ws, name: 'Maison', logoUrl: ANCIEN, logos: [ANCIEN], colors: ['#112233'], fonts: ['Inter'] });
  etat.session = { workspaceId: ws, workspaceName: 'Espace', role: 'admin', plan: 'core', user: { id: user, email: `${user.slice(0, 8)}@exemple.invalid`, name: null } };
  return { ws, id };
}
const lire = async (id: string) => (await db.select().from(schema.brands).where(eq(schema.brands.id, id)))[0]!;
const charte = (brandId: string, logoUrl: string, logos: string[]) => saveBrandDAAction({ brandId, logoUrl, logos, colors: ['#112233'], fonts: ['Inter'] });

beforeEach(() => {
  etat.session = null;
  vi.stubEnv('S3_ENDPOINT', 's3.gra.exemple.invalid'); vi.stubEnv('S3_BUCKET', 'tt'); vi.stubEnv('S3_ACCESS_KEY_ID', 'k'); vi.stubEnv('S3_SECRET_ACCESS_KEY', 's');
  vi.stubEnv('S3_PUBLIC_BASE_URL', '');
});

describe('presignAssetUploadAction · liste blanche, plafonds, type signé', () => {
  it('refuse SVG, HTML (casse et paramètres compris), type inconnu, fichier vide ou trop lourd · aucune adresse rendue', async () => {
    await marque();
    const cas: Array<[string, string, number, string]> = [
      ['logo.svg', 'image/svg+xml', 10, MESSAGES_REFUS_DEPOT.type],
      ['page.png', 'TEXT/HTML; charset=utf-8', 10, MESSAGES_REFUS_DEPOT.type],
      ['x.html', 'application/octet-stream', 10, MESSAGES_REFUS_DEPOT.type],
      ['a.zip', 'application/zip', 10, MESSAGES_REFUS_DEPOT.type],
      ['a.png', 'image/png', 0, MESSAGES_REFUS_DEPOT.vide],
      ['a.png', 'image/png', 64 * 1024 * 1024 + 1, 'Image trop lourde (64 Mo au plus).'],
      ['a.mp4', 'video/mp4', 1_073_741_825, 'Vidéo trop lourde (1 Go au plus).'],
    ];
    for (const [filename, contentType, sizeBytes, erreur] of cas) {
      expect(await presignAssetUploadAction({ filename, contentType, sizeBytes }), `${filename} ${contentType}`).toEqual({ error: erreur });
    }
  });

  it('accepte un PNG · rangé chez CET espace, extension forcée par le type, Content-Type signé et rendu', async () => {
    const m = await marque();
    const r = await presignAssetUploadAction({ filename: 'page.html', contentType: 'IMAGE/PNG; charset=utf-8', sizeBytes: 12_000 });
    expect(r.error).toBeUndefined();
    expect(r.contentType).toBe('image/png');
    expect(r.publicUrl).toMatch(new RegExp(`/assets/${m.ws}/\\d+-[0-9a-f]{8}-page\\.png$`));
    const u = new URL(r.uploadUrl!);
    expect(u.searchParams.get('X-Amz-SignedHeaders')).toBe('content-type;host');
    expect(u.pathname.endsWith('-page.png')).toBe(true);
  });

  it('PDF et vidéo des appelants existants · acceptés (PDF en type neutre)', async () => {
    await marque();
    expect(await presignAssetUploadAction({ filename: 'devis.pdf', contentType: 'application/pdf', sizeBytes: 10 })).toMatchObject({ contentType: 'application/octet-stream' });
    expect(await presignAssetUploadAction({ filename: 'a.mp4', contentType: 'video/mp4', sizeBytes: 10 })).toMatchObject({ contentType: 'video/mp4' });
  });
});

describe('saveBrandDAAction · adresse de logo', () => {
  it('refuse une adresse nouvelle hors règle, avec son message, et n’écrit rien', async () => {
    const m = await marque();
    const cas: Array<[string, string]> = [
      ['javascript:alert(1)', MESSAGES_REFUS_LOGO.schema],
      ['http://exemple.fr/logo.png', MESSAGES_REFUS_LOGO.schema],
      ['data:image/svg+xml,<svg onload=alert(1)>', MESSAGES_REFUS_LOGO.schema],
      ['https://169.254.169.254/latest/meta-data', MESSAGES_REFUS_LOGO.hote],
      ['https://[::1]/logo.png', MESSAGES_REFUS_LOGO.hote],
      ['https://localhost/logo.png', MESSAGES_REFUS_LOGO.hote],
      ['https://user:mdp@exemple.fr/logo.png', MESSAGES_REFUS_LOGO.identifiants],
    ];
    for (const [adresse, erreur] of cas) {
      expect(await charte(m.id, adresse, [ANCIEN, adresse]), adresse).toEqual({ error: erreur });
      expect(await charte(m.id, ANCIEN, [ANCIEN, adresse]), `variante ${adresse}`).toEqual({ error: erreur });
    }
    const b = await lire(m.id);
    expect(b.logoUrl).toBe(ANCIEN);
    expect(b.logos).toEqual([ANCIEN]);
  });

  it('accepte une adresse https publique, et renvoie l’ancienne telle quelle (aucune donnée réécrite)', async () => {
    const m = await marque();
    const NEUF = 'https://cdn.exemple.fr/logo.png';
    expect(await charte(m.id, NEUF, [ANCIEN, NEUF])).toEqual({ ok: true });
    let b = await lire(m.id);
    expect(b.logoUrl).toBe(NEUF);
    expect(b.logos).toEqual([ANCIEN, NEUF]);
    // Remettre l'ancienne par défaut · elle était déjà là, elle passe.
    expect(await charte(m.id, ANCIEN, [ANCIEN, NEUF])).toEqual({ ok: true });
    b = await lire(m.id);
    expect(b.logoUrl).toBe(ANCIEN);
  });

  it('un fichier de logo importé dans le bucket de l’espace est admis, celui d’un autre espace refusé', async () => {
    const m = await marque();
    const pre = await presignAssetUploadAction({ filename: 'logo.png', contentType: 'image/png', sizeBytes: 100 });
    expect(await charte(m.id, pre.publicUrl!, [ANCIEN, pre.publicUrl!])).toEqual({ ok: true });
    vi.stubEnv('S3_ENDPOINT', '127.0.0.1:9443');
    const local = `https://127.0.0.1:9443/tt/assets/${m.ws}/1-abcd1234-logo.png`;
    expect(await charte(m.id, local, [local]), 'objet de l’espace sur un stockage local (banc)').toEqual({ ok: true });
    const autre = `https://127.0.0.1:9443/tt/assets/${randomUUID()}/1-abcd1234-logo.png`;
    expect(await charte(m.id, autre, [local, autre])).toEqual({ error: MESSAGES_REFUS_LOGO.port });
  });
});
