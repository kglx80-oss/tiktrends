// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * Correctifs de la COQUILLE (coquille-fix) · trois défauts observés sur l'app :
 *
 *  1. la pastille de crédits (« Illimité » + « + ») débordait du rail · la
 *     colonne de grille du pied (`pied-compte`) prenait sa taille de CONTENU
 *     (min-width: auto) · la pastille grandissait avec le solde. Bornée à
 *     `minmax(0, 1fr)`, elle respecte la largeur du rail (sa valeur complète
 *     reste dans `title`/`aria-label`, le texte s'ellipse). La preuve GÉOMÉTRIQUE
 *     (rectangles mesurés, solde long) est dans la garde navigateur
 *     `uxv5-coquille-correctifs-navigateur.test.ts` · ici on lit le style rendu
 *     de l'élément réel (la colonne est bornée).
 *  2. « Aide » a quitté le rail · elle vit dans le bouton d'aide FLOTTANT, coin
 *     bas-droit (`SupportWidget`), qui ouvre le panneau FAQ + « Poser une
 *     question » (contact · ticket au support) et pointe sur /support.
 *  3. « Réglages » (/settings) ne fait plus doublon · retiré du rail, toujours
 *     joignable depuis la pop-up profil (entrée « Espace de travail »).
 *
 * On MONTE la vraie coquille et le vrai SupportWidget et on lit le DOM rendu.
 *
 * Mutations éprouvées (voir chaque `it`) :
 *  · pied-compte sans `minmax(0,1fr)` → « la colonne du pied n'est pas bornée » ;
 *  · « Aide » laissée dans le rail → « Aide est encore dans le rail » ;
 *  · « Réglages » (/settings) laissé dans le rail → « /settings est encore dans le rail » ;
 *  · SupportWidget sans bouton flottant / sans FAQ / sans contact → l'assertion correspondante tombe.
 */
const ici = { pathname: '/dashboard', recherche: '' };
vi.mock('next/navigation', () => ({
  usePathname: () => ici.pathname,
  useSearchParams: () => new URLSearchParams(ici.recherche),
  useRouter: () => ({ push() {}, refresh() {}, replace() {} }),
}));
vi.mock('next/link', () => ({ default: ({ href, children, prefetch: _p, ...reste }: { href: string; children: ReactNode; prefetch?: unknown } & Record<string, unknown>) => <a href={href} {...reste}>{children}</a> }));
vi.mock('../components/NotificationBell', () => ({ NotificationBell: () => null }));
vi.mock('../components/ProfileModal', () => ({ ProfileModal: () => null }));
vi.mock('../components/QuickSettingsModal', () => ({ QuickSettingsModal: () => null }));
vi.mock('../components/BrandSwitcher', () => ({ BrandSwitcher: () => null }));
vi.mock('../app/actions/stripe', () => ({ createTopupCheckoutAction: vi.fn() }));
// Le SupportWidget est le VRAI composant (on vérifie son bouton flottant et son
// panneau) · seules ses actions serveur (base/réseau) sont neutralisées.
// L'action serveur de ticket · une référence, non appelée ici (on lit le panneau).
vi.mock('../app/actions/support', () => ({ createTicketAction: vi.fn(), fetchMyTickets: vi.fn(async () => []) }));

const { AppShell } = await import('../components/AppShell');
const { SupportWidget } = await import('../components/SupportWidget');
const { railNav, sectionsCompteOuvertes, ouverturesParRole, RAIL_GROUP_LABEL, PLAN_CREDITS } = await import('../lib/rbac');

let root: Root | null = null;
let el: HTMLDivElement | null = null;
beforeEach(() => { el = document.createElement('div'); document.body.appendChild(el); root = createRoot(el); document.cookie = 'tt_rail=; Max-Age=0; Path=/'; });
afterEach(() => { act(() => { root?.unmount(); }); el?.remove(); root = null; el = null; document.body.innerHTML = ''; });

function monterShell(adresse = '/dashboard', o: { collapsed?: boolean; unlimited?: boolean } = {}) {
  ici.pathname = adresse; ici.recherche = '';
  const a = { role: 'owner' as const, plan: 'business' as const };
  act(() => {
    root!.render(
      <AppShell nav={railNav(a).map((g) => ({ ...g, group: RAIL_GROUP_LABEL[g.group] ?? g.group }))} accountGroups={sectionsCompteOuvertes(a)} ouvertures={ouverturesParRole(a)}
        isStaff={false} showUpgrade={false} brands={[{ id: 'b1', name: 'Neva' }]} activeBrandId="b1" canManageBrands
        creditBalance={500} creditsUnlimited={!!o.unlimited} creditAllocation={PLAN_CREDITS.business}
        userName="Owner Banc" userEmail="owner@exemple.invalid" roleLabel="Propriétaire" planLabel="Business" workspaceName="Agence Banc"
        collapsedInitial={!!o.collapsed} logout={async () => {}}>
        <div />
      </AppShell>,
    );
  });
}
const railLinks = () => [...document.querySelectorAll<HTMLAnchorElement>('#nav-rail nav[aria-label="Navigation principale"] a[href]')];
const txt = (e: Element) => (e.textContent || e.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim();

describe('Défaut 1 · la pastille de crédits tient dans le rail (colonne du pied bornée)', () => {
  for (const collapsed of [false, true]) {
    for (const unlimited of [false, true]) {
      it(`${collapsed ? 'replié' : 'déplié'} · ${unlimited ? 'illimité' : 'solde'} · la colonne du pied est bornée à 0`, () => {
        monterShell('/dashboard', { collapsed, unlimited });
        const pied = document.querySelector<HTMLElement>('#nav-rail [data-zone="pied-compte"]')!;
        expect(pied, 'pied du rail introuvable').toBeTruthy();
        expect(pied.style.display).toBe('grid');
        // Sans colonne bornée (min-width: auto par défaut), la pastille grandit
        // avec le solde et déborde du rail · `minmax(0, …)` la laisse rétrécir.
        expect(pied.style.gridTemplateColumns.replace(/\s+/g, ''), 'la colonne du pied n’est pas bornée (minmax(0,…))').toMatch(/minmax\(0,/);
        // La pastille elle-même peut rétrécir (texte ellipsé), valeur complète lisible ailleurs.
        const past = document.querySelector<HTMLElement>('[data-zone="pastille-credits"]')!;
        expect(past.getAttribute('aria-label') || past.getAttribute('title'), 'la valeur complète des crédits n’est plus accessible').toBeTruthy();
      });
    }
  }
});

describe('Défaut 2 · « Aide » hors du rail, dans le bouton flottant bas-droite', () => {
  it('aucune entrée « Aide » (ni lien /support) dans le rail', () => {
    monterShell('/dashboard');
    const liens = railLinks();
    expect(liens.length, 'rail vide').toBeGreaterThan(4);
    expect(liens.some((a) => /^Aide$/i.test(txt(a))), '« Aide » est encore dans le rail').toBe(false);
    expect(liens.some((a) => a.getAttribute('href') === '/support'), 'un lien /support est encore dans le rail').toBe(false);
  });
  it('le bouton d’aide FLOTTE en bas à droite, annonce un dialogue, et ouvre le panneau FAQ + contact', () => {
    act(() => { root!.render(<SupportWidget firstName="Owner" />); });
    const bouton = document.querySelector<HTMLButtonElement>('button[aria-label="Aide et support"]')!;
    expect(bouton, 'pas de bouton d’aide flottant').toBeTruthy();
    expect(bouton.style.position, 'le bouton d’aide n’est pas fixé').toBe('fixed');
    expect(bouton.style.bottom, 'le bouton d’aide n’est pas en bas').toBe('20px');
    expect(bouton.style.right, 'le bouton d’aide n’est pas à droite').toBe('20px');
    expect(bouton.getAttribute('aria-expanded'), 'le bouton d’aide n’annonce pas son état fermé').toBe('false');
    act(() => { bouton.click(); });
    expect(bouton.getAttribute('aria-expanded'), 'l’ouverture du panneau n’est pas annoncée').toBe('true');
    // FAQ réelle (sections dépliables) + contact réel (poser une question au support).
    const faq = [...document.querySelectorAll('details summary')].map((s) => s.textContent || '');
    expect(faq.length, 'le panneau n’a pas de FAQ').toBeGreaterThanOrEqual(3);
    const contact = [...document.querySelectorAll('button')].some((b) => /Poser une question/i.test(b.textContent || ''));
    expect(contact, 'le panneau n’a pas d’entrée de contact (poser une question)').toBe(true);
  });
});

describe('Défaut 3 · « Réglages » (/settings) hors du rail, joignable depuis la pop-up profil', () => {
  it('aucun lien /settings dans le rail', () => {
    monterShell('/dashboard');
    expect(railLinks().some((a) => a.getAttribute('href') === '/settings'), '/settings est encore dans le rail').toBe(false);
  });
  it('la pop-up profil garde l’entrée « Espace de travail » (réglages de l’espace · accès à /settings)', () => {
    monterShell('/dashboard');
    const avatar = document.querySelector<HTMLButtonElement>('header button[data-zone="avatar-en-tete"]')!;
    act(() => { avatar.click(); });
    const popup = document.querySelector('[data-zone="popup-profil"]')!;
    expect(popup, 'la pop-up profil ne s’ouvre pas').toBeTruthy();
    const settings = popup.querySelector('[data-entree-profil="settings"]');
    expect(settings, 'l’entrée des réglages de l’espace a disparu de la pop-up profil').toBeTruthy();
  });
});
