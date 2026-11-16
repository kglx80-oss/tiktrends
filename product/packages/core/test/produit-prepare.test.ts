import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import type { BriefCanonique, ReferenceBrief } from '../src/studios/brief';
import {
  epinglerProduit, associationProduit, controlerAvantCompilation, controlerSortieCompilation, consigneFinale, entreeCompilation,
  definirFicheProduit, validerFicheProduit, attributsFiche, raisonFiche, raisonVue, raisonFicheRetiree, vuesModifiees, phraseUnSeulArticle, VARIANTE_UNIQUE, VUES_PRODUIT_MAX,
  idBibliotheque, versionDepuisEmpreinte,
  type ConsigneImage, type FichierCatalogue, type ReferenceProduitEpinglee,
} from '../src/studios/produit';
import { requeteFalImage, REFERENCES_PAR_APPEL_MAX, type MediaResolu } from '../src/studios/fournisseurs';
import { construireConsignePersistee, parametresDepuisConsigne } from '../src/studios/image';
import { T0, ID_PRODUIT, PHOTOS, produit, autreProduit, photos, photosAutre, brief, catalogue, fichierConcurrent, fichierLogo, fichierBib, source } from './l5c-fixtures';
import { scenarios, contexteCompilation } from './produit-prepare-fixtures';

/**
 * Le produit arrive au modèle d'images mieux MONTRÉ (jusqu'à trois vues du
 * même produit) et mieux DÉCRIT (fiche : taille réelle et son repère, ce que
 * les photos ne montrent pas, ce qu'un achat contient, l'emballage).
 *
 * Vérifié sur le RÉSULTAT · les références transmises à `image.compile`, la
 * consigne finale, puis le corps que `requeteFalImage` enverrait au
 * fournisseur (ordre des `image_urls`), et les invariants de la compilation.
 * Le contexte d'une fiche vide est comparé à une CAPTURE faite sur main avant
 * toute modification (`fixtures/produit-prepare-contexte-main.json`, commit
 * 62a341e3) · jamais à zéro.
 */

const ph = photos();
const ops = [{ operation: 'keyframe:s_image', profil: 'image_generation' as const }];
const modeles = { generation: 'fal-ai/nano-banana-2', edition: 'fal-ai/nano-banana-2/edit' };
const MAIN = JSON.parse(readFileSync(join(__dirname, 'fixtures/produit-prepare-contexte-main.json'), 'utf8')) as Record<string, { prep: Record<string, unknown>; entree: Record<string, unknown> }>;

function epingler(position: number, precedente?: ReferenceProduitEpinglee): ReferenceProduitEpinglee {
  const r = epinglerProduit({ productId: ID_PRODUIT, photoId: ph[position - 1]!.assetId, composants: ['lunettes', 'bandeau'] }, { produit, photos: ph, variante: VARIANTE_UNIQUE }, T0, precedente);
  if (!r.ok) throw new Error(JSON.stringify(r.violations));
  return r.reference;
}
const ref = (f: FichierCatalogue, role: ReferenceBrief['role'], scope: ReferenceBrief['scope']): ReferenceBrief => ({ assetId: f.assetId, assetVersion: f.assetVersion, sha256: f.sha256, role, scope, allowedChanges: [], requiredComponents: [] });
const avecRefs = (refs: ReferenceBrief[]): BriefCanonique => ({ ...brief(), references: refs });
const prepDe = (p: ReferenceProduitEpinglee, refs: ReferenceBrief[], fichiers = catalogue(), referenceUnique = false) => controlerAvantCompilation({ mode: 'generative_scene', brief: avecRefs(refs), produit: p, fichiers, referenceUnique });
const fiche = (p: ReferenceProduitEpinglee, f: unknown, vues?: unknown) => {
  const r = definirFicheProduit(p, { fiche: f, vues }, [...ph, ...photosAutre()]);
  if (!r.ok) throw new Error(JSON.stringify(r.violations));
  return r.reference;
};
/** Images de bibliothèque en plus · pour remplir la borne de l'appel. */
const bibs = (n: number): FichierCatalogue[] => Array.from({ length: n }, (_, i) => {
  const sha = String(i + 1).repeat(64);
  return { ...fichierBib, assetId: idBibliotheque(`33333333-3333-4333-8333-33333333330${i}`), sha256: sha, assetVersion: versionDepuisEmpreinte(sha), libelle: `Décor ${i}` };
});

