import { describe, expect, it } from 'vitest';
import {
  FILTRES_CREATIONS_VIDES, POINTS_RELECTURE_EXPORT, TITRE_PROJET_MAX,
  axesFiltresCreations, basculerFiltreCreations, contenuCopieProjet, contenuVide, etatCreationFiltre, etatExportHumain, etatValidationRelecture,
  filtrerCreations, formatCreation, gestesCarteSpatiale, jaugeBudgetDevis, lireTraceRelecture, mediasCitesCopie, palettePastilles,
  phraseRelectureExport, pointsRelectureValides, raisonCopieProjet, reductionsDevis, resumeFiltresCreations, titreCopieProjet, titreProjetValide,
  validerContenuVersion,
  type ContenuVersion, type CreationFiltrable, type DocumentStudio,
} from '../src';

/**
 * Lot 8 V5 · Studios · les règles PURES · créations filtrables (PC C15),
 * contrôle humain avant export (PC F6, F7, D12), renommer / dupliquer
 * (CA S10), jauge et réductions du devis (PC B23, C5), palette (PC B11).
 */

const TOUS = POINTS_RELECTURE_EXPORT.map((p) => p.cle);

describe('créations filtrables · format réel, état, retenue, version', () => {
  it('le format est le rapport RÉEL du fichier · un « 4:5 » rendu en 768 × 1024 se dit 3:4', () => {
    expect([
      formatCreation(1080, 1350), formatCreation(1080, 1920), formatCreation(576, 1024), formatCreation(768, 1024),
      formatCreation(1024, 1536), formatCreation(1024, 1024), formatCreation(1080, 1351), formatCreation(1000, 1253), formatCreation(1000, 1361), formatCreation(1000, 1300), formatCreation(null, 1080), formatCreation(0, 10),
    ]).toEqual(['4:5', '9:16', '9:16', '3:4', '2:3', '1:1', '4:5', '4:5', '1000 × 1361', '10:13', null, null]);
  });

  const c = (format: string | null, etat: CreationFiltrable['etat'], retenue: CreationFiltrable['retenue'], version = 'Version 2 · courante', id = ''): CreationFiltrable & { id: string } => ({ format, etat, retenue, version, id });
  const LOT = [
    c('4:5', 'prete', 'retenue', undefined, 'a'), c('4:5', 'prete', 'non_retenue', undefined, 'b'), c('9:16', 'prete', 'non_retenue', undefined, 'c'),
    c(null, 'en_cours', null, undefined, 'd'), c('4:5', 'prete', 'non_retenue', 'Version 1', 'e'),
  ];

  it('seuls les axes qui SÉPARENT quelque chose sont proposés, avec leurs compteurs réels', () => {
    const axes = axesFiltresCreations(LOT);
    expect(axes.map((a) => [a.axe, a.options.map((o) => `${o.libelle} · ${o.n}`)])).toEqual([
      ['format', ['4:5 · 3', '9:16 · 1']],
      ['etat', ['Prêtes · 4', 'En préparation · 1']],
      ['retenue', ['Retenues · 1', 'Non retenues · 3']],
      ['version', ['Version 2 · courante · 4', 'Version 1 · 1']],
    ]);
    // Un seul format, un seul état · rien à filtrer, aucun axe.
    expect(axesFiltresCreations([c('4:5', 'prete', 'non_retenue'), c('4:5', 'prete', 'non_retenue')])).toEqual([]);
  });

  it('filtrer garde exactement les créations attendues, axes cumulés · l’ordre est conservé', () => {
    let f = basculerFiltreCreations(FILTRES_CREATIONS_VIDES, 'format', '4:5');
    expect(filtrerCreations(LOT, f).map((x) => x.id)).toEqual(['a', 'b', 'e']);
    f = basculerFiltreCreations(f, 'retenue', 'non_retenue');
    expect(filtrerCreations(LOT, f).map((x) => x.id)).toEqual(['b', 'e']);
    f = basculerFiltreCreations(f, 'version', 'Version 1');
    expect(filtrerCreations(LOT, f).map((x) => x.id)).toEqual(['e']);
    // Re-cliquer la valeur choisie la retire · « Toutes » (null) aussi.
    expect(basculerFiltreCreations(f, 'version', 'Version 1').version).toBeNull();
    expect(basculerFiltreCreations(f, 'format', null).format).toBeNull();
    // Un lot sans sortie n'est jamais « non retenu ».
    expect(filtrerCreations(LOT, basculerFiltreCreations(FILTRES_CREATIONS_VIDES, 'retenue', 'non_retenue')).map((x) => x.id)).toEqual(['b', 'c', 'e']);
  });

  it('l’état du filtre se lit · combien sur combien, quels filtres · vide, il le dit', () => {
    expect(resumeFiltresCreations(5, 5, FILTRES_CREATIONS_VIDES)).toEqual({ actif: false, phrase: null, vide: null });
    const f = { ...FILTRES_CREATIONS_VIDES, format: '4:5', retenue: 'retenue' };
    expect(resumeFiltresCreations(5, 1, f)).toEqual({ actif: true, phrase: '1 création sur 5 · Format 4:5 · Variante Retenues', vide: null });
    expect(resumeFiltresCreations(5, 0, f).vide).toBe('Aucune création ne passe ces filtres · réinitialise-les pour tout revoir.');
  });

  it('l’état d’une création suit l’état réel du lot', () => {
    expect([etatCreationFiltre({ pret: true, actif: false }), etatCreationFiltre({ pret: false, actif: true }), etatCreationFiltre({ pret: false, actif: false })])
      .toEqual(['prete', 'en_cours', 'sans_sortie']);
  });
});

