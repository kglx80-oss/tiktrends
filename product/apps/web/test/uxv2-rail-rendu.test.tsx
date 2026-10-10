// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * UX V2 · lot 1 · la coquille RENDUE (maquettes validées le 10/10).
 *
 * On monte la vraie coquille (rail réel de lib/rbac, droits réels, onglets
 * réels) à une adresse donnée et on lit le DOM :
 *  - le rail est une liste plate de six modules, puis « Votre espace » (admin
 *    d'espace seulement), puis Administration (équipe plateforme seulement) et Aide ;
 *  - la section reste allumée sur ses descendants (`aria-current="true"`),
 *    l'écran exact porte `aria-current="page"` ;
 *  - les sous-écrans sont les ONGLETS de la page, filtrés par les mêmes droits,
 *    un onglet verrouillé reste visible sans lien ;
 *  - Alt B réduit et déploie le rail, mémorisé dans le cookie, jamais pendant une saisie.
 */
const ici = { pathname: '/dashboard', recherche: '' };
vi.mock('next/navigation', () => ({
  usePathname: () => ici.pathname,
  useSearchParams: () => new URLSearchParams(ici.recherche),
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

const { AppShell } = await import('../components/AppShell');
const { railNav, sectionsCompteOuvertes, ouverturesParRole, RAIL_GROUP_LABEL } = await import('../lib/rbac');
type Access = import('../lib/rbac').Access;

const proprietaire: Access = { role: 'owner', plan: 'business' };
const membre: Access = { role: 'member', plan: 'business' };

let root: Root | null = null;
let el: HTMLDivElement | null = null;
beforeEach(() => {
  el = document.createElement('div'); document.body.appendChild(el); root = createRoot(el);
  document.cookie = 'tt_rail=; Max-Age=0; Path=/';
});
afterEach(() => { act(() => { root?.unmount(); }); el?.remove(); root = null; el = null; document.body.innerHTML = ''; });

function monter(adresse: string, a: Access = proprietaire, opts: { isStaff?: boolean; collapsed?: boolean } = {}) {
  const [p, q] = adresse.split('?');
  ici.pathname = p!; ici.recherche = q ?? '';
  act(() => {
    root!.render(
      <AppShell nav={railNav(a).map((g) => ({ ...g, group: RAIL_GROUP_LABEL[g.group] ?? g.group }))} accountGroups={sectionsCompteOuvertes(a)} ouvertures={ouverturesParRole(a)}
        isStaff={!!opts.isStaff} showUpgrade={false} brands={[{ id: 'b1', name: 'Neva' }]} activeBrandId="b1" canManageBrands
        creditBalance={0} creditsUnlimited={false} userName="U" userEmail="u@exemple.invalid" roleLabel="r" planLabel="p" workspaceName="Espace"
        collapsedInitial={!!opts.collapsed} logout={async () => {}}>
        <div />
      </AppShell>,
    );
  });
}
const txt = (e: Element) => (e.textContent ?? '').replace(/\s+/g, ' ').trim();
const railPrincipal = () => document.querySelector('nav[aria-label="Navigation principale"]')!;
/** Libellés des liens et entrées inertes du rail principal, dans l'ordre du DOM. */
const entreesRail = () => [...railPrincipal().querySelectorAll('a, [aria-disabled="true"]')].map(txt).filter(Boolean);
const courantes = () => [...railPrincipal().querySelectorAll('[aria-current]')].map((e) => [txt(e) || e.getAttribute('aria-label'), e.getAttribute('aria-current')]);
const onglets = () => document.querySelector('nav[data-zone="onglets-section"]');
/** Le pied du rail (Administration, Aide) · dans la zone qui défile, poussé en bas. */
const pied = () => [...railPrincipal().querySelectorAll('[data-zone="pied-rail"] a')].map((a) => [txt(a) || a.getAttribute('aria-label'), a.getAttribute('href')]);
const modules = () => [...railPrincipal().querySelectorAll('a, [aria-disabled="true"]')].filter((e) => !e.closest('[data-zone="pied-rail"]')).map(txt).filter(Boolean);

describe('UX V2 · le rail plat rendu', () => {
  it('propriétaire · six modules dans l’ordre, puis « Votre espace » (Marques, Réglages)', () => {
    monter('/dashboard');
    expect(modules()).toEqual(['Accueil', 'Veille', 'Studios', 'Bibliothèque', 'Résultats', 'Jarvis', 'Marques', 'Réglages']);
    // Le pied vient APRÈS, dans la même zone qui défile (tiroir mobile).
    expect(entreesRail().slice(-1)).toEqual(['Aide']);
    expect(railPrincipal().querySelector('[role="group"][aria-label="Votre espace"]'), 'le bloc Votre espace n’est pas nommé').not.toBeNull();
  });

  it('membre · « Votre espace » absent (même garde que les pages), modules inchangés', () => {
    monter('/dashboard', membre);
    expect(modules()).toEqual(['Accueil', 'Veille', 'Studios', 'Bibliothèque', 'Résultats', 'Jarvis']);
    expect(railPrincipal().querySelector('[aria-label="Votre espace"]')).toBeNull();
  });

  it('pied du rail · Aide pour tous, Administration réservée à l’équipe plateforme', () => {
    monter('/dashboard');
    expect(pied()).toContainEqual(['Aide', '/support']);
    expect(pied().map((x) => x[1]), 'Administration proposée hors équipe plateforme').not.toContain('/admin');
    act(() => { root!.unmount(); }); root = createRoot(el!);
    monter('/dashboard', proprietaire, { isStaff: true });
    expect(pied()).toContainEqual(['Administration', '/admin']);
  });

  it('la section reste allumée sur un descendant (true), l’écran exact est la page', () => {
    monter('/saved');
    expect(courantes()).toEqual([['Veille', 'true']]);
    monter('/veille');
    expect(courantes()).toEqual([['Veille', 'page']]);
    monter('/studio/projets/7c9e6679-7425-40de-944b-e07fc1f90ae7/image');
    expect(courantes()).toEqual([['Studios', 'true']]);
    monter('/adsmap/lots');
    expect(courantes()).toEqual([['Résultats', 'true']]);
  });

  it('replié · chaque icône est nommée (infobulle + nom accessible) et la section reste allumée', () => {
    monter('/saved', proprietaire, { collapsed: true });
    const liens = [...railPrincipal().querySelectorAll('a')];
    for (const a of liens) expect(a.getAttribute('aria-label'), `icône sans nom · ${a.getAttribute('href')}`).toBeTruthy();
    // L'icône allumée nomme la section ET le sous-écran où l'on est.
    expect(courantes()).toEqual([['Veille · Sauvegardes', 'true']]);
  });
});

describe('UX V2 · les onglets de section', () => {
  it('Veille · ses six écrans en onglets, l’écran courant marqué', () => {
    monter('/saved');
    const n = onglets();
    expect(n, 'pas d’onglets sur une page de la Veille').not.toBeNull();
    expect([...n!.querySelectorAll('[data-onglet]')].map(txt)).toEqual(['Veille', 'Ce qui scale', 'Sauvegardes', 'Formats', 'Tagging', 'Radar créatif']);
    expect([...n!.querySelectorAll('[aria-current="page"]')].map(txt)).toEqual(['Sauvegardes']);
  });

  it('Résultats · les onglets suivent le rôle (Lots et Importer réservés aux admins)', () => {
    monter('/adsmap', proprietaire);
    expect([...onglets()!.querySelectorAll('[data-onglet]')].map(txt)).toEqual(['Résultats', 'Tri des propositions', 'Lots de test', 'Protocole & seuils', 'Importer', 'Suites', 'Radar de veille']);
    monter('/adsmap', membre);
    expect([...onglets()!.querySelectorAll('[data-onglet]')].map(txt)).toEqual(['Résultats', 'Tri des propositions', 'Protocole & seuils', 'Suites']);
  });

  it('un onglet verrouillé par la formule reste visible, sans lien', () => {
    monter('/tags', { role: 'member', plan: 'starter' });
    const n = onglets()!;
    const scale = n.querySelector('[data-onglet="scale"]')!;
    expect(scale.tagName, 'un onglet verrouillé mène quelque part').not.toBe('A');
    expect(n.querySelector('a[data-onglet="tags"]'), 'Tagging (ouvert en starter) n’est pas un lien').not.toBeNull();
  });

  it('pas d’onglets là où la page a déjà les siens ou n’en a pas (Accueil, Studios)', () => {
    monter('/dashboard');
    expect(onglets()).toBeNull();
    monter('/studio/projets');
    expect(onglets()).toBeNull();
  });
});

describe('UX V2 · Alt B réduit et déploie le rail', () => {
  const altB = (cible: EventTarget = window) => act(() => { cible.dispatchEvent(new KeyboardEvent('keydown', { key: 'b', code: 'KeyB', altKey: true, bubbles: true })); });

  it('Alt B replie puis redéploie, et mémorise le choix dans le cookie du rail', () => {
    monter('/dashboard');
    expect(document.querySelector('button[aria-label="Réduire la barre"]')).not.toBeNull();
    altB();
    expect(document.querySelector('button[aria-label="Développer la barre"]'), 'Alt B n’a pas replié le rail').not.toBeNull();
    expect(document.cookie).toContain('tt_rail=1');
    altB();
    expect(document.querySelector('button[aria-label="Réduire la barre"]'), 'Alt B n’a pas redéployé le rail').not.toBeNull();
    expect(document.cookie).toContain('tt_rail=0');
  });

  it('pendant une saisie, Alt B n’agit pas sur le rail', () => {
    monter('/dashboard');
    const champ = document.createElement('input'); document.body.appendChild(champ);
    altB(champ);
    expect(document.querySelector('button[aria-label="Réduire la barre"]'), 'Alt B a replié le rail pendant une saisie').not.toBeNull();
  });

  it('le raccourci est annoncé (infobulle + aria-keyshortcuts)', () => {
    monter('/dashboard');
    const b = document.querySelector('button[aria-label="Réduire la barre"]')!;
    expect(b.getAttribute('aria-keyshortcuts')).toBe('Alt+B');
    expect(b.getAttribute('title')).toContain('Alt B');
  });
});
