import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Un bouton qui refuse dit ce qu'il attend.
 *
 * ── Le défaut ────────────────────────────────────────────────────────────────
 *
 * Les gabarits démarrent vides. Le bouton « Générer les pubs » avait donc l'air
 * actif ; au clic, `run()` refusait et posait « Choisis au moins un gabarit »
 * dans le bandeau d'erreur, ailleurs sur la page. Qui vient de cliquer regarde
 * le bouton, pas le haut de l'écran.
 *
 * Le rapport reçu était : « le bouton Générer ne fonctionne pas ». C'est
 * exactement ce qu'on voit quand une condition est vraie quelque part et
 * n'est écrite nulle part.
 *
 * ── L'invariant ──────────────────────────────────────────────────────────────
 *
 * Ce garde ne vérifie pas une pixel-perfection · il vérifie que le composeur
 * SAIT dire pourquoi il refuse, et que le studio le lui dit. Les deux moitiés
 * sont nécessaires : un composeur muet ou un studio qui ne lui parle pas
 * ramènent le même bouton mort.
 */

const COMPOSER = readFileSync(join(process.cwd(), 'components/Composer.tsx'), 'utf8');
const STUDIO = readFileSync(join(process.cwd(), 'app/(app)/studio/ads/AdsStudio.tsx'), 'utf8');

describe('le composeur sait dire pourquoi il refuse', () => {
  it('accepte une raison de blocage', () => {
    expect(COMPOSER, 'le composeur ne reçoit plus de raison').toMatch(/blocage\?:\s*string/);
  });

  it('la raison désactive vraiment le bouton', () => {
    // Une raison affichée sous un bouton actif serait pire que rien · on
    // annoncerait un refus qui n'a pas lieu.
    expect(COMPOSER).toMatch(/const pret = [^;]*!blocage/);
  });

  it('la raison est affichée, pas seulement calculée', () => {
    expect(COMPOSER, 'la raison est calculée et jamais rendue').toMatch(/\{empeche &&/);
  });

  it('le travail en cours n’est pas présenté comme un blocage', () => {
    // « Génération en cours » n'est pas une raison de refus · le bouton le dit
    // déjà lui-même.
    expect(COMPOSER).toMatch(/const empeche = busy\s*\n?\s*\?\s*''/);
  });
});

describe('le studio dit ce qui manque', () => {
  it('signale l’absence de gabarit', () => {
    // C'est LE cas qui a produit « le bouton ne fonctionne pas ».
    expect(STUDIO).toMatch(/blocage=\{[^}]*templates\.length/);
  });

  it('ne bloque que là où le refus existe vraiment', () => {
    // `run()` n'exige des gabarits qu'en mode marque · les exiger en mode clone
    // interdirait une action que le serveur accepte.
    const bloc = /blocage=\{([^}]*)\}/.exec(STUDIO)?.[1] ?? '';
    expect(bloc, 'le blocage ignore le mode').toContain("mode === 'brand'");
  });

  it('le refus au clic existe toujours', () => {
    // La ceinture reste · le blocage est la bretelle, pas son remplacement.
    expect(STUDIO).toMatch(/Choisis au moins un gabarit/);
  });
});
