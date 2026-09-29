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
    const iMobile = src.indexOf('{mobile ? (');
    const bloc = src.slice(iMobile, src.indexOf(') : (', iMobile));
    const iSel = bloc.indexOf('{selecteur}');
    const iDet = bloc.indexOf('{detailBloc}');
    const iViv = bloc.indexOf('{vivier}');
    expect(iSel, 'le sélecteur manque au bloc mobile').toBeGreaterThan(-1);
    expect(iSel).toBeLessThan(iDet);
    expect(iDet).toBeLessThan(iViv);
  });

  it('desktop garde deux colonnes · détail à gauche, sélecteur + vivier à droite', () => {
    expect(src).toContain("minmax(0, 1fr) minmax(0, 320px)");
    // Colonne gauche = le détail ; la colonne droite empile sélecteur puis vivier.
    expect(src).toContain('<div style={{ minWidth: 0 }}>{detailBloc}</div>');
    const iRail = src.indexOf("flexDirection: 'column', gap: 18 }}>\n            {selecteur}");
    expect(iRail, 'la colonne droite ne commence pas par le sélecteur').toBeGreaterThan(-1);
    expect(src.indexOf('{selecteur}', iRail)).toBeLessThan(src.indexOf('{vivier}', iRail));
  });

  it('aucune action perdue · sélection, création, ajout/retrait, préparer, lancer, copier restent', () => {
    for (const a of ['setChoisi(b.id)', 'onClick={creer}', 'basculer(', 'onClick={preparer}', 'onClick={lancer}', 'copier(']) {
      expect(src, `action perdue : ${a}`).toContain(a);
    }
  });
});

describe('Lots · charte, cibles tactiles et support ancré (source)', () => {
  it('les boutons de sélection de lot et du vivier portent la cible tactile', () => {
    const iSelBtn = src.indexOf('setChoisi(b.id); setPrep(null);');
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
