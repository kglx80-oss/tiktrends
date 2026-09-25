import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Sur la surface accent, l'encre est le TOKEN, jamais un hex en dur.
 *
 * ── Le revirement, et pourquoi ───────────────────────────────────────────────
 *
 * Une décision antérieure unifiait l'encre des CTA en BLANC (`--on-accent`
 * valait `#ffffff`). Le design.md la renverse pour une raison mesurable : le
 * blanc sur le dégradé rose plafonne à ~3,5:1, sous le seuil WCAG AA (4,5:1) ;
 * l'encre sombre `#120810` atteint ~5,3:1. Le token vaut donc désormais le
 * SOMBRE (voir aussi test/contraste-boutons.test.ts, qui mesure le contraste).
 *
 * ── L'invariant, inchangé dans son esprit ────────────────────────────────────
 *
 * Peu importe la valeur : l'encre sur l'accent passe par `var(--on-accent)`,
 * jamais par un littéral. On interdit donc, collé à un fond `var(--grad-accent)`
 * (dans un sens ou l'autre), un hex d'encre écrit à la main · sombre
 * (`#0d070c` / `#120810`) OU blanc (`#fff` / `#ffffff`). Un littéral fige la
 * couleur et manque le prochain changement de token · exactement ce qu'on vient
 * de faire.
 *
 * Note · ces hex gardent des usages LÉGITIMES hors accent (fond de repli sombre,
 * encre sur un fond de statut clair). Le garde ne vise QUE l'adjacence
 * encre-littérale + fond-accent, pas le hex en soi. Les ternaires (fond bimodal)
 * ne matchent pas · leur encre suit déjà leur fond.
 */
const WEB = join(process.cwd());
const DARKS = ['#0d070c', '#120810'];
const WHITES = ['#fff', '#ffffff'];

function fichiersTsx(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir)) {
    if (e === 'node_modules' || e === '.next' || e === 'test') continue;
    const p = join(dir, e);
    const st = statSync(p);
    if (st.isDirectory()) out.push(...fichiersTsx(p));
    else if (e.endsWith('.tsx') || e.endsWith('.ts')) out.push(p);
  }
  return out;
}

// Adjacence directe encre-littérale ↔ fond-accent, dans les deux ordres · le
// motif exact d'un CTA statique fait main. On tolère un court écart sur la même
// ligne (fond et couleur pas toujours collés · cf. la zone de dépôt).
const LITTERAUX = [...DARKS, ...WHITES];
const MOTIFS = LITTERAUX.flatMap((c) => [
  new RegExp(`background:\\s*'var\\(--grad-accent\\)'[^\\n]{0,80}?color:\\s*'${c}'`, 'i'),
  new RegExp(`color:\\s*'${c}'[^\\n]{0,80}?background:\\s*'var\\(--grad-accent\\)'`, 'i'),
]);

describe('l’encre sur la surface accent est le token, jamais un hex en dur', () => {
  it('aucun CTA ne pose une encre littérale collée à un fond accent', () => {
    const fautifs: string[] = [];
    for (const f of fichiersTsx(join(WEB, 'app')).concat(fichiersTsx(join(WEB, 'components')))) {
      const src = readFileSync(f, 'utf8');
      if (MOTIFS.some((re) => re.test(src))) fautifs.push(f.replace(WEB + '/', ''));
    }
    expect(fautifs, `Encre en dur sur fond accent (utilise var(--on-accent)) : ${fautifs.join(', ')}`)
      .toEqual([]);
  });

  it('le token --on-accent existe et vaut le sombre #120810 (contraste AA)', () => {
    const tokens = readFileSync(join(WEB, '../../packages/ui/tokens.css'), 'utf8');
    expect(tokens).toMatch(/--on-accent:\s*#120810/i);
  });

  it('le primitif partagé `btn` utilise le token, pas un hex en dur', () => {
    const ui = readFileSync(join(WEB, 'components/ui.tsx'), 'utf8');
    expect(ui).toMatch(/background:\s*'var\(--grad-accent\)',\s*color:\s*'var\(--on-accent\)'/);
  });
});
