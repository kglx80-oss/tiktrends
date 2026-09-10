import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Sur la surface accent, l'encre est blanche · une seule couleur, partout.
 *
 * ── Le défaut ────────────────────────────────────────────────────────────────
 *
 * Le bouton primaire (fond `var(--grad-accent)`) portait DEUX couleurs de texte
 * selon les écrans · le primitif partagé en blanc, ~85 fichiers en `#0d070c`
 * sombre écrit à la main. Le système de design tranche pourtant : `--on-accent`
 * vaut `#ffffff`. Les CTA faits main violaient le token, en silence.
 *
 * ── L'invariant ──────────────────────────────────────────────────────────────
 *
 * On interdit le motif de régression dominant · une déclaration inline qui pose
 * `#0d070c` comme encre JUSTE à côté d'un fond `var(--grad-accent)` (dans un
 * sens ou dans l'autre). C'est ainsi que s'écrit un nouveau CTA sombre. Le token
 * `--on-accent` reste la seule bonne réponse.
 *
 * Note · `#0d070c` garde des usages LÉGITIMES hors accent · fond sombre de repli
 * (`var(--bg, #0d070c)`), encre sur un fond de statut clair (vert/ambre). Le
 * garde ne vise QUE l'adjacence encre-sombre + fond-accent, pas le hex en soi.
 */
const WEB = join(process.cwd());
const DARK = '#0d070c';

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

// Adjacence directe encre-sombre ↔ fond-accent, dans les deux ordres · le motif
// exact d'un CTA statique fait main. Les ternaires (fond bimodal) ne matchent
// pas · leur encre suit déjà leur fond.
const MOTIFS = [
  new RegExp(`background:\\s*'var\\(--grad-accent\\)'\\s*,\\s*color:\\s*'${DARK}'`),
  new RegExp(`color:\\s*'${DARK}'\\s*,\\s*background:\\s*'var\\(--grad-accent\\)'`),
];

describe('l’encre sur la surface accent est le token blanc, pas le sombre', () => {
  it('aucun CTA ne pose une encre sombre collée à un fond accent', () => {
    const fautifs: string[] = [];
    for (const f of fichiersTsx(join(WEB, 'app')).concat(fichiersTsx(join(WEB, 'components')))) {
      const src = readFileSync(f, 'utf8');
      if (MOTIFS.some((re) => re.test(src))) fautifs.push(f.replace(WEB + '/', ''));
    }
    expect(fautifs, `Encre sombre sur fond accent (utilise var(--on-accent)) : ${fautifs.join(', ')}`)
      .toEqual([]);
  });

  it('le token --on-accent existe et vaut blanc', () => {
    const tokens = readFileSync(join(WEB, '../../packages/ui/tokens.css'), 'utf8');
    expect(tokens).toMatch(/--on-accent:\s*#ffffff/i);
  });

  it('le primitif partagé `btn` utilise le token, pas un blanc en dur', () => {
    const ui = readFileSync(join(WEB, 'components/ui.tsx'), 'utf8');
    expect(ui).toMatch(/background:\s*'var\(--grad-accent\)',\s*color:\s*'var\(--on-accent\)'/);
  });
});
