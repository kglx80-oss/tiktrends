import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Règle du dépôt · « « ADSMAP » s'écrit **Adsmap** dans l'interface ; le code et
 * les tables gardent leur orthographe. »
 *
 * Le nom du produit se lit « Adsmap » à l'écran · les majuscules « ADSMAP » sont
 * une orthographe interne (tables, types, §refs), pas une marque affichée. Ce
 * garde vise le TEXTE RENDU · commentaires et imports retirés, il refuse
 * « ADSMAP » qui atteindrait l'écran. Le code, les commentaires et les noms de
 * table gardent leur casse · ils ne sont pas lus ici.
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

function texteEcran(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/^\s*import[\s\S]*?;$/gm, '');
}

describe('interface · le produit s’écrit « Adsmap », pas « ADSMAP »', () => {
  it('aucun écran n’affiche « ADSMAP » en capitales', () => {
    const racine = process.cwd();
    const fautifs: string[] = [];
    for (const dossier of ['app', 'components']) {
      for (const f of tsx(join(racine, dossier))) {
        const texte = texteEcran(readFileSync(f, 'utf8'));
        for (const l of texte.split('\n')) {
          if (/\bADSMAP\b/.test(l)) fautifs.push(`${f.replace(racine + '/', '')} · ${l.trim().slice(0, 70)}`);
        }
      }
    }
    expect(fautifs, `« ADSMAP » à l'écran (écrire « Adsmap ») :\n${fautifs.join('\n')}`).toEqual([]);
  });
});
