import { describe, expect, it } from 'vitest';
import {
  donneesDrive, gestesSelection, fichierSelectionnable, validerSelectionFichiers, validerDroitSelection, validerIaSelection,
  refusSelectionFichiersTropLarge, refusSelectionTropLarge, messageGesteFichiers, RAISONS_SELECTION, GESTES_SANS_ACTION, TAG_SELECTION_MAX,
  type ContexteSelection, type DossierSource, type MediaSource,
} from '../src';

/**
 * Bibliothèque · la barre de SÉLECTION, fichiers compris (maquette `vBib` ·
 * une case sur chaque carte de fichier et chaque ligne de la liste) · règles
 * pures. Ce que la sélection contient, et pour chaque composition (dossiers
 * seuls, fichiers seuls, mixte) quels gestes s'ouvrent et la phrase de ceux
 * qui ne s'appliquent pas.
 */

const T0 = '2026-10-20T10:00:00.000Z';
const dossier = (id: string, name: string, o: Partial<DossierSource> = {}): DossierSource => ({ id, parentId: null, name, locked: false, deletedAt: null, createdAt: T0, ...o });
let k = 0;
const media = (folderId: string | null, extra: Partial<MediaSource> = {}): MediaSource => ({
  id: `m${++k}`, name: `f${k}`, kind: 'image', mimeType: 'image/png', source: 'upload', url: `/api/asset?id=m${k}`, thumbUrl: null, sizeBytes: 10, createdAt: T0, folderId, rights: null,
  ia: { utilisable: true, template: false, tags: [] }, ...extra,
});
k = 0;
const d = donneesDrive({
  dossiers: [
    dossier('a', 'Photos produit'),
    dossier('sys', 'Système', { locked: true }),
    dossier('x', 'Jeté', { deletedAt: T0 }),
    dossier('y', 'Sous jeté', { parentId: 'x' }),
  ],
  medias: [
    media('a', { rights: 'photo_marque' }), // m1
    media(null, { rights: 'photo_marque', ia: { utilisable: false, template: false, tags: [] } }), // m2
    media('y'), // m3 · dans un dossier jeté
    media(null, { source: 'studios', studio: { projetId: 'p1', projetTitre: 'Projet', href: '/p' } }), // m4 · lecture seule
    media(null, { source: 'historique', historique: { libelle: 'Ancien', telecharger: '/t' } }), // m5 · lecture seule
    media(null), // m6 · non classé, droits non classés
  ],
});
const DRIVE: ContexteSelection = { section: 'drive', lectureSeule: null, ia: true };
const ouverts = (s: ReturnType<typeof gestesSelection>) => s.gestes.filter((g) => g.ouvert).map((g) => g.cle);
const raison = (s: ReturnType<typeof gestesSelection>, cle: string) => s.gestes.find((g) => g.cle === cle)?.raison;

describe('ce qui se sélectionne', () => {
  it('un fichier de la bibliothèque · oui ; une sortie Studios, une ancienne création · non', () => {
    expect(d.fichiers.map((f) => [f.id, fichierSelectionnable(f)])).toEqual([['m1', true], ['m2', true], ['m3', true], ['m4', false], ['m5', false], ['m6', true]]);
  });
  it('racines, projets, dossiers système, corbeille, lecture seule et inconnus ne comptent jamais', () => {
    const s = gestesSelection(d, ['a', 'sys', 'r:assets', 'p:p1', 'x', 'y', 'm1', 'm3', 'm4', 'm5', 'disparu', 'm1'], DRIVE);
    expect(s.dossiers).toEqual([{ id: 'a', nom: 'Photos produit' }]);
    expect(s.fichiers.map((f) => f.id)).toEqual(['m1']);
  });
});

