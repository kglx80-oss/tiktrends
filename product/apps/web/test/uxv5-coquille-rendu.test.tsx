// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * Lot V5 · B · la coquille V5 RENDUE, sur les vrais droits.
 *
 * On monte la vraie coquille (rail réel de lib/rbac, menu de compte réel
 * `sectionsCompteOuvertes`, vraie pastille `CreditsMenu`, vraie pop-up profil,
 * vraie palette) et on lit le DOM :
 *  - le rail · ordre et droits par rôle, barre active V5, « [ » et Alt B ;
 *  - la pastille · solde réel formaté, barre = solde / dotation, illimité,
 *    « + » qui ouvre le menu de recharge existant ;
 *  - la pop-up profil · entrées par rôle identiques aux droits actuels, ADMIN+
 *    seulement pour l'équipe plateforme, focus rendu à l'avatar ;
 *  - l'en-tête · fil d'Ariane, recherche qui ouvre la palette, cloche, avatar ;
 *  - aucun avertissement React de style.
 */
const ici = { pathname: '/dashboard', recherche: '' };
vi.mock('next/navigation', () => ({
  usePathname: () => ici.pathname,
  useSearchParams: () => new URLSearchParams(ici.recherche),
  useRouter: () => ({ push() {}, refresh() {}, replace() {} }),
}));
vi.mock('next/link', () => ({ default: ({ href, children, prefetch: _p, ...reste }: { href: string; children: ReactNode; prefetch?: unknown } & Record<string, unknown>) => <a href={href} {...reste}>{children}</a> }));
vi.mock('../components/NotificationBell', () => ({ NotificationBell: ({ enLigne }: { enLigne?: boolean }) => <button type="button" aria-label="Notifications" data-en-ligne={String(!!enLigne)} /> }));
vi.mock('../components/SupportWidget', () => ({ SupportWidget: () => null }));
vi.mock('../components/ProfileModal', () => ({ ProfileModal: () => null }));
vi.mock('../components/QuickSettingsModal', () => ({ QuickSettingsModal: () => null }));
vi.mock('../components/BrandSwitcher', () => ({ BrandSwitcher: () => null }));
vi.mock('../app/actions/stripe', () => ({ createTopupCheckoutAction: vi.fn() }));

const { AppShell } = await import('../components/AppShell');
const { railNav, sectionsCompteOuvertes, ouverturesParRole, RAIL_GROUP_LABEL, PLAN_CREDITS } = await import('../lib/rbac');
const { CREDIT_PACKS } = await import('../lib/credit-packs');
type Access = import('../lib/rbac').Access;

const ROLES: Record<string, { a: Access; staff: boolean }> = {
  owner: { a: { role: 'owner', plan: 'core' }, staff: false },
  admin: { a: { role: 'admin', plan: 'core' }, staff: false },
  member: { a: { role: 'member', plan: 'core' }, staff: false },
  client_viewer: { a: { role: 'client_viewer', plan: 'core' }, staff: false },
  staff: { a: { role: 'owner', plan: 'business' }, staff: true },
};
const fr = (n: number) => n.toLocaleString('fr-FR');

let root: Root | null = null;
let el: HTMLDivElement | null = null;
let erreurs: string[] = [];
let espion: ReturnType<typeof vi.spyOn> | null = null;
beforeEach(() => {
  el = document.createElement('div'); document.body.appendChild(el); root = createRoot(el);
  document.cookie = 'tt_rail=; Max-Age=0; Path=/';
  erreurs = [];
  espion = vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => { erreurs.push(args.map(String).join(' ')); });
});
afterEach(() => {
  act(() => { root?.unmount(); }); el?.remove(); root = null; el = null; document.body.innerHTML = '';
  espion?.mockRestore();
  // Aucun avertissement React de style (raccourci + détail mêlés, valeur invalide…).
  expect(erreurs.filter((e) => /style|shorthand|CSS/i.test(e)), 'avertissement React de style').toEqual([]);
});

