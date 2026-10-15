import { describe, expect, it } from 'vitest';
import {
  actionToucheRail, entreesProfil, ESPACE_HORS_POPUP, COQUILLE_V5,
  jaugeCredits, caseCreditsFormule,
  indicesDefilementRail, masqueDefilementRail, defilementVersEntree, FONDU_RAIL, MENU_RECHARGE_LARGEUR_MIN,
  type EntreeCompteSource,
} from '../src/index';

/**
 * Lot V5 · B · les décisions de la coquille V5, vérifiées par leur RÉSULTAT.
 */
const fr = (n: number) => n.toLocaleString('fr-FR');
const touche = (t: Partial<{ key: string; code: string; altKey: boolean; ctrlKey: boolean; metaKey: boolean }>) =>
  ({ key: '', code: '', altKey: false, ctrlKey: false, metaKey: false, ...t });
const libre = { saisie: false, mobile: false, dialogue: false };

describe('V5 · la touche du rail (Alt B, « [ »)', () => {
  it('Alt B bascule, comme avant', () => {
    expect(actionToucheRail(touche({ key: 'b', code: 'KeyB', altKey: true }), libre)).toBe(true);
  });
  it('« [ » bascule · QWERTY nu, AZERTY Windows (AltGr = Ctrl + Alt), AZERTY Mac (Option)', () => {
    expect(actionToucheRail(touche({ key: '[', code: 'BracketLeft' }), libre)).toBe(true);
    expect(actionToucheRail(touche({ key: '[', code: 'Digit5', ctrlKey: true, altKey: true }), libre)).toBe(true);
    expect(actionToucheRail(touche({ key: '[', code: 'Digit5', altKey: true }), libre)).toBe(true);
  });
  it('Cmd [ (page précédente) et Ctrl [ ne basculent pas', () => {
    expect(actionToucheRail(touche({ key: '[', metaKey: true }), libre)).toBe(false);
    expect(actionToucheRail(touche({ key: '[', ctrlKey: true }), libre)).toBe(false);
  });
  it('jamais pendant une saisie, jamais sur écran étroit', () => {
    for (const t of [touche({ key: '[' }), touche({ code: 'KeyB', altKey: true })]) {
      expect(actionToucheRail(t, { ...libre, saisie: true })).toBe(false);
      expect(actionToucheRail(t, { ...libre, mobile: true })).toBe(false);
    }
  });
  it('« [ » se tait derrière un dialogue ouvert · Alt B garde sa règle d’avant', () => {
    expect(actionToucheRail(touche({ key: '[' }), { ...libre, dialogue: true })).toBe(false);
    expect(actionToucheRail(touche({ code: 'KeyB', altKey: true }), { ...libre, dialogue: true })).toBe(true);
  });
  it('une autre touche ne fait rien', () => {
    expect(actionToucheRail(touche({ key: ']' }), libre)).toBe(false);
    expect(actionToucheRail(touche({ key: 'b', code: 'KeyB' }), libre)).toBe(false);
  });
});

/** Les entrées telles que `sectionsCompteOuvertes` les donne (libellés et hrefs de lib/rbac). */
const ESPACE: EntreeCompteSource[] = [
  { key: 'brands', label: 'Marques', href: '/brands', icon: 'store' },
  { key: 'team', label: 'Membres', href: '/team', icon: 'users' },
  { key: 'connect', label: 'Connexions', href: '/connections', icon: 'plug' },
  { key: 'usage', label: 'Utilisation des crédits', href: '/usage', icon: 'coin' },
  { key: 'billing', label: 'Abonnement & factures', href: '/billing', icon: 'card' },
  { key: 'settings', label: 'Réglages', href: '/settings', icon: 'gear' },
];
const COMPTE: EntreeCompteSource[] = [{ key: 'support', label: 'Support', href: '/support', icon: 'help' }];

