import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

/**
 * Lot 19B · l'entrée « Connaissances » du rail ADMIN+ et de la palette.
 *
 * On REND la vraie coquille. `isStaff` est ce que le layout calcule pour
 * l'équipe plateforme · vrai → l'entrée est dans le rail (sur une route
 * plateforme) et dans la palette ; faux (owner ou admin d'ESPACE) → elle
 * n'apparaît nulle part, ni rail ni palette.
 */
const h = vi.hoisted(() => ({ chemin: '/admin/connaissances' }));
vi.mock('next/navigation', () => ({ usePathname: () => h.chemin, useSearchParams: () => new URLSearchParams(), useRouter: () => ({ push() {}, refresh() {}, replace() {} }) }));
vi.mock('../components/CommandPalette', () => ({
  openCommandPalette: () => {},
  CommandPalette: ({ commands }: { commands: Array<{ href?: string }> }) => <pre data-commandes>{JSON.stringify(commands.map((c) => c.href))}</pre>,
}));
vi.mock('../components/NotificationBell', () => ({ NotificationBell: () => null }));
vi.mock('../components/SupportWidget', () => ({ SupportWidget: () => null }));
vi.mock('../components/ProfileModal', () => ({ ProfileModal: () => null }));
vi.mock('../components/QuickSettingsModal', () => ({ QuickSettingsModal: () => null }));
vi.mock('../components/CreditsMenu', () => ({ CreditsMenu: () => null }));
vi.mock('../components/BrandSwitcher', () => ({ BrandSwitcher: () => null }));
vi.mock('../components/Breadcrumb', () => ({ Breadcrumb: () => null }));

import { AppShell } from '../components/AppShell';
import { railNav, accountSections, ouverturesParRole } from '../lib/rbac';

function rendu(role: 'owner' | 'admin', isStaff: boolean, chemin: string): { rail: string; palette: string[] } {
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
  const rail = /<nav aria-label="Navigation principale"[\s\S]*?<\/nav>/.exec(html)?.[0] ?? '';
  const palette = JSON.parse((/<pre data-commandes="[^"]*">([\s\S]*?)<\/pre>/.exec(html)?.[1] ?? '[]').replace(/&quot;/g, '"')) as string[];
  return { rail, palette };
}

describe('Rail ADMIN+ · l’entrée Connaissances', () => {
  it('équipe plateforme · présente dans le rail (sur une route plateforme) et dans la palette', () => {
    for (const chemin of ['/admin', '/admin/connaissances']) {
      const { rail, palette } = rendu('owner', true, chemin);
      expect(rail).toMatch(/<a[^>]*href="\/admin\/connaissances"[^>]*>[\s\S]*?Connaissances/);
      expect(palette).toContain('/admin/connaissances');
    }
  });

  it('owner ou admin d’ESPACE · absente du rail et de la palette', () => {
    for (const role of ['owner', 'admin'] as const) {
      for (const chemin of ['/dashboard', '/admin/connaissances']) {
        const { rail, palette } = rendu(role, false, chemin);
        expect(rail).not.toBe('');
        expect(rail).not.toContain('/admin/connaissances');
        expect(palette).not.toContain('/admin/connaissances');
      }
    }
  });
});
