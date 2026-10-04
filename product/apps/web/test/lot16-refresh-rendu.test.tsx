// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ECHEC_ENREGISTREMENT } from '@tiktrends/core';

/**
 * Lot 16 · les cinq `router.refresh()` signalés, gardés par ce qu'on VOIT.
 *
 * Le défaut mesuré au navigateur (MATRICE-lot16) vit dans la transition du
 * routeur client, qu'on ne rejoue pas dans jsdom · on rejoue sa CONSÉQUENCE ·
 * ici, le rendu serveur n'arrive JAMAIS (les props ne changent pas, `refresh`
 * ne fait rien). L'écran doit pourtant montrer ce qui vient d'être enregistré.
 */
const refresh = vi.fn();
vi.mock('next/navigation', () => ({ usePathname: () => '/dashboard', useSearchParams: () => new URLSearchParams(), useRouter: () => ({ push() {}, refresh, replace() {} }) }));
vi.mock('../components/CommandPalette', () => ({ openCommandPalette: () => {}, CommandPalette: () => null }));
vi.mock('../components/NotificationBell', () => ({ NotificationBell: () => null }));
vi.mock('../components/SupportWidget', () => ({ SupportWidget: () => null }));
vi.mock('../components/CreditsMenu', () => ({ CreditsMenu: () => null }));
vi.mock('../components/BrandSwitcher', () => ({ BrandSwitcher: () => null }));
vi.mock('../components/Breadcrumb', () => ({ Breadcrumb: () => null }));
vi.mock('../components/AdCard', () => ({ AdCard: ({ ad }: { ad: { id: string } }) => <article data-ad={ad.id} /> }));
vi.mock('../components/Toast', () => ({ useToast: () => ({ toast() {} }) }));

const actions = vi.hoisted(() => ({
  saveProfileAction: vi.fn(),
  saveWorkspaceNameAction: vi.fn(),
  unfollowBrand: vi.fn(),
  markTrackerSeenAction: vi.fn(),
  generateScenarioImageAction: vi.fn(),
}));
vi.mock('../app/actions/admin', () => ({ saveProfileAction: actions.saveProfileAction, saveWorkspaceNameAction: actions.saveWorkspaceNameAction }));
vi.mock('../app/actions/inspo', () => ({ unfollowBrand: actions.unfollowBrand, saveAd: vi.fn(), unsaveAd: vi.fn(), followBrand: vi.fn() }));
vi.mock('../app/actions/brief-marque', () => ({ briefMarqueAction: vi.fn() }));
vi.mock('../app/actions/tracker', () => ({ markTrackerSeenAction: actions.markTrackerSeenAction, scanTrackerAction: vi.fn() }));
vi.mock('../app/actions/brand-detail', () => ({ generateScenarioImageAction: actions.generateScenarioImageAction }));

const { AppShell } = await import('../components/AppShell');
const { railNav, accountSections, ouverturesParRole } = await import('../lib/rbac');

let root: Root | null = null;
let el: HTMLDivElement | null = null;
let raf: typeof requestAnimationFrame;
beforeEach(() => {
  el = document.createElement('div'); document.body.appendChild(el); root = createRoot(el);
  raf = globalThis.requestAnimationFrame;
  globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) => { cb(0); return 0; }) as typeof requestAnimationFrame;
  Object.values(actions).forEach((f) => f.mockReset()); refresh.mockReset();
});
afterEach(() => {
  act(() => { root?.unmount(); }); el?.remove(); root = null; el = null;
  globalThis.requestAnimationFrame = raf; document.body.innerHTML = '';
});

const attendre = async () => { await act(async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); }); };
const clic = async (b: Element | null | undefined) => { expect(b, 'bouton introuvable').toBeTruthy(); await act(async () => { (b as HTMLElement).click(); }); await attendre(); };
const bouton = (txt: string | RegExp, portee: ParentNode = document) => [...portee.querySelectorAll('button')].find((b) => (typeof txt === 'string' ? b.textContent?.trim() === txt : txt.test(b.textContent ?? '')));
const dialogue = (titre: string) => [...document.querySelectorAll('[role=dialog]')].find((d) => d.textContent?.includes(titre)) as HTMLElement | undefined;
const saisir = async (input: HTMLInputElement, v: string) => {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, v);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
};
const soumettre = async (d: HTMLElement) => { await act(async () => { d.querySelector('form')!.requestSubmit(); }); await attendre(); };

