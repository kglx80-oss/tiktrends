import { describe, expect, it } from 'vitest';
import {
  RACCOURCIS, PORTEES_RACCOURCIS, TOUCHES_RECENSEES, REGLES_CLAVIER, TOUCHES_DE_COMPOSANT, DELAI_SEQUENCE_MS,
  accordDeLaFrappe, accordUneTouche, exigeCoupure, raccourciDeLaFrappe, conflitsRaccourcis, porteesSeRecouvrent,
  groupesAideRaccourcis, touchesAffichees, toucheDeLAccord, cibleDeSaisie,
  raccourcisActifs, raccourcisActifsDepuisCookie, raccourcisCookieString, valeurCookie, RACCOURCIS_COOKIE,
  toucheNavigationDetail, raccourciZoom, focusMenuSuivant, raccourciFicheLot, raccourciFicheTest, raccourciListeLots, sansTiretCadratin,
  type ContexteFrappe, type FrappeClavier, type Raccourci,
} from '../src';

/**
 * Lot 13 V5 · la table des raccourcis · doublons, conflits, portées, coupure
 * (WCAG 2.1.4), et la règle de l'écouteur de la coquille, sur une horloge
 * simulée. Le rendu (coquille réelle, aide, focus) est prouvé côté web
 * (`apps/web/test/lot13-raccourcis-rendu.test.tsx`), le recensement du code
 * aussi (`lot13-raccourcis-recensement.test.ts`).
 */

const CTX: ContexteFrappe = { actifs: true, modaleOuverte: false, cible: { tagName: 'BODY' }, prefixe: null, maintenant: 10_000 };
const frappe = (key: string, o: Partial<FrappeClavier> = {}, c: Partial<ContexteFrappe> = {}) => raccourciDeLaFrappe({ key, ...o }, { ...CTX, ...c });
const idDe = (key: string, o: Partial<FrappeClavier> = {}, c: Partial<ContexteFrappe> = {}) => frappe(key, o, c).raccourci?.id ?? null;
const coquille = RACCOURCIS.filter((r) => r.action);

