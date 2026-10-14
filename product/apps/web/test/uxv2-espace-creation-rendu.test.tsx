// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * UX V2 · lot 2 · l'espace de création RENDU · la vraie coquille, la vraie
 * barre de projet et le vrai panneau des propositions (son contenu réseau est
 * remplacé par un témoin), montés à une adresse de projet. On lit le DOM :
 *  - Mode focus (bouton, Alt F) masque le rail et la barre du haut, garde la
 *    barre de projet, montre une sortie ; Échap et Alt F en sortent ; Échap
 *    laisse d'abord un dialogue ouvert se fermer ; hors d'un projet, Alt F ne
 *    fait rien et quitter le projet quitte le focus ;
 *  - la préférence du rail (cookie `tt_rail`) n'est pas touchée par le focus ;
 *  - Masquer Jarvis cache le panneau (sans le démonter), le dit, mémorise le
 *    choix dans `tt_jarvis`, et le cookie relu au rendu le masque d'emblée.
 */
const ici = { pathname: '/studio/projets/p1/textes' };
vi.mock('next/navigation', () => ({
  usePathname: () => ici.pathname,
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push() {}, refresh() {}, replace() {} }),
}));
vi.mock('next/link', () => ({ default: ({ href, children, prefetch: _p, ...reste }: { href: string; children: ReactNode; prefetch?: unknown } & Record<string, unknown>) => <a href={href} {...reste}>{children}</a> }));
vi.mock('../components/CommandPalette', () => ({ openCommandPalette: () => {}, CommandPalette: () => null }));
vi.mock('../components/NotificationBell', () => ({ NotificationBell: () => null }));
vi.mock('../components/SupportWidget', () => ({ SupportWidget: () => null }));
vi.mock('../components/ProfileModal', () => ({ ProfileModal: () => null }));
vi.mock('../components/QuickSettingsModal', () => ({ QuickSettingsModal: () => null }));
vi.mock('../components/CreditsMenu', () => ({ CreditsMenu: () => null }));
vi.mock('../components/BrandSwitcher', () => ({ BrandSwitcher: () => null }));
vi.mock('../components/Breadcrumb', () => ({ Breadcrumb: () => <nav aria-label="Fil d’Ariane" /> }));
// Le panneau réel appelle le serveur · un témoin avec un état local prouve qu'il reste monté.
vi.mock('../components/studios/PanneauPropositions', async () => {
  const { useState } = await import('react');
  return { PanneauPropositions: () => { const [v, setV] = useState(''); return <div data-panneau="propositions"><input aria-label="demande" value={v} onChange={(e) => setV(e.target.value)} /></div>; } };
});

const { AppShell } = await import('../components/AppShell');
const { BarreProjet } = await import('../components/studios/projet/BarreProjet');
const { PropositionsProjet } = await import('../components/studios/projet/PropositionsProjet');
const { railNav, sectionsCompteOuvertes, ouverturesParRole, RAIL_GROUP_LABEL } = await import('../lib/rbac');
const { liensAtelierProjet } = await import('../lib/navigation');

const a = { role: 'owner' as const, plan: 'business' as const };
let root: Root | null = null;
let el: HTMLDivElement | null = null;
beforeEach(() => {
  el = document.createElement('div'); document.body.appendChild(el); root = createRoot(el);
  document.cookie = 'tt_rail=; Max-Age=0; Path=/'; document.cookie = 'tt_jarvis=; Max-Age=0; Path=/';
  ici.pathname = '/studio/projets/p1/textes';
});
afterEach(() => { act(() => { root?.unmount(); }); el?.remove(); root = null; el = null; document.body.innerHTML = ''; });

function monter(opts: { jarvisMasqueInitial?: boolean } = {}) {
  act(() => {
    root!.render(
      <AppShell nav={railNav(a).map((g) => ({ ...g, group: RAIL_GROUP_LABEL[g.group] ?? g.group }))} accountGroups={sectionsCompteOuvertes(a)} ouvertures={ouverturesParRole(a)}
        isStaff={false} showUpgrade={false} brands={[]} activeBrandId={null} canManageBrands
        creditBalance={0} creditsUnlimited={false} userName="U" userEmail="u@exemple.invalid" roleLabel="r" planLabel="p" workspaceName="Espace"
        collapsedInitial={false} jarvisMasqueInitial={opts.jarvisMasqueInitial} logout={async () => {}}>
        <main>
          <BarreProjet projectId="p1" mode="textes" titre="Le plaisir du premier plongeon" sousTitre="Neva · version 3" atelier={liensAtelierProjet('p1', () => true)} jarvis />
          <PropositionsProjet projectId="p1" versionCourante={{ id: 'v3', n: 3 }} />
        </main>
      </AppShell>,
    );
  });
}
const rail = () => document.getElementById('nav-rail') as HTMLElement;
const railMasque = () => rail().style.display === 'none' && rail().hasAttribute('inert');
const barreHaut = () => document.querySelector('button[aria-label="Rechercher"]');
const sortie = () => document.querySelector('button[data-zone="quitter-focus"]');
const bouton = (action: string) => document.querySelector(`[data-zone="barre-projet"] button[data-action="${action}"]`) as HTMLButtonElement;
const clic = (b: Element | null) => { expect(b, 'bouton introuvable').toBeTruthy(); act(() => { (b as HTMLElement).click(); }); };
const touche = (init: KeyboardEventInit, cible: EventTarget = window) => act(() => { cible.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init })); });
const altF = (cible?: EventTarget) => touche({ key: 'f', code: 'KeyF', altKey: true }, cible);

