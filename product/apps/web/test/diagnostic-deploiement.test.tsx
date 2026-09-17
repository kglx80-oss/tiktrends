import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { deploymentState } from '@tiktrends/core';
import { DiagnosticDeploiement } from '../components/DiagnosticDeploiement';

/**
 * CDC v7 · lot 0 · réconcilier code et app · le panneau de diagnostic dit quelle
 * version tourne VRAIMENT. On vérifie le HTML rendu · commit, état nommé (texte,
 * pas couleur seule) et résumé, pour chaque cas · à jour, en attente, en avance,
 * illisible. La règle d'état est au noyau (`deploymentState`) · ici l'affichage.
 */
const html = (o: { build?: string | null; inBuild: number; applied: number | null }) =>
  renderToStaticMarkup(<DiagnosticDeploiement etat={deploymentState({ renderVersion: 9, ...o })} builtAt="2026-09-17T10:00:00Z" />);

describe('le panneau de diagnostic du déploiement', () => {
  it('affiche le commit du build pour réconcilier code et production', () => {
    const h = html({ build: 'abc12345', inBuild: 49, applied: 49 });
    expect(h).toContain('Diagnostic du déploiement');
    expect(h, 'le commit du build n’est pas affiché').toContain('abc12345');
    expect(h).toContain('origin/main'); // l'invite à comparer
  });

  it('à jour · un état nommé, pas seulement une couleur', () => {
    const h = html({ build: 'abc12345', inBuild: 49, applied: 49 });
    expect(h).toContain('À jour');
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
});
