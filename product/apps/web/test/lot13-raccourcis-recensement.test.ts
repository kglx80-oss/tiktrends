import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { REGLES_CLAVIER, TOUCHES_RECENSEES } from '@tiktrends/core';

/**
 * Lot 13 V5 · le RECENSEMENT des touches lues par le code des vues Spatial,
 * refait par motif à chaque passage et comparé au tableau écrit dans le noyau
 * (`TOUCHES_RECENSEES`, `packages/core/src/spatial/coquille/raccourcis.ts`).
 * Le noyau prouve que chaque touche recensée est une entrée de la table des
 * raccourcis, et que la table n'a aucun conflit · ici, que le recensement dit
 * VRAI du code. Une touche ajoutée dans une vue sans passer par la table fait
 * tomber cette garde · la déclarer (table + recensement) ou la retirer.
 */

const RACINE = join(__dirname, '..', 'spatial');

function fichiers(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? fichiers(p) : /\.(tsx?|jsx?)$/.test(n) ? [p] : [];
  });
}

/** Les motifs du recensement · comparaisons à `.key`, `k` tiré de `e.key.toLowerCase()`, tables de flèches, règles du noyau. */
function touchesLues(src: string): string[] {
  const t = new Set<string>();
  for (const m of src.matchAll(/\.key\s*[!=]==?\s*'([^']+)'/g)) t.add(m[1]!);
  for (const m of src.matchAll(/key\.toLowerCase\(\)\s*[!=]==?\s*'([^']+)'/g)) t.add(m[1]!);
  for (const v of src.matchAll(/const\s+(\w+)\s*=\s*\w+\.key\.toLowerCase\(\)/g)) {
    for (const m of src.matchAll(new RegExp(`\\b${v[1]}\\s*[!=]==?\\s*'([^']+)'`, 'g'))) t.add(m[1]!);
  }
  for (const m of src.matchAll(/\b(Arrow(?:Left|Right|Up|Down))\s*:/g)) t.add(m[1]!);
  for (const [regle, touches] of Object.entries(REGLES_CLAVIER)) if (new RegExp(`\\b${regle}\\(`).test(src)) touches.forEach((x) => t.add(x));
  return [...t].sort();
}

function recensement(): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const f of fichiers(RACINE)) {
    const src = readFileSync(f, 'utf8');
    if (!/keydown|onKeyDown|KeyboardEvent/.test(src)) continue;
    const t = touchesLues(src);
    if (t.length) out[relative(RACINE, f).split('\\').join('/')] = t;
  }
  return out;
}

describe('Lot 13 · recensement des touches des vues · refait sur le code', () => {
  it('le code lit exactement les touches du tableau du noyau (fichier par fichier)', () => {
    const vu = recensement();
    const ecrit = Object.fromEntries(Object.entries(TOUCHES_RECENSEES).map(([f, t]) => [f, [...t].sort()]));
    for (const f of Object.keys(vu)) expect(ecrit[f], `${f} lit ${vu[f]!.join(' ')} · absent de TOUCHES_RECENSEES (et de la table des raccourcis ?)`).toEqual(vu[f]);
    for (const f of Object.keys(ecrit)) expect(vu[f], `${f} · recensé dans le noyau, le code n'y lit plus ${ecrit[f]!.join(' ')}`).toEqual(ecrit[f]);
  });

  it('les motifs voient ce qu’ils doivent voir (sinon le recensement ne prouve rien)', () => {
    expect(touchesLues(`if (e.key === 'Escape') f(); if (ev.key !== 'Tab') return;`)).toEqual(['Escape', 'Tab']);
    expect(touchesLues(`const k = e.key.toLowerCase(); if (k === 's') x(); if (k === 'z') y();`)).toEqual(['s', 'z']);
    expect(touchesLues(`(e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k'`)).toEqual(['k']);
    expect(touchesLues(`const f = { ArrowLeft: [-1, 0], ArrowUp: [0, -1] }[ev.key];`)).toEqual(['ArrowLeft', 'ArrowUp']);
    expect(touchesLues(`const s = toucheNavigationDetail({ key: e.key });`)).toEqual(['ArrowLeft', 'ArrowRight']);
    expect(touchesLues(`aria-keyshortcuts={sens === 'precedente' ? 'ArrowLeft' : 'ArrowRight'}`)).toEqual([]);
  });
});