describe('Lot 13 · la table · doublons, conflits, portées', () => {
  it('aucun conflit · mêmes touches dans des portées qui se recouvrent, ni touche seule qui commence une séquence', () => {
    expect(conflitsRaccourcis(), 'la table a un conflit').toEqual([]);
  });

  it('la règle des conflits voit un doublon, une collision avec une vue et un préfixe (sinon elle ne garde rien)', () => {
    const j = RACCOURCIS.find((r) => r.id === 'jarvis')!;
    expect(conflitsRaccourcis([...RACCOURCIS, { ...j, id: 'jarvis-bis' }]).map((c) => c.raison)).toContain('mêmes touches, portées « partout » et « partout »');
    expect(conflitsRaccourcis([...RACCOURCIS, { ...j, id: 'gauche', touches: [['ArrowLeft']] }]).some((c) => c.b === 'veille-precedente' || c.a === 'veille-precedente'), 'une touche globale sur ← ne heurte pas la Veille').toBe(true);
    expect(conflitsRaccourcis([...RACCOURCIS, { ...j, id: 'g-seul', touches: [['g']] }]).map((c) => c.raison)).toContain('touche seule qui commence une séquence');
    expect(conflitsRaccourcis([...RACCOURCIS, { ...j, id: 'slash', touches: [['/']] }]).some((c) => c.a === 'scale-recherche' || c.b === 'scale-recherche'), 'le « / » de Ce qui scale n’est pas défendu').toBe(true);
  });

  it('identifiants uniques, libellés écrits, sans tiret cadratin, chaque portée connue et habitée', () => {
    const ids = RACCOURCIS.map((r) => r.id);
    expect(new Set(ids).size, 'identifiant en double').toBe(ids.length);
    for (const r of RACCOURCIS) {
      expect(r.libelle.trim().length, r.id).toBeGreaterThan(2);
      expect(sansTiretCadratin(r.libelle), r.id).toBe(r.libelle);
      expect(r.touches.length, r.id).toBeGreaterThan(0);
      expect(PORTEES_RACCOURCIS.some((p) => p.cle === r.portee), r.id).toBe(true);
    }
    for (const p of PORTEES_RACCOURCIS) expect(RACCOURCIS.some((r) => r.portee === p.cle), `portée vide · ${p.cle}`).toBe(true);
    expect(new Set(PORTEES_RACCOURCIS.map((p) => p.cle)).size).toBe(PORTEES_RACCOURCIS.length);
  });

  it('les portées · une globale recouvre toutes les autres, deux écrans distincts ne se recouvrent pas', () => {
    expect(porteesSeRecouvrent('partout', 'canvas')).toBe(true);
    expect(porteesSeRecouvrent('aller', 'veille-detail')).toBe(true);
    expect(porteesSeRecouvrent('veille-detail', 'menus')).toBe(false);
    expect(porteesSeRecouvrent('editeur', 'fenetres')).toBe(false);
  });

  it('la coquille n’agit que dans les portées globales · une entrée de vue nomme le fichier qui la gère', () => {
    for (const r of RACCOURCIS) {
      const globale = PORTEES_RACCOURCIS.find((p) => p.cle === r.portee)!.globale;
      expect(!!r.action, `${r.id} · action et portée globale vont ensemble`).toBe(globale);
      if (!r.action) expect(r.sources?.length, `${r.id} sans fichier`).toBeGreaterThan(0);
      for (const s of r.sources ?? []) expect(Object.keys(TOUCHES_RECENSEES), `${r.id} · ${s} n’est pas recensé`).toContain(s);
    }
  });

  it('seule la recherche (Ctrl K ou ⌘ K) vit dans un champ · aucune touche simple n’y est ouverte', () => {
    expect(RACCOURCIS.filter((r) => r.dansSaisie).map((r) => r.id)).toEqual(['recherche']);
    for (const r of RACCOURCIS.filter((x) => x.dansSaisie)) expect(r.touches.flat().every((a) => a.startsWith('mod+')), r.id).toBe(true);
  });
});

describe('Lot 13 · le recensement des vues · chaque touche lue par le code est dans la table', () => {
  const declarees = (fichier: string) => new Set(RACCOURCIS.filter((r) => r.sources?.includes(fichier)).flatMap((r) => r.touches.flat().map(toucheDeLAccord)));
  it('toute touche recensée (hors composant) est une entrée de la table pour ce fichier', () => {
    for (const [fichier, touches] of Object.entries(TOUCHES_RECENSEES)) {
      const d = declarees(fichier);
      for (const t of touches) if (!TOUCHES_DE_COMPOSANT.has(t)) expect(d.has(t), `${fichier} lit « ${t} » · aucune entrée de RACCOURCIS ne la déclare`).toBe(true);
    }
  });
  it('toute touche déclarée pour un fichier y est réellement lue (pas d’entrée fantôme)', () => {
    for (const r of RACCOURCIS) for (const f of r.sources ?? []) {
      for (const t of r.touches.flat().map(toucheDeLAccord)) expect(TOUCHES_RECENSEES[f], `${r.id} · « ${t} » déclarée dans ${f}, jamais lue`).toContain(t);
    }
  });
  it('les règles du noyau appelées par les vues ne répondent qu’aux touches écrites (rejouées)', () => {
    const essai = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'Escape', 'Enter', ' ', 'Tab', '+', '-', '_', '=', '0', '1', 'a', 'j', '?', '/', '[', 'k', 'c', 't', 'i', 'r', 'l'];
    const repond: Record<string, (k: string) => boolean> = {
      toucheNavigationDetail: (k) => toucheNavigationDetail({ key: k }) !== null,
      raccourciZoom: (k) => raccourciZoom({ key: k, ctrlKey: true, metaKey: false, altKey: false, dansChamp: false }) !== null,
      focusMenuSuivant: (k) => focusMenuSuivant(k, 1, 4) !== null,
      // Lot 13 bis · la fiche d'un lot.
      raccourciFicheLot: (k) => raccourciFicheLot({ key: k }, { actifs: true, modaleOuverte: false, cible: { tagName: 'BODY' } }) !== null,
      // Lot 13 ter · la fiche d'un test, la liste des lots.
      raccourciFicheTest: (k) => raccourciFicheTest({ key: k }, { actifs: true, modaleOuverte: false, cible: { tagName: 'BODY' } }) !== null,
      raccourciListeLots: (k) => raccourciListeLots({ key: k }, { actifs: true, modaleOuverte: false, cible: { tagName: 'A' } }) !== null,
    };
    expect(Object.keys(repond).sort()).toEqual(Object.keys(REGLES_CLAVIER).sort());
    for (const [nom, f] of Object.entries(repond)) expect(essai.filter(f).sort(), nom).toEqual([...REGLES_CLAVIER[nom]!].sort());
  });
});

