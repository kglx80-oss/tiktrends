import { describe, expect, it } from 'vitest';
import {
  donneesDrive, versementApercu, validerCreationVersement, briefCreationVersement, raisonVersement, messageCreationVersement, validerFormeBrief,
  versementSelection, validerIntentionCreation, intentionCreationVide, intentionRenseignee, phraseBriefCreation, construireBriefV5, saisieBriefVide,
  RAISONS_ECART_VERSEMENT, RAISONS_VERSEMENT, RAISON_MARQUE_CREATION, RAISONS_INTENTION, CLES_BRIEF, TITRE_NOUVEAU_PROJET_MAX, OBJECTIF_MAX, OBJECTIFS_V5,
  type MediaSource,
} from '../src';

/**
 * Bibliothèque · « Utiliser dans un projet » depuis l'APERÇU d'un fichier, et
 * « Nouveau projet » dans la fenêtre de versement · règles pures. L'aperçu
 * applique la règle de la barre de sélection à un seul fichier ; la création
 * reprend la règle de nom de « Nouveau projet » et la règle du versement, et
 * dit clairement quand le projet est créé mais le versement refusé.
 */

const T0 = '2026-10-20T10:00:00.000Z';
const media = (id: string, extra: Partial<MediaSource> = {}): MediaSource => ({
  id, name: `${id}.jpg`, kind: 'image', mimeType: 'image/jpeg', source: 'upload', url: `/api/asset?id=${id}`, thumbUrl: null, sizeBytes: 10, createdAt: T0, folderId: null, rights: null,
  ia: { utilisable: true, template: false, tags: [] }, ...extra,
});
const d = donneesDrive({
  dossiers: [
    { id: 'vivant', parentId: null, name: 'Photos', locked: false, deletedAt: null, createdAt: T0 },
    { id: 'jete', parentId: null, name: 'Vieux', locked: false, deletedAt: T0, createdAt: T0 },
  ],
  medias: [
    media('img', { rights: 'photo_marque', folderId: 'vivant' }),
    media('vid', { kind: 'video', mimeType: 'video/mp4', name: 'rush.mp4' }),
    media('douteuse', { rights: 'a_preciser' }),
    media('corbeille', { deletedAt: T0 }),
    media('sous-jete', { folderId: 'jete' }),
    media('studio', { studio: { projetId: 'p1', projetTitre: 'Projet', href: '/studio/projets/p1' } }),
    media('ancien', { historique: { libelle: 'Ancien', telecharger: '/x' } }),
  ],
});
const UUID = '44444444-4444-4444-8444-444444444444';
const F = '11111111-1111-4111-8111-111111111111';

describe('versementApercu · la règle de la barre, appliquée au fichier de l’aperçu', () => {
  it('une image vivante aux droits autorisés · ouvert, avec le libellé de la barre et ce seul fichier', () => {
    expect(versementApercu(d, 'img', null)).toEqual({ libelle: 'Utiliser dans un projet', ouvert: true, raison: null, fichiers: [{ id: 'img' }] });
  });

  it('lecture seule · FERMÉ avec la raison de la lecture seule (proposé, jamais actionnable)', () => {
    expect(versementApercu(d, 'img', 'Ton rôle est en lecture seule.')).toMatchObject({ ouvert: false, raison: 'Ton rôle est en lecture seule.' });
  });

  it('pas une image, droits à préciser · fermé avec la raison d’écart du versement', () => {
    expect(versementApercu(d, 'vid', null)).toMatchObject({ ouvert: false, raison: RAISONS_ECART_VERSEMENT.type });
    expect(versementApercu(d, 'douteuse', null)).toMatchObject({ ouvert: false, raison: RAISONS_ECART_VERSEMENT.droits });
  });

  it('corbeille, dossier en corbeille, sortie Studios, ancienne création, inconnu · NON proposé', () => {
    for (const id of ['corbeille', 'sous-jete', 'studio', 'ancien', 'inconnu']) expect(versementApercu(d, id, null), id).toBeNull();
    expect(versementApercu(d, 'corbeille', 'lecture seule')).toBeNull();
  });

  it('ce que la fenêtre reçoit de l’aperçu donne la même phrase que la barre pour ce fichier', () => {
    expect(versementSelection(d, versementApercu(d, 'img', null)!.fichiers).phrase).toBe('1 image deviendra une référence du projet.');
  });
});

