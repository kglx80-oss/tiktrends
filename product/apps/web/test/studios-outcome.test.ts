import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Aucun studio ne traite un lot à sa façon.
 *
 * ── Le même défaut, trois fois ───────────────────────────────────────────────
 *
 * Les trois studios écrivaient la même chose :
 *
 *     if (res.error) { setError(res.error); return; }
 *     if (res.images) { ... }
 *
 * Un retour sans erreur ET sans rien produit tombe entre les deux : aucune
 * branche ne s'exécute, aucun message n'apparaît. On clique, on attend, il ne se
 * passe rien, et le produit a l'air cassé alors qu'il a échoué à le dire.
 *
 * Trouvé sur Pub IA, il était identique sur Image et Vidéo · le genre de défaut
 * qui se recopie parce qu'il ressemble à du code prudent.
 *
 * ── Pourquoi ce test et pas un commentaire ───────────────────────────────────
 *
 * La règle vit dans `generationOutcome`, où elle est testée. Encore faut-il que
 * les écrans s'en servent. Un quatrième studio écrit par quelqu'un qui n'a pas
 * lu cette histoire réécrirait les deux `if` de bonne foi.
 */

const STUDIOS = [
  'app/(app)/studio/ads/AdsStudio.tsx',
  'app/(app)/studio/image/ImageStudio.tsx',
  'app/(app)/studio/video/VideoStudioFull.tsx',
];

const lire = (f: string) => readFileSync(join(process.cwd(), f), 'utf8');

describe('les studios passent par la règle du noyau', () => {
  it('chacun importe generationOutcome', () => {
    for (const f of STUDIOS) {
      expect(lire(f), `${f} traite ses lots sans passer par le noyau`).toContain('generationOutcome');
    }
  });
});
