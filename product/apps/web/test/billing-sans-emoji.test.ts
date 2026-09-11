import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * L'écran Abonnement & factures n'affiche plus d'emoji d'interface · rollout
 * icônes (retour proprio #2). Le 🔒 « Paiement sécurisé par Stripe » passe à
 * <Icon lock>. Gardés : ◈ (unité crédits) et ✓ (typographique).
 */
const SRC = readFileSync(join(process.cwd(), 'app/(app)/billing/page.tsx'), 'utf8');
const PICTO = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{26FF}\u{2300}-\u{23FF}\u{2728}\u{2726}\u{FE0F}]/gu;

describe('Facturation · plus aucun emoji d’interface', () => {
  it('le fichier ne porte aucun pictogramme', () => {
    const trouves = [...new Set(SRC.match(PICTO) ?? [])];
    expect(trouves, `pictogramme(s) encore dans billing/page.tsx : ${trouves.join(' ')}`).toEqual([]);
  });
  it('le paiement sécurisé rend une icône du jeu', () => {
    expect(SRC).toMatch(/<Icon name="lock"/);
  });
});