describe('V5 · les entrées de la pop-up profil suivent les droits', () => {
  it('admin d’espace · Mon profil puis les cinq entrées V5, dans l’ordre V5, aux destinations réelles', () => {
    const e = entreesProfil({ compte: COMPTE, espace: ESPACE, staff: false });
    expect(e.reglages.map((x) => x.libelle)).toEqual(['Mon profil', 'Espace de travail', 'Équipe', 'Connexions', 'Crédits & utilisation', 'Abonnement & factures']);
    expect(e.reglages.map((x) => x.action)).toEqual([
      { genre: 'profil' }, { genre: 'reglages-rapides' },
      { genre: 'lien', href: '/team' }, { genre: 'lien', href: '/connections' }, { genre: 'lien', href: '/usage' }, { genre: 'lien', href: '/billing' },
    ]);
    expect(e.aide.map((x) => [x.libelle, x.action])).toEqual([['Aide & support', { genre: 'lien', href: '/support' }]]);
    expect(e.adminPlus, 'ADMIN+ hors équipe plateforme').toBeNull();
  });

  it('membre ou client en lecture (pas d’entrée Espace) · Mon profil et l’aide, rien d’autre', () => {
    const e = entreesProfil({ compte: COMPTE, espace: [], staff: false });
    expect(e.reglages.map((x) => x.libelle)).toEqual(['Mon profil']);
    expect(e.aide.map((x) => x.libelle)).toEqual(['Aide & support']);
    expect(e.adminPlus).toBeNull();
  });

  it('ADMIN+ seulement pour l’équipe plateforme, vers /admin', () => {
    const e = entreesProfil({ compte: COMPTE, espace: ESPACE, staff: true });
    expect(e.adminPlus?.libelle).toBe('Ouvrir ADMIN+');
    expect(e.adminPlus?.action).toEqual({ genre: 'lien', href: '/admin' });
  });

  it('aucune entrée perdue · Marques est rangée ailleurs (raison écrite), une entrée inconnue suit sous son nom', () => {
    expect(ESPACE_HORS_POPUP.brands).toMatch(/rail/);
    const e = entreesProfil({ compte: COMPTE, espace: [...ESPACE, { key: 'nouveau', label: 'Nouveau réglage', href: '/nouveau', icon: 'gear' }], staff: false });
    expect(e.reglages.map((x) => x.libelle)).not.toContain('Marques');
    expect(e.reglages.at(-1)).toMatchObject({ libelle: 'Nouveau réglage', action: { genre: 'lien', href: '/nouveau' } });
  });

  it('une entrée verrouillée ou à venir reste visible, inerte', () => {
    const e = entreesProfil({ compte: COMPTE, espace: [{ ...ESPACE[1]!, soon: true }], staff: false });
    expect(e.reglages.find((x) => x.id === 'team')?.inerte).toBe(true);
  });
});

describe('V5 · la pastille de crédits (solde réel / dotation)', () => {
  it('solde · le chiffre réel, la barre = solde / dotation', () => {
    const j = jaugeCredits({ balance: 1240, unlimited: false, allocation: 2000 }, fr);
    expect(j.texte).toBe(fr(1240));
    expect(j.unite).toBe('crédits');
    expect(j.ratio).toBeCloseTo(0.62, 5);
    expect(j.libelle).toBe(`Crédits · ${fr(1240)} sur ${fr(2000)} par mois`);
  });
  it('même dénominateur que la case de formule (/billing)', () => {
    const c = caseCreditsFormule({ balance: 1240, unlimited: false, allocation: 2000 }, fr);
    const j = jaugeCredits({ balance: 1240, unlimited: false, allocation: 2000 }, fr);
    expect(c.valeur).toContain(j.texte);
    expect(c.detail).toContain(fr(2000));
  });
  it('après une recharge, la barre plafonne à plein, le chiffre reste vrai', () => {
    const j = jaugeCredits({ balance: 3500, unlimited: false, allocation: 2000 }, fr);
    expect(j.ratio).toBe(1);
    expect(j.texte).toBe(fr(3500));
  });
  it('illimité · ni chiffre ni barre', () => {
    const j = jaugeCredits({ balance: 0, unlimited: true, allocation: 24000 }, fr);
    expect(j).toMatchObject({ texte: 'Illimité', ratio: null, unite: '' });
  });
  it('sans dotation connue · pas de barre ; solde négatif · zéro', () => {
    expect(jaugeCredits({ balance: 10, unlimited: false, allocation: 0 }, fr).ratio).toBeNull();
    expect(jaugeCredits({ balance: -5, unlimited: false, allocation: 200 }, fr)).toMatchObject({ texte: '0', ratio: 0, unite: 'crédit' });
  });
});

