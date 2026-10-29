import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  TAGS_COULEUR, estTagCouleur, tagCouleur, lireFiltreTag, validerTagCouleur, messageTagPose, tagsEnUsage, contrasteEtiquetteTag,
  donneesDrive, vueDrive, ETAT_DRIVE_INITIAL, type DossierSource, type EtatDrive,
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
