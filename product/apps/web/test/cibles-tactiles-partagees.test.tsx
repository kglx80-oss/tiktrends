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
import { Composer } from '../components/Composer';

/** Lit la cible tactile EFFECTIVE d'un élément rendu · hauteur imposée soit par
 *  `minHeight`, soit par `height` (les boutons-icône carrés). jsdom ne calcule
 *  pas la mise en page · on lit donc le style en ligne, pas `getBoundingClientRect`. */
function cibleEffective(el: HTMLElement): number {
  const mh = parseFloat(el.style.minHeight || '0');
  const h = parseFloat(el.style.height || '0');
  return Math.max(mh, h);
}

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * Les contrôles PARTAGÉS se rataient au doigt · la croix de TOUTE modale (30 px),
 * la barre d'actions de CHAQUE carte créa (30×28, 28×24), le bouton du menu
 * MOBILE lui-même (38 px), la pagination (32 px), l'attache du composeur (34 px).
 * On les porte à la cible tactile du noyau (`CIBLE_TACTILE_MIN`, la charte à 44 px
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

  // La barre de composition est le composant partagé des trois studios (image,
  // vidéo, Pubs IA) · ses pastilles de réglage, ses menus déroulants, l'attache,
  // « Enregistrer la scène » et le bouton Générer se rataient tous au doigt.
  // On RÉEND avec de vrais réglages et on lit la cible effective de CHAQUE
  // bouton · un `minHeight` retiré d'une pastille fait tomber ce test.
  it('la barre de composition · tous ses boutons atteignent la cible (rendu)', () => {
    const hote = document.createElement('div');
    document.body.appendChild(hote);
    const root = createRoot(hote);
    act(() => root.render(
      <Composer
        value="Une description assez longue pour que « Enregistrer la scène » apparaisse."
        onChange={() => {}}
        onGenerate={() => {}}
        onAttach={() => {}}
        onSaveScene={() => {}}
        controls={[{ key: 'ratio', title: 'Ratio', options: [{ value: '1:1', label: '1:1' }], value: '1:1', onChange: () => {} }]}
        toggles={[{ key: 'texte', label: 'Texte lisible', value: true, onChange: () => {} }]}
        scenes={[{ id: 's1', name: 'Scène A', prompt: 'x', summary: null }]}
        cost={{ credits: 4 }}
      />,
    ));
    const boutons = Array.from(hote.querySelectorAll<HTMLElement>('button'));
    expect(boutons.length, 'la barre doit rendre des boutons').toBeGreaterThan(3);
    for (const b of boutons) {
      expect(cibleEffective(b), `un bouton « ${b.textContent?.trim().slice(0, 24)} » est sous la cible`)
        .toBeGreaterThanOrEqual(CIBLE_TACTILE_MIN);
    }
    act(() => root.unmount());
    hote.remove();
  });

  // Les écrans page-locaux (Adsmap, studios, accueil) tirent le graphe serveur
  // ou le routeur · on vérifie l'adoption de la cible dans la SOURCE, réglage par
  // réglage. Chaque entrée pointe un contrôle qui se ratait au doigt avant la
  // charte 44 px · le retrait du token fait tomber la ligne correspondante.
  const adoptions: Array<[string, string[]]> = [
    ['components/Bandeau.tsx', ['minHeight: CIBLE_TACTILE_MIN']],
    ['components/JourneyPanel.tsx', ['minHeight: CIBLE_TACTILE_MIN']],
    ['components/AssistantHome.tsx', ['minHeight: CIBLE_TACTILE_MIN']],
    ['components/AssistantChat.tsx', ['minHeight: CIBLE_TACTILE_MIN']],
    ['components/LogoHome.tsx', ['minHeight: CIBLE_TACTILE_MIN', 'minWidth: CIBLE_TACTILE_MIN']],
    ['app/(app)/adsmap/lots/Lots.tsx', ['minHeight: CIBLE_TACTILE_MIN']],
    ['app/(app)/adsmap/tri/Curation.tsx', ['minHeight: CIBLE_TACTILE_MIN']],
    ['app/(app)/adsmap/import/ImportPanel.tsx', ['minHeight: CIBLE_TACTILE_MIN']],
    ['app/(app)/adsmap/suites/Suites.tsx', ['minHeight: CIBLE_TACTILE_MIN']],
    ['app/(app)/adsmap/radar/Radar.tsx', ['minHeight: CIBLE_TACTILE_MIN']],
    ['app/(app)/studio/image/ImageStudio.tsx', ['minHeight: CIBLE_TACTILE_MIN']],
    ['app/(app)/studio/image/AssistantImage.tsx', ['minHeight: CIBLE_TACTILE_MIN']],
    ['app/(app)/studio/video/VideoStudioFull.tsx', ['minHeight: CIBLE_TACTILE_MIN']],
    ['app/(app)/studio/textes/StudioClient.tsx', ['minHeight: CIBLE_TACTILE_MIN']],
    ['app/(app)/studio/ads/AdsStudio.tsx', ['minHeight: CIBLE_TACTILE_MIN']],
    ['app/(app)/analytics/page.tsx', ['minHeight: CIBLE_TACTILE_MIN']],
  ];
  for (const [chemin, jetons] of adoptions) {
    it(`${chemin} adopte la cible tactile de la charte`, () => {
      const src = readFileSync(join(process.cwd(), chemin), 'utf8');
      expect(src, `${chemin} n’importe pas la cible du noyau`).toContain('CIBLE_TACTILE_MIN');
      for (const jeton of jetons) {
        expect(src, `${chemin} · « ${jeton} » manquant`).toContain(jeton);
      }
    });
  }
});
