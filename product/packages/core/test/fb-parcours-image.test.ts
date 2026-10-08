import { describe, it, expect } from 'vitest';
import {
  construireConsignePersistee, lireConsignePersistee, consigneDuContenu, changementsConsigne, parametresDepuisConsigne, empreinteConsigne,
  empreinteEntreesCompilation, exigenceImageDuDevis, verdictConsigne, empreinteEntreesDevisImage, prixImage, libellePrix,
  disponibiliteImage, raisonEchec, libelleQualiteImage, planImage, CHEMINS_CONSIGNE, OPERATION_IMAGE, PLAN_IMAGE,
  type ConsigneImagePersistee, type ResolutionReference,
} from '../src/studios/image';
import { appliquerPatch } from '../src/studios/patch';
import { validerContenuVersion, contenuVide, type ContenuVersion } from '../src/studios/document';
import { calculerPlanImpact, grapheImpact } from '../src/studios/impact';
import { lireParametresImage, requeteFalImage } from '../src/studios/fournisseurs';
import { empreinteEntreesDevis, lignesDuDevis, GRILLE_STUDIO } from '../src/studios/execution';
import { CREDIT_COSTS } from '../src/credits';
import { FIXED_COSTS } from '../src/spend-guard';
import type { ReferenceBrief } from '../src/studios/brief';

/**
 * F-B · règles pures du parcours image. Chaque garde lit une VALEUR rendue :
 * la consigne persistable, le contenu APRÈS patch (validé L1), le plan
 * d'impact, l'empreinte d'entrée du devis, le verdict, les paramètres que le
 * worker relit et la requête fal qu'il en tire.
 */

const SHA_P = 'a'.repeat(64);
const SHA_L = 'b'.repeat(64);
const PHOTO = 'pph_0123456789abcdef01234567';
const LOGO = 'logo_0123456789abcdef01234567';
const SOURCE = 'src_concurrent_1';
const ref = (assetId: string, role: ReferenceBrief['role'], sha: string): ReferenceBrief => ({
  assetId, assetVersion: `sha256-${sha.slice(0, 16)}`, sha256: sha, role, scope: role === 'product' ? 'product' : 'global', allowedChanges: [], requiredComponents: [],
});
const TRANSMISES: ReferenceBrief[] = [ref(LOGO, 'logo', SHA_L), ref(PHOTO, 'identity', SHA_P), ref(PHOTO, 'product', SHA_P), ref(SOURCE, 'style', 'c'.repeat(64))];
const CONTENU: ContenuVersion = { ...contenuVide(), brief: { objective: 'x' }, productRef: { productId: 'p1', assetId: PHOTO } };
const consigneBrute = (liaisons: string[]) => ({
  generationInstruction: 'Coureur portant les lunettes et le bandeau, piste au lever du jour.',
  negativeConstraints: ['Pas de texte dans l’image'], needsDeterministicOverlay: true, protectedComponents: ['lunettes', 'bandeau'],
  referenceBindings: liaisons.map((id) => ({ referenceId: id, role: id === PHOTO ? 'product' : id === LOGO ? 'logo' : 'style', scope: 'product' })),
});
function consigne(liaisons = [LOGO, PHOTO]): ConsigneImagePersistee {
  const c = construireConsignePersistee({
    runId: '11111111-1111-4111-8111-111111111111', mode: 'generative_scene', sourceVersionId: '22222222-2222-4222-8222-222222222222',
    contenu: CONTENU, consigne: consigneBrute(liaisons), referencesTransmises: TRANSMISES, largeur: 1080, hauteur: 1350, compileeLe: new Date('2026-10-08T10:00:00Z'),
  });
  if (!c.ok) throw new Error(c.violations.join(' | '));
  return c.consigne;
}
const present = (sha: string, transmissible = true): ResolutionReference => ({ etat: 'present', sha256: sha, assetVersion: `sha256-${sha.slice(0, 16)}`, transmissible });

