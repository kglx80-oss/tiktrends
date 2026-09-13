import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Rail replié · une icône verrouillée (plan) ou « bientôt » ne mène nulle part.
 *
 * Le rail déplié rend ces items inertes (un <div>, jamais un <Link>). Le rail
 * REPLIÉ, lui, les rendait en <Link href="#"> : cliquer une icône grisée
 * sautait en haut de page · ça se lit comme un bug. On tient la même promesse
 * qu'en déplié · bloqué ⇒ <div> inerte, pas de href « # ».
 *
 * AppShell est un client, mais la branche « repliée » dépend de l'état
 * `collapsed` et des hooks de navigation · non rendable seule. On borne la
 * source à cette branche et on éprouve son adoption.
 */
const src = readFileSync(join(process.cwd(), 'components/AppShell.tsx'), 'utf8');
const iStart = src.indexOf('? nav.flatMap((grp) => branchesOf');
const iEnd = src.indexOf(': nav.map((grp) => (', iStart);
const branche = src.slice(iStart, iEnd > iStart ? iEnd : undefined);

describe('Rail replié · un item bloqué est inerte, pas un lien mort', () => {
  it('la branche repliée a bien été trouvée', () => {
    expect(iStart, 'ancre de la branche repliée introuvable').toBeGreaterThan(-1);
    expect(iEnd, 'fin de la branche repliée introuvable').toBeGreaterThan(iStart);
  });

  it('aucun href « # » · plus de lien qui saute en haut de page', () => {
    expect(branche, "un item du rail replié pointe encore vers « # »").not.toContain("'#'");
    expect(branche, "un href statique « # » traîne dans le rail replié").not.toContain('href="#"');
  });

  it('un item bloqué est rendu inerte (<div>), pas un <Link>', () => {
    expect(branche, 'la bifurcation bloqué ⇒ <div> a disparu').toMatch(/bloque\s*\?\s*\(/);
    expect(branche, 'l’item bloqué ne rend plus un <div> inerte').toContain('<div key={b.head.key}');
  });
});
