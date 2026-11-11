import { describe, expect, it } from 'vitest';
import {
  RACCOURCIS, PORTEES_RACCOURCIS, TOUCHES_RECENSEES, REGLES_CLAVIER, PREFERENCES_TOUCHES_DEFAUT, EVENEMENT_PREFERENCE_RACCOURCIS,
  RAISON_ITERER_TEST_HORS_PLAN, RAISON_ITERER_TEST_SANS_GAGNANTE, RAISON_TEST_HORS_LOT,
  accordAria, conflitsRaccourcis, deplacementListe, estPlateformeMac, exigeCoupure, gestesClavierTest, lienIterationVariable, lienLotSpatial,
  messageBorneListeLots, messageRaccourciFerme, raccourciDeLaFrappe, raccourciFicheLot, raccourciFicheTest, raccourciListeLots, sansTiretCadratin,
  toucheVisible, groupesAideRaccourcis,
  type ContexteFrappeVue, type FrappeClavier, type Raccourci,
} from '../src';

/**
 * Lot 13 ter V5 · des raccourcis qu'on VOIT, et qui servent à itérer partout · pur.
 *  · `toucheVisible` · la touche dessinée et `aria-keyshortcuts` LUS dans la
 *    table · rien de promis quand les raccourcis à une touche sont coupés,
 *    Ctrl K / ⌘ K et les flèches restent ;
 *  · la portée « fiche-test » (T, L) et « liste-lots » (↓ ↑) · sans conflit, et
 *    les touches écartées le sont PAR la garde (J · le tiroir Jarvis) ;
 *  · `gestesClavierTest` · ce que T et L ouvrent, la même règle que la fiche d'un lot ;
 *  · `deplacementListe` · l'ordre de la liste, les bornes dites.
 * Le rendu (vraies vues, jsdom, base pglite) est prouvé côté web
 * (`lot13t-raccourcis-visibles-rendu.test.tsx`, `lot13t-raccourcis-test-db.test.tsx`).
 */

const VUE: ContexteFrappeVue = { actifs: true, modaleOuverte: false, cible: { tagName: 'BODY' } };
const idTest = (key: string, o: Partial<FrappeClavier> = {}, c: Partial<ContexteFrappeVue> = {}) => raccourciFicheTest({ key, ...o }, { ...VUE, ...c })?.id ?? null;
const idListe = (key: string, o: Partial<FrappeClavier> = {}, c: Partial<ContexteFrappeVue> = {}) => raccourciListeLots({ key, ...o }, { ...VUE, cible: { tagName: 'A' }, ...c })?.id ?? null;
const entree = (id: string) => RACCOURCIS.find((r) => r.id === id)!;

