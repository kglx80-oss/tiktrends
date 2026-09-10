import { describe, it, expect } from 'vitest';
import { STEPS } from '@tiktrends/core';
import { FEATURES, roleAtLeast, type Role } from '../lib/rbac';

/**
 * Le drapeau `adminOnly` du parcours doit dire la VÉRITÉ sur l'écran visé.
 *
 * Le parcours vit dans `packages/core` (pur, sans accès aux rôles de route) · il
 * porte un drapeau `adminOnly` par étape. Le contrôle d'accès réel vit ici, dans
 * `rbac`. Rien ne les reliait : un drapeau posé de travers, ou une route dont le
 * `minRole` change, et le parcours reproposerait à un membre une porte fermée ·
 * exactement la boucle qu'on vient de fermer.
 *
 * On croise les deux : pour chaque étape, on résout le rôle minimum de son écran
 * et on exige que `adminOnly` corresponde à « un membre ne peut pas y aller ».
 * On mesure le RÉSULTAT (le membre atteint-il l'écran ?), pas la présence du
 * drapeau.
 */
describe('le drapeau adminOnly du parcours colle au verrou réel de la route', () => {
  // Rôle minimum exigé par l'écran d'une étape · match exact, sinon le FEATURE
  // parent le plus spécifique (ex. /brands/new hérite de /brands).
  const minRolePour = (href: string): Role | null => {
    const path = href.split('?')[0]!;
    const exact = FEATURES.find((f) => f.href.split('?')[0] === path);
    if (exact) return exact.minRole;
    const parents = FEATURES
      .filter((f) => path.startsWith(f.href.split('?')[0]! + '/'))
      .sort((a, b) => b.href.length - a.href.length);
    return parents[0]?.minRole ?? null;
  };

  it('chaque écran d’étape est résoluble dans rbac · sinon on ne sait pas qui y accède', () => {
    const orphelines = STEPS.filter((s) => minRolePour(s.href) === null).map((s) => `${s.key}→${s.href}`);
    expect(orphelines, `Étape(s) sans route rbac connue : ${orphelines.join(', ')}`).toEqual([]);
  });

  it('adminOnly est vrai exactement quand un membre ne peut PAS ouvrir l’écran', () => {
    const ecarts = STEPS.map((s) => {
      const min = minRolePour(s.href)!;
      const membrePeut = roleAtLeast('member', min);
      const attendu = !membrePeut; // adminOnly attendu
      return { cle: s.key, href: s.href, min, drapeau: !!s.adminOnly, attendu };
    }).filter((x) => x.drapeau !== x.attendu);

    expect(
      ecarts,
      `Drapeau adminOnly incohérent avec le verrou de route : ${ecarts
        .map((e) => `${e.cle} (${e.href} · min=${e.min} · drapeau=${e.drapeau}, attendu=${e.attendu})`)
        .join(' | ')}`,
    ).toEqual([]);
  });
});
