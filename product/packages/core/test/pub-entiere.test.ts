import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { requeteFalImage, parametresImageDuDevis, promptFal, corpsFalImage, lireParametresImage } from '../src/studios/fournisseurs';
import { construireConsignePersistee, parametresDepuisConsigne, empreinteConsigne, lireConsignePersistee } from '../src/studios/image/parcours';
import {
  lignesDuDevis, avecControleVision, PRICING_VERSION, libelleCaseControleVision, borneControleVisionParImageMicros, OPERATION_CONTROLE_VISION,
} from '../src/studios/execution/tarifs';
import { entreeCompilation } from '../src/studios/produit/compilation';
import {
  pubEntiereDuBrief, copieDuBrief, tarifPubEntiere, lignesAuTarifPubEntiere, promptFalPubEntiere, interditLeTexte, sansInterditDeTexte,
  contradictionsProduit, assertionsDe, relecturePubEntiere, ecartMots, chainesDeLaCopie, faitsDuProduit, lirePubEntiere, moteurEnvoye,
  RESERVE_WORKER_IMAGE_MICROS, SCHEMA_PUB_ENTIERE, TYPOGRAPHIE_PAR_DEFAUT, libelleCaseRelecturePubEntiere, controleCocheParDefaut,
  type PubEntiere, type CopieDessinee, type ConstatPubEntiere,
} from '../src/studios/image/pub-entiere';
import { IMAGE_MODELS, moteurRecommande } from '../src/economics';
import { creditsV2Image } from '../src/offre/bareme';
import { FIXED_COSTS } from '../src/spend-guard';

/**
 * Studios · mode « Pub entière » · le choix fait à la compilation va jusqu'au
 * corps fal EXACT ; le devis annonce le prix catalogue du moteur et du
 * paramètre envoyés ; la relecture refuse avec la raison ; le mode calques est
 * STRICTEMENT inchangé (égalité avec une capture prise sur main 62a341e3,
 * avant modification, `fixtures/pub-entiere-calques-main.json`).
 */

const SHA_P = createHash('sha256').update('photo').digest('hex');
const SHA_S = createHash('sha256').update('style').digest('hex');
const SHA_L = createHash('sha256').update('logo').digest('hex');
const consigne = {
  generationInstruction: 'Lunettes posées sur une table en chêne, lumière du matin.',
  negativeConstraints: ['ni le logo de l’annonceur source', 'Pas de texte dans l’image'],
  referenceBindings: [{ referenceId: 'sta_style', role: 'style', scope: 'background' }, { referenceId: 'pph_a', role: 'product', scope: 'product' }],
  protectedComponents: ['bandeau'],
  needsDeterministicOverlay: true,
};
const refs = [{ assetId: 'pph_a', assetVersion: 'sha256-x', sha256: SHA_P, role: 'product' }, { assetId: 'sta_style', assetVersion: 'sha256-y', sha256: SHA_S, role: 'style' }];
const medias = [
  { assetId: 'pph_a', etat: 'autorise' as const, url: 'https://cdn.marque.test/p.png', sha256: SHA_P },
  { assetId: 'sta_style', etat: 'autorise' as const, url: 'https://s3.test/b/style.png', sha256: SHA_S },
];
const ops = [{ operation: 'keyframe:s_image', profil: 'image_generation' as const }];
const modeles = { generation: 'fal-ai/nano-banana-2', edition: 'fal-ai/nano-banana-2/edit' };
const brief = { objective: 'Vendre', audience: 'Coureurs', hypothesisId: null, testedVariable: '', facts: [{ id: 'f1', claim: 'Goût mangue', sourceIds: ['produit'], kind: 'declared', confidence: 'high' }], invariants: [], variables: [], references: [{ assetId: 'pph_a', assetVersion: 'sha256-x', sha256: SHA_P, role: 'product', scope: 'product', allowedChanges: [], requiredComponents: [] }, { assetId: 'sta_style', assetVersion: 'sha256-y', sha256: SHA_S, role: 'style', scope: 'background', allowedChanges: [], requiredComponents: [] }], composition: 'Centré', styleIntent: 'Doux', texts: ['Hook (fr) · Un goût mangue', 'CTA (fr) · Je goûte'], formats: ['4:5'], exclusions: [] };