/** La chaîne réelle · consigne du modèle → contrôle → consigne finale → persistée → paramètres du job → corps fal. */
function corpsFal(p: ReferenceProduitEpinglee, refs: ReferenceBrief[], bindings: ConsigneImage['referenceBindings'], fichiers = catalogue()) {
  const b = avecRefs(refs);
  const prep = controlerAvantCompilation({ mode: 'generative_scene', brief: b, produit: p, fichiers });
  expect(prep.violations).toEqual([]);
  const modele: ConsigneImage = { generationInstruction: 'Coureur portant les lunettes et le bandeau, piste au lever du jour.', negativeConstraints: [], needsDeterministicOverlay: false, protectedComponents: ['lunettes', 'bandeau'], referenceBindings: bindings };
  expect(controlerSortieCompilation(modele, prep, fichiers, [source])).toEqual([]);
  const c = construireConsignePersistee({
    runId: 'run_produit_prepare', mode: 'generative_scene', sourceVersionId: 'ver_1', contenu: { brief: b as unknown as Record<string, unknown>, productRef: p as never },
    consigne: consigneFinale(modele, prep), referencesTransmises: prep.references, largeur: 1080, hauteur: 1350, compileeLe: T0,
  });
  if (!c.ok) throw new Error(c.violations.join(' · '));
  const urls = new Map<string, string>(ph.map((f, i) => [f.assetId, PHOTOS[i]!]));
  const medias: MediaResolu[] = c.consigne.references.map((r) => ({ assetId: r.assetId, etat: 'autorise', url: urls.get(r.assetId) ?? `https://cdn.test/${r.assetId}.png`, sha256: r.sha256 }));
  const q = requeteFalImage({ operations: ops, parametres: parametresDepuisConsigne(c.consigne), medias, modeles });
  if (!q.ok) throw new Error(q.motif);
  return { prep, envoyees: (q.expurge.image_urls as Array<{ assetId: string }>).map((x) => x.assetId), corps: q.corps as { image_urls: string[]; prompt: string } };
}

