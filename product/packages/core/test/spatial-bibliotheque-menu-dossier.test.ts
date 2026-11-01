import { describe, expect, it } from 'vitest';
import {
  boutonTagSurCarte, donneesDrive, gestesSelection, gesteTelechargement, menuDossier, optionsTagDossier, refusArchiveVolume, vueDrive,
  destinationsDeplacementDossier, dossiersRangement, validerDeplacementDossier, REFUS_DOSSIER,
  ETAT_DRIVE_INITIAL, TAGS_COULEUR, type DossierSource, type MediaSource,
} from '../src';

/**
 * Bibliothèque · le menu « … » d'une carte de DOSSIER · règles pures. Le menu
 * applique à UN dossier la règle de la barre de sélection (`gestesSelection`,
 * `gesteTelechargement`) · mêmes libellés, même ouvert/fermé, même raison. Le
 * tag n'y est que là où la carte n'a pas déjà son bouton (la ligne de la
 * liste, ou la grille en lecture seule). Une racine, un projet Studios ou un
 * dossier verrouillé n'a que ce que la barre lui accorde.
 */

const T0 = '2026-10-20T10:00:00.000Z';
const LS = 'Ton rôle est en lecture seule.';
const dossier = (id: string, extra: Partial<DossierSource> = {}): DossierSource => ({ id, parentId: null, name: id, locked: false, deletedAt: null, createdAt: T0, ...extra });
const media = (id: string, extra: Partial<MediaSource> = {}): MediaSource => ({
  id, name: `${id}.jpg`, kind: 'image', mimeType: 'image/jpeg', source: 'upload', url: `/api/asset?id=${id}`, thumbUrl: null, sizeBytes: 2048, createdAt: T0, folderId: null, rights: null, ...extra,
});
const d = donneesDrive({
  dossiers: [
    dossier('photos', { colorTag: 'vert' }), dossier('faces', { parentId: 'photos' }),
    dossier('systeme', { locked: true }),
    dossier('jete', { deletedAt: T0 }), dossier('sous-jete', { parentId: 'jete', deletedAt: T0 }),
    dossier('lourd'),
  ],
  medias: [
    media('a', { folderId: 'photos' }), media('b', { folderId: 'faces' }),
    media('gros', { folderId: 'lourd', sizeBytes: 3 * 1024 * 1024 * 1024 }),
    media('sortie', { source: 'studios', studio: { projetId: 'p1', projetTitre: 'Projet 1', href: '/studio/projets/p1' } }),
  ],
});
const ctx = (variante: 'grille' | 'liste', lectureSeule: string | null = null, section: 'drive' | 'corbeille' = 'drive') => ({ section, lectureSeule, variante });
const resume = (e: ReturnType<typeof menuDossier>) => e.map((x) => [x.cle, x.libelle, x.ouvert, x.raison]);
const RENOMMER = ['renommer', 'Renommer', true, null];
const DEPLACER = ['deplacer', 'Déplacer vers…', true, null];