describe('consigne persistable · ce que le serveur garde d’une compilation acceptée', () => {
  it('ne garde QUE les références liées, avec la version et l’empreinte transmises ; un fichier à deux rôles part comme produit', () => {
    const c = consigne();
    expect(c.references).toEqual([
      { assetId: LOGO, assetVersion: `sha256-${SHA_L.slice(0, 16)}`, sha256: SHA_L, role: 'logo' },
      { assetId: PHOTO, assetVersion: `sha256-${SHA_P.slice(0, 16)}`, sha256: SHA_P, role: 'product' },
    ]);
    expect(c.entrees).toBe(empreinteEntreesCompilation(CONTENU));
    expect(c.format).toEqual({ largeur: 1080, hauteur: 1350 });
  });

  it('une liaison vers un fichier que la compilation n’a pas reçu est refusée (aucune référence inventée)', () => {
    const r = construireConsignePersistee({
      runId: 'r', mode: 'generative_scene', sourceVersionId: 'v', contenu: CONTENU, consigne: consigneBrute([PHOTO, 'pph_inconnu']),
      referencesTransmises: TRANSMISES, largeur: 1080, hauteur: 1350, compileeLe: new Date(),
    });
    expect(r).toEqual({ ok: false, violations: ['liaison pph_inconnu : référence non transmise à la compilation'] });
  });

  it('relue telle quelle ; un champ de plus, un emplacement de gabarit, un format hors bornes ⇒ illisible', () => {
    const c = consigne();
    expect(lireConsignePersistee(JSON.parse(JSON.stringify(c)))).toEqual(c);
    expect(lireConsignePersistee({ ...c, consigneManuelle: true })).toBeNull();
    expect(lireConsignePersistee({ ...c, consigne: { ...c.consigne, generationInstruction: 'Un {{produit}} au soleil' } })).toBeNull();
    expect(lireConsignePersistee({ ...c, format: { largeur: 10, hauteur: 1350 } })).toBeNull();
  });

  it('les paramètres d’instantané sont au schéma studio_image/1 et le worker en tire une requête fal (produit d’abord)', () => {
    const c = consigne();
    const p = parametresDepuisConsigne(c);
    expect(lireParametresImage(p).ok).toBe(true);
    expect(p).toMatchObject({ schema: 'studio_image/1', promptRunId: c.runId, format: { largeur: 1080, hauteur: 1350 } });
    const r = requeteFalImage({
      operations: [{ operation: OPERATION_IMAGE, profil: 'image_generation' }], parametres: p,
      medias: [{ assetId: PHOTO, etat: 'autorise', url: 'https://cdn.test/p.png', sha256: SHA_P }, { assetId: LOGO, etat: 'autorise', url: 'https://cdn.test/l.png', sha256: SHA_L }],
      modeles: { generation: 'fal-ai/nano-banana-2', edition: 'fal-ai/nano-banana-2/edit' },
    });
    expect(r).toMatchObject({ ok: true, modele: 'fal-ai/nano-banana-2/edit', operations: [OPERATION_IMAGE], corps: { image_urls: ['https://cdn.test/p.png', 'https://cdn.test/l.png'], aspect_ratio: '4:5', num_images: 1 } });
  });
});

