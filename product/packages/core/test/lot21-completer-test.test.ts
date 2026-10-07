import { describe, it, expect } from 'vitest';
import {
  manquesAvantTest, saisieCompletude, champsACompleter, preremplissageProduit, lirePrix, lireUrlPage,
  presentationTest, texteHeritageIteration, texteAdIncomplete, VARIABLES_A_TESTER, STATUT_NON_COMPLETABLE,
  type AdACompleter, type ProduitMarque, type SaisieCompletude,
} from '../src';

/**
 * Lot 21 · « Compléter le test » (rupture R1, audit lot 20).
 *
 * Mesuré avant (bc33cec8) · aucune ad née dans l'outil ne pouvait atteindre
 * « prête » · aucune écriture d'hypothèse, de variable, d'offre ni de page sur
 * une ad existante. On vérifie ici le RÉSULTAT de la règle · ce que
 * `manquesAvantTest` (le contrat de la préparation d'un lot) dit de l'ad APRÈS
 * la saisie, et ce qui part à l'écriture.
 */

const brouillonVide: AdACompleter = { status: 'draft', adType: 'ideation', hypothesis: null, testedVariable: null, offerId: null, landingPageId: null };
const serum: ProduitMarque = { id: 'p-serum', nom: 'Sérum Neva', prix: 29.9, url: 'https://neva.example/serum' };
const sansUrl: ProduitMarque = { id: 'p-baume', nom: 'Baume Neva', prix: 19, url: null };
const PRODUITS = [serum, sansUrl];

/** La saisie complète d'un utilisateur · valeurs préremplies depuis le produit, puis CONFIRMÉES. */
const saisieComplete = (p: ProduitMarque): SaisieCompletude => {
  const pre = preremplissageProduit(p);
  return {
    hypothesis: 'Une preuve chiffrée en ouverture fera passer le hook rate de 22 % à 28 %.',
    testedVariable: 'hook',
    produitId: p.id,
    offre: { prix: pre.prix, confirmee: true },
    page: { url: pre.url, confirmee: true },
  };
};

/** L'ad telle qu'elle sera en base après l'écriture (ids posés par le serveur). */
function adApres(ad: AdACompleter, r: Extract<ReturnType<typeof saisieCompletude>, { ok: true }>) {
  return {
    adType: ad.adType,
    hypothesis: r.maj.hypothesis ?? ad.hypothesis,
    testedVariable: (r.maj.testedVariable ?? ad.testedVariable) as never,
    offerId: r.offre ? 'offre-créée' : ad.offerId,
    landingPageId: r.page ? 'page-créée' : ad.landingPageId,
  };
}

