// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * Correctifs de la coquille V5 (après #797), constatés sur les captures du banc.
 *
 *  1. À 1440 / 1280 × 720, le bloc « Votre espace » (marque active, Marques)
 *     finissait coupé net au ras du pied (pastille + profil), sans aucun indice ·
 *     « Neva » à moitié visible, et l'entrée active du bas (« Marques » sur
 *     /brands · « Réglages » a depuis quitté le rail) hors de la vue au
 *     chargement. Même chose dans le tiroir à 390.
 *  2. Le menu de recharge prenait la largeur de la pastille (159 px) · prix
 *     rognés, « 279 € » sur deux lignes, « Acheter » hors du panneau.
 *
 * On monte la VRAIE coquille et la VRAIE pastille et on lit le DOM rendu :
 * la liste est un conteneur défilant distinct du pied, le pied la suit dans le
 * flux (jamais posé par-dessus), un fondu dit qu'il reste du contenu, l'entrée
 * active est ramenée dans la vue, le panneau de recharge a la largeur mesurée
 * de ses rangées. La garde navigateur réel (rectangles mesurés) est
 * `uxv5-coquille-correctifs-navigateur.test.ts`.
 *
 * Mutations éprouvées : pied en `position: absolute` par-dessus la liste →
 * « le pied est posé par-dessus la liste » ; largeur minimale retirée du
 * panneau → « le panneau de recharge est plus étroit que ses rangées ».
 */
const ici = { pathname: '/dashboard', recherche: '' };
vi.mock('next/navigation', () => ({
  usePathname: () => ici.pathname,
  useSearchParams: () => new URLSearchParams(ici.recherche),
  useRouter: () => ({ push() {}, refresh() {}, replace() {} }),
}));
vi.mock('next/link', () => ({ default: ({ href, children, prefetch: _p, ...reste }: { href: string; children: ReactNode; prefetch?: unknown } & Record<string, unknown>) => <a href={href} {...reste}>{children}</a> }));
vi.mock('../components/NotificationBell', () => ({ NotificationBell: () => null }));
vi.mock('../components/SupportWidget', () => ({ SupportWidget: () => null }));
vi.mock('../components/ProfileModal', () => ({ ProfileModal: () => null }));
vi.mock('../components/QuickSettingsModal', () => ({ QuickSettingsModal: () => null }));
vi.mock('../components/BrandSwitcher', () => ({ BrandSwitcher: () => null }));
vi.mock('../app/actions/stripe', () => ({ createTopupCheckoutAction: vi.fn() }));

const { AppShell } = await import('../components/AppShell');
const { CreditsMenu } = await import('../components/CreditsMenu');
const { railNav, sectionsCompteOuvertes, ouverturesParRole, RAIL_GROUP_LABEL, PLAN_CREDITS } = await import('../lib/rbac');
const { CREDIT_PACKS } = await import('../lib/credit-packs');
const { COQUILLE_V5, FONDU_RAIL } = await import('@tiktrends/core');

/**
 * Géométrie MESURÉE sur le banc (1440 × 720, déplié, owner) · la liste fait
 * 512 px de contenu pour 361 visibles, son haut est à 184. jsdom ne mise pas
 * en page · on lui donne ces mesures, et la position de l'entrée active (à
 * 400 px du haut du contenu, 46 de haut, comme « Marques » sur /brands · bas de
 * liste depuis que « Réglages » a quitté le rail ; en tête partout ailleurs).
 */
const MESURE = { haut: 184, visible: 361, contenu: 512, actif: 400, rangee: 46 };
const ENTREE_BAS = '/brands';
const estListe = (e: Element) => e.matches('nav[aria-label="Navigation principale"]');
const rect = (top: number, height: number) => ({ top, bottom: top + height, height, left: 0, right: 184, width: 184, x: 0, y: top, toJSON() {} }) as DOMRect;

