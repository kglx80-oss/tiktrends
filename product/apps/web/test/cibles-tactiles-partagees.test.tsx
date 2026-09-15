import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CIBLE_TACTILE_MIN } from '@tiktrends/core';
import { Modal } from '../components/Modal';
import { Pager } from '../components/Pager';

/**
 * Les contrôles PARTAGÉS se rataient au doigt · la croix de TOUTE modale (30 px),
 * la barre d'actions de CHAQUE carte créa (30×28, 28×24), le bouton du menu
 * MOBILE lui-même (38 px), la pagination (32 px), l'attache du composeur (34 px).
 * On les porte à la cible tactile du noyau (`CIBLE_TACTILE_MIN`, prouvée à 40 px
 * dans cible-tactile.test.ts).
 *
 * Modal et Pager sont purs · on RÉEND et on lit le HTML. Les autres tirent le
 * graphe serveur ou sont volumineux · adoption par la source, élément par élément.
 */
describe('Cibles tactiles · composants partagés', () => {
  it('la croix de la modale atteint la cible (rendu)', () => {
    const out = renderToStaticMarkup(<Modal open onClose={() => {}} title="X">c</Modal>);
    expect(out, 'la croix de fermeture est sous la cible tactile')
      .toContain(`width:${CIBLE_TACTILE_MIN}px;height:${CIBLE_TACTILE_MIN}px;flex-shrink:0;border-radius:9px`);
  });

  it('les boutons de pagination atteignent la cible (rendu)', () => {
    const out = renderToStaticMarkup(<Pager page={0} total={100} onPage={() => {}} />);
    expect(out, 'un bouton de page est sous la cible tactile')
      .toContain(`min-width:${CIBLE_TACTILE_MIN}px;min-height:${CIBLE_TACTILE_MIN}px`);
  });

  const creatives = readFileSync(join(process.cwd(), 'components/CreativeActions.tsx'), 'utf8');
  it('la barre d’actions d’une créa adopte la cible (bouton + pastilles de note)', () => {
    expect(creatives).toContain("CIBLE_TACTILE_MIN } from '@tiktrends/core'");
    const actBtn = creatives.slice(creatives.indexOf('const actBtn'), creatives.indexOf('const actBtn') + 200);
    expect(actBtn, 'le bouton d’action est sous la cible').toContain('width: CIBLE_TACTILE_MIN, height: CIBLE_TACTILE_MIN');
    const ratePill = creatives.slice(creatives.indexOf('function ratePill'), creatives.indexOf('function ratePill') + 320);
    expect(ratePill, 'la pastille de note est sous la cible').toContain('minWidth: CIBLE_TACTILE_MIN, minHeight: CIBLE_TACTILE_MIN');
  });

  it('l’attache du composeur atteint la cible', () => {
    const composer = readFileSync(join(process.cwd(), 'components/Composer.tsx'), 'utf8');
    expect(composer).toContain("CIBLE_TACTILE_MIN } from '@tiktrends/core'");
    expect(composer, 'le bouton d’attache est sous la cible').toContain('width: CIBLE_TACTILE_MIN, height: CIBLE_TACTILE_MIN, borderRadius: 11');
  });

  it('le bouton du menu mobile (hamburger) atteint la cible', () => {
    const shell = readFileSync(join(process.cwd(), 'components/AppShell.tsx'), 'utf8');
    const i = shell.indexOf('aria-label="Ouvrir le menu"');
    expect(i, 'le hamburger est introuvable').toBeGreaterThan(-1);
    const style = shell.slice(i, i + 200);
    expect(style, 'le bouton d’ouverture du menu mobile est sous la cible')
      .toContain('width: CIBLE_TACTILE_MIN, height: CIBLE_TACTILE_MIN');
  });
});
