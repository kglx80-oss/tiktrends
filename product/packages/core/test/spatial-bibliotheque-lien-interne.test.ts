import { describe, expect, it } from 'vitest';
import {
  donneesDrive, lienInterneDossier, lienInterneFichier, lireLienInterne, menuDossier, menuFichier, ouvertureLienInterne, rechercheSansLien,
  GESTES_SANS_ACTION, RAISON_PARTAGE_CLIENT, type DossierSource, type MediaSource,
} from '../src';

/**
 * Bibliothèque · le LIEN INTERNE (« Copier le lien ») · règles pures. Le lien
 * construit (`lienInterneFichier`, `lienInterneDossier`) relu comme la page le
 * lit (`lireLienInterne`, `ouvertureLienInterne`) rouvre exactement sa cible ;
 * une adresse forgée, répétée, d'une autre forme, ou une cible absente des
 * données de la session (autre espace, marque hors portée), à la corbeille,
 * dans un dossier jeté, une sortie Studios, une racine ou un projet virtuel ne
 * rouvre RIEN (`null` · la page se rend comme sans paramètre). Le menu ne
 * propose le geste que là où le lien rouvre sa cible. « Partager au client »
 * reste fermé, avec la raison de la décision attendue.
 */

const T0 = '2026-10-20T10:00:00.000Z';
const U = (n: number) => `${String(n).repeat(8)}-${String(n).repeat(4)}-4${String(n).repeat(3)}-8${String(n).repeat(3)}-${String(n).repeat(12)}`;
const PHOTOS = U(1), FACES = U(2), JETE = U(3), SYSTEME = U(4);
const FA = U(5), FB = U(6), FJ = U(7), FDJ = U(8), FRACINE = U(9);
const SORTIE = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const dossier = (id: string, extra: Partial<DossierSource> = {}): DossierSource => ({ id, parentId: null, name: id, locked: false, deletedAt: null, createdAt: T0, ...extra });
const media = (id: string, extra: Partial<MediaSource> = {}): MediaSource => ({
  id, name: `${id}.jpg`, kind: 'image', mimeType: 'image/jpeg', source: 'upload', url: `/api/asset/${id}`, thumbUrl: null, sizeBytes: 2048, createdAt: T0, folderId: null, rights: null, ...extra,
});
const d = donneesDrive({
  dossiers: [dossier(PHOTOS), dossier(FACES, { parentId: PHOTOS }), dossier(JETE, { deletedAt: T0 }), dossier(SYSTEME, { locked: true })],
  medias: [
    media(FA, { folderId: PHOTOS }), media(FB, { folderId: FACES }), media(FRACINE),
    media(FJ, { folderId: PHOTOS, deletedAt: T0 }), media(FDJ, { folderId: JETE }),
    media(SORTIE, { source: 'studios', studio: { projetId: 'p1', projetTitre: 'Projet 1', href: '/studio/projets/p1' } }),
  ],
});
/** La page · `searchParams` d'une adresse, comme Next les donne. */
const sp = (lien: string) => Object.fromEntries(new URL(lien, 'https://app.exemple').searchParams);
const rouvre = (lien: string | null) => (lien ? ouvertureLienInterne(d, lireLienInterne(sp(lien))) : 'aucun lien');

describe('construction · la forme du lien', () => {
  it('un fichier · `/assets?fichier=<id>` · un dossier · `/assets?dossier=<id>` · aucun jeton, rien d’autre', () => {
    expect(lienInterneFichier(d, FB)).toBe(`/assets?fichier=${FB}`);
    expect(lienInterneDossier(d, FACES)).toBe(`/assets?dossier=${FACES}`);
  });
});

describe('aller-retour · le lien construit rouvre exactement sa cible', () => {
  it('un fichier rangé · son aperçu, dans son dossier (chemin depuis la racine)', () => {
    expect(rouvre(lienInterneFichier(d, FB))).toEqual({ fichier: FB, chemin: ['r:assets', PHOTOS, FACES] });
    expect(rouvre(lienInterneFichier(d, FRACINE))).toEqual({ fichier: FRACINE, chemin: ['r:assets'] });
  });
  it('un dossier (verrouillé compris · le lien ne détruit rien) · ce dossier ouvert, sans aperçu', () => {
    expect(rouvre(lienInterneDossier(d, FACES))).toEqual({ fichier: null, chemin: ['r:assets', PHOTOS, FACES] });
    expect(rouvre(lienInterneDossier(d, SYSTEME))).toEqual({ fichier: null, chemin: ['r:assets', SYSTEME] });
  });
});

