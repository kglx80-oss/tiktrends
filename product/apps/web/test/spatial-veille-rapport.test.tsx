// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ECRANS_SPATIAUX, ONGLETS_RAPPORT_CONCURRENT, ecranSpatial, ongletRapport, repartitionMedias } from '@tiktrends/core';

vi.mock('next/navigation', () => ({ usePathname: () => '/brands/b1/competitors/Huel', useRouter: () => ({ push: () => {}, refresh: () => {} }), useSearchParams: () => new URLSearchParams() }));

import { FournisseurSpatial, type CtxSpatial } from '../spatial/coquille/contexte';
import { RapportConcurrent, type PropsRapportConcurrent } from '../spatial/vues/veille/RapportConcurrent';

/**
 * Vague 2 · le rapport détaillé d'un concurrent, porté dans Spatial (l'écran
 * Concurrents de la maquette y menait par l'ancienne interface). On REND la
 * vue et on lit le HTML · prix annoncé avant l'analyse, rapport conservé lu
 * sans relancer l'IA, insights testables en projet Studios.
 */
const CTX: CtxSpatial = { utilisateur: { nom: 'K', initiales: 'K', email: 'k@x.fr', role: 'Propriétaire' }, credits: { solde: 1, dotation: 1, illimite: false }, nonLues: 0, ouvrirPalette: () => {}, basculer: () => {}, toast: () => {} };
const dom = (n: React.ReactNode) => { const d = document.createElement('div'); d.innerHTML = renderToStaticMarkup(<FournisseurSpatial value={CTX}>{n}</FournisseurSpatial>); return d; };
const base: Omit<PropsRapportConcurrent, 'rapport'> = { brandId: 'b1', marque: 'Gruns', nom: 'Huel', initiale: 'H', prix: '8 crédits', analyser: async () => {}, retours: {} };
const rapport = (cle: string, insights: PropsRapportConcurrent['rapport'] extends infer R ? R extends { insights: infer I } ? I : never : never = []) => ({
  detail: 'Concurrent analysé · 12 créas', note: null,
  onglets: ONGLETS_RAPPORT_CONCURRENT.map((o) => ({ cle: o.cle, libelle: o.libelle, href: `/brands/b1/competitors/Huel?tab=${o.cle}` })),
  actif: ongletRapport(cle), synthese: 'Mise sur la praticité.', stats: [['Créas analysées', '12']] as Array<[string, string]>,
  medias: repartitionMedias({ video: 9, image: 3 }), ctas: [{ libelle: 'Acheter', n: 5 }], pages: [], creas: [{ id: 'a1', image: null, texte: 'Un repas complet', cta: 'Acheter', jours: 40 }],
  insights,
});

describe('Spatial · Veille · rapport d’un concurrent', () => {
  it('l’écran est servi par Spatial, rubrique Veille', () => {
    expect(ecranSpatial('/brands/b1/competitors/Huel')).toMatchObject({ interne: '/sp/brands/b1/competitors/Huel', section: 'veille' });
    expect(ECRANS_SPATIAUX.some((e) => e.chemin === '/brands/[id]/competitors/[name]')).toBe(true);
  });
  it('pas encore analysé · l’analyse annonce son prix AVANT le clic, rien n’est inventé', () => {
    const d = dom(<RapportConcurrent {...base} rapport={null} />);
    const bloc = d.querySelector('[data-geste="analyser"]')!;
    expect(bloc.querySelector('button')?.textContent).toBe('Analyser ce concurrent · 8 crédits');
    expect(bloc.textContent).toContain('consulter ce rapport ne relance pas l’IA');
    expect(d.querySelector('nav.subnav')).toBeNull();
  });
  it('analysé · aperçu (synthèse, chiffres, formats), rafraîchissement au prix annoncé, onglet courant marqué', () => {
    const d = dom(<RapportConcurrent {...base} rapport={rapport('overview')} />);
    expect(d.textContent).toContain('Rafraîchir l’analyse · 8 crédits');
    const ap = d.querySelector('[data-geste="apercu"]')!;
    expect(ap.textContent).toContain('Mise sur la praticité.');
    expect([...ap.querySelectorAll('.ccfm b')].map((b) => b.textContent)).toContain('75 %');
    expect(d.querySelector('nav.subnav a[aria-current="page"]')?.textContent).toBe('Aperçu');
    expect(d.querySelectorAll('nav.subnav a')).toHaveLength(ONGLETS_RAPPORT_CONCURRENT.length);
  });
  it('un insight testable mène à un projet Studios amorcé par lui', () => {
    const d = dom(<RapportConcurrent {...base} rapport={rapport('hooks', [{ texte: 'Fini les repas sautés', tester: '/studio/projets/nouveau?type=ads&angle=x' }])} />);
    const ins = d.querySelector('[data-geste="insights"]')!;
    expect(ins.querySelector('h2')?.textContent).toBe('Hooks récurrents');
    expect(ins.querySelector('a[title="Tester cet angle dans un projet Studios"]')?.getAttribute('href')).toBe('/studio/projets/nouveau?type=ads&angle=x');
  });
  it('une dimension vide le dit et renvoie au rafraîchissement, sans impasse muette', () => {
    const d = dom(<RapportConcurrent {...base} rapport={rapport('emotions', [])} />);
    expect(d.textContent).toContain('Rien de notable sur cette dimension');
  });
  it('règles · onglet inconnu ⇒ aperçu ; formats rangés du plus gros au plus petit', () => {
    expect(ongletRapport('nimporte').cle).toBe('overview');
    expect(ongletRapport('emotions')).toMatchObject({ pastilles: true });
    expect(ongletRapport('hooks')).toMatchObject({ testable: true });
    expect(repartitionMedias({ image: 1, video: 3 })).toEqual([{ libelle: 'Vidéo', n: 3, part: 75 }, { libelle: 'Image', n: 1, part: 25 }]);
    expect(repartitionMedias({})).toEqual([]);
  });
});
