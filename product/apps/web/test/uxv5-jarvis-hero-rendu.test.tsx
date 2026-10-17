// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import React, { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * UX V5 · le HERO de l'accueil Jarvis RENDU · on lit le HTML.
 *
 * On monte le vrai `JarvisChat`, on laisse son chargement asynchrone poser un
 * fil VIDE (0 tour), et on constate ce qui est À L'ÉCRAN dans l'en-tête :
 *  · le titre « Comment je peux t'aider sur … » porte le nom de la marque
 *    ACTIVE (réel, renvoyé par l'action · jamais figé en dur) ;
 *  · une ORBE décorative, construite en jetons (--clair-fixe, --accent…), a
 *    remplacé le pictogramme muet · aucune image externe ;
 *  · le sous-titre nomme les sources réelles (fiche marque, Veille, résultats).
 *
 * Le composant importe des actions serveur · on les simule pour obtenir le fil
 * vide et rendre le hero. On lit un RÉSULTAT (le HTML), pas la présence d'un
 * appel · chaque assertion tombe si on défait son correctif (voir mutations).
 */

vi.mock('next/link', () => ({
  default: ({ href, children, ...reste }: { href: string; children: ReactNode } & Record<string, unknown>) => <a href={href} {...reste}>{children}</a>,
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: () => {} }) }));
vi.mock('../app/actions/adsmap-draft', () => ({ draftConceptAction: vi.fn() }));
vi.mock('../app/actions/jarvis-chat', () => ({
  chatThreadAction: vi.fn(),
  clearChatAction: vi.fn(),
}));

const { JarvisChat } = await import('../app/(app)/jarvis/JarvisChat');
const { chatThreadAction } = await import('../app/actions/jarvis-chat');

function filVide(brandName: string) {
  return {
    thread: {
      turns: [],
      starters: ['Par où je commence avec cette marque ?'],
      measuredAds: 0,
      brandName,
      contexte: { brandId: 'B1', identity: null, rules: null, hooks: null, connaissances: null },
      sources: {},
    },
  };
}

let root: Root | null = null;
let el: HTMLDivElement | null = null;
beforeEach(() => { el = document.createElement('div'); document.body.appendChild(el); root = createRoot(el); });
afterEach(() => { act(() => { root?.unmount(); }); el?.remove(); root = null; el = null; document.body.innerHTML = ''; vi.clearAllMocks(); });

async function monter(brandName = 'Neva') {
  (chatThreadAction as unknown as Mock).mockResolvedValue(filVide(brandName));
  await act(async () => {
    root!.render(<JarvisChat fiche={null} brandId="B1" kpiSource={null} />);
  });
  // Laisse l'effet de chargement résoudre et re-rendre le fil vide.
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
  return el!;
}

describe('hero Jarvis · titre, orbe, sous-titre fidèles à la maquette', () => {
  it('le titre nomme la marque ACTIVE (réelle), pas un libellé figé', async () => {
    const dom = await monter('Neva');
    const h2 = dom.querySelector('h2');
    expect(h2?.textContent).toContain('Comment je peux t’aider sur');
    expect(h2?.textContent).toContain('Neva');
  });

  it('MUTATION · changer la marque change le titre rendu (pas un nom en dur)', async () => {
    const a = (await monter('Neva')).querySelector('h2')?.textContent;
    act(() => { root!.unmount(); }); el!.remove();
    el = document.createElement('div'); document.body.appendChild(el); root = createRoot(el);
    const b = (await monter('Maison Lumière')).querySelector('h2')?.textContent;
    expect(a).toContain('Neva');
    expect(b).toContain('Maison Lumière');
    expect(b).not.toBe(a);
  });

  it('une ORBE décorative en jetons a remplacé le pictogramme muet · aucune image externe', async () => {
    const dom = await monter();
    const sansEspace = (e: Element) => (e.getAttribute('style') ?? '').replace(/\s+/g, '');
    const orbe = [...dom.querySelectorAll('[aria-hidden="true"]')]
      .find((e) => sansEspace(e).includes('border-radius:50%'));
    expect(orbe, 'une orbe ronde, aria-hidden, attendue dans le hero').toBeTruthy();
    const style = sansEspace(orbe!);
    expect(style).toContain('--clair-fixe'); // éclat spéculaire par jeton
    expect(style).toContain('--accent'); // sphère peinte de l'accent
    expect(style).toContain('radial-gradient');
    // Décor PUR · pas d'image externe (CloudFront/fal) ni de <img> dans le hero.
    expect(dom.querySelector('h2')).toBeTruthy();
    expect(dom.innerHTML).not.toContain('<img');
  });

  it('le sous-titre nomme les sources réelles · fiche marque, Veille, résultats', async () => {
    const dom = await monter();
    const txt = dom.textContent ?? '';
    expect(txt).toContain('fiche marque');
    expect(txt).toContain('Veille');
    expect(txt).toContain('résultats');
    expect(txt).toContain('reste à valider');
  });
});