describe('contrôle humain avant export · s’ajoute au préflight, ne le remplace pas', () => {
  it('cinq points, tous obligatoires · un point inconnu ou manquant est refusé', () => {
    expect(TOUS).toEqual(['produit', 'textes', 'promesses', 'marque', 'diffusion']);
    expect(pointsRelectureValides([...TOUS].reverse())).toEqual({ ok: true, points: TOUS });
    const r = pointsRelectureValides(['produit', 'textes']);
    expect(r.ok === false && r.manquants).toEqual(['promesses', 'marque', 'diffusion']);
    expect(r.ok === false && r.raison).toBe('3 points de relecture non cochés · coche les cinq avant de valider.');
    expect(pointsRelectureValides([...TOUS, 'autre']).ok).toBe(false);
    expect(pointsRelectureValides('produit').ok).toBe(false);
    expect(pointsRelectureValides(undefined).ok).toBe(false);
  });

  it('l’export n’est ouvert que préflight passé ET version relue · chaque refus a sa raison', () => {
    expect(etatExportHumain({ peutExporter: true, preflightOk: true, relue: true })).toEqual({ ouvert: true, raison: null });
    expect(etatExportHumain({ peutExporter: true, preflightOk: true, relue: false })).toEqual({ ouvert: false, raison: 'Les deux formats s’ouvrent dès que la relecture humaine de cette version est validée (cinq points ci-dessus).' });
    expect(etatExportHumain({ peutExporter: true, preflightOk: false, relue: true })).toEqual({ ouvert: false, raison: 'Les deux formats s’ouvrent dès que le contrôle avant export ne signale plus aucun point.' });
    expect(etatExportHumain({ peutExporter: true, preflightOk: false, relue: false }).raison).toContain('ET que la relecture humaine est validée');
    expect(etatExportHumain({ peutExporter: false, preflightOk: true, relue: true }).ouvert).toBe(false);
  });

  it('valider s’ouvre aux cinq cases cochées, et dit combien il en reste', () => {
    expect(etatValidationRelecture(['produit'])).toEqual({ ouvert: false, raison: 'Encore 4 points à cocher · la validation s’ouvre quand les cinq sont relus.' });
    expect(etatValidationRelecture(TOUS.slice(0, 4))).toEqual({ ouvert: false, raison: 'Encore 1 point à cocher · la validation s’ouvre quand les cinq sont relus.' });
    expect(etatValidationRelecture(TOUS)).toEqual({ ouvert: true, raison: null });
  });

  it('la trace d’audit n’est lue que COMPLÈTE · qui et quand se disent, heure de Paris', () => {
    expect(lireTraceRelecture({ projectId: 'p', versionId: 'v', versionN: 2, points: TOUS })).toEqual({ projectId: 'p', versionId: 'v', versionN: 2, points: TOUS });
    expect(lireTraceRelecture({ projectId: 'p', versionId: 'v', versionN: 2, points: TOUS.slice(1) })).toBeNull();
    expect(lireTraceRelecture({ projectId: 'p', versionId: 'v', versionN: 0, points: TOUS })).toBeNull();
    expect(lireTraceRelecture(null)).toBeNull();
    expect(phraseRelectureExport({ par: 'Kevin', le: '2026-11-08T13:32:00.000Z', versionN: 2 })).toBe('Relue par Kevin le 08/11/2026 à 14:32 · version 2');
    expect(phraseRelectureExport({ par: ' ', le: 'x', versionN: 1 })).toBe('Relue par un membre de l’espace · version 1');
  });
});