describe('version · la consigne se range dans styleRef et le plan s_image, le contenu reste valide', () => {
  it('styleRef nul, aucun plan : patch appliqué, contenu L1 valide, consigne relue, keyframe:s_image dans le graphe', () => {
    const c = consigne();
    const r = appliquerPatch(CONTENU, changementsConsigne(CONTENU, c, 'retenir'), CHEMINS_CONSIGNE);
    if (!r.ok) throw new Error(JSON.stringify(r.violations));
    expect(validerContenuVersion(r.resultat)).toEqual([]);
    expect(consigneDuContenu(r.resultat)).toEqual(c);
    expect(r.resultat.shots.order).toEqual([PLAN_IMAGE]);
    expect(r.resultat.shots.byId[PLAN_IMAGE]).toEqual(planImage(c));
    expect(grapheImpact(r.resultat).get(OPERATION_IMAGE)?.nature).toBe('generation');
    expect(r.resultat.brief).toEqual(CONTENU.brief);
  });

  it('styleRef existant gardé ; plan déjà là remplacé, ordre inchangé ; autre consigne ⇒ image à refaire', () => {
    const avec = appliquerPatch({ ...CONTENU, styleRef: { palette: 'chaude' } }, changementsConsigne({ ...CONTENU, styleRef: { palette: 'chaude' } }, consigne(), 'r'), CHEMINS_CONSIGNE);
    if (!avec.ok) throw new Error(JSON.stringify(avec.violations));
    expect((avec.resultat.styleRef as Record<string, unknown>).palette).toBe('chaude');
    const autre = { ...consigne([PHOTO]) };
    const r2 = appliquerPatch(avec.resultat, changementsConsigne(avec.resultat, autre, 'r'), CHEMINS_CONSIGNE);
    if (!r2.ok) throw new Error(JSON.stringify(r2.violations));
    expect(r2.resultat.shots.order).toEqual([PLAN_IMAGE]);
    const plan = calculerPlanImpact(avec.resultat, r2.resultat, { sortiesExistantes: [OPERATION_IMAGE] });
    expect(plan.aRefaire.map((n) => n.id)).toContain(OPERATION_IMAGE);
    expect(plan.obsoletes).toContain(OPERATION_IMAGE);
  });

  it('l’opération image est devisée au prix image du barème (CREDIT_COSTS.image, FIXED_COSTS.fal_image), jamais inventé', () => {
    const r = appliquerPatch(CONTENU, changementsConsigne(CONTENU, consigne(), 'r'), CHEMINS_CONSIGNE);
    if (!r.ok) throw new Error('patch');
    const l = lignesDuDevis(calculerPlanImpact(CONTENU, r.resultat, { sortiesExistantes: [] }), [OPERATION_IMAGE]);
    expect(l).toMatchObject({ ok: true, totalCredits: CREDIT_COSTS.image, totalUsdMicros: Math.round(FIXED_COSTS.fal_image * 1e6) });
    expect(prixImage()).toEqual({ credits: CREDIT_COSTS.image, usdMicros: GRILLE_STUDIO.image_generation.usdMicros });
    expect(libellePrix(prixImage())).toBe('4 crédits · 0,08 $ au plus de coût fournisseur');
  });
});

describe('devis · l’image du studio se devise seule et son empreinte porte la consigne', () => {
  it('exigence', () => {
    expect(exigenceImageDuDevis([{ operation: 'keyframe:s1', profil: 'image_generation' }])).toEqual({ concerne: false });
    expect(exigenceImageDuDevis([{ operation: OPERATION_IMAGE, profil: 'image_generation' }, { operation: 'composition', profil: 'calcul' }])).toEqual({ concerne: true, horsImage: [] });
    expect(exigenceImageDuDevis([{ operation: OPERATION_IMAGE, profil: 'image_generation' }, { operation: 'keyframe:s1', profil: 'image_generation' }])).toEqual({ concerne: true, horsImage: ['keyframe:s1'] });
  });

  it('inputHash · change avec la consigne, diffère de l’empreinte L3 seule', () => {
    const e = { workspaceId: 'w', brandId: 'b', projectId: 'p', projectVersionId: 'v', contentHash: 'h', impactPlanHash: 'i', pricingVersion: 'pv', lignes: [], epinglage: null };
    const a = empreinteEntreesDevisImage(e, empreinteConsigne(consigne()));
    expect(a).not.toBe(empreinteEntreesDevis(e));
    expect(a).not.toBe(empreinteEntreesDevisImage(e, empreinteConsigne(consigne([PHOTO]))));
    expect(a).toBe(empreinteEntreesDevisImage(e, empreinteConsigne(consigne())));
  });
});

