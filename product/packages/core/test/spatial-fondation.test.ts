import { describe, expect, it } from 'vitest';
import {
  uiDepuisCookie, uiDemandee, UI_DEFAUT, ecranSpatial, cheminPorte, sectionValide, ECRANS_SPATIAUX,
  ecranSpatialDans, servirEnSpatial, entreesRail, entreesRailEspace, consommationParSemaine, consommationSur, partSolde, SECTIONS_SPATIALES, initialesAvatar, sectionDuChemin,
} from '../src';

describe('Spatial · bascule', () => {
  it('le cookie ne vaut que deux valeurs, le reste retombe sur le défaut', () => {
    expect(uiDepuisCookie('spatial')).toBe('spatial');
    expect(uiDepuisCookie('v5')).toBe('v5');
    for (const v of [undefined, null, '', 'SPATIAL', 'clair', 'x']) expect(uiDepuisCookie(v)).toBe(UI_DEFAUT);
    // Bascule faite · sans cookie, c'est Spatial.
    expect(UI_DEFAUT).toBe('spatial');
    expect(uiDemandee('spatial')).toBe('spatial');
    expect(uiDemandee('nimporte')).toBeNull();
    expect(uiDemandee(null)).toBeNull();
  });

  it('un chemin porté est réécrit vers l’arbre interne avec sa section, un chemin non porté jamais', () => {
    expect(ecranSpatial('/usage')).toMatchObject({ interne: '/sp/usage', section: 'reglages', exclusif: true });
    // Vague 2 Spatial v4 · `/dashboard` est exclusif · `/onboarding` reste l'exemple d'un écran porté NON exclusif.
    expect(ecranSpatial('/onboarding')).toMatchObject({ interne: '/sp/onboarding', section: 'accueil', exclusif: false });
    expect(ecranSpatial('/dashboard')).toMatchObject({ interne: '/sp/dashboard', section: 'accueil', exclusif: true });
    expect(ecranSpatial('/usage/')).toMatchObject({ interne: '/sp/usage', section: 'reglages', exclusif: true });
    expect(ecranSpatial('/usage/x')).toBeNull();
    // Un chemin qu'aucune rubrique ne porte (`/billing` l'est désormais, rubrique G).
    expect(ecranSpatial('/credits')).toBeNull();
    // Un chemin déjà interne n'est jamais réécrit une seconde fois.
    expect(ecranSpatial('/sp/usage')).toBeNull();
    expect(cheminPorte('/usage?onglet=x#a')).toBe(true);
    expect(cheminPorte('/credits')).toBe(false);
  });

  it('chaque écran porté déclare une section connue et un chemin public unique', () => {
    const vus = new Set<string>();
    for (const e of ECRANS_SPATIAUX) {
      expect(SECTIONS_SPATIALES, e.chemin).toContain(e.section);
      expect(e.chemin.startsWith('/') && !e.chemin.startsWith('/sp'), e.chemin).toBe(true);
      expect(vus.has(e.chemin), `doublon ${e.chemin}`).toBe(false);
      vus.add(e.chemin);
    }
  });

  it('écran exclusif · servi par Spatial même en mode V5 ; un écran non exclusif suit le cookie', () => {
    const liste = [{ chemin: '/a', section: 'accueil' as const }, { chemin: '/b/[id]', section: 'veille' as const, exclusif: true as const }];
    const a = ecranSpatialDans(liste, '/a'), b = ecranSpatialDans(liste, '/b/42');
    expect([a?.exclusif, b?.exclusif, b?.interne]).toEqual([false, true, '/sp/b/42']);
    expect([servirEnSpatial(a, 'spatial'), servirEnSpatial(a, 'v5'), servirEnSpatial(b, 'v5'), servirEnSpatial(null, 'spatial')]).toEqual([true, false, true, false]);
  });

  it('seules les sections connues passent l’en-tête', () => {
    expect(sectionValide('veille')).toBe('veille');
    expect(sectionValide('"><script>')).toBeNull();
    expect(sectionValide(undefined)).toBeNull();
  });
});

