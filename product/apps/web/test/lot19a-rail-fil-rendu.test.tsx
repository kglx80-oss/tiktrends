import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactNode } from 'react';

/**
 * Lot 19A · le Pilotage regroupé sous l'Accueil · garde de RENDU de la coquille.
 *
 * On REND la vraie coquille (rail réel de lib/rbac, libellés du layout, vrai fil
 * d'Ariane) à une adresse donnée et on lit le HTML :
 *  - sur `/dashboard?vue=analytics`, « Analytics » (sous Accueil) porte
 *    `aria-current="page"`, seul ; sur `/dashboard`, « Accueil » seul ;
 *  - le fil dit « Accueil › <marque> › Analytics » sur la vue, rien sur l'Accueil ;
 *  - le maillon « Accueil » du fil (même chemin) est un lien NATIF ;
 *  - un rôle sans droit Analytics n'a pas l'entrée.
 */
const ici = { pathname: '/dashboard', recherche: '' };
vi.mock('next/navigation', () => ({
  usePathname: () => ici.pathname,
  useSearchParams: () => new URLSearchParams(ici.recherche),
  useRouter: () => ({ push() {}, refresh() {}, replace() {} }),
}));
// Un <Link> Next se reconnaît au rendu · on le marque.
vi.mock('next/link', () => ({ default: ({ href, children, prefetch: _p, ...reste }: { href: string; children: ReactNode; prefetch?: unknown } & Record<string, unknown>) => <a data-lien-routeur="" href={href} {...reste}>{children}</a> }));
vi.mock('../components/CommandPalette', () => ({ openCommandPalette: () => {}, CommandPalette: () => null }));
vi.mock('../components/NotificationBell', () => ({ NotificationBell: () => null }));
vi.mock('../components/SupportWidget', () => ({ SupportWidget: () => null }));
vi.mock('../components/ProfileModal', () => ({ ProfileModal: () => null }));
vi.mock('../components/QuickSettingsModal', () => ({ QuickSettingsModal: () => null }));
vi.mock('../components/CreditsMenu', () => ({ CreditsMenu: () => null }));
vi.mock('../components/BrandSwitcher', () => ({ BrandSwitcher: () => null }));

import { AppShell } from '../components/AppShell';
import { railNav, accountSections, ouverturesParRole, RAIL_GROUP_LABEL, type Access } from '../lib/rbac';

const proprietaire: Access = { role: 'owner', plan: 'business' };
// Équipe plateforme « membre » · sa matrice par défaut n'ouvre pas Analytics.
const sansAnalytics: Access = { role: 'member', plan: 'business', equipe: { role: 'membre', matrice: {} } };

function coquille(adresse: string, a: Access = proprietaire): string {
  const [p, q] = adresse.split('?');
  ici.pathname = p!; ici.recherche = q ?? '';
  return renderToStaticMarkup(
    <AppShell nav={railNav(a).map((g) => ({ ...g, group: RAIL_GROUP_LABEL[g.group] ?? g.group }))} accountGroups={accountSections(a)} ouvertures={ouverturesParRole(a)}
      isStaff={false} showUpgrade={false} brands={[{ id: 'b1', name: 'Neva' }]} activeBrandId="b1" canManageBrands
      creditBalance={0} creditsUnlimited={false} userName="U" userEmail="u@exemple.invalid" roleLabel="r" planLabel="p" workspaceName="Espace"
      collapsedInitial={false} logout={async () => {}}>
      <div />
    </AppShell>,
  );
}
const texte = (h: string) => h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const rail = (h: string) => { const i = h.indexOf('aria-label="Navigation principale"'); return h.slice(i, h.indexOf('</nav>', i)); };
/** Les entrées du rail allumées (`aria-current="page"`), par libellé. */
const allumees = (h: string) => [...rail(h).matchAll(/<a [^>]*aria-current="page"[^>]*>([\s\S]*?)<\/a>/g)].map((m) => texte(m[1]!));
const entree = (h: string, href: string) => new RegExp(`<a [^>]*href="${href.replace(/[?]/g, '\\?')}"`).exec(rail(h))?.[0] ?? null;
const fil = (h: string) => { const i = h.indexOf('aria-label="Fil d’Ariane"'); return i < 0 ? null : h.slice(i, h.indexOf('</nav>', i)); };

