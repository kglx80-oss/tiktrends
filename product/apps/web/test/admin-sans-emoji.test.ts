import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * L'accueil des coulisses (admin) n'affiche plus d'emoji d'interface · rollout
 * icônes (retour proprio #2). Les cartes d'outils portaient un emoji par `icon`
 * (📈🧭◈📟🧠🔭💳⚙️) et le héros un 🎛️ · elles portent désormais des NOMS du
 * jeu partagé, rendus par <Icon>.
 */
const SRC = readFileSync(join(process.cwd(), 'app/(app)/admin/page.tsx'), 'utf8');
const BANNIS = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{26FF}\u{2728}\u{2726}\u{FE0F}\u{25C8}]/gu;

describe('Admin · plus aucun emoji d’interface', () => {
  it('la page ne porte aucun pictogramme ni losange', () => {
    const trouves = [...new Set(SRC.match(BANNIS) ?? [])];
    expect(trouves, `glyphe(s) d'interface encore dans admin/page.tsx : ${trouves.join(' ')}`).toEqual([]);
  });
  it('les cartes d’outils rendent une icône du jeu', () => {
    // Lot 4c · les cartes viennent du noyau (`groupesAdministration`) · l'icône
    // reste un NOM du jeu partagé, lu dans la table `ICONE` de la page.
    expect(SRC).toMatch(/<Icon name=\{ICONE\[t\.cle\] \?\? 'grid'\}/);
    const icones = /const ICONE[^=]*=\s*\{([\s\S]*?)\};/.exec(SRC)?.[1] ?? '';
    expect(icones, 'table des icônes absente').not.toBe('');
    expect(icones.match(BANNIS) ?? []).toEqual([]);
    expect(SRC).toMatch(/<Icon name="gauge"/);
  });
});