describe('validerCreationVersement · rien n’est créé pour une entrée refusée', () => {
  const base = { brandId: UUID, titre: '  Rentrée  ', type: 'ads', ids: [F], role: 'style', scope: 'global' };
  it('entrée valide · titre rogné, identifiants en minuscules', () => {
    expect(validerCreationVersement({ ...base, brandId: UUID.toUpperCase() })).toEqual({ ok: true, brandId: UUID, titre: 'Rentrée', type: 'ads', ids: [F], role: 'style', scope: 'global', intention: intentionCreationVide() });
  });
  it('la règle de nom de « Nouveau projet » · titre vide, trop long, type inconnu', () => {
    expect(validerCreationVersement({ ...base, titre: '   ' })).toEqual({ ok: false, raison: 'Donne un titre au projet.' });
    expect(validerCreationVersement({ ...base, titre: 'x'.repeat(TITRE_NOUVEAU_PROJET_MAX + 1) })).toEqual({ ok: false, raison: `Titre trop long · ${TITRE_NOUVEAU_PROJET_MAX} caractères au plus.` });
    expect(validerCreationVersement({ ...base, type: 'film' })).toEqual({ ok: false, raison: 'Choisis un type de projet.' });
  });
  it('marque absente ou pas un identifiant · refus', () => {
    expect(validerCreationVersement({ ...base, brandId: undefined })).toEqual({ ok: false, raison: RAISON_MARQUE_CREATION });
    expect(validerCreationVersement({ ...base, brandId: 'marque-a' })).toEqual({ ok: false, raison: RAISON_MARQUE_CREATION });
  });
  it('la règle du versement · rôle Produit, rôle absent, portée absente, aucun fichier', () => {
    expect(validerCreationVersement({ ...base, role: 'product' })).toEqual({ ok: false, raison: RAISONS_VERSEMENT.roleProduit });
    expect(validerCreationVersement({ ...base, role: '' })).toEqual({ ok: false, raison: RAISONS_VERSEMENT.role });
    expect(validerCreationVersement({ ...base, scope: 'partout' })).toEqual({ ok: false, raison: RAISONS_VERSEMENT.portee });
    expect(validerCreationVersement({ ...base, ids: [] }).ok).toBe(false);
  });
});

describe('l’intention dès la création · la règle de l’étape brief de l’assistant, aucune seconde', () => {
  const base = { brandId: UUID, titre: 'Rentrée', type: 'ads', ids: [F], role: 'style', scope: 'global' };
  const saisie = { intention: 'Prouver que la preuve sociale bat le prix', objectifType: 'conversion', angle: 'Avis clients en gros plan' };

  it('intention, objectif et angle passent tels quels dans l’entrée relue', () => {
    expect(validerCreationVersement({ ...base, saisie })).toMatchObject({ ok: true, intention: saisie });
  });

  it('absente, nulle, ou chaînes vides · l’intention vide (le comportement d’avant)', () => {
    for (const s of [undefined, null, {}, { intention: '', objectifType: '', angle: '' }, { objectifType: null }]) {
      expect(validerIntentionCreation(s), JSON.stringify(s)).toEqual({ ok: true, intention: intentionCreationVide() });
    }
    expect(intentionRenseignee(intentionCreationVide())).toBe(false);
    expect(intentionRenseignee({ ...intentionCreationVide(), angle: '  ' })).toBe(false);
    expect(intentionRenseignee({ ...intentionCreationVide(), objectifType: 'notoriete' })).toBe(true);
  });

  it('les bornes de l’écran « Nouveau projet » · OBJECTIF_MAX accepté, un caractère de plus refusé · RIEN n’est accepté', () => {
    expect(validerIntentionCreation({ intention: 'x'.repeat(OBJECTIF_MAX), angle: 'y'.repeat(OBJECTIF_MAX) }).ok).toBe(true);
    expect(validerCreationVersement({ ...base, saisie: { intention: 'x'.repeat(OBJECTIF_MAX + 1) } })).toEqual({ ok: false, raison: RAISONS_INTENTION.intention });
    expect(validerCreationVersement({ ...base, saisie: { angle: 'y'.repeat(OBJECTIF_MAX + 1) } })).toEqual({ ok: false, raison: RAISONS_INTENTION.angle });
    expect(RAISONS_INTENTION.intention).toBe('Intention trop longue · 2000 caractères au plus.');
  });

  it('les valeurs autorisées de l’objectif · chacune d’OBJECTIFS_V5 passe, toute autre est refusée', () => {
    for (const o of OBJECTIFS_V5) expect(validerIntentionCreation({ objectifType: o })).toMatchObject({ ok: true, intention: { objectifType: o } });
    for (const o of ['vente', 'Conversion', 3, true]) expect(validerCreationVersement({ ...base, saisie: { objectifType: o } }), String(o)).toEqual({ ok: false, raison: RAISONS_INTENTION.objectif });
  });

  it('une forme illisible · refusée, jamais ignorée en silence', () => {
    for (const s of ['texte', 42, [], { intention: 7 }, { angle: { x: 1 } }]) expect(validerCreationVersement({ ...base, saisie: s }), JSON.stringify(s)).toEqual({ ok: false, raison: RAISONS_INTENTION.forme });
  });

  it('le brief composé est CELUI de l’assistant pour la même saisie · objectif, objectif typé, angle', () => {
    const v = validerCreationVersement({ ...base, saisie: { ...saisie, intention: `  ${saisie.intention}  ` } });
    if (!v.ok) throw new Error(v.raison);
    const b = briefCreationVersement(v.intention);
    expect(b).toEqual(construireBriefV5({ ...saisieBriefVide(), intention: saisie.intention, objectifType: 'conversion', angle: saisie.angle }));
    expect([b.objective, b.objectifType, b.angle]).toEqual([saisie.intention, 'conversion', saisie.angle]);
    expect(validerFormeBrief(b)).toEqual([]);
  });

  it('raisonVersement · une intention hors règle ferme le bouton avec sa raison, en nouveau projet seulement', () => {
    const e = { occupe: false, selection: { versables: [{ id: 'img', nom: 'img.jpg' }], phrase: '' }, mode: 'nouveau' as const, projectId: '', role: 'style', scope: 'global' };
    const c = { marque: true, titre: 'Rentrée', type: 'ads' };
    expect(raisonVersement({ ...e, creation: { ...c, saisie } })).toBeNull();
    expect(raisonVersement({ ...e, creation: { ...c, saisie: { objectifType: 'vente' } } })).toBe(RAISONS_INTENTION.objectif);
    expect(raisonVersement({ ...e, mode: 'existant', projectId: UUID, creation: { ...c, saisie: { objectifType: 'vente' } } })).toBeNull();
  });

  it('la phrase sous les champs · ce que le brief emporte et ce qui reste à préciser', () => {
    expect(phraseBriefCreation('Marque A1', intentionCreationVide())).toBe('Projet de la marque Marque A1 · son brief reste à préciser dans le projet.');
    expect(phraseBriefCreation('Marque A1', { ...intentionCreationVide(), intention: 'Tester' })).toBe('Projet de la marque Marque A1 · ton intention ouvre son brief, le reste se précise dans le projet.');
    expect(phraseBriefCreation('Marque A1', { ...intentionCreationVide(), angle: 'Avis' })).toBe('Projet de la marque Marque A1 · sans intention, l’objectif de son brief reste à préciser dans le projet.');
  });
});

