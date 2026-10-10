import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Le comportement du piège à focus est prouvé une fois (`piege-focus.test.tsx`).
 * Ici on vérifie qu'il ATTEINT le `Modal` partagé (l'assistant Pubs IA, l'autre
 * dialogue gardé ici, est retiré depuis le 10/10). Adoption par la source.
 */
const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8');

describe('piège à focus · adopté par les dialogues', () => {
  it('le Modal partagé l’utilise', () => {
    const s = read('components/Modal.tsx');
    expect(s, 'le Modal n’appelle pas le piège à focus partagé').toContain('usePiegeFocus(panelRef, { actif: open, onFermer: onClose })');
    // Il ne doit plus porter sa propre copie inline du piège.
    expect(s, 'le Modal garde une copie inline du piège (dérive possible)').not.toContain("e.key === 'Tab'");
  });
});