describe('ce qui ne se lie pas · aucun lien proposé, et l’adresse forgée ne rouvre rien', () => {
  const cas: Array<[string, string, 'fichier' | 'dossier']> = [
    ['un fichier à la corbeille', FJ, 'fichier'],
    ['un fichier vivant dans un dossier jeté', FDJ, 'fichier'],
    ['une sortie Studios (son projet a sa propre adresse)', SORTIE, 'fichier'],
    ['un fichier absent des données de la session (autre espace, marque hors portée)', U(0), 'fichier'],
    ['un dossier à la corbeille', JETE, 'dossier'],
    ['un dossier absent des données de la session', U(0), 'dossier'],
  ];
  for (const [quoi, id, type] of cas) {
    it(quoi, () => {
      expect(type === 'fichier' ? lienInterneFichier(d, id) : lienInterneDossier(d, id)).toBeNull();
      expect(ouvertureLienInterne(d, lireLienInterne({ [type]: id }))).toBeNull();
    });
  }
  it('une racine, un projet virtuel · ni lien ni ouverture', () => {
    expect([lienInterneDossier(d, 'r:assets'), lienInterneDossier(d, 'p:p1')]).toEqual([null, null]);
    expect(ouvertureLienInterne(d, lireLienInterne({ dossier: 'r:assets' }))).toBeNull();
  });
  it('un dossier virtuel ne se lie pas, même si son identifiant avait la forme d’un UUID (la règle ne dépend pas de la forme)', () => {
    const virtuel = { ...d, dossiers: [...d.dossiers, { id: U(0), nom: 'Projet', parent: 'r:creations', reel: false, verrouille: true, supprime: false, creeLe: T0, tag: null }] };
    expect(lienInterneDossier(virtuel, U(0))).toBeNull();
    expect(ouvertureLienInterne(virtuel, lireLienInterne({ dossier: U(0) }))).toBeNull();
  });
});

describe('lecture de l’adresse · une seule chaîne UUID, sinon rien', () => {
  it('forme inconnue, valeur répétée, vide · rien de lu', () => {
    for (const v of ['', 'abc', `${FA}x`, ` ${FA}`, '../etc', `${FA}&dossier=${PHOTOS}`]) expect(lireLienInterne({ fichier: v }), v).toEqual({ fichier: null, dossier: null });
    expect(lireLienInterne({ fichier: [FA, FB] })).toEqual({ fichier: null, dossier: null });
    expect(lireLienInterne({})).toEqual({ fichier: null, dossier: null });
  });
  it('majuscules lues en minuscules · le fichier l’emporte sur le dossier', () => {
    expect(lireLienInterne({ fichier: FA.toUpperCase() })).toEqual({ fichier: FA, dossier: null });
    expect(lireLienInterne({ fichier: FA, dossier: PHOTOS })).toEqual({ fichier: FA, dossier: null });
    expect(lireLienInterne({ dossier: PHOTOS })).toEqual({ fichier: null, dossier: PHOTOS });
  });
  it('la cible quittée · l’adresse perd les paramètres du lien, garde les autres', () => {
    expect(rechercheSansLien(`?fichier=${FA}&tag=vert`)).toBe('?tag=vert');
    expect(rechercheSansLien(`?dossier=${PHOTOS}`)).toBe('');
    expect(rechercheSansLien('')).toBe('');
  });
});

describe('les menus · le geste là où le lien rouvre sa cible, ouvert en lecture seule aussi', () => {
  const LS = 'Ton rôle est en lecture seule.';
  const cle = (e: Array<{ cle: string; ouvert: boolean; detail?: string }>) => e.find((x) => x.cle === 'copier-lien');
  it('fichier · après « Télécharger », avant la corbeille · ouvert, son infobulle dit « interne »', () => {
    const e = menuFichier(d, FA, { section: 'drive', lectureSeule: null });
    const i = e.findIndex((x) => x.cle === 'copier-lien');
    expect([e[i - 1]?.cle, e[i]?.libelle, e[i + 1]?.cle]).toEqual(['telecharger', 'Copier le lien', 'corbeille']);
    expect(e[i]!.detail).toMatch(/interne.*membre de l’espace/);
    expect(cle(menuFichier(d, FA, { section: 'drive', lectureSeule: LS }))?.ouvert).toBe(true);
  });
  it('fichier · ni à la corbeille, ni pour une sortie Studios', () => {
    expect(cle(menuFichier(d, FJ, { section: 'corbeille', lectureSeule: null }))).toBeUndefined();
    expect(cle(menuFichier(d, SORTIE, { section: 'drive', lectureSeule: null }))).toBeUndefined();
  });
  it('dossier · après « Télécharger », ouvert (lecture seule comprise) · ni corbeille, ni racine', () => {
    const e = menuDossier(d, PHOTOS, { section: 'drive', lectureSeule: null, variante: 'liste' });
    const i = e.findIndex((x) => x.cle === 'copier-lien');
    expect([e[i - 1]?.cle, e[i]?.libelle, e[i]?.ouvert]).toEqual(['telecharger', 'Copier le lien', true]);
    expect(cle(menuDossier(d, PHOTOS, { section: 'drive', lectureSeule: LS, variante: 'grille' }))?.ouvert).toBe(true);
    expect(cle(menuDossier(d, JETE, { section: 'corbeille', lectureSeule: null, variante: 'grille' }))).toBeUndefined();
    expect(cle(menuDossier(d, 'r:assets', { section: 'drive', lectureSeule: null, variante: 'grille' }))).toBeUndefined();
  });
});

describe('« Partager au client » reste fermé · la raison dit la décision attendue', () => {
  it('fermé dans la barre, raison précise (lien public signé, expiration, révocation, propriétaire)', () => {
    const g = GESTES_SANS_ACTION.find((x) => x.cle === 'partager')!;
    expect(g.raison).toBe(RAISON_PARTAGE_CLIENT);
    for (const mot of ['lien public signé', 'expiration', 'révocation', 'propriétaire', 'interne']) expect(g.raison, mot).toContain(mot);
  });
});
