import { describe, expect, it } from 'vitest';
import { railNav, sectionsRail, sectionDuChemin, type Access } from '../lib/rbac';

/**
 * UX V2 · règle pure du rail plat · quelle section contient l'écran courant.
 * La coquille l'utilise pour allumer la section et afficher ses onglets
 * (rendu prouvé dans uxv2-rail-rendu) · ici, la règle seule, cas limites compris.
 */
const sections = sectionsRail(railNav({ role: 'owner', plan: 'business' } as Access));
const tete = (chemin: string) => sectionDuChemin(sections, chemin)?.tete.label ?? null;

describe('sectionDuChemin · la section qui contient un écran', () => {
  it('chaque écran retrouve son module', () => {
    expect(tete('/dashboard')).toBe('Accueil');
    expect(tete('/veille')).toBe('Veille');
    expect(tete('/veille/formats')).toBe('Veille');
    expect(tete('/saved')).toBe('Veille');
    expect(tete('/tags')).toBe('Veille');
    expect(tete('/studio/projets')).toBe('Studios');
    expect(tete('/studio/projets/abc/video')).toBe('Studios');
    expect(tete('/assets')).toBe('Bibliothèque');
    expect(tete('/adsmap/suites')).toBe('Résultats');
    expect(tete('/jarvis/sources')).toBe('Jarvis');
  });

  it('le plus SPÉCIFIQUE gagne · /radar est la Veille, /adsmap/radar les Résultats', () => {
    expect(tete('/radar')).toBe('Veille');
    expect(tete('/adsmap/radar')).toBe('Résultats');
    // Un onglet d'une section imbriqué sous la tête d'une AUTRE section · c'est
    // le chemin le plus long qui décide, jamais l'ordre du rail.
    const e = (key: string, href: string, isSub = false) => ({ key, href, isSub });
    const imbriquees = sectionsRail([{ items: [e('a', '/a'), e('b', '/b'), e('ax', '/a/x', true)] }]);
    expect(sectionDuChemin(imbriquees, '/a/x/y')?.tete.key).toBe('b');
    expect(sectionDuChemin(imbriquees, '/a/z')?.tete.key).toBe('a');
  });

  it('un préfixe de mot n’est pas un descendant · /adsmapx, /savedx ne sont rien', () => {
    expect(tete('/adsmapx')).toBeNull();
    expect(tete('/savedx')).toBeNull();
  });

  it('hors des modules (espace, plateforme) · aucune section, donc aucun onglet', () => {
    expect(tete('/brands')).toBeNull();
    expect(tete('/settings')).toBeNull();
    expect(tete('/admin/finance')).toBeNull();
  });

  it('les sections suivent les droits · un membre n’a pas les onglets réservés aux admins', () => {
    const m = sectionsRail(railNav({ role: 'member', plan: 'business' } as Access));
    const resultats = m.find((s) => s.tete.key === 'adsmap')!;
    expect(resultats.onglets.map((o) => o.key)).not.toContain('lots');
    expect(resultats.onglets.map((o) => o.key)).not.toContain('import');
  });
});