describe('Lot 13 · WCAG 2.1.4 · ce qui doit pouvoir se couper', () => {
  it('une lettre, un chiffre ou un signe sans Ctrl ni ⌘ est « à une touche » · une flèche, Échap ou Ctrl K non', () => {
    expect(['j', '?', '[', '/', '0', 'maj+g'].every(accordUneTouche)).toBe(true);
    expect(['ArrowLeft', 'Escape', 'mod+k', 'mod++', 'maj+ArrowLeft'].some(accordUneTouche)).toBe(false);
  });
  it('toute entrée de la coquille à une touche se tait quand la préférence est coupée · Ctrl K reste', () => {
    for (const r of coquille) {
      for (const s of r.touches) {
        const c0: Partial<ContexteFrappe> = s.length === 2 ? { prefixe: { accord: s[0]!, depuis: CTX.maintenant } } : {};
        const k = s[s.length - 1]!;
        const f = { key: k.startsWith('mod+') ? toucheDeLAccord(k) : k, metaKey: k.startsWith('mod+') };
        expect(raccourciDeLaFrappe(f, { ...CTX, ...c0 }).raccourci?.id, `${r.id} ne part pas`).toBe(r.id);
        const coupe = raccourciDeLaFrappe(f, { ...CTX, ...c0, actifs: false }).raccourci?.id ?? null;
        expect(coupe, `${r.id} · ${exigeCoupure(r) ? 'part malgré la coupure' : 'coupé à tort'}`).toBe(exigeCoupure(r) ? null : r.id);
      }
    }
    expect(coquille.filter((r) => !exigeCoupure(r)).map((r) => r.id)).toEqual(['recherche']);
  });
  it('côté vues, seuls le « / » de Ce qui scale et C T de la fiche d’un lot exigent la coupure · le canvas et la surface de l’éditeur n’agissent que sur le focus', () => {
    // + lot 13 bis · C et T de la fiche d'un lot (lettres seules, pas sur le focus) · + lot 13 ter · T et L de la fiche d'un test.
    expect(RACCOURCIS.filter((r) => !r.action && exigeCoupure(r)).map((r) => r.id)).toEqual(['scale-recherche', 'lot-conclure', 'lot-iterer', 'test-iterer', 'test-lot']);
    expect(RACCOURCIS.filter((r) => !r.action && r.surFocus && r.touches.flat().some(accordUneTouche)).map((r) => r.id)).toEqual(['canvas-zoom-plus', 'canvas-zoom-moins', 'canvas-ajuster']);
  });
  it('le cookie · seul « 0 » coupe, absent ou inconnu = actifs, lu parmi d’autres cookies', () => {
    expect(raccourcisActifsDepuisCookie('0')).toBe(false);
    for (const v of [null, undefined, '', '1', 'oui']) expect(raccourcisActifsDepuisCookie(v)).toBe(true);
    expect(raccourcisActifs(`tt_theme=clair; ${RACCOURCIS_COOKIE}=0; tt_rail=1`)).toBe(false);
    expect(raccourcisActifs('tt_theme=clair; xtt_raccourcis=0')).toBe(true);
    expect(valeurCookie('a=1; b = 2', 'b')).toBe('2');
    expect(raccourcisCookieString(false)).toBe('tt_raccourcis=0; path=/; max-age=31536000; samesite=lax');
    expect(raccourcisCookieString(true).startsWith('tt_raccourcis=1;')).toBe(true);
  });
});

