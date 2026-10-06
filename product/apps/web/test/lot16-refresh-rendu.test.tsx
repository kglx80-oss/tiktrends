// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ECHEC_ENREGISTREMENT, echecRetraitSuivi } from '@tiktrends/core';

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
vi.mock('../components/Toast', () => ({ useToast: () => ({ toast() {} }), useToastSiPresent: () => null }));

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
const { SavedTabs } = await import('../components/SavedTabs');
const { MarquesSuivies } = await import('../components/MarquesSuivies');
const { TrackerFeed } = await import('../components/TrackerFeed');
const { ScenarioCard } = await import('../components/ScenarioCard');
const { BibliothequeVide } = await import('../components/BibliothequeVide');
const { prendreFocusApresVidage } = await import('../components/focusVidage');
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

const MARQUES = [
  { id: 'c1', platform: 'meta', name: 'Orée Cosmétiques' },
  { id: 'c2', platform: 'meta', name: 'Maison Verte' },
  { id: 'c3', platform: 'tiktok', name: 'Atelier Botanique' },
];
const compteur = (cle: string) => [...document.getElementById(`onglet-${cle}`)!.querySelectorAll('span')].pop()?.textContent;
const puces = () => [...document.querySelectorAll('[role=tabpanel] span[title]')].map((s) => s.getAttribute('title'));

function sauvegardes(onglet: 'marques' | 'nouveautes', nouveautes: React.ReactNode = null) {
  act(() => {
    root!.render(
      <SavedTabs initial={onglet} compteurs={{ creations: 0, marques: 3, nouveautes: 3 }} creations={null}
        marques={<MarquesSuivies brands={MARQUES} vide={<p>Aucun concurrent suivi pour l’instant.</p>} />}
        nouveautes={nouveautes} />,
    );
  });
}

describe('Sauvegardes › Marques · « Ne plus suivre » se voit sans rendu serveur (lot 16)', () => {
  it('la puce part, le compteur passe à 2, le focus va à la puce suivante', async () => {
    actions.unfollowBrand.mockResolvedValue(undefined);
    sauvegardes('marques');
    await clic(document.querySelector('button[aria-label="Ne plus suivre Maison Verte"]'));
    expect(puces(), 'la puce retirée reste affichée').toEqual(['Orée Cosmétiques', 'Atelier Botanique']);
    expect(compteur('marques'), 'le compteur de l’onglet reste à 3').toBe('2');
    expect(document.activeElement?.closest('div')?.querySelector('span[title]')?.getAttribute('title'), 'focus perdu après le retrait').toBe('Atelier Botanique');
  });

  it('le dernier retiré · l’état vide, compteur à 0, focus sur l’onglet', async () => {
    actions.unfollowBrand.mockResolvedValue(undefined);
    sauvegardes('marques');
    for (const n of ['Orée Cosmétiques', 'Maison Verte', 'Atelier Botanique']) await clic(document.querySelector(`button[aria-label="Ne plus suivre ${n}"]`));
    expect(document.querySelector('[role=tabpanel]')!.textContent, 'panneau blanc au lieu de l’état vide').toContain('Aucun concurrent suivi');
    expect(compteur('marques')).toBe('0');
    expect(document.activeElement?.id).toBe('onglet-marques');
  });

  it('échec · la puce revient et on le dit', async () => {
    actions.unfollowBrand.mockRejectedValue(new Error('réseau'));
    sauvegardes('marques');
    await clic(document.querySelector('button[aria-label="Ne plus suivre Maison Verte"]'));
    expect(puces()).toContain('Maison Verte');
    expect(compteur('marques')).toBe('3');
    expect(document.querySelector('[role=tabpanel] [role=alert]')?.textContent).toBe(echecRetraitSuivi('Maison Verte'));
  });
});

const EVENEMENTS = ['a1', 'a2', 'a3'].map((id) => ({ ad: { id, platform: 'meta' as const, status: 'active', daysRunning: 3, advertiserName: 'Orée' }, advertiserName: 'Orée', unseen: true }));