/** EXACTEMENT le calcul de la capture prise sur main (`scratchpad/pub-entiere/zz-capture-calques.test.ts`). */
function capturer() {
  const p = parametresImageDuDevis({ consigne, references: refs, largeur: 1080, hauteur: 1350, promptRunId: null });
  const r = requeteFalImage({ operations: ops, parametres: p, medias, modeles });
  const sansRef = requeteFalImage({ operations: ops, parametres: parametresImageDuDevis({ consigne: { ...consigne, referenceBindings: [] }, references: [], largeur: 1080, hauteur: 1920, promptRunId: null }), medias: [], modeles });
  const familles = ['fal-ai/nano-banana-2/edit', 'fal-ai/gpt-image-1/edit-image/byok', 'openai/gpt-image-2/edit', 'fal-ai/flux-pro/kontext'].map((m) => corpsFalImage({ modele: m, prompt: 'x', ratio: '4:5', references: ['https://a.test/p.png'], images: 1 }));
  const c = construireConsignePersistee({ runId: '11111111-1111-4111-8111-111111111111', mode: 'generative_scene', sourceVersionId: '22222222-2222-4222-8222-222222222222', contenu: { brief: brief as never, productRef: null }, consigne, referencesTransmises: brief.references as never, largeur: 1080, hauteur: 1350, compileeLe: new Date('2026-11-15T10:00:00Z') });
  if (!c.ok) throw new Error(JSON.stringify(c));
  const plan = { aRefaire: [{ id: 'keyframe:s_image', nature: 'generation' as const }] };
  const l = lignesDuDevis(plan as never);
  if (!l.ok) throw new Error('l');
  const v = avecControleVision(l.lignes, { modele: 'claude-sonnet-5' });
  const ec = entreeCompilation({ prep: { ok: true, violations: [], references: brief.references as never, referenceIds: ['pph_a'], interditsTransfert: [], composantsProteges: ['bandeau'], invariants: ['x'], avertissements: [] }, brief: brief as never, versionId: 'v1', mode: 'generative_scene', largeur: 1080, hauteur: 1350 });
  return { requete: r, sansRef, prompt: promptFal(consigne), familles, consigne: c.consigne, empreinte: empreinteConsigne(c.consigne), parametres: parametresDepuisConsigne(c.consigne), lu: lireConsignePersistee(c.consigne) !== null, lignes: l, vision: v, PRICING_VERSION, libelle: libelleCaseControleVision(borneControleVisionParImageMicros('claude-sonnet-5')), entreeCompilation: ec };
}

describe('mode calques · strictement inchangé (capture prise sur main avant modification)', () => {
  it('corps fal, consigne, empreinte, paramètres du job, devis, ligne de contrôle, entrée de compilation · égaux à la capture', () => {
    const avant = JSON.parse(readFileSync(join(__dirname, 'fixtures', 'pub-entiere-calques-main.json'), 'utf8'));
    expect(JSON.parse(JSON.stringify(capturer())), 'le mode calques a changé · il doit rester celui de main').toEqual(avant);
  });

  it('le défaut est « calques » · la consigne garde « Aucun texte écrit dans l’image » et aucun paramètre de qualité n’est ajouté', () => {
    expect(TYPOGRAPHIE_PAR_DEFAUT).toBe('calques');
    const r = requeteFalImage({ operations: ops, parametres: parametresImageDuDevis({ consigne, references: refs, largeur: 1080, hauteur: 1350 }), medias, modeles });
    if (!r.ok) throw new Error(r.motif);
    expect(r.corps.prompt).toContain('Aucun texte écrit dans l’image');
    expect(Object.keys(r.corps).sort()).toEqual(['aspect_ratio', 'image_urls', 'num_images', 'prompt']);
  });
});

/* ───────────────────────────── Pub entière ───────────────────────────────── */

const COPIE: CopieDessinee = { headline: 'Tes lunettes tiennent enfin', subhead: 'Même en plein sprint, rien ne glisse.', benefits: ['Anti-buée'], cta: 'Je les essaie' };
const pub = (moteur = moteurRecommande('entiere')): PubEntiere => ({ schema: SCHEMA_PUB_ENTIERE, copie: COPIE, langue: 'fr', moteur });
const parametresEntiere = (moteur?: string, extra: { logo?: boolean } = {}) => parametresImageDuDevis({
  consigne: extra.logo ? { ...consigne, referenceBindings: [...consigne.referenceBindings, { referenceId: 'logo_m', role: 'logo', scope: 'global' }] } : consigne,
  references: extra.logo ? [...refs, { assetId: 'logo_m', assetVersion: 'sha256-l', sha256: SHA_L, role: 'logo' }] : refs,
  largeur: 1080, hauteur: 1350, promptRunId: null, pubEntiere: pub(moteur),
});
const mediasLogo = [...medias, { assetId: 'logo_m', etat: 'autorise' as const, url: 'https://cdn.marque.test/logo.png', sha256: SHA_L }];