describe('V5 · la géométrie mesurée', () => {
  it('les valeurs de la référence (couche finale, 1440)', () => {
    expect(COQUILLE_V5.enTete.hauteur).toBe(68);
    expect(COQUILLE_V5.avatar.enTete).toBe(44);
    expect(COQUILLE_V5.rail).toMatchObject({ rangeeMin: 46, rayon: 8, gapIcone: 12, gapEntrees: 5 });
    expect(COQUILLE_V5.credits).toMatchObject({ rayon: 12, icone: 28, plus: 24, barre: 4 });
  });
});

describe('V5 · correctifs · le rail défile au-dessus du pied, avec un indice', () => {
  // Mesures du banc · 512 px de contenu pour 361 visibles (1440 × 720, déplié).
  const f = (scrollTop: number) => ({ scrollTop, scrollHeight: 512, clientHeight: 361 });
  it('tout tient · aucun indice, aucun masque', () => {
    expect(indicesDefilementRail({ scrollTop: 0, scrollHeight: 300, clientHeight: 300 })).toEqual({ haut: false, bas: false });
    expect(indicesDefilementRail({ scrollTop: 0, scrollHeight: 300.6, clientHeight: 300 }), 'un demi-pixel n’est pas du contenu').toEqual({ haut: false, bas: false });
    expect(masqueDefilementRail({ haut: false, bas: false })).toBeNull();
  });
  it('en haut de la liste · fondu de fin seulement ; au milieu · les deux ; en bas · fondu de tête seulement', () => {
    expect(indicesDefilementRail(f(0))).toEqual({ haut: false, bas: true });
    expect(indicesDefilementRail(f(80))).toEqual({ haut: true, bas: true });
    expect(indicesDefilementRail(f(151))).toEqual({ haut: true, bas: false });
    expect(masqueDefilementRail({ haut: false, bas: true })).toBe(`linear-gradient(to bottom, var(--rail) 0, var(--rail) calc(100% - ${FONDU_RAIL}px), transparent 100%)`);
    expect(masqueDefilementRail({ haut: true, bas: false })).toBe(`linear-gradient(to bottom, transparent 0, var(--rail) ${FONDU_RAIL}px, var(--rail) 100%)`);
  });
  it('le masque n’écrit aucune couleur littérale (jeton ou transparent seulement)', () => {
    const m = masqueDefilementRail({ haut: true, bas: true })!;
    expect(m).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i);
  });
  it('le fondu ne voile jamais plus de la moitié d’une rangée (44 au plus serré)', () => {
    expect(FONDU_RAIL).toBeLessThanOrEqual(44 / 2);
  });
  it('l’entrée active hors de la vue (« Réglages » à 400 → 446 sur /settings) est ramenée au-dessus du fondu', () => {
    const cible = defilementVersEntree(f(0), { haut: 400, bas: 446 });
    expect(cible).toBe(446 - 361 + FONDU_RAIL);
    // Après défilement, elle est entière et hors du fondu de fin.
    expect(446).toBeLessThanOrEqual(cible! + 361 - FONDU_RAIL);
  });
  it('une entrée déjà visible ne fait rien bouger · une entrée au-dessus revient sous le fondu de tête', () => {
    expect(defilementVersEntree(f(0), { haut: 0, bas: 46 })).toBeNull();
    expect(defilementVersEntree(f(0), { haut: 100, bas: 146 })).toBeNull();
    expect(defilementVersEntree(f(120), { haut: 60, bas: 106 })).toBe(60 - FONDU_RAIL);
  });
  it('le défilement est borné à la liste · la dernière entrée va au bas, sans dépasser', () => {
    expect(defilementVersEntree(f(0), { haut: 466, bas: 512 })).toBe(512 - 361);
    expect(defilementVersEntree(f(151), { haut: 466, bas: 512 }), 'déjà au bas').toBeNull();
  });
});

describe('V5 · correctifs · le menu de recharge a la largeur de ses rangées', () => {
  it('au moins la rangée la plus large mesurée (246,4) + padding 24 + bord 2', () => {
    expect(MENU_RECHARGE_LARGEUR_MIN).toBeGreaterThanOrEqual(Math.ceil(246.4 + 24 + 2));
  });
  it('tient dans un écran de 390 · ancré à 12 px du bord, avec la gouttière de 16 de l’autre côté', () => {
    expect(12 + MENU_RECHARGE_LARGEUR_MIN).toBeLessThanOrEqual(390 - 16);
  });
});
