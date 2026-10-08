import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { creerValidateurContrats } from '../src/prompts/contrats';
import type { PackPrompts } from '../src/prompts/types';
import { validerContenuVersion, type ContenuVersion } from '../src/studios/document';
import { appliquerPatch } from '../src/studios/patch';
import { lireReferenceProduit } from '../src/studios/sources/produit';
import { validerRelationsBrief, type BriefCanonique, type ReferenceBrief } from '../src/studios/brief';
import {
  epinglerProduit, lireReferenceEpinglee, etatPhotoEpinglee, changementsEpinglage, associationProduit, VARIANTE_UNIQUE,
  ajouterAssociation, retirerAssociation, controlerAssociations,
  controlerAvantCompilation, controlerSortieCompilation, consigneFinale,
  verdictComposants, criteresComposants,
  type ReferenceProduitEpinglee, type ConsigneImage,
} from '../src/studios/produit';
import {
  T0, ID_PRODUIT, PHOTOS, produit, autreProduit, photos, photosAutre, shaOctetsNode, brief, contenuAvecBrief, source,
  fichierConcurrent, fichierLogo, fichierBib, catalogue,
} from './l5c-fixtures';

/**
 * L5-C · produit épinglé (IMG-01), composants obligatoires (IMG-03),
 * références typées et contrôle avant compilation (IMG-04). Règles PURES,
 * vérifiées sur leur RÉSULTAT · et contre le vrai 03-CONTRATS (Ajv).
 */

const DOSSIER = join(__dirname, '../../../../docs/studios-v2');
const lire = (f: string) => JSON.parse(readFileSync(join(DOSSIER, f), 'utf8')) as Record<string, unknown>;
const validateur = creerValidateurContrats(lire('03-CONTRATS.schema.json'), (lire('02-PROMPTS.json') as unknown as PackPrompts).templates);

function epingler(o: { photo?: number; composants?: string[] } = {}): ReferenceProduitEpinglee {
  const ph = photos();
  const r = epinglerProduit({ productId: ID_PRODUIT, photoId: ph[(o.photo ?? 5) - 1]!.assetId, composants: o.composants ?? ['lunettes', 'bandeau'] }, { produit, photos: ph, variante: VARIANTE_UNIQUE }, T0);
  if (!r.ok) throw new Error(JSON.stringify(r.violations));
  return r.reference;
}

