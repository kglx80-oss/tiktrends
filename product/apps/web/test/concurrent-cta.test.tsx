// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ONGLETS_RAPPORT_CONCURRENT, ongletRapport, messagesRetourRapport, messageServiceInactif, jargonTechnique, lienNouveauProjet, lireContexteNouveauProjet } from '@tiktrends/core';

vi.mock('next/navigation', () => ({ usePathname: () => '/brands/b/competitors/Rival', useRouter: () => ({ push: () => {}, refresh: () => {} }), useSearchParams: () => new URLSearchParams() }));
import { RapportConcurrent, type PropsRapportConcurrent } from '../spatial/vues/veille/RapportConcurrent';

/**
 * La fiche d'un concurrent · un seul appel à l'action, une dimension vide qui
 * dit la vérité, des insights qui mènent à la création, une copie client.
 * Vague 2 · l'écran V5 est retiré · ces gardes portent sur l'écran Spatial
 * (`spatial/vues/veille/RapportConcurrent.tsx`) et les règles du noyau.
 */
const base: Omit<PropsRapportConcurrent, 'rapport'> = { brandId: 'b', marque: 'M', nom: 'Rival', initiale: 'R', prix: '8 crédits', analyser: async () => {}, retours: {} };
const rapport = (cle: string, insights: Array<{ texte: string; tester: string | null }> = []): NonNullable<PropsRapportConcurrent['rapport']> => ({
  detail: 'd', note: null, onglets: ONGLETS_RAPPORT_CONCURRENT.map((o) => ({ cle: o.cle, libelle: o.libelle, href: `/x?tab=${o.cle}` })), actif: ongletRapport(cle),
  synthese: null, stats: [], medias: [], ctas: [], pages: [], creas: [], insights,
});
const texte = (r: PropsRapportConcurrent['rapport']) => renderToStaticMarkup(<RapportConcurrent {...base} rapport={r} />).replace(/<[^>]+>/g, ' ');

describe('page concurrent · un seul appel à l’action', () => {
  it('pas encore analysé · un seul CTA « Analyser ce concurrent », pas de rafraîchissement', () => {
    const t = texte(null);
    expect(t.split('Analyser ce concurrent').length - 1, 'plus de double CTA').toBe(1);
    expect(t).not.toContain('Rafraîchir l’analyse');
  });
  it('analysé · le rafraîchissement seul, plus la carte d’accueil', () => {
    const t = texte(rapport('overview'));
    expect(t).toContain('Rafraîchir l’analyse');
    expect(t).not.toContain('Analyser ce concurrent');
  });
  it('la carte d’accueil montre ce qu’on va extraire (pastilles)', () => {
    const t = texte(null);
    for (const c of ['Hooks', 'Angles', 'USP', 'Désirs', 'Émotions', 'Thèmes']) expect(t).toContain(c);
  });
});

describe('Fiche concurrent · une dimension vide dit la vérité', () => {
  it('pas de « Analyse IA requise » trompeur · le geste existant est nommé', () => {
    const t = texte(rapport('hooks'));
    expect(t).not.toMatch(/Analyse IA requise/);
    expect(t).toContain('Rien de notable sur cette dimension');
    expect(t).toContain('« Rafraîchir l’analyse »');
  });
});

describe('Fiche concurrent · l’analyse mène à la création', () => {
  it('les insights « amorce d’accroche » sont testables, personas et descripteurs non', () => {
    expect(ONGLETS_RAPPORT_CONCURRENT.filter((o) => o.testable).map((o) => o.cle)).toEqual(['hooks', 'adcopy', 'headlines', 'angles', 'usps', 'desires']);
    for (const cle of ['personas', 'emotions', 'themes']) expect(ongletRapport(cle).testable, cle).toBeFalsy();
  });
  it('le lien testable mène à la préparation d’un projet avec l’angle en amorce', () => {
    const lien = lienNouveauProjet({ type: 'ads', angle: 'Fini les repas sautés' });
    expect(lireContexteNouveauProjet(Object.fromEntries(new URLSearchParams(lien.split('?')[1])))).toMatchObject({ type: 'ads', objectif: 'Fini les repas sautés' });
    const html = renderToStaticMarkup(<RapportConcurrent {...base} rapport={rapport('hooks', [{ texte: 'x', tester: lien }])} />);
    expect(html).toContain(`href="${lien.replace(/&/g, '&amp;')}"`);
  });
});

describe('Fiche concurrent · copie client (recette #106b)', () => {
  it('« bibliothèque indisponible » · ce qui manque, sans jargon ni « serveur »', () => {
    const m = messagesRetourRapport()['e:nolibrary']!;
    expect(m).toBe(messageServiceInactif('veille'));
    expect(m).toMatch(/pas encore activée pour ton espace/);
    expect(jargonTechnique(m)).toEqual([]);
  });
});
