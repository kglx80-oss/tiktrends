import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Règle du dépôt · « Pas de tiret cadratin · utiliser « · » ». Le tiret cadratin
 * (—) comme séparateur en prose n'appartient pas à la voix de l'interface, qui
 * marque ses pauses avec « · ».
 *
 * Ce garde vise le tiret cadratin employé comme SÉPARATEUR · un — entouré d'un
 * espace (normal, insécable ou fin). Le — collé entre guillemets (« — » comme
 * marqueur de valeur absente dans un tableau) est un usage légitime et distinct ·
 * il n'a pas d'espace adjacent, donc il n'est pas visé.
 *
 * On lit le RÉSULTAT · le texte des écrans une fois retirés commentaires et
 * imports, pas ce qui n'atteint jamais l'affichage.
 */
function tsx(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    if (e === 'node_modules' || e === '.next' || e === 'test') continue;
    const p = join(dir, e);
    if (statSync(p).isDirectory()) tsx(p, out);
    else if (e.endsWith('.tsx')) out.push(p);
  }
  return out;
}

/** Retire commentaires de bloc (dont {/* *​/}), commentaires de ligne et imports. */
function texteEcran(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/^\s*import[\s\S]*?;$/gm, '');
}

// Tiret cadratin séparateur · précédé OU suivi d'un espace (normal, insécable, fin).
const TIRET_SEPARATEUR = /[    ]—|—[    ]/;

describe('typographie · pas de tiret cadratin séparateur à l’écran', () => {
  it('aucun écran n’emploie « — » comme séparateur (utiliser « · »)', () => {
    const racine = process.cwd();
    const fautifs: string[] = [];
    for (const dossier of ['app', 'components']) {
      for (const f of tsx(join(racine, dossier))) {
        const texte = texteEcran(readFileSync(f, 'utf8'));
        for (const l of texte.split('\n')) {
          if (TIRET_SEPARATEUR.test(l)) fautifs.push(`${f.replace(racine + '/', '')} · ${l.trim().slice(0, 70)}`);
        }
      }
    }
    expect(fautifs, `« — » séparateur à remplacer par « · » :\n${fautifs.join('\n')}`).toEqual([]);
  });
});
