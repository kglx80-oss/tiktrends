import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * Une Date interpolée telle quelle dans un gabarit `sql` de drizzle part brute
 * vers postgres.js, qui la refuse (« The "string" argument must be of type
 * string… Received an instance of Date ») · l'écran entier tombe en 500. Vu au
 * banc sur les douze écrans Admin. La date doit passer par un opérateur de
 * colonne (`gte(col, d)`, `lt(col, d)`…) ou par `d.toISOString()`.
 *
 * Garde statique sur l'arbre Spatial : un identifiant affecté par `new Date(`
 * n'apparaît jamais en `${identifiant}` dans un gabarit `sql`.
 */
const WEB = join(__dirname, '..');
const RACINES = [join(WEB, 'app', '(spatial)'), join(WEB, 'lib', 'spatial'), join(WEB, 'spatial')];

function fichiers(d: string, out: string[] = []): string[] {
  for (const n of readdirSync(d)) { const p = join(d, n); if (statSync(p).isDirectory()) fichiers(p, out); else if (/\.tsx?$/.test(n)) out.push(p); }
  return out;
}

function datesBrutesDansSql(src: string): string[] {
  const dates = new Set([...src.matchAll(/(?:const|let)\s+([A-Za-z_$][\w$]*)\s*(?::\s*Date\s*)?=\s*new Date\(/g)].map((m) => m[1]!));
  const fautes: string[] = [];
  for (const m of src.matchAll(/sql(?:<[^>]*>)?`([^`]*)`/g)) {
    for (const i of m[1]!.matchAll(/\$\{\s*([A-Za-z_$][\w$]*)\s*\}/g)) if (dates.has(i[1]!)) fautes.push(i[1]!);
  }
  return fautes;
}

describe('Spatial · aucune Date brute dans un gabarit sql', () => {
  it('la règle voit le défaut qu’elle garde', () => {
    expect(datesBrutesDansSql('const depuis = new Date(0); sql`x > ${depuis}`')).toEqual(['depuis']);
    expect(datesBrutesDansSql('const depuis = new Date(0); sql`x and ${gte(c, depuis)}`')).toEqual([]);
  });
  it('aucun fichier de l’arbre Spatial n’en contient', () => {
    const fautes = RACINES.flatMap((r) => fichiers(r)).flatMap((f) => datesBrutesDansSql(readFileSync(f, 'utf8')).map((d) => `${relative(WEB, f)} · \${${d}}`));
    expect(fautes, 'une Date brute dans sql`` · la passer par gte/lt ou toISOString()').toEqual([]);
  });
});