describe('menuDossier · les gestes existants, à l’unité', () => {
  it('un dossier vivant, grille · ouvrir, renommer, déplacer, télécharger, corbeille · le tag reste au bouton de la carte', () => {
    const e = menuDossier(d, 'photos', ctx('grille'));
    expect(resume(e)).toEqual([
      ['ouvrir', 'Ouvrir', true, null],
      RENOMMER, DEPLACER,
      ['telecharger', 'Télécharger', true, null],
      ['corbeille', 'Mettre à la corbeille', true, null],
    ]);
    // La règle de la barre appliquée à ce seul dossier · même geste, et l'archive dit son contenu.
    const s = gestesSelection(d, ['photos'], { section: 'drive', lectureSeule: null, ia: false });
    expect(e[4]).toMatchObject({ libelle: s.gestes.find((x) => x.cle === 'corbeille')!.libelle });
    expect(e[2]!.sousMenu).toBe(true);
    const g = gesteTelechargement(d, s);
    expect([g.ouvert, g.dossiers, g.ids]).toEqual([true, ['photos'], []]);
    expect(e[3]!.detail).toBe(g.titre);
    expect(e[3]!.detail).toBe('Archive ZIP de 2 dossiers et 2 fichiers · 4 Ko');
  });

  it('la même carte en liste · « Tag de couleur » s’ajoute (aucun bouton sur la ligne), à liste, ouvert', () => {
    const e = menuDossier(d, 'photos', ctx('liste'));
    expect(resume(e)).toEqual([
      ['ouvrir', 'Ouvrir', true, null],
      RENOMMER, DEPLACER,
      ['tag', 'Tag de couleur', true, null],
      ['telecharger', 'Télécharger', true, null],
      ['corbeille', 'Mettre à la corbeille', true, null],
    ]);
    expect([e[2]!.sousMenu, e[3]!.sousMenu]).toEqual([true, true]);
  });

  it('lecture seule · renommer, déplacer, tag (la carte n’a plus son bouton), télécharger et corbeille FERMÉS avec la raison · ouvrir reste', () => {
    for (const v of ['grille', 'liste'] as const) {
      expect(resume(menuDossier(d, 'photos', ctx(v, LS)))).toEqual([
        ['ouvrir', 'Ouvrir', true, null],
        ['renommer', 'Renommer', false, LS],
        ['deplacer', 'Déplacer vers…', false, LS],
        ['tag', 'Tag de couleur', false, LS],
        ['telecharger', 'Télécharger', false, LS],
        ['corbeille', 'Mettre à la corbeille', false, LS],
      ]);
    }
  });

  it('archive refusée par la règle de la route (volume) · télécharger FERMÉ avec sa phrase, avant le clic', () => {
    const t = menuDossier(d, 'lourd', ctx('grille')).find((x) => x.cle === 'telecharger')!;
    expect([t.ouvert, t.raison, t.detail]).toEqual([false, refusArchiveVolume(3 * 1024 * 1024 * 1024), undefined]);
  });

  it('un dossier verrouillé (système) · hors de la barre · ouvrir, renommer et déplacer FERMÉS avec la phrase du serveur, et le tag en liste (il se tague)', () => {
    const sys = [['renommer', 'Renommer', false, REFUS_DOSSIER.systemeRenommer], ['deplacer', 'Déplacer vers…', false, REFUS_DOSSIER.systemeDeplacer]];
    expect(resume(menuDossier(d, 'systeme', ctx('grille')))).toEqual([['ouvrir', 'Ouvrir', true, null], ...sys]);
    expect(resume(menuDossier(d, 'systeme', ctx('liste')))).toEqual([['ouvrir', 'Ouvrir', true, null], ...sys, ['tag', 'Tag de couleur', true, null]]);
    // La lecture seule l'emporte · la raison de l'offre ou du rôle, pas celle du dossier.
    expect(resume(menuDossier(d, 'systeme', ctx('grille', LS))).slice(1, 3)).toEqual([['renommer', 'Renommer', false, LS], ['deplacer', 'Déplacer vers…', false, LS]]);
    expect(destinationsDeplacementDossier(d, 'systeme')).toEqual([]);
  });

  it('une racine et un projet Studios (dossiers virtuels) · ouvrir, rien d’autre, en grille comme en liste', () => {
    const projet = d.dossiers.find((x) => !x.reel && x.parent === 'r:creations')!.id;
    for (const id of ['r:assets', 'r:creations', projet]) {
      for (const v of ['grille', 'liste'] as const) expect([id, v, resume(menuDossier(d, id, ctx(v)))]).toEqual([id, v, [['ouvrir', 'Ouvrir', true, null]]]);
    }
    expect(optionsTagDossier(d, projet)).toEqual([]);
  });

  it('section « Corbeille » · le sommet jeté n’a que « Restaurer » (ni ouvrir, ni tag, ni archive)', () => {
    for (const v of ['grille', 'liste'] as const) {
      expect(resume(menuDossier(d, 'jete', ctx(v, null, 'corbeille')))).toEqual([['restaurer', 'Restaurer', true, null]]);
    }
    expect(resume(menuDossier(d, 'jete', ctx('liste', LS, 'corbeille')))).toEqual([['restaurer', 'Restaurer', false, LS]]);
  });

  it('un dossier parti avec son parent, ou inconnu · aucun geste', () => {
    expect(menuDossier(d, 'sous-jete', ctx('liste'))).toEqual([]);
    expect(menuDossier(d, 'disparu', ctx('liste'))).toEqual([]);
  });
});

