import { describe, expect, it } from 'vitest';
import {
  chargeGlissee, glissable, verdictDepot, donneesDrive, destinationsDeplacementDossier, destinationsDeplacementSelection, REFUS_DEPOT, REFUS_DOSSIER, TAG_SELECTION_MAX,
  porteDesFichiers, deplieAuSurvol, DELAI_DEPLIAGE_SURVOL_MS, validerDeplacementDossiers,
  type DossierSource, type MediaSource,
} from '../src';

/**
 * Bibliothèque · le glisser-déposer · règles pures. Le glisser n'est qu'un
 * raccourci de « Déplacer vers… » · ce qui part suit la règle de la barre
 * (fichiers) et du menu (dossier) ; ce qui reçoit suit la liste du menu
 * (`dossiersRangement`, `destinationsDeplacementDossier` → anti-cycle au noyau).
 */

const T0 = '2026-10-20T10:00:00.000Z';
const LS = 'Ton rôle est en lecture seule.';
const dossier = (id: string, extra: Partial<DossierSource> = {}): DossierSource => ({ id, parentId: null, name: id, locked: false, deletedAt: null, createdAt: T0, ...extra });
const media = (id: string, extra: Partial<MediaSource> = {}): MediaSource => ({
  id, name: `${id}.jpg`, kind: 'image', mimeType: 'image/jpeg', source: 'upload', url: `/api/asset?id=${id}`, thumbUrl: null, sizeBytes: 2048, createdAt: T0, folderId: null, rights: null, ...extra,
});
const d = donneesDrive({
  dossiers: [
    dossier('photos'), dossier('faces', { parentId: 'photos' }), dossier('profil', { parentId: 'faces' }),
    dossier('ugc'), dossier('systeme', { locked: true }), dossier('jete', { deletedAt: T0 }),
    dossier('marque-b', { brandId: 'b' }),
  ],
  medias: [
    media('a', { folderId: 'photos' }), media('b', { folderId: 'photos' }), media('c'),
    media('poubelle', { folderId: 'ugc', deletedAt: T0 }),
    media('sortie', { source: 'studios', studio: { projetId: 'p1', projetTitre: 'Projet 1', href: '/studio/projets/p1' } }),
  ],
});
const DRIVE = { section: 'drive' as const, lectureSeule: null };

