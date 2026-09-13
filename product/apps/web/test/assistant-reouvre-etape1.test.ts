import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * L'assistant Pubs IA reste MONTÉ (il rend `null` fermé) · son état `etape`
 * survit donc à la fermeture. Sans reset, il rouvre à la dernière étape vue
 * (souvent l'étape 5, juste après une génération) · le point d'entrée du fil
 * devient non déterministe. À chaque ouverture il doit repartir de l'étape 1.
 *
 * Le reset est un effet (il se déclenche quand `ouvert` passe à vrai) · un effet
 * ne s'exécute pas sous `renderToStaticMarkup`, et le dépôt n'a pas de harnais
 * de rendu client (pas de @testing-library). On éprouve donc l'ADOPTION par la
 * source · l'effet qui remet l'étape à « produit » à l'ouverture.
 */
const src = readFileSync(
  join(process.cwd(), 'app/(app)/studio/ads/AssistantPub.tsx'),
  'utf8',
);

describe('Assistant Pubs IA · rouvre toujours à l’étape 1', () => {
  it('un effet remet l’étape à « produit » quand l’assistant s’ouvre', () => {
    const compact = src.replace(/\s+/g, ' ');
    expect(compact, 'le reset à l’ouverture a disparu · l’assistant rouvre à la dernière étape')
      .toContain("if (p.ouvert) setEtape('produit');");
    expect(compact, 'le reset n’est pas déclenché par l’ouverture (dépendance [p.ouvert])')
      .toMatch(/useEffect\(\(\) => \{ if \(p\.ouvert\) setEtape\('produit'\); \}, \[p\.ouvert\]\)/);
  });
});