describe('Lot 13 · l’écouteur de la coquille · ce qu’une frappe demande', () => {
  it('chaque entrée simple de la coquille part de sa touche', () => {
    expect(idDe('k', { metaKey: true })).toBe('recherche');
    expect(idDe('k', { ctrlKey: true })).toBe('recherche');
    expect(idDe('?', { shiftKey: true })).toBe('aide');
    expect(idDe('j')).toBe('jarvis');
    expect(idDe('J')).toBe('jarvis'); // verrouillage majuscule, sans Maj
    expect(idDe('[')).toBe('rail');
    expect(idDe('[', { ctrlKey: true, altKey: true })).toBe('rail'); // AltGr (AZERTY sous Windows)
    expect(idDe('[', { altKey: true, shiftKey: true })).toBe('rail'); // ⌥ Maj 5 (AZERTY sous macOS)
    expect(idDe('n')).toBe('nouveau-projet');
    expect(idDe('i')).toBe('importer');
  });
  it('jamais dans un champ, une zone éditable, un lecteur, un rôle de saisie · Ctrl K oui', () => {
    for (const cible of [{ tagName: 'INPUT' }, { tagName: 'textarea' }, { tagName: 'SELECT' }, { tagName: 'DIV', editable: true }, { tagName: 'VIDEO' }, { tagName: 'BUTTON', dansLecteur: true }, { tagName: 'DIV', role: 'combobox' }]) {
      expect(idDe('j', {}, { cible }), JSON.stringify(cible)).toBeNull();
      expect(idDe('?', {}, { cible }), JSON.stringify(cible)).toBeNull();
      expect(idDe('k', { ctrlKey: true }, { cible }), JSON.stringify(cible)).toBe('recherche');
    }
    expect(cibleDeSaisie({ tagName: 'BUTTON' })).toBe(false);
  });
  it('jamais avec un modificateur non prévu · Ctrl J, ⌘ J, Alt J, Maj J, Ctrl Maj K, Ctrl ?', () => {
    expect(idDe('j', { ctrlKey: true })).toBeNull();
    expect(idDe('j', { metaKey: true })).toBeNull();
    expect(idDe('j', { altKey: true })).toBeNull();
    expect(idDe('J', { shiftKey: true })).toBeNull();
    expect(idDe('K', { ctrlKey: true, shiftKey: true })).toBeNull();
    expect(idDe('?', { ctrlKey: true })).toBeNull();
    expect(idDe('?', { metaKey: true })).toBeNull();
  });
  it('jamais sous une fenêtre modale pour une touche simple, ni une frappe déjà prise par une vue, ni une répétition', () => {
    expect(idDe('j', {}, { modaleOuverte: true })).toBeNull();
    expect(idDe('?', {}, { modaleOuverte: true })).toBeNull();
    expect(idDe('k', { metaKey: true }, { modaleOuverte: true })).toBe('recherche');
    expect(idDe('j', { dejaTraitee: true })).toBeNull();
    expect(idDe('j', { repetee: true })).toBeNull();
  });
  it('« g » attend la lettre · « g » puis « a » va à l’Accueil, dans le délai · au-delà, la lettre compte seule', () => {
    const g = frappe('g');
    expect(g).toEqual({ raccourci: null, prefixe: { accord: 'g', depuis: CTX.maintenant }, empecher: true });
    const ensuite = (key: string, dt: number) => raccourciDeLaFrappe({ key }, { ...CTX, prefixe: g.prefixe, maintenant: CTX.maintenant + dt });
    expect(ensuite('a', 300).raccourci?.id).toBe('aller-accueil');
    expect(ensuite('a', DELAI_SEQUENCE_MS).raccourci?.id).toBe('aller-accueil');
    expect(ensuite('a', DELAI_SEQUENCE_MS + 1).raccourci).toBeNull();
    expect(ensuite('j', 300).raccourci?.id, '« g » puis « j » · la page Jarvis, pas le tiroir').toBe('aller-jarvis');
    expect(ensuite('j', DELAI_SEQUENCE_MS + 1).raccourci?.id, 'après le délai, « j » ouvre le tiroir').toBe('jarvis');
    expect(ensuite('?', 300).raccourci?.id, 'une suite inconnue oublie « g » et compte seule').toBe('aide');
    expect(ensuite('x', 300)).toEqual({ raccourci: null, prefixe: null, empecher: false });
    expect(raccourciDeLaFrappe({ key: 'Shift' }, { ...CTX, prefixe: g.prefixe }).prefixe, 'Maj seule n’efface pas « g »').toEqual(g.prefixe);
    for (const [k, id] of [['s', 'aller-studios'], ['v', 'aller-veille'], ['r', 'aller-resultats'], ['b', 'aller-bibliotheque'], ['m', 'aller-marque']] as const) expect(ensuite(k, 10).raccourci?.id).toBe(id);
  });
  it('la coquille ne prend aucune touche des vues (flèches, Échap, + − 0, /, Ctrl Z)', () => {
    for (const [key, o] of [['ArrowLeft', {}], ['ArrowRight', {}], ['Escape', {}], ['+', {}], ['-', {}], ['0', {}], ['/', {}], ['z', { ctrlKey: true }], ['s', { metaKey: true }]] as const) {
      expect(frappe(key, o), key).toEqual({ raccourci: null, prefixe: null, empecher: false });
    }
  });
  it('l’accord d’une frappe', () => {
    expect(accordDeLaFrappe({ key: 'K', ctrlKey: true, shiftKey: true })).toBe('mod+maj+k');
    expect(accordDeLaFrappe({ key: '+', ctrlKey: true })).toBe('mod++');
    expect(accordDeLaFrappe({ key: 'ArrowLeft', shiftKey: true })).toBe('maj+ArrowLeft');
    expect(accordDeLaFrappe({ key: 'Shift', shiftKey: true })).toBeNull();
  });
});