describe('vues · jusqu’à trois photos du MÊME produit, l’épinglée d’abord', () => {
  it('épinglée en 7 · les vues proposées reprennent au début (1, 2)', () => {
    expect(prepDe(epingler(7), [associationProduit(epingler(7))]).vuesProposees.map((v) => v.position)).toEqual([1, 2]);
  });

  it('par défaut · l’épinglée SEULE part ; les photos suivantes (6, 7) sont proposées, pas envoyées · aucune phrase « un seul article »', () => {
    const p = epingler(5);
    const r = corpsFal(p, [associationProduit(p), ref(fichierConcurrent, 'style', 'background')], [{ referenceId: fichierConcurrent.assetId, role: 'style', scope: 'background' }, { referenceId: p.photo.assetId, role: 'product', scope: 'product' }]);
    expect(r.prep.vuesProduit.map((v) => [v.position, v.origine])).toEqual([[5, 'epinglee']]);
    expect(r.prep.vuesProposees.map((v) => v.position)).toEqual([6, 7]);
    expect(r.envoyees.filter((id) => id.startsWith('pph_'))).toEqual([ph[4]!.assetId]);
    expect(r.prep.invariants.some((x) => x.includes('vues du même article'))).toBe(false);
    expect(r.corps.prompt).not.toContain('vues du même article');
  });

  it('choisies sur la fiche (6, 7) · l’épinglée (5) puis elles, dans cet ordre, liées par le serveur · « un seul article » au contexte ET au corps', () => {
    const p = fiche(epingler(5), null, [ph[5]!.assetId, ph[6]!.assetId]);
    // Le modèle n'a lié que l'épinglée et le style · le serveur lie les autres vues, en tête et dans l'ordre.
    const r = corpsFal(p, [associationProduit(p), ref(fichierConcurrent, 'style', 'background')], [{ referenceId: fichierConcurrent.assetId, role: 'style', scope: 'background' }, { referenceId: p.photo.assetId, role: 'product', scope: 'product' }]);
    expect(r.prep.vuesProduit.map((v) => [v.position, v.origine])).toEqual([[5, 'epinglee'], [6, 'choisie'], [7, 'choisie']]);
    expect(r.prep.vuesProposees).toEqual([]);
    expect(r.envoyees.slice(0, 3)).toEqual([ph[4]!.assetId, ph[5]!.assetId, ph[6]!.assetId]);
    expect(r.corps.image_urls.slice(0, 3)).toEqual([PHOTOS[4], PHOTOS[5], PHOTOS[6]]);
    const phrase = phraseUnSeulArticle(3);
    expect(phrase).toBe('Les photos produit 1 à 3 sont des vues du même article · un seul exemplaire à l’image, sauf le contenu d’achat déclaré.');
    expect(r.prep.invariants).toContain(phrase);
    expect(r.corps.prompt).toContain('les photos produit 1 à 3 sont des vues du même article · un seul exemplaire à l’image, sauf le contenu d’achat déclaré');
  });

  it('association Produit du brief vers une autre photo du produit (geste « Associer ») · c’est un choix, elle part', () => {
    const p = epingler(1);
    expect(prepDe(p, [associationProduit(p), ref(ph[3]!, 'product', 'product')]).vuesProduit.map((v) => [v.position, v.origine])).toEqual([[1, 'epinglee'], [4, 'choisie']]);
  });

  it('vues choisies sur la fiche · une association Produit du brief laissée de côté est DITE', () => {
    const p = fiche(epingler(1), null, [ph[2]!.assetId]);
    const x = prepDe(p, [associationProduit(p), ref(ph[3]!, 'product', 'product')]);
    expect(x.vuesProduit.map((v) => v.position)).toEqual([1, 3]);
    expect(x.avertissements).toContain('1 photo associée au rôle Produit dans le brief ne part pas · la fiche choisit les vues envoyées.');
  });

  it('modèle routé à image unique (Flux, Kontext) · retombe sur l’épinglée seule, et le dit · le brief qui passait passe encore', () => {
    const p = fiche(epingler(1), null, [ph[1]!.assetId, ph[2]!.assetId]);
    const x = prepDe(p, [associationProduit(p)], catalogue(), true);
    expect(x.ok).toBe(true);
    expect(x.vuesProduit.map((v) => v.position)).toEqual([1]);
    expect(x.avertissements).toContain('Le modèle d’images routé ne reçoit qu’une image de départ · seule la photo épinglée part, les 2 autres vues attendent un modèle multi-références.');
    const finale = consigneFinale({ generationInstruction: 'x', negativeConstraints: [], referenceBindings: [], protectedComponents: ['lunettes', 'bandeau'], needsDeterministicOverlay: false }, x);
    const c = construireConsignePersistee({ runId: 'r', mode: 'generative_scene', sourceVersionId: 'v', contenu: { brief: avecRefs([associationProduit(p)]) as never, productRef: p as never }, consigne: finale, referencesTransmises: x.references, largeur: 1080, hauteur: 1350, compileeLe: T0 });
    if (!c.ok) throw new Error(c.violations.join(' · '));
    const q = requeteFalImage({ operations: ops, parametres: parametresDepuisConsigne(c.consigne), medias: [{ assetId: p.photo.assetId, etat: 'autorise', url: PHOTOS[0]!, sha256: p.photo.sha256 }], modeles: { generation: 'fal-ai/flux/dev', edition: 'fal-ai/flux-pro/kontext' } });
    expect(q.ok ? 'passe' : q.motif).toBe('passe');
  });

  it('vues choisies · l’ordre de la personne, puis rien d’autre ; liste vide = l’épinglée seule', () => {
    const p = fiche(epingler(1), null, [ph[3]!.assetId, ph[1]!.assetId]);
    const r = corpsFal(p, [associationProduit(p)], [{ referenceId: p.photo.assetId, role: 'product', scope: 'product' }]);
    expect(r.envoyees).toEqual([ph[0]!.assetId, ph[3]!.assetId, ph[1]!.assetId]);
    expect(r.prep.vuesProduit.map((v) => v.origine)).toEqual(['epinglee', 'choisie', 'choisie']);
    const seule = fiche(epingler(1), null, []);
    expect(corpsFal(seule, [associationProduit(seule)], []).envoyees).toEqual([ph[0]!.assetId]);
  });

  it('jamais une vue d’un autre produit · ni par le choix, ni par une association Produit du brief, ni par défaut', () => {
    const p = epingler(1);
    expect(definirFicheProduit(p, { fiche: null, vues: [photosAutre()[0]!.assetId] }, [...ph, ...photosAutre()]))
      .toEqual({ ok: false, violations: [{ chemin: 'vues', raison: 'une vue est une autre photo de CE produit · jamais celle d’un autre produit' }] });
    // Une liste altérée hors de l'écran (vue d'un autre produit) ne part pas, et c'est dit.
    const altere = { ...p, vuesChoisies: [photosAutre()[0]!.assetId, ph[2]!.assetId] };
    const a = prepDe(altere, [associationProduit(altere)]);
    expect(a.vuesProduit.map((v) => v.assetId)).toEqual([ph[0]!.assetId, ph[2]!.assetId]);
    expect(a.avertissements).toContain('1 vue choisie absente du catalogue de ce produit · non envoyée, aucune autre photo ne la remplace.');
    // Une association Produit vers la photo d'un autre produit : refusée ET jamais transmise.
    const b = prepDe(p, [associationProduit(p), ref(photosAutre()[0]!, 'product', 'product')]);
    expect(b.ok).toBe(false);
    expect(b.references.map((r) => r.assetId)).not.toContain(photosAutre()[0]!.assetId);
    // Aucune référence transmise n'est une photo d'un autre produit.
    const fichiers = catalogue();
    for (const x of [a, b, prepDe(p, [associationProduit(p)])]) {
      expect(x.references.filter((r) => fichiers.get(r.assetId)?.provenance === 'produit' && fichiers.get(r.assetId)?.productId !== ID_PRODUIT)).toEqual([]);
    }
  });

  it(`borne de ${REFERENCES_PAR_APPEL_MAX} · les autres références passent d’abord, les vues prennent la place qui reste, c’est dit`, () => {
    const p = fiche(epingler(1), null, [ph[1]!.assetId, ph[2]!.assetId]);
    const fichiers = new Map([...catalogue(), ...bibs(6).map((f) => [f.assetId, f] as const)]);
    const autres = (n: number) => [ref(fichierLogo, 'logo', 'global'), ...bibs(n - 1).map((f) => ref(f, 'composition', 'global'))];
    const lier = (refs: ReferenceBrief[]) => refs.map((r) => ({ referenceId: r.assetId, role: r.role, scope: r.scope }));
    for (const [n, vues] of [[5, 3], [6, 2], [7, 1]] as const) {
      const refs = [associationProduit(p), ...autres(n)];
      const r = corpsFal(p, refs, lier(refs), fichiers);
      expect(r.envoyees.length, `${n} autres références`).toBeLessThanOrEqual(REFERENCES_PAR_APPEL_MAX);
      expect(r.envoyees.slice(0, vues)).toEqual(ph.slice(0, vues).map((f) => f.assetId));
      expect(r.prep.vuesProduit).toHaveLength(vues);
    }
    expect(prepDe(p, [associationProduit(p), ...autres(7)], fichiers).avertissements)
      .toContain(`Borne de ${REFERENCES_PAR_APPEL_MAX} références par appel · 2 vues du produit non envoyées (7 autres références du brief passent d’abord).`);
  });

  it(`${VUES_PRODUIT_MAX} au plus · une troisième vue choisie est refusée à l’écriture, et l’écran dit pourquoi`, () => {
    expect(definirFicheProduit(epingler(1), { fiche: null, vues: [ph[1]!.assetId, ph[2]!.assetId, ph[3]!.assetId] }, ph))
      .toMatchObject({ ok: false, violations: [{ chemin: 'vues', raison: '2 vues au plus en plus de la photo épinglée' }] });
    expect(raisonVue({ peutModifier: true, choisie: false, nombreChoisies: 2 })).toBe('2 vues au plus en plus de la photo épinglée · retires-en une pour en choisir une autre.');
    expect(raisonVue({ peutModifier: true, choisie: true, nombreChoisies: 2 })).toBeNull();
  });

  it('changer de photo épinglée du même produit garde la fiche et les vues (sans la nouvelle épinglée) ; autre produit, rien', () => {
    const p = fiche(epingler(1), { tailleReelle: '17 cm de large', echelle: 'main', echelleDetail: 'plus large que la paume' }, [ph[2]!.assetId, ph[3]!.assetId]);
    const q = epingler(3, p);
    expect([q.photo.position, q.fiche?.tailleReelle, q.vuesChoisies]).toEqual([3, '17 cm de large', [ph[3]!.assetId]]);
    const autre = epinglerProduit({ productId: autreProduit.id, photoId: photosAutre()[0]!.assetId }, { produit: autreProduit, photos: photosAutre(), variante: VARIANTE_UNIQUE }, T0, p);
    expect(autre.ok && [autre.reference.fiche, autre.reference.vuesChoisies]).toEqual([undefined, undefined]);
  });
});

