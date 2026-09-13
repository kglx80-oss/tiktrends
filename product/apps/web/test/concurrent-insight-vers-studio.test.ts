import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * La fiche concurrent livrait une analyse riche (hooks, angles, copy…) sans
 * AUCUN pont vers la création · un cul-de-sac analyser→créer. Chaque insight qui
 * est une amorce d'accroche doit désormais porter un lien « Tester » vers Pubs
 * IA (?angle=), comme le Radar et les Textes IA.
 *
 * Un persona n'est pas un angle à tester tel quel · il ne porte pas le lien.
 * Page serveur (session, db) · non rendable. Adoption par la source.
 */
const src = readFileSync(
  join(process.cwd(), 'app/(app)/brands/[id]/competitors/[name]/page.tsx'),
  'utf8',
);

describe('Fiche concurrent · l’analyse mène à la création', () => {
  it('les insights « amorce d’accroche » sont testables', () => {
    for (const champ of ['hooks', 'adCopyAngles', 'headlines', 'adAngles', 'usps', 'desires']) {
      expect(src, `l’insight ${champ} n’est pas testable`).toContain(`items={ins?.${champ}} testable`);
    }
  });

  it('un persona n’est pas un angle · pas de lien Tester', () => {
    expect(src, 'les personas ne doivent pas être testables tels quels')
      .not.toContain('items={ins?.personas} testable');
  });

  it('le lien testable mène bien à Pubs IA avec l’angle en amorce', () => {
    const i = src.indexOf('testable && (');
    expect(i, 'la branche testable a disparu').toBeGreaterThan(-1);
    expect(src.slice(i, i + 300), 'le lien ne mène pas à Pubs IA')
      .toContain('/studio/ads?angle=${encodeURIComponent(it)}');
  });
});