describe('Lot 13 ter · les nouvelles portées · dans la table, sans conflit', () => {
  it('la table entière · aucune collision (une touche de vue ne termine pas une séquence G de la coquille)', () => {
    expect(conflitsRaccourcis(), 'la table a un conflit').toEqual([]);
  });

  it('« fiche-test » (T, L) et « liste-lots » (↓ ↑) · gérées par leur vue, recensées, sans conflit', () => {
    expect(RACCOURCIS.filter((r) => r.portee === 'fiche-test').map((r) => [r.id, r.touches])).toEqual([['test-iterer', [['t']]], ['test-lot', [['l']]]]);
    expect(RACCOURCIS.filter((r) => r.portee === 'liste-lots').map((r) => [r.id, r.touches, !!r.surFocus])).toEqual([['liste-lot-suivant', [['ArrowDown']], true], ['liste-lot-precedent', [['ArrowUp']], true]]);
    expect(PORTEES_RACCOURCIS.filter((p) => p.cle === 'fiche-test' || p.cle === 'liste-lots')).toEqual([
      { cle: 'fiche-test', libelle: 'Fiche d’un test (Résultats)', globale: false },
      { cle: 'liste-lots', libelle: 'Liste des lots (Résultats)', globale: false },
    ]);
    expect(conflitsRaccourcis(), 'la table a un conflit').toEqual([]);
    for (const r of RACCOURCIS.filter((x) => x.portee === 'fiche-test' || x.portee === 'liste-lots')) {
      expect(r.action, r.id).toBeNull();
      expect(sansTiretCadratin(r.libelle)).toBe(r.libelle);
    }
    expect(RACCOURCIS.filter((r) => r.portee === 'fiche-test').every(exigeCoupure), 'T et L sont des lettres seules · coupables (WCAG 2.1.4)').toBe(true);
    expect(RACCOURCIS.filter((r) => r.portee === 'liste-lots').some(exigeCoupure), '↓ ↑ ne sont pas des caractères · rien à couper').toBe(false);
    expect(TOUCHES_RECENSEES['vues/resultats/RaccourcisTest.tsx']).toEqual(['l', 't']);
    expect(TOUCHES_RECENSEES['vues/resultats/Lots.tsx']).toEqual(['ArrowDown', 'ArrowUp']);
    expect(REGLES_CLAVIER.raccourciFicheTest).toEqual(['l', 't']);
    expect(REGLES_CLAVIER.raccourciListeLots).toEqual(['ArrowDown', 'ArrowUp']);
    // L'aide « ? » les liste (même table).
    expect(groupesAideRaccourcis().find((g) => g.portee === 'fiche-test')?.lignes.map((l) => l.sequences)).toEqual([[[['T']]], [[['L']]]]);
    expect(groupesAideRaccourcis().find((g) => g.portee === 'liste-lots')?.lignes.map((l) => l.sequences)).toEqual([[[['↓']]], [[['↑']]]]);
  });

  it('la garde tranche · J refusé (tiroir Jarvis, global) pour la liste · ↓ ↑ passent · T et L passent, R I N J ? [ et les fins de « G puis » non', () => {
    // La liste · une paire candidate à la place de ↓ ↑.
    const liste = (a: string, b: string) => conflitsRaccourcis(RACCOURCIS.map((r) => (r.id === 'liste-lot-suivant' ? { ...r, touches: [[a]] } : r.id === 'liste-lot-precedent' ? { ...r, touches: [[b]] } : r)));
    expect(liste('j', 'k'), 'J ne heurte pas le tiroir Jarvis').toContainEqual({ a: 'jarvis', b: 'liste-lot-suivant', touches: 'j', raison: 'mêmes touches, portées « partout » et « liste-lots »' });
    expect(liste('j', 'k'), 'J ne heurte pas « G puis J »').toContainEqual({ a: 'liste-lot-suivant', b: 'aller-jarvis', touches: 'j', raison: 'touche de vue qui termine une séquence de la coquille' });
    expect(liste('j', 'k').every((c) => c.touches === 'j'), 'K seul passerait · seule J tombe').toBe(true);
    expect(liste('ArrowDown', 'ArrowUp')).toEqual([]);
    // La fiche d'un test · une touche candidate pour « Voir son lot ».
    const test = (t: string) => conflitsRaccourcis(RACCOURCIS.map((r) => (r.id === 'test-lot' ? { ...r, touches: [[t]] } : r)));
    expect(test('r'), 'R ne heurte pas « G puis R »').toContainEqual({ a: 'test-lot', b: 'aller-resultats', touches: 'r', raison: 'touche de vue qui termine une séquence de la coquille' });
    expect(test('t'), 'deux entrées de la fiche à la même touche').toContainEqual({ a: 'test-iterer', b: 'test-lot', touches: 't', raison: 'mêmes touches, portées « fiche-test » et « fiche-test »' });
    for (const t of ['i', 'n', 'j', '?', '[', 'g', 'a', 's', 'v', 'b', 'm']) expect(test(t).length, `« ${t} » passe la garde`).toBeGreaterThan(0);
    for (const t of ['l', 'c', 'e', 'x']) expect(test(t), `« ${t} » refusée à tort`).toEqual([]);
    // T sur la fiche d'un test et T sur la fiche d'un lot · deux écrans distincts, le même geste · aucun conflit.
    expect(RACCOURCIS.filter((r) => r.touches.some((s) => s.length === 1 && s[0] === 't')).map((r) => r.portee)).toEqual(['fiche-lot', 'fiche-test']);
  });
});

