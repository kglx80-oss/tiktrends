// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Le favicon suit l'identité de l'outil · le même dégradé d'accent que le logo
 * du rail et les boutons primaires (`--acc` → `--acc2` de `:root`,
 * `spatial/spatial.css`). L'ancien favicon (#fe2c55 → #ff2d8f) n'était pas
 * dans la palette. Si l'accent de la feuille change, ce test le dit · le
 * favicon doit suivre.
 *
 * Il doit aussi rester un SVG VALIDE · un « -- » dans un commentaire XML suffit
 * à empêcher tout navigateur de l'afficher (vu en écrivant ce favicon).
 */
const ICONE = readFileSync(join(__dirname, '../app/icon.svg'), 'utf8');
const FEUILLE = readFileSync(join(__dirname, '../spatial/spatial.css'), 'utf8');

function accentsRacine(css: string): { acc: string; acc2: string } {
  const bloc = /(^|\n):root\{--acc:([^;]+);--acc2:([^;]+);/.exec(css);
  if (!bloc) throw new Error('la feuille ne déclare plus `:root{--acc:…;--acc2:…}`');
  return { acc: bloc[2]!.trim().toLowerCase(), acc2: bloc[3]!.trim().toLowerCase() };
}

describe('favicon · cohérent avec l’outil, et affichable', () => {
  it('le dégradé du favicon est l’accent de la feuille (`--acc` → `--acc2`)', () => {
    const { acc, acc2 } = accentsRacine(FEUILLE);
    const doc = new DOMParser().parseFromString(ICONE, 'image/svg+xml');
    const arrets = [...doc.querySelectorAll('linearGradient#acc stop')].map((s) => s.getAttribute('stop-color')?.toLowerCase());
    expect(arrets, 'le favicon n’utilise pas le dégradé d’accent de l’outil').toEqual([acc, acc2]);
    expect(doc.querySelector('rect')?.getAttribute('fill'), 'la pastille du favicon n’est pas remplie par le dégradé d’accent').toBe('url(#acc)');
  });

  it('le SVG est bien formé (aucune erreur d’analyse, aucun « -- » dans un commentaire)', () => {
    const doc = new DOMParser().parseFromString(ICONE, 'image/svg+xml');
    expect(doc.querySelector('parsererror'), 'le favicon n’est pas un SVG valide · le navigateur ne l’affichera pas').toBeNull();
    for (const c of ICONE.match(/<!--([\s\S]*?)-->/g) ?? []) expect(c.slice(4, -3).includes('--'), 'un « -- » dans un commentaire rend le SVG invalide').toBe(false);
  });
});
