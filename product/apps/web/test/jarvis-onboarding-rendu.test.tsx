// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
// jsdom ne fait pas défiler · le fil suit le bas par `scrollTo`, neutralisé ici.
if (!Element.prototype.scrollTo) Element.prototype.scrollTo = () => {};

vi.mock('next/link', () => ({
  default: ({ href, children, ...reste }: { href: string; children: ReactNode } & Record<string, unknown>) => <a href={href} {...reste}>{children}</a>,
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: () => {} }) }));
vi.mock('../app/actions/adsmap-draft', () => ({ draftConceptAction: vi.fn() }));
vi.mock('../app/actions/jarvis-chat', () => ({
  onboardingThreadAction: vi.fn(),
  clearOnboardingAction: vi.fn(),
  // Tour est aussi importé depuis le composant JarvisChat (réel) · pas d'ici.
}));

const { JarvisOnboarding } = await import('../app/(app)/jarvis/JarvisOnboarding');
const { onboardingThreadAction } = await import('../app/actions/jarvis-chat');
const { startersOnboarding, TITRE_ONBOARDING_JARVIS } = await import('@tiktrends/core');

/**
 * UX V5 · Jarvis onboarding (sans marque) RENDU · on lit le HTML.
 *
 * Le compte neuf n'est plus un cul-de-sac :
 *  · JAMAIS « Sélectionne une marque active » ;
 *  · un hero d'accroche, une vraie zone « Écris à Jarvis… » ;
 *  · des amorces qui guident ;
 *  · l'action primaire « Créer ta première marque » vers /brands/new ;
 *  · deux entrées vers de vraies créations (marque, Veille).
 */

let root: Root | null = null;
let el: HTMLDivElement | null = null;
beforeEach(() => { el = document.createElement('div'); document.body.appendChild(el); root = createRoot(el); });
afterEach(() => { act(() => { root?.unmount(); }); el?.remove(); root = null; el = null; document.body.innerHTML = ''; vi.clearAllMocks(); });

async function monter() {
  (onboardingThreadAction as unknown as Mock).mockResolvedValue({ thread: { turns: [], starters: startersOnboarding() } });
  await act(async () => { root!.render(<JarvisOnboarding />); });
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
  return el!;
}

describe('Jarvis onboarding · guide, jamais cul-de-sac', () => {
  it('ne montre JAMAIS le mur « Sélectionne une marque active »', async () => {
    const dom = await monter();
    expect(dom.textContent).not.toMatch(/Sélectionne une marque active/i);
    expect(dom.querySelector('[data-etat="onboarding"]')).not.toBeNull();
  });

  it('un hero d’accroche · orbe + titre', async () => {
    const dom = await monter();
    const h1 = dom.querySelector('h1');
    expect(h1?.textContent).toBe(TITRE_ONBOARDING_JARVIS);
    const orbe = [...dom.querySelectorAll('[aria-hidden="true"]')].find((e) => (e.getAttribute('style') ?? '').replace(/\s+/g, '').includes('border-radius:50%'));
    expect(orbe, 'orbe attendue').toBeTruthy();
    expect(dom.innerHTML).not.toContain('<img');
  });

  it('l’action primaire « Créer ta première marque » pointe vers /brands/new', async () => {
    const dom = await monter();
    const cta = dom.querySelector('a[data-cta="premiere-marque"]') as HTMLAnchorElement;
    expect(cta).not.toBeNull();
    expect(cta.getAttribute('href')).toBe('/brands/new');
    expect(cta.textContent).toMatch(/Créer ta première marque/);
    // Jamais le vocabulaire du cul-de-sac.
    expect(dom.textContent).not.toMatch(/choisir une marque/i);
  });

  it('une vraie zone de saisie « Écris à Jarvis… » et un bouton d’envoi', async () => {
    const dom = await monter();
    const ta = dom.querySelector('textarea') as HTMLTextAreaElement;
    expect(ta).not.toBeNull();
    expect(ta.placeholder).toBe('Écris à Jarvis…');
    expect(dom.querySelector('button[aria-label="Envoyer le message à Jarvis"]')).not.toBeNull();
  });

  it('le sélecteur de marque dit « Créer une marque » (aucune à choisir)', async () => {
    const dom = await monter();
    const sel = dom.querySelector('a[data-selecteur-marque]') as HTMLAnchorElement;
    expect(sel.getAttribute('href')).toBe('/brands/new');
    expect(sel.textContent).toMatch(/Créer une marque/);
  });

  it('des amorces qui guident, et deux entrées vers de vraies créations', async () => {
    const dom = await monter();
    const amorces = [...dom.querySelectorAll('[data-zone="amorces-onboarding"] button')];
    expect(amorces.length).toBeGreaterThanOrEqual(3);
    // Entrées vers de vraies routes.
    expect(dom.querySelector('a[href="/veille"]')).not.toBeNull();
    const versMarque = [...dom.querySelectorAll('a[href="/brands/new"]')];
    expect(versMarque.length).toBeGreaterThanOrEqual(2); // CTA + entrée + sélecteur
  });

  it('cliquer une amorce lance le vrai fil (appel réseau onboarding, sans brand ni conversation)', async () => {
    const fetchMock = vi.fn(async () => new Response(new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode('Bienvenue !')); c.close(); } }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const dom = await monter();
    const amorce = dom.querySelector('[data-zone="amorces-onboarding"] button') as HTMLButtonElement;
    await act(async () => { amorce.click(); await new Promise((r) => setTimeout(r, 10)); });
    expect(fetchMock).toHaveBeenCalledWith('/api/jarvis/chat', expect.objectContaining({ method: 'POST' }));
    const appel = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(appel[1].body as string) as { conversationId?: unknown; message?: string };
    expect(body.conversationId).toBeUndefined();
    expect(body.message).toBeTruthy();
    vi.unstubAllGlobals();
  });
});
