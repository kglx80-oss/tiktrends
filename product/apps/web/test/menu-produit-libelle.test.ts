import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Le menu « Produit de la marque » (Image IA) portait une option par défaut
 * « · Aucun (générique) » · le « · » en tête se lisait comme une puce parasite
 * dans le sélecteur fermé. Les vraies options n'utilisent le « · » qu'en
 * SUFFIXE (« nom · 📷 »). On garde donc l'option par défaut propre.
 *
 * Le studio est un gros composant client (server actions) · impossible à rendre
 * en test. On lit la source · l'option par défaut ne doit pas rouvrir sur un
 * point isolé.
 */
const SRC = readFileSync(join(process.cwd(), 'app/(app)/studio/image/ImageStudio.tsx'), 'utf8');

describe('l’option par défaut du menu produit reste propre', () => {
  it('pas de « · » parasite en tête de « Aucun (générique) »', () => {
    expect(SRC, 'l’option par défaut a disparu ou changé de libellé').toContain('<option value="">Aucun (générique)</option>');
    expect(SRC, 'le « · » parasite est revenu en tête').not.toMatch(/<option value="">[·•]\s*Aucun/);
  });
});
