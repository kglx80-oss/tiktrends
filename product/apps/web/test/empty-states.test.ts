import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Aucun état vide ne se réécrit à la main.
 *
 * ── Ce qu'on empêche de revenir ──────────────────────────────────────────────
 *
 * Le produit comptait dix-huit états vides écrits un par un, de la phrase grise
 * isolée à la carte pointillée avec emoji. Même situation, dix-huit rendus, et
 * surtout : la plupart étaient des impasses, un constat sans issue.
 *
 * ── Pourquoi c'est un test et pas une consigne ───────────────────────────────
 *
 * Personne n'a jamais décidé d'avoir dix-huit variantes · elles sont arrivées
 * une par une, chacune raisonnable au moment de l'écrire. C'est exactement le
 * genre de dérive qu'une convention ne freine pas et qu'une vérification arrête.
 *
 * ── Ce qu'on cherche ─────────────────────────────────────────────────────────
 *
 * La FORME d'un état vide plein écran : un cadre en pointillé, centré. Les
 * petites mentions en ligne dans un panneau ne sont pas visées · elles relèvent
 * de `EmptyLine`, et leur imposer un bloc ferait plus de bruit que la donnée
 * qu'elles remplacent.
 */

const RACINES = ['app', 'components'];

/** Écrans hors produit · la coquille de l'application ne s'y applique pas. */
const HORS_PERIMETRE = [
  'components/Empty.tsx',
  'app/c/',            // vue client partagée · sans rail ni marque active
  'app/(app)/admin/',  // coulisses plateforme, jamais vues par un client
  'app/(app)/console',
  'app/(app)/credits',
];

function fichiers(dir: string, base: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) out.push(...fichiers(p, base));
    else if (e.endsWith('.tsx')) out.push(p.slice(base.length + 1));
  }
  return out;
}

describe('les états vides passent tous par le composant', () => {
  it('aucun bloc pointillé centré écrit à la main', () => {
    const base = process.cwd();
    const coupables: string[] = [];

    for (const racine of RACINES) {
      for (const rel of fichiers(join(base, racine), base)) {
        if (HORS_PERIMETRE.some((h) => rel.startsWith(h) || rel.includes(h))) continue;
        const src = readFileSync(join(base, rel), 'utf8');
        for (const [i, ligne] of src.split('\n').entries()) {
          // La forme visée : cadre pointillé ET contenu centré, sur la même
          // déclaration de style. L'un sans l'autre sert à autre chose.
          if (ligne.includes('dashed var(--line-2)') && ligne.includes("textAlign: 'center'")) {
            coupables.push(`${rel}:${i + 1}`);
          }
        }
      }
    }

    expect(
      coupables,
      `État(s) vide(s) écrit(s) à la main · utilise <Empty> : ${coupables.join(', ')}`,
    ).toEqual([]);
  });

  it('le composant existe et expose les trois tons', () => {
    const src = readFileSync(join(process.cwd(), 'components', 'Empty.tsx'), 'utf8');
    // Les trois situations qu'on confondait · un manque, une attente, une réussite.
    for (const ton of ["'todo'", "'wait'", "'good'"]) expect(src).toContain(ton);
  });

  it('le type rend une impasse impossible', () => {
    const src = readFileSync(join(process.cwd(), 'components', 'Empty.tsx'), 'utf8');
    // Sur `todo`, l'action est obligatoire · ce n'est pas une convention qu'on
    // rappelle en revue, c'est une erreur de compilation.
    expect(src).toMatch(/tone:\s*'todo';\s*action:\s*Action/);
  });
});
