// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { deploymentState, diagnosticDeploiementAdmin } from '@tiktrends/core';
vi.mock('next/navigation', () => ({ usePathname: () => '/console', useRouter: () => ({ push: () => {}, refresh: () => {} }) }));
vi.mock('../app/actions/platform', () => ({ updatePlanConfigAction: async () => {} }));
vi.mock('../app/actions/beta', () => ({ grantTestPackAction: async () => {}, revokeTrialAction: async () => {} }));
import { FournisseurSpatial, type CtxSpatial } from '../spatial/coquille/contexte';
import { Console } from '../spatial/vues/admin/Console';

/**
 * CDC v7 · lot 0 · réconcilier code et app · le panneau de diagnostic dit quelle
 * version tourne VRAIMENT. On vérifie le HTML rendu · commit, état nommé (texte,
 * pas couleur seule) et résumé, pour chaque cas · à jour, en attente, en avance,
 * illisible. La règle d'état est au noyau (`deploymentState`,
 * `diagnosticDeploiementAdmin`) · ici l'affichage. Spatial · vague 3 · le
 * panneau vit dans la Console Spatiale (l'ancien composant V5 est retiré).
 */
const CTX: CtxSpatial = { utilisateur: { nom: 'K', initiales: 'K', email: 'k@x.fr', role: 'Propriétaire' }, credits: { solde: 0, dotation: 0, illimite: false }, nonLues: 0, ouvrirPalette: () => {}, basculer: () => {}, toast: () => {} };
const html = (o: { build?: string | null; inBuild: number; applied: number | null }) => {
  const page = renderToStaticMarkup(
    <FournisseurSpatial value={CTX}>
      <Console bandeau={{ payants: 0, actualise: 'à l’instant' }} message={null}
        deploiement={diagnosticDeploiementAdmin(deploymentState({ renderVersion: 9, ...o }), '2026-09-17T10:00:00Z')}
        plateforme={{ kpis: [], repartition: [], espaces: [], tarifs: [] }} essais={{ espaces: [], creditsDefaut: 0, joursDefaut: 0, lignes: [] }}
        espace={{ nom: 'W', kpis: [], roles: [], membres: [], tickets: [] }} />
    </FournisseurSpatial>,
  );
  const t = document.createElement('template'); t.innerHTML = page;
  return t.content.querySelector('[data-console="deploiement"]')!.outerHTML;
};

describe('le panneau de diagnostic du déploiement', () => {
  it('affiche le commit du build pour réconcilier code et production', () => {
    const h = html({ build: 'abc12345', inBuild: 49, applied: 49 });
    expect(h).toContain('Diagnostic du déploiement');
    expect(h, 'le commit du build n’est pas affiché').toContain('abc12345');
    expect(h).toContain('origin/main'); // l'invite à comparer
  });

  // CDC v8 · F09 · schéma appliqué + commit identifié est le meilleur état
  // constatable de l'intérieur · mais identifier le commit ne prouve pas qu'il
  // est le DERNIER. Le badge qualifie donc « Schéma à jour · commit identifié »
  // et renvoie à origin/main · il ne claironne pas « À jour · » (code forcément
  // à jour).
  it('schéma + commit · un état nommé qui ne prétend pas « code à jour »', () => {
    const h = html({ build: 'abc12345', inBuild: 49, applied: 49 });
    expect(h).toContain('Schéma à jour · commit identifié');
    // Le résumé scope à ce qui est vérifié et renvoie à origin/main pour conclure.
    expect(h).toMatch(/Reste à confirmer via origin\/main/);
    // Il ne prétend PAS « À jour · N migration(s) » (le surclaim d'avant).
    expect(h).not.toMatch(/À jour · \d+ migration/);
  });

  it('migrations en attente · le cas le plus grave est nommé', () => {
    const h = html({ build: 'abc12345', inBuild: 49, applied: 47 });
    expect(h).toContain('Migrations en attente');
    expect(h, 'le résumé doit expliquer le retard').toMatch(/en attente|colonnes/);
  });

  it('base en avance · un déploiement annulé après ses migrations', () => {
    expect(html({ build: 'abc12345', inBuild: 49, applied: 51 })).toContain('Base en avance');
  });

  it('lecture impossible · « illisible », jamais confondu avec zéro', () => {
    const h = html({ build: 'abc12345', inBuild: 49, applied: null });
    expect(h).toContain('État illisible');
  });

  it('commit absent · dit « inconnu », ne prétend rien', () => {
    expect(html({ build: null, inBuild: 49, applied: 49 })).toContain('inconnu');
  });

  // CDC v8 · F09 · schéma à jour ≠ code à jour · sans le commit servi, le badge
  // ne peut PAS afficher un vert « À jour » qui laisserait croire le code à jour.
  it('schéma à jour mais commit inconnu · le badge NE dit PAS « À jour » vert', () => {
    const h = html({ build: null, inBuild: 53, applied: 53 });
    expect(h, 'le badge doit qualifier · code non identifié').toContain('code non identifié');
    expect(h, 'le badge non identifié n’est pas vert').not.toContain('pill g');
    // Le vert « À jour » est réservé à un code identifié · l'icône de succès n'y est pas.
    expect(h, 'le résumé sépare schéma et code').toMatch(/Schéma à jour|schéma à jour ≠ code à jour/);
    // Un build identifié, lui, garde le vert · qualifié « Schéma à jour · commit
    // identifié » (schéma appliqué + commit connu), sans prétendre le code à jour.
    expect(html({ build: 'abc12345', inBuild: 53, applied: 53 })).toContain('Schéma à jour · commit identifié');
  });
});