/** La consigne complète envoyée en pub entière · écrite ici en entier, pour la lire. */
const PROMPT_ENTIERE = [
  'Produce a COMPLETE, ready-to-publish 4:5 social media advertisement · not a bare photograph.',
  'The provided image is the EXACT product. Reproduce it strictly identically: same packaging shape, same cap, same label artwork, same label text and its typography, same badges and logos, same colours, same real-world proportions. Do not redraw, restyle, translate or paraphrase anything printed on the packaging. The label must stay as sharp and legible as in the reference.',
  'Scene: Lunettes posées sur une table en chêne, lumière du matin.',
  'Render the advertising typography DIRECTLY INSIDE the image, integrated into the design.',
  'The copy below is FINAL · reproduce each string exactly, character for character, in FRENCH with all accents and apostrophes. Do not translate, rewrite, shorten or invent any wording.',
  '- HEADLINE, large and dominant: Tes lunettes tiennent enfin\n- supporting line: Même en plein sprint, rien ne glisse.\n- bullet 1, with a small check mark: Anti-buée\n- call-to-action button: Je les essaie',
  'Typographic hierarchy: the headline dominates the frame, the rest supports it. Clean modern performance-marketing art direction, high contrast, generous margins, crisp legible type at every size.',
  'Do NOT add any text that is not listed above.',
  'Composants à préserver à l’identique : bandeau.',
  'À éviter absolument : ni le logo de l’annonceur source.',
].join('\n\n');

