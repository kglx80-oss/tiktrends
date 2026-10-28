import { describe, expect, it } from 'vitest';
import { FEATURES, canAccess, railNav, rubriqueDeFeature, type Access } from '../lib/rbac';

/**
 * Lot 19C · l'entrée « Formats » de la navigation · on lit ce que `railNav`
 * REND (la liste filtrée par les droits, lue par la coquille Spatial). L'état
 * actif du rail V5 (`railEntreeActive`) est retiré avec l'ancienne coquille.
 *
 * - member · core · présente sous Veille, juste après Sauvegardes, ouverte
 *   (UX V2 · les sous-entrées sont les ONGLETS de la section Veille) ;
 * - offre sous Core · présente mais VERROUILLÉE, comme Veille et Sauvegardes
 *   (le rail montre les rubriques de l'offre supérieure, la page explique) ;
 * - rôle inférieur (lecteur client) · absente.
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
});