describe('briefCreationVersement · un brief où ranger les références, rien d’inventé', () => {
  it('les treize champs canoniques, vides, de forme valide', () => {
    const b = briefCreationVersement();
    expect(Object.keys(b).sort()).toEqual([...CLES_BRIEF].sort());
    expect(validerFormeBrief(b)).toEqual([]);
    expect([b.objective, b.references]).toEqual(['', []]);
  });
});

describe('raisonVersement · ce qui manque avant de verser', () => {
  const sel = { versables: [{ id: 'img', nom: 'img.jpg' }], phrase: '1 image deviendra une référence du projet.' };
  const e = { occupe: false, selection: sel, mode: 'existant' as const, projectId: UUID, creation: { marque: true, titre: 'Rentrée', type: 'ads' }, role: 'style', scope: 'global' };
  it('tout est choisi · null, dans les deux modes', () => {
    expect(raisonVersement(e)).toBeNull();
    expect(raisonVersement({ ...e, mode: 'nouveau', projectId: '' })).toBeNull();
  });
  it('dans l’ordre · en cours, rien à verser, projet, puis rôle et portée', () => {
    expect(raisonVersement({ ...e, occupe: true })).toBe('Versement en cours…');
    expect(raisonVersement({ ...e, selection: { versables: [], phrase: 'Aucune image à verser · le fichier est écarté.' } })).toBe('Aucune image à verser · le fichier est écarté.');
    expect(raisonVersement({ ...e, projectId: '' })).toBe(RAISONS_VERSEMENT.projet);
    expect(raisonVersement({ ...e, role: '' })).toBe(RAISONS_VERSEMENT.role);
    expect(raisonVersement({ ...e, scope: '' })).toBe(RAISONS_VERSEMENT.portee);
  });
  it('nouveau projet · la marque, puis la règle de nom (le projet existant n’est pas demandé)', () => {
    const n = { ...e, mode: 'nouveau' as const, projectId: '' };
    expect(raisonVersement({ ...n, creation: { ...n.creation, marque: false } })).toBe(RAISON_MARQUE_CREATION);
    expect(raisonVersement({ ...n, creation: { ...n.creation, titre: ' ' } })).toBe('Donne un titre au projet.');
    expect(raisonVersement({ ...n, creation: { ...n.creation, type: '' } })).toBe('Choisis un type de projet.');
  });
});

describe('messageCreationVersement · le projet créé est toujours dit', () => {
  it('versement réussi', () => {
    expect(messageCreationVersement('Rentrée', { ok: true, ajoutes: 2, dejaPresents: 0, role: 'style' })).toBe('Projet « Rentrée » créé · 2 images versées dans « Rentrée » · rôle Style.');
  });
  it('versement refusé · le projet reste, la raison est dite, la suite aussi', () => {
    expect(messageCreationVersement('Rentrée', { ok: false, raison: '« face.jpg » est à la corbeille.' }))
      .toBe('Projet « Rentrée » créé, mais aucune image n’y a été versée · « face.jpg » est à la corbeille. Le projet reste · réessaie le versement ou ouvre-le.');
  });
});
