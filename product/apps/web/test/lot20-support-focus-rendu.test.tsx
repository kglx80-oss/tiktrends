// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

/**
 * Lot 20 · on MONTE la vraie coquille (jsdom) et on lit ce que le navigateur
 * utilisera · la marge basse de défilement de la page (`scroll-padding-bottom`
 * sur <html>) et le lanceur rendu. Mesuré à 390 sur `70200777` · la bulle
 * flottante masquait l'élément focalisé (jusqu'à 55 %) ; `/veille/formats`
 * gardait la bulle alors que le reste de la Veille ancre le lanceur.
 */
const h = vi.hoisted(() => ({ chemin: '/jarvis/sources' }));
vi.mock('next/navigation', () => ({ usePathname: () => h.chemin, useSearchParams: () => new URLSearchParams(), useRouter: () => ({ push() {}, refresh() {}, replace() {} }) }));
vi.mock('../components/CommandPalette', () => ({ openCommandPalette: () => {}, CommandPalette: () => null }));
vi.mock('../components/NotificationBell', () => ({ NotificationBell: () => null }));
vi.mock('../components/SupportWidget', () => ({ SupportWidget: ({ anchored }: { anchored?: boolean }) => <i data-lanceur={anchored ? 'ancre' : 'flottant'} /> }));
vi.mock('../components/ProfileModal', () => ({ ProfileModal: () => null }));
vi.mock('../components/QuickSettingsModal', () => ({ QuickSettingsModal: () => null }));
vi.mock('../components/CreditsMenu', () => ({ CreditsMenu: () => null }));
vi.mock('../components/BrandSwitcher', () => ({ BrandSwitcher: () => null }));
vi.mock('../components/Breadcrumb', () => ({ Breadcrumb: () => null }));

import { AppShell } from '../components/AppShell';
import { railNav, accountSections, ouverturesParRole } from '../lib/rbac';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} })) as unknown as typeof window.matchMedia;
let root: Root | null = null; let el: HTMLDivElement | null = null;
afterEach(() => { act(() => { root?.unmount(); }); el?.remove(); root = null; el = null; document.documentElement.style.scrollPaddingBottom = ''; });

const a = { role: 'owner' as const, plan: 'business' as const };
const coquille = () => (
  <AppShell nav={railNav(a).map((g) => ({ ...g, group: g.group }))} accountGroups={accountSections(a)} ouvertures={ouverturesParRole(a)}
    isStaff showUpgrade={false} brands={[{ id: 'b1', name: 'Neva' }]} activeBrandId="b1" canManageBrands
    creditBalance={0} creditsUnlimited={false} userName="U" userEmail="u@exemple.invalid" roleLabel="r" planLabel="p" workspaceName="Espace"
    collapsedInitial={false} logout={async () => {}}>
    <div />
  </AppShell>
);
function monter(chemin: string) {
  h.chemin = chemin;
  el = document.createElement('div'); document.body.appendChild(el);
  root = createRoot(el);
  act(() => { root!.render(coquille()); });
}
function changer(chemin: string) { h.chemin = chemin; act(() => { root!.render(coquille()); }); }
const marge = () => document.documentElement.style.scrollPaddingBottom;
const lanceur = () => el!.querySelector('[data-lanceur]')?.getAttribute('data-lanceur') ?? 'aucun';

describe('lot 20 · le focus ne passe plus sous la bulle de support', () => {
  it('route à bulle flottante · la page réserve 96 px en bas au défilement du focus', () => {
    for (const r of ['/jarvis/sources', '/console', '/admin', '/admin/connaissances']) {
      monter(r);
      expect(lanceur(), r).toBe('flottant');
      expect(marge(), `${r} · le focus peut encore s’arrêter sous la bulle`).toBe('96px');
      act(() => { root!.unmount(); }); el!.remove(); root = null;
    }
  });
  it('/veille/formats ancre le lanceur (plus de bulle) · aucune réserve posée', () => {
    monter('/veille/formats');
    expect(lanceur(), 'la bulle flotte encore sur Formats').toBe('ancre');
    expect(marge()).toBe('');
  });
  it('en naviguant vers une route ancrée ou sans lanceur, la réserve est retirée (aucune fuite)', () => {
    monter('/jarvis/sources');
    expect(marge()).toBe('96px');
    changer('/saved');
    expect(marge(), 'la réserve de la bulle survit sur une route où elle n’est plus').toBe('');
    changer('/jarvis');
    expect(marge()).toBe('');
    changer('/console');
    expect(marge()).toBe('96px');
  });
});