describe('Lot 13 ter · `raccourciFicheTest` · mêmes refus qu’une vue', () => {
  it('T et L partent, majuscule verrouillée comprise · ni la coquille ni la fiche d’un lot ne les prennent', () => {
    expect(idTest('t')).toBe('test-iterer');
    expect(idTest('l')).toBe('test-lot');
    expect(idTest('T')).toBe('test-iterer');
    expect(idTest('L')).toBe('test-lot');
    expect(idTest('c'), 'C reste à la fiche d’un lot').toBeNull();
    expect(raccourciFicheLot({ key: 'l' }, VUE)).toBeNull();
    for (const k of ['t', 'l']) expect(raccourciDeLaFrappe({ key: k }, { ...VUE, prefixe: null, maintenant: 0 }).raccourci, k).toBeNull();
  });
  it('jamais dans un champ, une zone éditable, un lecteur, sous une fenêtre modale, ni coupés', () => {
    for (const cible of [{ tagName: 'INPUT' }, { tagName: 'TEXTAREA' }, { tagName: 'SELECT' }, { tagName: 'DIV', editable: true }, { tagName: 'BUTTON', dansLecteur: true }, { tagName: 'DIV', role: 'textbox' }]) {
      expect(idTest('t', {}, { cible }), JSON.stringify(cible)).toBeNull();
      expect(idTest('l', {}, { cible }), JSON.stringify(cible)).toBeNull();
    }
    expect(idTest('t', {}, { modaleOuverte: true })).toBeNull();
    expect(idTest('t', {}, { actifs: false })).toBeNull();
    expect(idTest('l', {}, { actifs: false })).toBeNull();
  });
  it('jamais avec un modificateur (⌘ T, Ctrl L, Alt, Maj), une répétition, une frappe déjà prise', () => {
    expect(idTest('t', { metaKey: true }), '⌘ T · nouvel onglet').toBeNull();
    expect(idTest('l', { ctrlKey: true }), 'Ctrl L · barre d’adresse').toBeNull();
    expect(idTest('l', { altKey: true })).toBeNull();
    expect(idTest('L', { shiftKey: true })).toBeNull();
    expect(idTest('t', { repetee: true })).toBeNull();
    expect(idTest('t', { dejaTraitee: true })).toBeNull();
  });
  it('le message d’un geste fermé · le libellé de la table, puis la raison', () => {
    expect(messageRaccourciFerme(entree('test-lot'), RAISON_TEST_HORS_LOT)).toBe(`Voir son lot · ${RAISON_TEST_HORS_LOT}`);
  });
});

describe('Lot 13 ter · `raccourciListeLots` · ↓ ↑ sur un lot de la liste', () => {
  it('↓ suivant, ↑ précédent · rien d’autre · ni coupés par la préférence (flèches, sur le focus)', () => {
    expect(idListe('ArrowDown')).toBe('liste-lot-suivant');
    expect(idListe('ArrowUp')).toBe('liste-lot-precedent');
    expect(idListe('ArrowDown', {}, { actifs: false }), 'une flèche n’est pas un raccourci à une touche').toBe('liste-lot-suivant');
    for (const k of ['j', 'k', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'Enter', ' ']) expect(idListe(k), k).toBeNull();
    expect(idListe('ArrowDown', { shiftKey: true }), 'Maj ↓ · sélection').toBeNull();
    expect(idListe('ArrowDown', { altKey: true })).toBeNull();
    expect(idListe('ArrowDown', {}, { cible: { tagName: 'TEXTAREA' } }), 'dans un champ, la flèche est au champ').toBeNull();
    expect(raccourciDeLaFrappe({ key: 'ArrowDown' }, { ...VUE, prefixe: null, maintenant: 0 }).raccourci, 'la coquille ne prend pas les flèches').toBeNull();
  });
  it('l’ordre de la liste, sans boucler · au bord le focus reste et la borne est dite', () => {
    expect(deplacementListe(0, 3, 1)).toEqual({ index: 1, borne: null });
    expect(deplacementListe(1, 3, 1)).toEqual({ index: 2, borne: null });
    expect(deplacementListe(2, 3, 1)).toEqual({ index: 2, borne: 'dernier' });
    expect(deplacementListe(2, 3, -1)).toEqual({ index: 1, borne: null });
    expect(deplacementListe(0, 3, -1)).toEqual({ index: 0, borne: 'premier' });
    expect(deplacementListe(0, 1, 1)).toEqual({ index: 0, borne: 'dernier' });
    expect(deplacementListe(-1, 3, 1)).toEqual({ index: 0, borne: null });
    expect(deplacementListe(-1, 3, -1)).toEqual({ index: 2, borne: null });
    expect(deplacementListe(0, 0, 1)).toEqual({ index: -1, borne: null });
    expect(messageBorneListeLots('premier', 4)).toBe('Premier lot de la liste · 1 sur 4');
    expect(messageBorneListeLots('dernier', 4)).toBe('Dernier lot de la liste · 4 sur 4');
    for (const m of [messageBorneListeLots('premier', 2), messageBorneListeLots('dernier', 2)]) expect(sansTiretCadratin(m)).toBe(m);
  });
});