describe('optionsTagDossier et boutonTagSurCarte', () => {
  it('les 8 tags, celui porté marqué, puis « Retirer le tag » · sans tag, pas de retrait', () => {
    const o = optionsTagDossier(d, 'photos');
    expect(o.map((x) => [x.id, x.nom, x.actuel])).toEqual([
      ...TAGS_COULEUR.map((t) => [t.cle, t.libelle, t.cle === 'vert']),
      [null, 'Retirer le tag', false],
    ]);
    expect(o.slice(0, 8).map((x) => x.teinte)).toEqual(TAGS_COULEUR.map((t) => t.teinte));
    expect(optionsTagDossier(d, 'faces').map((x) => x.id)).toEqual(TAGS_COULEUR.map((t) => t.cle));
  });

  it('le bouton de la carte · un dossier taggable, en écriture · la vue le dit taggable pour le dossier verrouillé aussi', () => {
    const cartes = vueDrive(d, ETAT_DRIVE_INITIAL).dossiers;
    expect(cartes.map((c) => [c.id, boutonTagSurCarte(c, null), boutonTagSurCarte(c, LS)])).toEqual([
      ['lourd', true, false], ['photos', true, false], ['systeme', true, false],
    ]);
    expect(boutonTagSurCarte({ taggable: false }, null)).toBe(false);
  });
});

describe('destinationsDeplacementDossier · la liste des fichiers, jugée par la règle du serveur', () => {
  const arbre = donneesDrive({
    dossiers: [
      dossier('a'), dossier('a1', { parentId: 'a' }), dossier('a11', { parentId: 'a1' }),
      dossier('b'), dossier('sys', { locked: true }), dossier('mx', { brandId: 'marque-x' }),
      dossier('jete', { deletedAt: T0 }),
    ],
    medias: [],
  });
  const resumeD = (id: string) => destinationsDeplacementDossier(arbre, id).map((x) => [x.id, x.nom, x.actuel, x.raison]);

  it('même liste que « Déplacer vers… » d’un fichier · la racine non classée, puis les dossiers vivants par leur chemin', () => {
    expect(destinationsDeplacementDossier(arbre, 'a1').map((x) => [x.id, x.nom])).toEqual(dossiersRangement(arbre).map((r) => [r.id, r.nom]));
    expect(dossiersRangement(arbre).map((r) => r.id)).not.toContain('jete');
  });

  it('« a1 » · son parent marqué, lui-même et son descendant FERMÉS avec leur raison, le dossier système et l’autre marque aussi', () => {
    expect(resumeD('a1')).toEqual([
      [null, 'Assets de la marque · non classé', false, null],
      ['a', 'a', true, null],
      ['a1', 'a › a1', false, REFUS_DOSSIER.soiMeme],
      ['a11', 'a › a1 › a11', false, REFUS_DOSSIER.descendant],
      ['b', 'b', false, null],
      ['mx', 'mx', false, REFUS_DOSSIER.autreMarque],
      ['sys', 'sys', false, REFUS_DOSSIER.destinationSysteme],
    ]);
  });

  it('un dossier à la racine · la racine est « déjà ici » · chaque raison est celle de `validerDeplacementDossier`', () => {
    const r = destinationsDeplacementDossier(arbre, 'a');
    expect(r[0]).toMatchObject({ id: null, actuel: true, raison: null });
    const plats = arbre.dossiers.filter((x) => x.reel && !x.supprime).map((x) => ({ id: x.id, parentId: x.parent === 'r:assets' ? null : x.parent, name: x.nom, brandId: x.marque ?? null, locked: x.verrouille }));
    for (const o of r.slice(1)) {
      const v = validerDeplacementDossier(plats, 'a', o.id);
      expect([o.id, o.raison]).toEqual([o.id, v.ok ? null : v.raison]);
    }
    expect(r.filter((x) => x.raison).map((x) => x.id)).toEqual(['a', 'a1', 'a11', 'mx', 'sys']);
  });

  it('un dossier virtuel, en corbeille ou inconnu · aucune destination', () => {
    for (const id of ['r:assets', 'jete', 'disparu']) expect([id, destinationsDeplacementDossier(arbre, id)]).toEqual([id, []]);
  });
});