function monter(adresse: string, role: keyof typeof ROLES = 'owner', o: { collapsed?: boolean; balance?: number; unlimited?: boolean } = {}) {
  const [p, q] = adresse.split('?');
  ici.pathname = p!; ici.recherche = q ?? '';
  const { a, staff } = ROLES[role]!;
  act(() => {
    root!.render(
      <AppShell nav={railNav(a).map((g) => ({ ...g, group: RAIL_GROUP_LABEL[g.group] ?? g.group }))} accountGroups={sectionsCompteOuvertes(a)} ouvertures={ouverturesParRole(a)}
        isStaff={staff} showUpgrade={false} brands={[{ id: 'b1', name: 'Neva' }]} activeBrandId="b1" canManageBrands={a.role === 'owner' || a.role === 'admin'}
        creditBalance={o.balance ?? 1240} creditsUnlimited={!!o.unlimited} creditAllocation={PLAN_CREDITS[a.plan]}
        userName="Kevin Guilbaux" userEmail="k@exemple.invalid" roleLabel="Propriétaire" planLabel="Core" workspaceName="Agence GLX"
        collapsedInitial={!!o.collapsed} logout={async () => {}}>
        <div />
      </AppShell>,
    );
  });
}
const txt = (e: Element) => (e.textContent ?? '').replace(/\s+/g, ' ').trim();
const rail = () => document.querySelector('nav[aria-label="Navigation principale"]')!;
const entreesRail = () => [...rail().querySelectorAll('a')].map((x) => [txt(x) || x.getAttribute('aria-label'), x.getAttribute('href')]);
const clic = (x: Element | null | undefined) => { expect(x, 'élément introuvable').toBeTruthy(); act(() => { (x as HTMLElement).click(); }); };
const touche = (init: KeyboardEventInit, cible: EventTarget = window) => act(() => { cible.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, ...init })); });
const popup = () => document.querySelector('[data-zone="popup-profil"]');
const avatar = () => document.querySelector<HTMLButtonElement>('header button[data-zone="avatar-en-tete"]')!;
const entreesPopup = () => [...(popup()?.querySelectorAll('[data-entree-profil]') ?? [])].map((x) => [x.querySelector('strong')?.textContent ?? '', x.getAttribute('href')]);

describe('V5 · rail · ordre et droits par rôle (railNav inchangé)', () => {
  it('chaque rôle voit exactement les têtes que ses droits ouvrent, dans l’ordre, puis Votre espace et l’Aide', () => {
    for (const role of Object.keys(ROLES)) {
      monter('/dashboard', role);
      const { a } = ROLES[role]!;
      const tetes = railNav(a).flatMap((g) => g.items).filter((i) => !i.isSub);
      const espace = (sectionsCompteOuvertes(a).find((g) => g.section === 'Espace')?.items ?? []).filter((i) => i.key === 'brands' || i.key === 'settings');
      const attendu = [
        ...tetes.map((t) => [t.label, t.locked ? null : t.href]),
        ...espace.map((t) => [t.label, t.href]),
        ['Aide', '/support'],
      ].filter((x) => x[1] !== null);
      expect(entreesRail(), `rail du rôle ${role}`).toEqual(attendu);
    }
  });

  it('propriétaire · les six modules V5 dans l’ordre, client en lecture · l’Accueil seul', () => {
    monter('/dashboard', 'owner');
    // Les six têtes, liens ou entrées verrouillées par la formule (Résultats en Core).
    const modules = [...rail().firstElementChild!.children].map(txt);
    expect(modules).toEqual(['Accueil', 'Veille', 'Studios', 'Bibliothèque', 'Résultats', 'Jarvis']);
    monter('/dashboard', 'client_viewer');
    expect(entreesRail().map((x) => x[0])).toEqual(['Accueil', 'Aide']);
  });

  it('le rail créatif ne porte plus « Administration », même pour l’équipe plateforme', () => {
    monter('/dashboard', 'staff');
    expect(entreesRail().map((x) => x[1])).not.toContain('/admin');
  });
});

describe('V5 · rail · état actif et mot-symbole', () => {
  it('l’entrée courante porte la barre V5 et le fond de sélection, elle seule', () => {
    monter('/veille');
    const barres = [...rail().querySelectorAll('[data-barre-active]')];
    expect(barres.length, 'une barre active et une seule').toBe(1);
    expect(barres[0]!.closest('a')?.getAttribute('href')).toBe('/veille');
    expect((barres[0]!.parentElement as HTMLElement).style.background).toBe('var(--accent-soft)');
    // Sur un descendant (Sauvegardes), la section reste allumée.
    monter('/saved');
    expect([...rail().querySelectorAll('[data-barre-active]')].map((b) => b.closest('a')?.getAttribute('href'))).toEqual(['/veille']);
  });

  it('replié · la barre suit l’icône de la section', () => {
    monter('/saved', 'owner', { collapsed: true });
    expect([...rail().querySelectorAll('[data-barre-active]')].map((b) => b.closest('a')?.getAttribute('aria-label'))).toEqual(['Veille · Sauvegardes']);
  });

  it('le rail se nomme « tiktrends. » (déplié) et « t. » (replié), lien d’accueil', () => {
    monter('/veille');
    const logo = document.querySelector('#nav-rail [data-zone="tete-rail"] a[aria-label="Accueil"]')!;
    expect(txt(logo)).toBe('tiktrends.');
    expect(logo.getAttribute('href')).toBe('/dashboard');
    act(() => { root!.unmount(); }); root = createRoot(el!);
    monter('/veille', 'owner', { collapsed: true });
    expect(txt(document.querySelector('#nav-rail [data-zone="tete-rail"] a[aria-label="Accueil"]')!)).toBe('t.');
  });
});