describe('Lot 13 · l’aide · la table entière, groupée par portée', () => {
  it('chaque entrée y est une fois, dans l’ordre des portées puis de la table', () => {
    const g = groupesAideRaccourcis();
    const ordre = PORTEES_RACCOURCIS.flatMap((p) => RACCOURCIS.filter((r) => r.portee === p.cle).map((r) => r.id));
    expect(g.flatMap((x) => x.lignes.map((l) => l.id))).toEqual(ordre);
    expect(ordre.length).toBe(RACCOURCIS.length);
    expect(g.map((x) => x.portee)).toEqual(PORTEES_RACCOURCIS.map((p) => p.cle));
  });
  it('les touches s’écrivent en mots · Ctrl ou ⌘, Maj, flèches, Échap, « g » puis lettre', () => {
    expect(touchesAffichees('mod+k')).toEqual(['Ctrl', 'K']);
    expect(touchesAffichees('mod+k', true)).toEqual(['⌘', 'K']);
    expect(touchesAffichees('mod+maj+z')).toEqual(['Ctrl', 'Maj', 'Z']);
    expect(touchesAffichees('mod++')).toEqual(['Ctrl', '+']);
    expect(touchesAffichees('mod+-')).toEqual(['Ctrl', '−']);
    expect(touchesAffichees('Escape')).toEqual(['Échap']);
    expect(touchesAffichees('ArrowLeft')).toEqual(['←']);
    expect(touchesAffichees('?')).toEqual(['?']);
    const accueil = groupesAideRaccourcis().find((x) => x.portee === 'aller')!.lignes.find((l) => l.id === 'aller-accueil')!;
    expect(accueil.sequences).toEqual([[['G'], ['A']]]);
    for (const r of RACCOURCIS as readonly Raccourci[]) for (const a of r.touches.flat()) expect(touchesAffichees(a).every((t) => t.length > 0), a).toBe(true);
  });
});