describe('pub entière · le mode choisi va jusqu’au corps fal EXACT', () => {
  it('moteur du mode (moteurRecommande · GPT Image 2), son paramètre de qualité, textes mot pour mot, aucune consigne « pas de texte »', () => {
    expect(moteurRecommande('entiere')).toBe('gpt2');
    const r = requeteFalImage({ operations: ops, parametres: parametresEntiere(), medias, modeles });
    if (!r.ok) throw new Error(r.motif);
    expect(r.modele).toBe('openai/gpt-image-2/edit');
    expect(r.corps).toEqual({
      prompt: PROMPT_ENTIERE, num_images: 1, image_size: 'portrait_4_3',
      image_urls: ['https://cdn.marque.test/p.png', 'https://s3.test/b/style.png'], quality: 'medium',
    });
    for (const t of [COPIE.headline, COPIE.subhead!, ...COPIE.benefits, COPIE.cta!]) expect(r.corps.prompt).toContain(t);
    expect(r.corps.prompt).not.toContain('Aucun texte écrit dans l’image');
    expect(r.corps.prompt).not.toContain('Pas de texte dans l’image');
    expect(interditLeTexte(String(r.corps.prompt)), 'une consigne « pas de texte » est partie en pub entière').toBe(false);
    expect(r.limites).toContain('pub entière · consigne « pas de texte » retirée : Pas de texte dans l’image');
    expect(r.expurge).toMatchObject({ modele: 'openai/gpt-image-2/edit', quality: 'medium', image_urls: [{ assetId: 'pph_a', sha256: SHA_P }, { assetId: 'sta_style', sha256: SHA_S }] });
  });

  it('sans référence · l’adresse sans référence du catalogue ; format 9:16 servi et dit dans la consigne', () => {
    const p = parametresImageDuDevis({ consigne: { ...consigne, referenceBindings: [] }, references: [], largeur: 1080, hauteur: 1920, pubEntiere: pub() });
    const r = requeteFalImage({ operations: ops, parametres: p, medias: [], modeles });
    if (!r.ok) throw new Error(r.motif);
    expect([r.modele, r.corps.image_size, r.corps.quality, 'image_urls' in r.corps]).toEqual(['openai/gpt-image-2', 'portrait_16_9', 'medium', false]);
    expect(String(r.corps.prompt)).toMatch(/^Produce a COMPLETE, ready-to-publish 9:16 social media advertisement/);
    expect(String(r.corps.prompt)).toContain('No product photo is provided');
  });

  it('le paramètre n’est envoyé QUE si le catalogue le porte · Nano Haute ⇒ resolution 2K, Nano ⇒ rien', () => {
    const haute = requeteFalImage({ operations: ops, parametres: parametresEntiere('nano_high'), medias, modeles });
    const nano = requeteFalImage({ operations: ops, parametres: parametresEntiere('nano'), medias, modeles });
    if (!haute.ok || !nano.ok) throw new Error('requête');
    expect([haute.modele, haute.corps.resolution, haute.corps.aspect_ratio]).toEqual(['fal-ai/nano-banana-2/edit', '2K', '4:5']);
    expect(Object.keys(nano.corps).sort()).toEqual(['aspect_ratio', 'image_urls', 'num_images', 'prompt']);
    expect(moteurEnvoye('gpt2_high', true)).toEqual({ modele: 'openai/gpt-image-2/edit', params: { quality: 'high' } });
  });

  it('un logo lié est transmis et nommé dans la consigne', () => {
    const r = requeteFalImage({ operations: ops, parametres: parametresEntiere(undefined, { logo: true }), medias: mediasLogo, modeles });
    if (!r.ok) throw new Error(r.motif);
    expect(r.corps.image_urls).toEqual(['https://cdn.marque.test/p.png', 'https://s3.test/b/style.png', 'https://cdn.marque.test/logo.png']);
    expect(String(r.corps.prompt)).toContain('The brand logo is provided among the reference images');
  });

  it('instantané mal formé ⇒ refus AVANT tout appel (moteur hors catalogue, champ inventé)', () => {
    const p = parametresEntiere() as unknown as Record<string, unknown>;
    const faux = { ...p, pubEntiere: { ...(p.pubEntiere as object), moteur: 'modele-maison' } };
    expect(lireParametresImage(faux)).toMatchObject({ ok: false, violations: ['/parametres/pubEntiere/moteur : moteur absent du catalogue'] });
    const ajout = { ...p, pubEntiere: { ...(p.pubEntiere as object), quality: 'high' } };
    expect(requeteFalImage({ operations: ops, parametres: ajout, medias, modeles })).toMatchObject({ ok: false, code: 'INVALID_SCHEMA' });
  });

  it('la consigne persistée porte la pub entière, relue telle quelle ; son empreinte n’est pas celle du calque', () => {
    const base = { runId: '11111111-1111-4111-8111-111111111111', mode: 'generative_scene' as const, sourceVersionId: '22222222-2222-4222-8222-222222222222', contenu: { brief: brief as never, productRef: null }, consigne, referencesTransmises: brief.references as never, largeur: 1080, hauteur: 1350, compileeLe: new Date('2026-11-15T10:00:00Z') };
    const e = construireConsignePersistee({ ...base, pubEntiere: pub() });
    const c = construireConsignePersistee(base);
    if (!e.ok || !c.ok) throw new Error('construction');
    expect(lireConsignePersistee(JSON.parse(JSON.stringify(e.consigne)))).toEqual(e.consigne);
    expect(parametresDepuisConsigne(e.consigne).pubEntiere).toEqual(pub());
    expect('pubEntiere' in parametresDepuisConsigne(c.consigne)).toBe(false);
    expect(e.empreinte).not.toBe(c.empreinte);
  });

  it('compilation · le concept dit que le générateur dessine les textes (calques inchangé)', () => {
    const prep = { ok: true, violations: [], references: brief.references as never, referenceIds: ['pph_a'], interditsTransfert: [], composantsProteges: ['bandeau'], invariants: ['x'], avertissements: [] };
    const ec = entreeCompilation({ prep, brief: brief as never, versionId: 'v1', mode: 'generative_scene', largeur: 1080, hauteur: 1350, typographie: 'entiere' });
    const concept = (ec.resolvedDocuments[1]!.content as { claim: string }).claim;
    expect(concept).toContain('Textes : dessinés dans l’image par le générateur, mot pour mot');
    expect(concept).not.toContain('jamais dans les pixels');
  });
});