describe('fiche · saisie par la personne, injectée comme attributs immuables de image.compile', () => {
  const remplie = { tailleReelle: '12 cm de haut, 4 cm de diamètre', echelle: 'main', echelleDetail: 'tient dans la paume', nonMontre: 'le dos porte la liste des ingrédients en blanc', contenuAchat: '1 flacon de 50 ml et sa pipette', emballage: 'boîte en carton blanc' };
  const ATTENDUS = [
    'Taille réelle du produit : 12 cm de haut, 4 cm de diamètre · comparée à une main : tient dans la paume. Garder cette échelle face à toute main, personne ou objet de la scène · ni agrandi, ni rapetissé.',
    'Ce que les photos du produit ne montrent pas : le dos porte la liste des ingrédients en blanc. Si cette partie paraît, elle suit cette description · rien d’autre n’est inventé.',
    'Ce qu’un achat contient : 1 flacon de 50 ml et sa pipette. Montrer au plus ce contenu · jamais un article en plus.',
    'Emballage : boîte en carton blanc. Il fait partie du produit, ce n’est pas un autre produit · jamais présenté comme un second article ni dédoublé.',
  ];

  it('chaque champ rempli devient UN invariant, après les attributs immuables et avant les composants · jusque dans l’entrée de la tâche', () => {
    const p = fiche(epingler(1), remplie);
    const prep = prepDe(p, [associationProduit(p)]);
    const i = prep.invariants;
    const debut = i.indexOf(ATTENDUS[0]!);
    expect(i.slice(debut, debut + 4)).toEqual(ATTENDUS);
    expect(i[debut - 1]).toBe(p.attributsImmuables[p.attributsImmuables.length - 1]);
    expect(i[debut + 4]).toBe('Composant obligatoire visible : lunettes');
    const entree = entreeCompilation({ prep, brief: avecRefs([associationProduit(p)]), versionId: 'ver_1', mode: 'generative_scene', largeur: 1080, hauteur: 1350 });
    expect(entree.invariants).toEqual(expect.arrayContaining(ATTENDUS));
  });

  it('repère · un objet courant est nommé dans l’attribut ; une personne aussi', () => {
    const objet = validerFicheProduit({ tailleReelle: '33 cm', echelle: 'objet', echelleDetail: 'une canette de 33 cl' });
    expect(objet.ok && attributsFiche(objet.fiche)).toEqual(['Taille réelle du produit : 33 cm · comparée à un objet courant : une canette de 33 cl. Garder cette échelle face à toute main, personne ou objet de la scène · ni agrandi, ni rapetissé.']);
    const r = validerFicheProduit({ tailleReelle: '1,80 m', echelle: 'personne' });
    expect(r.ok && attributsFiche(r.fiche)[0]).toBe('Taille réelle du produit : 1,80 m · comparée à une personne. Garder cette échelle face à toute main, personne ou objet de la scène · ni agrandi, ni rapetissé.');
  });

  it('refus nommés · taille sans repère, repère sans taille, objet sans nom, texte trop long ; et l’écran les dit à côté du bouton', () => {
    const raisons = (x: unknown) => { const r = validerFicheProduit(x); return r.ok ? [] : r.violations.map((v) => v.raison); };
    expect(raisons({ tailleReelle: '12 cm' })).toEqual(['choisis à quoi comparer la taille réelle : une main, une personne ou un objet courant']);
    expect(raisons({ echelle: 'main' })).toEqual(['écris la taille réelle à comparer (ex. 12 cm de haut)']);
    expect(raisons({ tailleReelle: '33 cm', echelle: 'objet' })).toEqual(['nomme l’objet courant (ex. une canette de 33 cl)']);
    expect(raisons({ nonMontre: 'x'.repeat(301) })).toEqual(['300 caractères au plus']);
    expect(raisons({ echelle: 'geant', tailleReelle: '2 m' })).toContain('repère de taille inconnu · une main, une personne ou un objet courant');
    expect(raisonFiche({ peutModifier: true, fiche: { tailleReelle: '12 cm' } })).toBe('choisis à quoi comparer la taille réelle : une main, une personne ou un objet courant');
    expect(raisonFiche({ peutModifier: false, fiche: remplie })).toBe('Ton rôle permet de consulter, pas de modifier la fiche.');
    expect(raisonFiche({ peutModifier: true, fiche: remplie })).toBeNull();
  });

  it('emplacement de gabarit refusé à l’écriture (« {{ », « }} », « ${ »)', () => {
    for (const t of ['{{marque}}', 'fin }}', 'prix ${x}']) {
      const r = validerFicheProduit({ nonMontre: t });
      expect(r.ok ? [] : r.violations.map((v) => v.raison), t).toEqual(['pas d’accolades doubles ni de « ${ » · ce sont des emplacements de gabarit']);
    }
  });

  it('changer de produit épinglé · l’écran prévient que la fiche part, seulement si elle n’est pas vide', () => {
    const p = fiche(epingler(1), remplie);
    expect(raisonFicheRetiree({ epingle: p, produitChoisi: autreProduit.id })).toBe('La fiche de « Lunettes Sport Bandeau » sera retirée de ce projet.');
    expect(raisonFicheRetiree({ epingle: p, produitChoisi: ID_PRODUIT })).toBeNull();
    expect(raisonFicheRetiree({ epingle: epingler(1), produitChoisi: autreProduit.id })).toBeNull();
    expect(raisonFicheRetiree({ epingle: null, produitChoisi: autreProduit.id })).toBeNull();
  });

  it('vues modifiées à l’écran et pas encore enregistrées · dit', () => {
    expect(vuesModifiees(null, { choix: false, vues: [] })).toBe(false);
    expect(vuesModifiees(null, { choix: true, vues: [] })).toBe(true);
    expect(vuesModifiees(['a', 'b'], { choix: true, vues: ['a', 'b'] })).toBe(false);
    expect(vuesModifiees(['a', 'b'], { choix: true, vues: ['b', 'a'] })).toBe(true);
    expect(vuesModifiees(['a'], { choix: false, vues: ['a'] })).toBe(true);
  });

  it('une fiche altérée hors de l’écran n’entre pas dans la consigne', () => {
    const p = { ...epingler(1), fiche: { tailleReelle: '12 cm', echelle: 'geant' } as never };
    expect(prepDe(p, [associationProduit(p)]).invariants.some((x) => x.startsWith('Taille réelle'))).toBe(false);
  });
});

