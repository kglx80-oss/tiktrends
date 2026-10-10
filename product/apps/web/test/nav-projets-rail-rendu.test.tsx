// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

/**
 * « Projets » (le nouveau Studio) dans le RAIL principal, au HTML rendu.
 *
 * Le défaut · `/studio/projets` n'avait pas d'entrée dans `FEATURES` · le rail
 * ne la montrait jamais, on n'y arrivait que par un lien de `/studio` ou par la
 * Veille. On REND la vraie coquille (`AppShell`) avec ce que le layout lui
 * passe (`railNav(access)`), et on lit le rail :
 *
 *  · un membre qui a le droit Studio voit « Projets » sous « Studio IA »,
 *    à côté des studios historiques (aucun n'est retiré), et dans la palette ;
 *  · un lecteur client (rôle sous `member`, pas de droit Studio) ne la voit ni
 *    dans le rail ni dans la palette ;
 *  · une formule sans Studio la montre VERROUILLÉE (pas de lien), comme les
 *    autres sous-entrées du Studio.
 */
const h = vi.hoisted(() => ({ chemin: '/studio' }));
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
import { railNav, accountSections, ouverturesParRole, RAIL_GROUP_LABEL, FEATURES, canAccess, denyReason, type Access } from '../lib/rbac';

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

/** Les libellés de la branche « Studio IA » telle que le rail la rend, dans l'ordre. */
function brancheStudio(rail: string): string[] {
  const d = document.createElement('div');
  d.innerHTML = rail;
  const tete = [...d.querySelectorAll('a[href="/studio"]')][0];
  const bloc = tete?.closest('div')?.parentElement?.parentElement;
  return [...(bloc?.querySelectorAll('a') ?? [])].map((x) => `${x.textContent} → ${x.getAttribute('href')}`);
}

describe('rail · « Projets » sous Studio IA', () => {
  const membre: Access = { role: 'member', plan: 'core' };

  it('membre avec le droit Studio · l’entrée mène à /studio/projets, à côté des studios historiques', () => {
    for (const chemin of ['/studio', '/studio/projets']) {
      const { rail, palette } = rendu(membre, chemin);
      expect(rail, `rail vide sur ${chemin}`).not.toBe('');
      expect(rail, `« Projets » absent du rail sur ${chemin}`).toMatch(/<a[^>]*href="\/studio\/projets"[^>]*>[\s\S]*?Projets/);
      expect(palette, 'Projets absent de la palette').toContain('/studio/projets');
    }
    expect(brancheStudio(rendu(membre, '/studio').rail)).toEqual([
      'Studio IA → /studio',
      'Pubs IA → /studio/ads',
      'Image IA → /studio/image',
      'Vidéo IA → /studio/video',
      'Textes IA → /studio/textes',
      'Projets → /studio/projets',
    ]);
  });

  it('sur la liste des projets, l’entrée est LA page courante (aria-current)', () => {
    const d = document.createElement('div');
    d.innerHTML = rendu(membre, '/studio/projets').rail;
    expect(d.querySelector('a[aria-current="page"]')?.getAttribute('href')).toBe('/studio/projets');
  });

  it('lecteur client (aucun droit Studio) · ni rail ni palette', () => {
    const { rail, palette } = rendu({ role: 'client_viewer', plan: 'business' }, '/studio/projets');
    expect(rail).not.toBe('');
    expect(rail).not.toContain('/studio/projets');
    expect(rail).not.toContain('>Projets<');
    expect(palette).not.toContain('/studio/projets');
  });

  it('l’entrée a EXACTEMENT les droits de la garde serveur des projets (feature `studio`)', () => {
    // `gardeStudio` ouvre les projets par `canAccess(access, FEATURE_STUDIO)` · une
    // entrée plus large mènerait à un refus, plus étroite cacherait un écran ouvert.
    const studio = FEATURES.find((f) => f.key === 'studio')!;
    const projets = FEATURES.find((f) => f.key === 'projets');
    expect(projets, 'aucune entrée « projets » dans le catalogue du rail').toBeTruthy();
    const ecarts: string[] = [];
    const equipes: Array<Access['equipe']> = [undefined,
      { role: 'membre', matrice: {} }, { role: 'membre', matrice: { membre: ['dashboard'] } }, { role: 'admin', matrice: {} }];
    for (const role of ['client_viewer', 'member', 'admin', 'owner'] as const) {
      for (const plan of ['starter', 'core', 'plus', 'business'] as const) {
        for (const equipe of equipes) {
          const a: Access = equipe ? { role, plan, equipe } : { role, plan };
          if (canAccess(a, projets!) !== canAccess(a, studio) || denyReason(a, projets!) !== denyReason(a, studio)) ecarts.push(`${role}/${plan}/${equipe ? JSON.stringify(equipe) : 'client'}`);
        }
      }
    }
    expect(ecarts, 'droits de l’entrée Projets ≠ droits de la garde Studio').toEqual([]);
  });

  it('équipe interne sans la rubrique Studio · absente ; avec · présente', () => {
    const sans: Access = { role: 'client_viewer', plan: 'starter', equipe: { role: 'membre', matrice: { membre: ['dashboard'] } } };
    expect(rendu(sans, '/studio/projets').rail).not.toContain('/studio/projets');
    const avec: Access = { role: 'client_viewer', plan: 'starter', equipe: { role: 'membre', matrice: { membre: ['studio'] } } };
    expect(rendu(avec, '/studio').rail).toMatch(/<a[^>]*href="\/studio\/projets"/);
  });
});
