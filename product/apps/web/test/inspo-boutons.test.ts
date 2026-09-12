import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Les boutons de la veille (★ Sauvegarder, + Suivre, ✕ Ne plus suivre) sont les
 * gestes les plus RÉPÉTÉS du parcours · ils doivent résister au double-clic et se
 * viser au doigt. Le composant importe des actions serveur, donc il n'est pas
 * rendable en test isolé (le dépôt n'a pas de DOM en test) · on éprouve
 * l'ADOPTION par la source (comme empty-adoption / jarvis-barres). Les RÉSULTATS,
 * eux, sont prouvés à part dans le noyau : le verrou anti-double-clic par
 * verrou-action.test.ts, le seuil tactile par cible-tactile.test.ts.
 *
 * Le point faible d'une garde de source, c'est de compter des occurrences sans
 * les rattacher à chaque bouton · une régression qui retirerait le relâchement
 * d'UN seul bouton (le figeant après un clic) doit tomber. On exige donc UNE
 * prise ET UN relâchement PAR bouton (trois), pas « au moins un quelque part ».
 */
const src = readFileSync(
  join(process.cwd(), 'components/InspoButtons.tsx'),
  'utf8',
);

describe('InspoButtons · durci contre le double-clic', () => {
  it('n’ignore plus isPending · `const [, start]` est banni', () => {
    // L'anti-patron d'origine : useTransition appelé, isPending jeté.
    expect(src, 'isPending de useTransition est de nouveau jeté').not.toMatch(/const \[\s*,\s*start\s*\]/);
    // On garde bien pending pour le lire.
    expect(src).toMatch(/const \[pending, start\] = useTransition\(\)/);
  });

  it('chaque bouton PREND le verrou du noyau dans le même tick', () => {
    // isPending ne bascule qu'au rendu suivant · seule une prise synchrone arrête
    // deux clics du même tick. Un `tenter()` par bouton, et le verrou vient du
    // noyau éprouvé, pas d'un booléen réinventé sur place.
    expect(src).toContain('verrouAction()');
    const prises = src.split('verrou.current.tenter()').length - 1;
    expect(prises, 'attendu une prise de verrou par bouton (3)').toBe(3);
  });

  it('chaque bouton RELÂCHE le verrou · un seul oubli figerait ce bouton', () => {
    // Le trou d'une garde de source : compter « au moins un » relâchement laisse
    // passer la perte du finally d'UN bouton. On exige un relâchement par bouton.
    const relaches = src.split('verrou.current.relacher()').length - 1;
    expect(relaches, 'attendu un relâchement par bouton (3)').toBe(3);
    // et il est dans un finally · couvre le succès ET l'échec.
    expect(src.split('finally {').length - 1, 'un finally par bouton').toBe(3);
  });

  it('chaque bouton se désactive pendant l’action', () => {
    const off = src.split('disabled={pending}').length - 1;
    expect(off, 'attendu disabled={pending} sur les 3 boutons').toBe(3);
  });
});

describe('InspoButtons · cible tactile au minimum maison', () => {
  it('adopte le seuil du noyau plutôt qu’un nombre écrit en dur', () => {
    // Importé du noyau (aux côtés de verrouAction), pas réinventé sur place.
    expect(src).toMatch(/import \{[^}]*CIBLE_TACTILE_MIN[^}]*\} from '@tiktrends\/core'/);
    // Les zones cliquables sont dimensionnées sur le seuil partagé, pas sur 30.
    const emplois = src.split('CIBLE_TACTILE_MIN').length - 1;
    expect(emplois, 'le seuil doit dimensionner les cibles (import + au moins 2 boutons carrés)').toBeGreaterThanOrEqual(3);
  });

  it('le ★ garde son visuel de 30 px dans une pastille interne · pas d’agrandissement', () => {
    // La zone cliquable grandit (40) mais le carré coloré reste à 30.
    expect(src).toContain('width: 30, height: 30');
    expect(src).toContain('aria-hidden');
  });
});