describe('Sauvegardes › Nouveautés · « Tout marquer vu » se voit sans rendu serveur (lot 16)', () => {
  it('badge et bouton partent, compteur à 0, focus sur le titre du fil', async () => {
    actions.markTrackerSeenAction.mockResolvedValue(undefined);
    sauvegardes('nouveautes', <TrackerFeed events={EVENEMENTS} followedCount={3} trackingEnabled={false} />);
    expect(document.querySelector('[role=tabpanel] h2')!.textContent).toMatch(/3 nouveaux/);
    await clic(bouton('Tout marquer vu'));
    expect(document.querySelector('[role=tabpanel] h2')!.textContent, 'le badge « 3 nouveaux » reste').not.toMatch(/nouveau/);
    expect(bouton('Tout marquer vu'), 'le bouton reste cliquable').toBeFalsy();
    expect(compteur('nouveautes')).toBe('0');
    expect(document.activeElement?.tagName).toBe('H2');
  });
});

describe('Fiche marque › Scénario · l’échec rend le focus et s’annonce (lot 16)', () => {
  it('« Crédits insuffisants » · alerte, focus sur le bouton, rien d’autre', async () => {
    // Chromium retire le focus d'un bouton qui se désactive (mesuré · <body>
    // 4 fois sur 4) · jsdom non · on rejoue cette perte pendant l'essai.
    actions.generateScenarioImageAction.mockImplementation(async () => { (document.activeElement as HTMLElement | null)?.blur(); return { error: 'Crédits insuffisants (4 requis).' }; });
    act(() => { root!.render(<ScenarioCard brandId="b" scenarioId="s1" title="Pause café" context={null} imageUrl={null} cost={4} canGenerate />); });
    const b = bouton(/Générer le visuel/)!;
    await act(async () => { b.focus(); b.click(); });
    await attendre();
    expect(document.querySelector('[role=alert]')?.textContent).toBe('Crédits insuffisants (4 requis).');
    expect(document.activeElement, 'le focus tombe sur <body> après l’échec').toBe(bouton(/Générer le visuel/));
    expect(refresh).not.toHaveBeenCalled();
  });
});

describe('Bibliothèque entièrement vide · le focus revient après la bascule serveur (lot 16, revue Codex)', () => {
  beforeEach(() => { prendreFocusApresVidage(); }); // aucune demande en attente d'un test à l'autre
  const region = () => document.querySelector('section[aria-label="Ta bibliothèque est encore vide"]');

  it('dernier concurrent retiré, puis le rendu serveur remplace les onglets · le focus va à l’état vide (il tombait sur <body>)', async () => {
    actions.unfollowBrand.mockResolvedValue(undefined);
    sauvegardes('marques');
    for (const n of ['Orée Cosmétiques', 'Maison Verte', 'Atelier Botanique']) await clic(document.querySelector(`button[aria-label="Ne plus suivre ${n}"]`));
    // La page serveur (N05) rend l'état vide À LA PLACE des onglets · l'onglet focalisé disparaît.
    act(() => { root!.render(<main><BibliothequeVide /></main>); });
    await attendre();
    expect(region(), 'état vide introuvable').toBeTruthy();
    expect(document.activeElement, 'le focus tombe sur <body> après la bascule').toBe(region());
  });

  it('simple visite de la bibliothèque vide · le focus ne bouge pas', async () => {
    act(() => { root!.render(<main><BibliothequeVide /></main>); });
    await attendre();
    expect(region()).toBeTruthy();
    expect(document.activeElement, 'une simple visite déplace le focus').toBe(document.body);
  });

  it('focus déjà posé ailleurs par l’utilisateur · il n’est pas volé', async () => {
    actions.unfollowBrand.mockResolvedValue(undefined);
    sauvegardes('marques');
    for (const n of ['Orée Cosmétiques', 'Maison Verte', 'Atelier Botanique']) await clic(document.querySelector(`button[aria-label="Ne plus suivre ${n}"]`));
    // L'utilisateur est déjà ailleurs AVANT que l'état vide n'arrive.
    act(() => { root!.render(<main><button type="button">Ailleurs</button></main>); });
    act(() => { bouton('Ailleurs')!.focus(); });
    act(() => { root!.render(<main><button type="button">Ailleurs</button><BibliothequeVide /></main>); });
    await attendre();
    expect(region()).toBeTruthy();
    expect(document.activeElement).toBe(bouton('Ailleurs'));
  });
});