describe('pub entière · la copie vient des textes du projet', () => {
  it('Hook ⇒ accroche, Corps ⇒ sous-titre, CTA ⇒ bouton, le reste en puces ; scripts et autres langues écartés avec leur raison', () => {
    const b = { ...brief, texts: ['Script (fr) · Plan 1 · il court', 'Hook (fr) · Tes lunettes tiennent enfin', 'Hook (en) · Finally', 'Corps (fr) · Même en plein sprint.', 'CTA (fr) · Je les essaie', 'CTA (fr) · Voir', 'Anti-buée'] };
    const c = copieDuBrief(b as never);
    expect(c).toEqual({
      ok: true,
      copie: { headline: 'Tes lunettes tiennent enfin', subhead: 'Même en plein sprint.', benefits: ['Anti-buée'], cta: 'Je les essaie' },
      ecartes: [
        { texte: 'Plan 1 · il court', raison: 'script vidéo · jamais dessiné dans une image' },
        { texte: 'Finally', raison: 'langue « en » · la pub entière est écrite en français' },
        { texte: 'Voir', raison: 'un seul bouton par pub' },
      ],
    });
    expect(pubEntiereDuBrief(b as never)).toMatchObject({ ok: true, pub: { moteur: 'gpt2', langue: 'fr' } });
    expect(copieDuBrief({ ...brief, texts: ['CTA (fr) · Voir'] } as never)).toEqual({ ok: false, raison: 'La pub entière dessine les textes de la carte · ajoute au moins une accroche (Hook) au projet.' });
    expect(lirePubEntiere(pub())).toEqual(pub());
  });
});

describe('pub entière · le devis annonce le prix CATALOGUE du moteur et du paramètre envoyés', () => {
  it('GPT Image 2 (quality medium) · crédits et dollars du catalogue, sous la réserve inchangée du worker', () => {
    const spec = IMAGE_MODELS.find((m) => m.key === 'gpt2')!;
    const t = tarifPubEntiere(moteurRecommande('entiere'));
    expect(t).toMatchObject({ ok: true, credits: creditsV2Image('gpt2'), usdMicros: Math.round(spec.realEur * 1e6), moteur: 'gpt2', params: { quality: 'medium' } });
    expect(t.ok && [t.credits, t.usdMicros]).toEqual([50, 49_000]);
    expect(RESERVE_WORKER_IMAGE_MICROS).toBe(Math.round(FIXED_COSTS.fal_image * 1e6));
    const l = lignesDuDevis({ aRefaire: [{ id: 'keyframe:s_image', nature: 'generation' }] } as never);
    if (!l.ok || !t.ok) throw new Error('devis');
    const lignes = lignesAuTarifPubEntiere(l.lignes, 'keyframe:s_image', t);
    expect(lignes.map((x) => [x.operation, x.credits, x.usdMicros, x.natureCout])).toEqual([['keyframe:s_image', 50, 49_000, 'estimation']]);
    expect(lignes[0]!.motifEstimation).toContain('prix catalogue de GPT Image 2 (quality medium)');
  });

  it('le contrôle est coché d’office en pub entière, même en V2 ; ailleurs, la règle d’avant (V2 ⇒ décoché)', () => {
    expect([['actuel', false], ['actuel', true], ['v2', false], ['v2', true]].map(([regime, pubEntiere]) => controleCocheParDefaut({ regime: regime as string, pubEntiere: pubEntiere as boolean })))
      .toEqual([true, true, false, true]);
  });

  it('un moteur plus cher que la réserve du worker est refusé (GPT Image 2 · Haute, 0,195 $ > 0,08 $)', () => {
    expect(tarifPubEntiere('gpt2_high')).toMatchObject({ ok: false, motif: expect.stringContaining('plus que la réserve de 0,08 $') });
    expect(tarifPubEntiere('inconnu')).toMatchObject({ ok: false });
  });

  it('contrôle visuel · la même ligne ajoute la borne de la relecture par image ; sans supplément, ligne d’avant', () => {
    const l = lignesDuDevis({ aRefaire: [{ id: 'keyframe:s_image', nature: 'generation' }] } as never);
    if (!l.ok) throw new Error('devis');
    const qv = borneControleVisionParImageMicros('claude-sonnet-5');
    const avec = avecControleVision(l.lignes, { modele: 'claude-sonnet-5', supplementParImageMicros: 19_304 });
    expect(avec.lignes.find((x) => x.operation === OPERATION_CONTROLE_VISION)!.usdMicros).toBe(qv + 19_304);
    expect(avecControleVision(l.lignes, { modele: 'claude-sonnet-5' }).lignes.find((x) => x.operation === OPERATION_CONTROLE_VISION)!.usdMicros).toBe(qv);
    expect(libelleCaseRelecturePubEntiere(170)).toBe('Contrôle visuel et relecture de la pub entière (mots, packaging, lisibilité) · 170 crédits au plus par image, ajoutés au devis · coché par défaut, décocher pour s’en passer');
  });
});