describe('Spatial · rail', () => {
  const tout = new Set(['/studio/projets', '/veille', '/adsmap', '/assets', '/jarvis', '/brands', '/settings']);
  it('ordre de la maquette quand tout est ouvert · MCP reste « bientôt », sans destination', () => {
    const r = entreesRail({ ouverts: tout, marque: null });
    expect(r.map((x) => x.cle)).toEqual(['accueil', 'studios', 'veille', 'resultats', 'bibliotheque', 'jarvis', 'mcp']);
    const mcp = r.find((x) => x.cle === 'mcp')!;
    expect(mcp.href).toBeNull();
    expect(mcp.bientot).toBeTruthy();
  });
  it('une destination fermée par la formule ou le rôle disparaît du rail · jamais de porte morte', () => {
    const r = entreesRail({ ouverts: new Set(['/jarvis']), marque: null });
    expect(r.map((x) => x.cle)).toEqual(['accueil', 'jarvis', 'mcp']);
  });
  it('le bloc espace suit la marque active et les droits de réglage', () => {
    expect(entreesRailEspace({ ouverts: tout, marque: { id: 'b1', nom: 'Neva' } }).map((x) => [x.cle, x.href, x.sous]))
      .toEqual([['marque', '/brands/b1', 'Fiche marque Neva'], ['reglages', '/settings', 'Équipe, connexions, crédits']]);
    expect(entreesRailEspace({ ouverts: tout, marque: null }).map((x) => x.cle)).toEqual(['reglages']);
    expect(entreesRailEspace({ ouverts: new Set(), marque: { id: 'b1', nom: 'Neva' } })).toEqual([]);
  });
});

describe('Spatial · consommation par semaine', () => {
  const now = new Date('2026-10-27T12:00:00Z');
  const il = (jours: number) => new Date(now.getTime() - jours * 86_400_000);
  it('seuls les débits comptent, rangés dans leur semaine, la dernière = en cours', () => {
    const s = consommationParSemaine([
      { delta: -10, createdAt: il(1) }, { delta: -5, createdAt: il(2) },
      { delta: +500, createdAt: il(1) }, // recharge · n'est pas une consommation
      { delta: -20, createdAt: il(8) },
      { delta: -99, createdAt: il(200) }, // hors fenêtre
    ], now, 12);
    expect(s).toHaveLength(12);
    expect(s[11]!.credits).toBe(15);
    expect(s[11]!.enCours).toBe(true);
    expect(s[10]!.credits).toBe(20);
    expect(s[10]!.hauteur).toBe(100);
    expect(s[11]!.hauteur).toBe(75);
    expect(s.slice(0, 10).every((x) => x.credits === 0 && x.hauteur === 0)).toBe(true);
  });
  it('rien consommé · toutes les barres à zéro, aucune semaine pleine inventée', () => {
    expect(consommationParSemaine([], now, 4).map((x) => x.hauteur)).toEqual([0, 0, 0, 0]);
  });
  it('anneau · part du solde sur la dotation, bornée', () => {
    expect(partSolde(1240, 2000)).toBe(62);
    expect(partSolde(5000, 2000)).toBe(100);
    expect(partSolde(-3, 2000)).toBe(0);
    expect(partSolde(10, 0)).toBe(100);
  });
});

describe('Spatial · avatar, consommation récente, section d’une adresse', () => {
  it('initiales · des lettres seulement, jamais vides', () => {
    expect(initialesAvatar('Kevin Guilbaux', 'k@x.fr')).toBe('KG');
    expect(initialesAvatar('Kevin (banc)', 'k@x.fr')).toBe('KB');
    expect(initialesAvatar('  élodie  ', 'e@x.fr')).toBe('É');
    expect(initialesAvatar('', 'jo.doe@x.fr')).toBe('JO');
    expect(initialesAvatar('', '1@2.3')).toBe('?');
  });
  it('consommation sur 30 jours · débits seulement, dans la fenêtre', () => {
    const now = new Date('2026-10-27T12:00:00Z');
    const il = (j: number) => new Date(now.getTime() - j * 86_400_000);
    expect(consommationSur([{ delta: -10, createdAt: il(1) }, { delta: -5, createdAt: il(29) }, { delta: -7, createdAt: il(31) }, { delta: 100, createdAt: il(2) }], now, 30)).toBe(15);
  });
  it('la section suit le préfixe de l’adresse, portée ou non', () => {
    expect(sectionDuChemin('/dashboard')).toBe('accueil');
    expect(sectionDuChemin('/studio/projets/abc/image')).toBe('studios');
    expect(sectionDuChemin('/saved')).toBe('veille');
    expect(sectionDuChemin('/brands/b1/offre')).toBe('marque');
    expect(sectionDuChemin('/usage?x=1')).toBe('reglages');
    expect(sectionDuChemin('/studiox')).toBeNull();
    expect(sectionDuChemin('/')).toBeNull();
  });
});
