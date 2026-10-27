import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { etapesConfigurationMarque } from '@tiktrends/core';

/**
 * « Compléter le profil » et « Définir la charte » doivent MENER quelque part.
 *
 * Le défaut signalé : ces deux étapes du démarrage pointaient vers
 * `/brands/${id}` — la page où l'on est déjà. Cliquer ne bougeait pas · le
 * formulaire de profil et la charte restent plus bas sur l'onglet Aperçu, hors
 * de vue. « Le bouton ne déclenche rien. »
 *
 * Correction · l'étape ancre vers la bonne section (`#profil` / `#charte`), et
 * la cible existe. On garde les DEUX bouts LIÉS · une ancre sans cible ne défile
 * nulle part, une cible sans ancre ne sert personne. `#profil` vit dans la page,
 * `#charte` vit désormais sur la section « Charte & kit » de BrandDA (rendu par
 * la page) · on lit chaque source là où sa cible habite.
 */

// Vague 2 · la fiche V5 (et ses ancres #profil / #charte) est retirée · la carte
// « Finis de configurer » de l'écran Spatial mène à « À compléter » de la vue
// d'ensemble. On garde les DEUX bouts liés · l'étape (règle du noyau) et la cible.
const vue = readFileSync(join(__dirname, '..', 'spatial', 'vues', 'marque', 'Marque.tsx'), 'utf8');

describe('démarrage · l’étape « fiche » mène à sa section', () => {
  it('l’étape « fiche » ancre vers #a-completer, et l’écran porte cette ancre', () => {
    const e = etapesConfigurationMarque({ manquesFiche: 3, metaConnecte: true, concurrentsSuivis: 3, concurrentsRenseignes: 3, sauvegardes: 5, lotsLances: 1, personnes: 2 }, 'b1').find((x) => x.cle === 'fiche')!;
    expect(e.href, 'l’étape fiche doit ancrer vers la section à compléter (pas la page nue)').toBe('/brands/b1#a-completer');
    expect(vue, 'l’écran doit porter la cible id="a-completer"').toContain('id="a-completer"');
  });
});