describe('consigne « pas de texte » · retirée en pub entière, l’interdit de transfert reste', () => {
  it.each([
    ['Pas de texte dans l’image', true], ['Aucun texte.', true], ['sans typographie', true], ['No text on the image', true], ['text-free background', true],
    ['Aucun texte écrit dans l’image : les textes sont posés ensuite par des calques.', true],
    ['ni son sujet, ni son personnage, ni son produit, ni son logo, ni son texte, ni le nom de « X »', false], ['Lumière du matin, texture du chêne', false],
  ] as const)('%s ⇒ %s', (t, attendu) => {
    expect(interditLeTexte(t)).toBe(attendu);
  });

  it('phrase de la scène qui interdit le texte retirée, le reste gardé', () => {
    expect(sansInterditDeTexte({ generationInstruction: 'Table en chêne. Aucun texte dans l’image. Lumière douce.', negativeConstraints: ['ni son texte'] }))
      .toEqual({ instruction: 'Table en chêne. Lumière douce.', negatives: ['ni son texte'], retires: ['Aucun texte dans l’image.'] });
  });
});

/* ─────────────────────── Cohérence accroche ↔ produit ────────────────────── */

describe('cohérence de l’accroche avec les faits du produit', () => {
  it('« Un goût fruits rouges » sur une étiquette « Goût mangue » ⇒ contradiction nommée (cas relevé chez la concurrence)', () => {
    const c = contradictionsProduit([{ role: 'accroche', texte: 'Un goût fruits rouges qui fait du bien, vraiment.' }], ['naali', 'Goût mangue', '60 gommes']);
    expect(c).toEqual([{ role: 'accroche', texte: 'Un goût fruits rouges qui fait du bien, vraiment.', nature: 'gout', annonce: 'fruit rouge', produit: ['mangue'] }]);
  });

  it.each([
    ['Un goût mangue qui fait du bien', ['Goût mangue'], 0],
    ['Le goût du bonheur', ['Goût mangue'], 0],
    ['Un goût unique', ['Goût mangue'], 0],
    ['Goût fraise intense', ['Saveur fruits rouges'], 0],
    ['Goût fruits exotiques', ['Goût mangue'], 0],
    ['Goût fruits rouges', ['Goût fruits exotiques'], 1],
    ['60 gommes pour un mois', ['Boîte de 30 gommes'], 1],
    ['60 gommes pour un mois', ['60 gommes'], 0],
    ['Un goût vanille', ['Description sans goût annoncé'], 0],
  ] as const)('« %s » face à %j ⇒ %i contradiction(s)', (texte, faits, n) => {
    expect(contradictionsProduit([{ role: 'accroche', texte }], faits)).toHaveLength(n);
  });

  it('les assertions lues · goût (plusieurs valeurs) et quantité', () => {
    expect(assertionsDe('Goût mangue et passion · 60 gommes · 2,5 ml').map((a) => [a.nature, a.valeur])).toEqual([['gout', 'mangue'], ['gout', 'passion'], ['quantite', '60 gomme'], ['quantite', '2.5 ml']]);
  });

  it('seuls les faits du produit comptent · un fait relevé sur une annonce concurrente est ignoré', () => {
    const b = { ...brief, facts: [{ id: 'f1', claim: 'Goût mangue', sourceIds: ['produit:p1'], kind: 'declared', confidence: 'high' }, { id: 'f2', claim: 'Goût cerise', sourceIds: ['veille:a1'], kind: 'observed', confidence: 'high' }] };
    expect(faitsDuProduit({ produit: null, brief: b as never })).toEqual(['Goût mangue']);
  });
});

/* ───────────────────────────── La relecture ──────────────────────────────── */

const constat = (texteLu: string[], o: Partial<ConstatPubEntiere> = {}): ConstatPubEntiere => ({ texteLu, produitFidele: true, ecartsProduit: [], texteLisible: true, problemesLisibilite: [], ...o });
const LUS_OK = ['Tes lunettes tiennent enfin', 'Même en plein sprint, rien ne glisse.', 'Anti-buée', 'Je les essaie', 'VISIO · bandeau sport'];

