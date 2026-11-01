import { describe, expect, it } from 'vitest';
import {
  arborescenceArchive, cheminZipSur, conclureArchive, decisionArchive, donneesDrive, ErreurArchive, fluxZip, gesteTelechargement, gestesSelection,
  messageTelechargement, nomDossierArchive, refusArchiveCheminTropLong, refusArchiveNombreDossiers, refusArchiveNombreFichiers, refusArchiveTailleInconnue,
  refusArchiveTropARelire, refusArchiveTropDeDossiersSelectionnes, refusArchiveTropDeFichiers, refusArchiveVolume, relecturesArchive, selectionArchive, tailleRelue,
  validerDemandeArchive,
  CHEMIN_ARCHIVE_OCTETS_MAX, PLAFOND_ARCHIVE_DOSSIERS, PLAFOND_ARCHIVE_FICHIERS, PLAFOND_ARCHIVE_OCTETS, RAISONS_ARCHIVE, RELECTURES_TAILLE_MAX, TAG_SELECTION_MAX,
  type DossierArchive, type DossierSource, type EntreeZip, type LigneArchive, type MediaSource,
} from '../src';
import { lireZip } from './helpers/lire-zip';

/**
 * Bibliothèque · télécharger un DOSSIER entier · règles pures. On lit ce qui
 * SORT · les chemins de la décision, et l'archive écrite par `fluxZip` relue
 * par le lecteur indépendant (`helpers/lire-zip.ts`).
 */