describe('les gestes selon la composition', () => {
  it('DOSSIERS seuls · corbeille, tag et déplacer ouverts ; droits, IA fermés avec leur phrase', () => {
    const s = gestesSelection(d, ['a'], DRIVE);
    expect(s.composition).toBe('dossiers');
    expect(s.gestes.map((g) => g.libelle)).toEqual(['Mettre à la corbeille', 'Tag de couleur', 'Déplacer vers…', 'Droits d’usage', 'Servir à l’IA', 'Utiliser dans un projet']);
    expect(ouverts(s)).toEqual(['corbeille', 'tag', 'ranger']);
    expect([raison(s, 'droits'), raison(s, 'ia'), raison(s, 'projet')]).toEqual([RAISONS_SELECTION.droitsDossiers, RAISONS_SELECTION.iaDossiers, RAISONS_SELECTION.projetDossiers]);
    expect(s.note).toBe('Les gestes des fichiers (droits et IA) ne s’appliquent pas à un dossier.');
  });

  it('rien de déplaçable (un dossier système seul) · « Déplacer vers… » fermé, avec sa phrase', () => {
    const s = gestesSelection(d, ['sys'], DRIVE);
    expect([s.composition, raison(s, 'ranger')]).toEqual(['vide', RAISONS_SELECTION.rangerVide]);
  });

  it('FICHIERS seuls · corbeille, déplacer, droits, IA ouverts ; « les fichiers ne portent pas de tag »', () => {
    const s = gestesSelection(d, ['m1', 'm2'], DRIVE);
    expect(s.composition).toBe('fichiers');
    expect(ouverts(s)).toEqual(['corbeille', 'ranger', 'droits', 'ia', 'projet']);
    expect(raison(s, 'tag')).toBe('Les fichiers ne portent pas de tag · seuls les dossiers en portent un.');
    expect(s.note).toBe('Les fichiers ne portent pas de tag · à la corbeille, ils restent restaurables.');
  });

  it('MIXTE · chaque geste ouvert vise sa part, la phrase dit laquelle', () => {
    const s = gestesSelection(d, ['a', 'm1', 'm2'], DRIVE);
    expect(s.composition).toBe('mixte');
    expect(ouverts(s)).toEqual(['corbeille', 'tag', 'droits', 'ia', 'projet']);
    // Déplacer · fermé pour une sélection mixte (deux actions ne feraient pas un tout ou rien).
    expect(raison(s, 'ranger')).toBe(RAISONS_SELECTION.rangerMixte);
    expect(s.note).toBe('Sélection mixte · corbeille pour tous, tag pour 1 dossier, droits et IA pour 2 fichiers · dossiers et fichiers se déplacent séparément.');
  });

  it('sans les gestes IA de l’écran · « Servir à l’IA » n’apparaît pas, la phrase ne le cite pas', () => {
    const s = gestesSelection(d, ['a', 'm1'], { ...DRIVE, ia: false });
    expect(s.gestes.map((g) => g.cle)).toEqual(['corbeille', 'tag', 'ranger', 'droits', 'projet']);
    expect(s.note).toBe('Sélection mixte · corbeille pour tous, tag pour 1 dossier, droits pour 1 fichier · dossiers et fichiers se déplacent séparément.');
  });

  it('CORBEILLE · seul « Restaurer », sur les dossiers jetés · un fichier VIVANT n’y est jamais', () => {
    const s = gestesSelection(d, ['x', 'm1'], { ...DRIVE, section: 'corbeille' });
    expect(s.gestes.map((g) => [g.cle, g.ouvert])).toEqual([['restaurer', true]]);
    expect(s.dossiers).toEqual([{ id: 'x', nom: 'Jeté' }]);
    expect(s.fichiers).toEqual([]);
    expect(s.note).toBeNull();
    expect(gestesSelection(d, ['a'], { ...DRIVE, section: 'corbeille' }).gestes[0]).toMatchObject({ ouvert: false, raison: RAISONS_SELECTION.restaurerVide });
  });

  it('LECTURE SEULE · tout est fermé, avec la raison de la lecture seule', () => {
    const s = gestesSelection(d, ['a', 'm1'], { ...DRIVE, lectureSeule: 'Ton offre ne permet pas d’ajouter des médias.' });
    expect(ouverts(s)).toEqual([]);
    expect(new Set(s.gestes.map((g) => g.raison))).toEqual(new Set(['Ton offre ne permet pas d’ajouter des médias.']));
    expect(s.note).toBe('Ton offre ne permet pas d’ajouter des médias.');
  });

  it('« Servir à l’IA » · retire de l’IA quand TOUS y servent déjà, sinon y met', () => {
    expect(gestesSelection(d, ['m1'], DRIVE)).toMatchObject({ iaCible: false });
    expect(gestesSelection(d, ['m1'], DRIVE).gestes.find((g) => g.cle === 'ia')!.libelle).toBe('Ne plus servir à l’IA');
    expect(gestesSelection(d, ['m1', 'm2'], DRIVE)).toMatchObject({ iaCible: true });
    expect(gestesSelection(d, ['m2'], DRIVE).gestes.find((g) => g.cle === 'ia')!.libelle).toBe('Servir à l’IA');
  });

  it('le droit commun est pré-choisi · des droits différents n’en pré-choisissent aucun', () => {
    expect(gestesSelection(d, ['m1', 'm2'], DRIVE).droitCommun).toBe('photo_marque');
    expect(gestesSelection(d, ['m1', 'm6'], DRIVE).droitCommun).toBeUndefined();
    expect(gestesSelection(d, ['m1', 'm2'], DRIVE).inviteDroits).toBe('Droits d’usage · Photo de la marque');
    expect(gestesSelection(d, ['m6'], DRIVE).inviteDroits).toBe('Droits d’usage · non classés');
    expect(gestesSelection(d, ['m1', 'm6'], DRIVE).inviteDroits).toBe('Droits d’usage…');
  });

  it(`au-delà de ${TAG_SELECTION_MAX} fichiers · corbeille, déplacer, droits, IA fermés AVANT le clic, avec la phrase de l’action`, () => {
    const beaucoup = donneesDrive({ dossiers: [], medias: Array.from({ length: TAG_SELECTION_MAX + 1 }, () => media(null)) });
    const ids = beaucoup.fichiers.map((f) => f.id);
    const s = gestesSelection(beaucoup, ids, DRIVE);
    expect(['corbeille', 'ranger', 'droits', 'ia', 'projet'].map((c) => raison(s, c))).toEqual(Array(5).fill(refusSelectionFichiersTropLarge(TAG_SELECTION_MAX + 1)));
    expect(s.note).toBe(refusSelectionFichiersTropLarge(TAG_SELECTION_MAX + 1));
    expect(ouverts(gestesSelection(beaucoup, ids.slice(1), DRIVE))).toEqual(['corbeille', 'ranger', 'droits', 'ia', 'projet']);
  });

  it(`au-delà de ${TAG_SELECTION_MAX} dossiers · le tag fermé, la phrase de la barre le dit`, () => {
    const beaucoup = donneesDrive({ dossiers: Array.from({ length: TAG_SELECTION_MAX + 1 }, (_, i) => dossier(`d${i}`, `D${i}`)), medias: [] });
    const s = gestesSelection(beaucoup, beaucoup.dossiers.filter((x) => x.reel).map((x) => x.id), DRIVE);
    expect(raison(s, 'tag')).toBe(refusSelectionTropLarge(TAG_SELECTION_MAX + 1));
    expect(s.note).toBe(refusSelectionTropLarge(TAG_SELECTION_MAX + 1));
  });

  it('les gestes de la maquette sans action serveur · fermés, chacun avec sa raison', () => {
    expect(GESTES_SANS_ACTION.map((g) => g.libelle)).toEqual(['Partager au client', 'Favori']);
    for (const g of GESTES_SANS_ACTION) expect(g.raison.length, g.cle).toBeGreaterThan(20);
  });
});