describe('IMG-01 · catalogue de sept photos, UNE photo précise épinglée', () => {
  it('sept photos distinctes · identité dérivée du contenu, empreinte = SHA-256 des octets décodés (node:crypto)', () => {
    const ph = photos();
    expect(ph).toHaveLength(7);
    expect(new Set(ph.map((p) => p.assetId)).size).toBe(7);
    ph.slice(0, 6).forEach((p, i) => {
      expect(p.sha256).toBe(shaOctetsNode(PHOTOS[i]!));
      expect(p.nature).toBe('contenu');
      expect(p.position).toBe(i + 1);
    });
    expect(ph[6]!.nature).toBe('adresse');
  });

  it('la référence porte produit, variante, photo n°5 (id, version, empreinte), composants, transformations, provenance', () => {
    const ph = photos();
    const r = epingler();
    expect(r).toMatchObject({
      productId: ID_PRODUIT, assetId: ph[4]!.assetId,
      variante: { id: null },
      photo: { assetId: ph[4]!.assetId, assetVersion: ph[4]!.assetVersion, sha256: shaOctetsNode(PHOTOS[4]!), position: 5, total: 7, nature: 'contenu' },
      composantsObligatoires: ['lunettes', 'bandeau'],
      provenanceFaits: { origine: 'catalogue_produits', productId: ID_PRODUIT },
    });
    expect(r.transformationsAutorisees).not.toContain('lumiere');
    expect(lireReferenceEpinglee(r)).toEqual(r);
    // Compatibilité L4-B : la page projet et l'export relisent la référence.
    expect(lireReferenceProduit(r)?.nom).toBe('Lunettes Sport Bandeau');
  });

  it('l’association Produit est un `Reference` du contrat (Ajv) et transmet les composants', () => {
    const a = associationProduit(epingler());
    expect(validateur.validerDefinition('Reference', a)).toEqual({ ok: true });
    expect(a).toMatchObject({ role: 'product', scope: 'product', requiredComponents: ['lunettes', 'bandeau'] });
  });

  it('refuse une photo d’un autre produit, une photo absente, une transformation hors liste', () => {
    const ph = photos();
    const cat = { produit, photos: [...ph, ...photosAutre()], variante: VARIANTE_UNIQUE };
    const autre = epinglerProduit({ productId: ID_PRODUIT, photoId: photosAutre()[0]!.assetId }, cat, T0);
    expect(autre).toEqual({ ok: false, violations: [{ chemin: 'photoId', raison: 'choisis une photo précise de ce produit' }] });
    expect(epinglerProduit({ productId: ID_PRODUIT, photoId: 'pph_inconnue' }, cat, T0).ok).toBe(false);
    expect(epinglerProduit({ productId: ID_PRODUIT, photoId: ph[0]!.assetId, transformations: ['regenerer'] }, cat, T0)).toMatchObject({ ok: false, violations: [{ chemin: 'transformations' }] });
    expect(epinglerProduit({ productId: autreProduit.id, photoId: ph[0]!.assetId }, cat, T0)).toMatchObject({ ok: false, violations: [{ chemin: 'productId' }] });
  });

  it('photo remplacée dans le catalogue · la référence ne glisse pas vers la nouvelle (retirée), produit supprimé dit', () => {
    const r = epingler();
    expect(etatPhotoEpinglee(r, { produitPresent: true, photos: photos() })).toBe('presente');
    const remplacee = photos().map((p, i) => (i === 4 ? { ...p, assetId: 'pph_autre', sha256: 'f'.repeat(64) } : p));
    expect(etatPhotoEpinglee(r, { produitPresent: true, photos: remplacee })).toBe('retiree');
    expect(etatPhotoEpinglee(r, { produitPresent: false, photos: [] })).toBe('produit_retire');
  });

  it('les changements d’une nouvelle version · productRef, faits du produit, association Produit · contenu et brief valides', () => {
    const contenu = contenuAvecBrief();
    const r = epingler();
    const ids = new Set(photos().map((p) => p.assetId));
    const p = appliquerPatch(contenu, changementsEpinglage(contenu, contenu.brief as unknown as BriefCanonique, r, ids), ['/productRef', '/brief']);
    if (!p.ok) throw new Error(JSON.stringify(p.violations));
    expect(validerContenuVersion(p.resultat)).toEqual([]);
    const b = p.resultat.brief as unknown as BriefCanonique;
    expect(b.references).toEqual([associationProduit(r)]);
    expect(b.facts.find((f) => f.id === 'produit.composants')?.claim).toBe('Composants obligatoires : lunettes, bandeau');
    expect(validerRelationsBrief(b, { sources: [source], productId: ID_PRODUIT })).toEqual([]);
    expect((p.resultat.productRef as { assetId: string }).assetId).toBe(r.photo.assetId);
  });

  it('changer de produit retire les faits et les vues Produit de l’ancien', () => {
    const contenu = contenuAvecBrief();
    const r1 = epingler();
    const p1 = appliquerPatch(contenu, changementsEpinglage(contenu, contenu.brief as unknown as BriefCanonique, r1, new Set(photos().map((p) => p.assetId))), ['/productRef', '/brief']);
    if (!p1.ok) throw new Error('p1');
    const ph2 = photosAutre();
    const r2 = epinglerProduit({ productId: autreProduit.id, photoId: ph2[0]!.assetId }, { produit: autreProduit, photos: ph2, variante: VARIANTE_UNIQUE }, T0);
    if (!r2.ok) throw new Error('r2');
    const b1 = p1.resultat.brief as unknown as BriefCanonique;
    const p2 = appliquerPatch(p1.resultat, changementsEpinglage(p1.resultat, b1, r2.reference, new Set(ph2.map((p) => p.assetId))), ['/productRef', '/brief']);
    if (!p2.ok) throw new Error('p2');
    const b2 = p2.resultat.brief as unknown as BriefCanonique;
    expect(b2.references.map((x) => x.assetId)).toEqual([ph2[0]!.assetId]);
    expect(b2.facts.filter((f) => f.sourceIds.includes(`produit:${ID_PRODUIT}`))).toEqual([]);
    expect(validerRelationsBrief(b2, { sources: [source], productId: autreProduit.id })).toEqual([]);
  });
});

const PAS_CONTROLE = null;
const controle = (verdict: 'passed' | 'requires_review' | 'rejected', issues: Array<{ severity: 'blocking' | 'major' | 'minor'; observation: string; expected: string }> = [], unverifiable: string[] = []) => ({
  verdict, unverifiable, issues: issues.map((i) => ({ code: 'COMPOSANT', targetId: 'sortie_1', evidenceIds: [] as string[], ...i })),
});

