import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

/**
 * V5 · écart #7 · ADMIN+ en espace SÉPARÉ.
 *
 * On REND la vraie coquille et on lit le HTML (doctrine : vérifier un RÉSULTAT,
 * pas qu'une fonction est appelée). Pour l'équipe plateforme sur une route
 * ADMIN+, l'espace doit :
 *  · porter `data-palette="admin"` à SA RACINE (le conteneur grille rail+contenu),
 *    d'où la palette bleu nuit / menthe de tokens.css ;
 *  · afficher un rail dédié qui liste les sections d'admin RÉELLES (ADMIN_NAV),
 *    libellés compris (texte VU, comparé échappé comme le rend React) ;
 *  · offrir un retour clair vers l'app créative (/dashboard).
 * Un non-staff (owner/admin d'ESPACE) n'entre jamais dans cet espace · ni
 * palette admin, ni rail admin, ni retour (garde `isStaff`, côté shell).
 */

const h = vi.hoisted(() => ({ chemin: '/admin' }));
vi.mock('next/navigation', () => ({ usePathname: () => h.chemin, useSearchParams: () => new URLSearchParams(), useRouter: () => ({ push() {}, refresh() {}, replace() {} }) }));
vi.mock('../components/CommandPalette', () => ({ openCommandPalette: () => {}, CommandPalette: () => null }));
vi.mock('../components/NotificationBell', () => ({ NotificationBell: () => null }));
vi.mock('../components/SupportWidget', () => ({ SupportWidget: () => null }));
vi.mock('../components/ProfileModal', () => ({ ProfileModal: () => null }));
vi.mock('../components/QuickSettingsModal', () => ({ QuickSettingsModal: () => null }));
vi.mock('../components/CreditsMenu', () => ({ CreditsMenu: () => null }));
vi.mock('../components/BrandSwitcher', () => ({ BrandSwitcher: () => null }));
vi.mock('../components/Breadcrumb', () => ({ Breadcrumb: () => null }));

import { AppShell, ADMIN_NAV } from '../components/AppShell';
import { railNav, accountSections, ouverturesParRole } from '../lib/rbac';

// Le texte VU · React échappe &, <, >, ", ' dans le HTML rendu · on compare donc
// les libellés à leur forme échappée (sans quoi « Équipe & droits » ne matche pas).
const echappe = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;');

function rendu(role: 'owner' | 'admin', isStaff: boolean, chemin: string): { html: string; racine: string; rail: string } {
  h.chemin = chemin;
  const a = { role, plan: 'business' as const };
  const html = renderToStaticMarkup(
    <AppShell nav={railNav(a).map((g) => ({ ...g, group: g.group }))} accountGroups={accountSections(a)} ouvertures={ouverturesParRole(a)}
      isStaff={isStaff} showUpgrade={false} brands={[{ id: 'b1', name: 'Neva' }]} activeBrandId="b1" canManageBrands
      creditBalance={0} creditsUnlimited={false} userName="U" userEmail="u@exemple.invalid" roleLabel="r" planLabel="p" workspaceName="Espace"
      collapsedInitial={false} logout={async () => {}}>
      <div />
    </AppShell>,
  );
  // La RACINE de l'espace · la balise ouvrante du tout premier <div> rendu.
  const racine = /^[\s\S]*?<div[^>]*>/.exec(html)?.[0] ?? '';
  const rail = /<nav aria-label="Navigation principale"[\s\S]*?<\/nav>/.exec(html)?.[0] ?? '';
  return { html, racine, rail };
}

describe('V5 #7 · espace ADMIN+ séparé (équipe plateforme)', () => {
  it('la racine de l’espace porte data-palette="admin" sur les routes ADMIN+', () => {
    for (const chemin of ['/admin', '/admin/finance', '/admin/incidents', '/console']) {
      const { racine } = rendu('owner', true, chemin);
      expect(racine, `racine sans palette admin sur ${chemin}`).toContain('data-palette="admin"');
    }
  });

  it('le rail dédié liste les sections d’admin réelles (ADMIN_NAV), href et libellé', () => {
    const { rail } = rendu('owner', true, '/admin');
    expect(rail).not.toBe('');
    for (const it of ADMIN_NAV) {
      expect(rail, `section admin manquante (href) : ${it.href}`).toMatch(new RegExp(`href="${it.href.replace(/\//g, '\\/')}"`));
      expect(rail, `libellé de section manquant : ${it.label}`).toContain(echappe(it.label));
    }
  });

  it('un retour clair vers l’app créative (/dashboard)', () => {
    const { rail } = rendu('owner', true, '/admin');
    // Le SEUL lien vers /dashboard du rail ADMIN+ est le retour · son libellé suit.
    expect(rail).toMatch(/<a[^>]*href="\/dashboard"[^>]*>[\s\S]*?Retour à l/);
  });
});

describe('V5 #7 · garde · un non-staff n’entre pas dans l’espace ADMIN+', () => {
  it('ni palette admin, ni rail admin, ni retour · même sur une route ADMIN+', () => {
    for (const role of ['owner', 'admin'] as const) {
      for (const chemin of ['/dashboard', '/admin', '/console']) {
        const { racine, rail, html } = rendu(role, false, chemin);
        expect(racine, `palette admin exposée à un non-staff sur ${chemin}`).not.toContain('data-palette="admin"');
        expect(rail).not.toBe('');
        expect(rail, `rail admin exposé à un non-staff sur ${chemin}`).not.toContain('href="/admin/finance"');
        expect(html, `retour ADMIN+ exposé à un non-staff sur ${chemin}`).not.toContain('Retour à l');
      }
    }
  });
});