describe('V5 · « [ » réduit et déploie le rail (même règle qu’Alt B)', () => {
  it('« [ » replie puis redéploie, et mémorise le choix dans le cookie du rail', () => {
    monter('/dashboard');
    touche({ key: '[', code: 'BracketLeft' });
    expect(document.querySelector('button[aria-label="Développer la barre"]'), '« [ » n’a pas replié le rail').not.toBeNull();
    expect(document.cookie).toContain('tt_rail=1');
    touche({ key: '[', code: 'BracketLeft' });
    expect(document.querySelector('button[aria-label="Réduire la barre"]'), '« [ » n’a pas redéployé le rail').not.toBeNull();
  });

  it('pendant une saisie ou derrière une fenêtre ouverte, « [ » n’agit pas', () => {
    monter('/dashboard');
    const champ = document.createElement('input'); document.body.appendChild(champ);
    touche({ key: '[', code: 'BracketLeft' }, champ);
    expect(document.querySelector('button[aria-label="Réduire la barre"]'), '« [ » a agi pendant une saisie').not.toBeNull();
    clic(avatar());
    touche({ key: '[', code: 'BracketLeft' });
    expect(document.querySelector('button[aria-label="Réduire la barre"]'), '« [ » a agi derrière la pop-up').not.toBeNull();
  });
});

describe('V5 · pastille de crédits (solde réel, barre, recharge existante)', () => {
  const pastille = () => document.querySelector('#nav-rail [data-zone="pastille-credits"]')!;
  it('le solde réel formaté, et la barre solde / dotation de la formule', () => {
    monter('/dashboard', 'owner', { balance: 1240 });
    expect(pastille().querySelector('[data-solde]')?.textContent).toBe(fr(1240));
    // Core · 2 000 crédits par mois · 1 240 / 2 000 = 62 %.
    const jauge = pastille().querySelector<HTMLElement>('[data-jauge]')!;
    expect(jauge.getAttribute('data-jauge')).toBe('62');
    expect((jauge.firstElementChild as HTMLElement).style.width).toBe('62%');
    expect(pastille().getAttribute('aria-label')).toContain(`${fr(1240)} sur ${fr(2000)}`);
  });

  it('illimité · « Illimité », sans barre', () => {
    monter('/dashboard', 'staff', { unlimited: true });
    expect(pastille().querySelector('[data-solde]')?.textContent).toBe('Illimité');
    expect(pastille().querySelector('[data-jauge]')).toBeNull();
  });

  it('le « + » ouvre le menu de recharge EXISTANT · mêmes packs, même action', () => {
    monter('/dashboard', 'owner');
    clic(pastille().querySelector('[data-plus]'));
    expect(pastille().getAttribute('aria-expanded')).toBe('true');
    const menu = pastille().parentElement!;
    expect(txt(menu)).toContain('Recharge ponctuelle');
    const packs = [...menu.querySelectorAll('form input[name="pack"]')].map((i) => (i as HTMLInputElement).value);
    expect(packs).toEqual(CREDIT_PACKS.map((p) => p.key));
  });
});

