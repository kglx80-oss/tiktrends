import { describe, it, expect } from 'vitest';
import {
  annonceObservee, referenceSource, tombstoneSource, lireReferenceSource, lireReferencesSources, idSource, extraitAutorise, EXTRAIT_AUTORISE_MAX,
} from '../src/studios/sources/reference';
import { observerSource, affirmeNarration, controlerNarrationObservee, modalitesDisponibles } from '../src/studios/sources/modalites';
import {
  validerHypotheses, validerHypothese, changementIsole, hypotheseSaisie, saisieSuffisante, MAX_HYPOTHESES, metriquesDisponibles, type HypotheseTest,
} from '../src/studios/sources/hypotheses';
import { structureImportable, fuitesConcurrent } from '../src/studios/sources/import';
import { faitsProduit, referenceProduit } from '../src/studios/sources/produit';
import { reponseApplicable, scellerPropositions, propositionValidePour } from '../src/studios/sources/concurrence';

/**
 * L4-B · noyau des sources · RÉSULTATS : ce que la référence garde, ce qu'une
 * source permet d'affirmer, ce qui s'importe et ce qui ne passe pas.
 */

const T0 = new Date('2026-10-01T09:30:00Z');
const IMAGE_SEULE = {
  id: '9001', platform: 'meta', status: 'active', daysRunning: 64, mediaType: 'image',
  thumbnailUrl: 'https://cdn.exemple.test/v.jpg', mediaUrl: 'https://cdn.exemple.test/v.jpg',
  advertiserName: 'Lumière Botanique', body: 'Votre peau mérite mieux. Notre sérum à 12 % de vitamine C efface les taches en 14 jours, garanti.',
  callToAction: 'Acheter', landingDomain: 'lbcosmetiques.fr', landingUrl: 'https://lbcosmetiques.fr/serum',
};
const VIDEO_SANS_TRANSCRIPTION = { ...IMAGE_SEULE, id: '9002', mediaType: 'video' };
const portee = { workspaceId: 'ws_a', brandId: 'b_a1' };

function ref(brut: unknown, type: 'veille_ad' | 'saved_ad' = 'veille_ad') {
  const a = annonceObservee(brut);
  if (!a) throw new Error('annonce illisible');
  return referenceSource({ type, annonce: a, savedAdId: type === 'saved_ad' ? '11111111-1111-4111-8111-111111111111' : null, portee, observeLe: T0, format: null, retourVeille: 'q=serum&p=meta#ad-meta-9001' });
}

describe('référence de source · ce que le projet garde', () => {
  it('identité opaque et stable, droit, portée, date, empreinte · aucune URL de média', () => {
    const r = ref(IMAGE_SEULE);
    expect(r.sourceId).toMatch(/^src_[a-f0-9]{16}$/);
    expect(r.sourceId).toBe(idSource('veille_ad', 'meta:9001'));
    expect(r).toMatchObject({ cle: 'meta:9001', droit: 'observation_publique', portee, observeLe: '2026-10-01T09:30:00.000Z', statut: 'active', revoqueeLe: null, diffuseeDepuisJours: 64 });
    expect(r.empreinte).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(r), 'une URL de média est stockée comme identité ou cache').not.toMatch(/https?:\/\//);
  });

  it('même annonce observée à deux dates · même identité, même empreinte (elle porte sur l’observé)', () => {
    const a = annonceObservee(IMAGE_SEULE)!;
    const r2 = referenceSource({ type: 'veille_ad', annonce: a, savedAdId: null, portee, observeLe: new Date('2026-10-05T00:00:00Z'), format: null, retourVeille: null });
    expect(r2.sourceId).toBe(ref(IMAGE_SEULE).sourceId);
    expect(r2.empreinte).toBe(ref(IMAGE_SEULE).empreinte);
    expect(referenceSource({ type: 'veille_ad', annonce: { ...a, body: 'Autre texte.' }, savedAdId: null, portee, observeLe: T0, format: null, retourVeille: null }).empreinte).not.toBe(r2.empreinte);
  });

  it('l’extrait autorisé est borné', () => {
    const long = 'mot '.repeat(400);
    expect(extraitAutorise(long).length).toBeLessThanOrEqual(EXTRAIT_AUTORISE_MAX);
    expect(ref({ ...IMAGE_SEULE, body: long }).extraitAutorise.length).toBeLessThanOrEqual(EXTRAIT_AUTORISE_MAX);
  });

  it('un snapshot forgé est nettoyé · champs inconnus écartés, identifiant exigé', () => {
    expect(annonceObservee({ platform: 'meta' })).toBeNull();
    expect(annonceObservee({ id: '../../etc', platform: 'meta' })).toBeNull();
    const a = annonceObservee({ ...IMAGE_SEULE, secret: 'x', __proto__: { pollue: true } })!;
    expect(Object.keys(a)).not.toContain('secret');
  });

  it('tombstone · même identité et observations, statut daté, plus de lien de retour', () => {
    const r = ref(IMAGE_SEULE);
    const t = tombstoneSource(r, 'supprimee', new Date('2026-10-06T10:00:00Z'));
    expect(t).toMatchObject({ sourceId: r.sourceId, empreinte: r.empreinte, statut: 'supprimee', revoqueeLe: '2026-10-06T10:00:00.000Z', retourVeille: null });
    expect(t.observations).toEqual(r.observations);
    expect(t.extraitAutorise).toBe(r.extraitAutorise);
  });

  it('relecture du jsonb · une forme inattendue est écartée et comptée, jamais réparée', () => {
    const r = ref(IMAGE_SEULE);
    expect(lireReferenceSource(JSON.parse(JSON.stringify(r)))).toEqual(r);
    expect(lireReferencesSources([r, { schema: 2 }, 'x'])).toEqual({ sources: [r], illisibles: 2 });
  });
});

