import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Le texte sur les actions roses est LISIBLE · mesuré, pas décrété.
 *
 * Le design.md le pose : blanc sur le dégradé rose ≈ 3,5:1 (sous le seuil AA de
 * 4,5:1) ; sombre #120810 ≈ 5,3:1. On lit la valeur RÉELLE du token `--on-accent`
 * dans tokens.css et on calcule son contraste WCAG contre les deux extrémités du
 * dégradé (#fe2c55 → #ff2d8f). Le token doit passer AA aux deux bouts, et le
 * blanc doit échouer (c'est la raison même du changement). Reculer le token vers
 * le blanc fait tomber ce garde.
 */

function lum(hex: string): number {
  const h = hex.replace('#', '');
  const chan = (i: number) => {
    const c = parseInt(h.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * chan(0) + 0.7152 * chan(2) + 0.0722 * chan(4);
}
function contraste(a: string, b: string): number {
  const la = lum(a);
  const lb = lum(b);
  const hi = Math.max(la, lb);
  const lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}

const GRAD = ['#fe2c55', '#ff2d8f']; // les deux bouts du dégradé d'action
const AA = 4.5;

function tokenOnAccent(): string {
  const css = readFileSync(join(process.cwd(), '..', '..', 'packages', 'ui', 'tokens.css'), 'utf8');
  const m = css.match(/--on-accent:\s*(#[0-9a-fA-F]{6})/);
  const val = m?.[1];
  if (!val) throw new Error('--on-accent introuvable dans tokens.css');
  return val;
}

describe('contraste · texte sur les actions roses', () => {
  it('le token --on-accent passe AA (≥ 4,5:1) aux DEUX bouts du dégradé', () => {
    const on = tokenOnAccent();
    for (const g of GRAD) {
      expect(contraste(on, g), `${on} sur ${g}`).toBeGreaterThanOrEqual(AA);
    }
  });

  it('le blanc, lui, échoue · c’est pourquoi on a changé', () => {
    for (const g of GRAD) {
      expect(contraste('#ffffff', g), `blanc sur ${g}`).toBeLessThan(AA);
    }
  });

  it('le calcul de contraste est correct (repère connu)', () => {
    // Noir sur blanc = 21:1 exactement.
    expect(Math.round(contraste('#000000', '#ffffff'))).toBe(21);
  });
});
