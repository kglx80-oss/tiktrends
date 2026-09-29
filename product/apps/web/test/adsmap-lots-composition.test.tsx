import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { valeurBudget } from '../app/(app)/adsmap/lots/Lots';

/**
 * Lot UI Lots · sur mobile le brief passait AVANT le sélecteur (on lisait le
 * détail d'un lot avant d'avoir choisi lequel). On mène par la sélection, la
 * création reste accessible mais secondaire, puis brief / ads / vivier. Desktop
 * garde ses deux colonnes.
 *
 * Et le budget PRÉVU (jamais engagé) : le total « 0 € » d'un lot vide se lisait
 * comme une contradiction à côté de la projection par ad. Le calcul est juste,
 * on explicite la présentation · cloué au RÉSULTAT de `valeurBudget`.
 */

const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8');
const src = read('app/(app)/adsmap/lots/Lots.tsx');
const page = read('app/(app)/adsmap/lots/page.tsx');
const shell = read('components/AppShell.tsx');

describe('Lots · budget PRÉVU, la contradiction du lot vide est levée (RÉSULTAT)', () => {
  const brief = { dailyBudgetPerAd: 20, durationDays: 7, totalBudget: 140 };

  it('lot vide · le total 0 € est explicité (suit le nombre d’ads), jamais présenté seul', () => {
    const v = valeurBudget(brief, 0);
    expect(v).toContain('0 € prévus au total');
    expect(v).toContain('le total suit le nombre d’ads');
  });

  it('lot rempli · le total prévu réel s’affiche, sans la mention du lot vide', () => {
    const v = valeurBudget(brief, 3);
    expect(v).toContain('140 € prévus au total');
    // Mutation : si les deux branches étaient identiques, la mention du vide fuirait ici.
    expect(v, 'la mention du lot vide fuit sur un lot rempli').not.toContain('le total suit le nombre d’ads');
  });

  it('le budget reste PRÉVU · jamais « engagé »', () => {
    expect(valeurBudget(brief, 0)).not.toContain('engagé');
    expect(valeurBudget(brief, 3)).not.toContain('engagé');
    // Le calcul du total n'est pas refait ici · on lit la valeur serveur.
    expect(valeurBudget(brief, 3)).toContain(String(brief.totalBudget));
  });
});

describe('Lots · sur mobile la sélection passe avant le brief (source)', () => {
  it('l’ordre mobile est sélecteur → détail → vivier', () => {
    // Le bloc mobile de layout empile {selecteur} {detailBloc} {vivier} · on le
    // cible par cette séquence (le sélecteur porte désormais son propre `mobile ?`).
    const iSel = src.indexOf('{selecteur}\n          {detailBloc}');
    expect(iSel, 'ordre mobile sélecteur → détail manquant').toBeGreaterThan(-1);
    expect(src.indexOf('{detailBloc}\n          {vivier}', iSel), 'ordre mobile détail → vivier manquant').toBeGreaterThan(iSel);
  });

  it('desktop garde deux colonnes · détail à gauche, sélecteur + vivier à droite', () => {
    expect(src).toContain("minmax(0, 1fr) minmax(0, 320px)");
    // Colonne gauche = le détail ; la colonne droite empile sélecteur puis vivier.
    expect(src).toContain('<div style={{ minWidth: 0 }}>{detailBloc}</div>');
    const iRail = src.indexOf("flexDirection: 'column', gap: 18 }}>\n            {selecteur}");
    expect(iRail, 'la colonne droite ne commence pas par le sélecteur').toBeGreaterThan(-1);
    expect(src.indexOf('{selecteur}', iRail)).toBeLessThan(src.indexOf('{vivier}', iRail));
  });

  it('mobile · le sélecteur est repliable, le lot courant reste visible, la liste borne sa hauteur', () => {
    // 29 lots empilés poussaient le brief de deux écrans · sur mobile la liste
    // complète se déplie à la demande, le lot courant reste toujours affiché.
    expect(src).toContain('listeOuverte');
    expect(src).toContain('aria-expanded={listeOuverte}');
    expect(src).toContain('`Changer (${liste.length})`');
    expect(src).toContain('lotCourant ? (');
    // La liste dépliée borne sa hauteur (défilante), elle ne repousse plus le brief.
    expect(src).toContain("maxHeight: '46vh'");
  });

  it('choisir un lot referme le panneau et donne le focus au brief (mobile)', () => {
    expect(src).toContain('if (mobile) { setListeOuverte(false); setAFocaliser(true); }');
    // Le focus attend le chargement du détail, puis va au titre du lot.
    expect(src).toContain('detailRef.current.focus()');
    expect(src).toContain('ref={detailRef} tabIndex={-1}');
    // Les boutons de la liste passent par `choisir` (pas un setChoisi nu).
    expect(src).toContain('onClick={() => choisir(b.id)}');
  });

  it('desktop garde la liste pleine (non repliée)', () => {
    // La branche non-mobile rend la liste complète + la création, sans panneau.
    expect(src).toContain('{listeLots(false)}');
  });

  it('la copie ne dit plus « à droite » · sur mobile le vivier est en dessous', () => {
    expect(src, '« à droite » ne vaut plus · le vivier passe sous le détail en mobile').not.toContain('vivier à droite');
    expect(src).toContain('choisis-en dans le vivier.');
  });

  it('aucune action perdue · sélection, création, ajout/retrait, préparer, lancer, copier restent', () => {
    for (const a of ['choisir(b.id)', 'onClick={creer}', 'basculer(', 'onClick={preparer}', 'onClick={lancer}', 'copier(']) {
      expect(src, `action perdue : ${a}`).toContain(a);
    }
  });
});

describe('Lots · charte, cibles tactiles et support ancré (source)', () => {
  it('les boutons de sélection de lot et du vivier portent la cible tactile', () => {
    const iSelBtn = src.indexOf('onClick={() => choisir(b.id)}');
    expect(iSelBtn, 'bouton de sélection introuvable').toBeGreaterThan(-1);
    expect(src.slice(iSelBtn, iSelBtn + 260)).toContain('minHeight: CIBLE_TACTILE_MIN');
    const iViv = src.indexOf('basculer(c.id, true)');
    expect(src.slice(iViv, iViv + 320)).toContain('minHeight: CIBLE_TACTILE_MIN');
  });

  it('« Ouvrir Pubs IA » (lien isolé du vivier vide) porte la cible tactile', () => {
    // Action seule dans le vivier vide · pas un lien noyé dans la phrase.
    const i = src.indexOf('Ouvrir Pubs IA');
    const style = src.slice(Math.max(0, i - 240), i);
    expect(style).toContain('minHeight: CIBLE_TACTILE_MIN');
  });

  it('l’en-tête suit la charte · titre 500, aide repliée à cible tactile', () => {
    expect(page).toContain('fontWeight: 500');
    expect(page).toContain('minHeight={CIBLE_TACTILE_MIN}');
  });

  it('le support est ANCRÉ sur /adsmap/lots · il ne recouvre aucun CTA', () => {
    expect(shell).toContain("pathname === '/adsmap/lots'");
  });

  it('la page reste réservée aux admins (gate serveur)', () => {
    expect(page).toContain("roleAtLeast(s.role, 'admin')");
    expect(page).toContain("redirect('/adsmap')");
  });
});