describe('ce que les actions groupées acceptent', () => {
  const U = (i: number) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`;
  it('des UUID, dédoublonnés (casse comprise)', () => {
    expect(validerSelectionFichiers([U(1), U(1), U(1).toUpperCase(), U(2)])).toEqual({ ok: true, ids: [U(1), U(2)] });
  });
  it('liste illisible, vide, ou au-delà de la borne · refus ENTIER, avec sa phrase', () => {
    expect(validerSelectionFichiers([U(1), 'x'])).toEqual({ ok: false, raison: 'Sélection illisible · rien n’a été modifié.' });
    expect(validerSelectionFichiers('tout')).toEqual({ ok: false, raison: 'Sélection illisible · rien n’a été modifié.' });
    expect(validerSelectionFichiers([])).toEqual({ ok: false, raison: 'Aucun fichier sélectionné.' });
    const trop = Array.from({ length: TAG_SELECTION_MAX + 1 }, (_, i) => U(i));
    expect(validerSelectionFichiers(trop)).toEqual({ ok: false, raison: refusSelectionFichiersTropLarge(TAG_SELECTION_MAX + 1) });
    expect(validerSelectionFichiers(trop.slice(1))).toMatchObject({ ok: true });
  });
  it('un droit du catalogue ou null · un droit inconnu refusé', () => {
    expect(validerDroitSelection([U(1)], 'ugc_accord')).toEqual({ ok: true, ids: [U(1)], droit: 'ugc_accord' });
    expect(validerDroitSelection([U(1)], null)).toEqual({ ok: true, ids: [U(1)], droit: null });
    expect(validerDroitSelection([U(1)], 'faux')).toEqual({ ok: false, raison: 'Droit d’usage inconnu.' });
    expect(validerDroitSelection([U(1)], undefined)).toEqual({ ok: false, raison: 'Droit d’usage inconnu.' });
  });
  it('l’usage par l’IA · un booléen, rien d’autre', () => {
    expect(validerIaSelection([U(1)], false)).toEqual({ ok: true, ids: [U(1)], useForAi: false });
    for (const x of ['true', 1, null, undefined]) expect(validerIaSelection([U(1)], x), String(x)).toEqual({ ok: false, raison: 'Réglage IA illisible · rien n’a été modifié.' });
  });
  it('les messages après le geste', () => {
    expect(messageGesteFichiers('ranger', 2, { dossier: 'Photos' })).toBe('2 fichiers rangés dans « Photos »');
    expect(messageGesteFichiers('droits', 1)).toBe('Droits d’usage enregistrés pour 1 fichier');
    expect(messageGesteFichiers('ia', 3, { useForAi: true })).toBe('3 fichiers peuvent servir à l’IA');
    expect(messageGesteFichiers('ia', 1, { useForAi: false })).toBe('1 fichier ne servira plus à l’IA');
  });
});
