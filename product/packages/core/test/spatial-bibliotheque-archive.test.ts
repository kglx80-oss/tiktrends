import { describe, expect, it } from 'vitest';
import { randomBytes } from 'node:crypto';
import * as zlib from 'node:zlib';
import {
  crc32, fluxZip, dateDos, ErreurArchive, nomFichierArchive, nomsArchive, decisionArchive, validerIdsArchive, gesteTelechargement, nomArchive,
  extensionArchive, refusArchiveTailleInconnue, refusArchiveTropDeFichiers, refusArchiveVolume, donneesDrive, gestesSelection,
  PLAFOND_ARCHIVE_OCTETS, NOM_ARCHIVE_OCTETS_MAX, RAISONS_ARCHIVE, TAG_SELECTION_MAX,
  type DossierSource, type EntreeZip, type LigneArchive, type MediaSource,
} from '../src';
import { lireZip } from './helpers/lire-zip';

/**
 * Bibliothèque · le téléchargement groupé en archive ZIP · règles pures.
 * L'archive écrite par le noyau est RELUE par un lecteur indépendant
 * (`helpers/lire-zip.ts`, CRC de `node:zlib`) · on compare les octets.
 */

const c = (...codes: number[]) => String.fromCharCode(...codes);
const octets = (s: string) => new TextEncoder().encode(s);
async function archive(entrees: Iterable<EntreeZip> | AsyncIterable<EntreeZip>, plafondOctets?: number): Promise<Buffer> {
  const morceaux: Uint8Array[] = [];
  for await (const m of fluxZip(entrees, { plafondOctets })) morceaux.push(m);
  return Buffer.concat(morceaux);
}
/** Des morceaux de tailles irrégulières · un fichier arrive rarement d'un seul bloc. */
function* decouper(b: Uint8Array, tailles = [1, 7, 4096, 65536, 3]): Generator<Uint8Array> {
  let i = 0, k = 0;
  while (i < b.length) { const n = tailles[k++ % tailles.length]!; yield b.subarray(i, i + n); i += n; }
}

describe('CRC-32', () => {
  it('vecteurs connus · « 123456789 » ⇒ CBF43926, vide ⇒ 0', () => {
    expect(crc32(octets('123456789')).toString(16)).toBe('cbf43926');
    expect(crc32(new Uint8Array(0))).toBe(0);
  });
  it('identique à node:zlib sur toutes les longueurs de 0 à 300 et sur 1 Mo, et incrémental', () => {
    const z = (zlib as { crc32?: (d: Uint8Array, v?: number) => number }).crc32!;
    const b = randomBytes(1_048_576);
    for (let n = 0; n <= 300; n++) expect(crc32(b.subarray(0, n)), `longueur ${n}`).toBe(z(b.subarray(0, n)) >>> 0);
    expect(crc32(b)).toBe(z(b) >>> 0);
    let suite = 0;
    for (const m of decouper(b)) suite = crc32(m, suite);
    expect(suite).toBe(z(b) >>> 0);
  });
});