describe('renommer et dupliquer · le titre, la structure sans rien de produit', () => {
  it('un titre resserré, de 1 à 200 caractères · la copie se dit « Copie de … » sans dépasser la borne', () => {
    expect(titreProjetValide('  Rentrée   des clubs ')).toEqual({ ok: true, titre: 'Rentrée des clubs' });
    expect(titreProjetValide('   ').ok).toBe(false);
    expect(titreProjetValide(42).ok).toBe(false);
    expect(titreProjetValide('x'.repeat(TITRE_PROJET_MAX + 1)).ok).toBe(false);
    expect(titreCopieProjet('Rentrée des clubs')).toBe('Copie de Rentrée des clubs');
    const long = titreCopieProjet('y'.repeat(TITRE_PROJET_MAX));
    expect(long.length).toBe(TITRE_PROJET_MAX);
    expect(long.startsWith('Copie de y') && long.endsWith('…')).toBe(true);
    expect(titreProjetValide(long).ok).toBe(true);
  });

  const doc = (): DocumentStudio => ({
    width: 1080, height: 1350, colorSpace: 'sRGB', fonts: { f: { family: 'Sans', assetId: null } },
    layers: {
      fond: { id: 'fond', kind: 'image', name: 'Fond', visible: true, locked: false, x: 0, y: 0, width: 1080, height: 1350, rotationDeg: 0, opacity: 1, z: 0, assetId: 'a-upload', sourceWidth: 1080, sourceHeight: 1350, mask: null },
      gen: { id: 'gen', kind: 'image', name: 'Scène générée', visible: true, locked: false, x: 0, y: 0, width: 1080, height: 1350, rotationDeg: 0, opacity: 1, z: 1, assetId: 'a-gen', sourceWidth: 1080, sourceHeight: 1350, mask: null },
      masque: { id: 'masque', kind: 'image', name: 'Détourée', visible: true, locked: false, x: 0, y: 0, width: 10, height: 10, rotationDeg: 0, opacity: 1, z: 2, assetId: 'a-upload', sourceWidth: 10, sourceHeight: 10, mask: { format: 'grayscale8', width: 10, height: 10, assetId: 'a-rendu', featherPx: 0 } },
      titre: { id: 'titre', kind: 'text', name: 'Titre', visible: true, locked: false, x: 0, y: 0, width: 900, height: 100, rotationDeg: 0, opacity: 1, z: 3, text: 'Marre des boutons ?', fontId: 'f', fontSizePx: 60, color: '#ffffff', align: 'center', lineHeight: 1.1 },
      logo: { id: 'logo', kind: 'logo', name: 'Logo', visible: true, locked: false, x: 0, y: 0, width: 100, height: 50, rotationDeg: 0, opacity: 1, z: 4, assetId: 'logo_marque' },
    },
  });
  const source = (): ContenuVersion => ({
    ...contenuVide(),
    brief: { objective: 'Faire acheter le sérum', texts: ['Marre des boutons ?'] },
    productRef: { productId: 'p_serum', assetId: 'a_serum' }, styleRef: { lighting: 'douce' }, characterRefs: { lea: { nom: 'Léa' } },
    shots: { order: ['s1'], byId: { s1: { shotId: 's1', purpose: 'p', subject: 's', action: 'a', framing: 'f', camera: 'c', lighting: 'l', environment: 'e', referenceIds: [], narration: '', onScreenText: [], speechMode: 'none', estimatedDurationMs: 2000, actualDurationMs: 2100, keyframeAssetId: 'a-gen', clipAssetId: 'a-clip', voiceAssetId: null } } },
    document: doc(),
    timeline: { timebase: 1000, fps: { num: 30, den: 1 }, durationTicks: 2000, tracks: {}, voice: null, music: null, subtitles: { enabled: false } },
  });

  it('la copie garde brief, produit, style, identités, calques et plans · retire ce qui affiche un média produit ou exporté', () => {
    const s = source();
    expect(mediasCitesCopie(s).sort()).toEqual(['a-gen', 'a-rendu', 'a-upload', 'logo_marque']);
    const { contenu, bilan } = contenuCopieProjet(s, { 'a-upload': 'upload', 'a-gen': 'generated', 'a-rendu': 'render' });
    expect(contenu.brief).toEqual(s.brief);
    expect([contenu.productRef, contenu.styleRef, contenu.characterRefs]).toEqual([s.productRef, s.styleRef, s.characterRefs]);
    expect(Object.keys(contenu.document!.layers)).toEqual(['fond', 'titre', 'logo']);
    expect(bilan).toEqual({ calquesRetires: ['gen', 'masque'], plansVides: ['s1'], montageRetire: true });
    expect(contenu.shots.byId.s1).not.toHaveProperty('keyframeAssetId');
    expect(contenu.shots.byId.s1).not.toHaveProperty('clipAssetId');
    expect(contenu.shots.byId.s1).not.toHaveProperty('actualDurationMs');
    expect(contenu.shots.byId.s1!.purpose).toBe('p');
    expect(contenu.timeline).toBeNull();
    // La copie est un contenu valide (le dépôt la revalide à la création).
    expect(validerContenuVersion(contenu)).toEqual([]);
    // La source n'est pas modifiée.
    expect(Object.keys(s.document!.layers)).toHaveLength(5);
    expect(raisonCopieProjet({ titre: 'Sérum', versionN: 3 }, bilan)).toBe('Copie de « Sérum » (version 3) · structure seule, sans générations, exports, tests ni mesures · 2 calques d’image produite retirés · médias de 1 plan vidés · montage non repris');
  });

  it('un média sans origine relue (catalogue, inconnu) n’est pas retiré · seul ce qui est PRODUIT l’est', () => {
    const { bilan } = contenuCopieProjet(source(), {});
    expect(bilan.calquesRetires).toEqual([]);
  });

  it('les gestes de la carte · Renommer et Dupliquer avec le droit d’éditer, jamais sur un archivé', () => {
    expect(gestesCarteSpatiale({ id: 'p', archive: false }, true).map((g) => g.cle)).toEqual(['iterer', 'renommer', 'dupliquer', 'archiver']);
    expect(gestesCarteSpatiale({ id: 'p', archive: false }, false).map((g) => g.cle)).toEqual(['iterer']);
    expect(gestesCarteSpatiale({ id: 'p', archive: true }, true).map((g) => g.cle)).toEqual(['restaurer']);
  });
});

