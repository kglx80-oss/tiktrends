// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fourchetteCreditsImage, IMAGE_MODELS } from '@tiktrends/core';
import { Composer } from '../components/Composer';

/**
 * Lot 9 · Studio image et vidéo, au clavier. Mesuré au navigateur avant
 * correction · l'assistant guidé laissait le focus sur son bouton, Tab sortait
 * de la fenêtre 11 fois sur 14, Échap ne fermait pas ; les menus du composeur
 * n'annonçaient pas leur état et ne se fermaient qu'au clic.
 *
 * Le Composer est monté pour de vrai (jsdom) · on lit l'état annoncé et le
 * focus. Les fenêtres utilisent le piège partagé, éprouvé par
 * `piege-focus.test.tsx` · on vérifie qu'elles l'emploient et n'ont plus
 * d'écouteur maison.
 */
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | null = null; let el: HTMLDivElement | null = null;
afterEach(() => { act(() => { root?.unmount(); }); el?.remove(); root = null; el = null; });
const src = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

function monter() {
  el = document.createElement('div'); document.body.appendChild(el); root = createRoot(el);
  const choix = vi.fn();
  act(() => { root!.render(<Composer value="" onChange={() => {}} onGenerate={() => {}}
    controls={[{ key: 'format', title: 'Format', value: '1:1', onChange: choix, options: [{ value: '1:1', label: '1:1' }, { value: '4:5', label: '4:5' }] }]}
    toggles={[{ key: 'texte', label: 'Texte lisible', value: true, onChange: () => {} }]} />); });
  return el;
}

describe('Studio · composeur au clavier', () => {
  it('le menu annonce son état, relie son panneau, Échap le referme et rend le focus', () => {
    const h = monter();
    const b = [...h.querySelectorAll('button')].find((x) => x.textContent?.startsWith('1:1'))!;
    expect(b.getAttribute('aria-expanded'), 'état du menu non annoncé').toBe('false');
    act(() => { b.click(); });
    expect(b.getAttribute('aria-expanded')).toBe('true');
    const panneau = document.getElementById(b.getAttribute('aria-controls')!);
    expect(panneau, 'panneau non relié au bouton').toBeTruthy();
    const option = [...panneau!.querySelectorAll('button')].find((x) => x.textContent?.includes('1:1'))!;
    expect(option.getAttribute('aria-pressed'), 'la sélection ne passe que par la couleur').toBe('true');
    option.focus();
    act(() => { option.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
    expect(b.getAttribute('aria-expanded'), 'Échap ne referme pas').toBe('false');
    expect(document.activeElement, 'le focus n’est pas rendu au bouton').toBe(b);
  });
  it('interrupteur annoncé, description nommée', () => {
    const h = monter();
    const t = [...h.querySelectorAll('button')].find((x) => x.textContent?.includes('Texte lisible'))!;
    expect(t.getAttribute('aria-pressed')).toBe('true');
    expect(h.querySelector('textarea')!.getAttribute('aria-label'), 'description sans nom accessible').toBeTruthy();
  });
});

describe('Studio · fenêtres sur le piège partagé', () => {
  for (const p of ['app/(app)/studio/image/AssistantImage.tsx', 'app/(app)/studio/video/AssistantVideo.tsx']) {
    it(`${p.split('/').pop()} · piège partagé, plus d'écouteur maison`, () => {
      const s = src(p);
      expect(s).toContain('usePiegeFocus(boiteRef, { actif: p.ouvert, onFermer: p.onFermer })');
      expect(s, 'écouteur Échap maison (réabonné à chaque rendu)').not.toContain("window.addEventListener('keydown'");
      expect(s).toMatch(/ref=\{boiteRef\} tabIndex=\{-1\}.*role="dialog"/);
    });
  }
  it('visionneuse d’image · fenêtre nommée, Échap, vignette nommée', () => {
    const s = src('app/(app)/studio/image/ImageStudio.tsx');
    expect(s).toContain("usePiegeFocus(apercuRef, { actif: !!preview, onFermer: () => setPreview(null) })");
    expect(s).toMatch(/ref=\{apercuRef\} role="dialog" aria-modal="true" aria-label="Aperçu du visuel"/);
    expect(s).toContain('aria-label={`Agrandir le visuel · ${im.prompt.slice(0, 80)}`}');
  });
});

describe('Studio · prix annoncés fidèles au barème', () => {
  it('image · la fourchette suit le catalogue, plus « 4 crédits par image » en dur', () => {
    const f = fourchetteCreditsImage();
    expect(f.min).toBe(Math.min(...IMAGE_MODELS.map((m) => m.credits)));
    expect(f.max).toBe(Math.max(...IMAGE_MODELS.map((m) => m.credits)));
    expect(f.max).toBeGreaterThan(f.min);
    expect(src('app/(app)/studio/image/page.tsx')).not.toContain('4 crédits par image.');
  });
  it('vidéo · prix par tranche de 5 s, plus « 20 crédits par vidéo »', () => {
    const s = src('app/(app)/studio/video/page.tsx');
    expect(s).not.toContain('20 crédits par vidéo');
    expect(s).toContain("{costFor('video')} crédits par tranche de 5 s");
  });
});