describe('l’archive « store » écrite en flux se relit à l’identique', () => {
  it('trois fichiers (vide, texte, 300 Ko en morceaux irréguliers), noms UTF-8 · octets, noms et dates relus', async () => {
    const gros = randomBytes(300_000);
    const date = new Date('2026-11-01T10:20:30Z');
    const zip = await archive([
      { nom: 'vide.txt', date, octets: [] },
      { nom: 'Été · photo.jpg', date, octets: [octets('bonjour')] },
      { nom: 'vidéo.mp4', date, octets: decouper(gros) },
    ]);
    const lu = lireZip(zip);
    expect(lu.map((e) => e.nom)).toEqual(['vide.txt', 'Été · photo.jpg', 'vidéo.mp4']);
    expect(lu.map((e) => e.unicode)).toEqual(['vide.txt', 'Été · photo.jpg', 'vidéo.mp4']);
    expect(lu[0]!.octets.length).toBe(0);
    expect(lu[1]!.octets.toString('utf8')).toBe('bonjour');
    expect(lu[2]!.octets.equals(gros)).toBe(true);
    expect(lu[2]!.date).toBe(((2026 - 1980) << 9) | (11 << 5) | 1);
    expect(lu[2]!.heure).toBe((10 << 11) | (20 << 5) | 15);
  });

  it('les entrées et les octets arrivent d’itérables ASYNCHRONES (corps de réponse)', async () => {
    const a = randomBytes(5000);
    async function* corps() { for (const m of decouper(a, [1000])) { await Promise.resolve(); yield m; } }
    async function* entrees(): AsyncGenerator<EntreeZip> { yield { nom: 'a.bin', date: new Date(0), octets: corps() }; }
    const lu = lireZip(await archive(entrees()));
    expect(lu[0]!.octets.equals(a)).toBe(true);
  });

  it('archive vide · une fin de répertoire seule, relisible', async () => {
    expect(lireZip(await archive([]))).toEqual([]);
  });

  it('au-delà du plafond d’OCTETS RÉELS · le flux lève ErreurArchive(volume), aucune fin d’archive écrite', async () => {
    const morceaux: Uint8Array[] = [];
    let erreur: unknown = null;
    try {
      for await (const m of fluxZip([{ nom: 'a', date: new Date(), octets: [new Uint8Array(600)] }, { nom: 'b', date: new Date(), octets: [new Uint8Array(600)] }], { plafondOctets: 1000 })) morceaux.push(m);
    } catch (e) { erreur = e; }
    expect(erreur).toBeInstanceOf(ErreurArchive);
    expect((erreur as ErreurArchive).motif).toBe('volume');
    expect(() => lireZip(Buffer.concat(morceaux))).toThrow('fin du répertoire central introuvable');
  });

  it('exactement au plafond · l’archive passe', async () => {
    const lu = lireZip(await archive([{ nom: 'a', date: new Date(), octets: [new Uint8Array(1000)] }], 1000));
    expect(lu[0]!.octets.length).toBe(1000);
  });

  it('dates hors de la plage MS-DOS · ramenées au 1er janvier de la borne, jamais une valeur repliée', () => {
    expect(dateDos(new Date('1970-06-01T00:00:00Z'))).toEqual({ date: (0 << 9) | (1 << 5) | 1, heure: 0 });
    expect(dateDos(new Date('invalide'))).toEqual({ date: (0 << 9) | (1 << 5) | 1, heure: 0 });
  });
});

