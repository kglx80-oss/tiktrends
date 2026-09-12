import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Le chat Jarvis a trois entrées vers `envoyer` (une amorce cliquée, le bouton,
 * la touche Entrée) et l'action est un appel modèle · donc PAYANT. Le garde
 * d'origine (`if (!q || enCours) return`) lit `enCours`, un état qui ne bascule
 * qu'au rendu SUIVANT · deux gestes du même tick partent en double, et doublent
 * la dépense. On pose un verrou pris de façon synchrone (`verrouAction`, noyau
 * éprouvé) dans `envoyer`, relâché dans le `finally`.
 *
 * Le composant importe des actions serveur (non rendable, pas de DOM en test) ·
 * on éprouve l'ADOPTION par la source. Le RÉSULTAT du verrou est prouvé dans le
 * noyau (verrou-action.test.ts).
 */
const src = readFileSync(
  join(process.cwd(), 'app/(app)/jarvis/JarvisChat.tsx'),
  'utf8',
);

describe('JarvisChat · un seul envoi par geste', () => {
  it('prend le verrou du noyau, pas un booléen d’état seul', () => {
    expect(src).toMatch(/import \{[^}]*verrouAction[^}]*\} from '@tiktrends\/core'/);
    expect(src).toContain('useRef(verrouAction())');
    expect(src).toContain('verrou.current.tenter()');
  });

  it('relâche le verrou dans un finally · couvre le flux, l’erreur et l’échec HTTP', () => {
    expect(src).toContain('verrou.current.relacher()');
    // Un seul point de relâche, dans le finally · les retours anticipés (HTTP en
    // échec) passent par ce même finally, donc pas de verrou oublié.
    expect(src.split('verrou.current.relacher()').length - 1).toBe(1);
    const apresFinally = src.slice(src.indexOf('} finally {'));
    expect(apresFinally).toContain('verrou.current.relacher()');
  });

  it('le retour anticipé sur HTTP en échec est DANS le try · sinon il saute le finally', () => {
    // La propriété qui compte vraiment (relève de relecture) : si le bloc
    // `if (!res.ok...) { ...; return; }` passait AVANT le try, ce return
    // court-circuiterait le finally et figerait le chat · le verrou pris, jamais
    // rendu. On vérifie donc que ce return vit entre `try {` et `} finally {`.
    const iTry = src.indexOf('try {');
    const iFinally = src.indexOf('} finally {');
    const iRetourHttp = src.indexOf('if (!res.ok');
    expect(iTry, 'un try attendu').toBeGreaterThan(-1);
    expect(iRetourHttp, 'le garde HTTP attendu').toBeGreaterThan(-1);
    expect(iRetourHttp, 'le return HTTP-échec doit être après `try {`').toBeGreaterThan(iTry);
    expect(iRetourHttp, 'le return HTTP-échec doit être avant `} finally {`').toBeLessThan(iFinally);
  });

  it('n’arme plus le garde sur le seul `enCours` lu en closure', () => {
    // L'ancien garde de rejet reposait sur `enCours` (état). Il ne doit plus être
    // la seule barrière · le verrou synchrone est là.
    expect(src, 'la barrière même-tick doit être le verrou, pas enCours seul').not.toContain('if (!q || enCours) return');
  });
});