describe('IMG-03 · lunettes avec bandeau obligatoires · une omission exige revue ou rejet, jamais un succès silencieux', () => {
  const requis = ['lunettes', 'bandeau'];

  it('le bandeau absent (défaut majeur) ⇒ rejected, même si le contrôle global dit passed', () => {
    const v = verdictComposants({ requis, controle: controle('passed', [{ severity: 'major', observation: 'Une boîte à la place du bandeau', expected: 'Bandeau élastique visible' }]) });
    expect(v).toMatchObject({ statut: 'rejected', manquants: ['bandeau'], confirmes: ['lunettes'] });
  });

  it('aucun contrôle (job fournisseur réussi, rien regardé) ⇒ requires_review', () => {
    expect(verdictComposants({ requis, controle: PAS_CONTROLE })).toMatchObject({ statut: 'requires_review', nonVerifies: requis });
  });

  it('contrôle sans conclusion, composant invérifiable ⇒ requires_review', () => {
    expect(verdictComposants({ requis, controle: controle('requires_review') }).statut).toBe('requires_review');
    expect(verdictComposants({ requis, controle: controle('passed', [], ['Bandeau caché par la main, invérifiable']) })).toMatchObject({ statut: 'requires_review', nonVerifies: ['bandeau'] });
  });

  it('constat du relecteur « bandeau absent » ⇒ rejected ; tout confirmé ⇒ passed', () => {
    expect(verdictComposants({ requis, controle: controle('passed'), constats: [{ composant: 'Bandeau', present: false }] }).statut).toBe('rejected');
    expect(verdictComposants({ requis, controle: controle('passed') })).toMatchObject({ statut: 'passed', confirmes: requis });
    expect(verdictComposants({ requis, controle: PAS_CONTROLE, constats: [{ composant: 'lunettes', present: true }, { composant: 'bandeau', present: true }] }).statut).toBe('passed');
  });

  it('aucun composant déclaré et aucun contrôle ⇒ requires_review (identité non contrôlée)', () => {
    expect(verdictComposants({ requis: [], controle: PAS_CONTROLE }).statut).toBe('requires_review');
  });

  it('critères transmis au contrôle visuel · un par composant · sortie quality.visual conforme au contrat', () => {
    expect(criteresComposants(requis)).toEqual(expect.arrayContaining(['Composant obligatoire visible et intact : lunettes', 'Composant obligatoire visible et intact : bandeau']));
    const sortie = { status: 'ready', questions: [], warnings: [], evidenceIds: [], result: { ...controle('rejected', [{ severity: 'blocking', observation: 'Bandeau absent', expected: 'Bandeau visible' }]), summary: 'Bandeau manquant.' } };
    expect(validateur.validerSortie('quality.visual', sortie)).toEqual({ ok: true });
  });
});

describe('IMG-04 · rôles explicites, deux rôles = deux associations, aucun rôle déduit', () => {
  const r = epingler();
  const fichiers = catalogue();
  const base = (): ReferenceBrief[] => [associationProduit(r)];

  it('sans rôle choisi · rien n’est associé, la raison est dite', () => {
    const x = ajouterAssociation(base(), { assetId: fichierBib.assetId, role: '', scope: 'global' }, fichiers, r);
    expect(x).toEqual({ ok: false, violations: [{ chemin: 'association/role', raison: 'choisis un rôle explicite · aucun rôle n’est déduit du fichier' }] });
  });

  it('un fichier avec deux rôles = deux associations explicites ; le même rôle deux fois est refusé', () => {
    const a = ajouterAssociation(base(), { assetId: fichierConcurrent.assetId, role: 'style', scope: 'background' }, fichiers, r);
    if (!a.ok) throw new Error(JSON.stringify(a.violations));
    const b = ajouterAssociation(a.references, { assetId: fichierConcurrent.assetId, role: 'composition', scope: 'global' }, fichiers, r);
    if (!b.ok) throw new Error(JSON.stringify(b.violations));
    expect(b.references.filter((x) => x.assetId === fichierConcurrent.assetId).map((x) => x.role)).toEqual(['style', 'composition']);
    expect(ajouterAssociation(b.references, { assetId: fichierConcurrent.assetId, role: 'style', scope: 'global' }, fichiers, r).ok).toBe(false);
    for (const x of b.references) expect(validateur.validerDefinition('Reference', x)).toEqual({ ok: true });
    expect(controlerAssociations(b.references, fichiers, r)).toEqual([]);
  });

  it('une annonce concurrente ne sert jamais de Produit, Identité, Logo ni Élément à intégrer, ni sur le produit ou le sujet', () => {
    for (const role of ['product', 'identity', 'logo', 'integrate']) {
      const x = ajouterAssociation(base(), { assetId: fichierConcurrent.assetId, role, scope: 'global' }, fichiers, r);
      expect(x.ok, `rôle ${role} accepté pour une source concurrente`).toBe(false);
    }
    expect(ajouterAssociation(base(), { assetId: fichierConcurrent.assetId, role: 'style', scope: 'subject' }, fichiers, r).ok).toBe(false);
  });

  it('le rôle Produit est réservé aux photos du produit épinglé · une vue supplémentaire du même produit passe', () => {
    expect(ajouterAssociation(base(), { assetId: fichierLogo.assetId, role: 'product', scope: 'product' }, fichiers, r).ok).toBe(false);
    expect(ajouterAssociation(base(), { assetId: photosAutre()[0]!.assetId, role: 'product', scope: 'product' }, fichiers, r).ok).toBe(false);
    const vue = ajouterAssociation(base(), { assetId: photos()[1]!.assetId, role: 'product', scope: 'product' }, fichiers, r);
    expect(vue.ok && vue.references[1]).toMatchObject({ role: 'product', requiredComponents: ['lunettes', 'bandeau'] });
  });

  it('l’association Produit de la photo épinglée ne se retire pas à la main', () => {
    expect(retirerAssociation(base(), { assetId: r.photo.assetId, role: 'product' }, r).ok).toBe(false);
  });

  it('une ligne stockée altérée (source concurrente en Identité) est refusée au contrôle', () => {
    const altere: ReferenceBrief[] = [...base(), { assetId: fichierConcurrent.assetId, assetVersion: fichierConcurrent.assetVersion, sha256: fichierConcurrent.sha256, role: 'identity', scope: 'subject', allowedChanges: [], requiredComponents: [] }];
    expect(controlerAssociations(altere, fichiers, r).map((v) => v.raison)).toEqual(expect.arrayContaining([expect.stringContaining('ne sert que de Style ou de Composition')]));
  });
});

