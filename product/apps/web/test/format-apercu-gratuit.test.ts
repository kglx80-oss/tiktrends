import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * CDC v6 · aperçus fidèles · choisir un format ne coûte RIEN.
 *
 * Le propriétaire l'exige · « Aucun traitement payant ne doit être déclenché
 * silencieusement par la sélection d'un format ». Sélectionner un ratio ne doit
 * que reconstruire l'adresse de l'IMAGE (`?r=`), qui est une lecture · jamais
 * appeler une action serveur ni le modèle. La valeur EST le résultat · un bouton
 * de ratio câblé sur une action de génération dépenserait sans le dire.
 *
 * Composant client volumineux à actions serveur · non rendable · garde par
 * adoption de la source.
 */
const src = readFileSync(join(process.cwd(), 'app/(app)/studio/ads/AdsStudio.tsx'), 'utf8');

describe('AdsStudio · sélectionner un format est gratuit', () => {
  it('le bouton de ratio ne fait que poser l’état · aucune action', () => {
    // Le seul effet du clic est `setRatio(r)` · pas d'appel de génération, de
    // déclinaison ou de score.
    expect(src, 'le bouton de ratio ne pose pas simplement l’état').toContain('onClick={() => setRatio(r)}');
  });

  it('l’aperçu et le téléchargement sortent de la même adresse d’image', () => {
    // `withParam(url, 'r', ratio)` est une URL d'image (un GET), pas un appel
    // payant · et l'aperçu comme le téléchargement la partagent, donc le fichier
    // exporté est identique à ce qui est affiché.
    expect(src, 'l’adresse d’aperçu n’est pas un simple paramètre d’URL').toMatch(/const detailSrc = detailAd \? withParam\(detailAd\.url, 'r', ratio\) : ''/);
    expect(src, 'le téléchargement ne pointe pas sur l’adresse d’aperçu').toContain('href={detailSrc}');
  });
});
