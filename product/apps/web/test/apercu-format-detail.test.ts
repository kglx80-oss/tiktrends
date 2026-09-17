import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * CDC v6 · #1 (complément) · dans le détail Pubs IA, le format est honnête selon
 * le mode. La règle vit au noyau (`formatApercu`, testé) · ici on vérifie qu'elle
 * PILOTE l'écran · une entière ne se recadre pas, aperçu = export, et l'AdItem
 * porte le mode qui décide. Composant géant non rendable · garde par adoption.
 */
const studio = readFileSync(join(process.cwd(), 'app/(app)/studio/ads/AdsStudio.tsx'), 'utf8');
const actions = readFileSync(join(process.cwd(), 'app/actions/ads.ts'), 'utf8');

describe('le détail Pubs IA branche la règle de format sur le mode', () => {
  it('la décision de format vient du noyau, nourrie par le mode de la pub', () => {
    expect(studio).toMatch(/formatApercu\(detailAd\?\.mode, ratio\)/);
  });

  it('une entière ne force aucun cadre · l’aperçu (donc l’export) est l’origine', () => {
    // `choixCadre` faux ⇒ detailSrc = l'URL sans ratio ⇒ aperçu identique au fichier.
    expect(studio).toMatch(/fmtApercu\.choixCadre \? withParam\(detailAd\.url, 'r', ratio\) : detailAd\.url/);
  });

  it('le sélecteur de cadre ne s’affiche que quand le cadre est un vrai choix', () => {
    expect(studio).toMatch(/fmtApercu\.choixCadre \? \(/);
    expect(studio, 'une entière doit annoncer son format d’origine').toContain('Format d’origine');
  });

  it('le téléchargement et la limite sont dits par la règle', () => {
    expect(studio).toContain('{fmtApercu.libelleTelechargement}');
    expect(studio).toContain('{fmtApercu.note}');
    // On ne code plus « Télécharger (ratio) » en dur · c'est la règle qui décide.
    expect(studio, 'le libellé de téléchargement est encore figé').not.toContain('Télécharger ({ratio})');
  });
});

describe('l’AdItem porte le mode qui décide du format', () => {
  it('les pubs chargées et fraîchement générées portent leur mode', () => {
    expect(actions.match(/mode: rec\.mode \?\? undefined/), 'les pubs listées ne portent pas leur mode').toBeTruthy();
    expect(actions.match(/mode: recipe\.mode \?\? undefined/), 'les pubs générées ne portent pas leur mode').toBeTruthy();
  });
});