describe('V5 · pop-up profil · entrées par rôle = droits actuels', () => {
  /** Ce que l'ancien menu de compte + l'ancien menu d'espace ouvraient, hors « Marques » (rail). */
  const attendu = (role: keyof typeof ROLES) => {
    const g = sectionsCompteOuvertes(ROLES[role]!.a);
    const espace = (g.find((x) => x.section === 'Espace')?.items ?? []).filter((i) => i.key !== 'brands');
    const compte = g.find((x) => x.section === 'Compte')?.items ?? [];
    return {
      hrefs: [...espace.filter((i) => i.key !== 'settings').map((i) => i.href), ...(ROLES[role]!.staff ? ['/admin'] : []), ...compte.map((i) => i.href)].sort(),
      reglagesRapides: espace.some((i) => i.key === 'settings'),
    };
  };

  for (const role of Object.keys(ROLES) as Array<keyof typeof ROLES>) {
    it(`${role} · mêmes destinations qu’avant, rien d’élargi`, () => {
      monter('/dashboard', role);
      clic(avatar());
      expect(popup(), 'la pop-up ne s’ouvre pas').not.toBeNull();
      const e = entreesPopup();
      expect(e.map((x) => x[1]).filter(Boolean).sort(), `destinations du rôle ${role}`).toEqual(attendu(role).hrefs);
      expect(e.some((x) => x[0] === 'Espace de travail'), `réglages rapides · ${role}`).toBe(attendu(role).reglagesRapides);
      // Toujours · Mon profil, Langue, Déconnexion (repris de l'ancien menu).
      expect(e.map((x) => x[0])).toContain('Mon profil');
      expect(txt(popup()!)).toContain('Langue');
      expect(popup()!.querySelector('form button[type="submit"]')?.textContent).toContain('Déconnexion');
      // ADMIN+ seulement pour l'équipe plateforme.
      expect(!!popup()!.querySelector('[data-entree-profil="admin-plus"]'), `ADMIN+ · ${role}`).toBe(ROLES[role]!.staff);
    });
  }

  it('propriétaire · les libellés V5, dans l’ordre V5', () => {
    monter('/dashboard', 'owner');
    clic(avatar());
    expect(entreesPopup().map((x) => x[0])).toEqual(['Mon profil', 'Espace de travail', 'Équipe', 'Connexions', 'Crédits & utilisation', 'Abonnement & factures', 'Aide & support']);
    expect(txt(popup()!)).toContain('Agence GLX · Propriétaire');
  });

  it('le focus revient à l’avatar qui l’a ouverte (Échap), en-tête comme rail', () => {
    monter('/dashboard', 'owner');
    clic(avatar());
    touche({ key: 'Escape' });
    expect(popup(), 'Échap ne ferme pas la pop-up').toBeNull();
    expect(document.activeElement, 'le focus n’est pas rendu à l’avatar de l’en-tête').toBe(avatar());
    const bloc = document.querySelector<HTMLButtonElement>('#nav-rail button[data-zone="profil-rail"]')!;
    expect(txt(bloc)).toContain('Profil & réglages');
    clic(bloc);
    touche({ key: 'Escape' });
    expect(document.activeElement, 'le focus n’est pas rendu au bloc profil du rail').toBe(bloc);
  });
});

describe('V5 · en-tête', () => {
  const entete = () => document.querySelector<HTMLElement>('header[data-zone="en-tete"]')!;
  it('68 px · fil d’Ariane DANS l’en-tête, cloche puis avatar à droite', () => {
    monter('/adsmap/suites');
    expect(entete().style.height).toBe('68px');
    const fil = entete().querySelector('nav[aria-label="Fil d’Ariane"]');
    expect(fil, 'le fil n’est pas dans l’en-tête').not.toBeNull();
    expect(txt(fil!).replace(/\s/g, '')).toBe('Accueil›Neva›Résultats›Suites');
    expect(document.querySelectorAll('nav[aria-label="Fil d’Ariane"]').length, 'le fil est rendu deux fois').toBe(1);
    const droite = [...entete().querySelectorAll('button')].slice(-2);
    expect(droite.map((b) => b.getAttribute('aria-label'))).toEqual(['Notifications', 'Profil et réglages']);
    expect(droite[0]!.getAttribute('data-en-ligne'), 'la cloche flotte encore hors de l’en-tête').toBe('true');
  });

  it('la recherche ouvre la palette ⌘K réelle', () => {
    monter('/dashboard');
    expect(document.querySelector('[role="dialog"][aria-label="Recherche et navigation"]')).toBeNull();
    clic(entete().querySelector('button[aria-label="Rechercher"]'));
    expect(document.querySelector('[role="dialog"][aria-label="Recherche et navigation"]'), 'la recherche n’ouvre pas la palette').not.toBeNull();
  });
});

describe('V5 · mobile · tiroir et profil conservés', () => {
  let avant: typeof window.matchMedia;
  beforeEach(() => {
    avant = window.matchMedia;
    window.matchMedia = ((q: string) => ({ matches: true, media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
  });
  afterEach(() => { window.matchMedia = avant; });

  it('menu escamotable (dialog, inerte fermé), mot-symbole et avatar dans l’en-tête, fil sur sa rangée', () => {
    monter('/adsmap/suites');
    const tiroir = document.querySelector('#nav-rail')!;
    expect(tiroir.getAttribute('role')).toBe('dialog');
    expect(tiroir.hasAttribute('inert'), 'le tiroir fermé reste atteignable au clavier').toBe(true);
    const entete = document.querySelector('header[data-zone="en-tete"]')!;
    expect(entete.querySelector('button[aria-controls="nav-rail"]')).not.toBeNull();
    expect(entete.querySelector('a[aria-label="Accueil"]')).not.toBeNull();
    expect(entete.querySelector('button[data-zone="avatar-en-tete"]'), 'profil inaccessible sur mobile').not.toBeNull();
    expect(entete.querySelector('nav[aria-label="Fil d’Ariane"]')).toBeNull();
    expect(document.querySelector('nav[aria-label="Fil d’Ariane"]'), 'le fil a disparu sur mobile').not.toBeNull();
    clic(entete.querySelector('button[data-zone="avatar-en-tete"]'));
    expect(popup(), 'la pop-up profil ne s’ouvre pas sur mobile').not.toBeNull();
  });
});