/* ───────────── ce que T et L ouvrent ───────────── */

const AD = '00000001-0000-4000-8000-000000000000';
const LOT = '00000002-0000-4000-8000-000000000000';

describe('Lot 13 ter · `gestesClavierTest` · la règle de T sur un lot, rien de plus', () => {
  it('T · une gagnante ARBITRÉE que le plan propose · sinon la raison', () => {
    const plan = new Set([AD]);
    expect(gestesClavierTest({ adId: AD, gagnanteArbitree: true, planIds: plan, lot: null }).iterer).toEqual({ href: lienIterationVariable({ adId: AD }), raison: null });
    expect(gestesClavierTest({ adId: AD, gagnanteArbitree: true, planIds: new Set(), lot: null }).iterer, 'T ouvert hors du plan d’itération').toEqual({ href: null, raison: RAISON_ITERER_TEST_HORS_PLAN });
    expect(gestesClavierTest({ adId: AD, gagnanteArbitree: false, planIds: plan, lot: null }).iterer, 'pas arbitrée, ou perdante').toEqual({ href: null, raison: RAISON_ITERER_TEST_SANS_GAGNANTE });
    expect(lienIterationVariable({ adId: AD })).toBe(`/studio/iterer?iter=${AD}`);
  });
  it('L · la fiche du lot qui range le test · hors lot, la raison', () => {
    expect(gestesClavierTest({ adId: AD, gagnanteArbitree: false, planIds: new Set(), lot: { id: LOT, numero: 3 } }).lot).toEqual({ href: lienLotSpatial(LOT), numero: 3, raison: null });
    expect(gestesClavierTest({ adId: AD, gagnanteArbitree: true, planIds: new Set([AD]), lot: null }).lot).toEqual({ href: null, numero: null, raison: RAISON_TEST_HORS_LOT });
    for (const r of [RAISON_ITERER_TEST_HORS_PLAN, RAISON_ITERER_TEST_SANS_GAGNANTE, RAISON_TEST_HORS_LOT]) expect(sansTiretCadratin(r)).toBe(r);
  });
});

/* ───────────── les touches visibles ───────────── */

