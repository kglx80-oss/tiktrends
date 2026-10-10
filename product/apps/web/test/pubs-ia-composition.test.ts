import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Pubs IA · composition premium & responsive (lot Codex 28/09). L'écran Pubs IA
 * est retiré depuis le 10/10 (ses gardes de composition sont parties avec lui) ·
 * reste le mode ANCRÉ du support, né sur cet écran et servi par le shell sur
 * d'autres routes. On cloue au RÉSULTAT de source. Chaque assertion tombe si le
 * défaut revient.
 */
const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8');
const appshell = read('components/AppShell.tsx');
const support = read('components/SupportWidget.tsx');

describe('Pubs IA · recette Codex passe1 · vue mobile réellement galerie', () => {
  it('le support n’est plus une bulle FIXE sur ces routes · lanceur ANCRÉ en zone de commandes', () => {
    // Recette Codex passe2 · une bulle fixe recouvrait un filtre / l'état vide au
    // défilement. Sur les routes ancrées, le shell rend le support ANCRÉ (lanceur
    // inline, qui défile avec la page) au lieu du flottant.
    expect(appshell, 'le support n’est pas ancré sur cette route').toContain('<SupportWidget anchored');
    // Le mode ancré est un vrai dialogue · Escape ferme en rendant le focus au
    // lanceur, et le panneau porte le rôle dialog.
    expect(support, 'le mode ancré n’existe pas').toContain('anchored');
    expect(support, 'Escape ne ferme pas le dialogue ancré').toContain("e.key === 'Escape'");
    expect(support, 'le focus n’est pas rendu au lanceur').toContain('lanceurRef.current?.focus()');
    expect(support, 'le panneau ancré n’est pas un dialogue').toContain("role={anchored ? 'dialog'");
  });
});
