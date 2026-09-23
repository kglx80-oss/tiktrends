import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * « Compléter le profil » et « Définir la charte » doivent MENER quelque part.
 *
 * Le défaut signalé : ces deux étapes du démarrage pointaient vers
 * `/brands/${id}` — la page où l'on est déjà. Cliquer ne bougeait pas · le
 * formulaire de profil et la charte restent plus bas sur l'onglet Aperçu, hors
 * de vue. « Le bouton ne déclenche rien. »
 *
 * Correction · l'étape ancre vers la bonne section (`#profil` / `#charte`), et
 * la page porte ces ancres. On garde les DEUX bouts LIÉS · une ancre sans cible
 * ne défile nulle part, une cible sans ancre ne sert personne. On lit la source
 * de la page (composant serveur async · non rendable en jsdom sans base).
 */

const page = readFileSync(
  join(__dirname, '..', 'app', '(app)', 'brands', '[id]', 'page.tsx'),
  'utf8',
);

describe('démarrage · les étapes profil/charte mènent à leur section', () => {
  it('l’étape « profil » ancre vers #profil, et la page porte cette ancre', () => {
    const ligne = page.split('\n').find((l) => l.includes("key: 'profil'")) ?? '';
    expect(ligne, 'l’étape profil doit ancrer vers #profil (pas la page nue)').toContain('#profil');
    expect(page, 'la page doit porter la cible id="profil"').toContain('id="profil"');
  });

  it('l’étape « charte » ancre vers #charte, et la page porte cette ancre', () => {
    const ligne = page.split('\n').find((l) => l.includes("key: 'charte'")) ?? '';
    expect(ligne, 'l’étape charte doit ancrer vers #charte').toContain('#charte');
    expect(page, 'la page doit porter la cible id="charte"').toContain('id="charte"');
  });
});
