import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * `syncDriveAssets` de bout en bout (synchro de DOSSIER Drive) · Drive et le
 * bucket sont remplacés par des tables en mémoire, la règle de tri est la
 * vraie (`entreeSynchroDrive`, noyau). On lit ce qui SORT : lignes insérées,
 * objets déposés (clé et type), téléchargements faits.
 */

const etat = vi.hoisted(() => ({
  fichiers: [] as Array<{ id: string; name: string; mimeType: string; size?: number; webViewLink?: string }>,
  octets: new Map<string, Buffer>(),
  telechargements: [] as string[],
  depots: [] as Array<{ key: string; contentType: string }>,
}));

vi.mock('../src/google-drive', () => ({
  googleAccessToken: async () => 'acces',
  driveListFilesDeep: async () => etat.fichiers,
  driveDownload: async (_t: string, id: string) => { etat.telechargements.push(id); return etat.octets.get(id)!; },
  driveThumbnailLink: async () => null,
  driveThumbBytes: async () => null,
}));
vi.mock('../src/storage', () => ({
  putObject: async (_c: unknown, key: string, _b: Buffer, contentType: string) => { etat.depots.push({ key, contentType }); return `https://cdn.test/b/${key}`; },
}));

import { syncDriveAssets, type DriveAssetInput } from '../src/drive-sync';

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAYAAAAECAIAAAAiZtkUAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEUlEQVR4nGP4H9OFhhjIFQIAy24teZ6V9CwAAAAASUVORK5CYII=', 'base64');
const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
const TIFF = Buffer.from([0x49, 0x49, 0x2a, 0, 8, 0, 0, 0]);
const STORAGE = { endpoint: 's3.test', region: 'gra', bucket: 'b', accessKeyId: 'k', secretAccessKey: 's' };

async function synchro(): Promise<{ res: Awaited<ReturnType<typeof syncDriveAssets>>; lignes: DriveAssetInput[] }> {
  const lignes: DriveAssetInput[] = [];
  const res = await syncDriveAssets({ existingDriveIds: async () => new Set(), insertAsset: async (a) => { lignes.push(a); } },
    { storage: STORAGE, refreshToken: 'rt', folderId: 'dossier', workspaceId: 'ws1' });
  return { res, lignes };
}
const lien = (id: string) => `https://drive.google.com/file/d/${id}/view`;

beforeEach(() => {
  etat.fichiers = []; etat.octets.clear(); etat.telechargements = []; etat.depots = [];
});

describe('syncDriveAssets · tri des fichiers d’un dossier Drive', () => {
  it('PNG : téléchargé, type relu, déposé en image/png, ligne image', async () => {
    etat.fichiers = [{ id: 'p1', name: 'photo.jpeg', mimeType: 'image/jpeg', size: PNG.length, webViewLink: lien('p1') }];
    etat.octets.set('p1', PNG);
    const { res, lignes } = await synchro();
    expect(res).toMatchObject({ added: 1, skipped: 0, errors: 0 });
    expect(etat.depots).toEqual([{ key: 'assets/ws1/drive-p1.png', contentType: 'image/png' }]);
    expect(lignes[0]).toMatchObject({ kind: 'image', mimeType: 'image/png', externalId: 'p1' });
  });

  it('PDF (non média, non exécutable) : importé en téléchargement seul, kind other, rien déposé', async () => {
    etat.fichiers = [{ id: 'd1', name: 'brief.pdf', mimeType: 'application/pdf', size: 10, webViewLink: lien('d1') }];
    const { res, lignes } = await synchro();
    expect(res).toMatchObject({ added: 1, skipped: 0 });
    expect(lignes[0]).toMatchObject({ kind: 'other', mimeType: 'application/pdf', url: lien('d1'), externalId: 'd1' });
    expect(etat.telechargements).toEqual([]);
  });

  it('TIFF : image rare, déposée en application/octet-stream', async () => {
    etat.fichiers = [{ id: 't1', name: 'scan.tif', mimeType: 'image/tiff', size: TIFF.length, webViewLink: lien('t1') }];
    etat.octets.set('t1', TIFF);
    const { lignes } = await synchro();
    expect(etat.depots).toEqual([{ key: 'assets/ws1/drive-t1.bin', contentType: 'application/octet-stream' }]);
    expect(lignes[0]).toMatchObject({ kind: 'image', mimeType: 'image/tiff' });
  });

  it('SVG, HTML, XML, JavaScript : ignorés, ni téléchargés ni déposés', async () => {
    etat.fichiers = [
      { id: 's1', name: 'logo.svg', mimeType: 'image/svg+xml', webViewLink: lien('s1') },
      { id: 'h1', name: 'page.html', mimeType: 'text/html', webViewLink: lien('h1') },
      { id: 'x1', name: 'flux.xml', mimeType: 'application/xml', webViewLink: lien('x1') },
      { id: 'j1', name: 'a.js', mimeType: 'text/javascript', webViewLink: lien('j1') },
    ];
    const { res, lignes } = await synchro();
    expect(res).toMatchObject({ added: 0, skipped: 4 });
    expect(lignes).toEqual([]);
    expect(etat.telechargements).toEqual([]);
    expect(etat.depots).toEqual([]);
  });

  it('« PNG » dont les octets sont un SVG : ignoré, rien déposé', async () => {
    etat.fichiers = [{ id: 'f1', name: 'faux.png', mimeType: 'image/png', size: SVG.length, webViewLink: lien('f1') }];
    etat.octets.set('f1', SVG);
    const { res, lignes } = await synchro();
    expect(res).toMatchObject({ added: 0, skipped: 1 });
    expect(lignes).toEqual([]);
    expect(etat.depots).toEqual([]);
  });
});
