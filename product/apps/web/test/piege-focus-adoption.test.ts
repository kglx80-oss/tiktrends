import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Le comportement du piège à focus est prouvé une fois (`piege-focus.test.tsx`).
 * Ici on vérifie qu'il ATTEINT les deux dialogues · l'assistant Pubs IA et le
 * `Modal` partagé l'appellent, et l'assistant donne à son panneau le `ref` et le
 * `tabIndex=-1` sans lesquels le focus ne peut ni entrer ni être piégé.
 *
 * `AssistantPub` est un client volumineux · non rendable en interaction ici.
 * Adoption par la source.
 */
const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8');

describe('piège à focus · adopté par les dialogues', () => {
  it('l’assistant Pubs IA l’utilise et arme son panneau', () => {
    const s = read('app/(app)/studio/ads/AssistantPub.tsx');
    expect(s, 'l’assistant n’appelle pas le piège à focus').toContain('usePiegeFocus(panelRef, { actif: ouvert, onFermer })');
    expect(s, 'le panneau n’a pas de ref pour recevoir le focus').toContain('ref={panelRef}');
    expect(s, 'le panneau n’est pas focusable (tabIndex=-1)').toContain('tabIndex={-1}');
  });

  it('le Modal partagé l’utilise', () => {
    const s = read('components/Modal.tsx');
    expect(s, 'le Modal n’appelle pas le piège à focus partagé').toContain('usePiegeFocus(panelRef, { actif: open, onFermer: onClose })');
    // Il ne doit plus porter sa propre copie inline du piège.
    expect(s, 'le Modal garde une copie inline du piège (dérive possible)').not.toContain("e.key === 'Tab'");
  });
});
