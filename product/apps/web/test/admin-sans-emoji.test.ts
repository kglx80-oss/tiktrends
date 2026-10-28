import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Le Tour de contrôle n'affiche aucun emoji d'interface (rollout icônes,
 * retour proprio #2) · les pictogrammes passent par le sprite de la maquette
 * (`<Ic>`) ou par des mots. Spatial · vague 3 · l'accueil des coulisses et
 * « Intelligence marché » de l'ancienne interface sont retirés · la règle
 * garde désormais TOUS les écrans Spatial de l'Admin (vues et pages),
 * commentaires compris.
 */
const BANNIS = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{26FF}\u{2728}\u{2726}\u{FE0F}\u{25C8}]/gu;
const RACINES = ['spatial/vues/admin', 'app/(spatial)/sp/admin', 'app/(spatial)/sp/console'];
const fichiers: string[] = [];
const parcourir = (d: string) => {
  for (const n of readdirSync(d)) { const p = join(d, n); if (statSync(p).isDirectory()) parcourir(p); else if (/\.tsx?$/.test(n)) fichiers.push(p); }
};
for (const r of RACINES) parcourir(join(process.cwd(), r));

describe('Admin · plus aucun emoji d’interface', () => {
  it('on parcourt bien les écrans Spatial de l’Admin (Intelligence marché compris)', () => {
    expect(fichiers.some((f) => f.endsWith('vues/admin/Intelligence.tsx'))).toBe(true);
    expect(fichiers.some((f) => f.endsWith('vues/admin/TourDeControle.tsx'))).toBe(true);
    expect(fichiers.length).toBeGreaterThan(40);
  });
  it('aucun pictogramme ni losange, commentaires compris', () => {
    const fautes = fichiers.flatMap((f) => { const t = [...new Set(readFileSync(f, 'utf8').match(BANNIS) ?? [])]; return t.length ? [`${f.replace(process.cwd() + '/', '')} : ${t.join(' ')}`] : []; });
    expect(fautes).toEqual([]);
  });
});
