import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  TAGS_COULEUR, estTagCouleur, tagCouleur, lireFiltreTag, validerTagCouleur, messageTagPose, tagsEnUsage, contrasteEtiquetteTag,
  donneesDrive, vueDrive, ETAT_DRIVE_INITIAL, type DossierSource, type EtatDrive, type MediaSource,
  validerSelectionTag, refusSelectionTropLarge, messageTagSelection, noteSelectionTag, selectionATaguer, TAG_SELECTION_MAX,
} from '../src';

/**
 * Bibliothèque · tags de couleur des dossiers · règles pures. Le catalogue est
 * celui de la maquette (clé, libellé, teinte, ordre) ; la contrainte CHECK de
 * la migration 0064 porte EXACTEMENT ces clés ; le filtre de la vue ne montre
 * que les dossiers réels vivants qui portent le tag.
 */

const T0 = '2026-10-20T10:00:00.000Z';
const dossier = (id: string, name: string, o: Partial<DossierSource> = {}): DossierSource => ({ id, parentId: null, name, locked: false, deletedAt: null, createdAt: T0, ...o });
const etat = (o: Partial<EtatDrive> = {}): EtatDrive => ({ ...ETAT_DRIVE_INITIAL, ...o });

describe('catalogue · celui de la maquette, à l’identique', () => {
  it('huit tags, dans l’ordre de la maquette, libellés français', () => {
    expect(TAGS_COULEUR.map((t) => [t.cle, t.libelle, t.teinte])).toEqual([
      ['rouge', 'Urgent', '#f87171'], ['orange', 'À valider', '#fb923c'], ['jaune', 'En cours', '#facc15'], ['vert', 'Validé', '#4ade80'],
      ['bleu', 'Client', '#60a5fa'], ['violet', 'Inspiration', '#a78bfa'], ['rose', 'Campagne', '#f472b6'], ['gris', 'Archive', '#94a3b8'],
    ]);
  });

  it('la contrainte CHECK de la migration 0064 porte exactement les clés du catalogue', () => {
    const sql = readFileSync(join(__dirname, '../../db/drizzle/0064_tags_couleur_dossiers.sql'), 'utf8');
    const liste = /CHECK \("color_tag" IN \(([^)]*)\)\)/.exec(sql)?.[1] ?? '';
    expect(liste.split(',').map((x) => x.trim().replace(/'/g, ''))).toEqual(TAGS_COULEUR.map((t) => t.cle));
  });
});

describe('validation · une clé du catalogue ou null, rien d’autre', () => {
  it('poser, retirer', () => {
    expect(validerTagCouleur('vert')).toEqual({ ok: true, tag: 'vert' });
    expect(validerTagCouleur(null)).toEqual({ ok: true, tag: null });
  });
  it('hors liste refusé, avec la phrase de l’écran', () => {
    for (const x of ['fuchsia', 'Vert', '', ' vert', undefined, 3, {}, ['vert'], '#4ade80']) {
      expect(validerTagCouleur(x), String(x)).toEqual({ ok: false, raison: 'Couleur inconnue · choisis un tag de la liste.' });
    }
    expect(estTagCouleur('rose')).toBe(true);
    expect(estTagCouleur('magenta')).toBe(false);
    expect(tagCouleur('magenta')).toBeNull();
  });
  it('adresse · `?tag=` valide filtre, tout le reste n’en pose aucun', () => {
    expect(lireFiltreTag('bleu')).toBe('bleu');
    expect(lireFiltreTag('BLEU')).toBeNull();
    expect(lireFiltreTag(['bleu', 'vert'])).toBeNull();
    expect(lireFiltreTag(undefined)).toBeNull();
  });
  it('le message du geste · celui de la maquette', () => {
    expect(messageTagPose('vert', 'Photos produit')).toBe('Tag « Validé » ajouté à « Photos produit »');
    expect(messageTagPose(null, 'Photos produit')).toBe('Tag retiré');
  });
});

describe('puces · seulement les tags en usage, comptés, dans l’ordre du catalogue', () => {
  it('compte et ordre', () => {
    const p = tagsEnUsage(['vert', 'orange', null, 'vert', 'inconnu', undefined], 'vert');
    expect(p.map((t) => [t.cle, t.compte, t.actif])).toEqual([['orange', 1, false], ['vert', 2, true]]);
    expect(tagsEnUsage([null, null])).toEqual([]);
  });
});

describe('vue · le filtre par tag', () => {
  const d = donneesDrive({
    dossiers: [
      dossier('a', 'Photos produit', { colorTag: 'vert', locked: true }),
      dossier('b', 'UGC', { colorTag: 'orange' }),
      dossier('c', 'Packshots', { parentId: 'a', colorTag: 'vert' }),
      dossier('x', 'Jeté', { colorTag: 'vert', deletedAt: T0 }),
      dossier('y', 'Sous jeté', { parentId: 'x', colorTag: 'vert' }),
      dossier('z', 'Valeur folle', { colorTag: 'fuchsia' }),
    ],
    medias: [],
  });

  it('les dossiers réels VIVANTS qui portent le tag, toutes profondeurs · ni corbeille, ni enfant d’un dossier jeté', () => {
    const v = vueDrive(d, etat({ tag: 'vert' }));
    expect(v.dossiers.map((x) => x.nom)).toEqual(['Packshots', 'Photos produit']);
    expect(v.fichiers).toEqual([]);
    expect(v.filtreTag?.libelle).toBe('Validé');
    expect(v.fil).toEqual([{ libelle: 'Dossiers tagués « Validé »', index: null }]);
    expect(v.banniere).toBe(false);
    expect(v.nouveau, 'pas de « Nouveau sous-dossier » sous un filtre').toBeNull();
    expect(v.onglets.some((o) => o.actif)).toBe(false);
  });

  it('les puces comptent les dossiers vivants · une valeur hors catalogue ne s’affiche nulle part', () => {
    const v = vueDrive(d, etat());
    expect(v.tags.map((t) => [t.libelle, t.compte])).toEqual([['À valider', 1], ['Validé', 2]]);
    expect(d.dossiers.find((x) => x.id === 'z')!.tag).toBeNull();
    expect(v.filtreTag).toBeNull();
  });

  it('cartes · l’étiquette du tag, et le geste sur les dossiers réels seulement (verrouillé compris, corbeille exclue)', () => {
    const v = vueDrive(d, etat());
    const a = v.dossiers.find((x) => x.id === 'a')!;
    expect([a.tag?.libelle, a.taggable]).toEqual(['Validé', true]);
    const racines = vueDrive(d, etat({ chemin: [] }));
    expect(racines.dossiers.every((x) => !x.taggable), 'une racine virtuelle ne se tague pas').toBe(true);
    const corbeille = vueDrive(d, etat({ section: 'corbeille' }));
    expect(corbeille.dossiers.map((x) => [x.nom, x.taggable])).toEqual([['Jeté', false]]);
  });

  it('l’arbre porte la pastille', () => {
    const v = vueDrive(d, etat());
    expect(v.arbre.filter((n) => n.tag).map((n) => [n.nom, n.tag!.cle])).toEqual([['Photos produit', 'vert'], ['UGC', 'orange']]);
  });

  it('aucun dossier avec ce tag · un vide qui le dit', () => {
    const v = vueDrive(d, etat({ tag: 'rouge' }));
    expect(v.dossiers).toEqual([]);
    expect(v.vide?.titre).toBe('Aucun dossier tagué « Urgent »');
  });

  it('le filtre s’efface devant une recherche ou une autre section', () => {
    expect(vueDrive(d, etat({ tag: 'vert', recherche: 'ugc' })).filtreTag).toBeNull();
    expect(vueDrive(d, etat({ tag: 'vert', section: 'recents' })).filtreTag).toBeNull();
  });
});

describe('lisibilité mesurée · l’étiquette d’un tag se lit dans les deux thèmes', () => {
  it('chaque tag, sombre et clair · au moins 4,5:1 (texte 11 px)', () => {
    const faibles: string[] = [];
    for (const t of TAGS_COULEUR) for (const th of ['sombre', 'clair'] as const) {
      const r = contrasteEtiquetteTag(t.cle, th);
      if (r < 4.5) faibles.push(`${t.cle} ${th} ${r.toFixed(2)}`);
    }
    expect(faibles).toEqual([]);
  });
  it('la mesure distingue · le pire tag sombre est le rouge (7,27, tableau du module)', () => {
    expect(contrasteEtiquetteTag('rouge', 'sombre')).toBeCloseTo(7.27, 2);
    expect(contrasteEtiquetteTag('jaune', 'clair')).toBeCloseTo(8.72, 2);
  });
});

/* ───────────────────────── Tag d'une SÉLECTION (barre de sélection) ───────────────────────── */

const uuid = (i: number) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`;

describe('sélection · ce que l’action accepte · tout ou rien', () => {
  it('une liste d’UUID et un tag · dédoublonnée (casse comprise), dans l’ordre', () => {
    expect(validerSelectionTag([uuid(1), uuid(2), uuid(1), uuid(2).toUpperCase()], 'vert')).toEqual({ ok: true, ids: [uuid(1), uuid(2)], tag: 'vert' });
    expect(validerSelectionTag([uuid(3)], null)).toEqual({ ok: true, ids: [uuid(3)], tag: null });
  });
  it('un tag hors catalogue refuse le geste entier, avant la liste', () => {
    expect(validerSelectionTag([uuid(1)], 'fuchsia')).toEqual({ ok: false, raison: 'Couleur inconnue · choisis un tag de la liste.' });
    expect(validerSelectionTag('pas une liste', 'fuchsia')).toEqual({ ok: false, raison: 'Couleur inconnue · choisis un tag de la liste.' });
  });
  it('une liste illisible · pas un tableau, un élément vide, pas un UUID, pas une chaîne · refus entier, jamais une liste tronquée', () => {
    for (const ids of [undefined, null, 'x', {}, [uuid(1), ''], [uuid(1), 'x'], [uuid(1), 7], [uuid(1), null], [`${uuid(1)} `], ['00000000-0000-4000-8000-00000000000g']]) {
      expect(validerSelectionTag(ids, 'vert'), JSON.stringify(ids)).toEqual({ ok: false, raison: 'Sélection illisible · rien n’a été tagué.' });
    }
  });
  it('une liste vide · rien à taguer', () => {
    expect(validerSelectionTag([], 'vert')).toEqual({ ok: false, raison: 'Aucun dossier sélectionné.' });
  });
  it(`borne · ${TAG_SELECTION_MAX} passe, ${TAG_SELECTION_MAX + 1} est refusé en entier · les doublons ne comptent qu’une fois`, () => {
    const max = Array.from({ length: TAG_SELECTION_MAX }, (_, i) => uuid(i + 1));
    const r = validerSelectionTag(max, 'bleu');
    expect(r.ok && r.ids.length).toBe(TAG_SELECTION_MAX);
    expect(validerSelectionTag([...max, uuid(1), uuid(2)], 'bleu').ok, 'des doublons ne font pas dépasser la borne').toBe(true);
    expect(validerSelectionTag([...max, uuid(TAG_SELECTION_MAX + 1)], 'bleu')).toEqual({ ok: false, raison: '101 dossiers sélectionnés · 100 au plus par geste, rien n’a été tagué.' });
    expect(refusSelectionTropLarge(250)).toBe('250 dossiers sélectionnés · 100 au plus par geste, rien n’a été tagué.');
  });
});

describe('sélection · les messages dits à l’écran', () => {
  it('après le geste · combien de dossiers, et que les fichiers ne portent pas de tag', () => {
    expect(messageTagSelection('vert', 3)).toBe('3 dossiers tagués « Validé »');
    expect(messageTagSelection('vert', 1)).toBe('1 dossier tagué « Validé »');
    expect(messageTagSelection('vert', 3, 2)).toBe('3 dossiers tagués « Validé » · les fichiers ne portent pas de tag');
    expect(messageTagSelection(null, 2)).toBe('Tag retiré de 2 dossiers');
    expect(messageTagSelection(null, 1, 1)).toBe('Tag retiré de 1 dossier · les fichiers ne portent pas de tag');
  });
  it('avant le geste · la ligne du menu', () => {
    expect(noteSelectionTag(0)).toBe('Seuls les dossiers portent un tag.');
    expect(noteSelectionTag(1)).toBe('1 fichier sélectionné ne sera pas tagué · les fichiers ne portent pas de tag.');
    expect(noteSelectionTag(4)).toBe('4 fichiers sélectionnés ne seront pas tagués · les fichiers ne portent pas de tag.');
  });
});

describe('sélection · ce que l’écran envoie à l’action', () => {
  let k = 0;
  const media = (folderId: string | null, extra: Partial<MediaSource> = {}): MediaSource => ({
    id: `m${++k}`, name: `f${k}`, kind: 'image', mimeType: 'image/png', source: 'upload', url: `/api/asset?id=m${k}`, thumbUrl: null, sizeBytes: 10, createdAt: T0, folderId, rights: null, ...extra,
  });
  const d = donneesDrive({
    dossiers: [
      dossier('a', 'Photos produit', { colorTag: 'vert', locked: true }),
      dossier('b', 'UGC', { colorTag: 'vert' }),
      dossier('c', 'Packshots', { parentId: 'a' }),
      dossier('x', 'Jeté', { deletedAt: T0 }),
      dossier('y', 'Sous jeté', { parentId: 'x' }),
    ],
    medias: [media('a'), media(null), media(null, { source: 'studios', studio: { projetId: 'p1', projetTitre: 'Projet', href: '/p' } })],
  });

  it('seuls les dossiers RÉELS vivants partent · fichiers comptés à part, racines, projets, corbeille et inconnus ignorés', () => {
    const s = selectionATaguer(d, ['a', 'c', 'm1', 'm2', 'r:assets', 'p:p1', 'x', 'y', 'disparu', 'a']);
    expect(s.dossiers).toEqual([{ id: 'a', nom: 'Photos produit', tag: 'vert' }, { id: 'c', nom: 'Packshots', tag: null }]);
    expect(s.fichiers).toBe(2);
    expect([s.commun, s.retirable, s.refus]).toEqual([null, true, null]);
  });
  it('le tag commun est coché, « Retirer » ne se propose que si un dossier en porte un', () => {
    expect(selectionATaguer(d, ['a', 'b'])).toMatchObject({ commun: 'vert', retirable: true });
    expect(selectionATaguer(d, ['c'])).toMatchObject({ commun: null, retirable: false });
  });
  it('rien à taguer · le geste se ferme avec sa raison', () => {
    expect(selectionATaguer(d, ['m1', 'x']).refus).toBe('Aucun dossier dans la sélection · seuls les dossiers portent un tag.');
    expect(selectionATaguer(d, []).refus).toBe('Aucun dossier dans la sélection · seuls les dossiers portent un tag.');
  });
  it(`au-delà de ${TAG_SELECTION_MAX} dossiers · fermé AVANT le clic, avec la phrase de l’action`, () => {
    const beaucoup = donneesDrive({ dossiers: Array.from({ length: TAG_SELECTION_MAX + 1 }, (_, i) => dossier(`d${i}`, `D${i}`)), medias: [] });
    const ids = beaucoup.dossiers.filter((x) => x.reel).map((x) => x.id);
    expect(selectionATaguer(beaucoup, ids).refus).toBe(refusSelectionTropLarge(TAG_SELECTION_MAX + 1));
    expect(selectionATaguer(beaucoup, ids.slice(1)).refus).toBeNull();
  });
});
