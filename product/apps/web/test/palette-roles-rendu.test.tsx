import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

/**
 * Lot 12 · la palette ⌘K selon le rôle. Audit (lecture seule) · « Générer des
 * pubs IA », « Générer une image / une vidéo », « Ce que Jarvis sait », la
 * Veille étaient proposés au client en lecture (refus « Accès réservé » ou
 * renvoi silencieux), « Nouvelle marque » et les fiches de marque au membre et
 * au client (pages réservées aux admins). On REND la vraie coquille, avec les
 * ouvertures réelles de lib/rbac, et une palette factice qui écrit les
 * commandes reçues.
 */
vi.mock('next/navigation', () => ({ usePathname: () => '/dashboard', useSearchParams: () => new URLSearchParams(), useRouter: () => ({ push() {}, refresh() {}, replace() {} }) }));
vi.mock('../components/CommandPalette', () => ({
  openCommandPalette: () => {},
  CommandPalette: ({ commands }: { commands: Array<{ href?: string; locked?: boolean }> }) => <pre data-commandes>{JSON.stringify(commands.map((c) => [c.href, !!c.locked]))}</pre>,
}));
vi.mock('../components/NotificationBell', () => ({ NotificationBell: () => null }));
vi.mock('../components/SupportWidget', () => ({ SupportWidget: () => null }));
vi.mock('../components/ProfileModal', () => ({ ProfileModal: () => null }));
vi.mock('../components/QuickSettingsModal', () => ({ QuickSettingsModal: () => null }));
vi.mock('../components/CreditsMenu', () => ({ CreditsMenu: () => null }));
vi.mock('../components/BrandSwitcher', () => ({ BrandSwitcher: () => null }));
vi.mock('../components/Breadcrumb', () => ({ Breadcrumb: () => null }));

import { AppShell } from '../components/AppShell';
import { railNav, accountSections, ouverturesParRole, roleAtLeast, type Role, type Plan } from '../lib/rbac';

function commandes(role: Role, plan: Plan = 'business') {
  const a = { role, plan };
  const html = renderToStaticMarkup(
    <AppShell nav={railNav(a).map((g) => ({ ...g, group: g.group }))} accountGroups={accountSections(a)} ouvertures={ouverturesParRole(a)}
      isStaff={false} showUpgrade={false} brands={[{ id: 'b1', name: 'Neva' }]} activeBrandId="b1" canManageBrands={roleAtLeast(role, 'admin')}
      creditBalance={0} creditsUnlimited={false} userName="U" userEmail="u@exemple.invalid" roleLabel="r" planLabel="p" workspaceName="Espace"
      collapsedInitial={false} logout={async () => {}}>
      <div />
    </AppShell>,
  );
  const json = /<pre data-commandes="[^"]*">([\s\S]*?)<\/pre>/.exec(html)![1]!.replace(/&quot;/g, '"');
  return new Map(JSON.parse(json) as Array<[string, boolean]>);
}

describe('Palette ⌘K · ne propose que ce que le rôle ouvre', () => {
  it('client en lecture · ni génération, ni Jarvis, ni Veille, ni marque', () => {
    const c = commandes('client_viewer');
    for (const h of ['/studio/ads', '/studio/ads?mode=clone', '/studio/image', '/studio/video', '/jarvis', '/veille', '/veille/scale', '/brands/new', '/brands/b1']) {
      expect(c.has(h), `${h} proposé au client en lecture`).toBe(false);
    }
    expect(c.has('/dashboard')).toBe(true);
  });
  it('membre · génère, ne gère pas les marques', () => {
    const c = commandes('member');
    expect(c.has('/studio/ads')).toBe(true);
    expect(c.has('/brands/new'), 'Nouvelle marque proposée au membre').toBe(false);
    expect(c.has('/brands/b1'), 'fiche de marque proposée au membre').toBe(false);
  });
  it('admin · tout, et une rubrique verrouillée par la formule porte son cadenas', () => {
    const c = commandes('admin');
    for (const h of ['/brands/new', '/brands/b1', '/studio/ads', '/jarvis']) expect(c.has(h), h).toBe(true);
    const starter = commandes('admin', 'starter');
    expect(starter.get('/studio/ads'), 'verrou de formule sans cadenas').toBe(true);
  });
});

import { sectionsCompteOuvertes, accountSections as sections } from '../lib/rbac';
describe('Menu de compte · la section Espace suit la garde réelle des pages (lot 12)', () => {
  const hrefs = (g: ReturnType<typeof sections>) => g.flatMap((x) => x.items.map((i) => i.href));
  it('équipe plateforme « manager » avec un rôle d’espace membre · plus de Marques/Membres/Utilisation qui renvoient à l’accueil', () => {
    const a = { role: 'member' as const, plan: 'business' as const, equipe: { role: 'manager' as const, matrice: {} } };
    expect(hrefs(sections(a)), 'cas non reproduit · la matrice ne montre plus ces entrées').toContain('/brands');
    const h = hrefs(sectionsCompteOuvertes(a));
    for (const p of ['/brands', '/team', '/usage']) expect(h, p).not.toContain(p);
    expect(h).toContain('/support');
  });
  it('admin d’espace · section Espace intacte', () => {
    const a = { role: 'admin' as const, plan: 'business' as const };
    expect(hrefs(sectionsCompteOuvertes(a))).toEqual(hrefs(sections(a)));
  });
});