describe('devis · la jauge LIT le solde, les réductions suivent un refus de budget', () => {
  it('la jauge · part et phrase, jamais un prix', () => {
    expect(jaugeBudgetDevis({ solde: 1240, dotation: 2000, illimite: false })).toEqual({ part: 62, phrase: 'Ton solde · 1 240 crédits sur 2 000 · le devis serveur le compare au montant exact, rien n’est débité ici.' });
    expect(jaugeBudgetDevis({ solde: 0, dotation: 0, illimite: false }).part).toBe(0);
    expect(jaugeBudgetDevis({ solde: 0, dotation: 0, illimite: true }).part).toBe(100);
  });

  it('« Réduire les variantes » / « Garder un seul format » · seulement après un refus de budget, et si elles réduisent', () => {
    expect(reductionsDevis({ refusBudget: false, nombre: 4, formats: 3 })).toEqual([]);
    expect(reductionsDevis({ refusBudget: true, nombre: 4, formats: 3 }).map((r) => [r.cle, r.effet])).toEqual([['un_visuel', '1 visuel par format au lieu de 4'], ['un_format', 'le format source seul au lieu de 3']]);
    expect(reductionsDevis({ refusBudget: true, nombre: 1, formats: 1 })).toEqual([]);
  });
});

describe('palette de la marque · les couleurs de la fiche, au plus quatre', () => {
  it('valides, sans doublon, dans l’ordre · une fiche sans couleur le dit', () => {
    expect(palettePastilles(['#C4E6EF', '#c4e6ef', 'rouge', '#f4b6c8', '#000', '#123456', '#abcdef'])).toEqual({
      pastilles: ['#c4e6ef', '#f4b6c8', '#000', '#123456'], phrase: 'Palette de la fiche de la marque · 4 couleurs, à citer dans l’intention de style.',
    });
    expect(palettePastilles(null).pastilles).toEqual([]);
    expect(palettePastilles([]).phrase).toContain('aucune couleur');
  });
});