let root: Root | null = null;
let el: HTMLDivElement | null = null;
const espions: Array<{ mockRestore(): void }> = [];
beforeEach(() => {
  el = document.createElement('div'); document.body.appendChild(el); root = createRoot(el);
  document.cookie = 'tt_rail=; Max-Age=0; Path=/';
  espions.push(
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(function (this: HTMLElement) { return estListe(this) ? MESURE.visible : 0; }),
    vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockImplementation(function (this: HTMLElement) { return estListe(this) ? MESURE.contenu : 0; }),
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      if (estListe(this)) return rect(MESURE.haut, MESURE.visible);
      const liste = this.closest('nav[aria-label="Navigation principale"]');
      // « Marques » (/brands) est en bas de la liste · « Accueil » (et le reste) en tête.
      if (liste && this.hasAttribute('aria-current')) return rect(MESURE.haut + (this.getAttribute('href') === ENTREE_BAS ? MESURE.actif : 0) - liste.scrollTop, MESURE.rangee);
      return rect(0, 0);
    }),
  );
});
afterEach(() => {
  act(() => { root?.unmount(); }); el?.remove(); root = null; el = null; document.body.innerHTML = '';
  while (espions.length) espions.pop()!.mockRestore();
});

function monter(adresse: string, o: { collapsed?: boolean } = {}) {
  ici.pathname = adresse; ici.recherche = '';
  const a = { role: 'owner' as const, plan: 'business' as const };
  act(() => {
    root!.render(
      <AppShell nav={railNav(a).map((g) => ({ ...g, group: RAIL_GROUP_LABEL[g.group] ?? g.group }))} accountGroups={sectionsCompteOuvertes(a)} ouvertures={ouverturesParRole(a)}
        isStaff={false} showUpgrade={false} brands={[{ id: 'b1', name: 'Neva' }]} activeBrandId="b1" canManageBrands
        creditBalance={500} creditsUnlimited={false} creditAllocation={PLAN_CREDITS.business}
        userName="Owner Banc" userEmail="owner@exemple.invalid" roleLabel="Propriétaire" planLabel="Business" workspaceName="Agence Banc"
        collapsedInitial={!!o.collapsed} logout={async () => {}}>
        <div />
      </AppShell>,
    );
  });
}
const liste = () => document.querySelector<HTMLElement>('#nav-rail nav[aria-label="Navigation principale"]')!;
const pied = () => document.querySelector<HTMLElement>('#nav-rail [data-zone="pied-compte"]')!;

