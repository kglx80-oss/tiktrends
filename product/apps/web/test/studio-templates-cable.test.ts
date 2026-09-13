import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * La vue CLIENT des templates · dans l'assistant Pubs, le sélecteur de
 * références range les templates de l'agence EN PREMIER (règle pure éprouvée au
 * noyau : `templatesDabord`) et les marque d'une étoile. La génération réutilise
 * le chemin de références existant (`assetIds`) · aucun nouveau chemin de
 * dépense. Composant volumineux · adoption par la source pour le câblage.
 */
const studio = readFileSync(join(process.cwd(), 'app/(app)/studio/ads/AdsStudio.tsx'), 'utf8');
const page = readFileSync(join(process.cwd(), 'app/(app)/studio/ads/page.tsx'), 'utf8');

describe('Templates · vue client dans l’assistant', () => {
  it('le sélecteur ordonne les templates en premier', () => {
    expect(studio, 'le sélecteur ne range pas les templates d’abord').toContain('templatesDabord(assets).map(');
  });

  it('un template porte une étoile distinctive', () => {
    expect(studio, 'le statut template n’est pas visible dans le sélecteur').toContain('a.isTemplate &&');
  });

  it('le statut template traverse jusqu’au composant', () => {
    expect(studio, 'la prop assets ne porte pas le statut template').toMatch(/isTemplate\?: boolean/);
    expect(page, 'l’écran ne transmet pas le statut template au studio').toContain('isTemplate: a.isTemplate');
  });

  it('la génération réutilise le chemin de références existant (assetIds)', () => {
    // Pas de nouveau chemin de dépense · un template choisi passe par assetIds.
    expect(studio, 'les références choisies ne sont plus passées à la génération').toContain('assetIds: assetIds.length ? assetIds : undefined');
  });
});
