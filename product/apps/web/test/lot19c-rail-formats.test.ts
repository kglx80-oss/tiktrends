import { describe, expect, it } from 'vitest';
import { railEntreeActive } from '@tiktrends/core';
import { FEATURES, canAccess, railNav, rubriqueDeFeature, type Access } from '../lib/rbac';

/**
 * Lot 19C · l'entrée de rail « Formats » · on lit ce que le rail REND
 * (`railNav`, la liste exacte que le rail affiche) et l'état actif calculé au
 * noyau (`railEntreeActive`, celui qu'utilise AppShell).
 *
 * - member · core · présente sous Veille, juste après Sauvegardes, ouverte
 *   (UX V2 · les sous-entrées sont les ONGLETS de la section Veille) ;
 * - offre sous Core · présente mais VERROUILLÉE, comme Veille et Sauvegardes
 *   (le rail montre les rubriques de l'offre supérieure, la page explique) ;
 * - rôle inférieur (lecteur client) · absente ;
 * - sur /veille/formats · « Formats » est l'entrée active, et elle seule.
 */
const items = (a: Access) => railNav(a).flatMap((g) => g.items.map((i) => ({ ...i, groupe: g.group })));

describe('rail · entrée « Formats »', () => {
  it('member · core · présente sous Veille, après Sauvegardes, ouverte', () => {
    const l = items({ role: 'member', plan: 'core' });
    const f = l.find((i) => i.key === 'formats');
    expect(f, 'l’entrée Formats manque au rail').toBeTruthy();
    expect(f).toMatchObject({ label: 'Formats', href: '/veille/formats', parent: 'inspo', isSub: true, locked: false, groupe: 'Principal' });
    const cles = l.map((i) => i.key);
    expect(cles.indexOf('formats')).toBe(cles.indexOf('saved') + 1);
  });

  it('sous l’offre Core · verrouillée, comme Veille', () => {
    const l = items({ role: 'member', plan: 'starter' });
    expect(l.find((i) => i.key === 'formats')?.locked, 'Formats doit être verrouillée sous Core').toBe(true);
    expect(l.find((i) => i.key === 'inspo')?.locked).toBe(true);
  });

  it('rôle inférieur (lecteur client) · absente, même en Business', () => {
    expect(items({ role: 'client_viewer', plan: 'business' }).some((i) => i.key === 'formats')).toBe(false);
    // Le parent Veille le cache déjà au rail · l'accès propre de l'entrée doit
    // aussi refuser (palette, ouvertures par rôle lisent `canAccess`).
    expect(canAccess({ role: 'client_viewer', plan: 'business' }, FEATURES.find((f) => f.key === 'formats')!)).toBe(false);
  });

  it('rubrique d’équipe · Veille', () => {
    expect(rubriqueDeFeature('formats')).toBe('veille');
  });

  it('sur /veille/formats · Formats est active, et elle seule', () => {
    const l = items({ role: 'member', plan: 'core' });
    const actives = l.filter((i) => railEntreeActive(i.href, { pathname: '/veille/formats', tab: 'overview', hash: '', ancres: new Set() })).map((i) => i.key);
    expect(actives).toEqual(['formats']);
  });
});