describe('IMG-04 · contrôle avant et après image.compile · aucun transfert du sujet ou du logo concurrent', () => {
  const r = epingler();
  const fichiers = catalogue();
  const avecRefs = (refs: ReferenceBrief[]): BriefCanonique => ({ ...brief(), references: refs });
  const refsStyle = () => [associationProduit(r), { assetId: fichierConcurrent.assetId, assetVersion: fichierConcurrent.assetVersion, sha256: fichierConcurrent.sha256, role: 'style' as const, scope: 'background' as const, allowedChanges: [], requiredComponents: [] }];

  it('préparation · interdits de transfert nominatifs, composants protégés, invariants', () => {
    const prep = controlerAvantCompilation({ mode: 'generative_scene', brief: avecRefs(refsStyle()), produit: r, fichiers });
    expect(prep.ok).toBe(true);
    expect(prep.interditsTransfert).toHaveLength(1);
    expect(prep.interditsTransfert[0]).toContain('ni son sujet, ni son personnage, ni son produit, ni son logo');
    expect(prep.interditsTransfert[0]).toContain('« Lumière Botanique »');
    expect(prep.composantsProteges).toEqual(['lunettes', 'bandeau']);
    expect(prep.invariants).toEqual(expect.arrayContaining(['Composant obligatoire visible : bandeau', prep.interditsTransfert[0]]));
  });

  it('sans produit épinglé, ou photo épinglée absente des références · bloqué avant tout appel', () => {
    expect(controlerAvantCompilation({ mode: 'faithful_composite', brief: avecRefs([]), produit: null, fichiers }).violations.map((v) => v.chemin)).toContain('/productRef');
    expect(controlerAvantCompilation({ mode: 'faithful_composite', brief: avecRefs([]), produit: r, fichiers }).violations.map((v) => v.chemin)).toContain('/brief/references');
  });

  it('après l’appel · rôle non déclaré, fuite du nom concurrent, composant non protégé · refusés', () => {
    const prep = controlerAvantCompilation({ mode: 'generative_scene', brief: avecRefs(refsStyle()), produit: r, fichiers });
    const fautive: ConsigneImage = {
      generationInstruction: 'Coureuse portant les lunettes, dans l’univers de Lumière Botanique, logo en haut.',
      negativeConstraints: [], needsDeterministicOverlay: false, protectedComponents: ['lunettes'],
      referenceBindings: [{ referenceId: fichierConcurrent.assetId, role: 'identity', scope: 'subject' }, { referenceId: r.photo.assetId, role: 'product', scope: 'product' }],
    };
    const v = controlerSortieCompilation(fautive, prep, fichiers, [source]).map((x) => x.raison);
    expect(v).toEqual(expect.arrayContaining([
      'rôle « identity » non déclaré pour ce fichier · aucun rôle déduit',
      'une annonce concurrente ne sert que de style ou de composition',
      'reprend le nom de l’annonceur source',
      'composant obligatoire « bandeau » non protégé',
    ]));
    const propre: ConsigneImage = { ...fautive, generationInstruction: 'Coureuse portant les lunettes et le bandeau, lumière dorée de fin de journée.', protectedComponents: ['lunettes', 'bandeau'], referenceBindings: [{ referenceId: fichierConcurrent.assetId, role: 'style', scope: 'background' }] };
    expect(controlerSortieCompilation(propre, prep, fichiers, [source])).toEqual([]);
    // Les interdits du serveur s'ajoutent même si le modèle les a omis.
    expect(consigneFinale(propre, prep).negativeConstraints).toEqual(prep.interditsTransfert);
  });
});

void (null as unknown as ContenuVersion);