describe('relecture d’une pub entière · perception de la vision, jugement en code', () => {
  it('tout est exact, packaging fidèle, lisible ⇒ conforme, aucune raison', () => {
    expect(relecturePubEntiere({ copie: COPIE, constat: constat(LUS_OK), faits: [] })).toMatchObject({ statut: 'conforme', raisons: [], nonVerifie: [] });
  });

  it('mot manquant ⇒ à reprendre, le mot est nommé', () => {
    const v = relecturePubEntiere({ copie: COPIE, constat: constat(['Tes lunettes tiennent', ...LUS_OK.slice(1)]), faits: [] });
    expect(v.statut).toBe('a_reprendre');
    expect(v.raisons).toEqual(['accroche réécrit · lu « Tes lunettes tiennent » (mot manquant « enfin »)']);
  });

  it('mot en trop ⇒ à reprendre, le mot est nommé', () => {
    const v = relecturePubEntiere({ copie: COPIE, constat: constat([...LUS_OK.slice(0, 3), 'Je les essaie maintenant', LUS_OK[4]!]), faits: [] });
    expect(v.raisons).toEqual(['bouton réécrit · lu « Je les essaie maintenant » (mot en trop « maintenant »)']);
  });

  it('texte absent, accents perdus, packaging différent, texte illisible ⇒ chaque raison dite', () => {
    const v = relecturePubEntiere({ copie: COPIE, constat: constat(['Tes lunettes tiennent enfin', 'Meme en plein sprint, rien ne glisse.', 'Je les essaie'], { produitFidele: false, ecartsProduit: ['le bandeau est bleu au lieu de noir'], texteLisible: false, problemesLisibilite: ['le bouton se fond dans le fond'] }), faits: [] });
    expect(v.statut).toBe('a_reprendre');
    expect(v.raisons).toEqual([
      'sous-titre : accents perdus · lu « Meme en plein sprint, rien ne glisse. »',
      'bénéfice 1 « Anti-buée » absent de l’image',
      'packaging différent de la photo du produit · le bandeau est bleu au lieu de noir',
      'texte difficile à lire · le bouton se fond dans le fond',
    ]);
  });

  it('« Un goût fruits rouges » écrit juste, mais l’étiquette lue dit « Goût mangue » ⇒ refusé avec la raison', () => {
    const c: CopieDessinee = { headline: 'Un goût fruits rouges qui fait du bien, vraiment.', subhead: 'Parce que soulager ton cycle ne devrait jamais être désagréable.', benefits: [], cta: null };
    const lus = ['Un goût fruits rouges qui fait du bien, vraiment.', 'Parce que soulager ton cycle ne devrait jamais être désagréable.', 'naali', 'ANTI-STRESS', 'Goût mangue', '60 gommes'];
    const v = relecturePubEntiere({ copie: c, constat: constat(lus), faits: [] });
    expect(v.statut).toBe('a_reprendre');
    expect(v.raisons).toEqual(['accroche « Un goût fruits rouges qui fait du bien, vraiment. » contredit le produit · goût « fruit rouge » annoncé, « mangue » sur le produit']);
    expect(v.copie?.lignes.every((l) => l.etat === 'exacte')).toBe(true);
  });

  it('sans constat (vision absente) ⇒ non conclue, jamais conforme ; une contradiction avec la fiche reste dite', () => {
    expect(relecturePubEntiere({ copie: COPIE, constat: null, faits: [], motif: 'vision absente' })).toMatchObject({ statut: 'non_conclue', raisons: [], nonVerifie: ['mots, packaging et lisibilité non relus · vision absente'] });
    expect(relecturePubEntiere({ copie: { ...COPIE, headline: 'Goût fraise' }, constat: null, faits: ['Goût mangue'] })).toMatchObject({ statut: 'a_reprendre' });
  });

  it('packaging non comparé (aucune référence) · dit « non vérifié », pas « fidèle »', () => {
    expect(relecturePubEntiere({ copie: COPIE, constat: constat(LUS_OK, { produitFidele: null }), faits: [] })).toMatchObject({ statut: 'conforme', nonVerifie: ['packaging non comparé à la photo du produit'] });
  });

  it('écart de mots · multiensembles', () => {
    expect(ecartMots('Je les essaie', 'Je les essaie maintenant')).toEqual({ manquants: [], enTrop: ['maintenant'] });
    expect(chainesDeLaCopie(COPIE).map((c) => c.role)).toEqual(['accroche', 'sous-titre', 'bénéfice 1', 'bouton']);
  });
});
