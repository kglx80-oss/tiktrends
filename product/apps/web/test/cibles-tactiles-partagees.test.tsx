// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CIBLE_TACTILE_MIN } from '@tiktrends/core';
import { Modal } from '../components/Modal';
import { Pager } from '../components/Pager';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

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
    // La modale est portalisée sur <body> · on la monte en DOM réel et on lit
    // les dimensions RENDUES de la croix (jsdom sérialise les styles avec
    // espaces · on lit donc l'élément, pas la chaîne compacte).
    const hote = document.createElement('div');
    document.body.appendChild(hote);
    const root = createRoot(hote);
    act(() => root.render(<Modal open onClose={() => {}} title="X">c</Modal>));
    const croix = document.querySelector<HTMLElement>('[aria-label="Fermer"]');
    expect(croix, 'la croix de fermeture doit être rendue').not.toBeNull();
    expect(croix!.style.width, 'largeur de la croix sous la cible').toBe(`${CIBLE_TACTILE_MIN}px`);
    expect(croix!.style.height, 'hauteur de la croix sous la cible').toBe(`${CIBLE_TACTILE_MIN}px`);
    expect(croix!.style.borderRadius, 'arrondi de la croix').toBe('9px');
    act(() => root.unmount());
    hote.remove();
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
    // Le hamburger se repère à sa cible de panneau · son libellé varie désormais
    // avec l'état ouvert/fermé (CDC v7 · N08).
    const i = shell.indexOf('aria-controls="nav-rail"');
    expect(i, 'le hamburger est introuvable').toBeGreaterThan(-1);
    const style = shell.slice(i, i + 220);
    expect(style, 'le bouton d’ouverture du menu mobile est sous la cible')
      .toContain('width: CIBLE_TACTILE_MIN, height: CIBLE_TACTILE_MIN');
  });
});