beforeEach(() => { ici.pathname = '/dashboard'; ici.recherche = ''; });

describe('rail · Analytics sous Accueil, une seule entrée allumée', () => {
  it('Accueil par défaut · « Accueil » seul allumé, « Analytics » visible sous lui', () => {
    const h = coquille('/dashboard');
    expect(allumees(h), 'sur l’Accueil, l’entrée allumée doit être « Accueil » seule').toEqual(['Accueil']);
    expect(entree(h, '/dashboard?vue=analytics'), 'Analytics manque sous Accueil').not.toBeNull();
    expect(h, 'un lien du rail mène encore à /analytics').not.toMatch(/href="\/analytics"/);
  });

  it('vue Analytics · « Analytics » seul allumé (aria-current), Accueil ne l’est plus', () => {
    const h = coquille('/dashboard?vue=analytics');
    expect(allumees(h), 'sur la vue, l’entrée allumée doit être « Analytics » seule').toEqual(['Analytics']);
  });

  it('ailleurs (Veille, Adsmap) · « Analytics » reste à un clic (branche Accueil dépliée d’office), rien n’est allumé à tort', () => {
    for (const adresse of ['/veille', '/adsmap/suites']) {
      const h = coquille(adresse);
      expect(entree(h, '/dashboard?vue=analytics'), `Analytics caché sous Accueil replié sur ${adresse}`).not.toBeNull();
      expect(allumees(h), adresse).not.toContain('Analytics');
      expect(allumees(h), adresse).not.toContain('Accueil');
    }
  });

  it('aucune section « Piloter » dans le rail', () => {
    expect(texte(rail(coquille('/dashboard')))).not.toMatch(/Piloter/i);
  });

  it('rôle sans droit Analytics · pas d’entrée Analytics', () => {
    const h = coquille('/dashboard', sansAnalytics);
    expect(entree(h, '/dashboard?vue=analytics'), 'Analytics proposé à un rôle qui ne l’ouvre pas').toBeNull();
    expect(allumees(h)).toEqual(['Accueil']);
  });
});

describe('fil d’Ariane · la vue Analytics se nomme', () => {
  it('sur la vue · « Accueil › Neva › Analytics », l’Accueil en lien NATIF', () => {
    const f = fil(coquille('/dashboard?vue=analytics'));
    expect(f, 'pas de fil sur la vue Analytics').not.toBeNull();
    expect(texte(f!.slice(f!.indexOf('>') + 1)), 'le fil ne nomme pas la vue').toBe('Accueil › Neva › Analytics');
    const accueil = /<a [^>]*href="\/dashboard"[^>]*>/.exec(f!)?.[0];
    expect(accueil, 'le maillon Accueil n’est pas un lien').toBeTruthy();
    expect(accueil!, 'le maillon Accueil passe par le routeur client (même chemin)').not.toContain('data-lien-routeur');
  });

  it('sur l’Accueil par défaut · aucun fil (racine)', () => {
    expect(fil(coquille('/dashboard'))).toBeNull();
  });

  it('ailleurs, le fil n’a pas bougé (lien routeur, section)', () => {
    const f = fil(coquille('/adsmap/suites'))!;
    expect(texte(f.slice(f.indexOf('>') + 1))).toBe('Accueil › Laboratoire › Neva › Adsmap › Suites');
    expect(/<a [^>]*href="\/dashboard"[^>]*>/.exec(f)?.[0]).toContain('data-lien-routeur');
  });
});
