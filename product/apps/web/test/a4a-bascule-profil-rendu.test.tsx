// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * V5 · A4a · P02 · la bascule « Sombre / Clair » dans la VRAIE pop-up profil.
 *
 * On monte la vraie coquille (AppShell), on ouvre la pop-up par l'avatar et on
 * lit le DOM :
 *  - la zone « Apparence » montre un groupe légendé de DEUX boutons radio
 *    natifs, « Sombre » et « Clair », dont celui du thème posé sur `<html>`
 *    est coché ;
 *  - choisir « Clair » met à jour `<html data-theme>` SANS rechargement, pose
 *    le cookie `tt_theme=clair`, coche le bon bouton et l'annonce dans une
 *    zone `role="status"` ; revenir à « Sombre » fait l'inverse ;
 *  - la pop-up rouverte relit l'état courant.
 */
const ici = { pathname: '/dashboard', recherche: '' };
vi.mock('next/navigation', () => ({
  usePathname: () => ici.pathname,
  useSearchParams: () => new URLSearchParams(ici.recherche),
  useRouter: () => ({ push() {}, refresh() {}, replace() {} }),
}));
vi.mock('next/link', () => ({ default: ({ href, children, prefetch: _p, ...reste }: { href: string; children: ReactNode; prefetch?: unknown } & Record<string, unknown>) => <a href={href} {...reste}>{children}</a> }));
vi.mock('../components/NotificationBell', () => ({ NotificationBell: () => <button type="button" aria-label="Notifications" /> }));
vi.mock('../components/SupportWidget', () => ({ SupportWidget: () => null }));
vi.mock('../components/ProfileModal', () => ({ ProfileModal: () => null }));
vi.mock('../components/QuickSettingsModal', () => ({ QuickSettingsModal: () => null }));
vi.mock('../components/BrandSwitcher', () => ({ BrandSwitcher: () => null }));
vi.mock('../app/actions/stripe', () => ({ createTopupCheckoutAction: vi.fn() }));

const { AppShell } = await import('../components/AppShell');
const { railNav, sectionsCompteOuvertes, ouverturesParRole, RAIL_GROUP_LABEL, PLAN_CREDITS } = await import('../lib/rbac');
type Access = import('../lib/rbac').Access;

let root: Root | null = null;
let el: HTMLDivElement | null = null;
beforeEach(() => {
  el = document.createElement('div'); document.body.appendChild(el); root = createRoot(el);
  document.cookie = 'tt_theme=; Max-Age=0; Path=/';
  document.documentElement.setAttribute('data-theme', 'sombre');
});
afterEach(() => {
  act(() => { root?.unmount(); }); el?.remove(); root = null; el = null; document.body.innerHTML = '';
  document.documentElement.removeAttribute('data-theme');
  document.cookie = 'tt_theme=; Max-Age=0; Path=/';
});

function monter() {
  const a: Access = { role: 'owner', plan: 'core' };
  act(() => {
    root!.render(
      <AppShell nav={railNav(a).map((g) => ({ ...g, group: RAIL_GROUP_LABEL[g.group] ?? g.group }))} accountGroups={sectionsCompteOuvertes(a)} ouvertures={ouverturesParRole(a)}
        isStaff={false} showUpgrade={false} brands={[{ id: 'b1', name: 'Neva' }]} activeBrandId="b1" canManageBrands
        creditBalance={1240} creditsUnlimited={false} creditAllocation={PLAN_CREDITS[a.plan]}
        userName="Kevin Guilbaux" userEmail="k@exemple.invalid" roleLabel="Propriétaire" planLabel="Core" workspaceName="Agence GLX"
        collapsedInitial={false} logout={async () => {}}>
        <div />
      </AppShell>,
    );
  });
}
const clic = (x: Element | null | undefined) => { expect(x, 'élément introuvable').toBeTruthy(); act(() => { (x as HTMLElement).click(); }); };
const avatar = () => document.querySelector<HTMLButtonElement>('header button[data-zone="avatar-en-tete"]');
const zone = () => document.querySelector('[data-zone="popup-profil"] [data-zone="apparence"]');
const radios = () => [...(zone()?.querySelectorAll<HTMLInputElement>('input[type="radio"]') ?? [])];
const radio = (v: string) => radios().find((r) => r.value === v) ?? null;
const libelle = (r: HTMLInputElement) => (r.closest('label')?.textContent ?? '').trim();
const statut = () => zone()?.querySelector('[role="status"]')?.textContent ?? '';

describe('pop-up profil · bascule Sombre / Clair', () => {
  it('la zone Apparence montre deux radios natifs légendés, le thème courant coché', () => {
    monter();
    clic(avatar());
    expect(zone(), 'la zone Apparence est vide · la bascule n’est pas branchée').not.toBeNull();
    const fs = zone()!.querySelector('fieldset');
    expect(fs?.querySelector('legend')?.textContent, 'groupe sans légende').toBe('Thème de l’interface');
    expect(radios().map((r) => [r.value, libelle(r), r.name])).toEqual([['sombre', 'Sombre', 'tt-theme'], ['clair', 'Clair', 'tt-theme']]);
    expect(radio('sombre')!.checked, 'le thème courant (sombre) n’est pas coché').toBe(true);
    expect(radio('clair')!.checked).toBe(false);
  });

  it('choisir Clair bascule <html> sans rechargement, pose le cookie et l’annonce', () => {
    monter();
    clic(avatar());
    clic(radio('clair'));
    expect(document.documentElement.getAttribute('data-theme'), 'l’attribut de <html> n’a pas suivi').toBe('clair');
    expect(document.cookie, 'le cookie tt_theme n’est pas posé').toContain('tt_theme=clair');
    expect(radio('clair')!.checked, 'le choix n’est pas coché').toBe(true);
    expect(radio('sombre')!.checked).toBe(false);
    expect(statut(), 'le changement n’est pas annoncé').toBe('Thème clair appliqué');

    clic(radio('sombre'));
    expect(document.documentElement.getAttribute('data-theme')).toBe('sombre');
    expect(document.cookie).toContain('tt_theme=sombre');
    expect(statut()).toBe('Thème sombre appliqué');
  });

  it('rouverte, la pop-up relit le thème posé sur <html>', () => {
    document.documentElement.setAttribute('data-theme', 'clair');
    monter();
    clic(avatar());
    expect(radio('clair')!.checked, 'le thème clair posé par le serveur n’est pas coché').toBe(true);
  });
});