describe('chargeGlissee · ce qui part', () => {
  it('un fichier non sélectionné part SEUL · sélectionné, il emporte les fichiers de la sélection (pas les dossiers)', () => {
    expect(chargeGlissee(d, 'a', [], DRIVE)).toEqual({ type: 'fichiers', ids: ['a'] });
    expect(chargeGlissee(d, 'a', ['b', 'c'], DRIVE)).toEqual({ type: 'fichiers', ids: ['a'] });
    expect(chargeGlissee(d, 'a', ['a', 'c', 'ugc', 'sortie'], DRIVE)).toEqual({ type: 'fichiers', ids: ['a', 'c'] });
  });

  it('un dossier réel vivant part, avec son nom · seul s’il n’est pas sélectionné, ou seul dossier de la sélection', () => {
    expect(chargeGlissee(d, 'faces', [], DRIVE)).toEqual({ type: 'dossier', id: 'faces', nom: 'faces' });
    expect(chargeGlissee(d, 'faces', ['ugc', 'photos'], DRIVE)).toEqual({ type: 'dossier', id: 'faces', nom: 'faces' });
    // Sélectionné avec des fichiers, un dossier système, une racine · il reste le seul DOSSIER qui part.
    expect(chargeGlissee(d, 'faces', ['faces', 'a', 'systeme', 'r:assets'], DRIVE)).toEqual({ type: 'dossier', id: 'faces', nom: 'faces' });
  });

  it('un dossier SÉLECTIONNÉ emporte les dossiers de la sélection · jamais ses fichiers, ni un dossier système', () => {
    expect(chargeGlissee(d, 'faces', ['faces', 'ugc', 'a'], DRIVE)).toEqual({ type: 'dossiers', ids: ['faces', 'ugc'] });
    expect(chargeGlissee(d, 'ugc', ['photos', 'ugc', 'systeme', 'c'], DRIVE)).toEqual({ type: 'dossiers', ids: ['photos', 'ugc'] });
    // Un fichier sélectionné avec eux n'emporte, lui, que les fichiers.
    expect(chargeGlissee(d, 'a', ['faces', 'ugc', 'a'], DRIVE)).toEqual({ type: 'fichiers', ids: ['a'] });
  });

  it('une sélection de dossiers au-delà de la borne de la barre ne part pas', () => {
    const n = TAG_SELECTION_MAX + 1;
    const gros = donneesDrive({ dossiers: Array.from({ length: n }, (_, i) => dossier(`g${i}`)), medias: [] });
    const tous = Array.from({ length: n }, (_, i) => `g${i}`);
    expect(chargeGlissee(gros, 'g0', tous, DRIVE)).toBeNull();
    expect(chargeGlissee(gros, 'g0', tous.slice(0, TAG_SELECTION_MAX), DRIVE)).toEqual({ type: 'dossiers', ids: tous.slice(0, TAG_SELECTION_MAX) });
  });

  it('rien ne part · lecture seule, corbeille, sortie Studios, dossier système, racine, projet, inconnu', () => {
    expect(chargeGlissee(d, 'a', [], { section: 'drive', lectureSeule: LS })).toBeNull();
    expect(chargeGlissee(d, 'photos', [], { section: 'drive', lectureSeule: LS })).toBeNull();
    expect(chargeGlissee(d, 'poubelle', [], { section: 'corbeille', lectureSeule: null })).toBeNull();
    expect(chargeGlissee(d, 'jete', [], { section: 'corbeille', lectureSeule: null })).toBeNull();
    expect(chargeGlissee(d, 'sortie', [], DRIVE)).toBeNull();
    expect(chargeGlissee(d, 'systeme', [], DRIVE)).toBeNull();
    expect(chargeGlissee(d, 'r:assets', [], DRIVE)).toBeNull();
    expect(chargeGlissee(d, 'r:creations', [], DRIVE)).toBeNull();
    expect(chargeGlissee(d, 'inconnu', [], DRIVE)).toBeNull();
    expect([glissable(d, 'a', DRIVE), glissable(d, 'faces', DRIVE), glissable(d, 'sortie', DRIVE), glissable(d, 'a', { section: 'drive', lectureSeule: LS })]).toEqual([true, true, false, false]);
  });

  it('une sélection au-delà de la borne de la barre ne part pas (même refus que « Déplacer vers… »)', () => {
    const n = TAG_SELECTION_MAX + 1;
    const gros = donneesDrive({ dossiers: [], medias: Array.from({ length: n }, (_, i) => media(`m${i}`)) });
    const tous = Array.from({ length: n }, (_, i) => `m${i}`);
    expect(chargeGlissee(gros, 'm0', tous, DRIVE)).toBeNull();
    expect(chargeGlissee(gros, 'm0', tous.slice(0, TAG_SELECTION_MAX), DRIVE)?.type).toBe('fichiers');
  });
});