describe('FLOW-02 · absence de modalité · rien d’inventé', () => {
  it('image seule sans transcription · ressources image, texte, lien · narration et son ABSENTS', () => {
    const r = ref(IMAGE_SEULE);
    expect(r.modalites).toEqual(['image', 'texte', 'lien']);
    const absents = r.absents.map((a) => a.element);
    expect(absents).toEqual(expect.arrayContaining(['narration', 'son', 'rythme', 'demonstration']));
    expect(r.absents.find((a) => a.element === 'narration')!.raison).toBe('Aucune transcription ni piste audio · la narration n’est pas observable.');
    expect(r.observations.some((o) => o.element === 'narration'), 'une narration est affirmée sans transcription').toBe(false);
    expect(r.observations.every((o) => !affirmeNarration(o.claim.replace(/«[^»]*»/g, '')))).toBe(true);
  });

  it('vidéo sans transcription · la vidéo est là, la narration reste absente', () => {
    const r = ref(VIDEO_SANS_TRANSCRIPTION);
    expect(r.modalites).toEqual(['image', 'video', 'texte', 'lien']);
    expect(r.absents.map((a) => a.element)).toContain('narration');
    expect(r.absents.find((a) => a.element === 'rythme')!.raison).toMatch(/non analysée/);
  });

  it('avec une transcription · la narration devient observable', () => {
    const r = ref({ ...VIDEO_SANS_TRANSCRIPTION, transcript: 'Bonjour, je vous présente ma routine du matin.' });
    expect(r.modalites).toContain('transcription');
    expect(r.observations.find((o) => o.element === 'narration')).toMatchObject({ modalite: 'transcription', kind: 'observed' });
    expect(r.absents.map((a) => a.element)).not.toContain('narration');
  });

  it('la durée de diffusion est une MESURE qui ne prouve pas la rentabilité', () => {
    const d = ref(IMAGE_SEULE).observations.find((o) => o.element === 'diffusion')!;
    expect(d.kind).toBe('measured');
    expect(d.claim).toMatch(/ne prouve pas la rentabilité/);
  });

  it('garde · une observation de narration sans transcription est refusée, la même avec transcription passe', () => {
    const sans = ref(IMAGE_SEULE);
    const avec = ref({ ...VIDEO_SANS_TRANSCRIPTION, id: '9003', transcript: 'Écoutez ma voix.' });
    const affirmation = (sourceId: string) => [{ chemin: '/facts/0/claim', claim: 'La voix off annonce le prix en fin de vidéo.', kind: 'observed', sourceIds: [sourceId] }];
    expect(controlerNarrationObservee(affirmation(sans.sourceId), [sans])).toEqual([{ chemin: '/facts/0/claim', raison: 'narration affirmée sans transcription ni audio dans la source' }]);
    expect(controlerNarrationObservee(affirmation(avec.sourceId), [avec])).toEqual([]);
    // Une hypothèse (« ajouter une voix off ») ne décrit pas la source · libre.
    expect(controlerNarrationObservee([{ ...affirmation(sans.sourceId)[0]!, kind: 'hypothesis' }], [sans])).toEqual([]);
    // Une citation du texte écrit n'est pas une narration.
    expect(controlerNarrationObservee([{ chemin: '/x', claim: 'Accroche écrite : « La voix de la nature »', kind: 'observed', sourceIds: [sans.sourceId] }], [sans])).toEqual([]);
  });

  it('modalités · une annonce sans rien ne prétend rien', () => {
    expect(modalitesDisponibles({ aImage: false, aVideo: false, body: '', callToAction: '', landingDomain: '', aLien: false, daysRunning: null, transcription: '', aAudio: false })).toEqual([]);
    const o = observerSource('src_x', { aImage: false, aVideo: false, body: '', callToAction: '', landingDomain: '', aLien: false, daysRunning: null, transcription: '', aAudio: false }, null);
    expect(o.observations).toEqual([]);
    expect(o.absents.map((a) => a.element)).toEqual(expect.arrayContaining(['accroche', 'texte', 'cta', 'structure', 'narration']));
  });
});