describe('Lot 13 ter · `toucheVisible` · la touche et `aria-keyshortcuts`, lus dans la table', () => {
  const ACTIFS = { actifs: true, mac: false };
  const COUPES = { actifs: false, mac: false };
  it('la recherche · Ctrl K, ⌘ K sur Mac · jamais coupée', () => {
    expect(toucheVisible('recherche', ACTIFS)).toEqual({ id: 'recherche', touches: ['Ctrl', 'K'], aria: 'Control+K' });
    expect(toucheVisible('recherche', { actifs: true, mac: true })).toEqual({ id: 'recherche', touches: ['⌘', 'K'], aria: 'Meta+K' });
    expect(toucheVisible('recherche', COUPES)?.aria, 'Ctrl K coupé à tort').toBe('Control+K');
    expect(toucheVisible('recherche', { actifs: false, mac: true })?.touches).toEqual(['⌘', 'K']);
    expect(PREFERENCES_TOUCHES_DEFAUT).toEqual(ACTIFS);
    expect(toucheVisible('recherche')?.aria, 'hors coquille · actifs, Ctrl').toBe('Control+K');
  });
  it('les touches simples · dessinées actives · RIEN coupées (ni touche, ni aria)', () => {
    const attendu: Record<string, [string, string]> = { jarvis: ['J', 'J'], aide: ['?', '?'], rail: ['[', '['], 'lot-conclure': ['C', 'C'], 'lot-iterer': ['T', 'T'], 'test-iterer': ['T', 'T'], 'test-lot': ['L', 'L'] };
    for (const [id, [touche, aria]] of Object.entries(attendu)) {
      expect(toucheVisible(id, ACTIFS), id).toEqual({ id, touches: [touche], aria });
      expect(toucheVisible(id, COUPES), `${id} · une touche coupée est encore promise`).toBeNull();
    }
  });
  it('les flèches (sur le focus) et les accords restent quand c’est coupé · une séquence « G puis » n’a pas d’aria · une entrée inconnue rien', () => {
    expect(toucheVisible('liste-lot-suivant', COUPES)).toEqual({ id: 'liste-lot-suivant', touches: ['↓'], aria: 'ArrowDown' });
    expect(toucheVisible('veille-precedente', COUPES)?.aria).toBe('ArrowLeft');
    expect(toucheVisible('editeur-zoom-plus', ACTIFS)).toEqual({ id: 'editeur-zoom-plus', touches: ['Ctrl', '+'], aria: 'Control+Plus Control+=' });
    expect(toucheVisible('editeur-zoom-moins', { actifs: true, mac: true })?.aria).toBe('Meta+- Meta+_');
    expect(toucheVisible('editeur-retablir', ACTIFS)?.aria).toBe('Control+Shift+Z Control+Y');
    expect(toucheVisible('canvas-zoom-plus', COUPES)?.aria, 'le canvas agit sur le focus · pas coupé').toBe('Plus =');
    expect(toucheVisible('aller-accueil', ACTIFS), 'G puis A · rien à mettre dans aria-keyshortcuts').toBeNull();
    expect(toucheVisible('inconnue', ACTIFS)).toBeNull();
  });
  it('lue dans la TABLE · une table changée change ce qui est dessiné', () => {
    const autre: Raccourci[] = RACCOURCIS.map((r) => (r.id === 'jarvis' ? { ...r, touches: [['h']] } : r));
    expect(toucheVisible('jarvis', ACTIFS, autre)).toEqual({ id: 'jarvis', touches: ['H'], aria: 'H' });
  });
  it('`accordAria` · modificateurs d’abord, Control ou Meta, Shift, Alt · Plus et Space nommés', () => {
    expect(accordAria('mod+k')).toBe('Control+K');
    expect(accordAria('mod+k', true)).toBe('Meta+K');
    expect(accordAria('mod+maj+z')).toBe('Control+Shift+Z');
    expect(accordAria('mod++')).toBe('Control+Plus');
    expect(accordAria('maj+ArrowLeft')).toBe('Shift+ArrowLeft');
    expect(accordAria('alt+x')).toBe('Alt+X');
    expect(accordAria(' ')).toBe('Space');
    expect(accordAria('Escape')).toBe('Escape');
    expect(accordAria('?')).toBe('?');
  });
  it('`estPlateformeMac` · l’indice client d’abord, sinon l’agent', () => {
    expect(estPlateformeMac({ plateforme: '"macOS"' })).toBe(true);
    expect(estPlateformeMac({ plateforme: '"iOS"' })).toBe(true);
    expect(estPlateformeMac({ plateforme: '"Windows"', agent: 'Macintosh' }), 'l’indice prime').toBe(false);
    expect(estPlateformeMac({ agent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5)' })).toBe(true);
    expect(estPlateformeMac({ agent: 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)' })).toBe(true);
    expect(estPlateformeMac({ agent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' })).toBe(false);
    expect(estPlateformeMac({ agent: 'Mozilla/5.0 (X11; Linux x86_64)' })).toBe(false);
    expect(estPlateformeMac({})).toBe(false);
    expect(EVENEMENT_PREFERENCE_RACCOURCIS).toBe('tt-raccourcis');
  });
});
