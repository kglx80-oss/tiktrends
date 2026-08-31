import { describe, it, expect } from 'vitest';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { ROUTES, matchRoute, breadcrumb, isBrandScoped, routeLabel } from '../lib/navigation';
import { FEATURES } from '../lib/rbac';

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

  /**
   * Le garde manquait dans l'autre sens.
   *
   * « Chaque page a son entrée » empêche d'ajouter un écran sans le déclarer.
   * Rien n'empêchait le contraire : supprimer un écran en laissant sa ligne
   * ici · le rail aurait continué de proposer un lien vers un 404, ce que
   * personne ne remarque avant de cliquer.
   */
  it('chaque entrée déclarée a sa page', () => {
    // Ici on balaie tout `app/`, pas seulement le groupe applicatif · un écran
    // déclaré peut légitimement vivre hors du rail (l'accueil d'onboarding),
    // ce qui compte est qu'il existe.
    const reelles = new Set(pagesDe(join(process.cwd(), 'app')));
    const fantomes = ROUTES.map((r) => r.path).filter((p) => !reelles.has(p));
    expect(fantomes, `Chemin(s) déclaré(s) sans page · le rail y mènerait dans le vide : ${fantomes.join(', ')}`)
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
  it('un enfant hors marque montre son parent', () => {
    // Le tagging vit sous la veille · dire « Trouver › Veille › Tagging »
    // apprend quelque chose, là où « Espace › Membres » n'apprend rien.
    expect(breadcrumb('/tags').map((x) => x.label)).toEqual(['Observatoire', 'Veille', 'Tagging']);
  });

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
    expect(c[0]).toEqual({ label: 'Laboratoire', href: null });
  });

  it('donne le chemin complet, pas une flèche vers le parent', () => {
    const c = breadcrumb('/adsmap/suites').map((x) => x.label);
    expect(c).toEqual(['Laboratoire', 'Adsmap', 'Suites']);
  });

  it('le dernier maillon n’est jamais un lien', () => {
    const c = breadcrumb('/adsmap/suites');
    expect(c[c.length - 1]!.href).toBeNull();
  });

  it('les maillons intermédiaires sont cliquables', () => {
    const c = breadcrumb('/adsmap/lots');
    expect(c[1]).toEqual({ label: 'Adsmap', href: '/adsmap' });
  });

  it('la marque s’insère après la section quand l’écran en dépend', () => {
    const c = breadcrumb('/adsmap/radar', { brandScoped: true, brandName: 'TrueFords' });
    expect(c.map((x) => x.label)).toEqual(['Laboratoire', 'TrueFords', 'Adsmap', 'Radar de veille']);
  });

  it('une racine par marque mérite un fil · le contexte manquerait sinon', () => {
    const c = breadcrumb('/jarvis', { brandScoped: true, brandName: 'TrueFords' });
    expect(c.map((x) => x.label)).toEqual(['Atelier', 'TrueFords', 'Jarvis']);
  });

  it('sans nom de marque, on n’invente pas de maillon', () => {
    const c = breadcrumb('/adsmap/lots', { brandScoped: true, brandName: null });
    expect(c.map((x) => x.label)).toEqual(['Laboratoire', 'Adsmap', 'Lots de test']);
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
  it('Adsmap et Jarvis en font partie', () => {
    expect(isBrandScoped('/adsmap')).toBe(true);
    expect(isBrandScoped('/jarvis')).toBe(true);
    expect(isBrandScoped('/studio/image')).toBe(true);
  });

  it('les écrans d’espace n’en font pas partie', () => {
    expect(isBrandScoped('/team')).toBe(false);
    expect(isBrandScoped('/billing')).toBe(false);
  });

  it('un chemin inconnu ne l’est pas non plus', () => {
    expect(isBrandScoped('/nexistepas')).toBe(false);
  });
});

describe('le rail et le fil décrivent la même hiérarchie', () => {
  /**
   * Le garde qui manquait pour de bon.
   *
   * `FEATURES` (le rail) et `ROUTES` (le fil) sont deux vues d'une seule
   * arborescence. C'est exactement la configuration qui avait produit le désordre
   * initial : deux listes qui décrivent la même chose finissent toujours par ne
   * plus la décrire pareil. Faute de les fusionner — le rail porte des rôles et
   * des offres qui n'ont rien à faire dans un fil d'Ariane — on vérifie qu'elles
   * s'accordent.
   */
  const railHrefs = () => FEATURES
    .filter((f) => f.group !== 'account')
    .map((f) => f.href.split('?')[0]!);

  it('chaque entrée du rail est déclarée dans la carte', () => {
    const connus = new Set(ROUTES.map((r) => r.path));
    const absentes = railHrefs().filter((h) => !connus.has(h));
    expect(absentes, `Entrée(s) de rail sans route : ${absentes.join(', ')}`).toEqual([]);
  });

  it('les libellés concordent · deux noms pour un écran est un bug d’affichage', () => {
    const parChemin = new Map(ROUTES.map((r) => [r.path, r.label]));
    const ecarts = FEATURES
      .filter((f) => f.group !== 'account')
      .map((f) => ({ href: f.href.split('?')[0]!, rail: f.label, fil: parChemin.get(f.href.split('?')[0]!) }))
      .filter((x) => x.fil && x.fil !== x.rail);
    expect(ecarts, `Libellés divergents : ${ecarts.map((e) => `${e.href} (${e.rail} ≠ ${e.fil})`).join(', ')}`)
      .toEqual([]);
  });

  it('la filiation concorde · un sous-écran du rail a le même parent dans la carte', () => {
    const parCle = new Map(FEATURES.map((f) => [f.key, f]));
    const parChemin = new Map(ROUTES.map((r) => [r.path, r]));
    const ecarts: string[] = [];
    for (const f of FEATURES) {
      if (!f.parent || f.group === 'account') continue;
      const route = parChemin.get(f.href.split('?')[0]!);
      const parentRail = parCle.get(f.parent);
      if (!route || !parentRail) continue;
      if (route.parent !== parentRail.href.split('?')[0]) {
        ecarts.push(`${f.href} · rail dit ${parentRail.href}, carte dit ${route.parent ?? 'aucun'}`);
      }
    }
    expect(ecarts, ecarts.join(' | ')).toEqual([]);
  });

  it('aucun libellé de rail n’apparaît deux fois · « Radar » l’a fait, et on ne savait plus lequel', () => {
    const labels = FEATURES.filter((f) => f.group !== 'account').map((f) => f.label);
    const doublons = labels.filter((l, i) => labels.indexOf(l) !== i);
    expect([...new Set(doublons)], `Libellé(s) en double : ${doublons.join(', ')}`).toEqual([]);
  });
});