const H = (i: number, surcharge: Partial<HypotheseTest> = {}): HypotheseTest => ({
  id: `hyp_${i}`, statement: `Une accroche chiffrée augmente le taux de clic (${i}).`, sourceIds: ['src_a'], variable: 'Accroche',
  control: 'Accroche bénéfice', treatment: 'Accroche chiffrée', invariants: ['Même visuel'], metric: 'Taux de clic (CTR)', decisionRule: 'Garder si +15 % de CTR sur 7 jours', limitations: [], ...surcharge,
});

describe('hypothèses · au plus trois, changement isolé', () => {
  it('trois passent, quatre sont refusées', () => {
    expect(validerHypotheses([H(1), H(2), H(3)], ['src_a']).ok).toBe(true);
    const r = validerHypotheses([H(1), H(2), H(3), H(4)], ['src_a']);
    expect(r).toEqual({ ok: false, violations: [{ chemin: '/hypotheses', raison: `${MAX_HYPOTHESES} hypothèses au plus` }] });
  });

  it('une variable combinée est marquée exploratoire, pas refusée', () => {
    const r = validerHypotheses([H(1), H(2, { variable: 'Accroche et visuel' })], ['src_a']);
    expect(r.ok && r.hypotheses.map((h) => h.isolee)).toEqual([true, false]);
    expect(changementIsole('Couleur du fond')).toBe(true);
    expect(changementIsole('Accroche + prix')).toBe(false);
  });

  it('cohérence · témoin ≠ traitement, sources de la sélection, identifiants uniques', () => {
    expect(validerHypothese(H(1, { treatment: 'Accroche bénéfice' }), ['src_a'])).toContainEqual({ chemin: '/hypothese/treatment', raison: 'le traitement doit différer du témoin' });
    expect(validerHypothese(H(1, { sourceIds: ['src_autre'] }), ['src_a'])).toContainEqual({ chemin: '/hypothese/sourceIds/0', raison: 'source hors de la sélection' });
    const r = validerHypotheses([H(1), H(1)], ['src_a']);
    expect(!r.ok && r.violations).toContainEqual({ chemin: '/hypotheses/1/id', raison: 'identifiant en double' });
  });

  it('saisie manuelle · même forme, champs vides laissés vides, sources = sélection', () => {
    const h = hypotheseSaisie({ statement: '  Le prix barré rassure  ', variable: 'Prix affiché' }, ['src_a']);
    expect(h).toMatchObject({ id: 'hyp_saisie', statement: 'Le prix barré rassure', variable: 'Prix affiché', control: '', metric: '', sourceIds: ['src_a'] });
    expect(validerHypothese(h, ['src_a'])).toEqual([]);
    expect(saisieSuffisante(h)).toBe(true);
    expect(saisieSuffisante(hypotheseSaisie({ statement: 'x', variable: '' }, []))).toBe(false);
  });

  it('métriques · l’accroche vidéo seulement pour une vidéo', () => {
    expect(metriquesDisponibles(false)).not.toContain('Taux d’accroche vidéo (3 secondes)');
    expect(metriquesDisponibles(true)).toContain('Taux d’accroche vidéo (3 secondes)');
  });
});

