import { describe, it, expect } from 'vitest';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { ROUTES, matchRoute, breadcrumb, isBrandScoped, routeLabel } from '../lib/navigation';

describe('la carte décrit toutes les pages · sinon elle dérive', () => {
  /**
   * Le garde qui empêche le retour au désordre.
   *
   * La navigation avait divergé parce que rien ne reliait les écrans à leur
   * déclaration. Ajouter une page sans l'inscrire ici la rendrait invisible du
   * fil d'Ariane · silencieusement, comme avant.
   */
  const pagesDe = (dir: string, prefixe = ''): string[] => {
    const out: string[] = [];
    for (const e of readdirSync(dir)) {
      const p = join(dir, e);
      if (statSync(p).isDirectory()) {
        // Les groupes entre parenthèses n'apparaissent pas dans l'URL.
        const seg = e.startsWith('(') && e.endsWith(')') ? '' : `/${e}`;
        out.push(...pagesDe(p, prefixe + seg));
      } else if (e === 'page.tsx') {
        out.push(prefixe || '/');
      }
    }
    return out;
  };

  it('chaque page.tsx a son entrée', () => {
    const racine = join(process.cwd(), 'app', '(app)');
    const declarees = new Set(ROUTES.map((r) => r.path));
    const orphelines = pagesDe(racine).filter((p) => !declarees.has(p));
    expect(orphelines, `Page(s) absente(s) de ROUTES · elles n'auront pas de fil d'Ariane : ${orphelines.join(', ')}`)
      .toEqual([]);
  });

  it('chaque parent déclaré existe', () => {
    const connus = new Set(ROUTES.map((r) => r.path));
    const perdus = ROUTES.filter((r) => r.parent && !connus.has(r.parent)).map((r) => r.path);
    expect(perdus).toEqual([]);
  });

  it('aucun chemin déclaré deux fois', () => {
    const vus = ROUTES.map((r) => r.path);
    expect(new Set(vus).size).toBe(vus.length);
  });
});

describe('la résolution d’un chemin', () => {
  it('trouve un chemin littéral', () => {
    expect(matchRoute('/adsmap/suites')?.label).toBe('Suites');
  });

  it('trouve un chemin dynamique', () => {
    expect(matchRoute('/brands/abc-123')?.path).toBe('/brands/[id]');
  });

  it('le littéral l’emporte sur le dynamique · sinon « Nouvelle marque » serait une marque', () => {
    expect(matchRoute('/brands/new')?.label).toBe('Nouvelle marque');
  });

  it('rend null sur un chemin inconnu plutôt que de deviner', () => {
    expect(matchRoute('/nexistepas')).toBeNull();
    expect(matchRoute('/adsmap/inconnu')).toBeNull();
  });

  it('ne confond pas deux profondeurs', () => {
    expect(matchRoute('/brands/abc/competitors/nike')?.path).toBe('/brands/[id]/competitors/[name]');
  });

  it('expose le libellé d’un écran', () => {
    expect(routeLabel('/adsmap/radar')).toBe('Radar de veille');
    expect(routeLabel('/radar')).toBe('Radar produits');
  });
});

describe('le fil d’Ariane dit où l’on est', () => {
  it('rien à dire sur une racine de section hors marque', () => {
    // « Espace › Membres » sur l'écran Membres ajoute une ligne et zéro information.
    expect(breadcrumb('/team')).toEqual([]);
  });

  it('rien à dire sur un chemin inconnu', () => {
    expect(breadcrumb('/nexistepas')).toEqual([]);
  });

  it('rien à dire sur un écran caché · on ne fait que le traverser', () => {
    expect(breadcrumb('/onboarding')).toEqual([]);
    expect(breadcrumb('/adsmap/jarvis')).toEqual([]);
  });

  it('ouvre par la section', () => {
    const c = breadcrumb('/adsmap/suites');
    expect(c[0]).toEqual({ label: 'Analyse', href: null });
  });

  it('donne le chemin complet, pas une flèche vers le parent', () => {
    const c = breadcrumb('/adsmap/suites').map((x) => x.label);
    expect(c).toEqual(['Analyse', 'ADSMAP', 'Suites']);
  });

  it('le dernier maillon n’est jamais un lien', () => {
    const c = breadcrumb('/adsmap/suites');
    expect(c[c.length - 1]!.href).toBeNull();
  });

  it('les maillons intermédiaires sont cliquables', () => {
    const c = breadcrumb('/adsmap/lots');
    expect(c[1]).toEqual({ label: 'ADSMAP', href: '/adsmap' });
  });

  it('la marque s’insère après la section quand l’écran en dépend', () => {
    const c = breadcrumb('/adsmap/radar', { brandScoped: true, brandName: 'TrueFords' });
    expect(c.map((x) => x.label)).toEqual(['Analyse', 'TrueFords', 'ADSMAP', 'Radar de veille']);
  });

  it('une racine par marque mérite un fil · le contexte manquerait sinon', () => {
    const c = breadcrumb('/jarvis', { brandScoped: true, brandName: 'TrueFords' });
    expect(c.map((x) => x.label)).toEqual(['Création', 'TrueFords', 'Jarvis']);
  });

  it('sans nom de marque, on n’invente pas de maillon', () => {
    const c = breadcrumb('/adsmap/lots', { brandScoped: true, brandName: null });
    expect(c.map((x) => x.label)).toEqual(['Analyse', 'ADSMAP', 'Lots de test']);
  });

  it('un segment dynamique prend le nom de la marque', () => {
    const c = breadcrumb('/brands/abc-123', { brandName: 'TrueFords' });
    expect(c.map((x) => x.label)).toEqual(['Espace', 'Marques', 'TrueFords']);
  });

  it('un concurrent tire son nom de l’URL, décodé', () => {
    const c = breadcrumb('/brands/abc/competitors/Nike%20France', { brandName: 'TrueFords' });
    expect(c[c.length - 1]!.label).toBe('Nike France');
    expect(c[2]).toEqual({ label: 'TrueFords', href: '/brands/abc' });
  });

  it('les liens intermédiaires portent le vrai identifiant, pas le motif', () => {
    const c = breadcrumb('/brands/abc/competitors/nike', { brandName: 'M' });
    expect(c.every((x) => !x.href?.includes('['))).toBe(true);
  });
});

describe('les écrans qui travaillent marque par marque sont déclarés', () => {
  it('ADSMAP et Jarvis en font partie', () => {
    expect(isBrandScoped('/adsmap')).toBe(true);
    expect(isBrandScoped('/jarvis')).toBe(true);
    expect(isBrandScoped('/studio/prompts')).toBe(true);
  });

  it('les écrans d’espace n’en font pas partie', () => {
    expect(isBrandScoped('/team')).toBe(false);
    expect(isBrandScoped('/billing')).toBe(false);
  });

  it('un chemin inconnu ne l’est pas non plus', () => {
    expect(isBrandScoped('/nexistepas')).toBe(false);
  });
});