describe('Correctifs V5 · le rail défile AU-DESSUS du pied', () => {
  for (const collapsed of [false, true]) {
    it(`${collapsed ? 'replié' : 'déplié'} · la liste est un conteneur défilant distinct, le pied la suit dans le flux`, () => {
      monter('/dashboard', { collapsed });
      const aside = document.getElementById('nav-rail')!;
      const n = liste(); const p = pied();
      expect(n.style.overflowY, 'la liste ne défile pas').toBe('auto');
      expect(n.style.minHeight, 'la liste ne peut pas rétrécir').toBe('0px');
      expect(n.style.flex.startsWith('1'), 'la liste ne prend pas la place restante').toBe(true);
      // Le pied est un frère qui SUIT la liste dans le rail, pas un de ses descendants.
      expect(n.contains(p), 'le pied est dans la liste qui défile').toBe(false);
      expect(p.parentElement, 'le pied a quitté le rail').toBe(aside);
      expect(n.parentElement).toBe(aside);
      expect(n.compareDocumentPosition(p) & Node.DOCUMENT_POSITION_FOLLOWING, 'le pied ne suit pas la liste').toBeTruthy();
      // Jamais posé par-dessus · ni hors flux, ni remonté, ni écrasable.
      expect(['', 'static', 'relative'], 'le pied est posé par-dessus la liste').toContain(p.style.position);
      expect(p.style.marginTop === '' || parseFloat(p.style.marginTop) >= 0, 'le pied remonte sur la liste').toBe(true);
      expect(p.style.transform, 'le pied est déplacé sur la liste').toBe('');
      expect(p.style.flexShrink, 'le pied peut être écrasé').toBe('0');
      // Toutes les entrées du rail vivent dans la liste (rien dans le pied).
      const entrees = [...aside.querySelectorAll('a[href]')].filter((a) => !a.closest('[data-zone="tete-rail"]'));
      expect(entrees.length).toBeGreaterThan(4);
      for (const a of entrees) expect(n.contains(a), `« ${a.textContent || a.getAttribute('aria-label')} » hors de la liste`).toBe(true);
    });
  }

  it('il reste du contenu dessous · fondu de fin sur la liste et filet au seuil du pied ; tout en bas · fondu de tête seul', () => {
    monter('/dashboard');
    const n = liste();
    expect(n.style.maskImage, 'aucun indice de défilement alors que la liste déborde').toContain(`calc(100% - ${FONDU_RAIL}px), transparent 100%`);
    expect(n.style.maskImage, 'fondu de tête alors qu’on est en haut').not.toMatch(/^linear-gradient\(to bottom, transparent/);
    expect(pied().style.borderTop).toContain('var(--line-2)');
    // Défilé jusqu'en bas · le fondu de fin et le filet tombent, le fondu de tête paraît.
    act(() => { n.scrollTop = MESURE.contenu - MESURE.visible; n.dispatchEvent(new Event('scroll')); });
    expect(n.style.maskImage).toMatch(/^linear-gradient\(to bottom, transparent 0/);
    expect(n.style.maskImage).not.toContain('transparent 100%');
    expect(pied().style.borderTop).toContain('transparent');
  });

  it('tout tient · aucun masque, aucun filet', () => {
    espions.push(vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockImplementation(function (this: HTMLElement) { return estListe(this) ? MESURE.visible : 0; }));
    monter('/dashboard');
    expect(liste().style.maskImage).toBe('');
    expect(pied().style.borderTop).toContain('transparent');
  });

  for (const collapsed of [false, true]) {
    it(`${collapsed ? 'replié' : 'déplié'} · l’entrée active hors de la vue (« Marques » sur /brands) est ramenée au-dessus du fondu`, () => {
      monter(ENTREE_BAS, { collapsed });
      const n = liste();
      const actif = n.querySelector('[aria-current]')!;
      expect(actif, 'aucune entrée active sur /brands').toBeTruthy();
      expect(actif.getAttribute('href')).toBe(ENTREE_BAS);
      const r = actif.getBoundingClientRect();
      const vue = n.getBoundingClientRect();
      expect(r.top, 'l’entrée active est au-dessus de la vue').toBeGreaterThanOrEqual(vue.top);
      expect(r.bottom, 'l’entrée active reste sous le fondu ou hors de la vue').toBeLessThanOrEqual(vue.bottom - FONDU_RAIL);
    });
  }
});

describe('Correctifs V5 · le menu de recharge a la largeur de ses rangées', () => {
  /** Rangée la plus large mesurée sur le banc (« +20 000 crédits 279 € Acheter ») + padding 2 × 12 + bord 2 × 1. */
  const LARGEUR_MESUREE = 246.4 + 24 + 2;
  for (const collapsed of [false, true]) {
    it(`${collapsed ? 'replié' : 'déplié'} · panneau ≥ largeur mesurée, prix sur une ligne, packs et prix inchangés`, () => {
      act(() => { root!.render(<CreditsMenu balance={500} unlimited={false} planLabel="Business" showUpgrade={false} collapsed={collapsed} allocation={PLAN_CREDITS.business} />); });
      act(() => { document.querySelector<HTMLButtonElement>('[data-zone="pastille-credits"]')!.click(); });
      const panneau = document.querySelector<HTMLElement>('[data-zone="menu-recharge"]')!;
      expect(panneau, 'le menu de recharge ne s’ouvre pas').toBeTruthy();
      const min = parseFloat(panneau.style.minWidth);
      expect(Number.isFinite(min) && min >= LARGEUR_MESUREE, `le panneau de recharge est plus étroit que ses rangées (min-width « ${panneau.style.minWidth} »)`).toBe(true);
      expect(min).toBe(COQUILLE_V5.credits.menuLargeurMin);
      expect(panneau.style.width, 'le panneau reprend la largeur de la pastille').not.toBe('100%');
      // Ancré au bord de la pastille, au-dessus d'elle · et dans un écran de 390.
      expect(panneau.style.left).toBe('0px');
      expect(panneau.style.bottom).toBe('calc(100% + 8px)');
      expect(12 + min).toBeLessThanOrEqual(390 - 16);
      const prix = [...panneau.querySelectorAll<HTMLElement>('[data-prix]')];
      expect(prix.map((p) => p.textContent), 'packs ou prix modifiés').toEqual(CREDIT_PACKS.map((p) => `${p.eur} €`));
      for (const p of prix) expect(p.style.whiteSpace, `« ${p.textContent} » peut passer sur deux lignes`).toBe('nowrap');
    });
  }
});