describe('verdict · une consigne ne part que présente, attestée, à jour, références intactes et transmissibles', () => {
  const c = consigne();
  const ok = new Map<string, ResolutionReference>([[PHOTO, present(SHA_P)], [LOGO, present(SHA_L)]]);
  const v = (o: Partial<Parameters<typeof verdictConsigne>[0]>) => verdictConsigne({ consigne: c, attestee: true, entreesCourantes: c.entrees, resolutions: ok, ...o });

  it('nominal', () => expect(v({})).toEqual({ ok: true }));
  it('absente ⇒ MISSING_REFERENCE', () => expect(v({ consigne: null })).toMatchObject({ ok: false, cause: 'absente', code: 'MISSING_REFERENCE' }));
  it('non attestée (écrite à la main dans le contenu) ⇒ refus', () => expect(v({ attestee: false })).toMatchObject({ ok: false, cause: 'non_attestee', code: 'INVALID_SCHEMA' }));
  it('brief ou produit changés depuis la compilation ⇒ périmée', () => expect(v({ entreesCourantes: 'f'.repeat(64) })).toMatchObject({ ok: false, cause: 'perimee', code: 'VERSION_CONFLICT' }));
  it('photo retirée ⇒ MISSING_REFERENCE nominatif, aucune substitution', () => {
    expect(v({ resolutions: new Map([[LOGO, present(SHA_L)], [PHOTO, { etat: 'absent' }]]) })).toMatchObject({ ok: false, cause: 'reference_retiree', code: 'MISSING_REFERENCE', cibles: [PHOTO] });
  });
  it('logo modifié (autre empreinte) ⇒ MISSING_REFERENCE', () => {
    expect(v({ resolutions: new Map([[PHOTO, present(SHA_P)], [LOGO, present('d'.repeat(64))]]) })).toMatchObject({ ok: false, cause: 'reference_modifiee', cibles: [LOGO] });
  });
  it('liaison vers une annonce concurrente ⇒ UNSUPPORTED_CAPABILITY (le fournisseur ne la reçoit pas)', () => {
    const cc = consigne([PHOTO, SOURCE]);
    const r = verdictConsigne({ consigne: cc, attestee: true, entreesCourantes: cc.entrees, resolutions: new Map([[PHOTO, present(SHA_P)], [SOURCE, { etat: 'sans_media' }]]) });
    expect(r).toMatchObject({ ok: false, cause: 'non_transmissible', code: 'UNSUPPORTED_CAPABILITY', cibles: [SOURCE] });
  });
});

describe('écran · disponibilités et mots', () => {
  const base = { peutGenerer: true, peutProposer: true, briefPresent: true, preparationOk: true, releasePubliee: true, fournisseurTexte: true, plafondAtteint: false, fournisseurImage: true };
  it('tout est là', () => {
    const d = disponibiliteImage(base);
    expect([d.compilation.disponible, d.retenir.disponible, d.devis.disponible, d.lancement.disponible]).toEqual([true, true, true, true]);
  });
  it('sans release : compilation indisponible et DITE ; sans fournisseur d’images : lancement indisponible et DIT', () => {
    expect(disponibiliteImage({ ...base, releasePubliee: false }).compilation).toEqual({ disponible: false, raison: expect.stringContaining('aucune version des consignes n’est publiée') });
    expect(disponibiliteImage({ ...base, fournisseurImage: false }).lancement).toEqual({ disponible: false, raison: expect.stringContaining('fournisseur d’images n’est pas branché') });
  });
  it('lecteur : rien d’autre que lire', () => {
    const d = disponibiliteImage({ ...base, peutGenerer: false, peutProposer: false });
    expect([d.compilation.disponible, d.retenir.disponible, d.devis.disponible, d.lancement.disponible]).toEqual([false, false, false, false]);
  });
  it('raison d’échec et qualité en mots', () => {
    expect(raisonEchec({ motif: 'MISSING_REFERENCE · référence indisponible, aucune substitution · pph_x : retirée' })).toContain('aucune substitution');
    expect(raisonEchec(null)).toBe('Le fournisseur a refusé ou échoué · aucun détail n’a été transmis.');
    expect(libelleQualiteImage('completed', 'requires_review')).toContain('À relire');
    expect(libelleQualiteImage('running', 'pending')).toBe('Aucun média livré pour l’instant');
  });
});