describe('import · la structure passe, l’annonceur ne passe pas', () => {
  it('composition et formats ne contiennent ni le nom, ni le domaine, ni le texte du concurrent', () => {
    const s = structureImportable([ref(IMAGE_SEULE)]);
    expect(s.composition).toBe('Structure observée à adapter : visuel fixe · accroche écrite en ouverture · appel à l’action explicite.');
    expect(s.formats).toEqual(['Visuel fixe']);
    const tout = JSON.stringify({ c: s.composition, f: s.formats, k: s.contraintes });
    for (const interdit of ['Lumière', 'lbcosmetiques', '12 %', 'sérum', 'taches']) expect(tout, `fuite « ${interdit} »`).not.toContain(interdit);
    expect(s.exclusions).toContain('Nom, logo et identité visuelle de Lumière Botanique.');
    expect(s.exclusions).toContain('Allégations, chiffres et promesses de Lumière Botanique.');
  });

  it('garde · nom, domaine ou six mots recopiés sont signalés', () => {
    const r = ref(IMAGE_SEULE);
    expect(fuitesConcurrent([{ chemin: '/a', texte: 'Faire mieux que lumiere botanique' }], [r])).toEqual([{ chemin: '/a', raison: 'reprend le nom de l’annonceur source' }]);
    expect(fuitesConcurrent([{ chemin: '/b', texte: 'Voir lbcosmetiques.fr' }], [r])).toEqual([{ chemin: '/b', raison: 'reprend le domaine de l’annonceur source' }]);
    expect(fuitesConcurrent([{ chemin: '/c', texte: 'Notre sérum à 12 % de vitamine C efface' }], [r])).toEqual([{ chemin: '/c', raison: 'recopie le texte de la source' }]);
    expect(fuitesConcurrent([{ chemin: '/d', texte: 'Accroche chiffrée sur le bénéfice de notre crème' }], [r])).toEqual([]);
  });
});

describe('produit · faits connus et manques', () => {
  it('ce qui est connu est montré, ce qui manque est nommé · rien d’inventé', () => {
    const p = { id: 'p1', name: 'Crème Douce', description: null, usp: 'Hydrate 24 h', price: 29, url: null, imageUrl: null, imageUrls: [] };
    const { faits, manques } = faitsProduit(p);
    expect(faits.map((f) => [f.cle, f.valeur])).toEqual([['nom', 'Crème Douce'], ['promesse', 'Hydrate 24 h'], ['prix', '29,00 €']]);
    expect(manques.map((m) => m.cle)).toEqual(['description', 'page', 'photo']);
    const r = referenceProduit({ ...p, imageUrl: 'data:image/png;base64,AAAA' }, T0);
    expect(r).toMatchObject({ productId: 'p1', assetId: null, photoDisponible: true, instantaneLe: T0.toISOString() });
    expect(JSON.stringify(r), 'la photo (data URI) entre dans la version').not.toContain('base64');
  });
});

describe('FLOW-03 · une réponse tardive ne change pas de marque', () => {
  it('client · seule la dernière demande, pour la marque courante, s’applique', () => {
    const courant = { seq: 2, brandId: 'b_a2' };
    expect(reponseApplicable({ seq: 1, brandId: 'b_a1' }, courant, 'b_a1'), 'ancienne réponse (marque A1) appliquée à A2').toBe(false);
    expect(reponseApplicable({ seq: 2, brandId: 'b_a2' }, courant, 'b_a1'), 'réponse serveur pour une autre marque').toBe(false);
    expect(reponseApplicable({ seq: 2, brandId: 'b_a2' }, courant, 'b_a2')).toBe(true);
  });

  it('serveur · une proposition scellée pour A1 ne vaut ni pour A2, ni modifiée, ni pour une autre sélection', () => {
    const s = scellerPropositions({ workspaceId: 'ws_a', brandId: 'b_a1', sourceIds: ['src_a'], hypotheses: [H(1), H(2)], runId: 'r1', maintenant: 1000 });
    const cible = { workspaceId: 'ws_a', brandId: 'b_a1', sourceIds: ['src_a'], hypothese: H(2), maintenant: 2000 };
    expect(propositionValidePour(s, cible)).toBeNull();
    expect(propositionValidePour(s, { ...cible, brandId: 'b_a2' })).toBe('autre_marque');
    expect(propositionValidePour(s, { ...cible, workspaceId: 'ws_b' })).toBe('autre_espace');
    expect(propositionValidePour(s, { ...cible, sourceIds: ['src_a', 'src_b'] })).toBe('autres_sources');
    expect(propositionValidePour(s, { ...cible, hypothese: H(2, { variable: 'Visuel' }) })).toBe('hypothese_modifiee');
    expect(propositionValidePour(s, { ...cible, maintenant: s.expireLe + 1 })).toBe('expiree');
  });
});

describe('coût annoncé avant le clic', () => {
  it('plafond d’une demande de propositions · pire cas du résolveur au tarif du modèle', async () => {
    const { plafondPropositionUsd } = await import('../src/studios/sources/hypotheses');
    const { rateFor } = await import('../src/spend-guard');
    // 24 000 × 3 $/M + 4 000 × 15 $/M = 0,072 + 0,060 = 0,132 $ → 0,14 $ arrondi au centime supérieur.
    expect(plafondPropositionUsd(rateFor('claude-sonnet-5'))).toBe(0.14);
    expect(plafondPropositionUsd(rateFor('modele-inconnu')), 'un modèle inconnu est compté au plus cher').toBe(0.66);
  });
});