describe('les noms dans l’archive · assainis', () => {
  const sur = (n: string) => {
    expect(n, n).not.toMatch(/[\\/:*?"<>|]/);
    expect(n.startsWith('.'), n).toBe(false);
    expect(/[\x00-\x1f\x7f]/.test(n), n).toBe(false);
  };
  it('ni remontée (`../`), ni chemin absolu, ni lettre de lecteur · un seul nom, à plat', () => {
    for (const brut of ['../../etc/passwd', '/etc/shadow', '..\\..\\boot.ini', 'C:\\Windows\\win.ini', 'a/b/c.jpg', '..', '.', './.././x.png']) {
      const n = nomFichierArchive(brut);
      sur(n);
      expect(n.includes('..'), `${brut} ⇒ ${n}`).toBe(false);
    }
    expect(nomFichierArchive('../../etc/passwd')).toBe('-.-etc-passwd');
    expect(nomFichierArchive('C:\\Windows\\win.ini')).toBe('C--Windows-win.ini');
    expect(nomFichierArchive('a/b/c.jpg')).toBe('a-b-c.jpg');
    expect(nomFichierArchive('..')).toBe('fichier');
  });
  it('caractères de contrôle et d’inversion bidi retirés · « photo + U+202E + gpj.exe » ne se maquille plus', () => {
    expect(nomFichierArchive(`a${c(0)}b${c(7)}c${c(27)}d${c(127)}e${c(0x85)}.jpg`)).toBe('abcde.jpg');
    expect(nomFichierArchive(`photo${c(0x202e)}gpj.exe`)).toBe('photogpj.exe');
    expect(nomFichierArchive(`x${c(0x200b)}${c(0xfeff)}${c(0x2066)}y.png`)).toBe('xy.png');
    expect(nomFichierArchive(`ligne${c(10)}deux${c(13)}.txt`)).toBe('lignedeux.txt');
  });
  it('noms réservés sous Windows préfixés · points et espaces de bord retirés · vide ⇒ « fichier »', () => {
    expect(nomFichierArchive('CON.jpg')).toBe('_CON.jpg');
    expect(nomFichierArchive('lpt1')).toBe('_lpt1');
    expect(nomFichierArchive('  photo final .  ')).toBe('photo final');
    expect(nomFichierArchive('   ')).toBe('fichier');
    expect(nomFichierArchive(null)).toBe('fichier');
    expect(nomFichierArchive('.cache')).toBe('cache');
  });
  it('sans extension · celle du type connu est ajoutée ; avec · gardée telle quelle', () => {
    expect(nomFichierArchive('logo', extensionArchive('image/png'))).toBe('logo.png');
    expect(nomFichierArchive('logo.webp', extensionArchive('image/png'))).toBe('logo.webp');
    expect(nomFichierArchive('notice', extensionArchive('application/pdf'))).toBe('notice.pdf');
    expect(nomFichierArchive('x', extensionArchive('text/html'))).toBe('x');
  });
  it(`nom trop long · coupé à ${NOM_ARCHIVE_OCTETS_MAX} octets UTF-8, extension gardée, jamais au milieu d’un caractère`, () => {
    const n = nomFichierArchive(`${'é'.repeat(300)}.jpeg`);
    expect(new TextEncoder().encode(n).length).toBeLessThanOrEqual(NOM_ARCHIVE_OCTETS_MAX);
    expect(n.endsWith('é.jpeg')).toBe(true);
    expect(n.normalize('NFC')).toBe(n);
  });
});

describe('les doublons · renommés « nom (2).ext »', () => {
  it('la première occurrence garde son nom · la casse est confondue (Windows, macOS) · un nom existant n’est jamais repris', () => {
    expect(nomsArchive([{ nom: 'a.jpg' }, { nom: 'A.JPG' }, { nom: 'a.jpg' }, { nom: 'a (2).jpg' }])).toEqual(['a.jpg', 'A (3).JPG', 'a (4).jpg', 'a (2).jpg']);
    expect(nomsArchive([{ nom: 'photo.png' }, { nom: 'photo.png' }, { nom: 'photo.png' }])).toEqual(['photo.png', 'photo (2).png', 'photo (3).png']);
    expect(nomsArchive([{ nom: 'x' }, { nom: 'x' }])).toEqual(['x', 'x (2)']);
  });
  it('deux noms qui ne diffèrent qu’après assainissement sont des doublons', () => {
    expect(nomsArchive([{ nom: 'a/b.jpg' }, { nom: 'a\\b.jpg' }, { nom: `a-b${c(0)}.jpg` }])).toEqual(['a-b.jpg', 'a-b (2).jpg', 'a-b (3).jpg']);
  });
  it('cent fois le même nom, très long · tous distincts (casse ignorée), tous sous la borne', () => {
    const noms = nomsArchive(Array.from({ length: TAG_SELECTION_MAX }, () => ({ nom: `${'x'.repeat(400)}.jpg` })));
    expect(new Set(noms.map((n) => n.toLowerCase())).size).toBe(TAG_SELECTION_MAX);
    for (const n of noms) expect(new TextEncoder().encode(n).length).toBeLessThanOrEqual(NOM_ARCHIVE_OCTETS_MAX);
    expect(noms[99]!.endsWith(' (100).jpg')).toBe(true);
  });
});

const U = (i: number) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`;
const ligne = (i: number, o: Partial<LigneArchive> = {}): LigneArchive => ({ id: U(i), nom: `f${i}.jpg`, tailleOctets: 1000, supprime: false, dossierId: null, ...o });

describe('la liste reçue · des UUID, bornée', () => {
  it('illisible, vide, trop longue · refus entier avec sa phrase ; dédoublonnée sans casse', () => {
    expect(validerIdsArchive('x')).toEqual({ ok: false, raison: RAISONS_ARCHIVE.illisible });
    expect(validerIdsArchive([U(1), 'pas-un-uuid'])).toEqual({ ok: false, raison: RAISONS_ARCHIVE.illisible });
    expect(validerIdsArchive([U(1), 3])).toEqual({ ok: false, raison: RAISONS_ARCHIVE.illisible });
    expect(validerIdsArchive([])).toEqual({ ok: false, raison: RAISONS_ARCHIVE.vide });
    const trop = Array.from({ length: TAG_SELECTION_MAX + 1 }, (_, i) => U(i));
    expect(validerIdsArchive(trop)).toEqual({ ok: false, raison: refusArchiveTropDeFichiers(TAG_SELECTION_MAX + 1) });
    expect(validerIdsArchive(trop.slice(1))).toMatchObject({ ok: true });
    expect(validerIdsArchive([U(1), U(1).toUpperCase()])).toEqual({ ok: true, ids: [U(1)] });
  });
});

describe('la décision de la route · tout ou rien', () => {
  it('chaque fichier vivant de l’espace · l’archive suit l’ordre de la demande, noms dédoublonnés, volume sommé', () => {
    const d = decisionArchive([U(2), U(1)], [ligne(1, { nom: 'a.jpg' }), ligne(2, { nom: 'a.jpg', tailleOctets: 5 })], []);
    expect(d).toEqual({ ok: true, octets: 1005, fichiers: [{ id: U(2), nom: 'a.jpg', tailleOctets: 5 }, { id: U(1), nom: 'a (2).jpg', tailleOctets: 1000 }] });
  });
  it('un identifiant absent (autre espace, inconnu) · refus entier', () => {
    expect(decisionArchive([U(1), U(9)], [ligne(1)], [])).toEqual({ ok: false, raison: RAISONS_ARCHIVE.introuvable });
  });
  it('un fichier en corbeille · refus entier', () => {
    expect(decisionArchive([U(1), U(2)], [ligne(1), ligne(2, { supprime: true })], [])).toEqual({ ok: false, raison: RAISONS_ARCHIVE.introuvable });
  });
  it('un fichier rangé sous un dossier en corbeille (même un ancêtre) · refus entier ; dossier vivant · passe', () => {
    const dossiers = [{ id: 'x', parentId: null, supprime: true }, { id: 'y', parentId: 'x', supprime: false }, { id: 'z', parentId: null, supprime: false }];
    expect(decisionArchive([U(1)], [ligne(1, { dossierId: 'y' })], dossiers)).toEqual({ ok: false, raison: RAISONS_ARCHIVE.introuvable });
    expect(decisionArchive([U(1)], [ligne(1, { dossierId: 'z' })], dossiers)).toMatchObject({ ok: true });
  });
  it('une taille inconnue · refus entier, dite avant le clic', () => {
    expect(decisionArchive([U(1), U(2)], [ligne(1), ligne(2, { tailleOctets: null })], [])).toEqual({ ok: false, raison: refusArchiveTailleInconnue(1) });
  });
  it(`au-delà de ${PLAFOND_ARCHIVE_OCTETS} octets (somme des size_bytes) · refus ; exactement au plafond · passe`, () => {
    const moitie = PLAFOND_ARCHIVE_OCTETS / 2;
    expect(decisionArchive([U(1), U(2)], [ligne(1, { tailleOctets: moitie }), ligne(2, { tailleOctets: moitie + 1 })], [])).toEqual({ ok: false, raison: refusArchiveVolume(PLAFOND_ARCHIVE_OCTETS + 1) });
    expect(decisionArchive([U(1), U(2)], [ligne(1, { tailleOctets: moitie }), ligne(2, { tailleOctets: moitie })], [])).toMatchObject({ ok: true, octets: PLAFOND_ARCHIVE_OCTETS });
  });
  it('les phrases · la borne et le volume se lisent', () => {
    expect(refusArchiveVolume(PLAFOND_ARCHIVE_OCTETS + 1)).toBe('La sélection pèse 2,0 Go · une archive porte au plus 2,0 Go. Retire des fichiers, rien n’a été téléchargé.');
    expect(refusArchiveTropDeFichiers(101)).toBe('101 fichiers sélectionnés · 100 au plus par archive, aucune archive n’a été créée.');
    expect(nomArchive(new Date('2026-11-01T23:00:00Z'))).toBe('bibliotheque-2026-11-01.zip');
  });
});

describe('le geste « Télécharger » de la barre', () => {
  const T0 = '2026-10-20T10:00:00.000Z';
  const dossier = (id: string, name: string): DossierSource => ({ id, parentId: null, name, locked: false, deletedAt: null, createdAt: T0 });
  const media = (id: string, o: Partial<MediaSource> = {}): MediaSource => ({ id, name: `${id}.jpg`, kind: 'image', mimeType: 'image/jpeg', source: 'upload', url: `/api/asset/${id}`, thumbUrl: null, sizeBytes: 2048, createdAt: T0, folderId: null, rights: null, ...o });
  const d = donneesDrive({ dossiers: [dossier('d1', 'UGC')], medias: [media('m1'), media('m2'), media('m3', { sizeBytes: null }), media('gros', { sizeBytes: PLAFOND_ARCHIVE_OCTETS - 1 })] });
  const geste = (ids: string[], ls: string | null = null) => gesteTelechargement(d, gestesSelection(d, ids, { section: 'drive', lectureSeule: null, ia: false }), ls);

  it('fichiers seuls · ouvert, l’infobulle dit le contenu et le volume', () => {
    expect(geste(['m1', 'm2'])).toEqual({ libelle: 'Télécharger', ouvert: true, titre: 'Archive ZIP de 2 fichiers · 4 Ko', ids: ['m1', 'm2'], octets: 4096 });
  });
  it('dossiers seuls · fermé, avec sa raison', () => {
    expect(geste(['d1'])).toMatchObject({ ouvert: false, titre: RAISONS_ARCHIVE.dossiers });
  });
  it('sélection mixte · ouvert pour les fichiers seuls, et le dit', () => {
    expect(geste(['d1', 'm1'])).toMatchObject({ ouvert: true, ids: ['m1'], titre: 'Archive ZIP de 1 fichier · 2 Ko · 1 dossier n’y entre pas' });
  });
  it('taille inconnue, volume, borne, lecture seule · fermé AVANT le clic, mêmes phrases que la route', () => {
    expect(geste(['m1', 'm3'])).toMatchObject({ ouvert: false, titre: refusArchiveTailleInconnue(1) });
    expect(geste(['m1', 'gros'])).toMatchObject({ ouvert: false, titre: refusArchiveVolume(PLAFOND_ARCHIVE_OCTETS - 1 + 2048) });
    expect(geste(['m1'], 'Lecture seule.')).toMatchObject({ ouvert: false, titre: 'Lecture seule.' });
    const beaucoup = donneesDrive({ dossiers: [], medias: Array.from({ length: TAG_SELECTION_MAX + 1 }, (_, i) => media(`n${i}`)) });
    const g = gesteTelechargement(beaucoup, gestesSelection(beaucoup, beaucoup.fichiers.map((f) => f.id), { section: 'drive', lectureSeule: null, ia: false }));
    expect(g).toMatchObject({ ouvert: false, titre: refusArchiveTropDeFichiers(TAG_SELECTION_MAX + 1) });
  });
});