describe('Compléter le test · le contrat de préparation est satisfait par la saisie', () => {
  it('brouillon vide + produit {prix, url} + valeurs confirmées + hypothèse + variable → plus rien ne manque', () => {
    const r = saisieCompletude(brouillonVide, saisieComplete(serum), PRODUITS);
    if (!r.ok) throw new Error(r.erreur);
    expect(manquesAvantTest(adApres(brouillonVide, r)), 'l’ad complétée ne passerait pas « Préparer »').toEqual([]);
    expect(r.manquesApres).toEqual([]);
    expect(r.offre, 'l’offre du produit n’est pas dérivée du produit choisi').toEqual({ label: 'Sérum Neva', price: 29.9 });
    expect(r.page).toEqual({ url: 'https://neva.example/serum', label: 'Sérum Neva', pageType: 'pdp' });
    expect(r.maj, 'la saisie écrit le statut · seule « Préparer » y a droit').not.toHaveProperty('status');
  });

  it('produit sans URL → « la page de destination » reste un manque dit, jamais un faux succès', () => {
    const s = saisieComplete(sansUrl);
    expect(s.page!.url, 'repli silencieux sur une URL').toBe('');
    // L'utilisateur ne peut pas confirmer une page vide · il confirme le reste.
    const r = saisieCompletude(brouillonVide, { ...s, page: { url: '', confirmee: false } }, PRODUITS);
    if (!r.ok) throw new Error(r.erreur);
    expect(r.page).toBeNull();
    expect(manquesAvantTest(adApres(brouillonVide, r))).toEqual(['la page de destination']);
    expect(r.manquesApres).toEqual(['la page de destination']);
    // Confirmer une page sans adresse est refusé, pas « réussi ».
    const vide = saisieCompletude(brouillonVide, { ...s, page: { url: '', confirmee: true } }, PRODUITS);
    expect(vide).toEqual({ ok: false, erreur: 'Aucune adresse à confirmer · la page de destination reste à compléter.' });
  });

  it('valeur non confirmée → aucune offre ni page proposée à l’écriture', () => {
    const s = saisieComplete(serum);
    const r = saisieCompletude(brouillonVide, { ...s, offre: { ...s.offre!, confirmee: false }, page: { ...s.page!, confirmee: false } }, PRODUITS);
    if (!r.ok) throw new Error(r.erreur);
    expect(r.offre, 'une offre part à l’écriture sans confirmation').toBeNull();
    expect(r.page, 'une page part à l’écriture sans confirmation').toBeNull();
    expect(r.manquesApres).toEqual(['l’offre', 'la page de destination']);
  });

  it('le témoin n’est pas une variable testée · refusé, et absent de la liste proposée', () => {
    const r = saisieCompletude(brouillonVide, { ...saisieComplete(serum), testedVariable: 'none_control' }, PRODUITS);
    expect(r, 'le témoin passe pour une variable testée').toEqual({ ok: false, erreur: 'Le témoin n’est pas une variable testée · choisis ce que cette ad change.' });
    expect(VARIABLES_A_TESTER.map((v) => v.valeur)).not.toContain('none_control');
    expect(VARIABLES_A_TESTER.find((v) => v.valeur === 'offer')?.libelle, '« offre » sans contexte à l’écran').toBe('Offre du produit (prix, remise, garantie)');
  });

  it('l’hypothèse n’est jamais préremplie · le préremplissage ne rend que prix et URL', () => {
    const pre = preremplissageProduit(serum) as Record<string, unknown>;
    expect(Object.keys(pre).sort()).toEqual(['prix', 'url']);
    expect(pre.prix).toBe('29,90');
    expect(preremplissageProduit({ ...serum, prix: null }).prix, 'un prix est inventé').toBe('');
  });

  it('un produit d’une autre marque (absent de la liste lue au serveur) est refusé', () => {
    const r = saisieCompletude(brouillonVide, { ...saisieComplete(serum), produitId: 'p-autre-marque' }, PRODUITS);
    expect(r).toEqual({ ok: false, erreur: 'Choisis le produit vendu dans la pub · il doit appartenir à la marque active.' });
  });

  it('une ad prête, en test ou close ne se complète pas', () => {
    for (const status of ['ready', 'live', 'paused', 'done']) {
      expect(saisieCompletude({ ...brouillonVide, status }, saisieComplete(serum), PRODUITS)).toEqual({ ok: false, erreur: STATUT_NON_COMPLETABLE });
    }
    const prop = saisieCompletude({ ...brouillonVide, status: 'proposed' }, saisieComplete(serum), PRODUITS);
    expect(prop.ok).toBe(true);
  });

  it('validation · hypothèse trop courte, prix non numérique ou négatif, URL non http(s)', () => {
    const s = saisieComplete(serum);
    expect(saisieCompletude(brouillonVide, { ...s, hypothesis: 'ok' }, PRODUITS).ok).toBe(false);
    expect(lirePrix('abc').ok).toBe(false);
    expect(lirePrix('-3').ok).toBe(false);
    expect(lirePrix('1 299,5 €')).toEqual({ ok: true, prix: 1299.5 });
    expect(lirePrix('')).toEqual({ ok: true, prix: null });
    expect(lireUrlPage('javascript:alert(1)').ok).toBe(false);
    expect(lireUrlPage('ftp://neva.example').ok).toBe(false);
    expect(saisieCompletude(brouillonVide, { ...s, offre: { prix: 'gratuit', confirmee: true } }, PRODUITS).ok).toBe(false);
  });

  it('seuls les champs manquants s’écrivent · un nouvel essai après une réponse perdue ne réécrit rien', () => {
    const complet: AdACompleter = { ...brouillonVide, hypothesis: 'Déjà posée en base, depuis longtemps.', testedVariable: 'hook', offerId: 'o', landingPageId: 'l' };
    const r = saisieCompletude(complet, saisieComplete(serum), PRODUITS);
    if (!r.ok) throw new Error(r.erreur);
    expect(r).toMatchObject({ maj: {}, offre: null, page: null, manquesApres: [], dejaEnregistre: true });
    expect(saisieCompletude(brouillonVide, {}, PRODUITS).ok, 'une saisie vide passe pour un succès').toBe(false);
  });

  it('les champs montrés sont exactement les manques', () => {
    expect(champsACompleter(['l’offre', 'la page de destination'])).toEqual({ hypothese: false, variable: false, offre: true, page: true });
  });
});

describe('Le tiroir · prochaine étape « Compléter le test » au lieu d’une impasse', () => {
  const base = { status: 'draft', launchedAt: null, computed: null, verdictStatus: null, batchNumber: null, apprentissages: 0 } as const;
  it('ad incomplète en brouillon · le formulaire est la prochaine étape, le texte y mène', () => {
    const p = presentationTest({ ...base, manques: ['l’offre'] }, { peutPreparer: false, peutMesurer: false });
    expect(p.prochaineEtape?.completer, 'impasse · aucune façon de compléter').toEqual({ titre: 'Compléter le test', ancre: 'completer-test' });
    expect(p.prochaineEtape?.texte).toBe(texteAdIncomplete(['l’offre']));
    expect(p.prochaineEtape?.texte).not.toContain('ne se saisissent pas encore');
    expect(p.prochaineEtape?.lien, 'la boucle Lots ↔ fiche revient').toBeNull();
  });
  it('ad complète · pas de formulaire', () => {
    expect(presentationTest({ ...base, manques: [] }, { peutPreparer: true, peutMesurer: true }).prochaineEtape?.completer ?? null).toBeNull();
  });
});

describe('Ligne 437 · l’itération dit ce dont elle hérite VRAIMENT', () => {
  it('parent sans offre ni page · elle ne promet pas d’héritage', () => {
    const t = texteHeritageIteration(['l’offre', 'la page de destination']);
    expect(t).not.toContain('héritées');
    expect(t).toContain('sans offre ni page de destination');
  });
  it('parent complet · elle reprend l’offre et la page de cette ad', () => {
    expect(texteHeritageIteration([])).toContain('avec l’offre et la page de destination de cette ad');
  });
  it('parent avec offre, sans page · la page reste à compléter', () => {
    expect(texteHeritageIteration(['la page de destination'])).toContain('la page de destination restera à compléter');
  });
});
