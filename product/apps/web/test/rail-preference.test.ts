import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { RAIL_COOKIE, railCollapsedFromCookie, railCookieString } from '../lib/rail-preference';

/**
 * La préférence de repli du rail, lue AU RENDU · pas de flash déployé→replié.
 *
 * ── La règle, testée par son RÉSULTAT ────────────────────────────────────────
 *
 * Seule la valeur « 1 » vaut replié · tout le reste (absent, « 0 », vide,
 * inconnu) rend le rail déployé. Le défaut sûr est le rail VISIBLE · une valeur
 * corrompue ne doit pas cacher la navigation.
 */
describe('railCollapsedFromCookie · la valeur du cookie décide, défaut déployé', () => {
  it('« 1 » · et rien d’autre · vaut replié', () => {
    expect(railCollapsedFromCookie('1')).toBe(true);
  });

  it('absent, « 0 », vide ou inconnu · le rail reste déployé', () => {
    expect(railCollapsedFromCookie(undefined)).toBe(false);
    expect(railCollapsedFromCookie(null)).toBe(false);
    expect(railCollapsedFromCookie('0')).toBe(false);
    expect(railCollapsedFromCookie('')).toBe(false);
    expect(railCollapsedFromCookie('true')).toBe(false);
  });

  it('la chaîne écrite au navigateur porte la préférence, un an, path racine, lax', () => {
    expect(railCookieString(true)).toContain(`${RAIL_COOKIE}=1`);
    expect(railCookieString(false)).toContain(`${RAIL_COOKIE}=0`);
    expect(railCookieString(true)).toContain('path=/');
    expect(railCookieString(true)).toMatch(/max-age=\d+/);
    expect(railCookieString(true).toLowerCase()).toContain('samesite=lax');
  });
});

/**
 * Le câblage anti-flicker · garde de SOURCE, comme les autres invariants du
 * rail (`rail-actif`, `rail-replie`, `n08`). `AppShell` dépend du routeur pour
 * se rendre · on tient donc le contrat sur le texte, et on le prouve en le
 * cassant : réintroduire `useState(false)` + un effet localStorage fait tomber
 * ces assertions.
 */
describe('AppShell · l’état du rail part de la valeur SERVEUR, pas d’un effet', () => {
  const shell = readFileSync(join(process.cwd(), 'components/AppShell.tsx'), 'utf8');
  const layout = readFileSync(join(process.cwd(), 'app/(app)/layout.tsx'), 'utf8');

  it('l’état initial vient de la prop serveur `collapsedInitial`', () => {
    expect(shell).toContain('useState(collapsedInitial)');
  });

  it('plus aucun effet ne lit localStorage pour corriger le repli après montage', () => {
    expect(shell, 'la lecture localStorage du repli rouvre le flash déployé→replié')
      .not.toContain('tt_rail_collapsed');
  });

  it('le basculement réécrit le cookie · le prochain rendu serveur sera juste', () => {
    expect(shell).toContain('railCookieString(n)');
  });

  it('le layout lit le cookie côté serveur et le passe à la coquille', () => {
    expect(layout).toContain('railCollapsedFromCookie');
    expect(layout).toContain('collapsedInitial={collapsedInitial}');
  });
});