describe('UX V2 · mode focus dans un projet', () => {
  it('le bouton « Mode focus » masque rail et barre du haut, garde la barre de projet, montre la sortie', () => {
    monter();
    expect(railMasque()).toBe(false);
    expect(barreHaut()).not.toBeNull();
    clic(bouton('focus'));
    expect(railMasque(), 'le rail reste visible en focus').toBe(true);
    expect(barreHaut(), 'la barre du haut reste visible en focus').toBeNull();
    expect(document.querySelector('nav[aria-label="Fil d’Ariane"]'), 'le fil d’Ariane reste en focus').toBeNull();
    expect(document.querySelector('[data-zone="barre-projet"]'), 'la barre de projet disparaît en focus').not.toBeNull();
    expect(bouton('focus').getAttribute('aria-pressed')).toBe('true');
    expect(bouton('focus').textContent).toBe('Quitter le mode focus');
    expect(sortie(), 'aucune sortie visible en focus').not.toBeNull();
  });

  it('Échap quitte, Alt F bascule ; la sortie flottante aussi', () => {
    monter();
    altF();
    expect(railMasque(), 'Alt F n’a pas activé le focus').toBe(true);
    touche({ key: 'Escape', code: 'Escape' });
    expect(railMasque(), 'Échap n’a pas quitté le focus').toBe(false);
    altF(); altF();
    expect(railMasque(), 'Alt F n’a pas re-basculé').toBe(false);
    altF();
    clic(sortie());
    expect(railMasque(), 'la sortie flottante ne quitte pas').toBe(false);
  });

  it('Échap appartient d’abord à un dialogue ouvert ; une saisie ignore Alt F', () => {
    monter();
    altF();
    const dlg = document.createElement('div'); dlg.setAttribute('role', 'dialog'); dlg.setAttribute('aria-modal', 'true'); document.body.appendChild(dlg);
    touche({ key: 'Escape', code: 'Escape' });
    expect(railMasque(), 'Échap a quitté le focus alors qu’un dialogue était ouvert').toBe(true);
    dlg.remove();
    touche({ key: 'Escape', code: 'Escape' });
    expect(railMasque()).toBe(false);
    altF(document.querySelector('input[aria-label="demande"]')!);
    expect(railMasque(), 'Alt F pendant une saisie a basculé le focus').toBe(false);
  });

  it('hors d’un projet, Alt F ne fait rien ; quitter le projet quitte le focus', () => {
    ici.pathname = '/veille';
    monter();
    altF();
    expect(railMasque(), 'focus activé hors projet').toBe(false);
    ici.pathname = '/studio/projets/p1/textes';
    monter();
    altF();
    expect(railMasque()).toBe(true);
    ici.pathname = '/veille';
    monter();
    expect(railMasque(), 'le focus survit hors du projet').toBe(false);
    ici.pathname = '/studio/projets/p1/textes';
    monter();
    expect(railMasque(), 'revenir au projet ressuscite le focus').toBe(false);
  });

  it('la préférence du rail (Alt B, cookie tt_rail) n’est pas touchée par le focus', () => {
    monter();
    altF(); touche({ key: 'Escape', code: 'Escape' });
    expect(document.cookie).not.toContain('tt_rail=');
    expect(rail().style.display).not.toBe('none');
  });
});

describe('UX V2 · Jarvis masquable', () => {
  it('Masquer Jarvis cache le panneau sans le démonter, le dit, et mémorise le choix', () => {
    monter();
    const champ = document.querySelector('input[aria-label="demande"]') as HTMLInputElement;
    act(() => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(champ, 'plus court'); champ.dispatchEvent(new Event('input', { bubbles: true })); });
    clic(bouton('jarvis'));
    const enveloppe = document.querySelector('[data-jarvis]') as HTMLElement;
    expect(enveloppe.hidden, 'le panneau Jarvis reste visible').toBe(true);
    expect(document.querySelector('[data-etat="jarvis-masque"]')?.textContent).toContain('Le panneau Jarvis est masqué');
    expect(document.cookie).toContain('tt_jarvis=0');
    expect(bouton('jarvis').getAttribute('aria-pressed')).toBe('true');
    clic([...document.querySelectorAll('[data-etat="jarvis-masque"] button')][0]!);
    expect((document.querySelector('[data-jarvis]') as HTMLElement).hidden).toBe(false);
    expect((document.querySelector('input[aria-label="demande"]') as HTMLInputElement).value, 'la demande en cours a été perdue').toBe('plus court');
    expect(document.cookie).toContain('tt_jarvis=1');
  });

  it('le choix relu au rendu (cookie) masque Jarvis dès le premier affichage', () => {
    monter({ jarvisMasqueInitial: true });
    expect((document.querySelector('[data-jarvis]') as HTMLElement).hidden).toBe(true);
    expect(bouton('jarvis').textContent).toBe('Afficher Jarvis');
  });
});

describe('UX V2 · barre de projet', () => {
  it('les modes du projet, le courant marqué, l’export en action', () => {
    monter();
    const modes = [...document.querySelectorAll('nav[aria-label="Atelier du projet"] [data-atelier]')].map((x) => x.textContent);
    expect(modes).toEqual(['Brief', 'Image', 'Vidéo', 'Textes', 'Produit', 'Identités et voix']);
    expect([...document.querySelectorAll('nav[aria-label="Atelier du projet"] [aria-current="page"]')].map((x) => x.textContent)).toEqual(['Textes']);
    expect(document.querySelector('[data-zone="barre-projet"] a[data-atelier="export"]')?.getAttribute('href')).toBe('/studio/projets/p1/export');
    expect(document.querySelector('[data-barre="titre"]')?.textContent).toBe('Le plaisir du premier plongeon');
  });
});
