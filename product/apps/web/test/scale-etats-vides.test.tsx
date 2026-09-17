import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { SwipeFile } from '../app/(app)/veille/scale/SwipeFile';

/**
 * CDC v6 · R15 · les compteurs et états vides de Scale ne doivent pas tromper.
 * Une grille filtrée qui ne rend RIEN (0 statique) montrait un vide muet ; le
 * compteur « X créa(s) » ne se rapportait à aucun total. On distingue désormais
 * l'échantillon vide du filtre trop restrictif, on offre « Réinitialiser », et
 * le compteur dit « X sur Y » quand un filtre réduit (même vocabulaire que S13).
 */

const STATS = { total: 0, videos: 0, advertisers: 0, spendCumul: '0 €', medianDuration: 0, medianGrowth: 0 };

describe('R15 · Scale · l’échantillon vide se lit', () => {
  it('sans aucune créa, un état vide explicite (pas une grille blanche)', () => {
    const html = renderToStaticMarkup(
      <SwipeFile items={[]} stats={STATS} advertisers={[]} niche="café" country="FR" />,
    );
    expect(html, 'aucun état vide rendu').toContain('Aucune créa dans cet échantillon');
  });
});

describe('R15 · Scale · compteur et filtre trop restrictif', () => {
  // Le chemin filtré dépend d'un état interne (clic sur « Statiques ») · composant
  // volumineux · garde par adoption de la source pour cette branche.
  const src = readFileSync(join(process.cwd(), 'app/(app)/veille/scale/SwipeFile.tsx'), 'utf8');

  it('un filtre actif déclenche « X sur Y » et « Réinitialiser »', () => {
    expect(src, 'pas de détection de filtre actif').toContain('const filtresActifs =');
    expect(src, 'le compteur n’annonce pas « sur Y »').toContain('${items.length}` : \'\'} créa(s)');
    expect(src, 'pas de réinitialisation des filtres').toContain('const reinitialiser = ()');
  });

  it('un filtre qui ne rend rien affiche un état distinct de l’échantillon vide', () => {
    // Deux <Empty> distincts · échantillon vide (wait) vs filtre trop restrictif (todo).
    expect(src, 'pas d’état « aucune créa pour ces filtres »').toContain('title="Aucune créa pour ces filtres."');
    expect(src, 'l’échantillon vide ne se distingue pas du filtre')
      .toContain('items.length === 0 ? (');
    expect(src, 'l’état filtré n’offre pas de réinitialisation').toMatch(/tone="todo"[\s\S]*onClick=\{reinitialiser\}/);
  });
});
