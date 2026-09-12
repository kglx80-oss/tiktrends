import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Le studio Image présente ses modèles en GRILLE de cartes, plus en menu déroulant.
 *
 * Le rendu d'une carte est couvert par `grille-moteurs-rendu` · ici on garde le
 * CÂBLAGE : l'assistant Image adopte bien la grille et n'est pas retombé sur le
 * `<select>` d'origine.
 */
const src = readFileSync(join(process.cwd(), 'app/(app)/studio/image/AssistantImage.tsx'), 'utf8');

describe('le studio Image choisit son moteur dans une grille', () => {
  it('la grille de cartes est adoptée', () => {
    expect(src, 'la grille de moteurs n’est plus adoptée').toMatch(/<GrilleMoteurs\b/);
  });
  it('le menu déroulant du moteur a disparu', () => {
    expect(src, 'le moteur est encore un <select>').not.toMatch(/<select value=\{p\.etat\.moteur\}/);
  });
});
