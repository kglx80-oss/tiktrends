import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

/**
 * Lot 15 · le rail défile · avec un nom de marque long (sélecteur haut), la
 * navigation, élément flex sans `min-height: 0`, refusait de rétrécir · les
 * rubriques du bas sortaient du rail (mesuré à 1280×720 et 390). On REND la
 * vraie coquille et on lit le style de la navigation. (Montage repris du lot 12 ·
 * la palette ⌘K selon le rôle.) Audit (lecture seule) · « Générer des
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
import { railNav, accountSections, ouverturesParRole } from '../lib/rbac';

describe('Rail · la navigation défile au lieu de déborder', () => {
  it('la liste de navigation peut rétrécir (min-height 0) et défile verticalement', () => {
    const a = { role: 'owner' as const, plan: 'business' as const };
    const html = renderToStaticMarkup(
      <AppShell nav={railNav(a).map((g) => ({ ...g, group: g.group }))} accountGroups={accountSections(a)} ouvertures={ouverturesParRole(a)}
        isStaff={false} showUpgrade={false} brands={[{ id: 'b1', name: 'Maison Lumière des Herboristes Associés · Collection Printemps-Été Édition Limitée' }]} activeBrandId="b1" canManageBrands
        creditBalance={0} creditsUnlimited={false} userName="U" userEmail="u@exemple.invalid" roleLabel="r" planLabel="p" workspaceName="Espace"
        collapsedInitial={false} logout={async () => {}}>
        <div />
      </AppShell>,
    );
    const style = /<nav aria-label="Navigation principale" style="([^"]*)"/.exec(html)?.[1] ?? '';
    expect(style, 'navigation introuvable').not.toBe('');
    expect(style, 'la navigation ne rétrécit pas · les rubriques du bas sortent du rail').toMatch(/min-height:0/);
    expect(style).toMatch(/overflow-y:auto/);
    expect(style).toMatch(/flex:1/);
  });
});