describe('verdictDepot · ce qui reçoit', () => {
  const F = (ids: string[]) => ({ type: 'fichiers' as const, ids });
  const D = (id: string) => ({ type: 'dossier' as const, id, nom: id });

  it('des fichiers · tout dossier de rangement, la racine « Assets » valant non classé (null), nommé par son chemin', () => {
    expect(verdictDepot(d, F(['a']), 'ugc')).toEqual({ ok: true, destination: 'ugc', nom: 'ugc' });
    expect(verdictDepot(d, F(['a']), 'profil')).toEqual({ ok: true, destination: 'profil', nom: 'photos › faces › profil' });
    expect(verdictDepot(d, F(['a']), 'r:assets')).toEqual({ ok: true, destination: null, nom: 'Assets de la marque · non classé' });
    // Un seul des deux est déjà là · le dépôt garde son effet sur l'autre.
    expect(verdictDepot(d, F(['a', 'c']), 'photos')).toMatchObject({ ok: true, destination: 'photos' });
  });

  it('des fichiers · déjà là, une racine sans rangement, un projet, un dossier jeté, un inconnu · refusés', () => {
    expect(verdictDepot(d, F(['a']), 'photos')).toEqual({ ok: false, raison: REFUS_DEPOT.fichierIci });
    expect(verdictDepot(d, F(['a', 'b']), 'photos')).toEqual({ ok: false, raison: REFUS_DEPOT.fichiersIci });
    expect(verdictDepot(d, F(['c']), 'r:assets')).toEqual({ ok: false, raison: REFUS_DEPOT.fichierIci });
    for (const cible of ['r:creations', 'r:anciens', 'p:p1', 'jete', 'inconnu']) expect(verdictDepot(d, F(['a']), cible), cible).toEqual({ ok: false, raison: REFUS_DEPOT.cible });
    expect(verdictDepot(d, F([]), 'ugc')).toEqual({ ok: false, raison: REFUS_DEPOT.cible });
  });

  it('un dossier · ailleurs dans la même marque, ou à la racine · accepté', () => {
    expect(verdictDepot(d, D('faces'), 'ugc')).toEqual({ ok: true, destination: 'ugc', nom: 'ugc' });
    expect(verdictDepot(d, D('faces'), 'r:assets')).toEqual({ ok: true, destination: null, nom: 'Assets de la marque · non classé' });
  });

  it('un dossier · anti-cycle et règles du serveur · lui-même, un descendant, système, autre marque, déjà là · refusés avec la phrase', () => {
    expect(verdictDepot(d, D('photos'), 'photos')).toEqual({ ok: false, raison: REFUS_DOSSIER.soiMeme });
    expect(verdictDepot(d, D('photos'), 'faces')).toEqual({ ok: false, raison: REFUS_DOSSIER.descendant });
    expect(verdictDepot(d, D('photos'), 'profil')).toEqual({ ok: false, raison: REFUS_DOSSIER.descendant });
    expect(verdictDepot(d, D('ugc'), 'systeme')).toEqual({ ok: false, raison: REFUS_DOSSIER.destinationSysteme });
    expect(verdictDepot(d, D('ugc'), 'marque-b')).toEqual({ ok: false, raison: REFUS_DOSSIER.autreMarque });
    expect(verdictDepot(d, D('faces'), 'photos')).toEqual({ ok: false, raison: REFUS_DEPOT.dossierIci });
    expect(verdictDepot(d, D('photos'), 'r:assets')).toEqual({ ok: false, raison: REFUS_DEPOT.dossierIci });
    for (const cible of ['r:creations', 'jete', 'inconnu']) expect(verdictDepot(d, D('ugc'), cible), cible).toEqual({ ok: false, raison: REFUS_DEPOT.cible });
  });

  it('le verdict d’un dossier est celui du menu « Déplacer vers… » · pour chaque destination de la liste', () => {
    for (const o of destinationsDeplacementDossier(d, 'photos')) {
      const v = verdictDepot(d, D('photos'), o.id ?? 'r:assets');
      expect(v.ok, o.nom).toBe(!o.actuel && !o.raison);
    }
  });
});

/* ───────────── Les dossiers de la sélection · des UUID, comme en base (la règle groupée les exige) ───────────── */

const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', A1 = 'a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1';
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', B1 = 'b1b1b1b1-b1b1-4b1b-8b1b-b1b1b1b1b1b1', B2 = 'b2b2b2b2-b2b2-4b2b-8b2b-b2b2b2b2b2b2';
const C = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', S = '55555555-5555-4555-8555-555555555555', M = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const u = donneesDrive({
  dossiers: [
    dossier(A), dossier(A1, { parentId: A }), dossier(B), dossier(B1, { parentId: B }), dossier(B2, { parentId: B1 }),
    dossier(C), dossier(S, { locked: true }), dossier(M, { brandId: 'b' }),
  ],
  medias: [],
});