function coquille() {
  const a = { role: 'owner' as const, plan: 'business' as const };
  act(() => {
    root!.render(
      <AppShell nav={railNav(a).map((g) => ({ ...g, group: g.group }))} accountGroups={accountSections(a)} ouvertures={ouverturesParRole(a)}
        isStaff={false} showUpgrade={false} brands={[]} activeBrandId={null} canManageBrands
        creditBalance={0} creditsUnlimited={false} userName="Kévin" userEmail="k@exemple.invalid" roleLabel="r" planLabel="p" workspaceName="Espace démo"
        collapsedInitial={false} logout={async () => {}}>
        <div />
      </AppShell>,
    );
  });
}
const boutonEspace = () => document.querySelector<HTMLButtonElement>('button[aria-haspopup=menu][title^="Espace ·"]');
const boutonCompte = (nom: string) => [...document.querySelectorAll('aside button')].find((b) => b.textContent?.includes(nom) && !b.hasAttribute('aria-haspopup')) as HTMLButtonElement | undefined;
const ouvrirReglages = async () => { await clic(boutonEspace()); await clic(bouton('Réglages')); };
const ouvrirProfil = async (nom: string) => { await clic(boutonCompte(nom)); await clic(bouton('Mon profil')); };

describe('Réglages rapides · le nom enregistré se voit, la fenêtre se rouvre (lot 16)', () => {
  it('après Enregistrer · fenêtre fermée, rail au nouveau nom SANS rendu serveur, focus au bouton d’espace', async () => {
    actions.saveWorkspaceNameAction.mockResolvedValue({ ok: true });
    coquille();
    await ouvrirReglages();
    const d = dialogue('Réglages rapides')!;
    expect(d, 'la fenêtre ne s’ouvre pas').toBeTruthy();
    await saisir(d.querySelector('input[name=name]')!, 'Agence Nord');
    await soumettre(d);
    expect(dialogue('Réglages rapides'), 'la fenêtre reste ouverte après un enregistrement réussi').toBeFalsy();
    expect(boutonEspace()?.title, 'le rail garde l’ancien nom tant que le serveur ne répond pas').toBe('Espace · Agence Nord');
    expect(document.activeElement, 'le focus tombe hors du bouton qui ouvre le menu').toBe(boutonEspace());
  });

  it('se ROUVRE après un enregistrement et montre le nom enregistré (elle se refermait aussitôt)', async () => {
    actions.saveWorkspaceNameAction.mockResolvedValue({ ok: true });
    coquille();
    await ouvrirReglages();
    const d = dialogue('Réglages rapides')!;
    await saisir(d.querySelector('input[name=name]')!, 'Agence Nord');
    await soumettre(d);
    await ouvrirReglages();
    await attendre(); await attendre();
    const d2 = dialogue('Réglages rapides');
    expect(d2, 'la fenêtre se referme dès qu’on la rouvre').toBeTruthy();
    expect(d2!.querySelector<HTMLInputElement>('input[name=name]')!.value).toBe('Agence Nord');
  });

  it('échec · le message du serveur, annoncé, fenêtre ouverte, rail inchangé', async () => {
    actions.saveWorkspaceNameAction.mockResolvedValue({ error: 'Donne un nom · c’est ce qui identifiera cet élément dans la liste.' });
    coquille();
    await ouvrirReglages();
    const d = dialogue('Réglages rapides')!;
    await soumettre(d);
    const alerte = dialogue('Réglages rapides')?.querySelector('[role=alert]');
    expect(alerte?.textContent, 'le serveur a dit pourquoi · l’écran affichait « Erreur. »').toMatch(/^Donne un nom/);
    expect(boutonEspace()?.title).toBe('Espace · Espace démo');
  });

  it('échec réseau · une phrase utile, jamais « Erreur. »', async () => {
    actions.saveWorkspaceNameAction.mockRejectedValue(new Error('réseau'));
    coquille();
    await ouvrirReglages();
    await soumettre(dialogue('Réglages rapides')!);
    expect(dialogue('Réglages rapides')?.querySelector('[role=alert]')?.textContent).toBe(ECHEC_ENREGISTREMENT);
  });
});

describe('Mon profil · le nom enregistré se voit, la fenêtre se rouvre (lot 16)', () => {
  it('rail au nouveau nom sans rendu serveur, réouverture sur ce nom, focus au bouton du compte', async () => {
    actions.saveProfileAction.mockResolvedValue({ ok: true });
    coquille();
    await ouvrirProfil('Kévin');
    const d = dialogue('Mon profil')!;
    expect(d).toBeTruthy();
    await saisir(d.querySelector('input[name=name]')!, 'Kévin Martin');
    await soumettre(d);
    expect(dialogue('Mon profil')).toBeFalsy();
    expect(boutonCompte('Kévin Martin'), 'le rail garde l’ancien nom tant que le serveur ne répond pas').toBeTruthy();
    expect(document.activeElement).toBe(boutonCompte('Kévin Martin'));
    await ouvrirProfil('Kévin Martin');
    await attendre(); await attendre();
    const d2 = dialogue('Mon profil');
    expect(d2, 'la fenêtre se referme dès qu’on la rouvre').toBeTruthy();
    expect(d2!.querySelector<HTMLInputElement>('input[name=name]')!.value).toBe('Kévin Martin');
  });
});
