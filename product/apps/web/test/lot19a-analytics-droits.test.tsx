import { describe, expect, it, vi, beforeEach } from 'vitest';
import { prerender } from 'react-dom/static';
import type { ReactNode } from 'react';

/**
 * Message 55 · la vue Analytics applique le droit DÉJÀ défini, au serveur.
 *
 * Constat (rapport 54) · l'ancienne page `/analytics` et la vue de l'Accueil
 * ne vérifiaient que la session · un membre d'équipe dont la matrice ferme
 * Analytics lisait les KPI de l'espace par l'URL (capture `sans-droit-vue`).
 * Masquer l'onglet ne protégeait rien.
 *
 * On REND la vue (session simulée) et on lit :
 *  - le HTML · refus affiché, aucun KPI, aucun bloc, aucune ancre ;
 *  - les LECTURES · ni marque active, ni accès à la base, ni bilan, pour un
 *    refus · elles ont bien lieu pour un rôle autorisé (preuve que la sonde
 *    regarde la bonne chose) ;
 *  - les parcours autorisés · les blocs d'Analytics sont tous là, comme avant.
 */

type Session = {
  workspaceId: string; workspaceName: string; role: 'owner' | 'admin' | 'member' | 'client_viewer'; plan: 'starter' | 'core' | 'plus' | 'business';
  user: { id: string; email: string; name: string };
  equipe?: { role: 'membre' | 'lecture' | 'freelance' | 'manager'; matrice: Record<string, never> };
};
const etat = { session: null as unknown as Session, lectures: [] as string[] };
const proprietaire = (): Session => ({ workspaceId: 'w', workspaceName: 'Espace', role: 'owner', plan: 'business', user: { id: 'u', email: 'client@exemple.invalid', name: 'Camille' } });

vi.mock('next/navigation', () => ({
  redirect: (url: string) => { throw new Error(`REDIRECT:${url}`); },
  useRouter: () => ({ refresh() {}, push() {}, replace() {} }), usePathname: () => '/dashboard', useSearchParams: () => new URLSearchParams(),
}));
vi.mock('next/link', () => ({ default: ({ href, children, prefetch: _p, ...reste }: { href: string; children: ReactNode; prefetch?: unknown } & Record<string, unknown>) => <a href={href} {...reste}>{children}</a> }));
vi.mock('../lib/auth', () => ({ getSession: async () => etat.session }));
// La base · chaque accès au client est NOTÉ (il vaut `null`, rien ne s'exécute).
vi.mock('@tiktrends/db', () => ({ get db() { etat.lectures.push('db'); return null; }, schema: {} }));
vi.mock('../lib/brands', () => ({ getActiveBrand: async () => { etat.lectures.push('marque active'); return { id: 'b1', name: 'Neva' }; } }));
vi.mock('../app/actions/adsmap-attribution', () => ({
  attributionViewAction: async () => { etat.lectures.push('bilan'); return {}; },
  creativeTrendAction: async () => { etat.lectures.push('tendance'); return {}; },
}));

import { VueAnalytics } from '../components/accueil/VueAnalytics';

async function html(n: ReactNode): Promise<string> {
  const { prelude } = await prerender(<>{n}</>);
  return new Response(prelude).text();
}
const vue = async () => html(await VueAnalytics());

const BLOCS = ['Aperçu créas', 'Répartition Radar', 'Dépense par plateforme', 'Top créas par ROAS', 'Branche Meta Ads pour tes vrais KPI', 'data-vue="analytics"'];

beforeEach(() => { etat.session = proprietaire(); etat.lectures = []; });

describe('Analytics · refus serveur, aucune lecture', () => {
  const refuses: Array<[string, () => Session]> = [
    ['membre d’équipe « membre » (matrice sans Analytics)', () => ({ ...proprietaire(), role: 'member', equipe: { role: 'membre', matrice: {} } })],
    ['membre d’équipe « freelance » (matrice sans Analytics)', () => ({ ...proprietaire(), role: 'member', equipe: { role: 'freelance', matrice: {} } })],
  ];
  for (const [nom, session] of refuses) {
    it(nom, async () => {
      etat.session = session();
      const h = await vue();
      expect(h, 'l’écran de refus n’est pas rendu').toContain('data-vue="analytics-refusee"');
      expect(h).toContain('Ton rôle ne donne pas accès à Analytics');
      for (const b of [...BLOCS, 'id="attribution"', 'Bilan avancé']) expect(h, `donnée d’Analytics servie malgré le refus · ${b}`).not.toContain(b);
      expect(etat.lectures, 'une lecture a eu lieu avant le refus').toEqual([]);
    });
  }
});

describe('Analytics · parcours autorisés inchangés', () => {
  const autorises: Array<[string, () => Session]> = [
    ['propriétaire', proprietaire],
    ['lecteur client, offre Starter (rôle et offre minimum de la matrice)', () => ({ ...proprietaire(), role: 'client_viewer', plan: 'starter' })],
    ['membre d’équipe « lecture » (sa matrice ouvre Analytics)', () => ({ ...proprietaire(), role: 'member', equipe: { role: 'lecture', matrice: {} } })],
  ];
  for (const [nom, session] of autorises) {
    it(nom, async () => {
      etat.session = session();
      const h = await vue();
      expect(h).not.toContain('analytics-refusee');
      for (const b of BLOCS) expect(h, `bloc d’Analytics manquant · ${b}`).toContain(b);
      expect(etat.lectures, 'la vue autorisée ne lit plus ses données').toEqual(expect.arrayContaining(['marque active', 'db']));
    });
  }
  it('propriétaire · le bilan avancé (gardé par son propre droit Adsmap) reste là, ancre comprise', async () => {
    const h = await vue();
    expect(h).toContain('id="attribution"');
    expect(h).toContain('Bilan avancé');
  });
});