describe('verdictDepot · les dossiers de la sélection (tout ou rien)', () => {
  const G = (ids: string[]) => ({ type: 'dossiers' as const, ids });

  it('ailleurs, ou à la racine · accepté, nommé comme dans la barre', () => {
    expect(verdictDepot(u, G([A, B]), C)).toEqual({ ok: true, destination: C, nom: C });
    expect(verdictDepot(u, G([A1, B1]), 'r:assets')).toEqual({ ok: true, destination: null, nom: 'Assets de la marque · non classé' });
  });

  it('cycle CROISÉ · la cible est sous l’AUTRE dossier de la sélection, pas sous celui qu’on tient · refusé avec la phrase du serveur', () => {
    // On glisse A (sélectionné avec B) sur B2 · B2 n'est pas sous A, mais il est sous B · B partirait sous son petit-enfant.
    const v = verdictDepot(u, G([A, B]), B2);
    expect(v).toEqual({ ok: false, raison: `« ${B} » · ${REFUS_DOSSIER.descendant}` });
    expect(v).toEqual({ ok: false, raison: (validerDeplacementDossiers([
      { id: A, parentId: null, name: A, brandId: null, locked: false }, { id: A1, parentId: A, name: A1, brandId: null, locked: false },
      { id: B, parentId: null, name: B, brandId: null, locked: false }, { id: B1, parentId: B, name: B1, brandId: null, locked: false },
      { id: B2, parentId: B1, name: B2, brandId: null, locked: false },
    ], [A, B], B2) as { raison: string }).raison });
  });

  it('l’un d’eux, un dossier système, une autre marque, des dossiers imbriqués, déjà tous là · refusés', () => {
    expect(verdictDepot(u, G([A, B]), B)).toEqual({ ok: false, raison: REFUS_DOSSIER.destinationSelectionnee });
    expect(verdictDepot(u, G([A, B]), S)).toEqual({ ok: false, raison: REFUS_DOSSIER.destinationSysteme });
    expect(verdictDepot(u, G([A, B]), M)).toEqual({ ok: false, raison: `« ${A} » · ${REFUS_DOSSIER.autreMarque}` });
    expect(verdictDepot(u, G([B, B1]), C)).toEqual({ ok: false, raison: REFUS_DOSSIER.imbriques });
    expect(verdictDepot(u, G([A, B]), 'r:assets')).toEqual({ ok: false, raison: REFUS_DEPOT.dossiersIci });
    for (const cible of ['r:creations', 'inconnu']) expect(verdictDepot(u, G([A, B]), cible), cible).toEqual({ ok: false, raison: REFUS_DEPOT.cible });
  });

  it('le verdict est celui de « Déplacer vers… » de la barre · pour chaque destination de la liste', () => {
    for (const ids of [[A, B], [A1, B1], [A, B2], [B, B1]]) {
      for (const o of destinationsDeplacementSelection(u, ids)) {
        expect(verdictDepot(u, G(ids), o.id ?? 'r:assets').ok, `${ids} → ${o.nom}`).toBe(!o.actuel && !o.raison);
      }
    }
  });
});

describe('porteDesFichiers · la zone d’import ne répond qu’aux fichiers de l’ordinateur', () => {
  it('le type Files ouvre la zone · un texte, un lien, un glisser interne, rien · non', () => {
    expect(porteDesFichiers(['Files'])).toBe(true);
    expect(porteDesFichiers(['text/uri-list', 'Files', 'text/plain'])).toBe(true);
    expect(porteDesFichiers(['text/plain'])).toBe(false);
    expect(porteDesFichiers(['text/uri-list', 'text/html'])).toBe(false);
    expect(porteDesFichiers(['application/x-tiktrends-bibliotheque'])).toBe(false);
    expect(porteDesFichiers(['files'])).toBe(false);
    expect([porteDesFichiers([]), porteDesFichiers(null), porteDesFichiers(undefined)]).toEqual([false, false, false]);
  });

  it('une DOMStringList (anciens navigateurs) se lit comme un tableau', () => {
    const liste = { length: 2, 0: 'text/plain', 1: 'Files', item: (i: number) => ['text/plain', 'Files'][i] ?? null, contains: (x: string) => x === 'Files' || x === 'text/plain' };
    expect(porteDesFichiers(liste)).toBe(true);
  });
});

describe('deplieAuSurvol · un nœud replié de l’arbre se déplie au survol prolongé', () => {
  const replie = { id: 'photos', aEnfants: true, ouvert: false };
  it('le délai est celui des arbres de référence (VS Code, GTK, jsTree · 500 ms)', () => {
    expect(DELAI_DEPLIAGE_SURVOL_MS).toBe(500);
  });

  it('replié, avec des enfants, pendant un glisser · oui ; ouvert, sans enfants, sans glisser · non', () => {
    expect(deplieAuSurvol(replie, { type: 'fichiers', ids: ['a'] })).toBe(true);
    expect(deplieAuSurvol(replie, { type: 'dossier', id: 'ugc', nom: 'ugc' })).toBe(true);
    expect(deplieAuSurvol({ ...replie, ouvert: true }, { type: 'fichiers', ids: ['a'] })).toBe(false);
    expect(deplieAuSurvol({ ...replie, aEnfants: false }, { type: 'fichiers', ids: ['a'] })).toBe(false);
    expect(deplieAuSurvol(replie, null)).toBe(false);
  });

  it('jamais le dossier qui part (ses descendants refusent tous) · seul ou dans la sélection', () => {
    expect(deplieAuSurvol(replie, { type: 'dossier', id: 'photos', nom: 'photos' })).toBe(false);
    expect(deplieAuSurvol(replie, { type: 'dossiers', ids: ['ugc', 'photos'] })).toBe(false);
    expect(deplieAuSurvol(replie, { type: 'dossiers', ids: ['ugc', 'faces'] })).toBe(true);
  });
});