const U = (i: number) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`;
const D = (i: number) => `11111111-0000-4000-8000-${String(i).padStart(12, '0')}`;
const ligne = (i: number, o: Partial<LigneArchive> = {}): LigneArchive => ({ id: U(i), nom: `f${i}.jpg`, tailleOctets: 1000, supprime: false, dossierId: null, ...o });
const dossier = (i: number, nom: string, parentId: string | null = null, supprime = false): DossierArchive => ({ id: D(i), parentId, supprime, nom });
const utf8 = (s: string) => new TextEncoder().encode(s).length;

/** Une décision écrite en vrai ZIP (octets = le nom du fichier), puis relue. */
async function ecrireEtRelire(d: Extract<ReturnType<typeof decisionArchive>, { ok: true }>) {
  const entrees: EntreeZip[] = [
    ...d.repertoires.map((nom) => ({ nom, date: new Date('2026-11-01T10:00:00Z'), octets: [] })),
    ...d.fichiers.map((f) => ({ nom: f.nom, date: new Date('2026-11-01T10:00:00Z'), octets: [new TextEncoder().encode(f.id)] })),
  ];
  const morceaux: Uint8Array[] = [];
  for await (const m of fluxZip(entrees)) morceaux.push(m);
  return lireZip(Buffer.concat(morceaux));
}

/*
 *  Campagne (D1)
 *  ├── photo.jpg (U1)
 *  ├── jete.jpg (U2, corbeille)
 *  ├── Été (D2)
 *  │   ├── vidéo.mp4 (U3)
 *  │   └── Vide (D4)
 *  └── Jeté (D3, corbeille)
 *      └── perdu.jpg (U4)
 *  Autre (D5)
 *  └── autre.jpg (U5)
 */
const DOSSIERS = [dossier(1, 'Campagne'), dossier(2, 'Été', D(1)), dossier(3, 'Jeté', D(1), true), dossier(4, 'Vide', D(2)), dossier(5, 'Autre')];
const LIGNES = [
  ligne(1, { nom: 'photo.jpg', dossierId: D(1), tailleOctets: 10 }),
  ligne(2, { nom: 'jete.jpg', dossierId: D(1), supprime: true }),
  ligne(3, { nom: 'vidéo.mp4', dossierId: D(2), tailleOctets: 20 }),
  ligne(4, { nom: 'perdu.jpg', dossierId: D(3) }),
  ligne(5, { nom: 'autre.jpg', dossierId: D(5), tailleOctets: 30 }),
];

describe('l’arborescence d’un dossier', () => {
  it('sous-dossiers et fichiers VIVANTS, corbeille exclue sans refus · l’archive relue porte les chemins, un dossier vide compris', async () => {
    const d = decisionArchive([], LIGNES, DOSSIERS, [D(1)]);
    expect(d).toEqual({
      ok: true, octets: 30,
      repertoires: ['Campagne/', 'Campagne/Été/', 'Campagne/Été/Vide/'],
      fichiers: [{ id: U(1), nom: 'Campagne/photo.jpg', tailleOctets: 10 }, { id: U(3), nom: 'Campagne/Été/vidéo.mp4', tailleOctets: 20 }],
    });
    const lu = await ecrireEtRelire(d as Extract<typeof d, { ok: true }>);
    expect(lu.map((e) => [e.nom, e.octets.toString()])).toEqual([
      ['Campagne/', ''], ['Campagne/Été/', ''], ['Campagne/Été/Vide/', ''],
      ['Campagne/photo.jpg', U(1)], ['Campagne/Été/vidéo.mp4', U(3)],
    ]);
    expect(lu.some((e) => /Jeté|jete|perdu|autre/.test(e.nom)), 'ni corbeille, ni dossier voisin').toBe(false);
  });

  it('mixte · les fichiers demandés seuls à la racine, puis chaque dossier ; un fichier demandé qui est AUSSI dans le dossier n’y est écrit qu’une fois', () => {
    const d = decisionArchive([U(5), U(1)], LIGNES, DOSSIERS, [D(1)]);
    expect(d).toMatchObject({ ok: true, fichiers: [{ nom: 'autre.jpg' }, { nom: 'Campagne/photo.jpg' }, { nom: 'Campagne/Été/vidéo.mp4' }], octets: 60 });
  });

  it('un dossier demandé DANS un autre dossier demandé · compté une fois, sous son parent (quel que soit l’ordre)', () => {
    for (const ordre of [[D(2), D(1)], [D(1), D(2)]]) {
      const d = decisionArchive([], LIGNES, DOSSIERS, ordre);
      expect(d).toMatchObject({ ok: true, repertoires: ['Campagne/', 'Campagne/Été/', 'Campagne/Été/Vide/'] });
    }
  });

  it('un dossier demandé · absent (autre espace, inconnu), en corbeille, ou sous un ancêtre en corbeille · refus TOTAL', () => {
    const r = { ok: false, raison: RAISONS_ARCHIVE.dossierIntrouvable };
    expect(decisionArchive([], LIGNES, DOSSIERS, [D(1), D(99)])).toEqual(r);
    expect(decisionArchive([], LIGNES, DOSSIERS, [D(3)])).toEqual(r);
    const sous = [...DOSSIERS, dossier(6, 'Sous jeté', D(3))];
    expect(decisionArchive([], LIGNES, sous, [D(6)])).toEqual(r);
  });

  it('un sous-dossier dont le parent est un dossier d’un AUTRE espace · absent de la liste reçue, donc jamais parcouru', () => {
    // La route ne lit que les dossiers de l'espace · un dossier de B qui pointerait vers D1 n'y figure pas.
    const d = decisionArchive([], LIGNES, DOSSIERS, [D(1)]);
    expect(d.ok && d.repertoires.every((c) => c.startsWith('Campagne/'))).toBe(true);
    expect(arborescenceArchive([D(1)], DOSSIERS)).toEqual({ ok: true, racines: [D(1)], dossiers: [D(1), D(2), D(4)] });
  });
});

describe('la portée de l’écran (marque active)', () => {
  it('un sous-dossier hors portée n’entre pas, ni ses fichiers ; demandé · refus', () => {
    const avec = [dossier(1, 'Commun'), { ...dossier(2, 'Autre marque', D(1)), horsPortee: true }];
    const fichiers = [ligne(1, { nom: 'a.jpg', dossierId: D(1) }), ligne(2, { nom: 'b.jpg', dossierId: D(2) })];
    expect(decisionArchive([], fichiers, avec, [D(1)])).toMatchObject({ ok: true, repertoires: ['Commun/'], fichiers: [{ nom: 'Commun/a.jpg' }] });
    expect(decisionArchive([], fichiers, avec, [D(2)])).toEqual({ ok: false, raison: RAISONS_ARCHIVE.dossierIntrouvable });
  });
});

describe('les cycles de dossiers · parcourus une fois, jamais de boucle', () => {
  it('A ⇄ B · demander A écrit A puis B, une fois chacun ; demander les deux · le premier demandé est la racine', () => {
    const cycle = [dossier(1, 'A', D(2)), dossier(2, 'B', D(1))];
    const fichiers = [ligne(1, { nom: 'a.jpg', dossierId: D(1) }), ligne(2, { nom: 'b.jpg', dossierId: D(2) })];
    expect(decisionArchive([], fichiers, cycle, [D(1)])).toMatchObject({ ok: true, repertoires: ['A/', 'A/B/'], fichiers: [{ nom: 'A/a.jpg' }, { nom: 'A/B/b.jpg' }] });
    expect(decisionArchive([], fichiers, cycle, [D(2), D(1)])).toMatchObject({ ok: true, repertoires: ['B/', 'B/A/'], fichiers: [{ nom: 'B/b.jpg' }, { nom: 'B/A/a.jpg' }] });
  });
  it('un dossier parent de lui-même · une entrée, sans boucle', () => {
    expect(decisionArchive([], [ligne(1, { dossierId: D(1) })], [dossier(1, 'Seul', D(1))], [D(1)])).toMatchObject({ ok: true, repertoires: ['Seul/'], fichiers: [{ nom: 'Seul/f1.jpg' }] });
  });
});

describe('les chemins · assainis segment par segment', () => {
  it('ni remontée, ni chemin absolu, ni lettre de lecteur, ni nom réservé · chaque chemin passe la barrière de l’écrivain', () => {
    const pieges = [dossier(1, '../..'), dossier(2, '/etc', D(1)), dossier(3, 'C:', D(2)), dossier(4, '   ', D(3)), dossier(5, 'CON', D(4)), dossier(6, `a${String.fromCharCode(0x202e)}b\\c`, D(5))];
    const d = decisionArchive([], [ligne(1, { nom: '../passwd', dossierId: D(6) })], pieges, [D(1)]);
    expect(d).toMatchObject({ ok: true, repertoires: ['-/', '-/-etc/', '-/-etc/C-/', '-/-etc/C-/dossier/', '-/-etc/C-/dossier/_CON/', '-/-etc/C-/dossier/_CON/ab-c/'] });
    const chemins = d.ok ? [...d.repertoires, ...d.fichiers.map((f) => f.nom)] : [];
    expect(chemins.at(-1)).toBe('-/-etc/C-/dossier/_CON/ab-c/-passwd');
    for (const c of chemins) {
      expect(cheminZipSur(c), c).toBe(true);
      expect(c.split('/').some((x) => x === '..' || x === '.'), c).toBe(false);
    }
  });
  it('doublons PAR répertoire · « photos (2) », casse confondue ; un fichier et un dossier ne partagent pas un nom', () => {
    const d = decisionArchive([], [ligne(1, { nom: 'Photos', dossierId: D(1) })], [dossier(1, 'Racine'), dossier(2, 'Photos', D(1)), dossier(3, 'photos', D(1))], [D(1)]);
    expect(d).toMatchObject({ ok: true, repertoires: ['Racine/', 'Racine/photos (2)/', 'Racine/Photos (3)/'], fichiers: [{ nom: 'Racine/Photos' }] });
    const deux = decisionArchive([], [], [dossier(1, 'UGC'), dossier(2, 'ugc')], [D(1), D(2)]);
    expect(deux).toMatchObject({ ok: true, repertoires: ['UGC/', 'ugc (2)/'] });
  });
  it('un segment de dossier · coupé à 200 octets, jamais au milieu d’un caractère', () => {
    const n = nomDossierArchive('é'.repeat(150));
    expect([utf8(n), n]).toEqual([200, 'é'.repeat(100)]);
  });
  it(`un chemin au-delà de ${CHEMIN_ARCHIVE_OCTETS_MAX} octets · refus TOTAL avec sa phrase ; exactement à la borne · passe`, () => {
    // 9 dossiers de 99 octets (+ « / ») = 900 octets · le répertoire le plus profond est EXACTEMENT à la borne.
    const chaine = (n: number) => Array.from({ length: n }, (_, i) => dossier(i + 1, String(i + 1).padStart(99, 'x'), i ? D(i) : null));
    const ok = decisionArchive([], [], chaine(9), [D(1)]);
    expect(ok.ok).toBe(true);
    expect(ok.ok && utf8(ok.repertoires.at(-1)!)).toBe(CHEMIN_ARCHIVE_OCTETS_MAX);
    const trop = decisionArchive([], [], chaine(10), [D(1)]);
    expect(trop).toEqual({ ok: false, raison: refusArchiveCheminTropLong(`${chaine(10).map((x) => x.nom).join('/')}/`) });
    // Un fichier qui pousse le chemin au-delà · même refus.
    expect(decisionArchive([], [ligne(1, { nom: 'a.jpg', dossierId: D(9) })], chaine(9), [D(1)])).toMatchObject({ ok: false });
  });
});

describe('les plafonds de NOMBRE', () => {
  const plein = (n: number) => Array.from({ length: n }, (_, i) => ligne(i + 1, { dossierId: D(1), tailleOctets: 1 }));
  it(`${PLAFOND_ARCHIVE_FICHIERS} fichiers dans un dossier · passe ; un de plus · refus avec le compte`, () => {
    expect(decisionArchive([], plein(PLAFOND_ARCHIVE_FICHIERS), [dossier(1, 'Gros')], [D(1)])).toMatchObject({ ok: true, octets: PLAFOND_ARCHIVE_FICHIERS });
    expect(decisionArchive([], plein(PLAFOND_ARCHIVE_FICHIERS + 1), [dossier(1, 'Gros')], [D(1)])).toEqual({ ok: false, raison: refusArchiveNombreFichiers(PLAFOND_ARCHIVE_FICHIERS + 1) });
  });
  it('les fichiers demandés seuls comptent avec ceux des dossiers ; le compte RÉEL fourni par la route l’emporte sur la page lue', () => {
    expect(decisionArchive([U(9999)], [...plein(PLAFOND_ARCHIVE_FICHIERS), ligne(9999)], [dossier(1, 'Gros')], [D(1)])).toEqual({ ok: false, raison: refusArchiveNombreFichiers(PLAFOND_ARCHIVE_FICHIERS + 1) });
    const s = selectionArchive({ fichiers: [], dossiers: [D(1)] }, plein(3), [dossier(1, 'Gros')], { fichiersDansDossiers: 2400 });
    expect(s).toEqual({ ok: false, raison: refusArchiveNombreFichiers(2400) });
  });
  it(`${PLAFOND_ARCHIVE_DOSSIERS} dossiers dans l’arborescence · passe ; un de plus · refus avant toute lecture`, () => {
    const sous = (n: number) => [dossier(0, 'Racine'), ...Array.from({ length: n - 1 }, (_, i) => dossier(i + 1, `s${i}`, D(0)))];
    expect(arborescenceArchive([D(0)], sous(PLAFOND_ARCHIVE_DOSSIERS))).toMatchObject({ ok: true });
    expect(arborescenceArchive([D(0)], sous(PLAFOND_ARCHIVE_DOSSIERS + 1))).toEqual({ ok: false, raison: refusArchiveNombreDossiers(PLAFOND_ARCHIVE_DOSSIERS + 1) });
  });
  it('la demande · fichiers et dossiers bornés chacun à la sélection à la main, une liste peut manquer', () => {
    expect(validerDemandeArchive(undefined, [D(1)])).toEqual({ ok: true, fichiers: [], dossiers: [D(1)] });
    expect(validerDemandeArchive([U(1)], undefined)).toEqual({ ok: true, fichiers: [U(1)], dossiers: [] });
    expect(validerDemandeArchive([], [])).toEqual({ ok: false, raison: RAISONS_ARCHIVE.vide });
    expect(validerDemandeArchive([], ['../x'])).toEqual({ ok: false, raison: RAISONS_ARCHIVE.illisible });
    expect(validerDemandeArchive([], 'tout')).toEqual({ ok: false, raison: RAISONS_ARCHIVE.illisible });
    const trop = Array.from({ length: TAG_SELECTION_MAX + 1 }, (_, i) => D(i));
    expect(validerDemandeArchive([], trop)).toEqual({ ok: false, raison: refusArchiveTropDeDossiersSelectionnes(TAG_SELECTION_MAX + 1) });
    expect(validerDemandeArchive(trop.map((_, i) => U(i)), [])).toEqual({ ok: false, raison: refusArchiveTropDeFichiers(TAG_SELECTION_MAX + 1) });
  });
});

describe('les tailles inconnues · relues, puis jugées', () => {
  const avecInconnue = [ligne(1, { nom: 'a.jpg', dossierId: D(1), tailleOctets: 10 }), ligne(2, { nom: 'b.jpg', dossierId: D(1), tailleOctets: null })];
  const sel = selectionArchive({ fichiers: [], dossiers: [D(1)] }, avecInconnue, [dossier(1, 'X')]);
  it('la route relit EXACTEMENT les fichiers sans taille ; la taille relue entre dans le volume', () => {
    if (!sel.ok) throw new Error(sel.raison);
    expect(relecturesArchive(sel)).toEqual([U(2)]);
    expect(conclureArchive(sel, new Map([[U(2), 5]]))).toMatchObject({ ok: true, octets: 15, fichiers: [{ id: U(1), tailleOctets: 10 }, { id: U(2), tailleOctets: 5 }] });
  });
  it('illisible · refus « taille inconnue » ; relue au-delà du plafond · refus de volume avec la taille RELUE', () => {
    if (!sel.ok) throw new Error(sel.raison);
    expect(conclureArchive(sel, new Map())).toEqual({ ok: false, raison: refusArchiveTailleInconnue(1) });
    expect(conclureArchive(sel, new Map([[U(2), PLAFOND_ARCHIVE_OCTETS]]))).toEqual({ ok: false, raison: refusArchiveVolume(PLAFOND_ARCHIVE_OCTETS + 10) });
  });
  it(`au-delà de ${RELECTURES_TAILLE_MAX} tailles à relire · aucune relecture, refus qui le dit`, () => {
    const n = RELECTURES_TAILLE_MAX + 1;
    const s = selectionArchive({ fichiers: [], dossiers: [D(1)] }, Array.from({ length: n }, (_, i) => ligne(i + 1, { dossierId: D(1), tailleOctets: null })), [dossier(1, 'X')]);
    if (!s.ok) throw new Error(s.raison);
    expect(relecturesArchive(s)).toEqual([]);
    expect(conclureArchive(s)).toEqual({ ok: false, raison: refusArchiveTropARelire(n) });
    const pile = selectionArchive({ fichiers: [], dossiers: [D(1)] }, Array.from({ length: n - 1 }, (_, i) => ligne(i + 1, { dossierId: D(1), tailleOctets: null })), [dossier(1, 'X')]);
    expect(pile.ok && relecturesArchive(pile).length).toBe(RELECTURES_TAILLE_MAX);
  });
  it('une valeur relue · chiffres seuls, entier sûr', () => {
    expect([tailleRelue('1234'), tailleRelue(' 42 '), tailleRelue(7), tailleRelue('0')]).toEqual([1234, 42, 7, 0]);
    for (const v of ['', '-1', '1.5', '1e9', '0x10', '99999999999999999', null, undefined, {}, 1.5, -3, Number.MAX_SAFE_INTEGER + 2]) expect(tailleRelue(v), String(v)).toBeNull();
  });
});

describe('l’écrivain · seconde barrière', () => {
  it('refuse de lui-même un chemin absolu, une remontée, un segment vide, une barre inverse, un dossier qui porterait des octets', async () => {
    const ecrire = async (nom: string, octets: Uint8Array[] = []) => { for await (const _ of fluxZip([{ nom, date: new Date(), octets }])) { /* jeté */ } };
    for (const nom of ['/etc/passwd', '../x', 'a/../b', 'a//b', './a', 'a\\b', 'C:/x', 'a/./b', '..', '/']) {
      await expect(ecrire(nom), nom).rejects.toBeInstanceOf(ErreurArchive);
    }
    await expect(ecrire('dossier/', [new Uint8Array([1])])).rejects.toBeInstanceOf(ErreurArchive);
    await expect(ecrire('dossier/sous/')).resolves.toBeUndefined();
    await expect(ecrire('dossier/a.jpg', [new Uint8Array([1])])).resolves.toBeUndefined();
  });
  it('un dossier porte l’attribut « répertoire » dans le répertoire central', async () => {
    const morceaux: Uint8Array[] = [];
    for await (const m of fluxZip([{ nom: 'UGC/', date: new Date(), octets: [] }, { nom: 'UGC/a.txt', date: new Date(), octets: [new Uint8Array([65])] }])) morceaux.push(m);
    const b = Buffer.concat(morceaux);
    const central = b.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
    expect(b.readUInt32LE(central + 38), 'UGC/').toBe(0x10);
    const second = b.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]), central + 4);
    expect(b.readUInt32LE(second + 38), 'UGC/a.txt').toBe(0);
  });
});

describe('le geste « Télécharger » · un dossier sélectionné', () => {
  const T0 = '2026-10-20T10:00:00.000Z';
  const src = (id: string, name: string, parentId: string | null = null, deletedAt: string | null = null): DossierSource => ({ id, parentId, name, locked: false, deletedAt, createdAt: T0 });
  const media = (id: string, o: Partial<MediaSource> = {}): MediaSource => ({ id, name: `${id}.jpg`, kind: 'image', mimeType: 'image/jpeg', source: 'upload', url: `/api/asset/${id}`, thumbUrl: null, sizeBytes: 1024, createdAt: T0, folderId: null, rights: null, ...o });
  const d = donneesDrive({
    dossiers: [src('d1', 'UGC'), src('d2', 'Été', 'd1'), src('d3', 'Jeté', 'd1', T0)],
    medias: [media('m1', { folderId: 'd1' }), media('m2', { folderId: 'd2' }), media('m3', { folderId: 'd3' }), media('m4', { folderId: 'd2', sizeBytes: null }), media('m5', { folderId: 'd1', deletedAt: T0 })],
  });
  const geste = (ids: string[]) => gesteTelechargement(d, gestesSelection(d, ids, { section: 'drive', lectureSeule: null, ia: false }));
  it('ouvert · l’infobulle compte l’arborescence vivante (corbeille exclue) et annonce la taille à relire', () => {
    expect(geste(['d1'])).toEqual({ libelle: 'Télécharger', ouvert: true, ids: [], dossiers: ['d1'], octets: 2048, titre: 'Archive ZIP de 2 dossiers et 3 fichiers · 2 Ko · taille de 1 fichier relue au lancement' });
  });
  it('volume CONNU au-delà du plafond · fermé avant le clic, même phrase que la route', () => {
    const lourd = donneesDrive({ dossiers: [src('d1', 'UGC')], medias: [media('a', { folderId: 'd1', sizeBytes: PLAFOND_ARCHIVE_OCTETS }), media('b', { folderId: 'd1' })] });
    const g = gesteTelechargement(lourd, gestesSelection(lourd, ['d1'], { section: 'drive', lectureSeule: null, ia: false }));
    expect(g).toMatchObject({ ouvert: false, titre: refusArchiveVolume(PLAFOND_ARCHIVE_OCTETS + 1024) });
  });
  it('le message de lancement compte les dossiers', () => {
    expect(messageTelechargement(3, 2048, 2)).toBe('Téléchargement lancé · 2 dossiers, 3 fichiers, 2 Ko');
    expect(messageTelechargement(1, 2048)).toBe('Téléchargement lancé · 1 fichier, 2 Ko');
  });
});