describe('sans fiche remplie · le contexte de image.compile est celui de main (capture avant modification)', () => {
  const sansVues = (x: { prep: object }) => { const { vuesProduit: _v, vuesProposees: _p, ...reste } = x.prep as Record<string, unknown>; void _v; void _p; return reste; };
  const json = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

  it('une seule photo · préparation et entrée IDENTIQUES à main, fiche absente comme fiche vide', () => {
    const s = scenarios().find((x) => x.nom === 'une-photo')!;
    for (const p of [s.produit, fiche(s.produit, { tailleReelle: '', echelle: '', nonMontre: '  ', contenuAchat: '', emballage: '' }, null)]) {
      expect('fiche' in p).toBe(false);
      const c = json(contexteCompilation({ ...s, produit: p }));
      expect(sansVues(c)).toEqual(MAIN['une-photo']!.prep);
      expect(c.entree).toEqual(MAIN['une-photo']!.entree);
    }
  });

  it('sept photos · préparation et entrée IDENTIQUES à main (le défaut n’envoie que l’épinglée)', () => {
    for (const s of scenarios().filter((x) => x.nom !== 'une-photo')) {
      const c = json(contexteCompilation(s));
      expect(sansVues(c), s.nom).toEqual(MAIN[s.nom]!.prep);
      expect(c.entree, s.nom).toEqual(MAIN[s.nom]!.entree);
    }
  });
});
