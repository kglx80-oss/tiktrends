// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

/**
 * Une seule entrée « Studios » dans le RAIL principal, au HTML rendu (retrait
 * des anciens studios, 10/10).
 *
 * On REND la vraie coquille (`AppShell`) avec ce que le layout lui passe
 * (`railNav(access)`), et on lit le rail :
 *
 *  · un membre qui a le droit Studio voit UNE entrée « Studios » qui mène à la
 *    liste des projets, active sur la liste comme dans un projet ; aucune
 *    entrée Pubs IA, Image IA, Vidéo IA, Textes IA ni « Studio IA » ; dans la
 *    palette, la liste et « Nouveau projet » ;
 *  · un lecteur client (rôle sous `member`, pas de droit Studio) ne la voit ni
 *    dans le rail ni dans la palette ;
 *  · l'entrée EST la feature `studio`, celle que lit la garde serveur : ses
 *    droits sont ceux de la garde, par construction.
 */
const h = vi.hoisted(() => ({ chemin: '/studio/projets' }));
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
import { railNav, accountSections, ouverturesParRole, RAIL_GROUP_LABEL, FEATURES, type Access } from '../lib/rbac';

function rendu(a: Access, chemin: string): { rail: string; palette: string[] } {
  h.chemin = chemin;
  const html = renderToStaticMarkup(
    <AppShell nav={railNav(a).map((g) => ({ ...g, group: RAIL_GROUP_LABEL[g.group] ?? g.group }))} accountGroups={accountSections(a)} ouvertures={ouverturesParRole(a)}
      isStaff={false} showUpgrade={false} brands={[{ id: 'b1', name: 'Neva' }]} activeBrandId="b1" canManageBrands={false}
      creditBalance={0} creditsUnlimited={false} userName="U" userEmail="u@exemple.invalid" roleLabel="r" planLabel="p" workspaceName="Espace"
      collapsedInitial={false} logout={async () => {}}>
      <div />
    </AppShell>,
  );
  const rail = /<nav aria-label="Navigation principale"[\s\S]*?<\/nav>/.exec(html)?.[0] ?? '';
  const palette = JSON.parse((/<pre data-commandes="[^"]*">([\s\S]*?)<\/pre>/.exec(html)?.[1] ?? '[]').replace(/&quot;/g, '"')) as string[];
  return { rail, palette };
}

const liensRail = (rail: string): string[] => {
  const d = document.createElement('div');
  d.innerHTML = rail;
  return [...d.querySelectorAll('a')].map((x) => `${x.textContent?.trim()} → ${x.getAttribute('href')}`);
};

describe('rail · une seule entrée « Studios »', () => {
  const membre: Access = { role: 'member', plan: 'core' };

  it('membre avec le droit Studio · « Studios » mène à /studio/projets ; aucun ancien studio ; palette · liste et nouveau projet', () => {
    for (const chemin of ['/studio/projets', '/studio/projets/p1', '/dashboard']) {
      const { rail, palette } = rendu(membre, chemin);
      expect(rail, `rail vide sur ${chemin}`).not.toBe('');
      const l = liensRail(rail).filter((x) => x.includes('/studio'));
      expect(l, `entrées Studios sur ${chemin}`).toEqual(['Studios → /studio/projets']);
      expect(palette, 'Studios absent de la palette').toContain('/studio/projets');
      expect(palette, '« Nouveau projet » absent de la palette').toContain('/studio/projets/nouveau');
      expect(palette.filter((x) => typeof x === 'string' && /^\/studio(\/(ads|image|video|textes))?(\?|$)/.test(x)), 'ancien studio dans la palette').toEqual([]);
    }
  });

  it('sur la liste des projets, l’entrée est LA page courante (aria-current) · dans un projet, le fil d’Ariane situe', () => {
    for (const chemin of ['/studio/projets']) {
      const d = document.createElement('div');
      d.innerHTML = rendu(membre, chemin).rail;
      expect(d.querySelector('a[aria-current="page"]')?.getAttribute('href'), chemin).toBe('/studio/projets');
    }
  });

  it('lecteur client (aucun droit Studio) · ni rail ni palette', () => {
    const { rail, palette } = rendu({ role: 'client_viewer', plan: 'business' }, '/studio/projets');
    expect(rail).not.toBe('');
    expect(rail).not.toContain('/studio/projets');
    expect(rail).not.toContain('>Studios<');
    expect(palette).not.toContain('/studio/projets');
  });

  it('l’entrée EST la feature de la garde serveur (`studio`) · aucune autre entrée de création', () => {
    // `gardeStudio` ouvre les projets par `canAccess(access, FEATURE_STUDIO)` (clé `studio`).
    const studio = FEATURES.filter((f) => f.href.startsWith('/studio'));
    expect(studio.map((f) => [f.key, f.href, f.label, f.parent ?? null])).toEqual([['studio', '/studio/projets', 'Studios', null]]);
    for (const k of ['ads', 'image', 'video', 'textes', 'projets']) expect(FEATURES.some((f) => f.key === k), `entrée ${k} encore au catalogue`).toBe(false);
  });

  it('équipe interne sans la rubrique Studio · absente ; avec · présente', () => {
    const sans: Access = { role: 'client_viewer', plan: 'starter', equipe: { role: 'membre', matrice: { membre: ['dashboard'] } } };
    expect(rendu(sans, '/studio/projets').rail).not.toContain('/studio/projets');
    const avec: Access = { role: 'client_viewer', plan: 'starter', equipe: { role: 'membre', matrice: { membre: ['studio'] } } };
    expect(rendu(avec, '/studio/projets').rail).toMatch(/<a[^>]*href="\/studio\/projets"/);
  });
});
